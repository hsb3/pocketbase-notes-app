const fs = require("node:fs/promises");
const { test, expect, api } = require("./fixtures.cjs");
const {
  back,
  blockRealtime,
  button,
  compose,
  doc,
  editor,
  login,
  notePath,
  ownerData,
  region,
  saved,
  seedNote,
} = require("./note-helpers.cjs");

const trigger = (p) => button(p, "Note actions");
const rowOf = (p, n) => p.locator('a[href="/notes/' + n.id + '"]');
const rows = (p) =>
  p.getByRole("navigation", { name: "Notes" }).getByRole("link");
const headings = (p) =>
  p.getByRole("navigation", { name: "Notes" }).getByRole("heading");
const announced = (p, text) =>
  p.getByRole("status").filter({ hasText: new RegExp("^" + text + "$") });
const detail = (o, n) => api(notePath + "/" + n.id, o.token);
const dateAPI = (o, n, journal_date) =>
  api("notebook/notes/" + n.id + "/date", o.token, "POST", { journal_date });
const conflict = (p) => button(p, "Reload saved");
const dateInput = (p) => p.getByRole("dialog").getByLabel("Journal date");
const filter = (p) => p.getByLabel("Filter by day");
const hrefs = (p) =>
  rows(p).evaluateAll((els) => els.map((el) => el.getAttribute("href")));
const paths = (...notes) => notes.map((n) => "/notes/" + n.id);
// The app shows a day at local noon, so the label never depends on the time zone.
const label = (day) =>
  new Date(day + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
// 11:30 UTC on 21 November is 22 November in Kiritimati (UTC+14) and 21 November in Pago Pago (UTC−11).
const instant = new Date("2026-11-21T11:30:00Z");
const later = () => new Promise((resolve) => setTimeout(resolve, 5));

async function open(p, n) {
  await p.goto("/notes/" + n.id);
  await expect(editor(p)).toContainText(n.title);
}
// Keyboard only: focus the actions button, open the menu, move past Pin to the date item.
async function chooseDate(p, name) {
  await trigger(p).focus();
  await p.keyboard.press("Enter");
  await expect(
    p.getByRole("menuitem", { name: /^(Pin|Unpin)$/ }),
  ).toBeFocused();
  await p.keyboard.press("ArrowDown");
  await expect(p.getByRole("menuitem", { name, exact: true })).toBeFocused();
  await p.keyboard.press("Enter");
  await expect(p.getByRole("dialog", { name: "Journal date" })).toBeVisible();
  await expect(dateInput(p)).toBeFocused();
}
async function setDay(p, day, name = "Add date…") {
  await chooseDate(p, name);
  await dateInput(p).fill(day);
  await p.keyboard.press("Enter");
}
async function noteCount(session) {
  const filter = encodeURIComponent(`user = "${session.account.id}"`);
  return (
    await api(`${notePath}?perPage=1&filter=${filter}`, session.admin.token)
  ).totalItems;
}
async function garden(owner) {
  return api("collections/folders/records", owner.token, "POST", {
    user: owner.user,
    name: "Garden",
  });
}
async function capture(p, engine, width, name) {
  await fs.mkdir("/tmp/r8-views", { recursive: true });
  for (const theme of ["light", "dark"]) {
    await p.emulateMedia({ colorScheme: theme });
    await expect(p.locator("html")).toHaveCSS("color-scheme", theme);
    expect(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await p.screenshot({
      animations: "disabled",
      path: `/tmp/r8-views/${engine}-${width}-${theme}-${name}.png`,
    });
  }
  await p.emulateMedia({ colorScheme: "light" });
}

for (const [width, height] of [
  [390, 844],
  [810, 1080],
  [1440, 1000],
]) {
  test.describe("Journal at " + width + "px", () => {
    test.use({ viewport: { width, height }, locale: "en-US" });
    const wide = width >= 768;

    test("a date from the note actions keeps the draft, fills Journal and never conflicts", async ({
      page,
      session,
      browserName,
    }) => {
      const owner = await ownerData(session);
      const g = await seedNote(
        { ...owner, folder: (await garden(owner)).id },
        doc("Gorse in Garden"),
      );
      const n = await seedNote(owner, doc("Nettle in Notes"));
      await login(page, session);
      await page.clock.setFixedTime(instant);
      await open(page, g);
      const url = page.url();

      await trigger(page).focus();
      await page.keyboard.press("Enter");
      await page.keyboard.press("ArrowDown");
      await expect(
        page.getByRole("menuitem", { name: "Add date…" }),
      ).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(trigger(page)).toBeFocused();

      // Escape and Cancel change nothing and return focus to the actions button.
      await chooseDate(page, "Add date…");
      await expect(dateInput(page)).toHaveValue("2026-11-21");
      await expect(button(page, "Remove date")).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(trigger(page)).toBeFocused();
      await chooseDate(page, "Add date…");
      await button(page, "Cancel").click();
      await expect(trigger(page)).toBeFocused();
      expect((await detail(owner, g)).journal_date).toBe("");

      await setDay(page, "2026-11-20");
      await expect(announced(page, "Date set.")).toBeAttached();
      await expect(trigger(page)).toBeFocused();
      await expect(region(page).getByText(label("2026-11-20"))).toBeVisible({
        timeout: 1000,
      });
      expect(page.url()).toBe(url);
      const dated = await detail(owner, g);
      expect(dated).toMatchObject({
        journal_date: "2026-11-20",
        revision: g.revision,
        updated: g.updated,
      });

      await editor(page).focus();
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.insertText(" after the date");
      await expect(saved(page)).toBeVisible();
      await expect(conflict(page)).toHaveCount(0);
      expect(await detail(owner, g)).toMatchObject({
        journal_date: "2026-11-20",
        revision: g.revision + 1,
      });

      await dateAPI(owner, n, "2026-11-20");
      await page.goto("/folders");
      await page.getByRole("link", { name: "Journal", exact: true }).click();
      await expect(page).toHaveURL(/\/folders\/journal$/);
      await expect(rows(page)).toHaveCount(2);
      await expect(headings(page)).toHaveText([label("2026-11-20")]);
      await expect(rowOf(page, g)).toContainText("Garden");
      await expect(rowOf(page, n)).toContainText("Notes");
      expect(await hrefs(page)).toEqual(paths(g, n));
      await capture(page, browserName, width, "journal-days");
      await page.goto("/folders/" + g.folder);
      await expect(rowOf(page, g)).toBeVisible();

      await open(page, g);
      await chooseDate(page, "Change date…");
      await expect(dateInput(page)).toHaveValue("2026-11-20");
      await expect(page.getByRole("menu")).toHaveCount(0);
      await capture(page, browserName, width, "date-dialog");
      await button(page, "Remove date").click();
      await expect(announced(page, "Date removed.")).toBeAttached();
      await expect(trigger(page)).toBeFocused();
      await expect(region(page).getByText(label("2026-11-20"))).toHaveCount(0);
      expect(await detail(owner, g)).toMatchObject({
        journal_date: "",
        folder: g.folder,
      });
      await page.goto("/folders/journal");
      expect(await hrefs(page)).toEqual(paths(n));
      await dateAPI(owner, n, "");
      await page.reload();
      await expect(
        page.getByText("No journal notes", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Add a date from a note's actions menu.", {
          exact: true,
        }),
      ).toBeVisible();
      await capture(page, browserName, width, "journal-empty");
      await page.goto("/folders/" + g.folder);
      await expect(rowOf(page, g)).toBeVisible();
    });

    test("the day filter lives in the address, and composing from Journal dates the note", async ({
      page,
      session,
      browserName,
    }) => {
      const owner = await ownerData(session);
      const a = await seedNote(owner, doc("Clover oldest day"));
      await later();
      const b1 = await seedNote(owner, doc("Bramble first edit"));
      await later();
      const b2 = await seedNote(owner, doc("Bramble second edit"));
      await later();
      const c = await seedNote(owner, doc("Aster newest day"));
      await dateAPI(owner, a, "2026-11-19");
      await dateAPI(owner, b1, "2026-11-20");
      await dateAPI(owner, b2, "2026-11-20");
      await dateAPI(owner, c, "2026-11-21");
      await login(page, session);
      await page.clock.setFixedTime(instant);
      const count = await noteCount(session);

      await page.goto("/folders/journal");
      await expect(rows(page)).toHaveCount(4);
      expect(await hrefs(page)).toEqual(paths(c, b2, b1, a));
      await expect(headings(page)).toHaveText(
        ["2026-11-21", "2026-11-20", "2026-11-19"].map(label),
      );

      await filter(page).fill("2026-11-20");
      await expect(page).toHaveURL(/\/folders\/journal\?day=2026-11-20$/);
      await expect(rows(page)).toHaveCount(2);
      expect(await hrefs(page)).toEqual(paths(b2, b1));
      await page.reload();
      await expect(filter(page)).toHaveValue("2026-11-20");
      expect(await hrefs(page)).toEqual(paths(b2, b1));
      await rowOf(page, b1).click();
      await expect(editor(page)).toContainText(b1.title);
      await back(page).click();
      await expect(page).toHaveURL(/\/folders\/journal\?day=2026-11-20$/);
      await expect(rows(page)).toHaveCount(2);

      await button(page, "Clear day filter").click();
      await expect(page).toHaveURL(/\/folders\/journal$/);
      await expect(rows(page)).toHaveCount(4);

      await filter(page).fill("2026-11-22");
      await expect(
        page.getByText("No notes on " + label("2026-11-22"), { exact: true }),
      ).toBeVisible();
      await capture(page, browserName, width, "journal-day-empty");
      await button(page, "Clear day").click();
      await expect(rows(page)).toHaveCount(4);

      await page.goto("/folders/journal?day=2026-02-31");
      await expect(rows(page)).toHaveCount(4);
      await expect(filter(page)).toHaveValue("");

      // Search stays global; clearing it returns to the filtered Journal.
      await page.goto("/folders/journal?day=2026-11-20");
      await expect(rows(page)).toHaveCount(2);
      await page.getByRole("searchbox", { name: "Search" }).fill("Clover");
      await page.keyboard.press("Enter");
      await expect(rows(page)).toHaveCount(1);
      await expect(rowOf(page, a)).toBeVisible();
      await page
        .getByRole("search")
        .getByRole("button", { name: "Clear" })
        .click();
      await expect(page).toHaveURL(/\/folders\/journal\?day=2026-11-20$/);
      expect(await hrefs(page)).toEqual(paths(b2, b1));
      await page.goto("/folders/all");
      expect(await noteCount(session)).toBe(count);

      await page.goto("/folders/journal?day=2026-11-20");
      await compose(page);
      await page.keyboard.insertText("Composed on a filtered day");
      await expect(saved(page)).toBeVisible();
      const filtered = new URL(page.url()).pathname.split("/").pop();
      expect(await detail(owner, { id: filtered })).toMatchObject({
        folder: owner.folder,
        journal_date: "2026-11-20",
      });
      await page.goto("/folders/journal");
      await compose(page);
      await page.keyboard.insertText("Composed today");
      await expect(saved(page)).toBeVisible();
      const today = new URL(page.url()).pathname.split("/").pop();
      expect(await detail(owner, { id: today })).toMatchObject({
        folder: owner.folder,
        journal_date: "2026-11-21",
      });
      expect(await noteCount(session)).toBe(count + 2);
    });

    test("a day reads the same in time zones 25 hours apart", async ({
      browser,
      page,
      session,
    }) => {
      const owner = await ownerData(session);
      const n = await seedNote(owner, doc("Kelp from the east"));
      await login(page, session);
      const baseURL = new URL(page.url()).origin;
      const zones = {
        "Pacific/Kiritimati": "2026-11-22",
        "Pacific/Pago_Pago": "2026-11-21",
      };
      const contexts = [];
      try {
        const pages = {};
        for (const timezoneId of Object.keys(zones)) {
          const context = await browser.newContext({
            baseURL,
            timezoneId,
            locale: "en-US",
            viewport: { width, height },
          });
          contexts.push(context);
          const p = await context.newPage();
          await login(p, session);
          await p.clock.setFixedTime(instant);
          pages[timezoneId] = p;
        }
        for (const [timezoneId, day] of Object.entries(zones)) {
          const p = pages[timezoneId];
          await p.goto("/folders/journal");
          await compose(p);
          await p.keyboard.insertText("Today in " + timezoneId);
          await expect(saved(p)).toBeVisible();
          const id = new URL(p.url()).pathname.split("/").pop();
          expect((await detail(owner, { id })).journal_date).toBe(day);
        }
        const east = pages["Pacific/Kiritimati"];
        const west = pages["Pacific/Pago_Pago"];
        await open(east, n);
        await setDay(east, "2026-11-21");
        await expect(announced(east, "Date set.")).toBeAttached();
        expect((await detail(owner, n)).journal_date).toBe("2026-11-21");
        await open(west, n);
        await expect(region(west).getByText(label("2026-11-21"))).toBeVisible();
        for (const p of [east, west]) {
          await p.goto("/folders/journal?day=2026-11-21");
          await expect(rowOf(p, n)).toBeVisible();
          await expect(headings(p)).toHaveText([label("2026-11-21")]);
        }
      } finally {
        for (const context of contexts) await context.close();
      }
    });

    test("a day changed on one device reaches another device's open note and Journal", async ({
      browser,
      page,
      session,
    }) => {
      const owner = await ownerData(session);
      const n = await seedNote(owner, doc("Nettle on two devices"));
      await dateAPI(owner, n, "2026-11-19");
      await login(page, session);
      const second = await browser.newContext({
        baseURL: new URL(page.url()).origin,
        locale: "en-US",
        viewport: { width, height },
      });
      try {
        const other = await second.newPage();
        await login(other, session);
        await other.goto("/folders/journal");
        await rowOf(other, n).click();
        await expect(editor(other)).toContainText(n.title);
        await expect(
          region(other).getByText(label("2026-11-19")),
        ).toBeVisible();
        await open(page, n);
        await setDay(page, "2026-11-20", "Change date…");
        await expect(announced(page, "Date set.")).toBeAttached();
        await expect(region(other).getByText(label("2026-11-20"))).toBeVisible({
          timeout: 2000,
        });
        if (wide)
          await expect(headings(other)).toHaveText([label("2026-11-20")], {
            timeout: 2000,
          });
        await editor(other).focus();
        await other.keyboard.press("ControlOrMeta+End");
        await other.keyboard.insertText(" typed after the new day");
        await expect(saved(other)).toBeVisible();
        await expect(conflict(other)).toHaveCount(0);
        expect(await detail(owner, n)).toMatchObject({
          journal_date: "2026-11-20",
          revision: n.revision + 1,
        });
        if (!wide) {
          await back(other).click();
          await expect(headings(other)).toHaveText([label("2026-11-20")]);
        }
      } finally {
        await second.close();
      }
    });

    test("a lost date reply offers Retry, or settles from the note's own notice", async ({
      page,
      session,
    }) => {
      const owner = await ownerData(session);
      const n = await seedNote(owner, doc("Nettle with a lost reply"));
      const writes = [];
      const p = page;
      await p.route(
        "**/api/notebook/notes/" + n.id + "/date",
        async (route) => {
          const response = await route.fetch();
          writes.push(response.status());
          if (writes.length === 1 || writes.length === 3)
            await route.abort("failed");
          else await route.fulfill({ response });
        },
      );
      // With realtime blocked, only Retry can settle the lost reply.
      await blockRealtime(p);
      await login(p, session);
      await open(p, n);
      await setDay(p, "2026-11-20");
      const alert = p
        .getByRole("alert")
        .filter({ hasText: "Could not change the date. Try again." });
      await expect(alert).toBeVisible();
      expect((await detail(owner, n)).journal_date).toBe("2026-11-20");
      await alert.getByRole("button", { name: "Retry" }).click();
      await expect(announced(p, "Date set.")).toBeAttached();
      await expect(alert).toHaveCount(0);
      await expect(trigger(p)).toBeFocused();
      expect(writes).toEqual([200, 200]);
      expect(await detail(owner, n)).toMatchObject({
        journal_date: "2026-11-20",
        revision: n.revision,
      });
      await expect(conflict(p)).toHaveCount(0);

      // With realtime on, the note's own notice confirms the lost reply.
      await p.unroute("**/api/realtime");
      await p.reload();
      await expect(editor(p)).toContainText(n.title);
      await setDay(p, "2026-11-21", "Change date…");
      await expect(region(p).getByText(label("2026-11-21"))).toBeVisible();
      await expect(alert).toHaveCount(0);
      expect(writes).toEqual([200, 200, 200]);
      expect((await detail(owner, n)).journal_date).toBe("2026-11-21");
      await editor(p).focus();
      await p.keyboard.press("ControlOrMeta+End");
      await p.keyboard.insertText(" saved after the lost reply");
      await expect(saved(p)).toBeVisible();
      await expect(conflict(p)).toHaveCount(0);
    });

    test("a dated note survives move, delete and restore with Journal open", async ({
      page,
      session,
    }) => {
      const owner = await ownerData(session);
      const target = await garden(owner);
      const n = await seedNote(owner, doc("Nettle that travels"));
      await login(page, session);
      await page.goto("/folders/journal");
      await expect(
        page.getByText("No journal notes", { exact: true }),
      ).toBeVisible();
      await dateAPI(owner, n, "2026-11-19");
      await expect(rows(page)).toHaveCount(1);
      const act = async (verb, extra = {}) => {
        const { revision } = await detail(owner, n);
        await api("notebook/notes/" + n.id + "/" + verb, owner.token, "POST", {
          revision,
          ...extra,
        });
      };
      await act("move", { folder: target.id });
      await expect(rowOf(page, n)).toContainText("Garden");
      await act("delete");
      await expect(rows(page)).toHaveCount(0);
      await act("restore");
      await expect(rows(page)).toHaveCount(1);
      await expect(rowOf(page, n)).toContainText("Garden");
      await expect(headings(page)).toHaveText([label("2026-11-19")]);
      expect((await detail(owner, n)).journal_date).toBe("2026-11-19");
    });
  });
}
