// README screenshots and recording, captured from a running stack with seed data.
// Run through scripts/capture-screenshots.sh (Chromium in a limited container).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

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

async function newPage(browser, viewport, colorScheme = "light", video) {
  // Video at 1x: 2x frames get dropped under the container CPU cap.
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: video ? 1 : 2,
    colorScheme,
    ...(video ? { recordVideo: { dir: video, size: viewport } } : {}),
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    // The stack is reached as http://pocketbase, which Chromium calls untrustworthy.
    if (
      m.type() === "error" &&
      !m.text().includes("Cross-Origin-Opener-Policy")
    )
      errors.push(`console: ${m.text()}`);
  });
  return page;
}

async function login(page) {
  await page.goto(`${app}/auth/login`);
  await page.locator('input[name="identity"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.waitForURL("**/entries**");
}

const row_ = (page, title) =>
  page.locator('a[href*="/entries/"]').filter({ hasText: title }).first();
async function open(page, title) {
  await row_(page, title).click();
  await page.getByRole("textbox", { name: "Entry body" }).waitFor();
  await page.waitForTimeout(800);
}
async function shot(page, name) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  console.log(`captured ${name}.png`);
}

async function ensureRichEntry() {
  const api = async (p, init = {}, token = "") => {
    const r = await fetch(`${app}/api/${p}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: token },
    });
    if (!r.ok) throw new Error(`API ${p}: ${r.status} ${await r.text()}`);
    return r.json();
  };
  const auth = await api("collections/users/auth-with-password", {
    method: "POST",
    body: JSON.stringify({ identity: email, password }),
  });
  const filter = encodeURIComponent(`title = "${richTitle}"`);
  const found = await api(
    `collections/entries/records?filter=${filter}`,
    {},
    auth.token,
  );
  if (found.totalItems) return;
  await api(
    "collections/entries/records",
    {
      method: "POST",
      body: JSON.stringify({
        user: auth.record.id,
        kind: "note",
        title: richTitle,
        body: richBody,
        revision: 1,
      }),
    },
    auth.token,
  );
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  await ensureRichEntry();
  const browser = await chromium.launch();

  // Signed out: login with the theme control.
  let page = await newPage(browser, desktop);
  await page.goto(`${app}/auth/login`);
  await page.getByRole("radiogroup", { name: "Theme" }).waitFor();
  await shot(page, "login");
  await page.context().close();

  // Desktop notebook in light and dark, rich editor, open tasks, full screen.
  for (const scheme of ["light", "dark"]) {
    page = await newPage(browser, desktop, scheme);
    await login(page);
    await open(page, richTitle);
    await shot(page, `notebook-${scheme}`);
    if (scheme === "light") {
      await page.getByRole("link", { name: "Open tasks", exact: true }).click();
      await page
        .getByRole("heading", { name: "Open tasks", level: 1 })
        .waitFor();
      await shot(page, "open-tasks");
      await open(page, "A slower start");
      await page.getByRole("button", { name: "Enter full screen" }).click();
      await page.waitForTimeout(500);
      await shot(page, "full-screen");
      await page.goto(`${app}/account`);
      await page.getByRole("button", { name: /Turn on two-step/ }).waitFor();
      await shot(page, "account-security");
    }
    await page.context().close();
  }

  // Mobile list, editor and open tasks (joined into mobile.png by the shell script).
  page = await newPage(browser, mobile);
  await login(page);
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await row_(page, "Ideas for the reading nook").waitFor();
  await page.evaluate(() => document.activeElement?.blur()); // hide focus tooltip
  await page.waitForTimeout(600);
  await shot(page, "mobile-list");
  await open(page, "Ideas for the reading nook");
  await shot(page, "mobile-editor");
  await page.goto(`${app}/entries/tasks`);
  await page.getByRole("heading", { name: "Open tasks", level: 1 }).waitFor();
  await shot(page, "mobile-tasks");
  await page.context().close();

  // Recording: write, save, find, tick a task.
  const videoDir = path.join(out, "video");
  page = await newPage(
    browser,
    { width: 1024, height: 640 },
    "light",
    videoDir,
  );
  await login(page);
  await page.waitForTimeout(600);
  await page.getByRole("link", { name: "New note", exact: true }).click();
  await page.getByLabel("Entry title").pressSequentially("Garden plans", {
    delay: 60,
  });
  const editor = page.getByRole("textbox", { name: "Entry body" });
  await editor.click();
  await page.keyboard.type("Tomatoes go by the south fence this year.", {
    delay: 25,
  });
  await page.keyboard.press("Enter");
  await page.keyboard.type("[ ] ", { delay: 60 });
  await page.keyboard.type("Buy seedlings", { delay: 40 });
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("status").filter({ hasText: /Saved/ }).waitFor();
  await page.waitForTimeout(900);
  await page.getByLabel("Search titles").pressSequentially("garden", {
    delay: 80,
  });
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.waitForTimeout(700);
  await open(page, "Garden plans");
  await page.waitForTimeout(800);
  await page.getByRole("link", { name: "Open tasks", exact: true }).click();
  const box = page.getByRole("checkbox", { name: "Buy seedlings" });
  await box.waitFor();
  await page.waitForTimeout(2000);
  await box.click();
  await box.waitFor({ state: "detached" });
  await page.waitForTimeout(1500);
  const video = page.video();
  await page.context().close();
  fs.renameSync(await video.path(), path.join(out, "core-loop.webm"));
  fs.rmSync(videoDir, { recursive: true, force: true });
  console.log("captured core-loop.webm");

  await browser.close();
  console.log(`console_errors: ${errors.length}`);
  for (const e of errors) console.log(`  ${e}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
