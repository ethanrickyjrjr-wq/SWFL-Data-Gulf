import { test, expect, describe } from "bun:test";
import {
  safeInsets,
  safeInsetPercents,
  hasChromeSafeZone,
  SAFE_ZONE_FRACTIONS,
} from "../safe-zones";
import { SOCIAL_FORMATS } from "../formats";

describe("safeInsets — feed formats stay width-based (byte-identical to legacy 7% pad)", () => {
  // Legacy code used `pad = round(width * 0.07)` for ALL four edges. These assert
  // the new resolver reproduces that EXACTLY for the three feed formats, so their
  // rendered output cannot shift.
  const feedCases: Array<[Parameters<typeof safeInsets>[0], number, number, number]> = [
    ["square", 1080, 1080, 76], // round(1080*0.07)
    ["portrait", 1080, 1350, 76], // width-based → round(1080*0.07), NOT height
    ["landscape", 1200, 630, 84], // round(1200*0.07)
  ];
  for (const [format, w, h, pad] of feedCases) {
    test(`${format} → uniform ${pad}px on every edge`, () => {
      const ins = safeInsets(format, w, h);
      expect(ins).toEqual({ top: pad, bottom: pad, left: pad, right: pad });
      // Guard the load-bearing invariant explicitly: top/bottom come from WIDTH.
      expect(ins.top).toBe(Math.round(w * 0.07));
    });
  }
});

describe("safeInsets — story reserves the UI-chrome bands (height-based top/bottom)", () => {
  test("story 1080×1920 → top 14% / bottom 35% (of height), sides 6% (of width)", () => {
    const ins = safeInsets("story", 1080, 1920);
    expect(ins.top).toBe(Math.round(1920 * 0.14)); // 269 — Sprout+billo
    expect(ins.bottom).toBe(Math.round(1920 * 0.35)); // 672 — Meta first-party
    expect(ins.left).toBe(Math.round(1080 * 0.06)); // 65 — billo (soft)
    expect(ins.right).toBe(Math.round(1080 * 0.06));
    expect(ins).toEqual({ top: 269, bottom: 672, left: 65, right: 65 });
  });

  test("the safe CONTENT band is a real, positive region (never inverts)", () => {
    const { width, height } = SOCIAL_FORMATS.story;
    const ins = safeInsets("story", width, height);
    const bandTop = ins.top;
    const bandBottom = height - ins.bottom;
    expect(bandBottom).toBeGreaterThan(bandTop); // 1248 > 269
    const innerW = width - ins.left - ins.right;
    expect(innerW).toBeGreaterThan(0); // 950
  });
});

describe("hasChromeSafeZone", () => {
  test("true only for story (feed formats have no full-screen UI chrome)", () => {
    expect(hasChromeSafeZone("story")).toBe(true);
    expect(hasChromeSafeZone("square")).toBe(false);
    expect(hasChromeSafeZone("portrait")).toBe(false);
    expect(hasChromeSafeZone("landscape")).toBe(false);
  });
});

describe("safeInsetPercents — DOM overlay (no scale math)", () => {
  test("story fractions map straight to CSS percentages", () => {
    expect(safeInsetPercents("story")).toEqual({
      top: "14.00%",
      bottom: "35.00%",
      left: "6.00%",
      right: "6.00%",
    });
  });
  test("feed fractions are the uniform 7%", () => {
    expect(safeInsetPercents("square")).toEqual({
      top: "7.00%",
      bottom: "7.00%",
      left: "7.00%",
      right: "7.00%",
    });
  });
});

describe("SAFE_ZONE_FRACTIONS covers every format exactly once", () => {
  test("keys match SOCIAL_FORMATS", () => {
    expect(Object.keys(SAFE_ZONE_FRACTIONS).sort()).toEqual(Object.keys(SOCIAL_FORMATS).sort());
  });
});
