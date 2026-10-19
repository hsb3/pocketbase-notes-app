const { test, expect } = require("./fixtures.cjs");

test("account menu opens the separate PocketBase admin login", async ({
  page,
  context,
  session,
}) => {
  await page.goto("/auth/login");
  await page.locator('input[name="identity"]').fill(session.email);
  await page.locator('input[name="password"]').fill(session.password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.waitForURL("**/entries**");
  await page
    .getByRole("button", {
      name: new RegExp(session.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    })
    .click();
  const link = page.getByRole("menuitem", {
    name: "PocketBase admin",
    exact: true,
  });
  await expect(link).toHaveAttribute(
    "href",
    `${process.env.VITE_PB_URL.replace(/\/$/, "")}/_/`,
  );
  const opened = context.waitForEvent("page");
  await link.click();
  const admin = await opened;
  await admin.waitForLoadState("domcontentloaded");
  await expect(admin).toHaveURL(new RegExp("/_/"));
  await expect(admin.locator('input[type="password"]')).toBeVisible();
  await expect(page).toHaveURL(/\/entries/);
  await admin.close();
});
