const { test, expect } = require("../e2e/fixtures.cjs");
const { evidence } = require("../e2e/note-helpers.cjs");
const { seedTrial, driveTrial, measure } = require("./continuity-trial.cjs");

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
    probe.skip(
      process.env.CONTAINED_TEST !== "1",
      "Use the contained performance profile",
    );
    for (const delay of [0, 120]) {
      for (const repetition of [1, 2, 3]) {
        probe(
          `flicker ${delay}ms reads run ${repetition}`,
          async ({ page, session }, info) => {
            test.setTimeout(75_000);
            const trial = await seedTrial(page, session);
            const html = await (await page.request.get("/")).text();
            expect(html).toContain("/assets/");
            expect(html).not.toContain("/@vite/client");

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
            await driveTrial(page, trial, {
              readDelay: delay,
              observe: async (operation, action) => {
                runs.push(
                  await measure(page, trial.anchor.id, operation, action),
                );
              },
            });
            if (cdp) {
              const complete = new Promise((resolve) =>
                cdp.once("Tracing.tracingComplete", resolve),
              );
              await cdp.send("Tracing.end");
              await complete;
              await evidence(info, "flicker-filmstrip", { traceEvents: trace });
            }
            await evidence(info, "flicker-samples", {
              engine,
              version: page.context().browser().version(),
              delay,
              repetition,
              commit: process.env.PERF_COMMIT,
              viewport: page.viewportSize(),
              runs,
            });
          },
        );
      }
    }
  });
}
