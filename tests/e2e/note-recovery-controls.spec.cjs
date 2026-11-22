const { api, expect, test } = require("./fixtures.cjs");
const { setTimeout: sleep } = require("node:timers/promises");
const {
  back,
  blockRealtime,
  button,
  compose,
  credentials,
  doc,
  editor,
  events,
  evidence,
  heldWrite,
  latch,
  login,
  logout,
  noStaleSaved,
  notePath,
  noteURL,
  observe,
  openSeed,
  ownerData,
  recordRoutes,
  region,
  replaceText,
  retry,
  retryIfOffered,
  saved,
  secondOwner,
  seedNote,
  stored,
} = require("./note-helpers.cjs");

const alertDialog = (page) => page.getByRole("alertdialog");
const noteDetail = (id) =>
  new RegExp("/api/" + notePath + "/" + id + "(?:\\?.*)?$");
const status = (page) => region(page).getByRole("status");
const short = { timeout: 2000 };

for (const problem of ["empty", "oversized"]) {
  test(
    "Retain and repair an " + problem + " saved note",
    async ({ page, session }) => {
      const { owner, note } = await openSeed(page, session);
      const text = problem === "empty" ? "" : "é".repeat(51200);
      const writes = [];
      page.on("request", (r) => {
        if (r.method() === "PATCH" && noteDetail(note.id).test(r.url()))
          writes.push(r.postDataJSON());
      });
      await observe(page);
      await replaceText(page, text);
      await expect(status(page)).toContainText(
        problem === "empty" ? /writ|empty|attachment|blank/i : /100\s*KB/i,
        short,
      );
      await expect(editor(page)).toHaveText(text);
      await expect(saved(page)).toBeHidden();
      expect(writes).toHaveLength(0);
      await stored(owner, note.id, "Before editing", 1);
      await replaceText(page, "Repaired");
      await retry(page).click();
      await expect(saved(page)).toBeVisible();
      expect(writes).toEqual([{ revision: 1, body: doc("Repaired") }]);
      await stored(owner, note.id, "Repaired", 2);
      const log = await events(page);
      noStaleSaved(
        log,
        log.find((e) => e.kind === "input").time,
        log.find((e) => e.kind === "reply").time,
      );
    },
  );
}

test("Confirmed unreadable ID collision keeps words and never creates again", async ({
  page,
  session,
}) => {
  const owner = await ownerData(session);
  await login(page, session);
  await compose(page);
  const id = new URL(page.url()).pathname.split("/").pop();
  await secondOwner(session, async (other) => {
    const foreign = await ownerData(other);
    await api(notePath, foreign.token, "POST", {
      id,
      user: foreign.user,
      folder: foreign.folder,
      body: doc("Foreign"),
    });
    const writes = [],
      reads = [];
    page.on("response", (r) => {
      if (!recordRoutes.test(r.url())) return;
      if (r.request().method() === "POST") writes.push(r);
      if (r.request().method() === "GET" && noteDetail(id).test(r.url()))
        reads.push(r.status());
    });
    await replaceText(page, "Keep local words");
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0].status()).toBe(400);
    expect((await writes[0].json()).data.id.code).toBe("validation_not_unique");
    await retryIfOffered(page, button(page, "Copy draft"));
    await expect.poll(() => reads, short).toContain(404);
    await expect(editor(page)).toHaveText("Keep local words");
    await expect(status(page)).toContainText(/unavailable|access|copy/i);
    await back(page).click();
    await button(page, "Keep editing").click();
    expect(writes).toHaveLength(1);
    expect((await api(notePath, owner.token)).totalItems).toBe(0);
    await stored(foreign, id, "Foreign", 1);
  });
});

test("Removed source keeps editable words and cannot recreate the note", async ({
  page,
  session,
}) => {
  const { owner, note } = await openSeed(page, session);
  await api(notePath + "/" + note.id, session.admin.token, "DELETE");
  const writes = [];
  page.on("request", (r) => {
    if (recordRoutes.test(r.url()) && ["POST", "PATCH"].includes(r.method()))
      writes.push([r.method(), new URL(r.url()).pathname]);
  });
  const denied = page.waitForResponse(
    (r) =>
      r.request().method() === "PATCH" && noteDetail(note.id).test(r.url()),
  );
  await replaceText(page, "Copy this");
  expect((await denied).status()).toBe(404);
  await retryIfOffered(page, button(page, "Copy draft"));
  await expect(status(page)).toContainText(
    /unavailable|no longer|cannot access/i,
    short,
  );
  await expect(button(page, "Copy draft")).toBeVisible();
  await expect(editor(page)).toHaveText("Copy this");
  expect(writes).toEqual([["PATCH", "/api/" + notePath + "/" + note.id]]);
  await expect(saved(page)).toBeHidden();
  await expect(api(notePath + "/" + note.id, owner.token)).rejects.toThrow(
    /404/,
  );
  expect((await api(notePath, owner.token)).totalItems).toBe(0);
});

for (const action of ["denied clipboard", "failed reload"]) {
  test(
    "Conflict preserves both versions after " + action,
    async ({ page, session }) => {
      // A real stale write needs a device that has not heard of the newer save.
      await blockRealtime(page);
      const { owner, note } = await openSeed(page, session);
      await api(notePath + "/" + note.id, owner.token, "PATCH", {
        revision: 1,
        body: doc("Newer"),
      });
      const writes = [];
      page.on("response", (r) => {
        if (
          noteDetail(note.id).test(r.url()) &&
          r.request().method() === "PATCH"
        )
          writes.push(r.status());
      });
      await replaceText(page, "Local");
      await expect.poll(() => writes).toEqual([409]);
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible(short);
      if (action === "denied clipboard") {
        await page.evaluate(() => {
          Object.defineProperty(navigator.clipboard, "writeText", {
            value: async () => {
              throw new DOMException("Denied", "NotAllowedError");
            },
          });
        });
        await button(page, "Copy draft").click();
        await expect(
          page.getByText(/manually|select.*copy|copy.*yourself/i).first(),
        ).toBeVisible();
        await expect(page.getByText(/^copied[!.]?$/i)).toHaveCount(0);
      } else {
        await button(page, "Reload saved").click();
        await page.route(noteDetail(note.id), (r) =>
          r.request().method() === "GET"
            ? r.fulfill({ status: 503, json: { message: "Unavailable" } })
            : r.continue(),
        );
        const failed = page.waitForResponse(
          (r) =>
            noteDetail(note.id).test(r.url()) &&
            r.request().method() === "GET" &&
            r.status() === 503,
        );
        await alertDialog(page)
          .getByRole("button", { name: /reload|replace/i })
          .click();
        await failed;
        await expect(
          page.getByText(/could not|failed|unavailable|unable/i).first(),
        ).toBeVisible();
      }
      await expect(editor(page)).toHaveText("Local");
      await stored(owner, note.id, "Newer", 2);
      expect(writes).toEqual([409]);
    },
  );
}

for (const width of [390, 810, 1440]) {
  test(
    "Healthy delayed acknowledgements preserve pending status at " +
      width +
      "px",
    async ({ page, session }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const { note, owner } = await openSeed(page, session);
      const first = latch(),
        second = latch();
      let writes = 0;
      await page.route(noteDetail(note.id), (r) =>
        r.request().method() === "PATCH"
          ? heldWrite(page, r, ++writes === 1 ? first : second)
          : r.continue(),
      );
      try {
        await observe(page);
        await replaceText(page, "First edit");
        await expect.poll(() => first.start).toBeTruthy();
        await expect(status(page)).toHaveText(/saving/i);
        await replaceText(page, "Second edit");
        await expect(status(page)).toHaveText(/pending/i);
        await sleep(3000);
        first.release();
        await expect.poll(() => second.start).toBeTruthy();
        await expect(saved(page)).toBeHidden();
        second.release();
        await expect(saved(page)).toBeVisible();
        const log = await events(page),
          input = log.find((e) => e.kind === "input"),
          send = log.find((e) => e.kind === "send");
        const pause = send.time - input.time,
          delay = first.end - first.start;
        await evidence(info, "SC-002 healthy", {
          pauseMs: pause,
          delayMs: delay,
          log,
        });
        expect(pause).toBeLessThanOrEqual(1000);
        expect(delay).toBeGreaterThanOrEqual(3000);
        noStaleSaved(
          log,
          input.time,
          log.filter((e) => e.kind === "reply").at(-1).time,
        );
        expect(
          log
            .filter(
              (e) =>
                e.kind === "status" &&
                e.time > send.time &&
                e.time < second.end,
            )
            .every((e) => /^(pending|saving)$/i.test(e.value)),
        ).toBe(true);
        expect(writes).toBe(2);
        await stored(owner, note.id, "Second edit", 3);
      } finally {
        first.release();
        second.release();
      }
    },
  );
}

for (const target of [
  "Back",
  "Forward",
  "other note",
  "folder",
  "Compose",
  "Account",
  "next page",
]) {
  test(
    "Failed draft guards " + target + " and supports keyboard cancellation",
    async ({ page, session }) => {
      const owner = await ownerData(session);
      const note = await seedNote(owner, doc("Editing"));
      const other = await seedNote(owner, doc("Other"));
      if (target === "next page")
        for (let i = 0; i < 19; i++) await seedNote(owner, doc("Row " + i));
      await login(page, session);
      // Use SPA history for Back and Forward. A direct goto would leave the document.
      if (target === "next page") await page.goto("/notes/" + note.id);
      else
        await page.getByRole("link", { name: "Editing", exact: true }).click();
      if (target === "Forward") {
        await page.getByRole("link", { name: "Account", exact: true }).click();
        await page.goBack();
      }
      await expect(editor(page)).toHaveText("Editing");
      await page.route(noteDetail(note.id), (r) =>
        r.request().method() === "PATCH"
          ? r.fulfill({ status: 503, json: { message: "Unavailable" } })
          : r.continue(),
      );
      const failed = page.waitForResponse(
        (r) => noteDetail(note.id).test(r.url()) && r.status() === 503,
      );
      await replaceText(page, "Unsaved");
      await failed;
      if (target === "Back") await page.goBack();
      if (target === "Forward") await page.goForward();
      if (target === "other note")
        await page.locator("#row-" + other.id).click();
      if (target === "folder")
        await page
          .getByRole("navigation", { name: "Folder destinations" })
          .getByRole("link", { name: "Notes", exact: true })
          .click();
      if (target === "Compose") await button(page, "Compose").click();
      if (target === "Account")
        await page.getByRole("link", { name: "Account", exact: true }).click();
      if (target === "next page") await button(page, "Next page").click();
      const choice = alertDialog(page);
      await expect(choice).toBeVisible(short);
      await expect(page).toHaveURL(noteURL(note.id));
      await expect(
        choice.getByRole("button", { name: "Save and continue" }),
      ).toBeVisible();
      await expect(
        choice.getByRole("button", { name: "Discard", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(editor(page)).toBeFocused();
      await expect(editor(page)).toHaveText("Unsaved");
      expect(await api(notePath + "/" + note.id, owner.token)).toMatchObject({
        body: doc("Editing"),
        revision: 1,
      });
    },
  );
}

for (const choice of ["Discard", "Keep editing", "Save and continue"]) {
  test(
    "Dirty sign-out pauses saves until " + choice,
    async ({ page, session }) => {
      await page.emulateMedia({
        colorScheme: choice === "Keep editing" ? "dark" : "light",
      });
      const { owner, note } = await openSeed(page, session);
      const writes = [];
      let fail = choice === "Save and continue";
      await page.route(noteDetail(note.id), (r) => {
        if (r.request().method() !== "PATCH") return r.continue();
        writes.push(r.request().postDataJSON());
        return fail
          ? r.fulfill({ status: 503, json: { message: "Unavailable" } })
          : r.continue();
      });
      await replaceText(page, "On sign-out");
      await logout(page, session);
      await expect(alertDialog(page)).toBeVisible(short);
      await sleep(650);
      expect(writes).toHaveLength(0);
      await stored(owner, note.id, "Before editing", 1);
      await expect(page).toHaveURL(noteURL(note.id));
      await button(page, choice).press("Enter");
      if (choice === "Keep editing") {
        await expect(editor(page)).toBeFocused();
        await expect(saved(page)).toBeVisible();
        await stored(owner, note.id, "On sign-out", 2);
      } else if (choice === "Discard") {
        await expect(page).toHaveURL(/\/auth\/login/);
        expect(writes).toHaveLength(0);
        await stored(owner, note.id, "Before editing", 1);
      } else {
        await expect.poll(() => writes.length).toBe(1);
        await expect(page).toHaveURL(noteURL(note.id));
        await stored(owner, note.id, "Before editing", 1);
        fail = false;
        const resume = button(page, "Save and continue");
        if (await resume.isVisible()) await resume.click();
        else await retry(page).click();
        await expect(page).toHaveURL(/\/auth\/login/);
        expect(writes).toHaveLength(2);
        await stored(owner, note.id, "On sign-out", 2);
      }
    },
  );
}

test("Native leave lets a writer stay, leave, and reload a clean note quietly", async ({
  page,
  session,
}) => {
  const { owner, note } = await openSeed(page, session);
  const decisions = [];
  let stay = true;
  page.on("dialog", async (dialog) => {
    decisions.push(dialog.type());
    if (stay) await dialog.dismiss();
    else await dialog.accept();
  });
  await editor(page).click();
  await page.reload();
  await expect(editor(page)).toHaveText("Before editing");
  expect(decisions).toEqual([]);
  await page.route(noteDetail(note.id), (r) =>
    r.request().method() === "PATCH"
      ? r.fulfill({ status: 503, json: { message: "Unavailable" } })
      : r.continue(),
  );
  await replaceText(page, "Unsaved");
  const reload = () =>
    page.reload({ waitUntil: "commit", timeout: 3000 }).catch((error) => {
      if (!/abort|cancel|timeout|interrupted/i.test(error.message)) throw error;
    });
  await reload();
  expect(decisions).toEqual(["beforeunload"]);
  await expect(editor(page)).toHaveText("Unsaved");
  stay = false;
  await reload();
  await expect(editor(page)).toHaveText("Before editing");
  expect(decisions).toEqual(["beforeunload", "beforeunload"]);
  await stored(owner, note.id, "Before editing", 1);
});

test("A late successful response cannot publish or send A's queued words in B's session", async ({
  page,
  context,
  session,
}) => {
  const { owner, note } = await openSeed(page, session);
  const gate = latch(),
    writes = [];
  await page.route(recordRoutes, async (r) => {
    if (!["PATCH", "POST"].includes(r.request().method())) return r.continue();
    writes.push(r.request().postDataJSON());
    const response = await r.fetch();
    expect(response.ok()).toBe(true);
    gate.ready = true;
    await gate.wait;
    return r.fulfill({ response });
  });
  const tab = await context.newPage();
  try {
    await secondOwner(session, async (other) => {
      await replaceText(page, "Committed before switch");
      await expect.poll(() => gate.ready).toBe(true);
      await replaceText(page, "A queued words");
      await tab.goto("/auth/logout");
      await credentials(tab, other);
      await expect(tab).toHaveURL(/\/folders\/all$/);
      gate.release();
      await expect(page.getByText("No notes yet", { exact: true })).toBeVisible(
        short,
      );
      await expect(page.locator("body")).not.toContainText(
        /Committed before switch|A queued words/,
      );
      await expect(page).toHaveURL(/\/folders\/all$/);
      await sleep(650);
      expect(writes).toHaveLength(1);
      await stored(owner, note.id, "Committed before switch", 2);
      expect(
        (await api(notePath, (await ownerData(other)).token)).totalItems,
      ).toBe(0);
    });
  } finally {
    gate.release();
    await tab.close();
  }
});

test("Clearing a submitted create preserves its committed body until correction", async ({
  page,
  session,
}) => {
  const owner = await ownerData(session);
  await login(page, session);
  await compose(page);
  const id = new URL(page.url()).pathname.split("/").pop();
  const gate = latch(),
    methods = [];
  await page.route(recordRoutes, async (route) => {
    const method = route.request().method();
    if (!["POST", "PATCH"].includes(method)) return route.continue();
    methods.push(method);
    if (method === "POST") return heldWrite(page, route, gate);
    return route.continue();
  });
  try {
    await replaceText(page, "Initially valid");
    await expect.poll(() => gate.start).toBeTruthy();
    await replaceText(page, "");
    gate.release();
    await expect(status(page)).toContainText(/writ|empty|attachment|blank/i);
    expect(methods).toEqual(["POST"]);
    await stored(owner, id, "Initially valid", 1);
    await replaceText(page, "Correction");
    await retry(page).click();
    await expect(saved(page)).toBeVisible();
    await stored(owner, id, "Correction", 2);
  } finally {
    gate.release();
  }
});

test("Dirty sign-out cannot discard a queued edit until the sent write settles", async ({
  page,
  session,
}) => {
  const { owner, note } = await openSeed(page, session);
  const gate = latch(),
    writes = [];
  await page.route(noteDetail(note.id), async (r) => {
    if (r.request().method() !== "PATCH") return r.continue();
    writes.push(r.request().postDataJSON());
    if (writes.length === 1) return heldWrite(page, r, gate);
    return r.continue();
  });
  try {
    await replaceText(page, "Already sent");
    await expect.poll(() => gate.start).toBeTruthy();
    await replaceText(page, "Discard only this");
    await logout(page, session);
    await expect(alertDialog(page)).toBeVisible(short);
    await expect(button(page, "Discard")).toBeDisabled();
    gate.release();
    await expect(button(page, "Discard")).toBeEnabled();
    await button(page, "Discard").click();
    await expect(page).toHaveURL(/\/auth\/login/);
    expect(writes).toHaveLength(1);
    await stored(owner, note.id, "Already sent", 2);
  } finally {
    gate.release();
  }
});

test("Explicit discard leaves a failed ordinary navigation's previous revision intact", async ({
  page,
  session,
}) => {
  const { owner, note } = await openSeed(page, session);
  const writes = [];
  await page.route(noteDetail(note.id), (r) => {
    if (r.request().method() !== "PATCH") return r.continue();
    writes.push(r.request().postDataJSON());
    return r.fulfill({ status: 503, json: { message: "Unavailable" } });
  });
  await replaceText(page, "Discard this edit");
  await back(page).click();
  await expect(alertDialog(page)).toBeVisible(short);
  await button(page, "Discard").click();
  await expect(page).toHaveURL(/\/folders\/all$/);
  expect(writes).toHaveLength(1);
  await stored(owner, note.id, "Before editing", 1);
});
