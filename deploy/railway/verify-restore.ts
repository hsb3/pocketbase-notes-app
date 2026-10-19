import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";
import PocketBase from "pocketbase";

loadEnvFile("deploy/railway/.env");
const root = "/private/tmp/agents/react-pocketbase/codex-deploy";
const fixture = await Bun.file(`${root}/fixture.json`).json();
const restore = await Bun.file(`${root}/restore-state.json`).json();
assert.equal(process.env.PB_URL, "https://notes-staging.up.railway.app");
assert.equal(new URL(restore.url).hostname, "127.0.0.1");
const evidence = [];
for (const [kind, url] of [
  ["Railway after restart", process.env.PB_URL],
  ["isolated restore", restore.url],
]) {
  const pb = new PocketBase(url);
  let healthy = false;
  for (let i = 0; i < 30; i++) {
    try {
      await pb.health.check();
      healthy = true;
      break;
    } catch {
      await Bun.sleep(1000);
    }
  }
  assert(healthy, `${kind} health`);
  const auth = await pb
    .collection("users")
    .authWithPassword(
      process.env.PB_USER_EMAIL!,
      process.env.PB_USER_PASSWORD!,
    );
  assert.equal(auth.record.id, fixture.userId);
  const note = await pb.collection("entries").getOne(fixture.entryId);
  assert.equal(note.title, "Temporary deployment verification");
  assert(
    JSON.stringify(note.body).includes("Persistence and restoration proof."),
  );
  const attachment = await pb
    .collection("attachments")
    .getOne(fixture.attachmentId);
  const token = await pb.files.getToken();
  const response = await fetch(
    pb.files.getURL(attachment, attachment.file, { token }),
  );
  assert.equal(await response.text(), "Private restore proof.\n");
  assert.equal(
    (await fetch(`${url}/api/collections/entries/records/${fixture.entryId}`))
      .status,
    404,
  );
  assert.equal(
    (await fetch(pb.files.getURL(attachment, attachment.file))).status,
    404,
  );
  evidence.push({
    kind,
    login: true,
    note: true,
    fileBytes: true,
    anonymousDenied: true,
  });
  process.stdout.write(
    `PASS: ${kind} login, note, file bytes and anonymous denials.\n`,
  );
}
await Bun.write(
  `${root}/restore-check.json`,
  JSON.stringify({
    checks: evidence,
    elapsedSeconds: Math.round(Date.now() / 1000 - restore.startedAt),
  }),
);
