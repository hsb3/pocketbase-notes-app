import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";
import PocketBase from "pocketbase";

loadEnvFile("deploy/railway/.env");
const env = process.env;
assert.equal(env.PB_URL, "https://notes-staging.up.railway.app");
const pb = new PocketBase(env.PB_URL);
pb.autoCancellation(false);
try {
  await pb
    .collection("_superusers")
    .authWithPassword(env.PB_ADMIN_EMAIL!, env.PB_ADMIN_PASSWORD!);
  const accounts = await pb.collection("users").getFullList();
  assert(
    accounts.every((a) => a.email === env.PB_USER_EMAIL),
    "Unexpected users: refusing configuration",
  );
  const current = await pb.settings.getAll();
  await pb.settings.update({
    meta: {
      ...current.meta,
      appName: "PocketBase Notes",
      appURL: env.PB_URL,
      senderName: "PocketBase Notes",
      senderAddress: "noreply@send.functionform.ai",
    },
    smtp: {
      enabled: true,
      host: "smtp.resend.com",
      port: 465,
      username: "resend",
      password: env.PB_SMTP_PASSWORD,
      authMethod: "PLAIN",
      tls: true,
    },
    s3: { enabled: false },
    rateLimits: { ...current.rateLimits, enabled: true },
    backups: {
      cron: "0 7 * * *",
      cronMaxKeep: 7,
      s3: {
        enabled: true,
        bucket: env.BACKUP_BUCKET,
        region: env.BACKUP_REGION,
        endpoint: env.BACKUP_ENDPOINT,
        accessKey: env.BACKUP_ACCESS_KEY,
        secret: env.BACKUP_SECRET_KEY,
        forcePathStyle: env.BACKUP_URL_STYLE === "path",
      },
    },
  });
  const users = await pb.collections.getOne("users");
  await pb.collections.update(users.id, {
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
  });
  if (!accounts.length)
    await pb.collection("users").create({
      email: env.PB_USER_EMAIL,
      password: env.PB_USER_PASSWORD,
      passwordConfirm: env.PB_USER_PASSWORD,
      name: "Henry",
      verified: false,
    });
  await pb.settings.testS3("backups");
  const readback = await pb.settings.getAll();
  assert.equal(readback.smtp.host, "smtp.resend.com");
  assert.equal(readback.backups.cron, "0 7 * * *");
  assert.equal(readback.s3.enabled, false);
  process.stdout.write(
    "Configured SMTP, private local files, daily off-volume backups, and only the requested user.\n",
  );
} catch (error) {
  process.stderr.write(
    `Deployment configuration failed: ${error instanceof Error ? error.message : "Unknown error"}\n`,
  );
  process.exitCode = 1;
}
