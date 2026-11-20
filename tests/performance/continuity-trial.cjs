// seedTrial(page, session) opens the first note in the e2e fixture's fresh account.
// driveTrial(page, trial, { readDelay, observe }) types and saves, switches notes,
// then confirms a move. Both options are optional. A positive delay (ms) also
// holds the first save reply during typing. observe(operation, action) must await
// action once. Pass measure(page, trial.anchor.id, operation, action) to sample it.
const { api, expect } = require("../e2e/fixtures.cjs");
const {
  doc,
  editor,
  heldWrite,
  latch,
  login,
  notePath,
  noteURL,
  ownerData,
  recordRoutes,
  seedNote,
} = require("../e2e/note-helpers.cjs");

async function seedTrial(page, session) {
  const owner = await ownerData(session);
  const destination = await api(
    "collections/folders/records",
    owner.token,
    "POST",
    {
      user: owner.user,
      name: "Destination",
    },
  );
  const [first, second, anchor] = await Promise.all(
    ["First", "Second", "Anchor"].map((name) =>
      seedNote(owner, doc(name, "Test body")),
    ),
  );
  await login(page, session);
  await page.goto("/folders/" + owner.folder);
  const row = (id) => page.locator("#row-" + id);
  await row(first.id).click();
  const box = editor(page);
  await expect(box).toContainText(first.title);
  await box.press("ControlOrMeta+End");
  await expect(row(anchor.id)).toBeVisible();
  return { owner, first, second, anchor, destination };
}

async function driveTrial(
  page,
  trial,
  { readDelay = 0, observe = (_, action) => action() } = {},
) {
  const { owner, first, second, anchor, destination } = trial;
  const row = (id) => page.locator("#row-" + id);
  const box = editor(page);
  const held = latch();
  let holdFirst = true;
  async function controlReadsAndSave(route) {
    const method = route.request().method();
    if (method === "PATCH" && holdFirst) {
      holdFirst = false;
      return heldWrite(page, route, held);
    }
    if (method === "GET") {
      await new Promise((resolve) => setTimeout(resolve, readDelay));
    }
    await route.continue();
  }

  if (readDelay) await page.route(recordRoutes, controlReadsAndSave);
  try {
    await observe("typing", async () => {
      try {
        await box.press("x");
        if (readDelay)
          await expect
            .poll(() => held.start, { intervals: [16] })
            .toBeDefined();
        await box.pressSequentially("latency", { delay: 25 });
      } finally {
        held.release();
      }
      await expect(
        page.getByRole("status", { name: "Save status" }),
      ).toHaveText("Saved");
      await expect(row(first.id)).toContainText("xlatency");
      await expect(row(anchor.id)).toBeVisible();
      if (readDelay) return { start: held.start, end: held.end };
    });
    const stored = await api(notePath + "/" + first.id, owner.token);
    expect(stored.body).toEqual(doc(first.title, "Test bodyxlatency"));
    expect(stored.revision).toBe(readDelay ? 3 : 2);

    await observe("switch", async () => {
      await row(second.id).click();
      await expect(box).toContainText(second.title);
      await expect(box).toBeEditable();
      await expect(page).toHaveURL(noteURL(second.id));
    });
    await page.getByRole("button", { name: "Note actions" }).click();
    await page.getByRole("menuitem", { name: /Move/ }).click();
    const choice = page
      .getByRole("dialog")
      .getByRole("button", { name: destination.name });
    await expect(choice).toBeVisible();
    await observe("move", async () => {
      await choice.click();
      await expect(box).toBeFocused();
      await expect(row(second.id)).toHaveCount(0);
      await expect(row(anchor.id)).toBeVisible();
      await expect(page).toHaveURL(noteURL(second.id));
    });
    expect(await api(notePath + "/" + second.id, owner.token)).toMatchObject({
      folder: destination.id,
      revision: 2,
      body: second.body,
    });
  } finally {
    if (readDelay) await page.unroute(recordRoutes, controlReadsAndSave);
  }
}

function startProbe(sentinel) {
  const start = performance.now();
  const run = {
    start,
    states: [],
    frames: [],
    keys: [],
    entries: {},
  };
  const now = () => performance.now() - start;
  const ids = new WeakMap();
  let nextId = 0;
  function identity(selector) {
    const node = document.querySelector(selector);
    if (!node) return null;
    if (!ids.has(node)) ids.set(node, ++nextId);
    return ids.get(node);
  }
  function loading(selector) {
    return (
      Array.from(
        document.querySelectorAll(selector),
        (el) => el.textContent,
      ).find((text) => /^Loading (notes|note|editor)…$/.test(text)) ?? null
    );
  }
  function snapshot() {
    return {
      workspace: identity("main"),
      list: identity('nav[aria-label="Notes"]'),
      sentinel: identity("#row-" + sentinel),
      editor: identity('[aria-label="Note"][role="textbox"]'),
      status: identity('[aria-label="Save status"]'),
      statusText:
        document.querySelector('[aria-label="Save status"]')?.textContent ??
        null,
      listFallback: loading('[aria-label="Note list"] p'),
      documentFallback: loading('[aria-label="Document"] :is(p,[role=status])'),
      theme: document.documentElement.className,
    };
  }
  let previous;
  function sample() {
    const state = snapshot();
    const encoded = JSON.stringify(state);
    if (encoded !== previous) {
      previous = encoded;
      run.states.push({ at: now(), ...state });
    }
    return state;
  }
  sample();
  const changes = new MutationObserver(sample);
  changes.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
  });
  changes.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  let frame;
  function tick(t) {
    const { listFallback, documentFallback } = sample();
    run.frames.push({ at: t - start, listFallback, documentFallback });
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);
  function keydown(event) {
    if (event.target.matches('[aria-label="Note"]')) {
      const key = { at: event.timeStamp - start, handler: now() };
      run.keys.push(key);
      requestAnimationFrame(() => {
        key.nextRaf = now();
      });
    }
  }
  document.addEventListener("keydown", keydown, true);
  const observers = [];
  for (const type of ["event", "longtask", "layout-shift", "resource"]) {
    if (!window.PerformanceObserver?.supportedEntryTypes?.includes(type))
      continue;
    const entries = (run.entries[type] = []);
    const collect = (batch) => {
      for (const e of batch) {
        if (e.startTime < start) continue;
        entries.push({
          at: e.startTime - start,
          name: type === "resource" ? new URL(e.name).pathname : e.name,
          duration: e.duration,
          interactionId: e.interactionId,
          value: e.value,
          recentInput: e.hadRecentInput,
          processingStart: e.processingStart,
          processingEnd: e.processingEnd,
        });
      }
    };
    const observer = new PerformanceObserver((list) =>
      collect(list.getEntries()),
    );
    observer.observe(
      type === "event" ? { type, durationThreshold: 16 } : { type },
    );
    observers.push(() => {
      collect(observer.takeRecords());
      observer.disconnect();
    });
  }
  window.stopFlicker = () => {
    sample();
    changes.disconnect();
    observers.forEach((stop) => stop());
    cancelAnimationFrame(frame);
    document.removeEventListener("keydown", keydown, true);
    delete window.stopFlicker;
    run.duration = now();
    return run;
  };
}

async function measure(page, sentinel, operation, action) {
  await page.evaluate(startProbe, sentinel);
  await page.evaluate((name) => performance.mark(name), operation);
  let marks;
  let result;
  try {
    marks = await action();
    // Drain the last frame and queued performance entries before disconnecting.
    await page.waitForTimeout(150);
  } finally {
    result = await page.evaluate(() => window.stopFlicker());
  }
  expect(result.frames.length).toBeGreaterThan(1);
  result.marks = {};
  if (marks) {
    result.marks.replyHeld = marks.start - result.start;
    result.marks.releaseReply = marks.end - result.start;
  }
  return { operation, ...result };
}

module.exports = { seedTrial, driveTrial, measure };
