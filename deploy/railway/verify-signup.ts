import { evidenceDirectory } from "./evidence";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import PocketBase, { ClientResponseError } from "pocketbase";
import {
  deploymentURL,
  deploymentAdmin,
  createVerificationUser,
  verificationFailure,
} from "./verification";

async function main() {
  const admin = await deploymentAdmin();
  const fixture = await createVerificationUser(admin);
  let browser;
  try {
    for (const client of [new PocketBase(deploymentURL), fixture.client]) {
      const password = crypto.randomUUID();
      let denied = false;
      let unexpectedId: string | undefined;
      try {
        const unexpected = await client.collection("users").create({
          email: `signup-${crypto.randomUUID()}@example.invalid`,
          password,
          passwordConfirm: password,
        });
        unexpectedId = unexpected.id;
      } catch (error) {
        if (!(error instanceof ClientResponseError) || error.status !== 403)
          throw error;
        denied = true;
      }
      if (unexpectedId) await admin.collection("users").delete(unexpectedId);
      assert(denied, "Public/non-admin signup must be forbidden");
    }
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(`${deploymentURL}/auth/login`);
    await expect(
      page.getByRole("link", { name: "Register", exact: true }),
    ).toHaveCount(0);
    await page.goto(`${deploymentURL}/auth/register`);
    await expect(
      page.getByText("Account creation is disabled.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Register", exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: `${evidenceDirectory}/signup-disabled.png`,
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "Back to login", exact: true })
      .click();
    await page.getByLabel("Email", { exact: true }).fill(fixture.email);
    await page.getByLabel("Password", { exact: true }).fill(fixture.password);
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await page.waitForURL("**/folders/all");
    await expect(page.getByRole("button", { name: "Compose" })).toBeEnabled();
    await Bun.write(
      `${evidenceDirectory}/signup-check.json`,
      JSON.stringify({
        anonymousSignup: 403,
        nonAdminSignup: 403,
        adminCreation: true,
        fixtureLogin: true,
        registrationUI: false,
      }),
    );
    process.stdout.write(
      "PASS: deployed signup policy and disposable-account login",
    );
  } finally {
    try {
      await browser?.close();
    } finally {
      await fixture.cleanup();
    }
  }
}
main().catch(verificationFailure);
