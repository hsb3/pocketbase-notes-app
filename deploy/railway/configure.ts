import assert from "node:assert/strict";
import {
  deploymentURL,
  deploymentAdmin,
  verificationFailure,
} from "./verification";

const env = process.env;
// Defaults suit Resend; any SMTP provider works through these variables.
const smtpHost = env.PB_SMTP_HOST || "smtp.resend.com";
const smtpPort = Number(env.PB_SMTP_PORT || 465);
const backupCron = env.BACKUP_CRON || "0 7 * * *";
// Railway's edge sets X-Real-IP to the client address; without a trusted header every
// visitor shares the edge's address in rate limits. Empty value = trust no header.
const trustedProxyHeaders = (env.PB_TRUSTED_PROXY_HEADERS ?? "X-Real-IP")
  .split(",")
  .map((header) => header.trim())
  .filter(Boolean);
try {
  assert(
    env.PB_SENDER_ADDRESS && env.PB_SMTP_PASSWORD,
    "Set PB_SENDER_ADDRESS and PB_SMTP_PASSWORD.",
  );
  assert(
    env.BACKUP_BUCKET &&
      env.BACKUP_ENDPOINT &&
      env.BACKUP_REGION &&
      env.BACKUP_ACCESS_KEY &&
      env.BACKUP_SECRET_KEY,
    "Set the BACKUP_* storage variables.",
  );
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
      senderAddress: env.PB_SENDER_ADDRESS,
    },
    smtp: {
      enabled: true,
      host: smtpHost,
      port: smtpPort,
      username: env.PB_SMTP_USERNAME || "resend",
      password: env.PB_SMTP_PASSWORD,
      authMethod: "PLAIN",
      tls: smtpPort === 465,
    },
    s3: { enabled: false },
    rateLimits: { ...current.rateLimits, enabled: true },
    // Rightmost address: the one the proxy wrote, not one a client prepended.
    trustedProxy: { headers: trustedProxyHeaders, useLeftmostIP: false },
    backups: {
      cron: backupCron,
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
  assert.equal(readback.smtp.host, smtpHost);
  assert.equal(readback.backups.cron, backupCron);
  assert.equal(readback.s3.enabled, false);
  assert.deepEqual(readback.trustedProxy, {
    headers: trustedProxyHeaders,
    useLeftmostIP: false,
  });
  process.stdout.write(
    `Configured SMTP, private local files, scheduled off-volume backups and rate limits keyed on ${trustedProxyHeaders.join(", ") || "the connecting address"}. Accounts unchanged.\n`,
  );
} catch (error) {
  verificationFailure(error);
}
