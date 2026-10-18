import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright end-to-end configuration.
 *
 * Browsers are NOT installed by `npm install`. Before the first run:
 *   npm run test:e2e:install     # downloads Chromium
 *   npm run test:e2e
 *
 * The web server boots in demo mode, so no credentials are required.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- --port 3100",
        url: "http://127.0.0.1:3100/login",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: {
          SENTINEL_MODE: "demo",
          SENTINEL_DATA_DIR: ".data/e2e",
          SESSION_SECRET: "e2e-only-session-secret-not-for-production-use",
          SENTINEL_ALLOW_DEV_RESET: "true",
        },
      },
});
