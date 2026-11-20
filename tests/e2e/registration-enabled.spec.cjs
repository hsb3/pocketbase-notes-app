const { test, expect, api } = require("./fixtures.cjs");

test("enabled signup stays pending and retries verification without recreating the account", async ({
  page,
  session,
}, testInfo) => {
  const email = `registration-${crypto.randomUUID()}@example.com`;
  const password = crypto.randomUUID();
  let createdId;
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  let received;
  const reached = new Promise((resolve) => {
    received = resolve;
  });
  let creates = 0;
  await page.route("**/api/collections/users/records", async (route) => {
    creates++;
    const response = await route.fetch();
    createdId = (await response.json()).id;
    received();
    await held;
    await route.fulfill({ response });
  });
  await page.route("**/api/collections/users/request-verification", (route) =>
    route.abort(),
  );
  try {
    await page.goto("/auth/register");
    await expect(
      page.getByRole("button", { name: "Register", exact: true }),
    ).toBeVisible();
    await page.locator('input[name="name"]').fill("Registration test");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('input[name="passwordConfirm"]').fill(password);
    const register = page.getByRole("button", {
      name: "Register",
      exact: true,
    });
    await register.click();
    await reached;
    try {
      await expect.soft(register).toBeDisabled({ timeout: 1000 });
    } finally {
      release();
    }
    await expect(
      page.getByText(
        "Account created, but the verification email could not be sent",
        { exact: false },
      ),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("verification-retry.png"),
    });
    await page.unroute("**/api/collections/users/request-verification");
    await page
      .getByRole("button", { name: "Retry verification", exact: true })
      .click();
    await expect(page).toHaveURL(/\/auth\/email-verification/);
    expect(creates).toBe(1);
    expect(createdId).toBeTruthy();
  } finally {
    release();
    if (createdId)
      await api(
        `collections/users/records/${createdId}`,
        session.admin.token,
        "DELETE",
      );
  }
});
