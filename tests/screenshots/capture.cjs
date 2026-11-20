// README screenshots and recording, captured from a running stack with seed data.
// Run through scripts/capture-screenshots.sh (Chromium in a limited container).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const app = process.env.APP_URL;
const out = process.env.OUT_DIR;
const email = process.env.SEED_USER_EMAIL || "user@example.com";
const password = process.env.SEED_USER_PASSWORD || "user-changeme-123";
assert(app && out, "Set APP_URL and OUT_DIR");
const desktop = { width: 1440, height: 900 };
const mobile = { width: 390, height: 720 };
const errors = [];

const text = (value, ...marks) => ({
  type: "text",
  text: value,
  ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}),
});
const para = (...content) => ({ type: "paragraph", content });
const cell = (type, value) => ({ type, content: [para(text(value))] });
const row = (type, ...values) => ({
  type: "tableRow",
  content: values.map((v) => cell(type, v)),
});
const list = (kind, value, checked) => ({
  type: "list",
  attrs: checked === undefined ? { kind } : { kind, checked },
  content: [para(text(value))],
});
const richTitle = "Notes on compound interest";
const richBody = {
  type: "doc",
  content: [
    para(text(richTitle)),
    para(
      text("Working through the basics before choosing a savings account. "),
      text("Small rate differences add up", "bold"),
      text(" over ten years."),
    ),
    { type: "heading", attrs: { level: 2 }, content: [text("The formula")] },
    {
      type: "mathBlock",
      content: [text("A = P\\left(1 + \\frac{r}{n}\\right)^{nt}")],
    },
    para(
      text("With "),
      { type: "mathInline", content: [text("P = 1000")] },
      text(" and monthly compounding:"),
    ),
    {
      type: "table",
      content: [
        row("tableHeaderCell", "Rate", "After 5 years", "After 10 years"),
        row("tableCell", "2%", "1,105", "1,221"),
        row("tableCell", "4%", "1,221", "1,491"),
      ],
    },
    { type: "heading", attrs: { level: 2 }, content: [text("Check it")] },
    {
      type: "codeBlock",
      attrs: { language: "python" },
      content: [
        text(
          "def grow(p, r, n=12, t=10):\n    return p * (1 + r / n) ** (n * t)",
        ),
      ],
    },
    list("bullet", "Compare fees, not only rates"),
    list("task", "Ask the bank about withdrawal limits", false),
    list("task", "Read the account terms", true),
  ],
};

async function newPage(
  browser,
  viewport,
  colorScheme = "light",
  video,
  storageState,
) {
  // Video at 1x: 2x frames get dropped under the container CPU cap.
  const context = await browser.newContext({
    viewport,
    storageState,
    deviceScaleFactor: video ? 1 : 2,
    colorScheme,
    ...(video ? { recordVideo: { dir: video, size: viewport } } : {}),
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  return page;
}

async function login(page) {
  await page.goto(`${app}/auth/login`);
  await page.locator('input[name="identity"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.waitForURL("**/folders/all");
}

const row_ = (page, title) =>
  page.locator('a[href^="/notes/"]').filter({ hasText: title }).first();
async function open(page, title) {
  await row_(page, title).click();
  await page.getByRole("textbox", { name: "Note", exact: true }).waitFor();
  await expect(
    page.getByRole("textbox", { name: "Note", exact: true }),
  ).toContainText(title);
}
async function measure(page, name) {
  const view = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    overflow:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    scrollX,
    focus:
      document.activeElement.getAttribute("aria-label") ||
      document.activeElement.tagName,
  }));
  console.log("view", name, JSON.stringify(view));
  assert.equal(view.overflow, 0);
  assert.equal(view.scrollX, 0);
}

async function shot(page, name) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);
  await measure(page, name);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  console.log(`captured ${name}.png`);
}

async function api(p, init = {}, token = "") {
  const r = await fetch(`${app}/api/${p}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: token },
  });
  if (!r.ok) throw new Error(`API ${p}: ${r.status} ${await r.text()}`);
  return r.json();
}

const create = (auth, collection, fields) =>
  api(
    `collections/${collection}/records`,
    {
      method: "POST",
      body: JSON.stringify({ user: auth.record.id, ...fields }),
    },
    auth.token,
  );

async function ensureRichNote(auth) {
  const filter = encodeURIComponent(`title = "${richTitle}"`);
  const found = await api(
    `collections/notes/records?filter=${filter}`,
    {},
    auth.token,
  );
  const defaults = await api(
    "collections/folders/records?filter=is_default%3Dtrue",
    {},
    auth.token,
  );
  assert.equal(defaults.totalItems, 1);
  const folder = defaults.items[0].id;
  if (!found.totalItems)
    await create(auth, "notes", { folder, body: richBody });
  return folder;
}

async function recordFlow(page, auth, defaultFolder) {
  const folder = await create(auth, "folders", { name: "Field notes" });
  const spring = await create(auth, "notes", {
    folder: defaultFolder,
    body: {
      type: "doc",
      content: [
        para(text("Spring planting")),
        para(text("Sow calendula along the garden path.")),
      ],
    },
  });
  const button = (name) => page.getByRole("button", { name, exact: true });
  const link = (name) => page.getByRole("link", { name, exact: true });
  const noteRow = (id) => page.locator(`a[href="/notes/${id}"]`);
  const read = (id) => api(`collections/notes/records/${id}`, {}, auth.token);
  const editor = page.getByRole("textbox", { name: "Note", exact: true });
  const saved = page.getByRole("status", { name: "Save status", exact: true });
  const search = page.getByRole("searchbox", { name: "Search" });
  const beat = async (state) => {
    await measure(page, state);
    await page.waitForTimeout(1000);
  };

  await page.goto(`${app}/folders/all`);
  await expect(button("Compose")).toBeVisible();
  await beat("compose");
  await button("Compose").click();
  const title = "Garden plans";
  const body = "Tomatoes go by the south fence this year.";
  await editor.pressSequentially(title, { delay: 65 });
  await editor.press("Enter");
  await page.keyboard.type(body, { delay: 45 });
  await expect(saved).toHaveText("Saved");
  await expect(page).toHaveURL(/\/notes\/[a-z0-9]{15}$/);
  const gardenId = new URL(page.url()).pathname.split("/").pop();
  expect(await read(gardenId)).toMatchObject({
    id: gardenId,
    title,
    folder: defaultFolder,
    body: { type: "doc", content: [para(text(title)), para(text(body))] },
  });
  await beat("saved");
  await button("Back").click();
  const garden = noteRow(gardenId);
  await expect(garden).toContainText(title);
  await garden.click();
  await expect(editor).toContainText(body);
  await beat("reopened");
  await button("Back").click();
  const query = "south fence";
  await search.fill(query);
  await search.press("Enter");
  await expect(garden.locator("mark")).toHaveText(query);
  const resultURL = page.url();
  await beat("search-result");
  await garden.click();
  await expect(page).toHaveURL(`${app}/notes/${gardenId}`);
  await expect(editor).toContainText(body);
  await beat("opened-result");
  await button("Back").click();
  await expect(page).toHaveURL(resultURL);
  await expect(search).toHaveValue(query);
  await expect(garden).toBeFocused();
  await beat("restored-results");

  await button("Clear").click();
  const springRow = noteRow(spring.id);
  await springRow.click();
  await expect(editor).toContainText("Sow calendula");
  await button("Note actions").click();
  await page.getByRole("menuitem", { name: /Move/ }).click();
  const dest = page
    .getByRole("dialog")
    .getByRole("button", { name: folder.name, exact: true });
  await expect(dest).toBeEnabled();
  await beat("move-sheet");
  await dest.click();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(await read(spring.id)).toMatchObject({
    id: spring.id,
    folder: folder.id,
    deleted: "",
  });

  const fieldNotes = link(folder.name);
  await fieldNotes.click();
  await expect(page).toHaveURL(`${app}/folders/${folder.id}`);
  await expect(springRow).toContainText(spring.title);
  await springRow.click();
  await expect(page).toHaveURL(`${app}/notes/${spring.id}`);
  await expect(editor).toContainText("Sow calendula");
  await expect(saved).toHaveText("Saved");
  await beat("spring-planting");
  await button("Note actions").click();
  const remove = page.getByRole("menuitem", { name: /Delete note/ });
  await expect(remove).toBeVisible();
  await beat("note-actions");
  await remove.click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Delete Spring planting?");
  await beat("delete-confirmation");
  await confirm
    .getByRole("button", { name: "Delete note", exact: true })
    .click();
  await expect(page).toHaveURL(`${app}/folders/${folder.id}`);
  await expect(springRow).toHaveCount(0);
  expect(await read(spring.id)).toMatchObject({
    folder: folder.id,
    deleted: expect.stringMatching(/Z$/),
  });
  await beat("deleted");
  await link("Recently Deleted").click();
  const restore = button("Restore Spring planting");
  await expect(restore).toBeEnabled();
  await beat("recently-deleted");
  await restore.click();
  await expect(
    page.getByText("Restored to Field notes.", { exact: true }),
  ).toBeVisible();
  await beat("restored-announcement");
  await fieldNotes.click();
  await expect(springRow).toContainText(spring.title);
  expect(await read(spring.id)).toMatchObject({
    id: spring.id,
    folder: folder.id,
    deleted: "",
  });
  await beat("restored-row");
  await button("Delete folder").click();
  await expect(confirm).toContainText("1 active note");
  await beat("folder-confirmation");
  await confirm
    .getByRole("button", { name: "Delete folder", exact: true })
    .click();
  await expect(page).toHaveURL(`${app}/folders/all`);
  await expect(search).toBeFocused();
  await expect(search).toBeInViewport({ ratio: 1 });
  assert(await search.evaluate((el) => el.matches(":focus-visible")));
  expect(await read(spring.id)).toMatchObject({
    id: spring.id,
    folder: "",
    deleted: expect.stringMatching(/Z$/),
  });
  await beat("all-notes-search-focus");
  console.log(
    "verified recording IDs",
    JSON.stringify({
      garden: gardenId,
      spring: spring.id,
      fieldNotes: folder.id,
    }),
  );
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const auth = await api("collections/users/auth-with-password", {
    method: "POST",
    body: JSON.stringify({ identity: email, password }),
  });
  const defaultFolder = await ensureRichNote(auth);
  const browser = await chromium.launch();

  try {
    // Signed out: login with the theme control.
    let page = await newPage(browser, desktop);
    await page.goto(`${app}/auth/login`);
    await page.getByRole("radiogroup", { name: "Theme" }).waitFor();
    await shot(page, "login");
    await page.context().close();

    let storageState;
    for (const scheme of ["light", "dark"]) {
      page = await newPage(browser, desktop, scheme);
      await login(page);
      await open(page, richTitle);
      await shot(page, `notebook-${scheme}`);
      await page.setViewportSize({ width: 810, height: 900 });
      await shot(page, `tablet-${scheme}`);
      if (scheme === "light") {
        storageState = await page.context().storageState();
        await page.getByRole("link", { name: "Account", exact: true }).click();
        await page.getByRole("button", { name: /Turn on two-step/ }).waitFor();
        await shot(page, "account-security");
      }
      await page.context().close();

      page = await newPage(browser, mobile, scheme, undefined, storageState);
      await page.goto(`${app}/folders`);
      const suffix = scheme === "light" ? "" : "-dark";
      const notes = page.getByRole("link", { name: "Notes", exact: true });
      await notes.waitFor();
      await shot(page, `mobile-folders${suffix}`);
      await notes.click();
      await row_(page, "Ideas for the reading nook").waitFor();
      await shot(page, `mobile-list${suffix}`);
      await open(page, "Ideas for the reading nook");
      await shot(page, `mobile-editor${suffix}`);
      await page.context().close();
    }

    const videoDir = path.join(out, "video");
    page = await newPage(
      browser,
      { width: 1024, height: 640 },
      "light",
      videoDir,
      storageState,
    );
    await recordFlow(page, auth, defaultFolder);
    const video = page.video();
    await page.context().close();
    fs.renameSync(await video.path(), path.join(out, "core-loop.webm"));
    fs.rmSync(videoDir, { recursive: true, force: true });
    console.log("captured core-loop.webm");
  } finally {
    await browser.close();
  }
  console.log(`console_errors: ${errors.length}`);
  assert.deepEqual(errors, []);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
