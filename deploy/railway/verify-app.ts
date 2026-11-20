import { evidenceDirectory } from "./evidence";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import {
  deploymentURL,
  deploymentAdmin,
  createVerificationUser,
  verificationFailure,
} from "./verification";

async function main() {
  const admin = await deploymentAdmin();
  const fixture = await createVerificationUser(admin);
  const pb = fixture.client;
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(15000);
    await page.goto(deploymentURL!);
    await page.locator('input[name="identity"]').fill(fixture.email);
    await page.locator('input[name="password"]').fill(fixture.password);
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await page.waitForURL("**/folders/all");
    const proof = "Private restore proof.\n";
    const attachment = await pb.collection("attachments").create({
      user: fixture.record.id,
      name: "deployment-proof.txt",
      file: new File([proof], "deployment-proof.txt", { type: "text/plain" }),
    });
    await page.getByRole("button", { name: "Compose" }).click();
    const editor = page.getByRole("textbox", { name: "Note", exact: true });
    const title = "Temporary deployment verification";
    const text = "Persistence and restoration proof.";
    await editor.fill(title);
    await editor.press("End");
    await editor.press("Enter");
    await page.keyboard.insertText(text);
    await expect(page.getByRole("status", { name: "Save status" })).toHaveText(
      "Saved",
    );
    await page.waitForURL(/\/notes\/[a-z0-9]{15}$/);
    const id = new URL(page.url()).pathname.split("/").pop()!;
    await page.reload();
    await expect(editor).toContainText(title);
    await expect(editor).toContainText(text);
    const notes = pb.collection("notes");
    const record = await notes.getOne(id);
    assert.equal(record.title, title);
    assert.equal(
      record.folder,
      (await pb.collection("folders").getFirstListItem("is_default = true")).id,
    );
    await notes.update(id, {
      revision: record.revision,
      attachments: [attachment.id],
    });
    assert.deepEqual((await notes.getOne(id)).attachments, [attachment.id]);
    const token = await pb.files.getToken();
    const file = await fetch(
      pb.files.getURL(attachment, attachment.file, { token }),
    );
    assert.equal(file.status, 200);
    assert.equal(await file.text(), proof);
    assert.equal(
      (await fetch(`${deploymentURL!}/api/collections/notes/records/${id}`))
        .status,
      404,
    );
    assert.equal(
      (await fetch(pb.files.getURL(attachment, attachment.file))).status,
      404,
    );
    const other = await createVerificationUser(admin);
    try {
      await assert.rejects(other.client.collection("notes").getOne(id), {
        status: 404,
      });
      const otherToken = await other.client.files.getToken();
      assert.equal(
        (
          await fetch(
            pb.files.getURL(attachment, attachment.file, { token: otherToken }),
          )
        ).status,
        404,
      );
      await assert.rejects(
        other.client.collection("attachments").getOne(attachment.id),
        { status: 404 },
      );
    } finally {
      await other.cleanup();
    }
    await page.screenshot({
      path: `${evidenceDirectory}/deployed-editor.png`,
      fullPage: true,
    });
    process.stdout.write(
      "PASS: browser login, note save/reload, private file bytes, anonymous and cross-account denials. Temporary fixtures cleaned up.\n",
    );
  } finally {
    try {
      await browser?.close();
    } finally {
      await fixture.cleanup();
    }
  }
}
main().catch(verificationFailure);
