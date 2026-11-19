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
  for (const collection of ["users", "folders", "notes", "attachments"])
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
  const preserved = new PocketBase(url);
  await preserved.collection("users").authWithPassword(email, password);
  const folder = await preserved
    .collection("folders")
    .getFirstListItem("is_default = true");
  await preserved.collection("notes").create({
    user: existing.id,
    folder: folder.id,
    body: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Preserve this note" }],
        },
      ],
    },
  });
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
  let rejectedSaves = 0;
  let uploaded = false;
  const proxy = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const incoming = new URL(request.url);
      if (
        request.method === "POST" &&
        incoming.pathname === "/api/collections/notes/records"
      ) {
        rejectedSaves++;
        return Response.json(
          { message: "Injected save failure", status: 503 },
          { status: 503 },
        );
      }
      const headers = new Headers(request.headers);
      headers.set("accept-encoding", "identity");
      headers.delete("host");
      const response = await fetch(
        new URL(incoming.pathname + incoming.search, url),
        {
          method: request.method,
          headers,
          body: ["GET", "HEAD"].includes(request.method)
            ? undefined
            : await request.arrayBuffer(),
          redirect: "manual",
        },
      );
      if (
        request.method === "POST" &&
        incoming.pathname === "/api/collections/attachments/records" &&
        response.ok
      )
        uploaded = true;
      return response;
    },
  });
  try {
    await run("verify-app", { PB_URL: `http://127.0.0.1:${proxy.port}` }, 1);
  } finally {
    proxy.stop(true);
  }
  assert(
    uploaded && rejectedSaves > 0,
    "The failure drill must upload a file and reach the rejected note save",
  );
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
      PB_SENDER_ADDRESS: "notes@example.test",
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
    const configured = await admin.settings.getAll();
    assert.equal(configured.rateLimits.enabled, true);
    assert.deepEqual(configured.trustedProxy, {
      headers: ["X-Real-IP"],
      useLeftmostIP: false,
    });
    // Default "*:auth" rule: 2 per 3 s per client address, so the third is refused.
    const login = async (headers: Record<string, string>) =>
      (
        await fetch(new URL("/api/collections/users/auth-with-password", url), {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({
            identity: "nobody@example.invalid",
            password: "wrong-password",
          }),
        })
      ).status;
    const clientA = { "X-Real-IP": "203.0.113.10" };
    assert.deepEqual(
      [await login(clientA), await login(clientA), await login(clientA)],
      [400, 400, 429],
      "One forwarded client address must be limited",
    );
    assert.equal(
      await login({ "X-Real-IP": "203.0.113.20" }),
      400,
      "Another forwarded client address must have its own bucket",
    );
    assert.equal(
      await login({ ...clientA, "X-Forwarded-For": "203.0.113.30" }),
      429,
      "An untrusted header must not pick the bucket",
    );
    assert.equal(
      await login({ "X-Real-IP": "203.0.113.40, 203.0.113.10" }),
      429,
      "A client-prepended address must not pick the bucket",
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
      trustedProxy: settings.trustedProxy,
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
    "PASS: deployment checks need no personal credentials, clean successful/failed fixtures, reject existing mail recipients, configuration preserves accounts and keys rate limits on the trusted client address",
  );
} finally {
  await admin.collection("users").delete(existing.id);
  rmSync(directory, { recursive: true, force: true });
}
