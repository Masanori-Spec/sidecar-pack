import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test",
  testMatch: "**/browser.spec.js",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1440, height: 1000 },
    headless: true,
    launchOptions: { chromiumSandbox: true },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    acceptDownloads: true,
  },
  webServer: {
    command: "npm run build && node scripts/serve.mjs --root dist --port 4173",
    url: "http://127.0.0.1:4173/web/index.html",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
