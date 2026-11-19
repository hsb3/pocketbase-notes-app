const { test, expect, api } = require("./fixtures.cjs");

test("ordinary accounts never see the admin shortcut", async ({
  page,
  session,
}) => {
  await page.goto("/auth/login");
  await page.locator('input[name="identity"]').fill(session.email);
  await page.locator('input[name="password"]').fill(session.password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("/folders/all");
  await page.getByRole("button", { name: new RegExp(session.email) }).click();
  await expect(page.getByRole("menuitem", { name: "Log out" })).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "PocketBase admin", exact: true }),
  ).toHaveCount(0);
});

test("account menu opens the separate PocketBase admin login", async ({
  page,
  context,
  session,
}) => {
  const superuser = await api(
    "collections/_superusers/records",
    session.admin.token,
    "POST",
    {
      email: session.email,
      password: session.password,
      passwordConfirm: session.password,
    },
  );
  try {
    await page.goto("/auth/login");
    await page.locator('input[name="identity"]').fill(session.email);
    await page.locator('input[name="password"]').fill(session.password);
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await expect(page).toHaveURL("/folders/all");
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
    await expect(page).toHaveURL("/folders/all");
    await admin.close();
    await page.route("**/api/notes/capabilities", (route) => route.abort());
    await page.reload();
    await page.getByRole("button", { name: new RegExp(session.email) }).click();
    await expect(page.getByRole("menuitem", { name: "Log out" })).toBeVisible();
    await expect(link).toHaveCount(0);
    await page.unroute("**/api/notes/capabilities");
    await page.reload();
    await page.getByRole("button", { name: new RegExp(session.email) }).click();
    await expect(link).toBeVisible();
    // A second tab changes the SDK auth store; the first must drop its old capability.
    const otherPassword = crypto.randomUUID();
    const other = await api(
      "collections/users/records",
      session.admin.token,
      "POST",
      {
        email: `ordinary-${crypto.randomUUID()}@example.com`,
        password: otherPassword,
        passwordConfirm: otherPassword,
        verified: true,
      },
    );
    try {
      const auth = await api(
        "collections/users/auth-with-password",
        "",
        "POST",
        {
          identity: other.email,
          password: otherPassword,
        },
      );
      const second = await context.newPage();
      await second.goto("/folders/all");
      await second.evaluate(
        (auth) =>
          localStorage.setItem(
            "pocketbase_auth",
            JSON.stringify({ token: auth.token, record: auth.record }),
          ),
        auth,
      );
      await expect(link).toHaveCount(0);
      await second.close();
    } finally {
      await api(
        `collections/users/records/${other.id}`,
        session.admin.token,
        "DELETE",
      );
    }
  } finally {
    await api(
      `collections/_superusers/records/${superuser.id}`,
      session.admin.token,
      "DELETE",
    );
  }
});
