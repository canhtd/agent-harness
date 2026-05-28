import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./__tests__/e2e",
  webServer: {
    command: "pnpm dev --port 3100",
    port: 3100,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  timeout: 60_000,
  retries: 1,
  use: {
    baseURL: "http://localhost:3100",
    headless: true,
    viewport: { width: 1280, height: 720 },
    navigationTimeout: 45_000,
  },
  expect: {
    timeout: 15_000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
