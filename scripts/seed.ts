import assert from "node:assert/strict";
import PocketBase, { ClientResponseError } from "pocketbase";

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
    const operation = reset ? "upsert" : "create";
    const create = Bun.spawnSync(
      [
        "docker",
        "exec",
        container,
        "/pb/pocketbase",
        "superuser",
        operation,
        email,
        password,
        "--encryptionEnv=PB_ENCRYPTION_KEY",
      ],
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
  try {
    await new PocketBase(url)
      .collection("users")
      .authWithPassword(userEmail, userPassword);
  } catch {
    throw new Error(
      "Seed user credentials do not match. Supply the current password or explicitly use --reset-passwords.",
    );
  }
  Object.assign(process.env, {
    VITE_PB_URL: url,
    PB_EMAIL: email,
    PB_PASSWORD: password,
    SEED_USER_EMAIL: userEmail,
  });
  await import("./seed-entries");
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
