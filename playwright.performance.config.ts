import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// The local Docker image serves the production build and API on the same origin.
const { webServer: _devServer, ...shared } = base;
export default defineConfig({
  ...shared,
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  testDir: "./tests/performance",
  outputDir: "test-results/performance",
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/performance", open: "never" }],
  ],
  timeout: 900_000,
  webServer: undefined,
  use: { ...base.use, baseURL: process.env.VITE_PB_URL, trace: "off" },
});
