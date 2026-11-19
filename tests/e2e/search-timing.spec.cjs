const { test, expect, api } = require("./fixtures.cjs");
const {
  doc,
  login,
  ownerData,
  seedNote,
  notePath,
  button,
} = require("./note-helpers.cjs");

const fields = "id,folder,title,updated,snippet";

for (const [width, height] of [
  [390, 844],
  [810, 1080],
  [1440, 1000],
]) {
  test.describe(`Search timing at ${width}px`, () => {
    test.use({ viewport: { width, height } });
    test(
      `100 notes at ${width}px`,
      { tag: "@sc004" },
      async ({ page, session, browserName }, info) => {
        const owner = await ownerData(session);
        const folders = [{ id: owner.folder, name: "Notes" }];
        const manifest = [];
        const payload = { engine: browserName, width, counts: [], samples: [] };
        try {
          for (let f = 1; f < 5; f++) {
            folders.push(
              await api("collections/folders/records", owner.token, "POST", {
                user: owner.user,
                name: "Notebook " + f,
              }),
            );
          }
          const list = await api("collections/folders/records", owner.token);
          expect(list.items.map((x) => x.id).sort()).toEqual(
            folders.map((x) => x.id).sort(),
          );
          for (const [f, folder] of folders.entries()) {
            for (let n = 0; n < 20; n++) {
              const title = `Observation ${f}-${n}`;
              const term = n < 4 ? crypto.randomUUID() : "";
              const body =
                "A quiet morning. ".repeat(10) +
                (term ? "near " + term + " beyond" : "usual writing");
              const { id } = await seedNote(
                { ...owner, folder: folder.id },
                doc(title, body),
              );
              if (term)
                manifest.push({
                  id,
                  title,
                  folder: folder.name,
                  term,
                  context: "near " + term + " beyond",
                });
            }
          }
          const active = await api(
            notePath +
              "?perPage=100&filter=" +
              encodeURIComponent('deleted = ""'),
            owner.token,
          );
          expect(active.totalItems).toBe(100);
          payload.counts = folders.map(
            (f) => active.items.filter((n) => n.folder === f.id).length,
          );
          expect(payload.counts).toEqual([20, 20, 20, 20, 20]);
          expect(new Set(manifest.map((x) => x.term)).size).toBe(20);
          for (const target of manifest) {
            expect(
              active.items
                .filter((n) => n.text.includes(target.term))
                .map((n) => n.id),
            ).toEqual([target.id]);
          }

          await login(page, session);
          await page.goto("/folders/" + owner.folder);
          const region = page.getByRole("region", { name: "Note list" });
          const search = region.getByRole("searchbox", {
            name: "Search",
            exact: true,
          });
          const ordinary = region
            .getByRole("link")
            .filter({ hasText: "Observation 0-" });
          let details = 0;
          page.on("request", (req) => {
            if (/\/collections\/notes\/records\/[a-z0-9]{15}/.test(req.url()))
              details++;
          });
          for (const [i, target] of manifest.entries()) {
            if (i) await button(page, "Clear").click();
            await expect(ordinary).toHaveCount(20);
            await expect(search).toBeVisible({ timeout: 2500 });
            await expect(search).toHaveValue("");
            await search.evaluate((field, expected) => {
              window.sc004 = new Promise((resolve) => {
                field.addEventListener(
                  "input",
                  () => {
                    const start = performance.now();
                    const sample = () => {
                      const rows = document.querySelectorAll(
                        '[aria-label="Note list"] a[href^="/notes/"]',
                      );
                      const row = rows[0];
                      const mark = row?.querySelector("mark");
                      if (
                        rows.length !== 1 ||
                        !row.getClientRects().length ||
                        !row.href.endsWith("/notes/" + expected.id) ||
                        !row.innerText.split("\n").includes(expected.title) ||
                        !row.innerText.split("\n").includes(expected.folder) ||
                        mark?.textContent !== expected.term ||
                        !mark.parentElement.textContent.includes(
                          expected.context,
                        )
                      )
                        return null;
                      return {
                        id: row.getAttribute("href").split("/").pop(),
                        mark: mark.textContent,
                      };
                    };
                    function painted() {
                      if (sample())
                        requestAnimationFrame(() => {
                          const actual = sample();
                          if (actual)
                            resolve({
                              ...actual,
                              elapsed: performance.now() - start,
                            });
                          else requestAnimationFrame(painted);
                        });
                      else requestAnimationFrame(painted);
                    }
                    if (field.value === expected.term)
                      requestAnimationFrame(painted);
                  },
                  { once: true, capture: true },
                );
              });
            }, target);
            const reply = page.waitForResponse(
              (r) =>
                new URL(r.url()).searchParams.get("searchTerm") === target.term,
            );
            await search.fill(target.term);
            await search.press("Enter");
            const response = await reply;
            expect(response.status()).toBe(200);
            expect(new URL(response.url()).searchParams.get("fields")).toBe(
              fields,
            );
            const result = await response.json();
            expect(result.totalItems).toBe(1);
            expect(Object.keys(result.items[0]).sort()).toEqual(
              fields.split(",").sort(),
            );
            expect(result.items[0].id).toBe(target.id);
            await expect(region.locator("mark")).toHaveText(target.term);
            const actual = await page.evaluate(() => window.sc004);
            payload.samples.push({
              trial: i + 1,
              expectedId: target.id,
              term: target.term,
              actualId: actual.id,
              mark: actual.mark,
              elapsed: actual.elapsed,
              correct: actual.id === target.id && details === 0,
            });
            expect(details).toBe(0);
          }
        } finally {
          await info.attach("sc004-samples", {
            body: Buffer.from(JSON.stringify(payload)),
            contentType: "application/json",
          });
        }
      },
    );
  });
}
