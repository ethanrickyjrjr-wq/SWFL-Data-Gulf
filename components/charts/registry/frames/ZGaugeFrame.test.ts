import { describe, it, expect } from "bun:test";
import { extractGaugeData } from "./ZGaugeFrame";

// ---------------------------------------------------------------------------
// extractGaugeData — pure adapter logic, no DOM required
// ---------------------------------------------------------------------------

describe("extractGaugeData", () => {
  it("returns null when options is undefined", () => {
    expect(extractGaugeData(undefined)).toBeNull();
  });

  it("returns null when value is missing", () => {
    expect(extractGaugeData({ baseline: 100, min: 80, max: 120 })).toBeNull();
  });

  it("returns null when value is a non-number type", () => {
    expect(extractGaugeData({ value: "108.1", baseline: 100, min: 80, max: 120 })).toBeNull();
  });

  it("returns correct params for the traffic-swfl fixture", () => {
    const result = extractGaugeData({
      value: 108.1,
      baseline: 100,
      min: 80,
      max: 120,
      unit: "index (2022=100)",
      segments: 9,
    });

    expect(result).not.toBeNull();
    expect(result!.value).toBe(108.1);
    expect(result!.baseline).toBe(100);
    expect(result!.min).toBe(80);
    expect(result!.max).toBe(120);
    expect(result!.unit).toBe("index (2022=100)");
    expect(result!.segments).toBe(9);
  });

  it("calculates valueFraction correctly — 108.1 in [80,120] ≈ 0.7025", () => {
    const result = extractGaugeData({
      value: 108.1,
      baseline: 100,
      min: 80,
      max: 120,
    });
    // (108.1 - 80) / (120 - 80) = 28.1 / 40 = 0.7025
    expect(result!.valueFraction).toBeCloseTo(0.7025, 4);
  });

  it("segment position: value=110, min=80, max=120, segments=9 → 75th percentile", () => {
    // (110 - 80) / (120 - 80) = 30/40 = 0.75
    // valueSegmentIndex = floor(0.75 * 9) = floor(6.75) = 6
    const result = extractGaugeData({
      value: 110,
      baseline: 100,
      min: 80,
      max: 120,
      segments: 9,
    });
    expect(result!.valueFraction).toBeCloseTo(0.75, 4);
    expect(result!.valueSegmentIndex).toBe(6);
  });

  it("baseline segment: baseline=100, min=80, max=120, segments=9 → index 4", () => {
    // (100 - 80) / 40 = 0.5  →  floor(0.5 * 9) = floor(4.5) = 4
    const result = extractGaugeData({
      value: 108.1,
      baseline: 100,
      min: 80,
      max: 120,
      segments: 9,
    });
    expect(result!.baselineSegmentIndex).toBe(4);
  });

  it("value at min clamps to segment 0", () => {
    const result = extractGaugeData({
      value: 80,
      baseline: 100,
      min: 80,
      max: 120,
      segments: 9,
    });
    expect(result!.valueSegmentIndex).toBe(0);
    expect(result!.valueFraction).toBeCloseTo(0, 4);
  });

  it("value at max clamps to last segment", () => {
    const result = extractGaugeData({
      value: 120,
      baseline: 100,
      min: 80,
      max: 120,
      segments: 9,
    });
    expect(result!.valueSegmentIndex).toBe(8); // last of 9 segments (0-based)
    expect(result!.valueFraction).toBeCloseTo(1, 4);
  });

  it("value beyond max clamps to fraction=1 / last segment", () => {
    const result = extractGaugeData({
      value: 999,
      baseline: 0,
      min: 0,
      max: 100,
      segments: 5,
    });
    expect(result!.valueFraction).toBe(1);
    expect(result!.valueSegmentIndex).toBe(4);
  });

  it("applies sensible defaults when optional fields are absent", () => {
    // baseline, min, max, unit, segments all optional
    const result = extractGaugeData({ value: 42 });
    expect(result).not.toBeNull();
    expect(result!.baseline).toBe(0);
    expect(result!.min).toBe(0);
    expect(result!.max).toBe(100);
    expect(result!.unit).toBe("");
    expect(result!.segments).toBe(9);
  });

  it("z-score mode: value=1.5, baseline=0, min=-3, max=3, segments=9", () => {
    // (1.5 - (-3)) / 6 = 4.5/6 = 0.75 → segment floor(0.75*9)=6
    const result = extractGaugeData({
      value: 1.5,
      baseline: 0,
      min: -3,
      max: 3,
      unit: "σ",
      segments: 9,
    });
    expect(result!.valueFraction).toBeCloseTo(0.75, 4);
    expect(result!.valueSegmentIndex).toBe(6);
    // baseline 0 in [-3,3]: (0-(-3))/6=0.5 → floor(0.5*9)=4
    expect(result!.baselineSegmentIndex).toBe(4);
  });

  it("rounds non-integer segments option", () => {
    const result = extractGaugeData({ value: 50, segments: 7.8 });
    expect(result!.segments).toBe(8);
  });

  it("ignores segments ≤ 0 and falls back to 9", () => {
    const result = extractGaugeData({ value: 50, segments: 0 });
    expect(result!.segments).toBe(9);

    const result2 = extractGaugeData({ value: 50, segments: -3 });
    expect(result2!.segments).toBe(9);
  });
});
