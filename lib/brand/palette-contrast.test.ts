// lib/brand/palette-contrast.test.ts — Fence 6 Tier B evaluator. Expected
// ratios computed 07/09/2026 with the repo's contrastRatio (lib/charts/palette):
// #3DC9C0 on #ffffff = 2.04 · #3DC9C0 on #F9FAFB = 1.95 · #3DC9C0 on #0f1d24 = 8.44 ·
// #ffffff on #0f1d24 = 17.19 · #1B3A5C on #1B3A5C = 1.00 · #B8860B on #ffffff = 3.25.
import { describe, expect, it } from "bun:test";
import { evaluateSchemeContrast } from "./palette-contrast";

describe("evaluateSchemeContrast", () => {
  it("flags the live house-default failures (accent on white 2.04, footer 1.95)", () => {
    const w = evaluateSchemeContrast(["#0f1d24", "#3DC9C0", "#1F2937", "#F8FAFC"]);
    const surfaces = w.map((x) => x.surface);
    expect(surfaces).toContain("accent links on white cards");
    expect(surfaces).toContain("accent links in the footer");
    expect(surfaces).not.toContain("accent text on your primary color"); // 8.44
    expect(surfaces).not.toContain("white text on your primary color"); // 17.19
  });

  it("flags accent==primary as invisible-on-header", () => {
    const w = evaluateSchemeContrast(["#1B3A5C", "#1B3A5C", "#1F2937", "#F8FAFC"]);
    expect(w.some((x) => x.surface === "accent text on your primary color" && x.ratio < 1.05)).toBe(
      true,
    );
  });

  it("uses the large-text floor (3) for primary-as-price ink", () => {
    // #B8860B on white = 3.25 → passes floor 3, so NO price-surface warning
    const w = evaluateSchemeContrast(["#B8860B", "#0f1d24", "#1F2937", "#F8FAFC"]);
    expect(w.some((x) => x.surface === "price and headline text in your primary color")).toBe(
      false,
    );
  });

  it("skips pairs with empty or non-hex slots and returns [] for an empty scheme", () => {
    expect(evaluateSchemeContrast(["", "", "", ""])).toEqual([]);
    const partial = evaluateSchemeContrast(["#0f1d24", "", "#1F2937", ""]);
    expect(partial.every((x) => !!x.surface && Number.isFinite(x.ratio))).toBe(true);
    expect(partial.some((x) => x.surface.startsWith("accent"))).toBe(false);
  });

  it("ratios reproduce the repo's contrastRatio to 2dp", () => {
    const w = evaluateSchemeContrast(["#0f1d24", "#3DC9C0", "#1F2937", "#F8FAFC"]);
    const onWhite = w.find((x) => x.surface === "accent links on white cards");
    expect(onWhite?.ratio).toBeCloseTo(2.04, 2);
    expect(onWhite?.floor).toBe(4.5);
    expect(onWhite?.consequence.length).toBeGreaterThan(0);
  });
});
