import { test, expect } from "bun:test";
import { relativeLuminance, contrastRatio } from "./palette";

test("relative luminance: black=0, white=1 (W3C sRGB)", () => {
  expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
  expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
});

test("contrast ratio: black vs white = 21:1 (W3C worked value)", () => {
  expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 2);
});

test("contrast ratio is symmetric", () => {
  expect(contrastRatio("#3dc9c0", "#ffffff")).toBeCloseTo(contrastRatio("#ffffff", "#3dc9c0"), 6);
});

test("gulf palette measured values (from verification note)", () => {
  // ink #0a2540 on each fill ~7.4-7.8:1; white on each fill ~2.0:1
  expect(contrastRatio("#0a2540", "#3dc9c0")).toBeGreaterThan(7);
  expect(contrastRatio("#ffffff", "#3dc9c0")).toBeLessThan(2.2);
});
