import { describe, expect, it } from "bun:test";
import { metricDirectionToTone, safeMetrics } from "./live-loaders";
import type { DisplayMetric } from "@/refinery/render/speaker.mts";

function metric(label: string): DisplayMetric {
  return {
    label,
    value: "1",
    direction: "stable",
    sourceLabel: "s",
    sourceUrl: "https://example.com",
    sourceFull: "s",
    fetchedAt: "2026-01-01T00:00:00Z",
    suggestions: [],
  };
}

describe("metricDirectionToTone", () => {
  it("maps rising to bullish", () => {
    expect(metricDirectionToTone("rising")).toBe("bullish");
  });

  it("maps falling to bearish", () => {
    expect(metricDirectionToTone("falling")).toBe("bearish");
  });

  it("maps stable to neutral", () => {
    expect(metricDirectionToTone("stable")).toBe("neutral");
  });

  it("defaults an unrecognized direction to neutral", () => {
    expect(metricDirectionToTone("sideways")).toBe("neutral");
  });
});

describe("safeMetrics", () => {
  it("drops a metric labeled 'median ZHVI' (the mislabel a display surface must never carry)", () => {
    const metrics = [
      metric("SWFL regional median ZHVI home-value YoY %"),
      metric("Median SWFL CRE cap rate"),
    ];
    const result = safeMetrics(metrics, 2);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Median SWFL CRE cap rate");
  });

  it("drops the reverse word order too (ZHVI ... median)", () => {
    const metrics = [metric("ZHVI-derived median home value")];
    expect(safeMetrics(metrics, 2)).toHaveLength(0);
  });

  it("keeps a correctly-labeled 'typical (ZHVI)' metric", () => {
    const metrics = [metric("SWFL regional typical (ZHVI) home value (USD)")];
    expect(safeMetrics(metrics, 2)).toHaveLength(1);
  });

  it("caps at the requested count after filtering", () => {
    const metrics = [metric("a"), metric("b"), metric("c")];
    expect(safeMetrics(metrics, 2)).toHaveLength(2);
  });
});
