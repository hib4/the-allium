import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "site.spec.ts",
  use: { baseURL: "http://localhost:5173", headless: true, channel: "chrome" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
  },
  reporter: "list",
});
