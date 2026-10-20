import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";
import { chromium, expect } from "@playwright/test";
import PocketBase from "pocketbase";

loadEnvFile("deploy/railway/.env");
assert.equal(process.env.PB_URL, "https://notes-staging.up.railway.app");
const admin = new PocketBase(process.env.PB_URL);
await admin
  .collection("_superusers")
  .authWithPassword(
    process.env.PB_ADMIN_EMAIL!,
    process.env.PB_ADMIN_PASSWORD!,
  );
const user = new PocketBase(process.env.PB_URL);
await user
  .collection("users")
  .authWithPassword(process.env.PB_USER_EMAIL!, process.env.PB_USER_PASSWORD!);
for (const client of [new PocketBase(process.env.PB_URL), user]) {
  const password = crypto.randomUUID();
  let status = 200;
  try {
    const created = await client.collection("users").create({
      email: `signup-${crypto.randomUUID()}@example.invalid`,
      password,
      passwordConfirm: password,
    });
    await admin.collection("users").delete(created.id);
  } catch (error) {
    status = (error as { status: number }).status;
  }
  assert.equal(status, 403, "Public/non-admin signup must be forbidden");
}
const password = crypto.randomUUID();
const controlled = await admin.collection("users").create({
  email: `admin-check-${crypto.randomUUID()}@example.invalid`,
  password,
  passwordConfirm: password,
});
await admin.collection("users").delete(controlled.id);
await Bun.sleep(3500);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(`${process.env.PB_URL}/auth/login`);
  await expect(
    page.getByRole("link", { name: "Register", exact: true }),
  ).toHaveCount(0);
  await page.goto(`${process.env.PB_URL}/auth/register`);
  await expect(
    page.getByText("Account creation is disabled.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Register", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "/private/tmp/agents/pocketbase-notes-app/codex-deploy/signup-disabled.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Back to login", exact: true }).click();
  await page.locator('input[name="identity"]').fill(process.env.PB_USER_EMAIL!);
  await page
    .locator('input[name="password"]')
    .fill(process.env.PB_USER_PASSWORD!);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.waitForURL("**/entries**");
  await page.screenshot({
    path: "/private/tmp/agents/pocketbase-notes-app/codex-deploy/final-app.png",
    fullPage: true,
  });
  const users = await admin.collection("users").getFullList();
  assert(
    users.some((u) => u.email === "hsburden3@outlook.com"),
    "Preserve owner's additional account",
  );
  assert(
    !users.some((u) =>
      ["admin@example.com", "user@example.com"].includes(u.email),
    ),
  );
  const result = {
    anonymousSignup: 403,
    nonAdminSignup: 403,
    adminCreation: true,
    existingLogin: true,
    registrationUI: false,
    users: users.length,
    entries: (await admin.collection("entries").getList(1, 1)).totalItems,
    attachments: (await admin.collection("attachments").getList(1, 1))
      .totalItems,
  };
  await Bun.write(
    "/private/tmp/agents/pocketbase-notes-app/codex-deploy/signup-check.json",
    JSON.stringify(result),
  );
  process.stdout.write(
    `PASS: deployed signup policy and UI; ${result.users} existing users preserved.\n`,
  );
} finally {
  await browser.close();
}
