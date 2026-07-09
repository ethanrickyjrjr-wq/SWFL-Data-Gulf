// Visual regression for every react-email preview in this directory. Run with
// `bun run test:visual`. First run writes the baseline PNGs under
// __screenshots__/; every run after that fails on a pixel diff — exactly the
// "catch it before a fence change ships" gate.
import { test, expect } from "@playwright/test";
import { readdirSync } from "node:fs";

const PREVIEW_SLUGS = readdirSync(__dirname)
  .filter((f) => f.endsWith(".tsx") && !f.includes("visual-regression"))
  .map((f) => f.replace(/\.tsx$/, ""));

test.describe("fence preview visual regression", () => {
  for (const slug of PREVIEW_SLUGS) {
    test(slug, async ({ page }) => {
      await page.goto(`/preview/${slug}`);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveScreenshot(`${slug}.png`, { fullPage: true });
    });
  }
});
