import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "audio.spec.ts",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:8766", headless: true, channel: "chrome" },
  webServer: {
    command: "node scripts/audio-service.mjs --test-fixture --port 8766",
    url: "http://127.0.0.1:8766/api/config",
    reuseExistingServer: false,
  },
  reporter: "list",
});
