import assert from "node:assert/strict";
import PocketBase from "pocketbase";

const url = process.env.VITE_PB_URL;
assert(
  url && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname),
  "Use a local backend.",
);
const pb = new PocketBase(url);
await pb
  .collection("_superusers")
  .authWithPassword(process.env.PB_EMAIL!, process.env.PB_PASSWORD!);
const settings = await pb.settings.getAll();
assert(
  !settings.backups.cron && !settings.backups.s3.enabled,
  "Backup tests require an unconfigured disposable backup store.",
);
const s3 = {
  ...settings.s3,
  accessKey: process.env.RUSTFS_ACCESS_KEY || "pocketbase",
  secret: process.env.RUSTFS_SECRET_KEY || "pocketbase",
};
assert(
  s3.enabled && s3.endpoint === "http://rustfs:9000",
  "Use the local RustFS stack.",
);
let key = "";
async function check(expected: string, extra: Record<string, string> = {}) {
  const child = Bun.spawn([process.execPath, "scripts/check-backups.ts"], {
    env: {
      ...process.env,
      PB_URL: url!,
      PB_ADMIN_EMAIL: process.env.PB_EMAIL!,
      PB_ADMIN_PASSWORD: process.env.PB_PASSWORD!,
      ...extra,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(child.stdout).text();
  const error = await new Response(child.stderr).text();
  assert.equal(await child.exited, expected === "ok" ? 0 : 1, error);
  assert((output + error).includes(expected), output + error);
}
try {
  await check("disabled");
  await pb.settings.update({
    backups: { ...settings.backups, cron: "0 7 * * *", cronMaxKeep: 7, s3 },
  });
  await check("No completed automatic backup");
  await pb.settings.update({
    backups: { ...settings.backups, cron: "* * * * *", cronMaxKeep: 7, s3 },
  });
  for (let i = 0; i < 70; i++) {
    const backup = (await pb.backups.getFullList()).find(
      (b) => b.key.startsWith("@auto_pb_backup_") && b.size > 0,
    );
    if (backup) {
      key = backup.key;
      break;
    }
    await Bun.sleep(1000);
  }
  assert(key, "Scheduled backup did not complete within 70 seconds.");
  await pb.settings.update({
    backups: { ...settings.backups, cron: "0 7 * * *", cronMaxKeep: 7, s3 },
  });
  await check("ok");
  await Bun.sleep(1100);
  await check("stale", { BACKUP_MAX_AGE_HOURS: "0.000001" });
  await pb.settings.update({
    backups: {
      ...settings.backups,
      cron: "0 7 * * *",
      cronMaxKeep: 7,
      s3: { ...s3, secret: "invalid-review-secret" },
    },
  });
  await check("request failed");
  console.log(
    "PASS: disabled, missing, fresh, stale and inaccessible backup detection",
  );
} finally {
  await pb.settings.update({ backups: { ...settings.backups, s3 } });
  try {
    if (key) await pb.backups.delete(key);
  } finally {
    await pb.settings.update({ backups: settings.backups });
  }
}
