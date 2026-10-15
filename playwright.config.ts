import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  outputDir: "/tmp/wayoffmars-test-results",
  reporter: "list",
  use: { baseURL: process.env.TEST_BASE_URL || "http://localhost:3000", channel: "chrome", viewport: { width: 1280, height: 900 } },
  webServer: process.env.TEST_BASE_URL ? undefined : {
    command: "npm run dev -- --hostname localhost --port 3000",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
