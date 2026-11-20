const { test, expect, api } = require("../e2e/fixtures.cjs");
const {
  doc,
  editor,
  login,
  ownerData,
  seedNote,
  latch,
  notePath,
  recordRoutes,
} = require("../e2e/note-helpers.cjs");

function startProbe(sentinel) {
  const start = performance.now();
  const run = {
    start,
    states: [],
    frames: [],
    keys: [],
    entries: {},
    marks: {},
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
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
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
  window.flickerMark = (label) => {
    run.marks[label] = now();
    performance.mark(label);
  };
  window.stopFlicker = () => {
    sample();
    changes.disconnect();
    observers.forEach((stop) => stop());
    cancelAnimationFrame(frame);
    document.removeEventListener("keydown", keydown, true);
    run.duration = now();
    return run;
  };
}

async function measure(page, sentinel, operation, action) {
  await page.evaluate(startProbe, sentinel);
  await page.evaluate((name) => performance.mark(name), operation);
  await action();
  // Allow the last paint and asynchronous performance entries to arrive.
  await page.waitForTimeout(150);
  const result = await page.evaluate(() => window.stopFlicker());
  expect(result.frames.length).toBeGreaterThan(1);
  return { operation, ...result };
}

for (const engine of ["chromium", "webkit"]) {
  const probe = test.extend({
    page: async ({ playwright, baseURL, viewport }, use) => {
      const browser = await playwright[engine].launch();
      try {
        await use(await browser.newPage({ baseURL, viewport }));
      } finally {
        await browser.close();
      }
    },
  });
  probe.describe(engine, () => {
    for (const delay of [0, 120]) {
      for (const repetition of [1, 2, 3]) {
        probe(
          `flicker ${delay}ms reads run ${repetition}`,
          async ({ page, session }, info) => {
            test.setTimeout(75_000);
            const owner = await ownerData(session);
            const dest = await api(
              "collections/folders/records",
              owner.token,
              "POST",
              {
                user: owner.user,
                name: "Destination",
              },
            );
            const [a, b, anchor] = await Promise.all(
              ["First", "Second", "Anchor"].map((name) =>
                seedNote(owner, doc(name, "Test body")),
              ),
            );
            await login(page, session);
            await page.goto("/folders/" + owner.folder);
            const row = (id) => page.locator("#row-" + id);
            await row(a.id).click();
            const box = editor(page);
            await expect(box).toContainText(a.title);
            await box.press("ControlOrMeta+End");
            await expect(row(anchor.id)).toBeVisible();
            const html = await (await page.request.get("/")).text();
            expect(html).toContain("/assets/");
            expect(html).not.toContain("/@vite/client");

            const held = latch();
            let holdFirst = delay > 0;
            if (delay)
              await page.route(recordRoutes, async (route) => {
                const method = route.request().method();
                if (method === "GET") {
                  await new Promise((resolve) => setTimeout(resolve, delay));
                } else if (method === "PATCH" && holdFirst) {
                  holdFirst = false;
                  const reply = await route.fetch();
                  expect(reply.ok()).toBe(true);
                  await page.evaluate(() => window.flickerMark("replyHeld"));
                  await held.wait;
                  await route.fulfill({ response: reply });
                  return;
                }
                await route.continue();
              });

            const trace = [];
            let cdp;
            if (engine === "chromium" && repetition === 1) {
              cdp = await page.context().newCDPSession(page);
              cdp.on("Tracing.dataCollected", ({ value }) =>
                trace.push(...value),
              );
              await cdp.send("Tracing.start", {
                categories:
                  "devtools.timeline,blink.user_timing,disabled-by-default-devtools.screenshot",
                transferMode: "ReportEvents",
              });
            }
            const runs = [];
            const status = page.getByRole("status", { name: "Save status" });
            runs.push(
              await measure(page, anchor.id, "typing", async () => {
                await box.press("x");
                try {
                  if (delay)
                    await page.waitForFunction(
                      () =>
                        performance.getEntriesByName("replyHeld").length > 0,
                    );
                  await box.pressSequentially("latency", { delay: 25 });
                  if (delay)
                    await page.evaluate(() =>
                      window.flickerMark("releaseReply"),
                    );
                } finally {
                  held.release();
                }
                await expect(status).toHaveText("Saved");
                await expect(row(a.id)).toContainText("xlatency");
                await expect(row(anchor.id)).toBeVisible();
              }),
            );
            const stored = await api(notePath + "/" + a.id, owner.token);
            expect(stored.body).toEqual(doc(a.title, "Test bodyxlatency"));
            expect(stored.revision).toBe(delay ? 3 : 2);

            runs.push(
              await measure(page, anchor.id, "switch", async () => {
                await row(b.id).click();
                await expect(box).toContainText(b.title);
                await expect(box).toBeEditable();
                await expect(page).toHaveURL(
                  new RegExp("/notes/" + b.id + "$"),
                );
              }),
            );
            await page.getByRole("button", { name: "Note actions" }).click();
            await page.getByRole("menuitem", { name: /Move/ }).click();
            const choice = page
              .getByRole("dialog")
              .getByRole("button", { name: dest.name });
            await expect(choice).toBeVisible();
            runs.push(
              await measure(page, anchor.id, "move", async () => {
                await choice.click();
                await expect(box).toBeFocused();
                await expect(row(b.id)).toHaveCount(0);
                await expect(row(anchor.id)).toBeVisible();
                await expect(page).toHaveURL(
                  new RegExp("/notes/" + b.id + "$"),
                );
              }),
            );
            expect(await api(notePath + "/" + b.id, owner.token)).toMatchObject(
              {
                folder: dest.id,
                revision: 2,
                body: b.body,
              },
            );
            if (cdp) {
              const complete = new Promise((resolve) =>
                cdp.once("Tracing.tracingComplete", resolve),
              );
              await cdp.send("Tracing.end");
              await complete;
              await info.attach("flicker-filmstrip", {
                body: JSON.stringify({ traceEvents: trace }),
                contentType: "application/json",
              });
            }
            await info.attach("flicker-samples", {
              body: JSON.stringify({
                engine,
                version: page.context().browser().version(),
                delay,
                repetition,
                commit: process.env.PERF_COMMIT,
                viewport: page.viewportSize(),
                runs,
              }),
              contentType: "application/json",
            });
          },
        );
      }
    }
  });
}
