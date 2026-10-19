import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { defineConfig } from "@playwright/test";

if (existsSync(".env")) loadEnvFile(".env");
const backend = process.env.VITE_PB_URL;
const appURL = process.env.TEST_APP_URL || "http://127.0.0.1:4173";
for (const value of [backend, appURL]) {
  assert(
    value &&
      ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname),
    "Tests require local VITE_PB_URL and TEST_APP_URL addresses.",
  );
}
assert(
  process.env.PB_EMAIL && process.env.PB_PASSWORD,
  "Set test superuser credentials in .env",
);

export default defineConfig({
  testDir: "./tests/e2e",
  projects: ["chromium", "webkit"].map((name) => ({
    name,
    use: { browserName: name as "chromium" | "webkit" },
  })),
  testMatch: "**/*.spec.cjs",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "test-results",
  use: {
    browserName: "chromium",
    baseURL: appURL,
    viewport: { width: 1440, height: 1000 },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.TEST_APP_URL
    ? undefined
    : {
        command: "bun run dev --host 127.0.0.1 --port 4173 --strictPort",
        url: appURL,
        reuseExistingServer: false,
        env: { VITE_AUTH_BYPASS: "false" },
        timeout: 60_000,
      },
});
