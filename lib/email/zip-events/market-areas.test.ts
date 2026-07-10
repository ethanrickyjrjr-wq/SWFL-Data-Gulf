// lib/email/zip-events/market-areas.test.ts
import { describe, expect, test } from "bun:test";
import { areaForZip, loadMarketAreas } from "./market-areas";

describe("market-areas fixture", () => {
  test("covers exactly the 58 Lee+Collier ZIPs, each in exactly one area", () => {
    const areas = loadMarketAreas();
    const zips = areas.flatMap((a) => a.zips);
    expect(zips.length).toBe(58);
    expect(new Set(zips).size).toBe(58);
    for (const a of areas) {
      expect(["12071", "12021"]).toContain(a.county);
      expect(a.zips.length).toBeGreaterThanOrEqual(1);
      expect(a.zips.length).toBeLessThanOrEqual(6);
    }
    // ~12-18 named areas (spec); generous bounds so intentional operator
    // membership edits don't redden this — the count is structural, not exact.
    expect(areas.length).toBeGreaterThanOrEqual(10);
    expect(areas.length).toBeLessThanOrEqual(24);
  });

  test("barrier lock: Sanibel is not in a mainland area", () => {
    const sanibel = areaForZip("33957"); // Sanibel
    expect(sanibel).not.toBeNull();
    const cape = areaForZip("33904"); // Cape Coral
    expect(cape).not.toBeNull();
    expect(sanibel!.area_id).not.toBe(cape!.area_id);
  });

  test("the Burnt Store straddle ZIP 33955 is in footprint, assigned to a Lee area", () => {
    const a = areaForZip("33955");
    expect(a).not.toBeNull();
    expect(a!.county).toBe("12071");
  });

  test("areaForZip returns null for out-of-footprint ZIP", () => {
    expect(areaForZip("33440")).toBeNull(); // Hendry — never implied coverage
  });

  test("labels are customer-clean (no ids, no underscores)", () => {
    for (const a of loadMarketAreas()) {
      expect(a.label).not.toMatch(/[_§]/);
      expect(a.label.length).toBeGreaterThan(3);
    }
  });
});
