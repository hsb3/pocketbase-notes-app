const fs = require("node:fs/promises");
const { test, expect, api } = require("./fixtures.cjs");
const {
  button,
  editor,
  doc,
  ownerData,
  seedNote,
  login,
  notePath,
  saved,
  compose,
} = require("./note-helpers.cjs");

const trigger = (p) => button(p, "Note actions");
const rowOf = (p, n) => p.locator('a[href="/notes/' + n.id + '"]');
const rows = (p) =>
  p.getByRole("navigation", { name: "Notes" }).getByRole("link");
const announced = (p, text) =>
  p.getByRole("status").filter({ hasText: new RegExp("^" + text + "$") });
const detail = (o, n) => api(notePath + "/" + n.id, o.token);
const pinAPI = (o, n, pinned) =>
  api("notebook/notes/" + n.id + "/pin", o.token, "POST", { pinned });
const conflict = (p) => button(p, "Reload saved");

async function seedThree(session) {
  const owner = await ownerData(session);
  // Distinct millisecond edit times, so recency never falls back to the random ID.
  const later = () => new Promise((resolve) => setTimeout(resolve, 5));
  const c = await seedNote(owner, doc("Clover oldest"));
  await later();
  const b = await seedNote(owner, doc("Bramble middle"));
  await later();
  const a = await seedNote(owner, doc("Aster newest"));
  return { owner, a, b, c };
}
async function open(p, n) {
  await p.goto("/notes/" + n.id);
  await expect(editor(p)).toContainText(n.title);
}
// Keyboard only: focus the actions button, open the menu, choose the first item.
async function choosePin(p, label) {
  await trigger(p).focus();
  await p.keyboard.press("Enter");
  const item = p.getByRole("menuitem", { name: label, exact: true });
  await expect(item).toBeFocused();
  await p.keyboard.press("Enter");
}
async function capture(p, engine, width, name) {
  await fs.mkdir("/tmp/r7-views", { recursive: true });
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
      path: `/tmp/r7-views/${engine}-${width}-${theme}-${name}.png`,
    });
  }
  await p.emulateMedia({ colorScheme: "light" });
}

for (const [width, height] of [
  [390, 844],
  [810, 1080],
  [1440, 1000],
]) {
  test.describe("Pin at " + width + "px", () => {
    test.use({ viewport: { width, height } });
    const wide = width >= 768;

    test("pin from the note keeps the draft, orders the folder and never conflicts", async ({
      page,
      session,
      browserName,
    }) => {
      const { owner, a, b, c } = await seedThree(session);
      await login(page, session);
      {
        await open(page, c);
        const url = page.url();

        await trigger(page).focus();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("menuitem", { name: "Pin" })).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(trigger(page)).toBeFocused();

        await choosePin(page, "Pin");
        await expect(announced(page, "Pinned.")).toBeAttached();
        await expect(trigger(page)).toBeFocused();
        expect(page.url()).toBe(url);
        if (wide) {
          await expect(rows(page).first()).toHaveAttribute(
            "href",
            "/notes/" + c.id,
            { timeout: 1000 },
          );
          await expect(
            rowOf(page, c).getByRole("img", { name: "Pinned" }),
          ).toBeVisible({ timeout: 1000 });
        }
        const pinned = await detail(owner, c);
        expect(pinned).toMatchObject({ pinned: true, revision: c.revision });
        expect(pinned.updated).toBe(c.updated);

        await editor(page).focus();
        await page.keyboard.press("ControlOrMeta+End");
        await page.keyboard.insertText(" after pin");
        await expect(saved(page)).toBeVisible();
        await expect(conflict(page)).toHaveCount(0);
        expect(await detail(owner, c)).toMatchObject({
          pinned: true,
          revision: c.revision + 1,
        });

        await page.goto("/folders/" + owner.folder);
        await expect(rows(page)).toHaveCount(3);
        const order = await rows(page).evaluateAll((els) =>
          els.map((el) => el.getAttribute("href")),
        );
        expect(order).toEqual([c, a, b].map((n) => "/notes/" + n.id));
        await expect(
          rowOf(page, c).getByRole("img", { name: "Pinned" }),
        ).toBeVisible();
        await expect(
          rowOf(page, a).getByRole("img", { name: "Pinned" }),
        ).toHaveCount(0);
        await capture(page, browserName, width, "folder-pinned");
      }
    });

    test("a pin made on this device never refuses a save already open elsewhere", async ({
      page,
      browser,
      session,
    }) => {
      const { owner, c } = await seedThree(session);
      await login(page, session);
      const second = await browser.newContext({
        baseURL: new URL(page.url()).origin,
      });
      try {
        const other = await second.newPage();
        await login(other, session);
        await open(other, c);
        await open(page, c);
        await choosePin(page, "Pin");
        await expect(announced(page, "Pinned.")).toBeAttached();
        await editor(other).focus();
        await other.keyboard.press("ControlOrMeta+End");
        await other.keyboard.insertText(" typed after the pin");
        await expect(saved(other)).toBeVisible();
        await expect(conflict(other)).toHaveCount(0);
        expect(await detail(owner, c)).toMatchObject({
          pinned: true,
          revision: c.revision + 1,
        });
      } finally {
        await second.close();
      }
    });

    test("Pinned view lists each pin once, unpins, and composes into Notes", async ({
      page,
      session,
      browserName,
    }) => {
      const { owner, a, c } = await seedThree(session);
      const garden = await api(
        "collections/folders/records",
        owner.token,
        "POST",
        {
          user: owner.user,
          name: "Garden",
        },
      );
      const g = await seedNote(
        { ...owner, folder: garden.id },
        doc("Gorse in Garden"),
      );
      await pinAPI(owner, c, true);
      await pinAPI(owner, g, true);
      await login(page, session);
      await page.goto("/folders");
      await page.getByRole("link", { name: "Pinned", exact: true }).click();
      await expect(page).toHaveURL(/\/folders\/pinned$/);
      await expect(rows(page)).toHaveCount(2);
      await expect(rowOf(page, g)).toContainText("Garden");
      await expect(rowOf(page, c)).toContainText("Notes");
      await expect(rowOf(page, a)).toHaveCount(0);
      await capture(page, browserName, width, "pinned-view");

      await rowOf(page, c).click();
      await editor(page).focus();
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.insertText(" edited from Pinned");
      await expect(saved(page)).toBeVisible();
      await page.goto("/folders/pinned");
      await expect(rows(page).first()).toHaveAttribute(
        "href",
        "/notes/" + c.id,
      );

      for (const n of [c, g]) {
        await open(page, n);
        await choosePin(page, "Unpin");
        await expect(announced(page, "Unpinned.")).toBeAttached();
      }
      await page.goto("/folders/pinned");
      await expect(
        page.getByText("No pinned notes", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Pin a note from its actions menu.", { exact: true }),
      ).toBeVisible();
      expect((await detail(owner, c)).folder).toBe(owner.folder);
      await capture(page, browserName, width, "pinned-empty");

      await compose(page);
      await page.keyboard.insertText("Composed from Pinned");
      await expect(saved(page)).toBeVisible();
      const id = new URL(page.url()).pathname.split("/").pop();
      expect(await detail(owner, { id })).toMatchObject({
        folder: owner.folder,
        pinned: false,
      });
    });

    test("a pinned note survives move, delete and restore", async ({
      page,
      session,
    }) => {
      const { owner, c } = await seedThree(session);
      const garden = await api(
        "collections/folders/records",
        owner.token,
        "POST",
        {
          user: owner.user,
          name: "Garden",
        },
      );
      await login(page, session);
      await open(page, c);
      await choosePin(page, "Pin");
      await expect(announced(page, "Pinned.")).toBeAttached();
      const act = async (verb, extra = {}) => {
        const { revision } = await detail(owner, c);
        await api("notebook/notes/" + c.id + "/" + verb, owner.token, "POST", {
          revision,
          ...extra,
        });
      };
      await act("move", { folder: garden.id });
      await page.goto("/folders/" + garden.id);
      await expect(rows(page).first()).toHaveAttribute(
        "href",
        "/notes/" + c.id,
      );
      await expect(
        rowOf(page, c).getByRole("img", { name: "Pinned" }),
      ).toBeVisible();
      await act("delete");
      await page.goto("/folders/pinned");
      await expect(
        page.getByText("No pinned notes", { exact: true }),
      ).toBeVisible();
      await act("restore");
      await page.goto("/folders/pinned");
      await expect(rows(page)).toHaveCount(1);
      await expect(rowOf(page, c)).toContainText("Garden");
    });

    test("a lost pin reply offers Retry and leaves the note pinned once", async ({
      page,
      session,
    }) => {
      const { owner, c } = await seedThree(session);
      await login(page, session);
      await open(page, c);
      const writes = [];
      await page.route(
        "**/api/notebook/notes/" + c.id + "/pin",
        async (route) => {
          const response = await route.fetch();
          writes.push(response.status());
          if (writes.length === 1) await route.abort("failed");
          else await route.fulfill({ response });
        },
      );
      await choosePin(page, "Pin");
      const alert = page
        .getByRole("alert")
        .filter({ hasText: "Could not pin this note. Try again." });
      await expect(alert).toBeVisible();
      expect((await detail(owner, c)).pinned).toBe(true);
      await alert.getByRole("button", { name: "Retry" }).click();
      await expect(announced(page, "Pinned.")).toBeAttached();
      await expect(alert).toHaveCount(0);
      await expect(trigger(page)).toBeFocused();
      expect(writes).toEqual([200, 200]);
      expect(await detail(owner, c)).toMatchObject({
        pinned: true,
        revision: c.revision,
      });
      await expect(conflict(page)).toHaveCount(0);
      await editor(page).focus();
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.insertText(" saved after Retry");
      await expect(saved(page)).toBeVisible();
    });
  });
}
