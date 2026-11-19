import assert from "node:assert/strict";
import { existsSync, readFileSync, readlinkSync } from "node:fs";
import { seedNotes } from "./seed-notes";
import PocketBase, { ClientResponseError } from "pocketbase";

function localCLI(target: URL) {
  if (process.env.CONTAINED_SEED_CLI === "1") {
    const database = [
      "--dir=/tmp/seed-data",
      "--hooksDir=/pb/pb_hooks",
      "--migrationsDir=/pb/pb_migrations",
      "--encryptionEnv=PB_ENCRYPTION_KEY",
    ];
    const args = [
      "/pb/pocketbase",
      "serve",
      "--http=127.0.0.1:18082",
      ...database,
    ];
    assert(
      process.env.CONTAINED_TEST === "1" &&
        existsSync("/.dockerenv") &&
        target.href === "http://127.0.0.1:18082/" &&
        readlinkSync("/proc/1/exe") === args[0] &&
        readFileSync("/proc/1/cmdline", "utf8") === args.join("\0") + "\0" &&
        process.env.PB_ENCRYPTION_KEY &&
        readFileSync("/proc/1/environ", "utf8")
          .split("\0")
          .includes(`PB_ENCRYPTION_KEY=${process.env.PB_ENCRYPTION_KEY}`),
      "Seed CLI requires the isolated local PocketBase server and its matching database and encryption key.",
    );
    return ["/pb/pocketbase", ...database];
  }
  // The stack's setup container has no Docker CLI; its PocketBase service
  // already created the superuser, so a failed login means bad credentials.
  assert(
    Bun.which("docker"),
    "Superuser credentials do not match. Check PB_EMAIL and PB_PASSWORD in .env.",
  );
  const container = process.env.PB_CONTAINER || "pocketbase";
  const inspect = Bun.spawnSync(
    [
      "docker",
      "inspect",
      "--format",
      "{{json .NetworkSettings.Ports}}",
      container,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  assert.equal(
    inspect.exitCode,
    0,
    "Cannot inspect the local PocketBase container.",
  );
  const ports = JSON.parse(inspect.stdout.toString()) as Record<
    string,
    { HostIp: string; HostPort: string }[] | null
  >;
  assert(
    ports["8080/tcp"]?.some(
      (port) =>
        ["127.0.0.1", "::1"].includes(port.HostIp) &&
        port.HostPort === (target.port || "80"),
    ),
    "PB_CONTAINER must publish its PocketBase port on the configured loopback URL.",
  );
  return [
    "docker",
    "exec",
    container,
    "/pb/pocketbase",
    "--encryptionEnv=PB_ENCRYPTION_KEY",
  ];
}

async function main() {
  const args = process.argv.slice(2);
  assert(
    args.every((arg) => arg === "--reset-passwords") && args.length <= 1,
    "Usage: scripts/seed.sh [--reset-passwords]",
  );
  const reset = args.includes("--reset-passwords");
  const url =
    process.env.PB_URL || `http://localhost:${process.env.PB_PORT || 8090}`;
  const target = new URL(url);
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) &&
      target.protocol === "http:",
    "Seeding requires a local HTTP backend; remote targets are forbidden.",
  );
  const email = process.env.PB_EMAIL || "admin@example.com";
  const password = process.env.PB_PASSWORD || "admin-changeme-123";
  const userEmail = process.env.SEED_USER_EMAIL || "user@example.com";
  const userPassword = process.env.SEED_USER_PASSWORD || "user-changeme-123";
  const admin = new PocketBase(url);
  try {
    await admin.collection("_superusers").authWithPassword(email, password);
  } catch (error) {
    assert(
      error instanceof ClientResponseError && error.status === 400,
      "Cannot reach/authenticate the local backend; no CLI write attempted.",
    );
    const cli = localCLI(target);
    const operation = reset ? "upsert" : "create";
    const create = Bun.spawnSync(
      [...cli, "superuser", operation, email, password],
      { stdout: "pipe", stderr: "pipe" },
    );
    assert.equal(create.exitCode, 0, "Local superuser CLI failed.");
    // PocketBase CLI errors may exit zero: authentication is the success gate.
    try {
      await admin.collection("_superusers").authWithPassword(email, password);
    } catch {
      throw new Error(
        "Superuser credentials do not match. Supply the current password or explicitly use --reset-passwords.",
      );
    }
  }
  const users = await admin.collection("users").getList(1, 1, {
    filter: admin.filter("email = {:email}", { email: userEmail }),
  });
  if (!users.items.length) {
    await admin.collection("users").create({
      email: userEmail,
      password: userPassword,
      passwordConfirm: userPassword,
      name: "Test User",
      verified: true,
    });
  } else if (reset) {
    await admin.collection("users").update(users.items[0].id, {
      password: userPassword,
      passwordConfirm: userPassword,
    });
  }
  const owner = new PocketBase(url);
  try {
    await owner.collection("users").authWithPassword(userEmail, userPassword);
  } catch {
    throw new Error(
      "Seed user credentials do not match. Supply the current password or explicitly use --reset-passwords.",
    );
  }
  await seedNotes(owner);
  console.log(
    reset
      ? "Seed logins verified; explicit password reset applied."
      : "Seed logins verified; existing accounts preserved.",
  );
}
main().catch((error: unknown) => {
  console.error(
    error instanceof ClientResponseError
      ? `Seed request failed (HTTP ${error.status}).`
      : error instanceof Error
        ? error.message
        : "Seeding failed.",
  );
  process.exitCode = 1;
});
