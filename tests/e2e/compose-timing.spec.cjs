const { test, expect } = require("./fixtures.cjs");

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test("SC-001 warm Compose accepts one scheduled key per tap", async ({
  page,
  session,
}, info) => {
  const editor = '[contenteditable="true"][aria-label="Note"]';
  const compose = page.getByRole("button", { name: "Compose", exact: true });
  const editorChunk = /\/assets\/editor-[\w-]+\.js$/;
  const requests = [];
  page.on("request", (request) => {
    if (editorChunk.test(new URL(request.url()).pathname))
      requests.push(new URL(page.url()).pathname);
  });
  await page.goto("/auth/login");
  await page.locator('[name="identity"]').fill(session.email);
  await page.locator('[name="password"]').fill(session.password);
  const start = page.waitForResponse((response) =>
    editorChunk.test(new URL(response.url()).pathname),
  );
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL(/\/folders\/all$/);
  const chunk = await start;
  expect(requests).toEqual(["/folders/all"]);
  expect(chunk.ok()).toBe(true);
  expect(await chunk.finished()).toBeNull();
  console.log(
    "SC-001 preload",
    info.project.name,
    new URL(chunk.url()).pathname,
  );
  await page.evaluate((selector) => {
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (event.target.closest('button[aria-label="Compose"]'))
          window.trial = { tap: performance.now(), inputs: [] };
      },
      true,
    );
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "x" && window.trial)
          window.trial.key = performance.now();
      },
      true,
    );
    document.addEventListener(
      "input",
      (event) => {
        if (window.trial)
          window.trial.inputs.push({
            time: performance.now(),
            focused:
              document.activeElement === event.target &&
              event.target.matches(selector),
          });
      },
      true,
    );
  }, editor);

  const results = [];
  const draftPaths = new Set();
  for (let trial = 1; trial <= 20; trial++) {
    await page.evaluate(() => {
      window.trial = null;
    });
    await compose.tap();
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          setTimeout(
            resolve,
            Math.max(
              0,
              (window.trial?.tap ?? performance.now()) +
                500 -
                performance.now(),
            ),
          );
        }),
    );
    await page.keyboard.press("x");
    const result = await page.evaluate((selector) => {
      const { tap, key, inputs = [] } = window.trial ?? {};
      const text = document.querySelector(selector)?.textContent;
      const elapsed = inputs.length ? inputs[0].time - tap : null;
      const dispatch = key - tap;
      return {
        tap,
        key,
        inputs,
        text: text ?? null,
        elapsed,
        dispatch,
        pass:
          dispatch >= 490 &&
          dispatch <= 650 &&
          inputs.length === 1 &&
          inputs[0].focused &&
          elapsed >= 0 &&
          elapsed <= 1000 &&
          text === "x",
      };
    }, editor);
    const path = new URL(page.url()).pathname;
    result.pass &&=
      /^\/notes\/[a-z0-9]{15}$/.test(path) && !draftPaths.has(path);
    draftPaths.add(path);
    results.push(result);
    console.log("SC-001", info.project.name, trial, JSON.stringify(result));
    if (path !== "/folders/all")
      await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page).toHaveURL(/\/folders\/all$/);
  }
  const hits = results.filter((item) => item.pass).length;
  console.log(
    "SC-001 total",
    info.project.name,
    hits + "/20",
    "misses",
    20 - hits,
  );
  expect(hits).toBeGreaterThanOrEqual(19);
});
