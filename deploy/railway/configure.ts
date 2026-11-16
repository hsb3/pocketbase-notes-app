import assert from "node:assert/strict";
import {
  deploymentURL,
  deploymentAdmin,
  verificationFailure,
} from "./verification";

const env = process.env;
try {
  const pb = await deploymentAdmin();
  const current = await pb.settings.getAll();
  assert(
    !current.s3.enabled,
    "Existing remote file storage must not be disabled by initial configuration.",
  );
  await pb.settings.update({
    meta: {
      ...current.meta,
      appName: "PocketBase Notes",
      appURL: deploymentURL,
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
  await pb.settings.testS3("backups");
  const readback = await pb.settings.getAll();
  assert.equal(readback.smtp.host, "smtp.resend.com");
  assert.equal(readback.backups.cron, "0 7 * * *");
  assert.equal(readback.s3.enabled, false);
  process.stdout.write(
    "Configured SMTP, private local files and daily off-volume backups. Accounts unchanged.\n",
  );
} catch (error) {
  verificationFailure(error);
}
