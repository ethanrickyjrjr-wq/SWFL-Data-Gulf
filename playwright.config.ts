// Visual regression for the fence system's react-email previews (emails/*.tsx).
// `bun run test:visual` — first run writes baselines under emails/__screenshots__/,
// every run after that diffs against them and fails on a pixel mismatch.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./emails",
  testMatch: "visual-regression.playwright.ts",
  webServer: {
    command: "bun email:dev --port 3001",
    url: "http://localhost:3001",
    reuseExistingServer: true,
    timeout: 30_000,
  },
  use: {
    baseURL: "http://localhost:3001",
  },
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
});
