const { test, expect } = require("./fixtures.cjs");

const mailpit = process.env.MAILPIT_URL || "http://127.0.0.1:8025";

/** Wait for a sign-in code email to `email` that is not in `seen`. */
async function nextCode(email, seen) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const search = await fetch(
      `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    const { messages } = await search.json();
    for (const { ID } of messages.filter(({ ID }) => !seen.has(ID))) {
      seen.add(ID);
      const message = await (
        await fetch(`${mailpit}/api/v1/message/${ID}`)
      ).json();
      const code = message.Text.match(/\b\d{8}\b/)?.[0];
      if (code) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No sign-in code arrived for ${email}`);
}

async function signIn(page, session, redirect) {
  await page.goto(
    `/auth/login${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`,
  );
  await page.locator('input[name="identity"]').fill(session.email);
  await page.locator('input[name="password"]').fill(session.password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
}

async function setTwoStep(page, session, state, seen) {
  await page.getByLabel("Current password").fill("not-my-password");
  await page.getByRole("button", { name: /Turn (on|off) two-step/ }).click();
  await expect(page.getByRole("alert")).toContainText("incorrect");
  await page.getByLabel("Current password").fill(session.password);
  await page.getByRole("button", { name: /Turn (on|off) two-step/ }).click();
  if (state === "On") {
    // Turning it on signs out every session; this tab signs back in with a code.
    await expect(page.getByText("every device and browser")).toBeVisible();
    await page
      .getByLabel("Sign-in code")
      .fill(await nextCode(session.email, seen));
    await page.getByRole("button", { name: "Verify and sign in" }).click();
  }
  await expect(page.getByTestId("mfa-status")).toHaveText(`Status: ${state}`);
}

for (const [label, viewport] of [
  ["desktop", { width: 1440, height: 1000 }],
  ["mobile", { width: 390, height: 844 }],
]) {
  test.describe(label, () => {
    test.use({ viewport });

    test("two-step sign-in: opt in from the user menu, code step, opt out", async ({
      page,
      session,
    }) => {
      const seen = new Set();
      try {
        await signIn(page, session);
        await expect(page).toHaveURL("/folders/all");

        if (label === "mobile")
          await page
            .getByRole("link", { name: "Folders", exact: true })
            .click();
        await page.getByRole("button", { name: /Jamie/ }).click();
        await page.getByRole("menuitem", { name: "Account security" }).click();
        await expect(page).toHaveURL(/\/account$/);
        await expect(page.getByTestId("mfa-status")).toHaveText("Status: Off");
        await setTwoStep(page, session, "On", seen);

        await page.goto("/auth/logout");
        await signIn(page, session, "/folders/all?page=2");
        await expect(
          page.getByRole("heading", { name: "Check your email" }),
        ).toBeVisible();
        await expect(page.getByText(session.email)).toBeVisible();
        await expect(
          page.getByRole("button", { name: /Send a new code in \d+s/ }),
        ).toBeDisabled();
        const code = await nextCode(session.email, seen);

        await page.getByLabel("Sign-in code").fill("00000000");
        await page.getByRole("button", { name: "Verify and sign in" }).click();
        await expect(page.getByRole("alert")).toContainText(
          "wrong or has expired",
        );
        await page.getByLabel("Sign-in code").fill(code);
        await page.getByRole("button", { name: "Verify and sign in" }).click();
        await expect(page).toHaveURL("/folders/all?page=2");
        await expect(
          page.getByRole("heading", { name: "All Notes", exact: true }),
        ).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          "Code step and app must fit the viewport",
        ).toBe(true);

        await page.goto("/account");
        await expect(page.getByTestId("mfa-status")).toHaveText("Status: On");
        await setTwoStep(page, session, "Off", seen);
        await page.goto("/auth/logout");
        await signIn(page, session);
        await expect(page).toHaveURL("/folders/all");
      } finally {
        if (seen.size)
          await fetch(`${mailpit}/api/v1/messages`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ IDs: [...seen] }),
          });
      }
    });
  });
}

test("unverified accounts are told to verify before turning it on", async ({
  page,
  session,
}) => {
  await signIn(page, session);
  await expect(page).toHaveURL("/folders/all");
  const response = await fetch(
    `${process.env.VITE_PB_URL}/api/collections/users/records/${session.account.id}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: session.admin.token,
      },
      body: JSON.stringify({ verified: false }),
    },
  );
  expect(response.ok).toBe(true);
  await page.goto("/account");
  await expect(
    page.getByText("Verify your email address before"),
  ).toBeVisible();
  await expect(page.getByLabel("Current password")).toHaveCount(0);
});

test("resend waits for the cooldown, then the newest code signs in", async ({
  page,
  session,
}) => {
  const seen = new Set();
  const response = await fetch(
    `${process.env.VITE_PB_URL}/api/collections/users/records/${session.account.id}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: session.admin.token,
      },
      body: JSON.stringify({ mfaEnabled: true }),
    },
  );
  expect(response.ok).toBe(true);
  try {
    await page.clock.install();
    await signIn(page, session);
    const first = await nextCode(session.email, seen);
    const resend = page.getByRole("button", { name: /Send a new code/ });
    await expect(resend).toBeDisabled();
    await page.clock.runFor(31_000);
    await expect(resend).toBeEnabled();
    await resend.click();
    const second = await nextCode(session.email, seen);
    expect(second).not.toBe(first);
    await page.getByLabel("Sign-in code").fill(second);
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await expect(page).toHaveURL("/folders/all");
  } finally {
    await fetch(`${mailpit}/api/v1/messages`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ IDs: [...seen] }),
    });
  }
});
