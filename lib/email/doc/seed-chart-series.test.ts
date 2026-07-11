import { describe, it, expect } from "bun:test";
import { SEED_CHART_SERIES } from "./seed-chart-series";

describe("SEED_CHART_SERIES", () => {
  const EXPECTED_KEYS = [
    "chart-zip-asking-bars.svg",
    "chart-lee-median-asking.svg",
    "chart-lee-active-inventory.svg",
    "chart-luxury-naples-ring.svg",
    "chart-zip33914-asking.svg",
    "chart-fm-rent.svg",
    "chart-pmms-rate.svg",
    "chart-lee-sales-by-month.svg",
    "chart-lee-sale-price-year.svg",
    "chart-lee-home-values.svg",
  ];

  it("carries every committed seed-preview chart asset", () => {
    for (const key of EXPECTED_KEYS) {
      expect(SEED_CHART_SERIES[key], key).toBeTruthy();
    }
  });

  it("every series has at least one finite value and a valid unit", () => {
    const UNITS = new Set(["currency", "percent", "count", "other"]);
    for (const [key, series] of Object.entries(SEED_CHART_SERIES)) {
      expect(series.values.length, key).toBeGreaterThan(0);
      expect(
        series.values.every((v) => Number.isFinite(v)),
        key,
      ).toBe(true);
      expect(UNITS.has(series.unit), `${key} unit`).toBe(true);
    }
  });

  it("chart-luxury-naples-ring plots the real Naples $2M+ segments plus center total", () => {
    const s = SEED_CHART_SERIES["chart-luxury-naples-ring.svg"];
    expect(s.values).toEqual([378, 412, 284, 152, 1226]);
    expect(s.unit).toBe("count");
  });

  it("chart-lee-home-values plots real ZHVI-average endpoints", () => {
    const s = SEED_CHART_SERIES["chart-lee-home-values.svg"];
    expect(Math.min(...s.values)).toBeCloseTo(433549, -2);
    expect(Math.max(...s.values)).toBeCloseTo(471582, -2);
    expect(s.unit).toBe("currency");
  });
});
