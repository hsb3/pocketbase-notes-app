const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { mkdirSync } = require("node:fs");
const url = process.env.VITE_PB_URL;
const screenshotPrefix = "notebook";
const appUrl = process.env.TEST_APP_URL || "http://127.0.0.1:5173";
async function api(path, token, method = "GET", body) {
  const response = await fetch(`${url}/api/${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: token || "" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok)
    throw new Error(`API ${method} ${path}: ${response.status}`);
  return response.status === 204 ? undefined : response.json();
}
(async () => {
  const admin = await api(
    "collections/_superusers/auth-with-password",
    "",
    "POST",
    { identity: process.env.PB_EMAIL, password: process.env.PB_PASSWORD },
  );
  const email = `browser-${crypto.randomUUID()}@example.com`;
  const password = crypto.randomUUID();
  const account = await api("collections/users/records", admin.token, "POST", {
    email,
    password,
    passwordConfirm: password,
    verified: true,
    name: "Jamie",
  });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const nav = (name) => page.getByRole("button", { name, exact: true });
  const row = (title) =>
    page.locator('a[href*="/entries/"]').filter({ hasText: title });
  const errors = [];
  page.on("console", (message) => {
    if (process.env.DEBUG_BROWSER && message.type() === "error")
      process.stderr.write(message.text() + "\n");
  });
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(appUrl);
    await page.locator('input[name="identity"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await page.waitForURL("**/entries**");
    await page.getByRole("link", { name: "New note", exact: true }).click();
    await page.getByLabel("Entry title").fill("A slower start");
    assert.equal(
      await page.getByRole("button", { name: "Toggle Sidebar" }).count(),
      1,
      "Only one sidebar control belongs in the entry header",
    );

    await page.getByRole("button", { name: "Enter full screen" }).click();
    assert.equal(
      await page
        .getByRole("region", { name: "Entries", exact: true })
        .isVisible(),
      false,
    );
    assert.equal(
      await page.getByLabel("Entry title").inputValue(),
      "A slower start",
    );
    await page.getByRole("button", { name: "Exit full screen" }).click();
    await page.getByRole("button", { name: "Toggle Sidebar" }).first().click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-slot="sidebar"][data-state]')
          ?.getAttribute("data-state") === "collapsed",
    );
    await page.getByRole("button", { name: "Toggle Sidebar" }).first().click();

    const editor = page.getByRole("textbox", { name: "Entry body" });
    await editor.fill(
      "I took a walk before opening my laptop. It made the rest of the morning feel less hurried.",
    );
    await editor.press("ControlOrMeta+b");
    assert.equal(
      await page
        .locator('[data-slot="sidebar"][data-state]')
        .getAttribute("data-state"),
      "expanded",
      "Bold shortcut must not collapse navigation",
    );
    await editor.press("ControlOrMeta+b");
    await editor.press("ControlOrMeta+a");
    await page
      .getByRole("toolbar", { name: "Formatting" })
      .getByRole("button", { name: "Bold", exact: true })
      .click();
    {
      await page
        .getByRole("toolbar", { name: "Formatting" })
        .getByRole("button", { name: "Undo", exact: true })
        .click();
      assert.equal(await editor.locator("strong").count(), 0);
      await page
        .getByRole("toolbar", { name: "Formatting" })
        .getByRole("button", { name: "Redo", exact: true })
        .click();
      assert.equal(await editor.locator("strong").count(), 1);
    }
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForURL(/\/entries\/[a-z0-9]{15}/);
    const firstUrl = page.url();
    await page.getByRole("button", { name: "Enter full screen" }).click();
    await page.waitForFunction(
      () =>
        document.querySelector(".entry-pane").getBoundingClientRect().width >=
        innerWidth - 1,
    );
    assert.match(await editor.innerText(), /walk before opening/);
    await page.screenshot({
      path: `docs/images/${screenshotPrefix}-focus.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Exit full screen" }).click();

    await page.reload();
    await page.getByRole("textbox", { name: "Entry body" }).waitFor();
    assert.match(await editor.innerText(), /walk before opening/);
    assert.equal(await editor.locator("strong").count(), 1);
    await page.getByRole("button", { name: "Add to favorites" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: /^Saved$/ })
      .waitFor();
    await page.getByLabel("Entry title").fill("Unsaved title");
    await nav("Journal").click();
    await page.getByRole("alertdialog").waitFor();
    await page.getByRole("button", { name: "Keep editing" }).click();
    assert.equal(
      await page.getByLabel("Entry title").inputValue(),
      "Unsaved title",
    );
    await nav("Journal").click();
    await page.getByRole("button", { name: "Discard", exact: true }).click();
    await page
      .getByRole("link", { name: "New journal entry", exact: true })
      .first()
      .click();
    await page.getByLabel("Entry title").fill("Things worth keeping");
    await editor.fill(
      "A long conversation. The first cool morning. Small things count, too.",
    );
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForURL(/\/entries\/[a-z0-9]{15}/);
    await page.reload();
    assert.equal(
      await page.getByLabel("Entry title").inputValue(),
      "Things worth keeping",
    );
    const journalUrl = page.url();
    await page.getByLabel("Entry title").fill("A saved revision");
    await nav("All entries").click();
    await page
      .getByRole("button", { name: "Save and continue", exact: true })
      .click();
    await row("A saved revision").waitFor();
    await page.getByLabel("Search titles").fill("slower");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.waitForURL(/q=slower/);
    await page.reload();
    await row("A slower start").waitFor();
    assert.equal(await row("A saved revision").count(), 0);
    await page.goto(journalUrl);
    await page.getByLabel("Entry title").fill("Things worth keeping");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: /^Saved$/ })
      .waitFor();
    await page
      .getByRole("button", { name: "Choose journal date" })
      .last()
      .click();
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await nav("Journal").click();
    await page.getByRole("button", { name: "Choose journal date" }).click();
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await page.waitForURL(/date=/);
    await page.reload();
    await row("Things worth keeping").waitFor();

    const journalFilter = page.getByRole("button", {
      name: "Choose journal date",
    });
    const selectedDateLabel = await journalFilter.innerText();
    await page.getByRole("button", { name: "Toggle Sidebar" }).click();
    assert.equal(
      await journalFilter.isVisible(),
      false,
      "Collapsed sidebar must hide the journal calendar trigger",
    );
    await page.getByRole("button", { name: "Toggle Sidebar" }).click();
    assert.equal(
      await journalFilter.innerText(),
      selectedDateLabel,
      "Reopening preserves the journal filter",
    );
    await journalFilter.click();
    await page.getByRole("button", { name: "Today", exact: true }).waitFor();
    await page.keyboard.press("ControlOrMeta+b");
    assert.equal(
      await page
        .getByRole("button", { name: "Today", exact: true })
        .isVisible(),
      false,
      "Collapsing must dismiss the calendar portal too",
    );
    await page.getByRole("button", { name: "Toggle Sidebar" }).click();
    await row("Things worth keeping").waitFor();

    await nav("Favorites").click();
    await row("A slower start").waitFor();
    assert.equal(await row("Things worth keeping").count(), 0);
    await page.goto(firstUrl);
    await editor.waitFor();
    const other = await context.newPage();
    await other.goto(firstUrl);
    await other.getByRole("textbox", { name: "Entry body" }).waitFor();
    await page.getByLabel("Entry title").fill("A slower start, revised");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: /^Saved$/ })
      .waitFor();
    await other.getByLabel("Entry title").fill("A stale title");
    await other.getByRole("button", { name: "Save", exact: true }).click();
    await other
      .getByText("A newer version was saved.", { exact: false })
      .waitFor();
    assert.equal(
      await other.getByLabel("Entry title").inputValue(),
      "A stale title",
    );
    await other.close();
    // Failed requests must preserve the editor draft.
    await page.route("**/api/collections/entries/records/*", (route) =>
      route.request().method() === "PATCH" ? route.abort() : route.continue(),
    );
    await page.getByLabel("Entry title").fill("Retained draft");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page
      .getByText("Could not save. Your draft is still here. Try again.")
      .waitFor();
    assert.equal(
      await page.getByLabel("Entry title").inputValue(),
      "Retained draft",
    );
    await page.unroute("**/api/collections/entries/records/*");
    await page.getByLabel("Entry title").fill("A slower start");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: /^Saved$/ })
      .waitFor();
    await api(`collections/users/records/${account.id}`, admin.token, "PATCH", {
      password,
      passwordConfirm: password,
    });
    await page.getByLabel("Entry title").fill("After signing in again");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("dialog", { name: "Sign in to save" }).waitFor();
    assert.equal(
      await page.getByLabel("Entry title").inputValue(),
      "After signing in again",
    );
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Sign in to save" })
      .waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: /^Saved$/ })
      .waitFor();
    await page.getByLabel("Entry title").fill("A slower start");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: /^Saved$/ })
      .waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Toggle Sidebar" }).count(),
      1,
    );
    assert.ok(
      (await editor.boundingBox()).y < 240,
      "Writing area must start within 240px of the viewport top",
    );
    const footer = page.locator(".document-footer");
    const desktopFooter = await footer.boundingBox();
    assert.ok(
      Math.abs(desktopFooter.y + desktopFooter.height - 1000) <= 1,
      "Entry information stays on the bottom rail",
    );
    mkdirSync("docs/images", { recursive: true });
    await page.screenshot({
      path: `docs/images/${screenshotPrefix}-desktop.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      "Mobile must not overflow horizontally",
    );
    assert.ok(
      (await editor.boundingBox()).y < 260,
      "Mobile writing area must start within 260px of the viewport top",
    );
    const mobileFooter = await footer.boundingBox();
    assert.ok(
      Math.abs(mobileFooter.y + mobileFooter.height - 844) <= 1,
      "Mobile information stays on the bottom rail",
    );
    await page.screenshot({
      path: `docs/images/${screenshotPrefix}-mobile.png`,
      fullPage: true,
    });
    await page.getByRole("link", { name: "Entries", exact: true }).click();
    await page.getByRole("button", { name: "Toggle Sidebar" }).first().click();
    await nav("Journal").click();
    await row("Things worth keeping").waitFor();
    await page.goto(journalUrl);
    await page.getByRole("button", { name: "Entry actions" }).click();
    await page.getByRole("menuitem", { name: "Delete entry" }).click();
    await page.getByRole("alertdialog").waitFor();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(
      await page.getByLabel("Entry title").inputValue(),
      "Things worth keeping",
    );
    await page.getByRole("button", { name: "Entry actions" }).click();
    await page.getByRole("menuitem", { name: "Delete entry" }).click();
    await page
      .getByRole("button", { name: "Delete entry", exact: true })
      .click();
    await page.waitForURL(/\/entries\?/);
    assert.equal(errors.length, 0, errors.join("\n"));
    console.log(
      "PASS: login, rich-text round trip, favorites, draft guard, journals, stale saves, failed saves, mobile navigation and deletion",
    );
  } catch (error) {
    await page.screenshot({
      path: "/private/tmp/agents/react-pocketbase/root-build/browser-failure.png",
      fullPage: true,
    });
    console.error("PAGE ERRORS", errors);
    throw error;
  } finally {
    await browser.close();
    await api(`collections/users/records/${account.id}`, admin.token, "DELETE");
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
