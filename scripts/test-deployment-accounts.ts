import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import PocketBase from "pocketbase";

const url = process.env.VITE_PB_URL;
assert(
  url && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname),
  "Use a local disposable stack.",
);
const admin = new PocketBase(url);
await admin
  .collection("_superusers")
  .authWithPassword(process.env.PB_EMAIL!, process.env.PB_PASSWORD!);
const email = `preserve-${crypto.randomUUID()}@example.test`,
  password = crypto.randomUUID();
const existing = await admin.collection("users").create({
  email,
  password,
  passwordConfirm: password,
  verified: true,
  name: "Existing account",
});
const directory = mkdtempSync(join(tmpdir(), "pocketbase-account-check-"));
async function snapshot() {
  const hashes = [];
  for (const collection of ["users", "entries", "attachments"])
    hashes.push(
      createHash("sha256")
        .update(
          JSON.stringify(
            await admin.collection(collection).getFullList({ sort: "id" }),
          ),
        )
        .digest("hex"),
    );
  return hashes;
}
async function run(
  script: string,
  overrides: Record<string, string> = {},
  expected = 0,
) {
  const child = Bun.spawn([process.execPath, `deploy/railway/${script}.ts`], {
    env: {
      ...process.env,
      PB_URL: url!,
      DEPLOY_ALLOW_LOCAL: "true",
      PB_ADMIN_EMAIL: process.env.PB_EMAIL!,
      PB_ADMIN_PASSWORD: process.env.PB_PASSWORD!,
      PB_USER_EMAIL: "",
      PB_USER_PASSWORD: "",
      DEPLOY_EVIDENCE_DIR: directory,
      ...overrides,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(child.stdout).text();
  const error = await new Response(child.stderr).text();
  const code = await child.exited;
  if (expected === 0) assert.equal(code, 0, `${script}: ${error}`);
  else assert.notEqual(code, 0, `${script} should refuse/fail`);
  assert(
    !output.includes(password) && !error.includes(password),
    "Credentials must not appear in output",
  );
}
try {
  const before = await snapshot();
  await run("verify-app");
  assert.deepEqual(
    await snapshot(),
    before,
    "App verification must clean only its own records",
  );
  await run("verify-signup");
  assert.deepEqual(await snapshot(), before);
  await run(
    "verify-email",
    {
      VERIFY_EMAIL: email,
      MAILPIT_URL: process.env.MAILPIT_URL || "http://127.0.0.1:8025",
    },
    1,
  );
  await new PocketBase(url)
    .collection("users")
    .authWithPassword(email, password);
  assert.deepEqual(
    await snapshot(),
    before,
    "Mail verification must refuse existing accounts",
  );
  const originalMeta = (await admin.settings.getAll()).meta;
  try {
    // Exercise separate frontend/API origins even in the self-contained local stack.
    await admin.settings.update({
      meta: { ...originalMeta, appURL: "http://127.0.0.1:4174" },
    });
    await run("verify-email", {
      VERIFY_EMAIL: `mail-${crypto.randomUUID()}@example.test`,
      MAILPIT_URL: process.env.MAILPIT_URL || "http://127.0.0.1:8025",
    });
  } finally {
    await admin.settings.update({ meta: originalMeta });
  }
  assert.deepEqual(await snapshot(), before, "Mail fixtures must be removed");
  const proxy = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const incoming = new URL(request.url);
      if (
        request.method === "POST" &&
        incoming.pathname === "/api/collections/entries/records"
      )
        return Response.json(
          { message: "Injected save failure", status: 503 },
          { status: 503 },
        );
      const headers = new Headers(request.headers);
      headers.set("accept-encoding", "identity");
      headers.delete("host");
      return fetch(new URL(incoming.pathname + incoming.search, url), {
        method: request.method,
        headers,
        body: ["GET", "HEAD"].includes(request.method)
          ? undefined
          : await request.arrayBuffer(),
        redirect: "manual",
      });
    },
  });
  try {
    await run("verify-app", { PB_URL: `http://127.0.0.1:${proxy.port}` }, 1);
  } finally {
    proxy.stop(true);
  }
  assert.deepEqual(
    await snapshot(),
    before,
    "Failed verification must remove uploads/accounts",
  );
  const settings = await admin.settings.getAll();
  const usersCollection = await admin.collections.getOne("users");
  assert.equal(
    (await admin.collection("attachments").getList(1, 1)).totalItems,
    0,
    "Configuration test requires a disposable store without attachments",
  );
  try {
    await admin.settings.update({ s3: { enabled: false } });
    await run("configure", {
      PB_SMTP_PASSWORD: "local-test-only",
      BACKUP_BUCKET: process.env.RUSTFS_BUCKET || "pocketbase",
      BACKUP_ENDPOINT: "http://rustfs:9000",
      BACKUP_REGION: "us-east-1",
      BACKUP_ACCESS_KEY: process.env.RUSTFS_ACCESS_KEY || "pocketbase",
      BACKUP_SECRET_KEY: process.env.RUSTFS_SECRET_KEY || "pocketbase",
      BACKUP_URL_STYLE: "path",
    });
    assert.deepEqual(
      await snapshot(),
      before,
      "Infrastructure configuration must preserve all accounts",
    );
  } finally {
    await admin.settings.update({
      smtp: { ...settings.smtp, password: "mailpit" },
      s3: {
        ...settings.s3,
        secret: process.env.RUSTFS_SECRET_KEY || "pocketbase",
      },
      backups: settings.backups,
      meta: settings.meta,
      rateLimits: settings.rateLimits,
    });
    await admin.collections.update("users", {
      verificationTemplate: usersCollection.verificationTemplate,
      resetPasswordTemplate: usersCollection.resetPasswordTemplate,
    });
  }
  await new PocketBase(url)
    .collection("users")
    .authWithPassword(email, password);
  console.log(
    "PASS: deployment checks need no personal credentials, clean successful/failed fixtures, reject existing mail recipients, and configuration preserves accounts",
  );
} finally {
  await admin.collection("users").delete(existing.id);
  rmSync(directory, { recursive: true, force: true });
}
