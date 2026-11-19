const { api, expect, test } = require("./fixtures.cjs");

const {
  notePath,
  listURL,
  editor,
  back,
  saved,
  doc,
  login,
  ownerData,
  seedNote,
  privateImage,
  compose,
  folders,
  createFolder,
  singleNote,
  lines,
} = require("./note-helpers.cjs");
const gardenTitle = "Seed order";
const gardenBody = "Buy calendula for the south wall";
const fields = "id,folder,title,updated,excerpt";

for (const width of [390, 810, 1440]) {
  test(`Garden capture at ${width}px reopens in an independent desktop session`, async ({
    page,
    browser,
    session,
  }) => {
    const { token } = await ownerData(session);
    await page.setViewportSize({ width, height: 844 });
    await login(page, session);
    await folders(page);
    await createFolder(page, "Garden");
    const folder = new URL(page.url()).pathname.split("/").pop();
    await compose(page);
    await lines(page, gardenTitle, gardenBody);
    await expect(saved(page)).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const folderButton = page.getByRole("button", { name: "New folder" });

    if (width >= 768) {
      await expect(folderButton).toBeVisible();
      await expect(
        page
          .getByRole("link", { name: new RegExp(gardenTitle) })
          .or(page.getByRole("button", { name: new RegExp(gardenTitle) })),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Compose" })).toBeVisible();
    } else {
      await expect(folderButton).toBeHidden();
    }
    const note = await singleNote(token);
    expect(note).toMatchObject({
      folder,
      title: gardenTitle,
      body: doc(gardenTitle, gardenBody),
    });
    const desktop = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      baseURL: new URL(page.url()).origin,
    });
    try {
      const other = await desktop.newPage();
      await login(other, session);
      await other.goto(`/folders/${folder}`);
      await expect(other.getByText(gardenTitle, { exact: true })).toHaveCount(
        1,
      );
      await other.getByText(gardenTitle, { exact: true }).click();
      await expect(other).toHaveURL(new RegExp(`/notes/${note.id}$`));
      await expect(editor(other).locator(":scope > p")).toHaveText([
        gardenTitle,
        gardenBody,
      ]);
    } finally {
      await desktop.close();
    }
  });
}

test("wrapped and blank first lines, default filing and whitespace abandon", async ({
  page,
  session,
}) => {
  const { token, folder } = await ownerData(session);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, session);
  await compose(page);
  await page.keyboard.insertText("    ");
  await back(page).click();
  await expect(page).toHaveURL(listURL);
  expect((await api(notePath, token)).totalItems).toBe(0);
  await compose(page);
  const long = "Seed packets 🌱 ".repeat(15);
  await lines(page, long, gardenBody);
  await expect(saved(page)).toBeVisible();
  const first = editor(page).locator(":scope > p").first();
  expect(
    await first.evaluate(
      (p) => p.offsetHeight > parseFloat(getComputedStyle(p).lineHeight),
    ),
  ).toBe(true);
  expect(await singleNote(token)).toMatchObject({
    title: Array.from(long).slice(0, 160).join(""),
    body: doc(long, gardenBody),
    folder,
  });
  await back(page).click();
  await compose(page);
  await lines(page, "", "Later line");
  await expect(saved(page)).toBeVisible();
  const id = new URL(page.url()).pathname.split("/").pop();
  expect(await api(`${notePath}/${id}`, token)).toMatchObject({
    title: "Untitled note",
    body: doc("", "Later line"),
  });
});

test("Back joins a delayed real create and drains newer typing with one PATCH", async ({
  page,
  browser,
  session,
}) => {
  const { token } = await ownerData(session);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, session);
  let committed;
  const firstCommit = new Promise((resolve) => {
    committed = resolve;
  });
  const writes = [];
  let patchAcknowledged = false;
  await page.route("**/api/collections/notes/records**", async (route) => {
    const request = route.request();
    if (!["POST", "PATCH"].includes(request.method())) return route.continue();
    writes.push({ method: request.method(), data: request.postDataJSON() });
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    if (request.method() === "POST") {
      committed();
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } else {
      patchAcknowledged = true;
    }
    await route.fulfill({ response });
  });
  await compose(page);
  await page.keyboard.insertText(gardenTitle);
  await firstCommit;
  // Watch every announced state between the later edit and the PATCH response.
  let staleSaved = false;
  await page.exposeFunction("observeSaved", () => {
    if (!patchAcknowledged) staleSaved = true;
  });
  await page.evaluate(() => {
    new MutationObserver(() => {
      if (
        [...document.querySelectorAll('[role="status"]')].some((node) =>
          /^saved$/i.test(node.textContent.trim()),
        )
      )
        window.observeSaved();
    }).observe(document.body, {
      subtree: true,
      characterData: true,
      childList: true,
    });
  });
  await lines(page, "", gardenBody);
  await expect(saved(page)).toBeHidden();
  const noteURL = page.url();
  await back(page).click();
  expect(page.url()).toBe(noteURL);
  expect(writes.map((w) => w.method)).toEqual(["POST"]);
  await expect(page).toHaveURL(listURL);
  expect(staleSaved).toBe(false);
  expect(writes.map((w) => w.method)).toEqual(["POST", "PATCH"]);
  expect(writes[1].data).toEqual({
    revision: 1,
    body: doc(gardenTitle, gardenBody),
  });
  const note = await singleNote(token);
  expect(note.id).toBe(writes[0].data.id);
  expect(note.revision).toBe(2);
  const second = await browser.newPage({ baseURL: new URL(noteURL).origin });
  try {
    await login(second, session);
    await second.goto(noteURL);
    await expect(editor(second).locator(":scope > p")).toHaveText([
      gardenTitle,
      gardenBody,
    ]);
  } finally {
    await second.close();
  }
});

test("a failed save keeps the words and blocks Back", async ({
  page,
  session,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, session);
  await compose(page);
  const url = page.url();
  await page.route("**/api/collections/notes/records**", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 503, json: { message: "Unavailable" } })
      : route.continue(),
  );
  await page.keyboard.insertText(gardenTitle);
  await expect(
    page
      .getByText(/unable to save|could not save|couldn.t save|save failed/i)
      .first(),
  ).toBeVisible();
  await back(page).click();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page).toHaveURL(url);
  await expect(editor(page)).toHaveText(gardenTitle);
  await expect(saved(page)).toBeHidden();
});

test("folder validation retains the name and restores focus on Cancel", async ({
  page,
  session,
}) => {
  await login(page, session);
  await folders(page);
  await createFolder(page, "Garden");
  await folders(page);
  const opener = page.getByRole("button", { name: "New folder" });
  await opener.click();
  const dialog = page.getByRole("dialog");
  const name = dialog.getByRole("textbox");
  for (const value of ["  ", "Notes", "gArDeN"]) {
    await name.fill(value);
    await dialog.getByRole("button", { name: /create/i }).click();
    await expect(name).toHaveValue(value);
    await expect(name).toHaveAccessibleDescription(/\S/);
    await expect(dialog).toBeVisible();
  }
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(opener).toBeFocused();
});

test("list transfers only projected rows and reads only the selected detail", async ({
  page,
  session,
}) => {
  const owner = await ownerData(session);
  const first = await seedNote(owner, doc("First", "Preview"));
  await seedNote(owner, doc("Second"));
  const requests = [];
  page.on("request", (request) => {
    if (request.method() === "GET") requests.push(new URL(request.url()));
  });
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname.endsWith(notePath) &&
        r.request().method() === "GET",
    ),
    login(page, session),
  ]);
  const query = new URL(response.url()).searchParams;
  expect(query.get("fields")).toBe(fields);
  expect(query.get("sort")).toBe("-updated,-id");
  expect(query.get("perPage")).toBe("20");
  expect(query.get("page")).toBe("1");
  expect(query.get("filter")).toMatch(/deleted\s*=\s*""/);
  const { items } = await response.json();
  for (const row of items)
    expect(Object.keys(row).sort()).toEqual(fields.split(",").sort());
  expect(Object.fromEntries(items.map((r) => [r.title, r.excerpt]))).toEqual({
    First: "Preview",
    Second: "",
  });
  await expect(page.getByText("Preview", { exact: true })).toBeVisible();
  const detailReads = () =>
    requests.filter((u) => u.pathname.includes(notePath + "/"));
  expect(detailReads()).toHaveLength(0);
  expect(
    requests.filter((u) => u.pathname.includes("/api/files/")),
  ).toHaveLength(0);
  const [folderResponse] = await Promise.all([
    page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname.endsWith(notePath) &&
        new URL(r.url()).searchParams.get("filter")?.includes(owner.folder),
    ),
    page.goto(`/folders/${owner.folder}`),
  ]);
  expect(new URL(folderResponse.url()).searchParams.get("fields")).toBe(fields);
  await expect(page.getByText("Preview", { exact: true })).toBeVisible();
  expect(detailReads()).toHaveLength(0);
  await page.getByText("First", { exact: true }).click();
  await expect(editor(page)).toContainText("First");
  expect(detailReads().map((u) => u.pathname)).toEqual([
    `/api/${notePath}/${first.id}`,
  ]);
});

test("a foreign note deep link looks like an unknown note", async ({
  page,
  session,
}) => {
  const password = crypto.randomUUID();
  const other = await api(
    "collections/users/records",
    session.admin.token,
    "POST",
    {
      email: `other-${password}@example.test`,
      password,
      passwordConfirm: password,
      verified: true,
    },
  );
  try {
    const foreign = await ownerData({
      email: other.email,
      password,
      account: other,
    });
    const note = await seedNote(foreign, doc("Unshared garden"));
    await login(page, session);
    await expect(page.getByText("Unshared garden")).toHaveCount(0);
    for (const id of [note.id, "missing00000000"]) {
      await page.goto(`/notes/${id}`);
      await expect(
        page.getByText(/note unavailable|note (?:was |is )?not found/i),
      ).toBeVisible();
      await expect(editor(page)).toHaveCount(0);
      await expect(page.getByText("Unshared garden")).toHaveCount(0);
    }
  } finally {
    await api(
      `collections/users/records/${other.id}`,
      session.admin.token,
      "DELETE",
    );
  }
});

test("rich paste and private image survive a body-only save and reopen", async ({
  page,
  session,
  request,
}) => {
  const owner = await ownerData(session);
  const file = await privateImage(request, owner);
  const body = doc("Garden");
  body.content.push(
    {
      type: "image",
      attrs: { src: `attachment:${file.id}`, width: 1, height: 1 },
    },
    { type: "paragraph" },
  );
  const note = await seedNote(owner, body, [file.id]);
  await login(page, session);
  await page.goto(`/notes/${note.id}`);
  const last = editor(page).locator(":scope > p").last();
  await last.click();
  await last.evaluate((p) => {
    const data = new DataTransfer();
    data.setData("text/html", "<p><strong>Seed</strong> <em>order</em></p>");
    p.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      }),
    );
  });
  await expect(editor(page).locator("strong")).toHaveText("Seed");
  await expect(saved(page)).toBeVisible();
  const stored = await api(`${notePath}/${note.id}`, owner.token);
  expect(stored.attachments).toEqual([file.id]);
  expect(stored.body.content).toContainEqual(body.content[1]);
  const rich = stored.body.content.at(-1);
  expect(rich.content[0].marks).toContainEqual({ type: "bold" });
  expect(rich.content.at(-1).marks).toContainEqual({ type: "italic" });
  await page.reload();
  await expect(editor(page).locator("em")).toHaveText("order");
  const image = editor(page).getByAltText("Attached image");
  await expect(image).toHaveAttribute("src", /^blob:/);
  await expect.poll(() => image.evaluate((img) => img.naturalWidth)).toBe(1);
});

test("phone Back restores the second page, scroll offset and selected row focus", async ({
  page,
  session,
}) => {
  const owner = await ownerData(session);
  for (let i = 0; i < 40; i++)
    await seedNote(owner, doc("Garden row " + i, "Seed packets"));
  await page.setViewportSize({ width: 390, height: 600 });
  await login(page, session);
  await page.getByRole("button", { name: /next/i }).click();
  await expect(page).toHaveURL(/page=2/);
  const origin = page.url();
  const row = page.getByText("Garden row 0", { exact: true });
  await row.scrollIntoViewIfNeeded();
  const top = await row.evaluate((el) => el.getBoundingClientRect().top);
  await row.click();
  await expect(editor(page)).toBeVisible();
  await back(page).click();
  await expect(page).toHaveURL(origin);
  await expect
    .poll(() =>
      row.evaluate((el) => Math.round(el.getBoundingClientRect().top)),
    )
    .toBe(Math.round(top));
  expect(
    await row.evaluate(
      (el) =>
        document.activeElement !== document.body &&
        document.activeElement.contains(el),
    ),
  ).toBe(true);
});

// Contrast ratio between an element's text colour and the nearest opaque background.
function contrast(element) {
  const rgb = (value) => value.match(/[\d.]+/g).map(Number);
  const luminance = ([r, g, b]) => {
    const [R, G, B] = [r, g, b].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
  };
  let node = element;
  let background = "rgba(0, 0, 0, 0)";
  while (node && rgb(background)[3] === 0) {
    background = getComputedStyle(node).backgroundColor;
    node = node.parentElement;
  }
  const [a, b] = [rgb(getComputedStyle(element).color), rgb(background)].map(
    luminance,
  );
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test("keyboard reaches Account in both themes and resize preserves dirty caret", async ({
  page,
  session,
}) => {
  await login(page, session);
  for (const theme of ["dark", "light"]) {
    await page.emulateMedia({ colorScheme: theme });
    await folders(page);
    const account = page.getByRole("link", { name: "Account", exact: true });
    await expect(account).toBeVisible();
    expect(await account.evaluate(contrast)).toBeGreaterThanOrEqual(4.5);
    for (
      let i = 0;
      i < 30 &&
      !(await account.evaluate((el) => el === document.activeElement));
      i++
    )
      await page.keyboard.press("Tab");
    await expect(account).toBeFocused();
    expect(await account.evaluate((el) => el.matches(":focus-visible"))).toBe(
      true,
    );
    await expect(page.locator("html")).toHaveCSS("color-scheme", theme);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/account$/);
  }
  await page.goto("/folders/all");
  await compose(page);
  await page.keyboard.insertText("Seeds");
  await page.keyboard.press("ArrowLeft");
  for (const width of [390, 810, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(editor(page)).toBeFocused();
    expect(
      await editor(page).evaluate(
        (el) =>
          el.contains(getSelection().anchorNode) && getSelection().anchorOffset,
      ),
    ).toBe(4);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.keyboard.insertText("ling");
  await expect(editor(page)).toHaveText("Seedlings");
});

test("a late first selection cannot replace the second note", async ({
  page,
  session,
}) => {
  const owner = await ownerData(session);
  const first = await seedNote(owner, doc("First selection", "Old detail"));
  const second = await seedNote(
    owner,
    doc("Second selection", "Current detail"),
  );
  await login(page, session);
  let release, received, finished;
  const waitForRelease = new Promise((resolve) => {
    release = resolve;
  });
  const responseReady = new Promise((resolve) => {
    received = resolve;
  });
  const delivered = new Promise((resolve) => {
    finished = resolve;
  });
  await page.route(`**/api/${notePath}/${first.id}*`, async (route) => {
    const response = await route.fetch();
    received();
    await waitForRelease;
    try {
      await route.fulfill({ response });
    } finally {
      finished();
    }
  });
  try {
    await page.getByText("First selection", { exact: true }).click();
    await responseReady;
    await page.getByText("Second selection", { exact: true }).click();
    await expect(editor(page)).toContainText("Current detail");
  } finally {
    release();
  }
  await delivered;
  await expect(page).toHaveURL(new RegExp(`/notes/${second.id}$`));
  await expect(editor(page)).toContainText("Current detail");
});

test("Back history after abandoning a new draft", async ({ page, session }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, session);
  await page.getByRole("link", { name: "Folders", exact: true }).click();
  await page.getByRole("link", { name: "Notes", exact: true }).click();
  await expect(page).toHaveURL(/\/folders\/[a-z0-9]{15}$/);
  const origin = page.url();
  await compose(page);
  await back(page).click();
  await expect(page).toHaveURL(origin);
  await page.goBack();
  await expect(page).toHaveURL(/\/folders\/?$/);
});

test("typing while a cold Compose editor warms retains the caret", async ({
  page,
  session,
}) => {
  let release;
  const hold = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(/\/assets\/editor-[\w-]+\.js$/, async (route) => {
    await hold;
    await route.continue();
  });
  await login(page, session);
  await page.getByRole("button", { name: "Compose", exact: true }).click();
  await expect(page).toHaveURL(/\/notes\/[a-z0-9]{15}$/);
  release();
  await expect(editor(page)).toBeFocused();
  await page.keyboard.insertText(gardenTitle);
  await expect(saved(page)).toBeVisible();
  const beforeCaret = await editor(page).evaluate((el) => {
    const selection = getSelection();
    if (!el.contains(selection.anchorNode)) return null;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    return range.toString();
  });
  expect(beforeCaret).toBe(gardenTitle);
  await lines(page, "", gardenBody);
  await expect(saved(page)).toBeVisible();
  await expect(editor(page).locator(":scope > p")).toHaveText([
    gardenTitle,
    gardenBody,
  ]);
});
