import { mkdtempSync } from "node:fs";
import { defineConfig } from "@playwright/test";

if (process.env.TEST_BASE_URL) throw new Error("Use the isolated test server; testing an existing library is disabled.");
process.env.WAYOFFMARS_TEST_DATA_DIR ||= mkdtempSync('/tmp/wayoffmars-test-');
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  outputDir: "/tmp/wayoffmars-test-results",
  reporter: "list",
  use: { baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3107", channel: "chrome", viewport: { width: 1280, height: 900 } },
  webServer: process.env.TEST_BASE_URL ? undefined : {
    command: "npm run dev -- --port 3107",
    url: "http://127.0.0.1:3107",
    reuseExistingServer: false,
    env: { WAYOFFMARS_DATA_DIR: process.env.WAYOFFMARS_TEST_DATA_DIR },
  },
});
