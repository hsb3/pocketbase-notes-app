const { test, expect, api } = require("./fixtures.cjs");

test("signup form is disabled by default while existing accounts can log in", async ({
  page,
  request,
  session,
}) => {
  const password = crypto.randomUUID();
  const response = await request.post(
    `${process.env.VITE_PB_URL}/api/collections/users/records`,
    {
      data: {
        email: `signup-${crypto.randomUUID()}@example.invalid`,
        password,
        passwordConfirm: password,
      },
    },
  );
  if (response.ok()) {
    const created = await response.json();
    await api(
      `collections/users/records/${created.id}`,
      session.admin.token,
      "DELETE",
    );
  }
  expect(response.status()).toBe(403);
  await page.goto("/auth/login");
  await expect(
    page.getByRole("link", { name: "Register", exact: true }),
  ).toHaveCount(0);
  await page.goto("/auth/register");
  await expect(
    page.getByText("Account creation is disabled.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Register", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Back to login", exact: true }).click();
  await page.locator('input[name="identity"]').fill(session.email);
  await page.locator('input[name="password"]').fill(session.password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.waitForURL("**/entries**");
});
