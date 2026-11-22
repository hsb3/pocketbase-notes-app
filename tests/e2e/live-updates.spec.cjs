const { test, expect, api } = require("./fixtures.cjs");
const {
  button,
  doc,
  editor,
  latch,
  login,
  notePath,
  ownerData,
  region,
  replaceText,
  saved,
  seedNote,
} = require("./note-helpers.cjs");

const trigger = (p) => button(p, "Note actions");
const announced = (p, text) =>
  p.getByRole("status").filter({ hasText: new RegExp("^" + text + "$") });
const conflictDialog = (p) =>
  p.getByRole("dialog").filter({ hasText: "Save conflict" });
const detail = (o, n) => api(notePath + "/" + n.id, o.token);
const act = (o, n, verb, body) =>
  api("notebook/notes/" + n.id + "/" + verb, o.token, "POST", body);
const save = async (o, n, text) => {
  const { revision } = await detail(o, n);
  return api(notePath + "/" + n.id, o.token, "PATCH", {
    revision,
    body: doc(text),
  });
};
const recordURL = (n) => "**/api/" + notePath + "/" + n.id + "?**";
const live = { timeout: 2000 };
// Modal dialogs hide the editor from role queries; CSS still reaches its text.
const words = (p) => p.locator('[role="textbox"][aria-label="Note"]');

async function setup(page, session, text = "Shared start") {
  const owner = await ownerData(session);
  const garden = await api("collections/folders/records", owner.token, "POST", {
    user: owner.user,
    name: "Garden",
  });
  const note = await seedNote(owner, doc(text));
  await login(page, session);
  await open(page, note);
  return { owner, garden, note };
}
async function open(p, n) {
  await p.goto("/notes/" + n.id);
  await expect(editor(p)).toHaveText(n.title);
}
function countReads(p, n) {
  const reads = [];
  p.on("request", (r) => {
    if (
      r.method() === "GET" &&
      new URL(r.url()).pathname === "/api/" + notePath + "/" + n.id
    )
      reads.push(r.url());
  });
  return reads;
}
// The first PATCH fails in transit: the draft stays dirty with no save running.
async function failFirstSave(p, n) {
  let failed = false;
  await p.route(recordURL(n), (route) => {
    if (route.request().method() !== "PATCH" || failed) return route.continue();
    failed = true;
    return route.abort("failed");
  });
  return () => failed;
}
async function holdFirstSave(p, n) {
  const gate = latch();
  let held = false;
  await p.route(recordURL(n), async (route) => {
    if (route.request().method() !== "PATCH" || held) return route.continue();
    held = true;
    await gate.wait;
    const response = await route.fetch();
    gate.status = response.status();
    await route.fulfill({ response });
  });
  return { gate, held: () => held };
}
async function menuOffers(p, label) {
  await trigger(p).focus();
  await p.keyboard.press("Enter");
  await expect(p.getByRole("menu")).toBeVisible();
  const offered = await p
    .getByRole("menuitem", { name: label, exact: true })
    .isVisible();
  await p.keyboard.press("Escape");
  await expect(p.getByRole("menu")).toHaveCount(0);
  return offered;
}

for (const [width, height] of [
  [390, 844],
  [810, 1080],
  [1440, 1000],
]) {
  test.describe("Live open note at " + width + "px", () => {
    test.use({ viewport: { width, height } });

    test("a clean note takes another device's save and saves on top without a conflict", async ({
      page,
      browser,
      session,
    }) => {
      const { owner, note } = await setup(page, session);
      const second = await browser.newContext({
        baseURL: new URL(page.url()).origin,
        viewport: { width, height },
      });
      try {
        const other = await second.newPage();
        await login(other, session);
        await open(other, note);
        await editor(page).focus();
        await replaceText(other, "Written on A2");
        await expect(saved(other)).toBeVisible();
        await expect(editor(page)).toHaveText("Written on A2", live);
        await expect(saved(page)).toBeVisible();
        await expect(
          announced(page, "Updated from another device."),
        ).toBeAttached();
        await expect(editor(page)).toBeFocused();

        // Own saves are not remote changes: no extra note reads.
        const reads = countReads(page, note);
        await page.keyboard.press("ControlOrMeta+End");
        await page.keyboard.insertText(" then A1");
        await expect(saved(page)).toBeVisible();
        await page.keyboard.insertText(" again");
        await expect(saved(page)).toBeVisible();
        await expect(editor(other)).toHaveText(
          "Written on A2 then A1 again",
          live,
        );
        await page.waitForTimeout(500);
        expect(reads).toEqual([]);
        await expect(conflictDialog(page)).toHaveCount(0);
        await expect(conflictDialog(other)).toHaveCount(0);
        expect(await detail(owner, note)).toMatchObject({
          revision: 4,
          body: doc("Written on A2 then A1 again"),
        });
      } finally {
        await second.close();
      }
    });

    test("unsaved words meet a remote save with the conflict dialog at once", async ({
      page,
      session,
    }) => {
      const { owner, note } = await setup(page, session);
      const failed = await failFirstSave(page, note);
      await replaceText(page, "Local words");
      await expect.poll(failed).toBe(true);
      await expect(button(page, "Retry")).toBeVisible();
      await save(owner, note, "Remote one");
      await expect(conflictDialog(page)).toBeVisible(live);
      await expect(button(page, "Copy draft")).toBeVisible();
      await expect(words(page)).toHaveText("Local words");

      // A further remote save while choosing changes nothing on screen.
      await save(owner, note, "Remote two");
      await page.waitForTimeout(1000);
      await expect(conflictDialog(page)).toBeVisible();
      await expect(words(page)).toHaveText("Local words");
      await button(page, "Reload saved").click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: /reload|replace/i })
        .click();
      await expect(editor(page)).toHaveText("Remote two");
      await expect(saved(page)).toBeVisible();
      expect(await detail(owner, note)).toMatchObject({
        revision: 3,
        body: doc("Remote two"),
      });
    });

    test("a move elsewhere is adopted, clean or with a save in flight", async ({
      page,
      session,
    }) => {
      const { owner, garden, note } = await setup(page, session);
      const url = page.url();
      await act(owner, note, "move", { revision: 1, folder: garden.id });
      await expect(
        region(page).getByText("Garden", { exact: true }),
      ).toBeVisible(live);
      expect(page.url()).toBe(url);
      await editor(page).focus();
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.insertText(" in Garden");
      await expect(saved(page)).toBeVisible();
      await expect(conflictDialog(page)).toHaveCount(0);
      expect(await detail(owner, note)).toMatchObject({
        folder: garden.id,
        revision: 3,
        body: doc("Shared start in Garden"),
      });

      // The PATCH is refused with 409 by the move; the same words land on the new revision.
      const { gate, held } = await holdFirstSave(page, note);
      await page.keyboard.insertText(" and back");
      await expect.poll(held).toBe(true);
      await act(owner, note, "move", { revision: 3, folder: owner.folder });
      gate.release();
      await expect.poll(() => gate.status).toBe(409);
      await expect(saved(page)).toBeVisible();
      await expect(conflictDialog(page)).toHaveCount(0);
      await expect(
        region(page).getByText("Notes", { exact: true }),
      ).toBeVisible();
      expect(await detail(owner, note)).toMatchObject({
        folder: owner.folder,
        revision: 5,
        body: doc("Shared start in Garden and back"),
      });
    });

    test("pin and unpin elsewhere flip the menu and leave saving alone", async ({
      page,
      session,
    }) => {
      const { owner, note } = await setup(page, session);
      await act(owner, note, "pin", { pinned: true });
      await expect.poll(() => menuOffers(page, "Unpin"), live).toBe(true);
      await act(owner, note, "pin", { pinned: false });
      await expect.poll(() => menuOffers(page, "Pin"), live).toBe(true);
      await editor(page).focus();
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.insertText(" pinned twice");
      await expect(saved(page)).toBeVisible();
      await expect(conflictDialog(page)).toHaveCount(0);
      expect(await detail(owner, note)).toMatchObject({
        revision: 2,
        pinned: false,
      });
    });

    test("a delete elsewhere shows the unavailable paths and keeps unsaved words", async ({
      page,
      session,
    }) => {
      const { owner, note } = await setup(page, session);
      await act(owner, note, "delete", { revision: 1 });
      await expect(
        page.getByText("Note unavailable", { exact: true }),
      ).toBeVisible(live);
      await act(owner, note, "restore", { revision: 2 });
      await page.waitForTimeout(1000);
      await expect(
        page.getByText("Note unavailable", { exact: true }),
      ).toBeVisible();

      await open(page, { ...note, title: "Shared start" });
      const failed = await failFirstSave(page, note);
      await replaceText(page, "Words to keep");
      await expect.poll(failed).toBe(true);
      await act(owner, note, "delete", { revision: 3 });
      await expect(button(page, "Copy draft")).toBeVisible(live);
      await expect(editor(page)).toHaveText("Words to keep");
    });

    test("a remote save during a pending move waits for the move to settle", async ({
      page,
      session,
    }) => {
      const { owner, garden, note } = await setup(page, session);
      const gate = latch();
      await page.route(
        "**/api/notebook/notes/" + note.id + "/move",
        async (route) => {
          await gate.wait;
          await route.continue();
        },
      );
      const reads = countReads(page, note);
      await trigger(page).focus();
      await page.keyboard.press("Enter");
      await page.getByRole("menuitem", { name: /Move/ }).click();
      await button(page.getByRole("dialog"), garden.name).click();
      await save(owner, note, "Saved during the move");
      await page.waitForTimeout(1000);
      expect(reads).toEqual([]);
      await expect(words(page)).toHaveText("Shared start");
      gate.release();
      await expect(editor(page)).toHaveText("Saved during the move", live);
      await expect(conflictDialog(page)).toHaveCount(0);
      await expect(saved(page)).toBeVisible();
    });
  });
}
