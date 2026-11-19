const fs = require("node:fs/promises");
const { test, expect, api } = require("./fixtures.cjs");
const {
  back,
  button,
  credentials,
  doc,
  editor,
  latch,
  login,
  logout,
  notePath,
  noteURL,
  ownerData,
  replaceText,
  secondOwner,
  seedNote,
} = require("./note-helpers.cjs");

const pane = (page) => page.getByRole("region", { name: "Note list" });
const field = (page) =>
  pane(page).getByRole("searchbox", { name: "Search", exact: true });
const rows = (page) => pane(page).locator('a[href^="/notes/"]');
const marks = (page) => rows(page).locator("mark");
const ids = (page) =>
  rows(page).evaluateAll((links) => links.map((a) => a.pathname.slice(7)));
const index = (page) => page.evaluate(() => history.state.__TSR_index);
const scroll = (page) =>
  rows(page)
    .first()
    .evaluate((a) => a.parentElement.parentElement.scrollTop);
const listRequest = /\/api\/collections\/notes\/records\?/;
async function submit(page, q) {
  await expect(field(page)).toBeVisible({ timeout: 2500 });
  await field(page).fill(q);
  await field(page).press("Enter");
}
async function activate(control) {
  await control.focus();
  await control.press("Enter");
}
async function confirmStored(owner, id, body, revision) {
  expect(await api(notePath + "/" + id, owner.token)).toMatchObject({
    id,
    user: owner.user,
    body,
    revision,
  });
}
async function fixture(page, session, count) {
  const owner = await ownerData(session);
  const notes = [];
  for (let n = 0; n < count; n++) {
    notes.push(
      await seedNote(
        owner,
        doc("Garden log " + n, "Garden observations " + "vellum".repeat(24)),
      ),
    );
  }
  await login(page, session);
  await page.goto("/folders/" + owner.folder + "?page=2");
  await submit(page, "Garden");
  await expect(marks(page)).toHaveCount(20);
  return { owner, notes };
}
async function pageTwo(page) {
  await activate(button(page, "Next page"));
  await expect(page).toHaveURL(/sp=2/);
  await expect(marks(page)).toHaveCount(20);
}
async function originRow(page) {
  const row = rows(page).nth(15);
  await row.focus();
  await row.evaluate((a) => a.scrollIntoView({ block: "center" }));
  const origin = {
    ids: await ids(page),
    url: page.url(),
    scroll: await scroll(page),
    idx: await index(page),
  };
  expect(origin.scroll).toBeGreaterThan(0);
  origin.id = origin.ids[15];
  await row.press("Enter");
  await expect(page).toHaveURL(noteURL(origin.id));
  await expect(editor(page)).toBeVisible();
  return origin;
}
async function assertReturn(page, origin) {
  await expect(page).toHaveURL(origin.url);
  await expect(field(page)).toHaveValue("Garden");
  await expect.poll(() => ids(page)).toEqual(origin.ids);
  await expect(rows(page).nth(15)).toBeFocused();
  expect(await scroll(page)).toBe(origin.scroll);
  expect(await index(page)).toBe(origin.idx);
}
async function screenshot(page, engine, width, theme, state) {
  const directory = "/tmp/r4-search-views";
  await fs.mkdir(directory, { recursive: true });
  await page.screenshot({
    path: `${directory}/${engine}-${width}-${theme}-${state}.png`,
  });
}
function contrast(mark) {
  const ctx = document.createElement("canvas").getContext("2d");
  function luminance(css) {
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data]
      .slice(0, 3)
      .reduce((sum, byte, i) => {
        const c = byte / 255;
        return (
          sum +
          [0.2126, 0.7152, 0.0722][i] *
            (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
        );
      }, 0);
  }
  const style = getComputedStyle(mark);
  const a = luminance(style.color),
    b = luminance(style.backgroundColor);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

for (const [width, height] of [
  [390, 844],
  [810, 1080],
  [1440, 1000],
]) {
  test.describe(`Search at ${width}px`, () => {
    test.use({ viewport: { width, height } });
    test("cross-folder matches, direct links, clear and responsive themes", async ({
      page,
      session,
      browserName,
    }) => {
      const owner = await ownerData(session);
      const folder = await api(
        "collections/folders/records",
        owner.token,
        "POST",
        { user: owner.user, name: "Field observations" },
      );
      const originFolder = await api(
        "collections/folders/records",
        owner.token,
        "POST",
        {
          user: owner.user,
          name: "Reading",
        },
      );
      const title = "Garden pages";
      const note = await seedNote(
        { ...owner, folder: folder.id },
        doc(title, "x".repeat(180) + " <b>cafe\u0301</b> 001 5%_ Жук"),
      );
      const fallback = await seedNote(
        owner,
        doc("Long run", "q" + "\u0301".repeat(160) + "\u0300 lantern"),
      );
      await login(page, session);
      const q = "CAFÉ";
      for (const [theme, path] of [
        ["light", "/folders/" + originFolder.id],
        ["dark", "/folders/all"],
      ]) {
        await page.emulateMedia({ colorScheme: theme });
        await page.goto(path);
        await submit(page, q);
        const row = rows(page);
        await expect(row).toHaveCount(1);
        await expect(row).toHaveAttribute("href", "/notes/" + note.id);
        await expect(row).toContainText(title);
        await expect(row).toContainText(folder.name);
        await expect(row).toContainText("<b>cafe\u0301</b>");
        await expect(row.locator("b")).toHaveCount(0);
        await expect(marks(page)).toHaveText("cafe\u0301");
        expect(await marks(page).evaluate(contrast)).toBeGreaterThanOrEqual(
          4.5,
        );
        await expect(page.locator("html")).toHaveCSS("color-scheme", theme);
        const input = await field(page).boundingBox();
        const compose = await button(page, "Compose").boundingBox();
        const port = await row.evaluate((a) =>
          a.parentElement.parentElement.getBoundingClientRect().toJSON(),
        );
        if (width === 390) {
          expect(input.y).toBeGreaterThanOrEqual(port.bottom);
          expect(compose.y).toBeGreaterThanOrEqual(port.bottom);
          expect(input.x + input.width).toBeLessThanOrEqual(compose.x);
        } else expect(input.y + input.height).toBeLessThanOrEqual(port.top);
        await expect(field(page)).toBeInViewport({ ratio: 1 });
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth,
          ),
        ).toBe(true);
        await field(page).press("Tab");
        await page.keyboard.press("Shift+Tab");
        await expect(field(page)).toBeFocused();
        expect(
          await field(page).evaluate(
            (el) =>
              el.matches(":focus-visible") &&
              (getComputedStyle(el).boxShadow !== "none" ||
                getComputedStyle(el).outlineStyle !== "none"),
          ),
        ).toBe(true);
        await screenshot(page, browserName, width, theme, "filled");
        await submit(page, "no such phrase");
        await expect(
          page.getByText("No matching notes", { exact: true }),
        ).toBeVisible();
        await screenshot(page, browserName, width, theme, "empty");
        await activate(button(page, "Clear"));
        await expect(page).toHaveURL(path);
        await expect(field(page)).toBeFocused();
      }
      for (const [q, match] of [
        ["001", "001"],
        ["5%_", "5%_"],
        ["жук", "Жук"],
      ]) {
        await submit(page, q);
        await expect(marks(page)).toHaveText(match);
        await page.reload();
        await expect(field(page)).toHaveValue(q);
        await expect(marks(page)).toHaveText(match);
      }
      for (const [query, expected] of [
        ["q=false", "false"],
        ["q=42", "42"],
        ["q=a&q=b", ""],
        ["q=%7B%22x%22%3A1%7D", ""],
        ["q=a%0Ab", ""],
        ["q=" + encodeURIComponent("🌱".repeat(161)), "🌱".repeat(160)],
      ]) {
        await page.goto("/folders/all?" + query);
        await expect(field(page)).toHaveValue(expected);
      }
      await page.goto("/folders/all?q=001&sp=40");
      await expect(marks(page)).toHaveText("001");
      await expect
        .poll(() => new URL(page.url()).searchParams.has("sp"))
        .toBe(false);
      await submit(page, "\u034f");
      await expect(rows(page)).toHaveAttribute("href", "/notes/" + fallback.id);
      await expect(rows(page)).toContainText(
        "Long run\nq" + "\u0301".repeat(22) + "…",
      );
      await expect(marks(page)).toHaveCount(0);
      await submit(page, "");
      await expect(page).toHaveURL("/folders/all");
      await page.goto("/notes/" + note.id);
      await expect(editor(page)).toBeVisible();
      await back(page).click();
      await expect(page).toHaveURL("/folders/" + folder.id);
    });

    test("result pages restore scroll, exact rows and focus with either Back", async ({
      page,
      session,
    }) => {
      const { owner } = await fixture(page, session, 40);
      await pageTwo(page);
      for (const traversal of ["editor", "browser"]) {
        const origin = await originRow(page);
        if (traversal === "editor") await back(page).click();
        else await page.goBack();
        await assertReturn(page, origin);
      }
      if (width >= 768) {
        const origin = await originRow(page);
        const prior = await index(page);
        await field(page).fill("missing");
        await expect(page).toHaveURL(noteURL(origin.id));
        await expect(marks(page)).toHaveCount(20);
        await field(page).press("Enter");
        await expect(page.getByText("No matching notes")).toBeVisible();
        expect(await index(page)).toBe(prior + 1);
        await page.goBack();
        await expect(page).toHaveURL(noteURL(origin.id));
        await back(page).click();
        await assertReturn(page, origin);
      }
      await submit(page, "missing");
      await expect(page.getByText("No matching notes")).toBeVisible();
      await activate(button(page, "Clear"));
      await expect(page).toHaveURL("/folders/" + owner.folder + "?page=2");
      await expect(field(page)).toBeFocused();
    });

    test("late responses, failed reads and account switch", async ({
      page,
      session,
    }) => {
      const owner = await ownerData(session);
      const a = await api("collections/folders/records", owner.token, "POST", {
        user: owner.user,
        name: "A private folder",
      });
      await seedNote(
        { ...owner, folder: a.id },
        doc("Private A title", "violet private context"),
      );
      await seedNote(owner, doc("Blue sky"));
      await login(page, session);
      for (const action of ["focus", "query", "account"]) {
        const held = latch(),
          ready = latch(),
          done = latch();
        let captured = false;
        const route = async (r) => {
          if (
            captured ||
            new URL(r.request().url()).searchParams.get("searchTerm") !==
              "violet"
          )
            return r.continue();
          captured = true;
          const response = await r.fetch();
          expect(response.ok()).toBe(true);
          expect((await response.json()).items).toMatchObject([
            {
              title: "Private A title",
              folder: a.id,
              snippet: { match: "violet" },
            },
          ]);
          ready.release();
          await held.wait;
          await r.fulfill({ response });
          await page.evaluate(
            () =>
              new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
              ),
          );
          done.release();
        };
        await page.route(listRequest, route);
        await submit(page, "violet");
        await ready.wait;
        await expect(rows(page)).toHaveCount(0);
        await expect(page.getByText("No matching notes")).toBeHidden();
        if (action === "focus") {
          const control = button(page, "Search");
          await control.focus();
          held.release();
          await done.wait;
          await expect(marks(page)).toHaveText("violet");
          await expect(control).toBeFocused();
          await submit(page, "blue");
          await expect(marks(page)).toHaveText("Blue");
        } else if (action === "query") {
          await submit(page, "blue");
          await expect(marks(page)).toHaveText("Blue");
          held.release();
          await done.wait;
          await expect(rows(page)).toHaveCount(1);
          await expect(marks(page)).toHaveText("Blue");
        } else
          await secondOwner(session, async (other) => {
            if (width === 390)
              await page
                .getByRole("link", { name: "Folders", exact: true })
                .click();
            await logout(page, session);
            await credentials(page, other);
            await expect(page).toHaveURL("/folders/all");
            await submit(page, "violet");
            await expect(page.getByText("No matching notes")).toBeVisible();
            held.release();
            await done.wait;
            await expect(page.getByText("No matching notes")).toBeVisible();
            await expect(
              page.getByText(
                /Private A title|A private folder|violet private context/,
              ),
            ).toHaveCount(0);
          });
        await page.unroute(listRequest, route);
        if (action === "query") {
          await page.route(
            listRequest,
            (r) => r.fulfill({ status: 503, body: "Offline" }),
            { times: 1 },
          );
          await submit(page, "violet");
          await expect(pane(page).getByRole("alert")).toBeVisible();
          await expect(page.getByText("No matching notes")).toBeHidden();
          await button(page, "Retry").click();
          await expect(marks(page)).toHaveText("violet");
          await submit(page, "blue");
          await expect(marks(page)).toHaveText("Blue");
        }
      }
    });
    test("edited result departures wait for save and honor each failure choice", async ({
      page,
      session,
    }) => {
      const owner = await ownerData(session);
      const first = await seedNote(owner, doc("Garden one"));
      const second = await seedNote(owner, doc("Garden two"));
      await login(page, session);
      await submit(page, "garden");
      await expect(marks(page)).toHaveCount(2);
      const row = (id) => rows(page).and(page.locator(`[href="/notes/${id}"]`));
      await activate(row(first.id));
      let revision = 1,
        body = first.body;
      for (const choice of [
        "held",
        "Keep editing",
        "Discard",
        "Save and continue",
      ]) {
        const text =
          choice === "Save and continue"
            ? "Leaves in rain"
            : "Garden " + choice;
        const gate = latch(),
          sent = latch();
        await page.route("**/notes/records/" + first.id + "**", async (r) => {
          if (r.request().method() !== "PATCH") return r.continue();
          if (choice !== "held") {
            sent.release();
            return r.abort("failed");
          }
          const response = await r.fetch();
          expect(response.ok()).toBe(true);
          sent.release();
          await gate.wait;
          return r.fulfill({ response });
        });
        await replaceText(page, text);
        const depart = () =>
          width === 390 ? back(page).click() : activate(row(second.id));
        const oldIndex = await index(page);
        if (width >= 768 && choice === "Keep editing")
          await field(page).fill("unsubmitted");
        await depart();
        await sent.wait;
        await expect(page).toHaveURL(noteURL(first.id));
        await expect(
          page.locator('[contenteditable="true"][aria-label="Note"]'),
        ).toHaveText(text);
        expect(await index(page)).toBe(oldIndex);
        if (choice === "held") {
          await confirmStored(owner, first.id, doc(text), revision + 1);
          gate.release();
        } else {
          await confirmStored(owner, first.id, body, revision);
          await expect(page.getByRole("alertdialog")).toBeVisible();
          await page.unroute("**/notes/records/" + first.id + "**");
          await button(page, choice).click();
        }
        if (choice === "Keep editing") {
          await expect(editor(page)).toBeFocused();
          if (width >= 768) await expect(field(page)).toHaveValue("garden");
          await expect(editor(page)).toHaveText(text);
          await expect(page).toHaveURL(noteURL(first.id));
          await confirmStored(owner, first.id, body, revision);
          await back(page).click();
          await button(page, "Discard").click();
          await expect(row(first.id)).toBeFocused();
          await activate(row(first.id));
          continue;
        }
        if (width === 390) {
          await expect(page).toHaveURL(/\/folders\/all\?/);
          if (choice === "Save and continue")
            await expect(field(page)).toBeFocused();
          await activate(row(second.id));
        }
        await expect(page).toHaveURL(noteURL(second.id));
        await expect(editor(page)).toHaveText("Garden two");
        if (choice !== "Discard") {
          revision++;
          body = doc(text);
        }
        await confirmStored(owner, first.id, body, revision);
        await page.unroute("**/notes/records/" + first.id + "**");
        await back(page).click();
        await expect(row(second.id)).toBeFocused();
        if (choice !== "Save and continue") await activate(row(first.id));
        else await expect(row(first.id)).toHaveCount(0);
      }
    });

    if (width >= 768) {
      for (const action of ["Next page", "Previous page", "Clear", "Escape"]) {
        test(`detail ${action} preserves a cancelled or accepted history transition`, async ({
          page,
          session,
        }) => {
          const { owner, notes } = await fixture(page, session, 40);
          if (action !== "Next page") await pageTwo(page);
          for (const fail of [true, false]) {
            const origin = await originRow(page);
            const before = notes.find((n) => n.id === origin.id);
            const oldIndex = await index(page);
            await page.evaluate(() => {
              if (window.searchNavigation) {
                window.searchNavigation.length = 0;
                return;
              }
              window.searchNavigation = [];
              for (const method of ["pushState", "replaceState"]) {
                const original = history[method];
                history[method] = function (...args) {
                  window.searchNavigation.push(method);
                  return original.apply(this, args);
                };
              }
            });
            const prefix = "Edited ";
            const expectedLines = before.body.content.map(
              (p) => p.content[0].text,
            );
            expectedLines[0] = prefix + expectedLines[0];
            const sent = latch(),
              gate = latch();
            const pattern = "**/notes/records/" + origin.id + "**";
            await page.route(pattern, async (route) => {
              if (route.request().method() !== "PATCH") return route.continue();
              sent.release();
              if (fail) return route.abort("failed");
              await gate.wait;
              return route.continue();
            });
            await editor(page).locator("p").first().click();
            await page.keyboard.press("Home");
            await page.keyboard.insertText(prefix);
            await expect(editor(page).locator("p")).toHaveText(expectedLines);
            if (action === "Escape") {
              await field(page).fill("unsubmitted");
              await field(page).press("Escape");
            } else await activate(button(page, action));
            await sent.wait;
            await expect(page).toHaveURL(noteURL(origin.id));
            await expect(
              page.locator('[contenteditable="true"][aria-label="Note"] > p'),
            ).toHaveText(expectedLines);
            expect(await index(page)).toBe(oldIndex);
            await confirmStored(owner, origin.id, before.body, before.revision);
            if (fail) {
              await button(page, "Keep editing").click();
              await expect(editor(page)).toBeFocused();
              await expect(editor(page).locator("p")).toHaveText(expectedLines);
              await expect(field(page)).toHaveValue("Garden");
              expect(await ids(page)).toEqual(origin.ids);
              expect(await index(page)).toBe(oldIndex);
              await expect(page).toHaveURL(noteURL(origin.id));
              await confirmStored(
                owner,
                origin.id,
                before.body,
                before.revision,
              );
              expect(
                await page.evaluate(() => window.searchNavigation),
              ).toEqual([]);
              // Discard only this failed attempt. Start the success attempt from a clean detail.
              await back(page).click();
              await button(page, "Discard").click();
              await page.unroute(pattern);
              await assertReturn(page, origin);
              continue;
            }
            gate.release();
            await expect(field(page)).toBeFocused();
            await expect(editor(page)).toBeHidden();
            const dest = new URL(page.url());
            expect(dest.pathname).toBe("/folders/" + owner.folder);
            expect(Object.fromEntries(dest.searchParams)).toEqual(
              action === "Next page"
                ? { page: "2", q: "Garden", sp: "2" }
                : action === "Previous page"
                  ? { page: "2", q: "Garden" }
                  : { page: "2" },
            );
            expect(await index(page)).toBe(oldIndex + 1);
            expect(await page.evaluate(() => window.searchNavigation)).toEqual([
              "pushState",
            ]);
            await confirmStored(
              owner,
              origin.id,
              doc(...expectedLines),
              before.revision + 1,
            );
            await page.goBack();
            await expect(page).toHaveURL(noteURL(origin.id));
            await expect(editor(page).locator("p")).toHaveText(expectedLines);
            await expect(field(page)).toHaveValue("Garden");
            await expect(
              pane(page).getByText(action === "Next page" ? "1 / 2" : "2 / 2", {
                exact: true,
              }),
            ).toBeVisible();
            expect(await index(page)).toBe(oldIndex);
            await back(page).click();
            await expect(page).toHaveURL(origin.url);
            await expect(marks(page)).toHaveCount(20);
            if (action === "Next page")
              await expect(page.locator("#row-" + origin.id)).toBeFocused();
            else {
              await expect(page.locator("#row-" + origin.id)).toHaveCount(0);
              await expect(field(page)).toBeFocused();
            }
            expect(await scroll(page)).toBe(origin.scroll);
            expect(await index(page)).toBe(origin.idx);
          }
        });
      }
    }
  });
}
