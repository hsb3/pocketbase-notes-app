import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import PocketBase from "pocketbase";

const url = process.env.VITE_PB_URL;
assert(
  url && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname),
  "Use a local disposable stack.",
);
const admin = new PocketBase(url);
await admin
  .collection("_superusers")
  .authWithPassword(process.env.PB_EMAIL!, process.env.PB_PASSWORD!);
assert.equal(
  (await admin.collection("attachments").getList(1, 1)).totalItems,
  0,
  "Restore test requires a disposable store without attachments",
);
const settings = await admin.settings.getAll();
assert(
  !settings.backups.cron && !settings.backups.s3.enabled,
  "Restore test requires no configured backup schedule/store",
);
const directory = mkdtempSync(join(tmpdir(), "pocketbase-restore-check-"));
const data = join(directory, "data");
mkdirSync(data);
const container = `notes-restore-${crypto.randomUUID()}`;
const backup = `restore-check-${crypto.randomUUID()}.zip`;
let account = "",
  started = false,
  backedUp = false;
function docker(args: string[]) {
  const result = Bun.spawnSync(["docker", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  assert.equal(result.exitCode, 0, `Docker ${args[0]} failed`);
  return result.stdout.toString().trim();
}
try {
  await admin.settings.update({
    smtp: { enabled: false },
    s3: { enabled: false },
  });
  const password = crypto.randomUUID();
  const user = await admin.collection("users").create({
    email: `restore-${crypto.randomUUID()}@example.test`,
    password,
    passwordConfirm: password,
    verified: true,
  });
  account = user.id;
  const form = new FormData();
  form.set("user", user.id);
  form.set("name", "restore.txt");
  form.set(
    "file",
    new File(["Restored private bytes.\n"], "restore.txt", {
      type: "text/plain",
    }),
  );
  const attachment = await admin.collection("attachments").create(form);
  await admin.collection("entries").create({
    user: user.id,
    kind: "note",
    title: "Restore test",
    revision: 1,
    attachments: [attachment.id],
    body: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Restored note" }],
        },
      ],
    },
  });
  await admin.backups.create(backup);
  backedUp = true;
  for (let i = 0; i < 30; i++) {
    if (
      (await admin.backups.getFullList()).some(
        (b) => b.key === backup && b.size,
      )
    )
      break;
    await Bun.sleep(1000);
  }
  const token = await admin.files.getToken();
  const response = await fetch(admin.backups.getDownloadURL(token, backup));
  assert(response.ok);
  const zip = join(directory, "backup.zip");
  await Bun.write(zip, await response.arrayBuffer());
  assert.equal(
    Bun.spawnSync(["unzip", "-q", zip, "-d", data], {
      stdout: "pipe",
      stderr: "pipe",
    }).exitCode,
    0,
  );
  const image = docker([
    "inspect",
    "--format",
    "{{.Config.Image}}",
    process.env.PB_CONTAINER || "pocketbase",
  ]);
  docker([
    "run",
    "-d",
    "--rm",
    "--name",
    container,
    "-e",
    "PB_ENCRYPTION_KEY",
    "-p",
    "127.0.0.1::8080",
    "-v",
    `${data}:/pb/pb_data`,
    image,
  ]);
  started = true;
  const bindings = JSON.parse(
    docker([
      "inspect",
      "--format",
      "{{json .NetworkSettings.Ports}}",
      container,
    ]),
  );
  const restoreURL = `http://127.0.0.1:${bindings["8080/tcp"][0].HostPort}`;
  for (let i = 0; i < 30; i++) {
    try {
      if ((await fetch(`${restoreURL}/api/health`)).ok) break;
    } catch {
      /* Wait for the isolated server to bind. */
    }
    await Bun.sleep(1000);
  }
  const child = Bun.spawn(
    [process.execPath, "deploy/railway/verify-restore.ts"],
    {
      env: {
        ...process.env,
        PB_URL: url!,
        DEPLOY_ALLOW_LOCAL: "true",
        PB_ADMIN_EMAIL: process.env.PB_EMAIL!,
        PB_ADMIN_PASSWORD: process.env.PB_PASSWORD!,
        PB_USER_EMAIL: "",
        PB_USER_PASSWORD: "",
        RESTORE_URL: restoreURL,
        DEPLOY_EVIDENCE_DIR: directory,
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const output = await new Response(child.stdout).text(),
    error = await new Response(child.stderr).text();
  assert.equal(await child.exited, 0, error);
  assert(output.includes("PASS"));
  console.log(
    "PASS: isolated backup extraction/boot and read-only restored record/file comparison without personal credentials",
  );
} finally {
  try {
    if (started) docker(["stop", container]);
    if (account) await admin.collection("users").delete(account);
    if (backedUp) await admin.backups.delete(backup);
  } finally {
    await admin.settings.update({
      smtp: { ...settings.smtp, password: "mailpit" },
      s3: {
        ...settings.s3,
        secret: process.env.RUSTFS_SECRET_KEY || "pocketbase",
      },
    });
    rmSync(directory, { recursive: true, force: true });
  }
}
