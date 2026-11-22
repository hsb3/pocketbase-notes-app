const { api, expect, test } = require("./fixtures.cjs");

const notePath = "collections/notes/records";
const folderPath = "collections/folders/records";
const listURL = /\/folders\/all(?:[?#]|$)/;
const editor = (page) =>
  page.getByRole("textbox", { name: "Note", exact: true });
const back = (page) => page.getByRole("button", { name: "Back", exact: true });
const saved = (page) =>
  page.getByRole("status").filter({ hasText: /^Saved$/i });
const doc = (...lines) => ({
  type: "doc",
  content: lines.map((text) =>
    text
      ? { type: "paragraph", content: [{ type: "text", text }] }
      : { type: "paragraph" },
  ),
});

async function login(page, session) {
  await page.goto("/auth/login");
  await credentials(page, session);
  await expect(page).toHaveURL(listURL);
}
async function ownerData(session) {
  const { token } = await api(
    "collections/users/auth-with-password",
    "",
    "POST",
    {
      identity: session.email,
      password: session.password,
    },
  );
  const { items } = await api(folderPath, token);
  return {
    token,
    user: session.account.id,
    folder: items.find((item) => item.is_default).id,
  };
}
async function seedNote({ token, user, folder }, body, attachments = []) {
  return api(notePath, token, "POST", { user, folder, body, attachments });
}
async function privateImage(request, owner) {
  const upload = await request.post(
    process.env.VITE_PB_URL + "/api/collections/attachments/records",
    {
      headers: { Authorization: owner.token },
      multipart: {
        user: owner.user,
        name: "seed.png",
        file: {
          name: "seed.png",
          mimeType: "image/png",
          buffer: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNwKV8FAAJoAWZD6tifAAAAAElFTkSuQmCC",
            "base64",
          ),
        },
      },
    },
  );
  expect(upload.ok()).toBe(true);
  return upload.json();
}

async function compose(page) {
  await page.getByRole("button", { name: "Compose", exact: true }).click();
  await expect(editor(page)).toBeFocused();
  await expect(page).toHaveURL(/\/notes\/[a-z0-9]{15}$/);
}
async function folders(page) {
  await page.goto("/folders");
  await expect(page.getByRole("button", { name: "New folder" })).toBeVisible();
}
async function createFolder(page, name) {
  await page.getByRole("button", { name: "New folder" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill(name);
  await dialog.getByRole("button", { name: /create/i }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/folders\/[a-z0-9]{15}$/);
}
async function singleNote(token) {
  const list = await api(notePath, token);
  expect(list.totalItems).toBe(1);
  return list.items[0];
}
async function lines(page, first, second) {
  if (first) await page.keyboard.insertText(first);
  await page.keyboard.press("Enter");
  await page.keyboard.insertText(second);
}

const button = (page, name) => page.getByRole("button", { name, exact: true });
const retry = (page) => button(page, "Retry");
const region = (page) => page.getByRole("region", { name: "Document" });
const noteURL = (id) => new RegExp("/notes/" + id + "$");
const recordRoutes =
  /\/api\/collections\/notes\/records(?:\/[a-z0-9]{15})?(?:\?.*)?$/;

async function retryIfOffered(page, classified) {
  const action = retry(page);
  await expect(action.or(classified).first()).toBeVisible({ timeout: 2000 });
  if (await action.isVisible()) {
    try {
      await action.click({ timeout: 1000 });
    } catch (error) {
      if (!(await classified.isVisible())) throw error;
    }
  }
}
async function replaceText(page, text) {
  const box = editor(page);
  await box.focus();
  await page.keyboard.press("ControlOrMeta+a");
  if (text) await page.keyboard.insertText(text);
  else await page.keyboard.press("Backspace");
}
async function openSeed(page, session, text = "Before editing") {
  const owner = await ownerData(session);
  const note = await seedNote(owner, doc(text));
  await login(page, session);
  await page.getByRole("link", { name: text, exact: true }).click();
  await expect(editor(page)).toHaveText(text);
  return { owner, note };
}
async function stored(owner, id, text, revision) {
  const list = await singleNote(owner.token);
  expect(list.id).toBe(id);
  const detail = await api(notePath + "/" + id, owner.token);
  expect(detail).toMatchObject({
    id,
    user: owner.user,
    folder: owner.folder,
    attachments: [],
    body: doc(...text.split("\n")),
    revision,
  });
  await evidence(test.info(), "Verified owner detail", {
    id: detail.id,
    revision: detail.revision,
    body: detail.body,
  });
}
async function reopened(browser, page, session, id, text) {
  const other = await browser.newPage({ baseURL: new URL(page.url()).origin });
  try {
    await login(other, session);
    await other.goto("/notes/" + id);
    await expect(editor(other).locator(":scope > p")).toHaveText(
      text.split("\n"),
    );
  } finally {
    await other.close();
  }
}
function latch() {
  let release;
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  return { wait, release };
}
async function secondOwner(session, run) {
  const password = crypto.randomUUID();
  const account = await api(
    "collections/users/records",
    session.admin.token,
    "POST",
    {
      email: "second-" + password + "@example.test",
      password,
      passwordConfirm: password,
      verified: true,
    },
  );
  try {
    await run({ account, password, email: account.email });
  } finally {
    await api(
      "collections/users/records/" + account.id,
      session.admin.token,
      "DELETE",
    );
  }
}
async function credentials(page, session) {
  await page.locator('[name="identity"]').fill(session.email);
  await page.locator('[name="password"]').fill(session.password);
  await button(page, "Login").click();
}
async function logout(page, session) {
  await page.getByRole("button", { name: new RegExp(session.email) }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
}

// The page clock covers real input, request/response delivery and rendered controls.
async function observe(page) {
  await page.evaluate(() => {
    const events = (window.noteEvents = []);
    const add = (kind, value) =>
      events.push({ kind, value, time: performance.now() });
    document.addEventListener(
      "input",
      (e) => {
        if (e.target.closest('[contenteditable="true"]')) add("input");
      },
      true,
    );
    const fetch = window.fetch;
    window.fetch = async function (url, options) {
      if (
        !String(url).includes("/collections/notes/records") ||
        !["PATCH", "POST"].includes(options?.method)
      )
        return fetch.apply(this, arguments);
      add("send", options.method);
      try {
        const response = await fetch.apply(this, arguments);
        add("reply", response.status);
        return response;
      } catch (error) {
        add("reply", 0);
        throw error;
      }
    };
    let previous, previousRetry;
    const sample = () => {
      const area = document.querySelector('[aria-label="Document"]');
      const status = area?.querySelector("[role=status]");
      const value = status?.getClientRects().length
        ? status.textContent.trim()
        : "";
      if (value !== previous) {
        previous = value;
        add("status", value);
      }
      const retry = [...(area?.querySelectorAll("button") || [])].some(
        (b) => b.textContent.trim() === "Retry" && b.getClientRects().length,
      );
      if (retry !== previousRetry) {
        previousRetry = retry;
        add("retry", retry);
      }
    };
    sample();
    new MutationObserver(sample).observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
    });
  });
}
const events = (page) => page.evaluate(() => window.noteEvents);
function noStaleSaved(log, start, end) {
  expect(
    log.filter(
      (e) =>
        e.kind === "status" &&
        e.time >= start &&
        e.time < end &&
        /^saved$/i.test(e.value),
    ),
  ).toEqual([]);
}
async function evidence(testInfo, name, values) {
  await testInfo.attach(name, {
    body: JSON.stringify(values),
    contentType: "application/json",
  });
}
async function heldWrite(page, route, gate) {
  const response = await route.fetch();
  expect(response.ok()).toBe(true);
  gate.start = await page.evaluate(() => performance.now());
  await gate.wait;
  gate.end = await page.evaluate(() => performance.now());
  await route.fulfill({ response });
}

// Keeps a context stale, so it exercises the save and action fallbacks instead of live updates.
const blockRealtime = (page) =>
  page.route("**/api/realtime", (route) => route.abort("failed"));

module.exports = {
  blockRealtime,
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
  observe,
  events,
  noStaleSaved,
  evidence,
  heldWrite,
  button,
  retry,
  retryIfOffered,
  region,
  noteURL,
  recordRoutes,
  replaceText,
  openSeed,
  stored,
  reopened,
  latch,
  secondOwner,
  credentials,
  logout,
};
