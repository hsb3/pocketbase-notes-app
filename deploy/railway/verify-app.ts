import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";
import { chromium, expect } from "@playwright/test";
import PocketBase from "pocketbase";

loadEnvFile("deploy/railway/.env");
const env = process.env;
assert.equal(env.PB_URL, "https://notes-staging.up.railway.app");
const pb = new PocketBase(env.PB_URL);
const admin = new PocketBase(env.PB_URL);
await admin
  .collection("_superusers")
  .authWithPassword(env.PB_ADMIN_EMAIL!, env.PB_ADMIN_PASSWORD!);
await pb
  .collection("users")
  .authWithPassword(env.PB_USER_EMAIL!, env.PB_USER_PASSWORD!);
assert.equal(
  (await admin.collection("entries").getList(1, 1)).totalItems,
  0,
  "Expected a fresh empty install",
);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(env.PB_URL);
  await page.locator('input[name="identity"]').fill(env.PB_USER_EMAIL!);
  await page.locator('input[name="password"]').fill(env.PB_USER_PASSWORD!);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.waitForURL("**/entries**");
  await page.getByRole("link", { name: "New note", exact: true }).click();
  await page
    .getByLabel("Entry title")
    .fill("Temporary deployment verification");
  await page
    .getByRole("textbox", { name: "Entry body" })
    .fill("Persistence and restoration proof.");
  await page.getByLabel("Choose attachments").setInputFiles({
    name: "deployment-proof.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Private restore proof.\n"),
  });
  await page
    .getByRole("button", { name: "Download deployment-proof.txt", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForURL(/\/entries\/[a-z0-9]{15}/);
  const id = new URL(page.url()).pathname.split("/").pop()!;
  await page.reload();
  await expect(page.getByLabel("Entry title")).toHaveValue(
    "Temporary deployment verification",
  );
  await expect(page.getByRole("textbox", { name: "Entry body" })).toContainText(
    "Persistence and restoration proof.",
  );
  const record = await pb.collection("entries").getOne(id);
  const attachment = await pb
    .collection("attachments")
    .getOne(record.attachments[0]);
  const token = await pb.files.getToken();
  const file = await fetch(
    pb.files.getURL(attachment, attachment.file, { token }),
  );
  assert.equal(await file.text(), "Private restore proof.\n");
  assert.equal(
    (await fetch(`${env.PB_URL}/api/collections/entries/records/${id}`)).status,
    404,
  );
  assert.equal(
    (await fetch(pb.files.getURL(attachment, attachment.file))).status,
    404,
  );
  const password = crypto.randomUUID();
  const other = await admin.collection("users").create({
    email: `deploy-${crypto.randomUUID()}@example.invalid`,
    password,
    passwordConfirm: password,
    verified: true,
  });
  try {
    const outsider = new PocketBase(env.PB_URL);
    await outsider.collection("users").authWithPassword(other.email, password);
    await assert.rejects(outsider.collection("entries").getOne(id), {
      status: 404,
    });
    await assert.rejects(
      outsider.collection("attachments").getOne(attachment.id),
      { status: 404 },
    );
  } finally {
    await admin.collection("users").delete(other.id);
  }
  await Bun.write(
    "/private/tmp/agents/pocketbase-notes-app/codex-deploy/fixture.json",
    JSON.stringify({
      entryId: id,
      attachmentId: attachment.id,
      file: attachment.file,
      userId: pb.authStore.record!.id,
    }),
  );
  await page.screenshot({
    path: "/private/tmp/agents/pocketbase-notes-app/codex-deploy/deployed-editor.png",
    fullPage: true,
  });
  process.stdout.write(
    "PASS: browser login, note save/reload, private file bytes, anonymous and cross-account denials. Temporary fixture retained for restart/restore checks.\n",
  );
} finally {
  await browser.close();
}
