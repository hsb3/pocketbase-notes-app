const { test, expect } = require("./fixtures.cjs");

async function fillLogin(page, session) {
  await page.locator('input[name="identity"]').fill(session.email);
  await page.locator('input[name="password"]').fill(session.password);
}

for (const target of ["https://example.invalid/", "//example.invalid/"]) {
  test(`login rejects external return URL ${target}`, async ({
    page,
    session,
  }) => {
    await page.route("https://example.invalid/**", (route) =>
      route.fulfill({ body: "External destination" }),
    );
    await page.goto(`/auth/login?redirect=${encodeURIComponent(target)}`);
    await fillLogin(page, session);
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await expect(page).toHaveURL("/folders/all");
    // The already-authenticated route guard must apply the same policy.
    await page.goto(`/auth/login?redirect=${encodeURIComponent(target)}`);
    await expect(page).toHaveURL("/folders/all");
  });
}

test("login remains pending until the real authentication response completes", async ({
  page,
  session,
}) => {
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  let received;
  const reached = new Promise((resolve) => {
    received = resolve;
  });
  await page.route(
    "**/api/collections/users/auth-with-password",
    async (route) => {
      const response = await route.fetch();
      received();
      await held;
      await route.fulfill({ response });
    },
  );
  await page.goto("/auth/login?redirect=%2Ffolders%2Fall%3Fpage%3D2");
  await fillLogin(page, session);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await reached;
  try {
    await expect(
      page.getByRole("button", { name: "Login", exact: true }),
    ).toBeDisabled();
  } finally {
    release();
  }
  await expect(page).toHaveURL("/folders/all?page=2");
  await expect(
    page.getByRole("heading", { name: "All Notes", exact: true }),
  ).toBeVisible();
});

test("password reset remains pending until Mailpit delivery completes", async ({
  page,
  session,
}) => {
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  let received;
  const reached = new Promise((resolve) => {
    received = resolve;
  });
  await page.route(
    "**/api/collections/users/request-password-reset",
    async (route) => {
      const response = await route.fetch();
      received();
      await held;
      await route.fulfill({ response });
    },
  );
  await page.goto("/auth/password-reset");
  await page.locator('input[name="email"]').fill(session.email);
  await page
    .getByRole("button", { name: "Reset Password", exact: true })
    .click();
  await reached;
  try {
    await expect(
      page.getByRole("button", { name: "Reset Password", exact: true }),
    ).toBeDisabled();
  } finally {
    release();
  }
  await expect(
    page.getByText("The password reset link has been sent", { exact: false }),
  ).toBeVisible();
});

test("verification resend reports network failure and permits retry", async ({
  page,
  session,
}) => {
  await page.clock.install();
  await page.route("**/api/collections/users/request-verification", (route) =>
    route.abort(),
  );
  await page.goto(
    `/auth/email-verification?email=${encodeURIComponent(session.email)}`,
  );
  for (let second = 0; second < 61; second++) {
    await page.clock.runFor(1000);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(resolve)),
    );
  }
  const resend = page.getByRole("button", { name: "Resend verification link" });
  await resend.click();
  await expect(page.getByRole("alert")).toContainText("Could not send");
  await expect(resend).toBeEnabled();
});
