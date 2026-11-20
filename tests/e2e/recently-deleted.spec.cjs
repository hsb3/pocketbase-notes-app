const fs = require("node:fs/promises");
const { test, expect, api } = require("./fixtures.cjs");
const {
  button,
  credentials,
  doc,
  editor,
  evidence,
  latch,
  login,
  logout,
  notePath,
  ownerData,
  privateImage,
  secondOwner,
  seedNote,
} = require("./note-helpers.cjs");

const folderPath = "collections/folders/records";
const trash = "/folders/recently-deleted";
const trashAPI = "notebook/recently-deleted";
const listRequest = /\/api\/notebook\/recently-deleted(?:\?|$)/;
const previewPath = (folder) =>
  "notebook/folders/" + folder.id + "/delete-preview";
const command = (note, verb) => "notebook/notes/" + note.id + "/" + verb;
const detail = (owner, n) => api(notePath + "/" + n.id, owner.token);
const remove = (owner, n) =>
  api(command(n, "delete"), owner.token, "POST", { revision: n.revision });
const link = (p, name) => p.getByRole("link", { name, exact: true });
const heading = (p) =>
  p.getByRole("heading", { name: "Recently Deleted", exact: true });
const trigger = (p) => p.getByRole("button", { name: /delete folder/i });
const search = (p) => p.getByRole("searchbox", { name: "Search" });
const restores = (p) => p.getByRole("button", { name: /restore/i });
const empty = (p) => p.getByText("No recently deleted notes", { exact: true });
const historyEntry = (p) =>
  p.evaluate(() => ({
    url: location.href,
    key: history.state.__TSR_key,
    index: history.state.__TSR_index,
  }));
const record = (name, fields) => evidence(test.info(), name, fields);
const announcement = (p, text) =>
  p
    .locator(
      '[role="status"], [role="alert"], [aria-live="polite"], [aria-live="assertive"]',
    )
    .filter({ hasText: text })
    .first();

async function activate(p, control) {
  await expect(control).toBeVisible();
  // Exercise the actual tab order, including focus traps and phone-only links.
  for (let i = 0; i < 80; i++) {
    if (await control.evaluate((el) => el === document.activeElement)) {
      await p.keyboard.press("Enter");
      return;
    }
    await p.keyboard.press("Tab");
  }
  throw Error("Control unreachable by Tab: " + control);
}

async function fixture(p, session) {
  const owner = await ownerData(session);
  const garden = await api(folderPath, owner.token, "POST", {
    user: owner.user,
    name: "Garden",
  });
  const note = await seedNote(
    { ...owner, folder: garden.id },
    doc("Garden journal", "Violet crocuses"),
  );
  expect(await detail(owner, note)).toEqual(note);
  await record("Verified starting folder and owner row", { garden, note });
  await login(p, session);
  return { owner, garden, note };
}

async function list(p, folder) {
  await p.goto("/folders");
  await activate(p, link(p, folder.name));
  await expect(
    p.getByRole("heading", { name: folder.name, exact: true }),
  ).toBeVisible();
}
async function openTrash(p) {
  await p.goto("/folders");
  await expect(link(p, "Notes")).toBeVisible();
  await activate(p, link(p, "Recently Deleted"));
  await expect(heading(p)).toBeFocused();
}
async function folderDialog(p) {
  await activate(p, trigger(p));
  const dialog = p.getByRole("alertdialog");
  await expect(button(dialog, "Cancel")).toBeFocused();
  return dialog;
}
const confirm = (dialog) =>
  dialog.getByRole("button", { name: /delete|confirm/i });
const restoreRow = (p, title) =>
  p
    .getByText(title, { exact: true })
    .locator("xpath=ancestor::*[.//time and .//button][1]");
const restore = (p, title) => restores(restoreRow(p, title));

async function peerDelete(owner, folder) {
  const version = await api(previewPath(folder), owner.token);
  await api(
    folderPath + "/" + folder.id + "?snapshot=" + version.snapshot,
    owner.token,
    "DELETE",
  );
}

async function age(session, owner, note, offset) {
  expect(process.env.CONTAINED_TEST).toBe("1");
  expect(note.id).toMatch(/^[a-z0-9]{15}$/);
  expect(["-1 second", "+5 seconds"]).toContain(offset);
  const { affectedRows } = await api("sql", session.admin.token, "POST", {
    query: `UPDATE notes SET deleted=strftime('%Y-%m-%d %H:%M:%fZ','now','-30 days','${offset}') WHERE id='${note.id}' AND deleted>''`,
  });
  expect(affectedRows).toBe(1);
  const aged = await detail(owner, note);
  expect(aged.deleted).not.toBe(note.deleted);
  return aged;
}

async function screenshot(p, engine, width, theme, state) {
  await expect(p.locator("html")).toHaveCSS("color-scheme", theme);
  expect(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await expect(p.locator(":focus-visible")).toBeInViewport({ ratio: 1 });
  for (const pane of ["Document", "Folders"])
    expect(
      await p.locator('section[aria-label="' + pane + '"]').isVisible(),
    ).toBe(width >= 768);
  await expect(editor(p)).toBeHidden();
  await fs.mkdir("/tmp/r5-views", { recursive: true });
  await p.screenshot({
    animations: "disabled",
    path: `/tmp/r5-views/${engine}-${width}-${theme}-${state}.png`,
  });
}

async function deadlines(p, rows) {
  await expect(restores(p)).toHaveCount(rows.length);
  await expect(p.locator("time")).toHaveCount(rows.length);
  for (const [index, note] of rows.entries()) {
    const time = restoreRow(p, note.title).locator("time");
    const instant = new Date(
      Date.parse(note.deleted.replace(" ", "T")) + 30 * 86400000,
    );
    await expect(time).toHaveAttribute("datetime", instant.toISOString());
    await expect(p.locator("time").nth(index)).toHaveAttribute(
      "datetime",
      instant.toISOString(),
    );
    // Accept long/short or numeric local dates, 12/24-hour time and named/offset zones.
    const fmt = (opts) =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        ...opts,
      });
    const part = (key, opts) =>
      fmt(opts)
        .formatToParts(instant)
        .find((s) => s.type === key).value;
    const label = (await time.innerText()).replace(/\s+/g, " ");
    const dates = label.match(/\b\d+\b/g)?.map(Number) || [];
    expect(dates).toContain(Number(part("day", { day: "numeric" })));
    expect(
      dates.some((n) => n === Number(part("month", { month: "numeric" }))) ||
        label.includes(part("month", { month: "short" })),
    ).toBe(true);
    expect(
      ["numeric", "2-digit"].some((year) =>
        dates.includes(Number(part("year", { year }))),
      ),
    ).toBe(true);
    expect(
      [true, false].some((hour12) => {
        const opts = { hour: "numeric", minute: "2-digit", hour12 };
        const hour = Number(part("hour", opts)),
          minute = part("minute", opts);
        return new RegExp("\\b0?" + hour + ":" + minute + "\\b").test(label);
      }),
    ).toBe(true);
    expect(
      [
        "short",
        "long",
        "shortOffset",
        "longOffset",
        "shortGeneric",
        "longGeneric",
      ].some((timeZoneName) =>
        label.includes(part("timeZoneName", { timeZoneName })),
      ),
    ).toBe(true);
    await expect(restore(p, note.title)).toBeEnabled();
  }
}

async function restored(p, owner, before, folder) {
  await activate(p, restore(p, before.title));
  await expect
    .poll(() => detail(owner, before))
    .toMatchObject({
      id: before.id,
      folder: folder.id,
      revision: before.revision + 1,
      deleted: "",
      body: before.body,
      attachments: before.attachments,
    });
  await expect(p.getByText(before.title, { exact: true })).toHaveCount(0);
  await expect(announcement(p, folder.name)).toBeVisible();
  await record("Confirmed restore", {
    before,
    after: await detail(owner, before),
  });
}

function journeys(width, height) {
  test.use({
    viewport: { width, height },
    timezoneId: "America/New_York",
    locale: "en-US",
  });

  test("folder preview, same-count change, two restore destinations and themes", async ({
    page: p,
    session,
    request,
    browserName,
  }) => {
    const { owner, garden, note } = await fixture(p, session);
    const file = await privateImage(request, owner);
    const sibling = await api(folderPath, owner.token, "POST", {
      user: owner.user,
      name: "Archive",
    });
    const single = await seedNote(
      { ...owner, folder: sibling.id },
      doc("Travel diary", "Violet crocuses"),
      [file.id],
    );
    const member = await seedNote(
      { ...owner, folder: garden.id },
      doc("Garden map", "Violet crocuses"),
      [file.id],
    );
    await list(p, { name: "Notes" });
    await expect(trigger(p)).toHaveCount(0);
    await list(p, { name: "All Notes" });
    await expect(trigger(p)).toHaveCount(0);
    await p.goto("/folders/" + garden.id + "?q=violet");
    await expect(
      p.locator('a[href="/notes/' + member.id + '"] mark'),
    ).toBeVisible();
    await expect(trigger(p)).toHaveCount(0);
    await p.goto("/notes/" + member.id);
    await expect(editor(p)).toContainText(member.title);
    await expect(trigger(p)).toHaveCount(0);
    const memberRows = () =>
      Promise.all([detail(owner, note), detail(owner, member)]);
    let writes = 0;
    p.on("request", (r) => {
      if (r.method() === "DELETE") writes++;
    });
    for (const theme of ["light", "dark"]) {
      await p.goto("/folders");
      const account = p.getByRole("button", { name: /Jamie/ });
      await activate(p, account);
      // The theme is only set up here; a click waits for the menu to settle.
      const choice = p.getByRole("menuitemradio", {
        name: theme === "light" ? "Light" : "Dark",
        exact: true,
      });
      await choice.click();
      await expect(p.locator("html")).toHaveCSS("color-scheme", theme);
      if (await choice.isVisible()) await p.keyboard.press("Escape");
      await expect(choice).toBeHidden();
      await expect(account).toBeFocused();
      await activate(p, link(p, garden.name));
      await expect(p.getByRole("heading", { name: garden.name })).toBeVisible();
      const entry = await historyEntry(p);
      const dialog = await folderDialog(p);
      await expect(dialog).toContainText(garden.name);
      await expect(dialog).toContainText(/\b2\b/);
      await expect(dialog).toContainText(/30 days/i);
      await expect(dialog).toContainText(/\bNotes\b/);
      await expect(dialog).toContainText(
        /permanent|cannot be (?:restored|recovered)|won.t be restored/i,
      );
      await screenshot(p, browserName, width, theme, "folder-confirm");
      if (theme === "light") await p.keyboard.press("Escape");
      else await activate(p, button(dialog, "Cancel"));
      await expect(trigger(p)).toBeFocused();
      expect(await historyEntry(p)).toEqual(entry);
      expect(await memberRows()).toEqual([note, member]);
      expect(writes).toBe(0);

      await openTrash(p);
      await expect(empty(p)).toBeVisible();
      await screenshot(p, browserName, width, theme, "trash-empty");
      const active = await detail(owner, single);
      await remove(owner, active);
      await openTrash(p);
      const retained = await detail(owner, single);
      await deadlines(p, [retained]);
      await expect(search(p)).toHaveCount(0);
      await expect(button(p, "Compose")).toHaveCount(0);
      await expect(trigger(p)).toHaveCount(0);
      await expect(p.locator('a[href^="/notes/"]')).toHaveCount(0);
      await screenshot(p, browserName, width, theme, "trash-filled");
      await restored(p, owner, retained, sibling);
      await expect(heading(p)).toBeFocused();
    }

    await list(p, garden);
    const initial = await historyEntry(p);
    const dialog = await folderDialog(p);
    await expect(confirm(dialog)).toBeEnabled();
    const edited = await api(notePath + "/" + note.id, owner.token, "PATCH", {
      revision: note.revision,
      body: doc("Garden journal", "More violets"),
    });
    const stale = p.waitForResponse((r) => r.request().method() === "DELETE");
    await activate(p, confirm(dialog));
    expect((await stale).status()).toBe(409);
    await expect(dialog).toContainText(/changed/i);
    await expect(dialog).toContainText(/\b2\b/);
    await expect(button(dialog, "Cancel")).toBeFocused();
    expect(await memberRows()).toEqual([edited, member]);
    expect(await historyEntry(p)).toEqual(initial);
    expect(writes).toBe(1);
    await activate(p, confirm(dialog));
    await expect(p).toHaveURL("/folders/all");
    await expect(search(p)).toBeFocused();
    expect((await historyEntry(p)).index).toBe(initial.index);
    expect(writes).toBe(2);
    await expect(
      api(folderPath + "/" + garden.id, owner.token),
    ).rejects.toThrow(/404/);
    const after = await memberRows();
    expect(after[0]).toMatchObject({
      revision: edited.revision + 1,
      deleted: expect.stringMatching(/Z$/),
      folder: "",
    });
    expect(after[1]).toMatchObject({
      revision: member.revision + 1,
      deleted: after[0].deleted,
      folder: "",
    });
    await openTrash(p);
    const sorted = after.sort((a, b) => (a.id < b.id ? 1 : -1));
    await deadlines(p, sorted);
    await restored(p, owner, sorted[0], { id: owner.folder, name: "Notes" });
    await expect(restore(p, sorted[1].title)).toBeFocused();
    await restored(p, owner, sorted[1], { id: owner.folder, name: "Notes" });
    await expect(heading(p)).toBeFocused();
    await p.goto("/folders/all?q=Violet");
    for (const n of [note, member, single]) {
      await expect(
        p.locator('a[href="/notes/' + n.id + '"] mark'),
      ).toContainText(/violet/i);
    }
    await expect(
      api(folderPath + "/" + garden.id, owner.token),
    ).rejects.toThrow(/404/);
  });

  test("trash URL, loading, read retry, page traversal and last-row clamp", async ({
    page: p,
    session,
  }) => {
    const { owner, note } = await fixture(p, session);
    await remove(owner, note);
    for (let i = 0; i < 20; i++) {
      const recent = await seedNote(owner, doc("Later entry " + i));
      await remove(owner, recent);
    }
    const expected = await api(trashAPI, owner.token);
    expect(expected.totalItems).toBe(21);
    await p.goto(trash + "?q=violets&sp=2&page=-1");
    await expect(heading(p)).toBeVisible();
    await expect(p).toHaveURL(trash);
    const first = await historyEntry(p);
    const previous = p.getByRole("button", { name: /previous/i });
    const next = p.getByRole("button", { name: /next/i });
    await expect(previous).toBeDisabled();
    await deadlines(
      p,
      await Promise.all(expected.items.map((n) => detail(owner, n))),
    );
    await activate(p, next);
    await expect(p).toHaveURL(trash + "?page=2");
    await expect(heading(p)).toBeFocused();
    const last = await historyEntry(p);
    expect(last.index).toBe(first.index + 1);
    await expect(next).toBeDisabled();
    await activate(p, previous);
    await expect(heading(p)).toBeFocused();
    await expect(p).toHaveURL(trash);
    expect((await historyEntry(p)).index).toBe(last.index + 1);
    await p.goBack();
    await expect(heading(p)).toBeFocused();
    expect(await historyEntry(p)).toEqual(last);
    await p.goBack();
    await expect(heading(p)).toBeFocused();
    expect(await historyEntry(p)).toEqual(first);
    await p.goForward();
    await expect(heading(p)).toBeFocused();
    expect(await historyEntry(p)).toEqual(last);
    const release = latch();
    await p.route(
      listRequest,
      async (route) => {
        await release.wait;
        await route.abort("failed");
      },
      { times: 1 },
    );
    await p.reload({ waitUntil: "domcontentloaded" });
    await expect(
      p
        .getByText(/loading/i)
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    release.release();
    await expect(button(p, "Retry")).toBeFocused();
    await activate(p, button(p, "Retry"));
    await expect(heading(p)).toBeFocused();
    await expect(next).toBeDisabled();
    const retained = await detail(owner, note);
    await deadlines(p, [retained]);
    await restored(p, owner, retained, { id: retained.folder, name: "Garden" });
    await expect(heading(p)).toBeFocused();
    await expect(p).toHaveURL(trash);
    expect((await historyEntry(p)).index).toBe(last.index);
    await expect(restores(p)).toHaveCount(20);
    await expect(next).toBeDisabled();
    const valid = await historyEntry(p);
    const prior = expected.items.at(-2),
      tail = await detail(owner, expected.items.at(-1));
    await restored(p, owner, tail, { id: owner.folder, name: "Notes" });
    await expect(restore(p, prior.title)).toBeFocused();
    expect(await historyEntry(p)).toEqual(valid);
    if (width === 390) {
      await activate(p, link(p, "Folders"));
      await expect(link(p, "Recently Deleted")).toBeFocused();
      await p.goBack();
      await expect(heading(p)).toBeFocused();
    }
  });

  test("fresh decision after 409, authoritative 410 and elapsed deadline", {
    tag: "@ageing",
  }, async ({ page: p, session }) => {
    const { owner, garden, note } = await fixture(p, session);
    await remove(owner, note);
    await openTrash(p);
    await expect(restore(p, note.title)).toBeVisible();
    const before = await detail(owner, note);
    await peerDelete(owner, garden);
    const detached = await detail(owner, note);
    expect(detached).toMatchObject({
      revision: before.revision + 1,
      folder: "",
      deleted: before.deleted,
    });
    const requests = [];
    const path = command(note, "restore");
    p.on("request", (r) => {
      if (r.url().endsWith(path)) requests.push(r.postDataJSON());
    });
    const stale = p.waitForResponse((r) => r.url().endsWith(path));
    const refresh = p.waitForResponse(listRequest);
    await activate(p, restore(p, note.title));
    expect((await stale).status()).toBe(409);
    expect(await (await refresh).json()).toMatchObject({
      items: [{ id: note.id, revision: detached.revision }],
    });
    await expect(announcement(p, "Review its current state.")).toBeVisible();
    await expect(restore(p, note.title)).toBeFocused();
    expect(requests).toEqual([{ revision: before.revision }]);
    expect(await detail(owner, note)).toEqual(detached);
    const expired = await age(session, owner, detached, "-1 second");
    const gone = p.waitForResponse((r) => r.url().endsWith(path));
    await activate(p, restore(p, note.title));
    expect((await gone).status()).toBe(410);
    await expect(p.getByText(/expired|recovery period.*ended/i)).toBeVisible();
    await expect(heading(p)).toBeFocused();
    await expect(empty(p)).toBeVisible();
    expect(requests).toEqual([
      { revision: before.revision },
      { revision: detached.revision },
    ]);
    expect(await detail(owner, note)).toEqual(expired);
    await record("Two refused writes", { before, detached, expired, requests });

    const timer = await seedNote(owner, doc("Deadline near"));
    await remove(owner, timer);
    await age(session, owner, await detail(owner, timer), "+5 seconds");
    // Device time is one day slow. Elapsed timers must still follow the server.
    await p.clock.setFixedTime(new Date(Date.now() - 86400000));
    await p.reload();
    await expect(restore(p, timer.title)).toBeVisible();
    await expect(empty(p)).toBeVisible({ timeout: 12000 });
    expect((await api(trashAPI, owner.token)).totalItems).toBe(0);
  });

  for (const kind of ["restore", "folder"]) {
    test(
      kind + " uncertainty survives missing control, failed check and Retry",
      async ({ page: p, session }) => {
        const { owner, garden, note } = await fixture(p, session);
        const restoring = kind === "restore";
        if (restoring) {
          await remove(owner, note);
          await openTrash(p);
        } else {
          await list(p, garden);
          await folderDialog(p);
        }
        const before = await detail(owner, note);
        const entry = await historyEntry(p);
        const writes = [];
        const path = restoring
          ? command(note, "restore")
          : folderPath + "/" + garden.id;
        await p.route(
          (url) => url.pathname === "/api/" + path,
          async (r) => {
            if (r.request().method() === "GET") return r.fallback();
            const res = await r.fetch();
            writes.push({
              method: r.request().method(),
              status: res.status(),
              payload:
                r.request().postData() || new URL(r.request().url()).search,
            });
            expect(res.status()).toBe(restoring ? 200 : 204);
            await r.abort();
          },
        );
        await activate(
          p,
          restoring
            ? restore(p, note.title)
            : confirm(p.getByRole("alertdialog")),
        );
        const check = button(p, "Check again");
        await expect(check).toBeFocused();
        await p.keyboard.press("Tab");
        await expect(button(p, "Close")).toBeFocused();
        await p.keyboard.press(restoring ? "Enter" : "Escape");
        await expect(check).toBeFocused();
        expect(await historyEntry(p)).toEqual(entry);
        const after = await detail(owner, note);
        expect(after).toMatchObject({
          revision: before.revision + 1,
          body: before.body,
          folder: restoring ? garden.id : "",
          deleted: restoring ? "" : expect.stringMatching(/Z$/),
        });
        // Leave and re-enter in the same SPA so the new owner read removes
        // the initiating row/header without destroying the workspace intent.
        if (width === 390) await activate(p, link(p, "Folders"));
        await activate(p, link(p, "All Notes"));
        if (restoring) {
          if (width === 390) await activate(p, link(p, "Folders"));
          await activate(p, link(p, "Recently Deleted"));
          await expect(empty(p)).toBeVisible();
          await expect(restores(p)).toHaveCount(0);
        } else {
          await p.goBack();
          if (width === 390) await p.goBack();
          await expect(p).toHaveURL("/folders/all");
          await expect(trigger(p)).toHaveCount(0);
        }
        const surviving = await historyEntry(p);
        if (!restoring) expect(surviving.index).toBe(entry.index);
        const recordPath = restoring
          ? notePath + "/" + note.id
          : folderPath + "/" + garden.id;
        const reads = [];
        await p.route(
          (url) => url.pathname === "/api/" + recordPath,
          async (route) => {
            if (route.request().method() !== "GET") return route.fallback();
            if (!reads.length) {
              reads.push("dropped");
              return route.abort();
            }
            const res = await route.fetch();
            reads.push(res.status());
            await route.fulfill({ response: res });
          },
        );
        await activate(p, check);
        await expect(button(p, "Retry")).toBeFocused();
        expect(await historyEntry(p)).toEqual(surviving);
        await activate(p, button(p, "Retry"));
        if (restoring) {
          await expect(announcement(p, garden.name)).toBeVisible();
          await expect(heading(p)).toBeFocused();
        } else {
          await expect(
            p.getByText(/folder is no longer available/i),
          ).toBeVisible();
          await expect(search(p)).toBeFocused();
        }
        expect(await historyEntry(p)).toEqual(surviving);
        expect(reads).toEqual(["dropped", restoring ? 200 : 404]);
        expect(writes).toHaveLength(1);
        expect(await detail(owner, note)).toEqual(after);
        await record("Committed write and read-only reconciliation", {
          before,
          after,
          writes,
          reads,
          entry,
          surviving,
        });
      },
    );

    test(
      kind + " held command receives genuine 404 after a competing removal",
      kind === "restore" ? { tag: "@ageing" } : {},
      async ({ page: p, session }) => {
        const { owner, garden, note } = await fixture(p, session);
        const restoring = kind === "restore";
        if (restoring) {
          await remove(owner, note);
          await openTrash(p);
        } else {
          await list(p, garden);
          await folderDialog(p);
        }
        const before = await detail(owner, note);
        const entry = await historyEntry(p);
        const path = restoring
          ? command(note, "restore")
          : folderPath + "/" + garden.id;
        const subject = restoring
          ? notePath + "/" + note.id
          : folderPath + "/" + garden.id;
        const writes = [];
        let ownerReads = 0,
          refreshes = 0,
          verified = 0;
        p.on("response", (r) => {
          const url = new URL(r.url()).pathname;
          if (
            r.request().method() === "GET" &&
            url === "/api/" + subject &&
            r.status() === 404
          )
            ownerReads++;
          if (r.ok() && url === "/api/collections/users/auth-refresh")
            verified++;
          if (
            writes.length &&
            url === "/api/" + (restoring ? trashAPI : folderPath) &&
            r.ok()
          )
            refreshes++;
        });
        await p.route(
          (url) => url.pathname === "/api/" + path,
          async (r) => {
            if (r.request().method() === "GET") return r.continue();
            if (restoring) {
              await age(session, owner, before, "-1 second");
              await api(subject, session.admin.token, "DELETE");
            } else await peerDelete(owner, garden);
            await expect(api(subject, owner.token)).rejects.toThrow(/404/);
            const res = await r.fetch();
            writes.push({
              method: r.request().method(),
              status: res.status(),
              reply: await res.json(),
            });
            expect(res.status()).toBe(404);
            await r.fulfill({ response: res });
          },
        );
        await activate(
          p,
          restoring
            ? restore(p, note.title)
            : confirm(p.getByRole("alertdialog")),
        );
        await expect(
          p.getByText(
            restoring
              ? /note is no longer available/i
              : /folder is no longer available/i,
          ),
        ).toBeVisible();
        if (restoring) {
          await expect(empty(p)).toBeVisible();
          await expect(heading(p)).toBeFocused();
          expect(await historyEntry(p)).toEqual(entry);
        } else {
          await expect(p).toHaveURL("/folders/all");
          await expect(search(p)).toBeFocused();
          expect((await historyEntry(p)).index).toBe(entry.index);
        }
        expect(ownerReads).toBeGreaterThan(0);
        expect(refreshes).toBeGreaterThan(0);
        expect(verified).toBeGreaterThan(0);
        expect(writes).toHaveLength(1);
        await record("Verified missing after refusal", {
          before,
          writes,
          ownerReads,
          refreshes,
          verified,
          current: await historyEntry(p),
        });
      },
    );
  }

  test("preview failure retries in place and an unchanged snapshot needs another press", async ({
    page: p,
    session,
  }) => {
    const { owner, garden, note } = await fixture(p, session);
    await list(p, garden);
    const entry = await historyEntry(p);
    const release = latch();
    await p.route(
      (url) => url.pathname === "/api/" + previewPath(garden),
      async (r) => {
        await release.wait;
        await r.abort();
      },
      { times: 1 },
    );
    const dialog = await folderDialog(p);
    await expect(confirm(dialog)).toBeDisabled();
    release.release();
    await activate(p, button(dialog, "Retry"));
    await expect(confirm(dialog)).toBeEnabled();
    await p.route(
      (url) => url.pathname === "/api/" + folderPath + "/" + garden.id,
      (r) => (r.request().method() === "DELETE" ? r.abort() : r.continue()),
    );
    let writes = 0;
    p.on("request", (r) => {
      if (r.method() === "DELETE") writes++;
    });
    await activate(p, confirm(dialog));
    const check = button(p, "Check again");
    await expect(check).toBeFocused();
    await activate(p, check);
    await expect(button(dialog, "Cancel")).toBeFocused();
    await expect(confirm(dialog)).toBeEnabled();
    expect(writes).toBe(1);
    expect(await detail(owner, note)).toEqual(note);
    expect(await historyEntry(p)).toEqual(entry);
    await activate(p, button(dialog, "Cancel"));
    await remove(owner, note);
    await openTrash(p);
    const retained = await detail(owner, note);
    let attempts = 0;
    await p.route(
      (url) => url.pathname === "/api/" + command(note, "restore"),
      async (r) => {
        attempts++;
        if (attempts === 1) await r.abort();
        else await r.continue();
      },
    );
    const current = await historyEntry(p);
    await activate(p, restore(p, note.title));
    await expect(check).toBeFocused();
    await activate(p, check);
    await expect(restore(p, note.title)).toBeFocused();
    expect(await historyEntry(p)).toEqual(current);
    expect(await detail(owner, note)).toEqual(retained);
    expect(attempts).toBe(1);
    await restored(p, owner, retained, garden);
    expect(attempts).toBe(2);
  });

  for (const pending of ["trash", "preview"]) {
    test(
      "account switch discards pending " + pending + " reply",
      async ({ page: p, session }) => {
        const { owner, garden, note } = await fixture(p, session);
        await remove(owner, note);
        const isPreview = pending === "preview";
        if (isPreview) await list(p, garden);
        else {
          await p.goto("/folders");
          await expect(link(p, "Notes")).toBeVisible();
        }
        const reading = latch(),
          release = latch(),
          delivered = latch();
        await p.route(
          isPreview
            ? (url) => url.pathname === "/api/" + previewPath(garden)
            : listRequest,
          async (r) => {
            const response = await r.fetch();
            expect(response.ok()).toBe(true);
            const payload = await response.json();
            if (isPreview) expect(payload.name).toBe(garden.name);
            else expect(payload.items.map((n) => n.id)).toContain(note.id);
            reading.release();
            await release.wait;
            await r.fulfill({ response });
            delivered.release();
          },
          { times: 1 },
        );
        if (isPreview) await folderDialog(p);
        else await activate(p, link(p, "Recently Deleted"));
        await reading.wait;
        if (isPreview) {
          const dialog = p.getByRole("alertdialog");
          await expect(dialog.getByRole("status")).toHaveText(
            "Loading preview…",
          );
          await p.keyboard.press("Escape");
          await expect(dialog).toHaveCount(0);
          await expect(trigger(p)).toBeFocused();
        }
        if (width === 390) {
          await activate(p, link(p, "Folders"));
          await expect(
            p.getByRole("region", { name: "Folders", exact: true }),
          ).toBeVisible();
        }
        await secondOwner(session, async (other) => {
          const b = await ownerData(other);
          const bNote = await seedNote(b, doc("Second notebook"));
          await logout(p, session);
          await credentials(p, other);
          await expect(p).toHaveURL("/folders/all");
          await expect(link(p, bNote.title)).toBeVisible();
          await search(p).focus();
          const entry = await historyEntry(p);
          release.release();
          await delivered.wait;
          await expect(search(p)).toBeFocused();
          expect(await historyEntry(p)).toEqual(entry);
          await expect(p.getByText(garden.name, { exact: true })).toHaveCount(
            0,
          );
          await expect(p.getByText(note.title, { exact: true })).toHaveCount(0);
          await expect(button(p, "Check again")).toHaveCount(0);
          await expect(p.getByRole("alertdialog")).toHaveCount(0);
          await openTrash(p);
          await expect(empty(p)).toBeVisible();
          expect((await api(trashAPI, b.token)).totalItems).toBe(0);
          expect((await api(trashAPI, owner.token)).totalItems).toBe(1);
        });
      },
    );
  }

  if (width >= 768) {
    test("dirty wide editor guards departure to Recently Deleted", async ({
      page: p,
      session,
    }) => {
      const { owner, note } = await fixture(p, session);
      await p.goto("/notes/" + note.id);
      await expect(editor(p)).toContainText(note.title);
      await p.route(
        (url) => url.pathname === "/api/" + notePath + "/" + note.id,
        (r) => (r.request().method() === "PATCH" ? r.abort() : r.continue()),
      );
      await editor(p).focus();
      await p.keyboard.press("ControlOrMeta+End");
      await p.keyboard.insertText(" still writing");
      await expect(button(p, "Retry")).toBeVisible();
      const entry = await historyEntry(p);
      await activate(p, link(p, "Recently Deleted"));
      const dialog = p.getByRole("alertdialog", { name: "Leave this note?" });
      await activate(p, button(dialog, "Keep editing"));
      await expect(editor(p)).toBeFocused();
      await expect(editor(p)).toContainText("still writing");
      expect(await historyEntry(p)).toEqual(entry);
      await activate(p, link(p, "Recently Deleted"));
      await activate(p, button(dialog, "Discard"));
      await expect(heading(p)).toBeFocused();
      expect((await historyEntry(p)).index).toBe(entry.index + 1);
      expect(await detail(owner, note)).toEqual(note);
      await p.goBack();
      await expect(editor(p)).toBeFocused();
      await expect(editor(p)).not.toContainText("still writing");
    });
  }
}

for (const [width, height] of [
  [390, 844],
  [810, 1080],
  [1440, 1000],
]) {
  test.describe("Folder recovery at " + width + "px", () =>
    journeys(width, height),
  );
}
