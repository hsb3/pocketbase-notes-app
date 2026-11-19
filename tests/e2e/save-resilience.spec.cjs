const { api, expect, test } = require("./fixtures.cjs");
const { setTimeout: sleep } = require("node:timers/promises");
const {
  back,
  button,
  compose,
  credentials,
  doc,
  editor,
  latch,
  login,
  logout,
  notePath,
  noteURL,
  openSeed,
  ownerData,
  recordRoutes,
  region,
  reopened,
  replaceText,
  retry,
  retryIfOffered,
  saved,
  secondOwner,
  stored,
  observe,
  events,
  noStaleSaved,
  evidence,
  heldWrite,
} = require("./note-helpers.cjs");

for (const width of [390, 810, 1440]) {
  test.describe(() => {
    test.use({ viewport: { width, height: 900 } });
    test(
      `Failed save at ${width}px`,
      { tag: "@sc003" },
      async ({ page, browser, session }, info) => {
        const { owner, note } = await openSeed(page, session);
        let fail = true;
        const writes = [];
        await page.route(recordRoutes, (route) => {
          if (
            route.request().method() !== "PATCH" ||
            new URL(route.request().url()).pathname !==
              "/api/" + notePath + "/" + note.id
          )
            return route.continue();
          writes.push(route.request().postDataJSON());
          return fail
            ? route.fulfill({ status: 503, json: { message: "Unavailable" } })
            : route.continue();
        });
        await observe(page);
        await replaceText(page, "Retained words");
        await expect
          .poll(async () =>
            (await events(page)).some(
              (e) => e.kind === "reply" && e.value === 503,
            ),
          )
          .toBe(true);
        await stored(owner, note.id, "Before editing", 1);
        await expect.soft(retry(page)).toBeVisible({ timeout: 1300 });
        const log = await events(page);
        const send = log.find((e) => e.kind === "send");
        const input = log
          .filter((e) => e.kind === "input" && e.time <= send.time)
          .at(-1);
        const reply = log.find((e) => e.kind === "reply");
        const shown = log.find((e) => e.kind === "retry" && e.value);
        const pause = send.time - input.time;
        await evidence(info, "SC-002 failure", {
          pauseMs: pause,
          retryMs: shown ? shown.time - reply.time : null,
          log,
        });
        expect(pause).toBeLessThanOrEqual(1000);
        expect(
          shown,
          "Retry appeared in the document header after HTTP 503",
        ).toBeDefined();
        expect(shown.time - reply.time).toBeGreaterThanOrEqual(0);
        expect(shown.time - reply.time).toBeLessThanOrEqual(1000);
        noStaleSaved(log, input.time, Infinity);
        await back(page).click();
        await button(page, "Keep editing").click();
        await expect(page).toHaveURL(noteURL(note.id));
        await expect(editor(page)).toHaveText("Retained words");
        expect(writes).toHaveLength(1);
        fail = false;
        await retry(page).click();
        await expect(saved(page)).toBeVisible();
        expect(writes).toEqual(
          Array(2).fill({ revision: 1, body: doc("Retained words") }),
        );
        await stored(owner, note.id, "Retained words", 2);
        await reopened(browser, page, session, note.id, "Retained words");
      },
    );

    test(`Lost acknowledgement at ${width}px`, { tag: "@sc003" }, async ({
      page,
      browser,
      session,
    }) => {
      const owner = await ownerData(session);
      await login(page, session);
      await compose(page);
      const id = new URL(page.url()).pathname.split("/").pop();
      const reads = [],
        writes = [],
        gate = latch();
      await page.route(recordRoutes, async (route) => {
        const req = route.request(),
          path = new URL(req.url()).pathname;
        if (req.method() === "GET" && path === "/api/" + notePath + "/" + id) {
          const res = await route.fetch();
          if (res.ok()) reads.push((await res.json()).revision);
          return route.fulfill({ response: res });
        }
        if (
          !(
            (req.method() === "POST" && path === "/api/" + notePath) ||
            (req.method() === "PATCH" && path === "/api/" + notePath + "/" + id)
          )
        )
          return route.continue();
        const index = writes.push(req.postDataJSON());
        const res = await route.fetch();
        expect(res.ok()).toBe(true);
        if (index <= 2) {
          await stored(owner, id, index === 1 ? "First" : "Second", index);
          if (index === 2) {
            gate.committed = true;
            await gate.wait;
          }
          return route.abort();
        }
        return route.fulfill({ response: res });
      });
      try {
        await observe(page);
        await replaceText(page, "First");
        await retryIfOffered(page, saved(page));
        await expect(saved(page)).toBeVisible();
        expect(reads).toContain(1);
        await replaceText(page, "Second");
        await expect.poll(() => gate.committed).toBe(true);
        await replaceText(page, "Third");
        await expect(region(page).getByRole("status")).toHaveText(/pending/i);
        gate.release();
        await retryIfOffered(page, saved(page));
        await expect(saved(page)).toBeVisible();
        expect(reads).toContain(2);
        expect(writes.map((w) => w.revision ?? 0)).toEqual([0, 1, 2]);
        expect(writes[0].id).toBe(id);
        await stored(owner, id, "Third", 3);
        const log = await events(page);
        noStaleSaved(
          log,
          log.filter((e) => e.kind === "input").at(-1).time,
          log.filter((e) => e.kind === "reply").at(-1).time,
        );
        await reopened(browser, page, session, id, "Third");
      } finally {
        gate.release();
      }
    });

    test(
      `Retry after further typing at ${width}px`,
      { tag: "@sc003" },
      async ({ page, browser, session }, info) => {
        const owner = await ownerData(session);
        await login(page, session);
        await compose(page);
        const id = new URL(page.url()).pathname.split("/").pop();
        const writes = [],
          reads = [],
          create = latch(),
          patch = latch();
        await page.route(recordRoutes, async (route) => {
          const req = route.request(),
            path = new URL(req.url()).pathname;
          if (
            req.method() === "GET" &&
            path === "/api/" + notePath + "/" + id
          ) {
            const res = await route.fetch();
            reads.push(res.status());
            return route.fulfill({ response: res });
          }
          if (
            !(
              (req.method() === "POST" && path === "/api/" + notePath) ||
              (req.method() === "PATCH" &&
                path === "/api/" + notePath + "/" + id)
            )
          )
            return route.continue();
          writes.push(req.postDataJSON());
          if (writes.length === 1)
            return route.fulfill({
              status: 503,
              json: { message: "Unavailable" },
            });
          return heldWrite(
            page,
            route,
            req.method() === "POST" ? create : patch,
          );
        });
        try {
          await observe(page);
          await replaceText(page, "Refused");
          await expect.poll(() => writes.length).toBe(1);
          expect(writes[0]).toMatchObject({ id, body: doc("Refused") });
          await expect
            .poll(async () =>
              (await events(page)).some(
                (e) => e.kind === "reply" && e.value === 503,
              ),
            )
            .toBe(true);
          await replaceText(page, "Retry these words");
          await sleep(650);
          expect(writes).toHaveLength(1);
          expect((await api(notePath, owner.token)).totalItems).toBe(0);
          await expect(retry(page)).toBeVisible({ timeout: 1500 });
          await retry(page).evaluate((b) => {
            b.click();
            b.click();
          });
          await expect.poll(() => create.start).toBeTruthy();
          expect(reads).toContain(404);
          expect(writes[1]).toMatchObject({
            id,
            body: doc("Retry these words"),
          });
          await expect(region(page).getByRole("status")).toHaveText(/saving/i);
          await replaceText(page, "Newest");
          await expect(region(page).getByRole("status")).toHaveText(/pending/i);
          await sleep(3000);
          create.release();
          await expect.poll(() => patch.start).toBeTruthy();
          expect(writes).toHaveLength(3);
          expect(writes[2]).toEqual({ revision: 1, body: doc("Newest") });
          await expect(saved(page)).toBeHidden();
          patch.release();
          await expect(saved(page)).toBeVisible();
          const log = await events(page);
          const latestInput = log.filter((e) => e.kind === "input").at(-1);
          const finalReply = log.filter((e) => e.kind === "reply").at(-1);
          noStaleSaved(log, latestInput.time, finalReply.time);
          expect(
            log
              .filter(
                (e) =>
                  e.kind === "status" &&
                  e.time >= latestInput.time &&
                  e.time < create.end,
              )
              .every((e) => /^pending$/i.test(e.value)),
          ).toBe(true);
          expect(
            log
              .filter(
                (e) =>
                  e.kind === "status" &&
                  e.time > create.start &&
                  e.time < create.end,
              )
              .every((e) => /^(pending|saving)$/i.test(e.value)),
          ).toBe(true);
          expect(create.end - create.start).toBeGreaterThanOrEqual(3000);
          await evidence(info, "SC-002 delayed response", {
            delayMs: create.end - create.start,
            log,
          });
          await stored(owner, id, "Newest", 2);
          await reopened(browser, page, session, id, "Newest");
        } finally {
          create.release();
          patch.release();
        }
      },
    );
  });
}

async function interruptSession(page, session, note, words) {
  const password = crypto.randomUUID();
  const gate = latch();
  let denied;
  const path = new RegExp("/api/" + notePath + "/" + note.id + "(?:\\?.*)?$");
  const handler = async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    gate.token = route.request().headers().authorization;
    await gate.wait;
    const response = await route.fetch();
    denied = response.status();
    await route.fulfill({ response });
  };
  await page.route(path, handler);
  try {
    await replaceText(page, words);
    await expect.poll(() => Boolean(gate.token)).toBe(true);
    await api(
      "collections/users/records/" + session.account.id,
      session.admin.token,
      "PATCH",
      { password, passwordConfirm: password },
    );
    await expect(
      api("collections/users/auth-refresh", gate.token, "POST"),
    ).rejects.toThrow(/40[134]/);
    gate.release();
    await expect.poll(() => denied).toBeDefined();
    expect([401, 403, 404]).toContain(denied);
    const log = await events(page);
    noStaleSaved(
      log,
      log.filter((e) => e.kind === "input").at(-1).time,
      Infinity,
    );
    await expect(
      editor(page),
      "Private editor stays hidden while signed out",
    ).toBeHidden({ timeout: 2000 });
    const signIn = page
      .getByRole("button", { name: /sign in/i })
      .or(page.getByRole("link", { name: /sign in/i }));
    if (await signIn.count()) await signIn.first().click();
    await expect(page.locator('[name="identity"]')).toBeVisible();
    await expect(page.locator("body")).not.toContainText(words);
    return { ...session, password };
  } finally {
    gate.release();
    await page.unroute(path, handler);
  }
}

for (const width of [390, 810, 1440]) {
  test.describe(() => {
    test.use({ viewport: { width, height: 900 } });
    test(`Expiry during editing at ${width}px`, { tag: "@sc003" }, async ({
      page,
      browser,
      session,
    }) => {
      const { note } = await openSeed(page, session);
      await observe(page);
      const updated = await interruptSession(page, session, note, "Held for A");
      let owner = await ownerData(updated);
      await stored(owner, note.id, "Before editing", 1);
      await credentials(page, updated);
      await expect(page).toHaveURL(noteURL(note.id));
      await expect(editor(page)).toHaveText("Held for A");
      await retry(page).click();
      await expect(saved(page)).toBeVisible();
      await stored(owner, note.id, "Held for A", 2);
      const again = await interruptSession(
        page,
        updated,
        note,
        "Private latest",
      );
      owner = await ownerData(again);
      await secondOwner(session, async (other) => {
        const foreign = await ownerData(other);
        const mutations = [];
        const observeWrites = (r) => {
          if (recordRoutes.test(r.url()) && r.method() !== "GET")
            mutations.push(r);
        };
        page.on("request", observeWrites);
        await credentials(page, other);
        await expect(page).toHaveURL(/\/folders\/all$/);
        await expect(
          page.getByText("No notes yet", { exact: true }),
        ).toBeVisible();
        await expect(page.locator("body")).not.toContainText(
          /Private latest|Held for A/,
        );
        await expect(editor(page)).toHaveCount(0);
        await expect(retry(page)).toHaveCount(0);
        await expect(
          api(notePath + "/" + note.id, foreign.token),
        ).rejects.toThrow(/404/);
        expect((await api(notePath, foreign.token)).totalItems).toBe(0);
        if (width < 768)
          await page
            .getByRole("link", { name: "Folders", exact: true })
            .click();
        await logout(page, other);
        await expect(page.locator('[name="identity"]')).toBeVisible();
        expect(mutations).toHaveLength(0);
        page.off("request", observeWrites);
        await stored(owner, note.id, "Held for A", 2);
      });
      await credentials(page, again);
      await expect(page).toHaveURL(noteURL(note.id));
      await expect(editor(page)).toHaveText("Private latest");
      await retry(page).click();
      await expect(saved(page)).toBeVisible();
      await stored(owner, note.id, "Private latest", 3);
      await reopened(browser, page, again, note.id, "Private latest");
    });

    test(`Two devices, one revision at ${width}px`, { tag: "@sc003" }, async ({
      page,
      browser,
      browserName,
      session,
    }) => {
      const { note, owner } = await openSeed(page, session);
      const winner = await browser.newPage({
        baseURL: new URL(page.url()).origin,
        viewport: { width, height: 900 },
      });
      const hold = latch(),
        writes = [],
        reads = [];
      try {
        await login(winner, session);
        await winner.goto("/notes/" + note.id);
        await expect(editor(winner)).toHaveText("Before editing");
        await page.route(recordRoutes, async (route) => {
          if (
            new URL(route.request().url()).pathname !==
            "/api/" + notePath + "/" + note.id
          )
            return route.continue();
          if (route.request().method() === "PATCH") {
            writes.push(route.request().postDataJSON());
            await hold.wait;
            const response = await route.fetch();
            hold.status = response.status();
            return route.fulfill({ response });
          }
          if (route.request().method() === "GET")
            reads.push(route.request().url());
          return route.continue();
        });
        await observe(page);
        const localFirst = "Local first line " + note.id;
        await replaceText(page, localFirst);
        await page.keyboard.press("Enter");
        await page.keyboard.insertText("Local second line");
        await expect.poll(() => writes.length).toBe(1);
        expect(writes[0].revision).toBe(1);
        await replaceText(winner, "Winner");
        await expect(saved(winner)).toBeVisible();
        await stored(owner, note.id, "Winner", 2);
        hold.release();
        await expect.poll(() => hold.status).toBe(409);
        const dialog = page.getByRole("dialog");
        await expect(
          dialog,
          "A real stale write offers review of both versions",
        ).toBeVisible({ timeout: 2000 });
        expect(reads.length).toBeGreaterThan(0);
        await expect(dialog).toHaveAccessibleName(/\S/);
        await page.bringToFront();
        if (browserName === "chromium") {
          await page
            .context()
            .grantPermissions(["clipboard-read", "clipboard-write"], {
              origin: new URL(page.url()).origin,
            });
        }
        await button(page, "Copy draft").click();
        await expect(page.getByText(/copied/i).first()).toBeVisible();
        const target = await page.evaluateHandle(() => {
          const input = document.createElement("textarea");
          document.querySelector("[role=dialog]").append(input);
          input.focus();
          return input;
        });
        await page.keyboard.press("ControlOrMeta+v");
        await expect
          .poll(() => target.evaluate((el) => el.value))
          .toBe(localFirst + "\nLocal second line");
        await target.evaluate((el) => el.remove());
        await button(page, "Cancel").click();
        await expect(editor(page)).toBeFocused();
        await expect(editor(page).locator(":scope > p")).toHaveText([
          localFirst,
          "Local second line",
        ]);
        const review = page.getByRole("button", { name: /review|conflict/i });
        await review.click();
        await button(page, "Reload saved").click();
        const confirm = page.getByRole("alertdialog");
        await expect(
          confirm.getByRole("button", { name: /cancel|keep/i }),
        ).toBeFocused();
        await page.keyboard.press("Escape");
        await stored(owner, note.id, "Winner", 2);
        if (!(await dialog.isVisible())) await review.click();
        await button(page, "Reload saved").click();
        const before = reads.length;
        await confirm.getByRole("button", { name: /reload|replace/i }).click();
        await expect(editor(page)).toHaveText("Winner");
        expect(reads.length).toBeGreaterThan(before);
        expect(writes).toHaveLength(1);
        await stored(owner, note.id, "Winner", 2);
        const log = await events(page);
        noStaleSaved(
          log,
          log.find((e) => e.kind === "input").time,
          log.find((e) => e.kind === "reply").time,
        );
        await reopened(browser, page, session, note.id, "Winner");
      } finally {
        hold.release();
        await winner.close();
      }
    });
  });
}
