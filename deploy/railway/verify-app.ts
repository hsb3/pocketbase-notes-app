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
      .getByRole("button", {
        name: "Download deployment-proof.txt",
        exact: true,
      })
      .waitFor();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForURL(/\/entries\/[a-z0-9]{15}/);
    const id = new URL(page.url()).pathname.split("/").pop()!;
    await page.reload();
    await expect(page.getByLabel("Entry title")).toHaveValue(
      "Temporary deployment verification",
    );
    await expect(
      page.getByRole("textbox", { name: "Entry body" }),
    ).toContainText("Persistence and restoration proof.");
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
      (await fetch(`${deploymentURL!}/api/collections/entries/records/${id}`))
        .status,
      404,
    );
    assert.equal(
      (await fetch(pb.files.getURL(attachment, attachment.file))).status,
      404,
    );
    const other = await createVerificationUser(admin);
    try {
      await assert.rejects(other.client.collection("entries").getOne(id), {
        status: 404,
      });
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
