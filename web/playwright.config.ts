import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./__tests__/e2e",
  webServer: {
    command: "pnpm dev --port 3100",
    port: 3100,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  use: {
    baseURL: "http://localhost:3100",
    headless: true,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
