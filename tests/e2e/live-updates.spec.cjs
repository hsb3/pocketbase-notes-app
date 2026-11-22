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

const listRows = (p) =>
  p.getByRole("navigation", { name: "Notes" }).getByRole("link");
const shown = (p) =>
  listRows(p).evaluateAll((els) => els.map((el) => el.getAttribute("href")));
const searchbox = (p) => p.getByRole("searchbox", { name: "Search" });
async function fresh(owner, view) {
  const filter =
    'deleted = ""' +
    (view === "all"
      ? ""
      : view === "pinned"
        ? " && pinned = true"
        : ' && folder = "' + view + '"');
  const sort = view === "pinned" ? "-updated,-id" : "-pinned,-updated,-id";
  const { items } = await api(
    notePath +
      "?perPage=20&fields=id&filter=" +
      encodeURIComponent(filter) +
      "&sort=" +
      encodeURIComponent(sort),
    owner.token,
  );
  return items.map((n) => "/notes/" + n.id);
}
async function deleteFolder(owner, folder) {
  const { snapshot } = await api(
    "notebook/folders/" + folder.id + "/delete-preview",
    owner.token,
  );
  await api(
    "collections/folders/records/" + folder.id + "?snapshot=" + snapshot,
    owner.token,
    "DELETE",
  );
}
function countLists(p) {
  const reads = [];
  p.on("request", (r) => {
    const url = new URL(r.url());
    if (r.method() === "GET" && url.pathname === "/api/" + notePath)
      reads.push(url.search);
  });
  return reads;
}
// Rows, scroll, focus and typed search text survive the update untouched.
const snapshot = (p) =>
  p.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Notes"]');
    const active = document.activeElement;
    window.liveNav ??= nav;
    return {
      nav: !!nav && nav === window.liveNav,
      scroll: nav?.parentElement?.scrollTop ?? 0,
      top: Math.round(active?.getBoundingClientRect().top ?? 0),
      focus: active?.id || active?.tagName,
      value: active?.value,
      caret: active?.selectionStart,
    };
  });
async function steady(p, change, settled) {
  await p.evaluate(() => {
    window.liveNav = undefined;
  });
  const before = await snapshot(p);
  await change();
  await settled();
  const after = await snapshot(p);
  const { scroll, top, ...rest } = after;
  expect(rest).toEqual({
    nav: before.nav,
    focus: before.focus,
    value: before.value,
    caret: before.caret,
  });
  // Either the offset is unchanged, or the browser's scroll anchoring kept the focused row in place.
  expect(scroll === before.scroll || Math.abs(top - before.top) <= 1).toBe(
    true,
  );
}

for (const [width, height] of [
  [390, 844],
  [810, 1080],
  [1440, 1000],
]) {
  test.describe("Live lists at " + width + "px", () => {
    test.use({ viewport: { width, height: Math.min(height, 700) } });

    test("folder, All Notes, Pinned and search rows follow other devices", async ({
      page,
      session,
    }) => {
      const owner = await ownerData(session);
      const garden = await api(
        "collections/folders/records",
        owner.token,
        "POST",
        { user: owner.user, name: "Garden" },
      );
      const later = () => new Promise((r) => setTimeout(r, 5));
      const filler = [];
      for (let i = 0; i < 18; i++) {
        filler.push(await seedNote(owner, doc("Filler " + i)));
        await later();
      }
      await login(page, session);
      await page.goto("/folders/" + owner.folder);
      await expect(listRows(page)).toHaveCount(18);
      const middle = filler[9];
      await page.locator("#row-" + middle.id).focus();
      await page.evaluate(() => {
        const box = document.querySelector(
          'nav[aria-label="Notes"]',
        ).parentElement;
        box.scrollTop = Math.floor(box.scrollHeight / 3);
      });
      const matches = (view) => async () =>
        expect.poll(() => shown(page), live).toEqual(await fresh(owner, view));

      let note;
      await steady(
        page,
        async () => {
          note = await seedNote(owner, doc("Live arrival"));
        },
        matches(owner.folder),
      );
      await steady(
        page,
        () => save(owner, note, "Live edited\nFresh excerpt"),
        async () => {
          await expect(page.locator("#row-" + note.id)).toContainText(
            "Live edited",
            live,
          );
          await expect(page.locator("#row-" + note.id)).toContainText(
            "Fresh excerpt",
          );
        },
      );
      await steady(
        page,
        () => act(owner, note, "pin", { pinned: true }),
        async () => {
          await matches(owner.folder)();
          await expect(
            page
              .locator("#row-" + note.id)
              .getByRole("img", { name: "Pinned" }),
          ).toBeVisible();
        },
      );
      const moved = filler[0];
      await steady(
        page,
        () => act(owner, moved, "move", { revision: 1, folder: garden.id }),
        matches(owner.folder),
      );
      const removed = filler[1];
      await steady(
        page,
        () => act(owner, removed, "delete", { revision: 1 }),
        matches(owner.folder),
      );
      await steady(
        page,
        () => act(owner, removed, "restore", { revision: 2 }),
        matches(owner.folder),
      );

      for (const view of ["all", "pinned"]) {
        await page.goto("/folders/" + view);
        await expect.poll(() => shown(page)).toEqual(await fresh(owner, view));
        await steady(
          page,
          () => act(owner, filler[5], "pin", { pinned: view === "all" }),
          matches(view),
        );
      }

      await page.goto("/folders/all?q=Lantern");
      await expect(
        page.getByText("No matching notes", { exact: true }),
      ).toBeVisible();
      await seedNote(owner, doc("Lantern one"));
      await expect(listRows(page)).toHaveCount(1, live);
      // Text being typed in Search keeps its value and caret through an update.
      await searchbox(page).focus();
      await page.keyboard.press("End");
      await page.keyboard.insertText(" half");
      await page.keyboard.press("ArrowLeft");
      await steady(
        page,
        () => seedNote(owner, doc("Lantern two")),
        () => expect(listRows(page)).toHaveCount(2, live),
      );
      await expect(searchbox(page)).toHaveValue("Lantern half");
    });

    test("Recently Deleted follows deletes, restores and a folder delete without taking focus", async ({
      page,
      session,
    }) => {
      const owner = await ownerData(session);
      const doomed = await api(
        "collections/folders/records",
        owner.token,
        "POST",
        { user: owner.user, name: "Doomed" },
      );
      const note = await seedNote(owner, doc("Trash me"));
      const members = [];
      for (const text of ["Member one", "Member two"])
        members.push(
          await seedNote({ ...owner, folder: doomed.id }, doc(text)),
        );
      await login(page, session);
      await page.goto("/folders/recently-deleted");
      await expect(
        page.getByText("No recently deleted notes", { exact: true }),
      ).toBeVisible();
      const restoreOf = (title) =>
        page.getByRole("button", { name: "Restore " + title, exact: true });
      const focusBack = () =>
        page.getByRole("link", { name: "Folders" }).first();
      if (width < 768) await focusBack().focus();
      else
        await page
          .getByRole("link", { name: "All Notes", exact: true })
          .focus();
      const focused = () =>
        page.evaluate(() => document.activeElement?.textContent);
      const start = await focused();
      await act(owner, note, "delete", { revision: 1 });
      await expect(restoreOf("Trash me")).toBeVisible(live);
      await act(owner, note, "restore", { revision: 2 });
      await expect(restoreOf("Trash me")).toHaveCount(0, live);
      await deleteFolder(owner, doomed);
      for (const m of members)
        await expect(restoreOf(m.title)).toBeVisible(live);
      expect(await focused()).toBe(start);
    });

    test("a 30-note folder delete settles in at most three list reads", async ({
      page,
      session,
    }) => {
      const owner = await ownerData(session);
      const bulk = await api(
        "collections/folders/records",
        owner.token,
        "POST",
        { user: owner.user, name: "Bulk" },
      );
      for (let i = 0; i < 30; i++)
        await seedNote({ ...owner, folder: bulk.id }, doc("Bulk " + i));
      const keep = await seedNote(owner, doc("Keeper"));
      await login(page, session);
      await expect(listRows(page)).toHaveCount(20);
      const reads = countLists(page);
      await deleteFolder(owner, bulk);
      await expect.poll(() => shown(page), live).toEqual(["/notes/" + keep.id]);
      await page.waitForTimeout(1000);
      expect(reads.length).toBeLessThanOrEqual(3);
      expect(reads.length).toBeGreaterThan(0);
    });

    test("a note deleted and restored elsewhere stays unavailable while the list shows it", async ({
      page,
      session,
    }) => {
      const { owner, note } = await setup(page, session);
      await act(owner, note, "delete", { revision: 1 });
      await expect(
        page.getByText("Note unavailable", { exact: true }),
      ).toBeVisible(live);
      await act(owner, note, "restore", { revision: 2 });
      if (width >= 768)
        await expect(page.locator("#row-" + note.id)).toBeVisible(live);
      await expect(
        page.getByText("Note unavailable", { exact: true }),
      ).toBeVisible();
    });
  });
}
