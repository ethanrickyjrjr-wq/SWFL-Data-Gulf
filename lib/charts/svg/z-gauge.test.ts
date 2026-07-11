import { test, expect } from "bun:test";
import { zGaugeSvg, extractGaugeData } from "./z-gauge";

test("extractGaugeData returns null when value is missing", () => {
  expect(extractGaugeData(undefined)).toBeNull();
  expect(extractGaugeData({})).toBeNull();
});

test("extractGaugeData computes segment indices from value/baseline/min/max", () => {
  const g = extractGaugeData({
    value: 75,
    baseline: 50,
    min: 0,
    max: 100,
    unit: "index",
    segments: 10,
  });
  expect(g).not.toBeNull();
  expect(g!.valueSegmentIndex).toBe(7);
  expect(g!.baselineSegmentIndex).toBe(5);
});

test("zGaugeSvg draws the value, the segmented bar, and the baseline marker", () => {
  const g = extractGaugeData({ value: 75, baseline: 50, min: 0, max: 100, unit: "index" })!;
  const svg = zGaugeSvg(g, {
    title: "Market heat index",
    source: "market-heat-swfl",
    asOf: "2026-06-30",
  });
  expect(svg).toContain("<svg");
  expect(svg).toContain("Market heat index");
  expect(svg).toContain("75");
  expect(svg).toContain("06/30/2026");
});
