const { test, expect } = require("./fixtures.cjs");

const viewports = {
  desktop: { width: 1440, height: 1000 },
  mobile: { width: 390, height: 844 },
};
const html = (page) => page.locator("html");
const stored = (page) => page.evaluate(() => localStorage.getItem("theme"));

async function expectTheme(page, theme) {
  if (theme === "dark")
    await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/);
  else await expect(html(page)).not.toHaveClass(/(^|\s)dark(\s|$)/);
  await expect(html(page)).toHaveCSS("color-scheme", theme);
}

async function login(page, { email, password }) {
  await page.goto("/auth/login");
  await page.locator('input[name="identity"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("/folders/all");
}

async function openUserMenu(page) {
  await page.getByRole("button", { name: /Jamie/ }).click();
  return page.getByRole("group", { name: "Theme" });
}
const signedOutControl = (page) =>
  page.getByRole("radiogroup", { name: "Theme" });

for (const [name, viewport] of Object.entries(viewports)) {
  const mobile = name === "mobile";

  test.describe(`theme on ${name}`, () => {
    test.use({ viewport });

    test("defaults to System and follows the OS live", async ({ page }) => {
      await page.emulateMedia({ colorScheme: "dark" });
      await page.goto("/auth/login");
      const theme = signedOutControl(page);
      await expect(theme.getByRole("radio", { name: "System" })).toBeChecked();
      await expectTheme(page, "dark");
      expect(await stored(page)).toBeNull();

      await page.emulateMedia({ colorScheme: "light" });
      await expectTheme(page, "light");
      await page.emulateMedia({ colorScheme: "dark" });
      await expectTheme(page, "dark");
    });

    test("signed-out control toggles, persists and is in view", async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: "light" });
      await page.goto("/auth/login");
      const theme = signedOutControl(page);
      await expect(theme).toBeInViewport({ ratio: 1 });

      await theme.getByRole("radio", { name: "Dark" }).click();
      await expectTheme(page, "dark");
      expect(await stored(page)).toBe("dark");

      await page.reload();
      await expect(theme.getByRole("radio", { name: "Dark" })).toBeChecked();
      await expectTheme(page, "dark");

      // An explicit choice wins over the OS, on every signed-out screen.
      await page.goto("/auth/password-reset");
      await page.emulateMedia({ colorScheme: "dark" });
      await theme.getByRole("radio", { name: "Light" }).click();
      await expectTheme(page, "light");
      await page.reload();
      await expectTheme(page, "light");

      await theme.getByRole("radio", { name: "System" }).click();
      await expectTheme(page, "dark");
      expect(await stored(page)).toBe("system");
    });

    test("signed-out control works from the keyboard", async ({ page }) => {
      await page.emulateMedia({ colorScheme: "light" });
      await page.goto("/auth/login");
      const theme = signedOutControl(page);
      await theme.getByRole("radio", { name: "System" }).focus();
      await page.keyboard.press("ArrowLeft");
      await expect(theme.getByRole("radio", { name: "Dark" })).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(theme.getByRole("radio", { name: "Dark" })).toBeChecked();
      await expectTheme(page, "dark");
    });

    test("stored theme is applied before first paint", async ({ page }) => {
      await page.emulateMedia({ colorScheme: "light" });
      await page.addInitScript(() => {
        localStorage.setItem("theme", "dark");
        new MutationObserver(() => {
          if (document.documentElement.classList.contains("dark"))
            window.__darkBeforeBody ??= document.body === null;
        }).observe(document, {
          subtree: true,
          attributes: true,
          attributeFilter: ["class"],
        });
      });
      // No application script may run: only the inline head script is left.
      await page.route("**/*", (route) =>
        route.request().resourceType() === "script"
          ? route.abort()
          : route.continue(),
      );
      await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
      await expectTheme(page, "dark");
      expect(await page.evaluate(() => window.__darkBeforeBody)).toBe(true);
      await expect(page.locator("#root")).toBeEmpty();
    });

    test("signed-in user menu switches and persists the theme", async ({
      page,
      session,
    }) => {
      await page.emulateMedia({ colorScheme: "light" });
      await login(page, session);
      await expectTheme(page, "light");

      if (mobile)
        await page.getByRole("link", { name: "Folders", exact: true }).click();
      let theme = await openUserMenu(page);
      await expect(
        theme.getByRole("menuitemradio", { name: "System" }),
      ).toBeChecked();
      await expect(theme).toBeInViewport({ ratio: 1 });
      await theme.getByRole("menuitemradio", { name: "Dark" }).click();
      await expectTheme(page, "dark");
      expect(await stored(page)).toBe("dark");

      // Keyboard: the menu stays open after a choice, arrows move, Enter picks.
      await expect(
        theme.getByRole("menuitemradio", { name: "Dark" }),
      ).toBeFocused();
      await page.keyboard.press("ArrowUp");
      await expect(
        theme.getByRole("menuitemradio", { name: "Light" }),
      ).toBeFocused();
      await page.keyboard.press("Enter");
      await expectTheme(page, "light");
      await page.keyboard.press("ArrowDown");
      await expect(
        theme.getByRole("menuitemradio", { name: "Dark" }),
      ).toBeFocused();
      await page.keyboard.press("Enter");
      await expectTheme(page, "dark");

      await page.reload();
      await expectTheme(page, "dark");
      theme = await openUserMenu(page);
      await expect(
        theme.getByRole("menuitemradio", { name: "Dark" }),
      ).toBeChecked();
    });
  });
}
