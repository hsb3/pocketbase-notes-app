import assert from "node:assert/strict";
import PocketBase from "pocketbase";

const url = process.env.VITE_PB_URL;
assert(
  url && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname),
  "Run only against the local development backend.",
);
const admin = new PocketBase(url);
await admin
  .collection("_superusers")
  .authWithPassword(process.env.PB_EMAIL!, process.env.PB_PASSWORD!);
const settings = await admin.settings.getAll();
assert.equal(settings.smtp.enabled, true, "Mailpit SMTP must be enabled");
assert.equal(settings.smtp.host, "mailpit");
assert.equal(settings.s3.enabled, true, "RustFS S3 must be enabled");
assert.equal(settings.s3.endpoint, "http://rustfs:9000");
await admin.settings.testS3("storage");

const mailpit = "http://127.0.0.1:8025";
const email = `services-${crypto.randomUUID()}@example.com`;
const password = crypto.randomUUID();
const user = await admin
  .collection("users")
  .create({ email, password, passwordConfirm: password });
const client = new PocketBase(url);
const messages: string[] = [];
async function receive(path: string) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const response = await fetch(
      `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    assert(response.ok, "Mailpit search failed");
    const result = (await response.json()) as { messages: { ID: string }[] };
    for (const summary of result.messages) {
      if (!messages.includes(summary.ID)) messages.push(summary.ID);
      const response = await fetch(`${mailpit}/api/v1/message/${summary.ID}`);
      assert(response.ok);
      const message = (await response.json()) as { HTML: string };
      const links = message.HTML.match(/https?:\/\/[^"<>\s]+/g) || [];
      const link = links
        .map((value) => new URL(value.replaceAll("&amp;", "&")))
        .find((value) => value.pathname === path);
      if (link) {
        assert.equal(
          link.origin,
          new URL(process.env.DEV_APP_URL || "http://127.0.0.1:5173").origin,
        );
        const token = link.searchParams.get("token");
        assert(token, "Email must contain an action token");
        return token;
      }
    }
    await Bun.sleep(250);
  }
  throw new Error(`No matching ${path} email arrived in Mailpit`);
}
try {
  await client.collection("users").requestVerification(email);
  await client
    .collection("users")
    .confirmVerification(await receive("/auth/email-verification-confirm"));
  assert.equal(
    (await admin.collection("users").getOne(user.id)).verified,
    true,
  );
  await client.collection("users").requestPasswordReset(email);
  const newPassword = crypto.randomUUID();
  await client
    .collection("users")
    .confirmPasswordReset(
      await receive("/auth/password-reset-confirm"),
      newPassword,
      newPassword,
    );
  await client.collection("users").authWithPassword(email, newPassword);

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
    "base64",
  );
  const form = new FormData();
  form.set("avatar", new File([png], "integration.png", { type: "image/png" }));
  const updated = await client.collection("users").update(user.id, form);
  const download = await fetch(client.files.getURL(updated, updated.avatar));
  assert(download.ok, "PocketBase file download must succeed");
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), png);
  const objectKey = `${updated.collectionId}/${updated.id}/${updated.avatar}`;
  const probe = Bun.spawnSync(
    [
      "docker",
      "compose",
      "--project-directory",
      ".",
      "-f",
      "deploy/local/docker-compose-full.yml",
      "run",
      "--rm",
      "--no-deps",
      "--entrypoint",
      "/bin/sh",
      "storage-init",
      "-ec",
      'rc alias set local http://rustfs:9000 "$RUSTFS_ACCESS_KEY" "$RUSTFS_SECRET_KEY" >/dev/null; rc object stat "local/$RUSTFS_BUCKET/$1" >/dev/null',
      "probe",
      objectKey,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  assert.equal(
    probe.exitCode,
    0,
    "Uploaded object must exist in RustFS, not just local PocketBase storage",
  );
  console.log(
    "PASS: verification and password-reset email round trips through Mailpit; avatar upload, RustFS object and download bytes verified",
  );
} finally {
  await admin.collection("users").delete(user.id);
  if (messages.length) {
    const cleanup = await fetch(`${mailpit}/api/v1/messages`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ IDs: messages }),
    });
    assert(cleanup.ok, "Failed to clean up test emails");
  }
}
