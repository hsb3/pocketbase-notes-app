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
async function shot(page, name) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  console.log(`captured ${name}.png`);
}

async function ensureRichNote() {
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
    `collections/notes/records?filter=${filter}`,
    {},
    auth.token,
  );
  if (found.totalItems) return;
  const defaults = await api(
    "collections/folders/records?filter=is_default%3Dtrue",
    {},
    auth.token,
  );
  assert.equal(defaults.totalItems, 1);
  await api(
    "collections/notes/records",
    {
      method: "POST",
      body: JSON.stringify({
        user: auth.record.id,
        folder: defaults.items[0].id,
        body: richBody,
      }),
    },
    auth.token,
  );
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  await ensureRichNote();
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
    await page.goto(`${app}/folders/all`);
    await page.getByRole("button", { name: "Compose" }).click();
    const editor = page.getByRole("textbox", { name: "Note", exact: true });
    await editor.pressSequentially("Garden plans", { delay: 65 });
    await editor.press("Enter");
    await page.keyboard.type("Tomatoes go by the south fence this year.", {
      delay: 45,
    });
    await expect(page.getByRole("status", { name: "Save status" })).toHaveText(
      "Saved",
    );
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await open(page, "Garden plans");
    await expect(editor).toContainText(
      "Tomatoes go by the south fence this year.",
    );
    await page.waitForTimeout(1000);
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
