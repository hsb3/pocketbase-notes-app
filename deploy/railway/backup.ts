import { evidenceDirectory } from "./evidence";
import assert from "node:assert/strict";
import { chmod } from "node:fs/promises";
import { deploymentAdmin, verificationFailure } from "./verification";

// Creates one archive in the deployment's backup storage and downloads it.
try {
  const pb = await deploymentAdmin();
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
  const path = `${evidenceDirectory}/restore-proof.zip`;
  await Bun.write(path, await response.arrayBuffer());
  await chmod(path, 0o600);
  await Bun.write(
    `${evidenceDirectory}/backup-check.json`,
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
} catch (error) {
  verificationFailure(error);
}
