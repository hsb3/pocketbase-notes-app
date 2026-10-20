import assert from "node:assert/strict";
import PocketBase from "pocketbase";

const url = process.env.VITE_PB_URL;
assert(
  url && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname),
  "Configure only a local development backend.",
);
const { PB_EMAIL, PB_PASSWORD } = process.env;
assert(PB_EMAIL && PB_PASSWORD, "Set PB_EMAIL and PB_PASSWORD in .env");
const pb = new PocketBase(url);
const container = process.env.PB_CONTAINER || "pocketbase";
try {
  await pb.collection("_superusers").authWithPassword(PB_EMAIL, PB_PASSWORD);
} catch {
  // Create on a fresh database, never reset an existing superuser's credentials.
  const create = Bun.spawnSync(
    [
      "docker",
      "exec",
      container,
      "/pb/pocketbase",
      "superuser",
      "create",
      PB_EMAIL,
      PB_PASSWORD,
      "--encryptionEnv=PB_ENCRYPTION_KEY",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  assert.equal(
    create.exitCode,
    0,
    "Cannot authenticate or create the superuser. Check .env credentials.",
  );
  await pb.collection("_superusers").authWithPassword(PB_EMAIL, PB_PASSWORD);
}
const settings = await pb.settings.getAll();
assert(
  !settings.smtp.enabled || settings.smtp.host === "mailpit",
  "A different SMTP server is configured; refusing to overwrite it.",
);
assert(
  !settings.s3.enabled || settings.s3.endpoint === "http://rustfs:9000",
  "A different S3 endpoint is configured; refusing to overwrite it.",
);
const bucket = process.env.RUSTFS_BUCKET || "pocketbase";
assert(
  !settings.s3.enabled || settings.s3.bucket === bucket,
  "A different bucket is configured; migrate uploads before switching buckets.",
);
if (!settings.s3.enabled) {
  // Read inside the container: self-contained stacks keep pb_data in a volume.
  const files = Bun.spawnSync(
    [
      "docker",
      "exec",
      container,
      "sh",
      "-c",
      "find /pb/pb_data/storage -type f 2>/dev/null | head -n 1",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  assert.equal(files.exitCode, 0, `Cannot inspect storage in ${container}.`);
  assert(
    !files.stdout.toString().trim(),
    "Local uploads exist. Migrate them before enabling RustFS.",
  );
}
const appURL = process.env.DEV_APP_URL || "http://127.0.0.1:5173";
await pb.settings.update({
  smtp: {
    enabled: true,
    host: "mailpit",
    port: 1025,
    username: "mailpit",
    password: "mailpit",
    authMethod: "PLAIN",
    tls: false,
  },
  s3: {
    enabled: true,
    endpoint: "http://rustfs:9000",
    bucket,
    region: "us-east-1",
    accessKey: process.env.RUSTFS_ACCESS_KEY || "pocketbase",
    secret: process.env.RUSTFS_SECRET_KEY || "pocketbase",
    forcePathStyle: true,
  },
  meta: {
    ...settings.meta,
    appName: "PocketBase Notes",
    appURL,
    senderName: "PocketBase Notes",
    senderAddress: "notebook@example.test",
  },
});
const users = await pb.collections.getOne("users");
const templates = {
  verificationTemplate: {
    ...users.verificationTemplate,
    body: users.verificationTemplate.body.replace(
      "{APP_URL}/_/#/auth/confirm-verification/{TOKEN}",
      "{APP_URL}/auth/email-verification-confirm?token={TOKEN}",
    ),
  },
  resetPasswordTemplate: {
    ...users.resetPasswordTemplate,
    body: users.resetPasswordTemplate.body.replace(
      "{APP_URL}/_/#/auth/confirm-password-reset/{TOKEN}",
      "{APP_URL}/auth/password-reset-confirm?token={TOKEN}",
    ),
  },
};
if (
  templates.verificationTemplate.body !== users.verificationTemplate.body ||
  templates.resetPasswordTemplate.body !== users.resetPasswordTemplate.body
)
  await pb.collections.update(users.id, templates);
await pb.settings.testS3("storage");
console.log(
  "Configured local Mailpit SMTP, RustFS file storage, and application email links.",
);
