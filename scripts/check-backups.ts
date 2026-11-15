import assert from "node:assert/strict";
import PocketBase, { ClientResponseError } from "pocketbase";

// Read-only: never create a backup to disguise a stale automatic schedule.
try {
  const { PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD } = process.env;
  assert(
    PB_URL && PB_ADMIN_EMAIL && PB_ADMIN_PASSWORD,
    "Set PB_URL, PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD.",
  );
  const maxAgeHours = Number(process.env.BACKUP_MAX_AGE_HOURS || 26);
  assert(
    Number.isFinite(maxAgeHours) && maxAgeHours > 0,
    "BACKUP_MAX_AGE_HOURS must be positive.",
  );
  const pb = new PocketBase(PB_URL);
  pb.beforeSend = (url, options) => ({
    url,
    options: { ...options, signal: AbortSignal.timeout(15000) },
  });
  await pb
    .collection("_superusers")
    .authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
  const settings = await pb.settings.getAll();
  assert(
    settings.backups.cron && settings.backups.cronMaxKeep > 0,
    "Automatic backups are disabled.",
  );
  assert(settings.backups.s3.enabled, "Off-volume backup storage is disabled.");
  const backups = await pb.backups.getFullList();
  const latest = backups
    .filter(
      (backup) => backup.key.startsWith("@auto_pb_backup_") && backup.size > 0,
    )
    .sort((a, b) => Date.parse(b.modified) - Date.parse(a.modified))[0];
  assert(latest, "No completed automatic backup exists.");
  const ageHours = (Date.now() - Date.parse(latest.modified)) / 3600000;
  assert(
    Number.isFinite(ageHours) && ageHours >= -0.1 && ageHours <= maxAgeHours,
    "Latest automatic backup is stale or has an invalid timestamp.",
  );
  console.log(
    JSON.stringify({
      status: "ok",
      key: latest.key,
      modified: latest.modified,
      size: latest.size,
      ageHours: Math.round(ageHours * 100) / 100,
    }),
  );
} catch (error) {
  // SDK errors may contain request credentials; never print the error object.
  console.error(
    error instanceof ClientResponseError
      ? `Backup check failed: PocketBase/storage request failed (HTTP ${error.status}).`
      : error instanceof Error
        ? error.message
        : "Backup check failed.",
  );
  process.exitCode = 1;
}
