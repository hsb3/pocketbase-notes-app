const assert = require("node:assert/strict");
const { test, api, expect } = require("./fixtures.cjs");

const task = (text, checked, ...nested) => ({
  type: "list",
  attrs: { kind: "task", checked },
  content: [
    { type: "paragraph", content: [{ type: "text", text }] },
    ...nested,
  ],
});
const doc = (...content) => ({ type: "doc", content });

// Contrast ratio between an element's text colour and the nearest opaque background.
function contrast(element) {
  const rgb = (value) => value.match(/[\d.]+/g).map(Number);
  const luminance = ([r, g, b]) => {
    const [R, G, B] = [r, g, b].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
  };
  let node = element;
  let background = "rgba(0, 0, 0, 0)";
  while (node && rgb(background)[3] === 0) {
    background = getComputedStyle(node).backgroundColor;
    node = node.parentElement;
  }
  const [a, b] = [rgb(getComputedStyle(element).color), rgb(background)].map(
    luminance,
  );
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test("open tasks list, tick-off, conflicts, isolation and mobile", async ({
  page,
  context,
  session,
}, testInfo) => {
  const { email, password, account, admin } = session;
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const auth = await api("collections/users/auth-with-password", "", "POST", {
    identity: email,
    password,
  });
  const create = (token, user, title, body) =>
    api("collections/entries/records", token, "POST", {
      user,
      kind: "note",
      title,
      body,
      revision: 1,
    });
  const groceries = await create(
    auth.token,
    account.id,
    "Groceries",
    doc(task("Buy oat milk", false), task("Eggs", true)),
  );
  const weekend = await create(
    auth.token,
    account.id,
    "Weekend plans",
    doc(
      task("Call Sam", false),
      task("Pack", true, task("Find charger", false)),
    ),
  );
  const otherPassword = crypto.randomUUID();
  const other = await api("collections/users/records", admin.token, "POST", {
    email: `e2e-${crypto.randomUUID()}@example.com`,
    password: otherPassword,
    passwordConfirm: otherPassword,
    verified: true,
  });
  try {
    const otherAuth = await api(
      "collections/users/auth-with-password",
      "",
      "POST",
      { identity: other.email, password: otherPassword },
    );
    await create(
      otherAuth.token,
      other.id,
      "Secret list",
      doc(task("Not yours", false)),
    );

    await page.goto("/");
    await page.locator('input[name="identity"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await page.waitForURL("**/entries**");

    const entryRow = (title) =>
      page.locator('a[href*="/entries/"]').filter({ hasText: title });
    await expect(entryRow("Groceries")).toContainText("1 open");
    await expect(entryRow("Weekend plans")).toContainText("2 open");

    await page.getByRole("link", { name: "Open tasks", exact: true }).click();
    await page.waitForURL("**/entries/tasks**");
    await expect(
      page.getByRole("heading", { name: "Open tasks", level: 1 }),
    ).toBeVisible();
    const groups = page.locator("section[aria-labelledby^='tasks-']");
    await expect(groups).toHaveCount(2);
    assert.deepEqual(
      await groups.locator("h2").allInnerTexts(),
      ["Weekend plans", "Groceries"],
      "Newest entry first",
    );
    await expect(page.getByRole("checkbox")).toHaveCount(3);
    for (const text of ["Buy oat milk", "Call Sam", "Find charger"])
      await expect(page.getByRole("checkbox", { name: text })).toBeVisible();
    for (const text of ["Eggs", "Pack", "Not yours"])
      await expect(page.getByText(text, { exact: true })).toHaveCount(0);

    // Keyboard: Space on a focused checkbox saves it into the entry.
    const milk = page.getByRole("checkbox", { name: "Buy oat milk" });
    await milk.focus();
    await page.keyboard.press("Space");
    await expect(milk).toHaveCount(0);
    await expect(groups).toHaveCount(1);
    const savedGroceries = await api(
      `collections/entries/records/${groceries.id}`,
      auth.token,
    );
    assert.equal(savedGroceries.body.content[0].attrs.checked, true);
    assert.equal(savedGroceries.open_tasks, 0);
    assert.equal(savedGroceries.revision, 2);

    // An editor tab with unsaved changes keeps its draft when the list ticks the same entry.
    const editorTab = await context.newPage();
    await editorTab.goto(`/entries/${weekend.id}`);
    const editor = editorTab.getByRole("textbox", { name: "Entry body" });
    await editor.click();
    await editorTab.keyboard.press("ControlOrMeta+End");
    await editorTab.keyboard.type(" draft words");
    await editorTab
      .getByRole("status")
      .filter({ hasText: "Unsaved changes" })
      .waitFor();
    await page.getByRole("checkbox", { name: "Call Sam" }).check();
    await expect(page.getByRole("checkbox", { name: "Call Sam" })).toHaveCount(
      0,
    );
    await editorTab.getByRole("button", { name: "Save", exact: true }).click();
    await expect(editorTab.getByRole("alert")).toContainText(
      "A newer version was saved",
    );
    await expect(editor).toContainText("draft words");
    const afterConflict = await api(
      `collections/entries/records/${weekend.id}`,
      auth.token,
    );
    assert.equal(afterConflict.body.content[0].attrs.checked, true);
    assert.ok(!JSON.stringify(afterConflict.body).includes("draft words"));
    await editorTab.close();

    // A list older than the entry refuses the tick instead of overwriting.
    await api(
      `collections/entries/records/${weekend.id}`,
      auth.token,
      "PATCH",
      {
        title: "Weekend plans (edited)",
        revision: afterConflict.revision,
      },
    );
    await page.getByRole("checkbox", { name: "Find charger" }).check();
    await expect(page.getByRole("alert")).toContainText(
      "changed since this list loaded",
    );
    await expect(
      page.getByRole("heading", { name: "Weekend plans (edited)" }),
    ).toBeVisible();
    assert.equal(
      (await api(`collections/entries/records/${weekend.id}`, auth.token))
        .open_tasks,
      1,
    );

    // Dark mode stays legible.
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    for (const locator of [
      page.getByRole("checkbox", { name: "Find charger" }).locator(".."),
      groups.first().locator("h2 a"),
    ])
      assert.ok(
        (await locator.evaluate(contrast)) >= 4.5,
        "Dark mode contrast",
      );
    await page.screenshot({
      path: testInfo.outputPath("tasks-dark.png"),
      fullPage: true,
    });
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark"),
    );

    // Mobile: reachable from the sidebar sheet, no horizontal overflow, empty state once done.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/entries");
    await page.getByRole("button", { name: "Toggle Sidebar" }).first().click();
    await page.getByRole("link", { name: "Open tasks", exact: true }).click();
    await page.waitForURL("**/entries/tasks**");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      "Mobile must not overflow horizontally",
    );
    const charger = page.getByRole("checkbox", { name: "Find charger" });
    const box = await charger.locator("..").boundingBox();
    assert.ok(box.height >= 44, "Touch target at least 44px tall");
    await page.screenshot({
      path: testInfo.outputPath("tasks-mobile.png"),
      fullPage: true,
    });
    await charger.check();
    await expect(page.getByText("No open tasks")).toBeVisible();
    assert.equal(errors.length, 0, errors.join("\n"));
    console.log(
      "PASS: open tasks grouping, ordering, counts, keyboard tick-off, editor conflict, stale list, isolation, dark mode and mobile",
    );
  } finally {
    await api(`collections/users/records/${other.id}`, admin.token, "DELETE");
  }
});
