const path = require("node:path");
const { test, expect } = require("./fixtures.cjs");
const {
  back,
  button,
  compose,
  createFolder,
  doc,
  editor,
  evidence,
  lines,
  login,
  ownerData,
  singleNote,
} = require("./note-helpers.cjs");

const title = "Seed order";
const body = "Buy calendula for the south wall";
const panes = ["Folders", "Note list", "Document"];
const pane = (page, name) => page.getByRole("region", { name, exact: true });
const search = (page) => pane(page, "Note list").getByRole("searchbox");
const rows = (page) =>
  pane(page, "Note list")
    .getByRole("navigation", { name: "Notes" })
    .getByRole("link");

async function layout(page, width, primary) {
  await expect(pane(page, primary)).toBeVisible();
  const regions = page.getByRole("region", {
    name: /^(Folders|Note list|Document)$/,
  });
  await expect(regions).toHaveCount(width === 390 ? 1 : 3);
  if (width !== 390) {
    const boxes = await Promise.all(
      panes.map((name) => pane(page, name).boundingBox()),
    );
    for (const [left, right] of [
      [boxes[0], boxes[1]],
      [boxes[1], boxes[2]],
    ]) {
      expect(left.x + left.width).toBeLessThanOrEqual(right.x + 1);
    }
  }
}

async function capture(page, info, width, theme, state, primary) {
  await layout(page, width, primary);
  await expect(page.locator("html")).toHaveCSS("color-scheme", theme);
  const view = await page.evaluate(() => ({
    route: location.pathname + location.search,
    viewport: innerWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    scrollX,
    focus:
      document.activeElement.getAttribute("aria-label") ||
      document.activeElement.id ||
      document.activeElement.tagName,
  }));
  const file = `${info.project.name}-${width}-${theme}-${state}.png`;
  const target = process.env.R6_JOURNEY_DIR
    ? path.join(process.env.R6_JOURNEY_DIR, file)
    : info.outputPath("journey", file);
  await page.screenshot({ path: target });
  await evidence(info, state, view);
  expect(view.viewport).toBe(width);
  expect(view.scrollWidth).toBeLessThanOrEqual(view.clientWidth);
  expect(view.scrollX).toBe(0);
}

async function listControls(page, width) {
  const field = search(page);
  const add = button(page, "Compose");
  await expect(field).toBeInViewport({ ratio: 1 });
  await expect(add).toBeInViewport({ ratio: 1 });
  const port = await rows(page)
    .first()
    .evaluate((a) =>
      a.parentElement.parentElement.getBoundingClientRect().toJSON(),
    );
  const input = await field.boundingBox();
  const action = await add.boundingBox();
  if (width === 390) {
    expect(input.y).toBeGreaterThanOrEqual(port.bottom);
    expect(action.y).toBeGreaterThanOrEqual(port.bottom);
    expect(input.x + input.width).toBeLessThanOrEqual(action.x);
  } else {
    expect(input.y + input.height).toBeLessThanOrEqual(port.top);
  }
}

async function submit(page, query) {
  await search(page).fill(query);
  await search(page).press("Enter");
}

for (const [width, height] of [
  [390, 844],
  [810, 1080],
  [1440, 1000],
]) {
  for (const theme of ["light", "dark"]) {
    test(`Capture and find at ${width}px in ${theme}`, async ({
      page,
      browser,
      session,
    }, info) => {
      const viewport = { width, height };
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme });
      await login(page, session);
      await layout(page, width, "Note list");
      if (width === 390)
        await page.getByRole("link", { name: "Folders", exact: true }).click();
      await expect(
        pane(page, "Folders").getByRole("link", { name: "Notes", exact: true }),
      ).toBeVisible();
      await capture(page, info, width, theme, "folders", "Folders");
      await createFolder(page, "Garden");
      const folderRoute = new URL(page.url()).pathname;
      await layout(page, width, "Note list");
      await expect(
        pane(page, "Note list").getByRole("heading", {
          name: "Garden",
          exact: true,
        }),
      ).toBeVisible();
      await compose(page);
      await layout(page, width, "Document");
      await lines(page, title, body);
      await expect(
        page.getByRole("status", { name: "Save status", exact: true }),
      ).toHaveText("Saved");
      const id = new URL(page.url()).pathname.split("/").pop();
      const { token } = await ownerData(session);
      expect(await singleNote(token)).toMatchObject({
        id,
        folder: folderRoute.split("/").pop(),
        title,
        body: doc(title, body),
      });
      await capture(page, info, width, theme, "saved-editor", "Document");

      await back(page).click();
      await expect(page).toHaveURL(new URL(folderRoute, page.url()).href);
      await expect(rows(page)).toHaveText(new RegExp(title));
      await listControls(page, width);
      await capture(page, info, width, theme, "list", "Note list");

      const context = await browser.newContext({
        viewport,
        colorScheme: theme,
        baseURL: new URL(page.url()).origin,
      });
      try {
        const other = await context.newPage();
        await login(other, session);
        const origin = other.url();
        await layout(other, width, "Note list");
        await expect(
          pane(other, "Note list").getByRole("heading", {
            name: "All Notes",
            exact: true,
          }),
        ).toBeVisible();
        await submit(other, "calendula");
        const result = rows(other);
        await expect(result).toHaveCount(1);
        await expect(result).toHaveAttribute("href", "/notes/" + id);
        await expect(result.locator("strong")).toHaveText(title);
        await expect(result.getByText("Garden", { exact: true })).toBeVisible();
        await expect(result.locator("mark")).toHaveText("calendula");
        const resultURL = other.url();
        await listControls(other, width);
        await capture(other, info, width, theme, "search-result", "Note list");
        await result.click();
        await expect(other).toHaveURL(new URL("/notes/" + id, origin).href);
        await expect(editor(other).locator(":scope > p")).toHaveText([
          title,
          body,
        ]);
        await capture(other, info, width, theme, "opened-result", "Document");
        await back(other).click();
        await expect(other).toHaveURL(resultURL);
        await expect(search(other)).toHaveValue("calendula");
        await expect(result).toHaveAttribute("href", "/notes/" + id);
        await expect(result).toBeFocused();
        await capture(
          other,
          info,
          width,
          theme,
          "restored-results",
          "Note list",
        );

        const miss = "no calendula match";
        await submit(other, miss);
        await expect(
          other.getByText("No matching notes", { exact: true }),
        ).toBeVisible();
        await expect(search(other)).toHaveValue(miss);
        await layout(other, width, "Note list");
        await button(other, "Clear").click();
        await expect(other).toHaveURL(origin);
        await expect(search(other)).toHaveValue("");
        await expect(search(other)).toBeFocused();
        await expect(result).toHaveAttribute("href", "/notes/" + id);
        await layout(other, width, "Note list");
      } finally {
        await context.close();
      }
    });
  }
}
