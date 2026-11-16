import { evidenceDirectory } from "./evidence";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { deploymentAdmin, verificationFailure } from "./verification";

// Read-only comparison; pause source writes while taking and checking the restore.
async function main() {
  const restoreURL = process.env.RESTORE_URL;
  assert(
    restoreURL &&
      ["localhost", "127.0.0.1", "[::1]"].includes(
        new URL(restoreURL).hostname,
      ),
    "Set RESTORE_URL to an isolated loopback restore with outgoing mail and backup cron disabled.",
  );
  const source = await deploymentAdmin();
  const restored = await deploymentAdmin(restoreURL);
  const settings = await restored.settings.getAll();
  assert(
    !settings.smtp.enabled && !settings.backups.cron,
    "Disable outgoing mail and backup cron in the isolated restore first.",
  );
  const digest = (value: unknown) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const checks = [];
  for (const collection of ["users", "entries", "attachments"]) {
    const original = await source
      .collection(collection)
      .getFullList({ sort: "id" });
    const recovered = await restored
      .collection(collection)
      .getFullList({ sort: "id" });
    assert.equal(
      digest(recovered),
      digest(original),
      `${collection} records differ; source writes after the backup also cause this check to fail`,
    );
    if (collection === "attachments") {
      const sourceToken = await source.files.getToken();
      const restoreToken = await restored.files.getToken();
      for (const file of original) {
        const a = await fetch(
          source.files.getURL(file, file.file, { token: sourceToken }),
        );
        const b = await fetch(
          restored.files.getURL(file, file.file, { token: restoreToken }),
        );
        assert(a.ok && b.ok, "Attachment download failed");
        assert.equal(
          createHash("sha256")
            .update(Buffer.from(await a.arrayBuffer()))
            .digest("hex"),
          createHash("sha256")
            .update(Buffer.from(await b.arrayBuffer()))
            .digest("hex"),
          "Attachment bytes differ",
        );
        assert.equal(
          (await fetch(restored.files.getURL(file, file.file))).status,
          404,
        );
      }
    }
    checks.push({ collection, records: recovered.length, matched: true });
  }
  await Bun.write(
    `${evidenceDirectory}/restore-check.json`,
    JSON.stringify({ checks, readOnly: true }),
  );
  process.stdout.write(
    "PASS: source/restored records and attachment bytes match; no personal login or record mutation",
  );
}
main().catch(verificationFailure);
