import { test, expect, describe } from "bun:test";
import {
  assertHeroChartCoherence,
  parseHeroFigure,
  chartMagnitudeFromSpec,
  type CoherenceInput,
} from "./chart-coherence";
import type { ChartSpec } from "../../components/charts/registry/chart-spec";

// The exact numbers from the shipped-broken Luxury Market Report: a $3.17M
// "$2M+" headline over a Zillow top-third chart topping at $802K. This is the
// bug the gate exists to catch.
const LUXURY_BUG: CoherenceInput = {
  hero: { value: 3_168_000, unit: "currency" },
  chart: {
    values: [801_690, 789_767, 777_384, 765_786, 745_575],
    unit: "currency",
  },
};

describe("assertHeroChartCoherence", () => {
  test("flags the luxury bug: currency headline >3x above the chart's range", () => {
    const r = assertHeroChartCoherence(LUXURY_BUG);
    expect(r.coherent).toBe(false);
    if (!r.coherent) {
      expect(r.reason).toContain("3,168,000");
      expect(r.reason).toContain("801,690"); // names the chart's top plotted value
    }
  });

  test("passes when the headline sits inside the chart's range (same $)", () => {
    const r = assertHeroChartCoherence({
      hero: { value: 625_000, unit: "currency" },
      chart: { values: [600_000, 640_000, 650_000], unit: "currency" },
    });
    expect(r.coherent).toBe(true);
  });

  test("passes within 3x — the factor is a floor, not hair-trigger", () => {
    const r = assertHeroChartCoherence({
      hero: { value: 2_000_000, unit: "currency" },
      chart: { values: [800_000, 900_000], unit: "currency" }, // 2M < 900K*3
    });
    expect(r.coherent).toBe(true);
  });

  test("never fires across different units ($ headline over a % chart is legit)", () => {
    const r = assertHeroChartCoherence({
      hero: { value: 3_168_000, unit: "currency" },
      chart: { values: [3.2, 3.5, 6.5], unit: "percent" },
    });
    expect(r.coherent).toBe(true);
  });

  test("never fires when either side is percent (ratios break near zero)", () => {
    const r = assertHeroChartCoherence({
      hero: { value: 80, unit: "percent" },
      chart: { values: [1, 2, 3], unit: "percent" },
    });
    expect(r.coherent).toBe(true);
  });

  test("flags a count headline far above a count chart", () => {
    const r = assertHeroChartCoherence({
      hero: { value: 10_000, unit: "count" },
      chart: { values: [10, 20, 30], unit: "count" },
    });
    expect(r.coherent).toBe(false);
  });

  test("flags a headline far BELOW the chart's range", () => {
    const r = assertHeroChartCoherence({
      hero: { value: 100, unit: "currency" },
      chart: { values: [600_000, 800_000], unit: "currency" },
    });
    expect(r.coherent).toBe(false);
  });

  test("coherent when there is nothing to compare (missing hero or empty chart)", () => {
    expect(assertHeroChartCoherence({ hero: null, chart: LUXURY_BUG.chart }).coherent).toBe(true);
    expect(
      assertHeroChartCoherence({ hero: LUXURY_BUG.hero, chart: { values: [], unit: "currency" } })
        .coherent,
    ).toBe(true);
  });

  test("the Naples luxury ring fixture is coherent (headline == the ring's center total)", () => {
    // Share-chart convention: the chart DISPLAYS its center total, so the total
    // is one of the chart's displayed values. The headline count equals that
    // total — the same number shown twice — which is maximally coherent. The
    // binder therefore includes the total in `values`, never the segments alone
    // (segments-only would false-positive every honest donut with a big total).
    const segments = [378, 412, 284, 152];
    const total = segments.reduce((a, b) => a + b, 0); // 1,226
    const r = assertHeroChartCoherence({
      hero: { value: total, unit: "count" },
      chart: { values: [...segments, total], unit: "count" },
    });
    expect(r.coherent).toBe(true);
  });
});

describe("parseHeroFigure", () => {
  test("parses a currency headline", () => {
    expect(parseHeroFigure("$3,168,000")).toEqual({ value: 3_168_000, unit: "currency" });
  });
  test("parses a percent headline (incl. unicode minus)", () => {
    expect(parseHeroFigure("−7.0%")).toEqual({ value: -7, unit: "percent" });
  });
  test("parses a bare count", () => {
    expect(parseHeroFigure("1,226")).toEqual({ value: 1_226, unit: "count" });
  });
  test("parses a compact-suffix currency", () => {
    expect(parseHeroFigure("$1.4M")).toEqual({ value: 1_400_000, unit: "currency" });
  });
  test("returns null when there is no number", () => {
    expect(parseHeroFigure("Median Sale Price")).toBeNull();
    expect(parseHeroFigure("")).toBeNull();
  });
});

describe("chartMagnitudeFromSpec", () => {
  test("extracts bar-table rows as count/currency values by value_format", () => {
    const spec = {
      title: "t",
      columns: ["zip", "value"],
      rows: [
        ["33914", 550000],
        ["34135", 525000],
      ],
      chart_type: "bar",
      value_format: "usd",
      frameId: "bar-table",
    } as unknown as ChartSpec;
    const mag = chartMagnitudeFromSpec(spec);
    expect(mag).toEqual({ values: [550000, 525000], unit: "currency" });
  });

  test("extracts donut-share segments PLUS the center total", () => {
    const spec = {
      title: "t",
      columns: ["segment", "share_pct"],
      rows: [],
      chart_type: "bar",
      value_format: "count",
      frameId: "donut-share",
      options: {
        segments: [
          { label: "$2M-3M", value: 378 },
          { label: "$3M-5M", value: 412 },
        ],
        total: 1226,
      },
    } as unknown as ChartSpec;
    const mag = chartMagnitudeFromSpec(spec);
    expect(mag).toEqual({ values: [378, 412, 1226], unit: "count" });
  });

  test("returns null for an unsupported/empty spec", () => {
    const spec = {
      title: "t",
      columns: [],
      rows: [],
      chart_type: "bar",
      frameId: "unknown-frame",
    } as unknown as ChartSpec;
    expect(chartMagnitudeFromSpec(spec)).toBeNull();
  });
});
