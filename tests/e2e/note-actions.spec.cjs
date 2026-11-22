const fs = require("node:fs/promises");
const { test, expect, api } = require("./fixtures.cjs");
const {
  blockRealtime,
  button,
  editor,
  back,
  doc,
  ownerData,
  seedNote,
  login,
  notePath,
  saved,
  latch,
  secondOwner,
  credentials,
  logout,
} = require("./note-helpers.cjs");

const trigger = (p) => button(p, "Note actions");
const search = (p) => p.getByRole("searchbox", { name: "Search" });
const state = (p) =>
  p.evaluate(() => ({
    url: location.href,
    key: history.state.__TSR_key,
    index: history.state.__TSR_index,
    origin: history.state.origin,
  }));
const detail = (o, n) => api(notePath + "/" + n.id, o.token);
const actionPath = (n, verb) => "notebook/notes/" + n.id + "/" + verb;
const rowOf = (p, n) => p.locator('a[href="/notes/' + n.id + '"]');
const recordURL = (n) => "**/api/" + notePath + "/" + n.id + "?**";
const endpoint = (n, verb) => "**/api/" + actionPath(n, verb);
async function evidence(name, body) {
  await test.info().attach(name, {
    body: JSON.stringify(body),
    contentType: "application/json",
  });
}
async function watchHistory(p) {
  await p.evaluate(() => {
    window.historyWrites = [];
    for (const name of ["replaceState", "pushState"]) {
      const original = history[name];
      history[name] = function (...args) {
        window.historyWrites.push([
          name,
          new URL(args[2] ?? location.href, location.href).pathname,
        ]);
        return original.apply(this, args);
      };
    }
  });
}
async function setup(p, s) {
  const owner = await ownerData(s);
  const dest = await api("collections/folders/records", owner.token, "POST", {
    user: owner.user,
    name: "Travel journal",
  });
  const note = await seedNote(owner, doc("Train journal", "Platform seven"));
  await evidence("Starting owner row", note);
  await login(p, s);
  return { owner, dest, note };
}
async function open(p, n) {
  await p.goto("/notes/" + n.id);
  await expect(editor(p)).toContainText(n.title);
}
async function press(el) {
  await el.focus();
  await el.press("Enter");
}
async function menu(p, verb) {
  await expect(trigger(p)).toBeVisible();
  await press(trigger(p));
  // Pin is the first item since R7.
  await expect(
    p.getByRole("menuitem", { name: "Pin", exact: true }),
  ).toBeFocused();
  await p.keyboard.press("ArrowDown");
  const move = p.getByRole("menuitem", { name: /Move/ });
  await expect(move).toBeFocused();
  if (verb === "delete") {
    await p.keyboard.press("ArrowDown");
    await expect(
      p.getByRole("menuitem", { name: /Delete note/ }),
    ).toBeFocused();
  }
  await p.keyboard.press("Enter");
  return p.getByRole(verb === "move" ? "dialog" : "alertdialog");
}
async function commit(p, verb, dest) {
  const overlay = await menu(p, verb);
  await press(button(overlay, verb === "move" ? dest.name : "Delete note"));
}
async function replaceText(p, text) {
  await editor(p).focus();
  // ProseMirror selects the current textblock before selecting the document.
  await p.keyboard.press("ControlOrMeta+a");
  await p.keyboard.press("ControlOrMeta+a");
  await p.keyboard.insertText(text);
}
async function checkCopy(p, words) {
  const copy = button(p, "Copy draft");
  await expect(copy).toBeFocused();
  await p.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw Error("Clipboard denied");
        },
      },
    }),
  );
  await press(copy);
  await expect(p.getByText(/copy was blocked/i)).toBeVisible();
  await editor(p).focus();
  await p.keyboard.press("ControlOrMeta+a");
  expect(await p.evaluate(() => getSelection().toString())).toBe(words);
}
async function capture(p, engine, width, theme, name) {
  await expect(p.locator("html")).toHaveCSS("color-scheme", theme);
  expect(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  expect(
    await p.evaluate(() => document.activeElement.matches(":focus-visible")),
  ).toBe(true);
  await fs.mkdir("/tmp/r5-views", { recursive: true });
  await expect(p.locator(":focus")).toBeInViewport({ ratio: 1 });
  await p.locator('[role="menu"]').waitFor({ state: "detached" });
  await p.screenshot({
    animations: "disabled",
    path: `/tmp/r5-views/${engine}-${width}-${theme}-${name}.png`,
  });
}
for (const theme of ["light", "dark"]) {
  test(`Delete note confirmation text contrast in ${theme} theme`, async ({
    page,
    session,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    const { note } = await setup(page, session);
    await open(page, note);
    const dialog = await menu(page, "delete");
    await expect(page.locator("html")).toHaveCSS("color-scheme", theme);
    const ratio = await button(dialog, "Delete note").evaluate((element) => {
      const style = getComputedStyle(element);
      const ctx = document.createElement("canvas").getContext("2d");
      function luminance(color) {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = Array.from(ctx.getImageData(0, 0, 1, 1).data, (v) => {
          const c = v / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }
      const bg = luminance(style.backgroundColor);
      const fg = luminance(style.color);
      return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    });
    await evidence("Delete note contrast", { theme, ratio });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
}
for (const [width, height] of [
  [390, 844],
  [810, 1080],
  [1440, 1000],
]) {
  test.describe("Note actions at " + width + "px", () =>
    journeys(width, height),
  );
}

async function directRefusal(p, session, verb) {
  const { owner, dest, note } = await setup(p, session);
  for (const fail of [false, true]) {
    const n = fail ? await seedNote(owner, doc("Second note")) : note;
    await open(p, n);
    const before = await state(p);
    let writes = 0,
      reads = 0;
    const read = recordURL(n);
    await p.route(endpoint(n, verb), async (route) => {
      writes++;
      const prior = await detail(owner, n);
      await api(notePath + "/" + n.id, session.admin.token, "DELETE");
      await expect(detail(owner, n)).rejects.toThrow(/404/);
      await p.route(read, (r) =>
        ++reads === 1 && fail ? r.abort() : r.continue(),
      );
      const response = await route.fetch();
      expect(response.status()).toBe(404);
      await evidence("Genuine refusal", {
        before: prior,
        request: route.request().postDataJSON(),
        status: response.status(),
        reply: await response.json(),
        after: "independent owner GET 404",
      });
      await route.fulfill({ response });
    });
    await commit(p, verb, dest);
    if (fail) {
      await expect(button(p, "Retry")).toBeFocused();
      await replaceText(p, "Words after refusal");
      await press(button(p, "Retry"));
    }
    await expect(
      p.getByText("Note unavailable", { exact: true }),
    ).toBeVisible();
    if (fail) await checkCopy(p, "Words after refusal");
    else await expect(back(p)).toBeFocused();
    expect(await state(p)).toEqual(before);
    expect(writes).toBe(1);
    expect(reads).toBe(fail ? 2 : 1);
  }
}

async function droppedReply(p, session, verb) {
  const { owner, dest, note } = await setup(p, session);
  await open(p, note);
  const before = await state(p);
  let writes = 0,
    reads = 0;
  await p.route(endpoint(note, verb), async (route) => {
    writes++;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await evidence("Committed before dropped reply", {
      before: note,
      request: route.request().postDataJSON(),
      reply: await response.json(),
      after: await detail(owner, note),
    });
    await route.abort();
  });
  await commit(p, verb, dest);
  const check = button(p, "Check again");
  await expect(check).toBeFocused();
  await p.keyboard.press("Tab");
  await expect(button(p, "Close")).toBeFocused();
  await p.keyboard.press("Enter");
  await expect(check).toBeFocused();
  expect(await state(p)).toEqual(before);
  await replaceText(p, "Later words");
  const started = latch(),
    release = latch();
  await p.route(recordURL(note), async (route) => {
    if (++reads === 1) return route.abort();
    const response = await route.fetch();
    started.release();
    await release.wait;
    await route.fulfill({ response });
  });
  await press(check);
  await expect(button(p, "Retry")).toBeFocused();
  await expect(editor(p)).toHaveText("Later words");
  await press(button(p, "Retry"));
  await started.wait;
  await editor(p).focus();
  await p.keyboard.press("ControlOrMeta+End");
  await p.keyboard.insertText(" remain");
  release.release();
  if (verb === "move") {
    await expect(editor(p)).toBeFocused();
    await expect(saved(p)).toBeVisible();
    expect(await detail(owner, note)).toMatchObject({
      revision: 3,
      folder: dest.id,
      body: doc("Later words remain"),
    });
  } else {
    await checkCopy(p, "Later words remain");
    expect(await detail(owner, note)).toMatchObject({
      revision: 2,
      body: note.body,
      deleted: expect.stringMatching(/Z$/),
    });
  }
  expect(await state(p)).toEqual(before);
  expect(writes).toBe(1);
  await evidence("After read-only reconciliation", {
    row: await detail(owner, note),
    history: await state(p),
    writes,
    reads,
  });
}

function journeys(width, height) {
  test.use({ viewport: { width, height } });
  test("keyboard choices, move baseline, delete history and themes", async ({
    page: p,
    session,
    browserName,
  }) => {
    const { owner, dest, note } = await setup(p, session);
    for (const theme of ["light", "dark"]) {
      await p.goto("/folders");
      await press(p.getByRole("button", { name: /Jamie/ }));
      const accountMenu = p.getByRole("menu");
      await expect(accountMenu).toBeVisible();
      const choice = accountMenu.getByRole("menuitemradio", {
        name: theme === "light" ? "Light" : "Dark",
        exact: true,
      });
      await press(choice);
      await expect(choice).toBeChecked();
      await expect(p.locator("html")).toHaveCSS("color-scheme", theme);
      await p.keyboard.press("Escape");
      await p.goto("/folders/" + owner.folder);
      await press(rowOf(p, note));
      await expect(editor(p)).toContainText(note.title);
      const initial = await state(p);
      for (const verb of ["move", "delete"]) {
        const overlay = await menu(p, verb);
        const focus = overlay.getByRole("button", {
          name: verb === "move" ? dest.name : "Cancel",
          exact: true,
        });
        await expect(focus).toBeFocused();
        if (verb === "move")
          await expect(
            overlay.getByRole("button", { name: /Notes/ }),
          ).toBeDisabled();
        else {
          await expect(overlay).toContainText(note.title);
          await expect(overlay).toContainText(/30 days/i);
        }
        for (const name of ["Document", "Note list", "Folders"])
          expect(
            await p.locator('section[aria-label="' + name + '"]').isVisible(),
          ).toBe(name === "Document" || width >= 768);
        await capture(
          p,
          browserName,
          width,
          theme,
          verb === "move" ? "move-sheet" : "delete-note",
        );
        await p.keyboard.press("Escape");
        await expect(trigger(p)).toBeFocused();
        for (const name of verb === "move" ? ["Close", "Cancel"] : ["Cancel"]) {
          await menu(p, verb);
          await press(button(p, name));
          await expect(trigger(p)).toBeFocused();
        }
      }
      expect(await state(p)).toEqual(initial);
      expect(await detail(owner, note)).toEqual(note);
    }
    const initial = await state(p);
    await watchHistory(p);
    await commit(p, "move", dest);
    await expect(editor(p)).toBeFocused();
    expect(await state(p)).toEqual(initial);
    expect(await p.evaluate(() => window.historyWrites)).toEqual([]);
    await evidence("Clean move", {
      before: note,
      after: await detail(owner, note),
      history: await state(p),
    });
    await expect(p.getByRole("region", { name: "Document" })).toContainText(
      dest.name,
    );
    expect(await detail(owner, note)).toMatchObject({
      folder: dest.id,
      revision: 2,
      body: note.body,
    });
    await replaceText(p, "Filed words");
    await expect(saved(p)).toBeVisible();
    expect(await detail(owner, note)).toMatchObject({
      folder: dest.id,
      revision: 3,
      body: doc("Filed words"),
    });
    await press(back(p));
    await expect(search(p)).toBeFocused();
    await expect(rowOf(p, note)).toHaveCount(0);
    await p.goto("/folders/" + dest.id);
    const list = await state(p);
    await press(rowOf(p, note));
    await expect(editor(p)).toContainText("Filed words");
    await commit(p, "delete", dest);
    await expect(search(p)).toBeFocused();
    expect(await state(p)).toEqual(list);
    await expect(rowOf(p, note)).toHaveCount(0);
    expect(await detail(owner, note)).toMatchObject({
      revision: 4,
      deleted: expect.stringMatching(/Z$/),
    });
    await p.goForward();
    await expect(
      p.getByText("Note unavailable", { exact: true }),
    ).toBeVisible();
  });

  test("page two search return, ordinary page clamp and deep delete", async ({
    page: p,
    session,
  }) => {
    const { owner, dest, note } = await setup(p, session);
    for (let i = 0; i < 20; i++)
      await seedNote(owner, doc("Later " + i, "Platform seven"));
    for (let i = 0; i < 18; i++)
      await seedNote(
        { ...owner, folder: dest.id },
        doc("Ticket " + i, "Platform seven"),
      );
    await p.goto("/folders/" + owner.folder + "?q=Platform&sp=2");
    const row = rowOf(p, note);
    await expect(row.locator("mark")).toHaveText("Platform");
    await row.focus();
    const scroll = () =>
      row.evaluate((a) => a.parentElement.parentElement.scrollTop);
    const offset = await scroll();
    expect(offset).toBeGreaterThan(0);
    await press(row);
    await expect(editor(p)).toContainText(note.title);
    const before = await state(p);
    await commit(p, "move", dest);
    await expect(editor(p)).toBeFocused();
    expect(await state(p)).toEqual(before);
    await press(back(p));
    await expect(row).toBeFocused();
    expect(await scroll()).toBe(offset);
    await expect(row).toContainText(dest.name);
    await expect(row.locator("mark")).toHaveText("Platform");
    await api(actionPath(note, "move"), owner.token, "POST", {
      revision: 2,
      folder: owner.folder,
    });
    await p.goto("/folders/" + owner.folder + "?page=2");
    await press(row);
    await expect(editor(p)).toContainText(note.title);
    const full = await state(p);
    await watchHistory(p);
    await commit(p, "move", dest);
    await expect.poll(async () => (await state(p)).origin.page).toBe(1);
    const clamped = await state(p);
    expect(await p.evaluate(() => window.historyWrites)).toEqual([
      ["replaceState", "/notes/" + note.id],
    ]);
    expect(clamped.index).toBe(full.index);
    expect(clamped.url).toBe(full.url);
    await expect(editor(p)).toBeFocused();
    await press(back(p));
    await expect(p).toHaveURL("/folders/" + owner.folder);
    await expect(search(p)).toBeFocused();
    await open(p, note);
    const direct = await state(p);
    await commit(p, "delete", dest);
    await expect(search(p)).toBeFocused();
    await expect(p).toHaveURL("/folders/" + dest.id);
    expect((await state(p)).index).toBe(direct.index);
    expect(await detail(owner, note)).toMatchObject({
      revision: 5,
      deleted: expect.stringMatching(/Z$/),
    });
  });

  for (const verb of ["move", "delete"]) {
    test(
      verb + " direct 404 distinguishes verified absence from failed read",
      async ({ page, session }) => directRefusal(page, session, verb),
    );
    test(
      verb + " dropped reply preserves typing across Close, check and Retry",
      async ({ page, session }) => droppedReply(page, session, verb),
    );
  }

  test("rejected destination, unchanged command and search delete", async ({
    page: p,
    session,
  }) => {
    const { owner, dest, note } = await setup(p, session);
    await p.goto("/folders/all?q=Platform");
    const row = rowOf(p, note);
    await press(row);
    await expect(editor(p)).toContainText(note.title);
    const initial = await state(p);
    await press(trigger(p));
    await expect(
      p.getByRole("menuitem", { name: "Pin", exact: true }),
    ).toBeFocused();
    await p.keyboard.press("Escape");
    await expect(trigger(p)).toBeFocused();
    let overlay = await menu(p, "move");
    await api("collections/folders/records/" + dest.id, owner.token, "DELETE");
    await press(button(overlay, dest.name));
    await expect(overlay.getByRole("alert")).toBeVisible();
    await expect(button(p, "Cancel")).toBeFocused();
    await expect(button(overlay, dest.name)).toHaveCount(0);
    await press(button(p, "Cancel"));
    expect(await detail(owner, note)).toEqual(note);
    let writes = 0;
    await p.route(endpoint(note, "delete"), async (route) => {
      writes++;
      if (writes === 1) return route.abort();
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort();
    });
    await commit(p, "delete", dest);
    await expect(button(p, "Check again")).toBeFocused();
    await press(button(p, "Check again"));
    overlay = p.getByRole("alertdialog", { name: /Delete/ });
    await expect(button(overlay, "Cancel")).toBeFocused();
    expect(await detail(owner, note)).toEqual(note);
    expect(await state(p)).toEqual(initial);
    expect(writes).toBe(1);
    await press(button(overlay, "Delete note"));
    await expect(button(p, "Check again")).toBeFocused();
    await p.keyboard.press("Escape");
    await expect(button(p, "Check again")).toBeFocused();
    await press(button(p, "Check again"));
    await expect(search(p)).toBeFocused();
    await expect(p).toHaveURL("/folders/all?q=Platform");
    await expect(row).toHaveCount(0);
    expect(writes).toBe(2);
    expect(await detail(owner, note)).toMatchObject({
      revision: 2,
      deleted: expect.stringMatching(/Z$/),
      body: note.body,
    });
  });

  test("save choices and in-flight edits serialize before Move", async ({
    page: p,
    session,
  }) => {
    const { owner, dest, note } = await setup(p, session);
    for (const choice of [
      "Keep editing",
      "Save and continue",
      "Discard",
      "In flight",
    ]) {
      const n =
        choice === "Keep editing"
          ? note
          : await seedNote(owner, doc("Original words"));
      await open(p, n);
      const before = await state(p);
      const record = recordURL(n);
      const started = latch(),
        release = latch();
      await p.route(record, async (route) => {
        if (route.request().method() !== "PATCH") return route.continue();
        if (choice !== "In flight")
          return route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({
              data: { body: { code: "validation_invalid" } },
            }),
          });
        const response = await route.fetch();
        started.release();
        await release.wait;
        await route.fulfill({ response });
      });
      await replaceText(p, "Writing " + choice);
      if (choice === "In flight") await started.wait;
      else await expect(button(p, "Retry")).toBeVisible();
      const requests = [];
      p.on("request", (r) => {
        if (r.url().endsWith(actionPath(n, "move")))
          requests.push(r.postDataJSON());
      });
      await commit(p, "move", dest);
      expect(requests).toEqual([]);
      if (choice === "In flight") release.release();
      else {
        const dialog = p.getByRole("alertdialog", {
          name: "Leave this note?",
        });
        await expect(dialog).toBeVisible();
        await p.unroute(record);
        await press(button(dialog, choice));
      }
      await expect(editor(p)).toBeFocused();
      if (choice === "Keep editing") {
        await expect(editor(p)).toHaveText("Writing " + choice);
        expect(requests).toEqual([]);
        expect(await detail(owner, n)).toEqual(n);
      } else {
        const discard = choice === "Discard";
        expect(requests).toEqual([
          { revision: discard ? 1 : 2, folder: dest.id },
        ]);
        expect(await detail(owner, n)).toMatchObject({
          folder: dest.id,
          revision: discard ? 2 : 3,
          body: discard ? n.body : doc("Writing " + choice),
        });
        await expect(editor(p)).toHaveText(
          discard ? "Original words" : "Writing " + choice,
        );
      }
      expect(await state(p)).toEqual(before);
    }
  });

  test("stale command, external delete and a late owner read", async ({
    page: p,
    session,
  }) => {
    // The stale command path needs a device that has not heard of the other writer.
    await blockRealtime(p);
    const { owner, dest, note } = await setup(p, session);
    await open(p, note);
    await api(notePath + "/" + note.id, owner.token, "PATCH", {
      revision: 1,
      body: doc("Another writer"),
    });
    await commit(p, "move", dest);
    await expect(editor(p)).toHaveText("Another writer");
    await expect(trigger(p)).toBeFocused();
    const gate = latch(),
      started = latch();
    await p.route(recordURL(note), async (route) => {
      if (route.request().method() === "PATCH") {
        started.release();
        await gate.wait;
      }
      await route.continue();
    });
    await replaceText(p, "Local words after deletion");
    await started.wait;
    await api(actionPath(note, "delete"), owner.token, "POST", {
      revision: 2,
    });
    gate.release();
    await expect(button(p, "Copy draft")).toBeVisible();
    await expect(saved(p)).toBeHidden();
    await button(p, "Copy draft").focus();
    await checkCopy(p, "Local words after deletion");
    expect(await detail(owner, note)).toMatchObject({
      revision: 3,
      body: doc("Another writer"),
      deleted: expect.stringMatching(/Z$/),
    });
    const n = await seedNote(owner, doc("Private itinerary"));
    await open(p, n);
    await p.route(endpoint(n, "move"), async (r) => {
      expect((await r.fetch()).ok()).toBe(true);
      await r.abort();
    });
    await commit(p, "move", dest);
    await expect(button(p, "Check again")).toBeFocused();
    await p.keyboard.press("Escape");
    const reading = latch(),
      deliver = latch(),
      delivered = latch();
    await p.route(recordURL(n), async (r) => {
      const response = await r.fetch();
      reading.release();
      await deliver.wait;
      await r.fulfill({ response });
      delivered.release();
    });
    await press(button(p, "Check again"));
    await reading.wait;
    await secondOwner(session, async (other) => {
      if (width === 390) {
        await press(back(p));
        await press(p.getByRole("link", { name: "Folders", exact: true }));
      }
      await logout(p, session);
      await credentials(p, other);
      await expect(p).toHaveURL("/folders/all");
      const before = await state(p);
      await search(p).focus();
      deliver.release();
      await delivered.wait;
      await expect(search(p)).toBeFocused();
      await expect(p.getByText("Private itinerary")).toHaveCount(0);
      await expect(button(p, "Check again")).toHaveCount(0);
      expect(await state(p)).toEqual(before);
    });
  });
}
