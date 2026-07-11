import { test, expect } from "bun:test";
import { chartImageCaption, chartSpecToEmailSvg } from "./spec-to-png";
import type { ChartSpec } from "@/components/charts/registry/chart-spec";

// Rule 2: an as-of date is written MM/DD/YYYY, never the raw ISO/SWFL token. The chart
// SVG already obeys this; the email image-block caption (the line UNDER the chart) was
// leaking the raw ISO. These pin the caption builder to the same rule.

test("chart image caption renders as-of as MM/DD/YYYY, never the raw ISO (Rule 2)", () => {
  const cap = chartImageCaption({
    title: "SWFL Home Values (ZHVI)",
    source: { citation: "Zillow Home Value Index (ZHVI)" },
    asOf: "2026-04-30",
  });
  expect(cap).toContain("04/30/2026");
  expect(cap).not.toContain("2026-04-30");
  expect(cap).toContain("SWFL Home Values (ZHVI) — Zillow Home Value Index (ZHVI)");
});

test("chart image caption omits the as-of clause when no date", () => {
  const cap = chartImageCaption({ title: "Market data", source: { citation: "cre-swfl" } });
  expect(cap).toBe("Market data — cre-swfl");
});

test("chart image caption falls back to a default title", () => {
  expect(chartImageCaption({})).toBe("Market data");
});

// 2026-07-08: zhvi-area now renders through a real bklit AreaChart (server-
// rendered, same component the web frame would use) instead of a second
// hand-authored SVG string. trendChartSvg stays as the belt-and-suspenders
// fallback if the bklit render ever returns null.

test("zhvi-area renders a real bklit AreaChart SVG, not the hand-rolled polyline fallback", async () => {
  const spec = {
    frameId: "zhvi-area",
    title: "Fort Myers — Median Home Value",
    chart_type: "area",
    value_format: "usd",
    source: { citation: "SWFL Data Gulf — housing-swfl" },
    asOf: "2026-07-08",
    options: {
      data: [
        { month: "2025-08", value: 398000 },
        { month: "2025-09", value: 402000 },
        { month: "2025-10", value: 405500 },
        { month: "2025-11", value: 403000 },
        { month: "2025-12", value: 408000 },
      ],
    },
  } as ChartSpec;

  const svg = await chartSpecToEmailSvg(spec, "#0ea5e9");

  expect(svg).not.toBeNull();
  expect(svg).toContain("<svg");
  expect(svg).toContain("Fort Myers");
  expect(svg).not.toContain("<polyline");
});

// 2026-07-08: composed (bar + reference line) renders through a real bklit
// ComposedChart (SeriesBar + Line) — same server-render bridge as zhvi-area,
// wired as the "Bar + trend line" reshape-picker option.

test("composed-bar-line renders a real bklit ComposedChart SVG (bar + line)", async () => {
  const spec = {
    frameId: "composed-bar-line",
    title: "Median sale price by ZIP",
    chart_type: "bar",
    value_format: "usd",
    source: { citation: "MLS" },
    asOf: "2026-06-03",
    options: {
      items: [
        { label: "33921", value: 2975000 },
        { label: "34102", value: 2050000 },
        { label: "34103", value: 1400000 },
      ],
      average: 2141667,
      averageLabel: "average",
    },
  } as ChartSpec;

  const svg = await chartSpecToEmailSvg(spec, "#0ea5e9");

  expect(svg).not.toBeNull();
  expect(svg).toContain("<svg");
  expect(svg).toContain("<rect");
  expect(svg).toContain("<path");
  expect(svg).toContain("Median sale price by ZIP");
});

test("chartSpecToEmailSvg never throws (rejects) on a malformed zhvi-area spec", async () => {
  const spec = { frameId: "zhvi-area", options: {} } as ChartSpec;
  // If this rejected, `await` would fail the test — the assertion below just
  // confirms the actual no-data-to-plot outcome: a clean null, not a crash.
  const svg = await chartSpecToEmailSvg(spec, "#0ea5e9");
  expect(svg).toBeNull();
});

test("composition renders a real segmented-bar SVG from share-style options", async () => {
  const spec = {
    frameId: "composition",
    title: "Flood exposure composition",
    chart_type: "bar",
    value_format: "count",
    source: { citation: "env-swfl" },
    asOf: "2026-06-30",
    options: {
      segments: [
        { label: "SFHA (in flood zone)", valuePct: 32 },
        { label: "Outside SFHA", valuePct: 68 },
      ],
      callout: "357× AAL multiplier",
    },
  } as ChartSpec;

  const svg = await chartSpecToEmailSvg(spec, "#0ea5e9");

  expect(svg).not.toBeNull();
  expect(svg).toContain("<svg");
  expect(svg).toContain("Flood exposure composition");
  expect(svg).toContain("357");
});

test("z-gauge renders a real gauge SVG from single-value-vs-bound options", async () => {
  const spec = {
    frameId: "z-gauge",
    title: "Market heat index",
    chart_type: "bar",
    value_format: "index",
    source: { citation: "market-heat-swfl" },
    asOf: "2026-06-30",
    options: { value: 75, baseline: 50, min: 0, max: 100, unit: "index" },
  } as ChartSpec;

  const svg = await chartSpecToEmailSvg(spec, "#0ea5e9");

  expect(svg).not.toBeNull();
  expect(svg).toContain("<svg");
  expect(svg).toContain("Market heat index");
});
