import assert from "node:assert/strict";
import { chmod } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import PocketBase from "pocketbase";

loadEnvFile("deploy/railway/.env");
assert.equal(process.env.PB_URL, "https://notes-staging.up.railway.app");
const pb = new PocketBase(process.env.PB_URL);
await pb
  .collection("_superusers")
  .authWithPassword(
    process.env.PB_ADMIN_EMAIL!,
    process.env.PB_ADMIN_PASSWORD!,
  );
const name = `deployment-check-${Date.now()}.zip`;
await pb.backups.create(name);
let backup;
for (let i = 0; i < 30; i++) {
  backup = (await pb.backups.getFullList()).find((b) => b.key === name);
  if (backup?.size) break;
  await Bun.sleep(1000);
}
assert(backup?.size, "Backup did not finish");
const token = await pb.files.getToken();
const response = await fetch(pb.backups.getDownloadURL(token, name));
assert(response.ok, `Backup download failed: ${response.status}`);
const path =
  "/private/tmp/agents/react-pocketbase/codex-deploy/restore-proof.zip";
await Bun.write(path, await response.arrayBuffer());
await chmod(path, 0o600);
await Bun.write(
  "/private/tmp/agents/react-pocketbase/codex-deploy/backup-check.json",
  JSON.stringify({
    key: name,
    size: backup.size,
    downloaded: path,
    capturedAt: new Date().toISOString(),
  }),
);
process.stdout.write(
  `Created and downloaded backup ${name} (${backup.size} bytes).\n`,
);
