const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { chromium } = require("playwright");
const backend = process.env.VITE_PB_URL;
const frontend = process.env.TEST_APP_URL || "http://127.0.0.1:5173";
async function api(path, token, method = "GET", body) {
  const response = await fetch(`${backend}/api/${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: token || "" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status}`);
  return response.status === 204 ? undefined : response.json();
}
(async () => {
  const admin = await api(
    "collections/_superusers/auth-with-password",
    "",
    "POST",
    { identity: process.env.PB_EMAIL, password: process.env.PB_PASSWORD },
  );
  const email = `files-${crypto.randomUUID()}@example.com`,
    password = crypto.randomUUID();
  const account = await api("collections/users/records", admin.token, "POST", {
    email,
    password,
    passwordConfirm: password,
    verified: true,
  });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on("requestfailed", (request) => {
    if (request.url().startsWith("attachment:"))
      errors.push("Private reference requested as URL");
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (process.env.DEBUG_BROWSER && m.type() === "error")
      process.stderr.write(m.text() + "\n");
  });
  try {
    await page.goto(frontend);
    await page.locator('input[name="identity"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await page.waitForURL("**/entries**");
    await page.getByRole("link", { name: "New note", exact: true }).click();
    await page.getByLabel("Entry title").fill("Files and rich content");
    const editor = page.getByRole("textbox", { name: "Entry body" });
    await editor.fill("A private notebook with attachments.");
    const toolbar = page.getByRole("toolbar", { name: "Formatting" });
    await editor.press("ControlOrMeta+a");
    await toolbar
      .getByRole("button", { name: "Underline", exact: true })
      .click();
    await page.getByLabel("Choose attachments").setInputFiles({
      name: "reference.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("A private reference file."),
    });
    await page
      .getByRole("button", { name: "Download reference.txt", exact: true })
      .waitFor();
    const png = Buffer.from(
      await page.evaluate(() => {
        const c = document.createElement("canvas");
        c.width = 32;
        c.height = 32;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#4477aa";
        ctx.fillRect(0, 0, 32, 32);
        return c.toDataURL("image/png").split(",")[1];
      }),
      "base64",
    );
    await toolbar
      .getByRole("button", { name: "Insert Image", exact: true })
      .click();
    await page
      .getByLabel("Upload", { exact: true })
      .setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: png });
    await page
      .getByRole("button", { name: "Upload Image", exact: true })
      .click();
    const image = page.getByAltText("Attached image");
    await image.waitFor();
    await page.waitForFunction(() => {
      const img = document.querySelector('img[alt="Attached image"]');
      return img?.complete && img.naturalWidth > 0;
    });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForURL(/\/entries\/[a-z0-9]{15}/);
    const entryId = new URL(page.url()).pathname.split("/").pop();
    const record = await api(
      `collections/entries/records/${entryId}`,
      admin.token,
    );
    assert.equal(record.attachments.length, 2);
    assert.match(JSON.stringify(record.body), /attachment:/);
    assert(!JSON.stringify(record.body).includes("token="));
    await page.reload();
    await image.waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector('img[alt="Attached image"]')?.naturalWidth > 0,
    );
    assert.equal(await editor.locator("u").count(), 1);
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download reference.txt", exact: true })
      .click();
    const download = await downloadPromise;
    assert.equal(
      (await readFile(await download.path())).toString(),
      "A private reference file.",
    );
    await editor.press("ControlOrMeta+End");
    await editor.press("Enter");
    await editor.pressSequentially("/table");
    await page.getByText("Table", { exact: true }).click();
    await editor.locator("table").waitFor();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: /^Saved$/ })
      .waitFor();
    await page.reload();
    await editor.locator("table").waitFor();
    await image.waitFor();
    await page
      .getByRole("button", { name: "Remove reference.txt", exact: true })
      .click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: /^Saved$/ })
      .waitFor();
    assert.equal(
      (await api(`collections/entries/records/${entryId}`, admin.token))
        .attachments.length,
      1,
    );
    await page.getByLabel("Choose attachments").setInputFiles({
      name: "bad.html",
      mimeType: "text/html",
      buffer: Buffer.from("<script>bad</script>"),
    });
    await page.getByText("Choose an image, PDF or text file.").waitFor();
    assert.equal(
      (await api(`collections/entries/records/${entryId}`, admin.token))
        .attachments.length,
      1,
    );
    await page.reload();
    await image.waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector('img[alt="Attached image"]')?.naturalWidth > 0,
    );
    await page.screenshot({
      path: "docs/images/notebook-editor-full.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Editor must fit mobile viewport",
    );
    await page.screenshot({
      path: "docs/images/notebook-editor-full-mobile.png",
      fullPage: true,
    });
    assert.equal(errors.length, 0, errors.join("\n"));
    console.log(
      "PASS: full toolbar, private image insertion/reload, attachments before first save, download bytes, slash table, removal and rejected upload",
    );
  } catch (e) {
    await page.screenshot({
      path: "/private/tmp/agents/react-pocketbase/root-build/editor-files-failure.png",
      fullPage: true,
    });
    console.error("Browser errors", errors);
    throw e;
  } finally {
    await browser.close();
    await api(`collections/users/records/${account.id}`, admin.token, "DELETE");
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
