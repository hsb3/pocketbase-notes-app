const { test, expect, api } = require("../e2e/fixtures.cjs");
const { execFileSync } = require("node:child_process");
const os = require("node:os");

test("production editor loading baseline", async ({
  browser,
  session,
}, info) => {
  const origin = process.env.VITE_PB_URL;
  const html = await (await fetch(origin)).text();
  expect(html).not.toContain("/@vite/client");
  expect(html).toContain("/assets/");
  const auth = await api("collections/users/auth-with-password", "", "POST", {
    identity: session.email,
    password: session.password,
  });
  const storageState = {
    cookies: [],
    origins: [
      {
        origin: new URL(origin).origin,
        localStorage: [
          {
            name: "pocketbase_auth",
            value: JSON.stringify({ token: auth.token, model: auth.record }),
          },
        ],
      },
    ],
  };
  const fixtures = [];
  for (const [name, paragraphs] of [
    ["empty", 0],
    ["representative", 20],
    ["large", 200],
  ]) {
    const body = {
      type: "doc",
      content: paragraphs
        ? Array.from({ length: paragraphs }, (_, i) => ({
            type: "paragraph",
            content: [
              {
                type: "text",
                text: `Paragraph ${i}. ${"A measured thought with enough detail to edit. ".repeat(8)}`,
              },
            ],
          }))
        : [{ type: "paragraph" }],
    };
    const record = paragraphs
      ? await api("collections/entries/records", auth.token, "POST", {
          user: session.account.id,
          title: `Performance ${name}`,
          kind: "note",
          body,
        })
      : { id: "new" };
    fixtures.push({
      name,
      paragraphs,
      bytes: Buffer.byteLength(JSON.stringify(body)),
      id: record.id,
    });
  }
  // Deterministic, incompressible image data exercises protected-file requests.
  const imagePage = await browser.newPage();
  let png;
  try {
    png = Buffer.from(
      await imagePage.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 128;
        const ctx = canvas.getContext("2d");
        const pixels = ctx.createImageData(128, 128);
        let seed = 42;
        for (let i = 0; i < pixels.data.length; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          pixels.data[i] = i % 4 === 3 ? 255 : seed >>> 24;
        }
        ctx.putImageData(pixels, 0, 0);
        return canvas.toDataURL("image/png").split(",")[1];
      }),
      "base64",
    );
  } finally {
    await imagePage.close();
  }
  const attachments = [];
  for (let i = 0; i < 10; i++) {
    const form = new FormData();
    form.set("user", session.account.id);
    form.set("name", `baseline-${i}.png`);
    form.set(
      "file",
      new Blob([png], { type: "image/png" }),
      `baseline-${i}.png`,
    );
    const response = await fetch(
      `${origin}/api/collections/attachments/records`,
      {
        method: "POST",
        headers: { Authorization: auth.token },
        body: form,
      },
    );
    expect(response.ok, "Create synthetic image fixture").toBe(true);
    attachments.push((await response.json()).id);
  }
  const imageBody = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Ten private images" }],
      },
      ...attachments.map((id) => ({
        type: "image",
        attrs: { src: `attachment:${id}`, width: 128, height: 128 },
      })),
      { type: "paragraph" },
    ],
  };
  const imageEntry = await api(
    "collections/entries/records",
    auth.token,
    "POST",
    {
      user: session.account.id,
      title: "Performance attachments",
      kind: "note",
      body: imageBody,
      attachments,
    },
  );
  fixtures.push({
    name: "attachments",
    id: imageEntry.id,
    images: 10,
    imageBytes: png.length * 10,
    bytes: Buffer.byteLength(JSON.stringify(imageBody)),
  });
  fixtures.push({ name: "app-shell", id: "" });
  const runs = [];
  for (const profile of ["desktop", "simulated-mobile"]) {
    for (const fixture of fixtures) {
      for (let repetition = 1; repetition <= 5; repetition++) {
        const context = await browser.newContext({
          storageState,
          viewport:
            profile === "desktop"
              ? { width: 1440, height: 1000 }
              : { width: 390, height: 844 },
        });
        try {
          const page = await context.newPage();
          const cdp = await context.newCDPSession(page);
          await cdp.send("Network.enable");
          if (profile !== "desktop") {
            await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
            await cdp.send("Network.emulateNetworkConditions", {
              offline: false,
              latency: 100,
              downloadThroughput: 1_600_000 / 8,
              uploadThroughput: 750_000 / 8,
            });
          }
          await page.addInitScript(() => {
            window.longTasks = [];
            new PerformanceObserver((list) =>
              window.longTasks.push(
                ...list
                  .getEntries()
                  .map(({ startTime, duration }) => ({ startTime, duration })),
              ),
            ).observe({ type: "longtask", buffered: true });
          });
          for (const cache of ["cold", "warm"]) {
            if (cache === "cold") await cdp.send("Network.clearBrowserCache");
            await page.goto(`${origin}/entries/${fixture.id}`, {
              waitUntil: "domcontentloaded",
            });
            const shell = fixture.name === "app-shell";
            const editor = shell
              ? page.getByRole("link", { name: "New note", exact: true })
              : page.getByRole("textbox", { name: "Entry body" });
            if (shell) await expect(editor).toBeVisible({ timeout: 60_000 });
            else await expect(editor).toBeEditable({ timeout: 60_000 });
            const editableMs = await page.evaluate(() => performance.now());
            if (!shell) {
              await editor.press("ControlOrMeta+End");
              await editor.pressSequentially("baseline-input");
              await expect(editor).toContainText("baseline-input");
            }
            const metrics = await page.evaluate(() => ({
              inputConfirmedMs: performance.now(),
              longTasks: window.longTasks,
              resources: performance
                .getEntriesByType("resource")
                .map(({ name, duration, transferSize, encodedBodySize }) => ({
                  name: new URL(name).pathname,
                  duration,
                  transferSize,
                  encodedBodySize,
                })),
            }));
            let imagesReadyMs = null;
            if (fixture.images) {
              await expect(page.getByAltText("Attached image")).toHaveCount(
                fixture.images,
                { timeout: 60_000 },
              );
              await page.waitForFunction(
                () =>
                  [
                    ...document.querySelectorAll('img[alt="Attached image"]'),
                  ].every((img) => img.complete && img.naturalWidth > 0),
                undefined,
                { timeout: 60_000 },
              );
              imagesReadyMs = await page.evaluate(() => performance.now());
            }
            runs.push({
              profile,
              fixture: fixture.name,
              repetition,
              cache,
              editableMs,
              imagesReadyMs,
              ...metrics,
              inputConfirmedMs: shell ? null : metrics.inputConfirmedMs,
            });
            console.log(
              `${profile} ${fixture.name} ${cache} run ${repetition}: ${editableMs.toFixed(0)}ms`,
            );
            // Undo the probe so reloading does not discard an unsaved user edit.
            if (!shell) await editor.press("ControlOrMeta+z");
          }
        } finally {
          await context.close();
        }
      }
    }
  }
  const report = {
    capturedAt: new Date().toISOString(),
    commit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    workingTree: execFileSync("git", ["status", "--short"], {
      encoding: "utf8",
    }).trim(),
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpu: os.cpus()[0].model,
    browser: browser.version(),
    fixtures,
    profiles: {
      desktop: "unthrottled localhost",
      "simulated-mobile":
        "4x CPU, 100ms latency, 1.6Mbps download, 750Kbps upload; viewport only, not a real phone",
    },
    runs,
  };
  await info.attach("editor-baseline", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });
  for (const profile of ["desktop", "simulated-mobile"])
    for (const fixture of fixtures)
      for (const cache of ["cold", "warm"]) {
        const values = runs
          .filter(
            (r) =>
              r.profile === profile &&
              r.fixture === fixture.name &&
              r.cache === cache,
          )
          .map((r) => r.editableMs)
          .sort((a, b) => a - b);
        console.log(
          `${profile} ${fixture.name} ${cache}: median ${values[2].toFixed(0)}ms, range ${values[0].toFixed(0)}–${values[4].toFixed(0)}ms`,
        );
      }
});
