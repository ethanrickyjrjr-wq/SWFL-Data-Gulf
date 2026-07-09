import { describe, it, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { SEED_DOCS } from "./default-docs";
import { SEED_PREVIEWS, SEED_PREVIEW_GROUPS, SEED_PREVIEW_CAPTION } from "./seed-previews";

/**
 * The manifest is the single source of truth for the template gallery. A new
 * template without a group + committed capture must be a red test here, never
 * a broken tile in prod (same contract as lib/showcase/registry.test.ts).
 */
describe("seed previews manifest", () => {
  it("covers every SEED_DOCS id, each with a known group", () => {
    expect(SEED_PREVIEWS).toHaveLength(SEED_DOCS.length);
    const groups = new Set(SEED_PREVIEW_GROUPS.map((g) => g.key));
    for (const p of SEED_PREVIEWS) {
      expect(p.group, `seed "${p.id}" has no gallery group`).toBeDefined();
      expect(groups.has(p.group), `seed "${p.id}" group "${p.group}" unknown`).toBe(true);
    }
  });

  it("every capture asset exists under public/ (re-run capture-seed-previews after template edits)", () => {
    for (const p of SEED_PREVIEWS) {
      expect(
        existsSync(join(process.cwd(), "public", p.image)),
        `missing capture: ${p.image} — run: bun scripts/capture-seed-previews.mts`,
      ).toBe(true);
    }
  });

  it("every group in SEED_PREVIEW_GROUPS has at least one template", () => {
    for (const g of SEED_PREVIEW_GROUPS) {
      expect(
        SEED_PREVIEWS.some((p) => p.group === g.key),
        `empty gallery group: ${g.key}`,
      ).toBe(true);
    }
  });

  it("caption carries the as-of date, MM/DD/YYYY", () => {
    expect(SEED_PREVIEW_CAPTION).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
});
