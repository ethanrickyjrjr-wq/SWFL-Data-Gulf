import { test, expect } from "bun:test";
import { reshapeChartToType, chartTypeFits, isTimeSeries } from "./reshape-chart-type";
import type { ChartSpec } from "@/components/charts/registry/chart-spec";

// The lab "pick your chart type" control re-emits the SAME routed data under a
// different frame. Reshaping only RELABELS real values into another shape — it never
// invents a number. GUARDRAIL: a type that doesn't fit the data is refused and falls
// back to a bar — a donut only when the values are an additive parts-of-a-whole
// (counts), never a sum of medians/prices/rates ("$10.7M" of median prices is
// meaningless). A ranked-with-change only when a real delta exists.

const usdSpec: ChartSpec = {
  title: "Median sale price by ZIP",
  columns: ["ZIP", "Median sale price"],
  rows: [
    ["33921", 2975000],
    ["34102", 2050000],
    ["34103", 1400000],
  ],
  chart_type: "bar",
  value_format: "usd",
  frameId: "bar-table",
  asOf: "2026-06-03",
  source: { citation: "MLS" },
};

const countSpec: ChartSpec = {
  title: "Active listings by county",
  columns: ["County", "Listings"],
  rows: [
    ["Lee", 7412],
    ["Collier", 2749],
    ["Hendry", 298],
  ],
  chart_type: "bar",
  value_format: "count",
  frameId: "bar-table",
  asOf: "2026-06-28",
  source: { citation: "SWFL Data Gulf listing tracker" },
};

const rankedSpec: ChartSpec = {
  ...usdSpec,
  frameId: "ranked-delta",
  options: {
    items: [
      { label: "Naples", value: 642547, delta: -5.6 },
      { label: "Cape Coral", value: 346620, delta: -7.5 },
    ],
    delta_format: "pct",
  },
};

test("chartTypeFits: donut needs additive (count) data", () => {
  expect(chartTypeFits(countSpec, "donut")).toBe(true);
  expect(chartTypeFits(usdSpec, "donut")).toBe(false); // medians don't sum to a whole
});

test("chartTypeFits: ranked needs a real delta", () => {
  expect(chartTypeFits(rankedSpec, "ranked")).toBe(true);
  expect(chartTypeFits(usdSpec, "ranked")).toBe(false);
});

test("chartTypeFits: bar + dotplot + composed always fit ≥2 points", () => {
  expect(chartTypeFits(usdSpec, "bar")).toBe(true);
  expect(chartTypeFits(usdSpec, "dotplot")).toBe(true);
  expect(chartTypeFits(usdSpec, "composed")).toBe(true);
});

test("count data → donut maps rows to segments", () => {
  const out = reshapeChartToType(countSpec, "donut");
  expect(out.frameId).toBe("donut-share");
  const segs = out.options?.segments as { label: string; value: number }[];
  expect(segs).toHaveLength(3);
  expect(segs[0]).toEqual({ label: "Lee", value: 7412 });
});

test("GUARDRAIL: donut on price (usd) data falls back to a bar, no nonsense total", () => {
  const out = reshapeChartToType(usdSpec, "donut");
  expect(out.frameId).toBe("bar-table");
});

test("usd → dotplot adds the mean of the shown points as the reference + a value label", () => {
  const out = reshapeChartToType(usdSpec, "dotplot");
  expect(out.frameId).toBe("dot-plot");
  const data = out.options?.data as { value: number; reference: number }[];
  expect(data[0].reference).toBe(Math.round((2975000 + 2050000 + 1400000) / 3));
  expect(out.options?.valueLabel).toBe("Median sale price");
});

test("usd → composed adds the mean of the shown points as the reference line, never invents one", () => {
  const out = reshapeChartToType(usdSpec, "composed");
  expect(out.frameId).toBe("composed-bar-line");
  const items = out.options?.items as { label: string; value: number }[];
  expect(items).toHaveLength(3);
  expect(items[0]).toEqual({ label: "33921", value: 2975000 });
  expect(out.options?.average).toBe(Math.round((2975000 + 2050000 + 1400000) / 3));
  expect(out.options?.averageLabel).toBe("average");
});

test("GUARDRAIL: ranked with NO delta falls back to bar (never a fabricated delta)", () => {
  expect(reshapeChartToType(usdSpec, "ranked").frameId).toBe("bar-table");
});

test("ranked → ranked keeps the real delta chips", () => {
  const out = reshapeChartToType(rankedSpec, "ranked");
  expect(out.frameId).toBe("ranked-delta");
  const items = out.options?.items as { delta: number }[];
  expect(items[0].delta).toBe(-5.6);
});

test("chartTypeFits: spark-grid + line-band always fit ≥2 points (degenerate series/no band, never fabricated)", () => {
  expect(chartTypeFits(usdSpec, "spark-grid")).toBe(true);
  expect(chartTypeFits(usdSpec, "line-band")).toBe(true);
});

test("usd → spark-grid maps each point to a KPI card with a single-value (degenerate) series", () => {
  const out = reshapeChartToType(usdSpec, "spark-grid");
  expect(out.frameId).toBe("spark-grid");
  const cards = out.options?.cards as { label: string; value: number; series: number[] }[];
  expect(cards).toHaveLength(3);
  expect(cards[0]).toEqual({
    label: "33921",
    value: 2975000,
    series: [2975000],
    valueFormat: "usd",
  });
});

test("spark-grid caps at 4 cards (matches sparkGridSvg's own cap)", () => {
  const wide: ChartSpec = {
    ...countSpec,
    rows: [
      ["A", 1],
      ["B", 2],
      ["C", 3],
      ["D", 4],
      ["E", 5],
    ],
  };
  const out = reshapeChartToType(wide, "spark-grid");
  expect((out.options?.cards as unknown[]).length).toBe(4);
});

test("usd → line-band maps each point to a plain point with no lo/hi (no fabricated confidence band)", () => {
  const out = reshapeChartToType(usdSpec, "line-band");
  expect(out.frameId).toBe("line-band");
  const data = out.options?.data as { label: string; value: number; lo?: number; hi?: number }[];
  expect(data).toHaveLength(3);
  expect(data[0]).toEqual({ label: "33921", value: 2975000 });
  expect(data[0].lo).toBeUndefined();
  expect(data[0].hi).toBeUndefined();
});

test("a 1-point / non-reshapeable spec is returned unchanged", () => {
  const tiny: ChartSpec = { ...countSpec, rows: [["Lee", 7412]] };
  expect(reshapeChartToType(tiny, "donut").frameId).toBe("bar-table");
});

// NO OLD DATA: a time series must never be force-fit into a categorical bar/donut —
// that's how the oldest months (year 2000) leaked onto a "current" chart. It stays the
// trend (whose renderer shows the RECENT window), regardless of the requested type.
const trendSpec: ChartSpec = {
  title: "SWFL Home Values (ZHVI)",
  columns: ["Month", "Value"],
  rows: [
    ["2000-01", 111000],
    ["2000-02", 111500],
    ["2025-12", 350000],
    ["2026-04", 347000],
  ],
  chart_type: "area",
  value_format: "usd",
  frameId: "zhvi-area",
  asOf: "2026-04-30",
  source: { citation: "ZHVI" },
};

test("a time-series spec is NEVER reshaped to a categorical type (stays the recent trend)", () => {
  expect(reshapeChartToType(trendSpec, "bar").frameId).toBe("zhvi-area");
  expect(reshapeChartToType(trendSpec, "donut").frameId).toBe("zhvi-area");
});

test("chronological YYYY-MM labels are detected as a trend even on a bar-table frame", () => {
  const s: ChartSpec = { ...trendSpec, frameId: "bar-table", chart_type: "bar" };
  expect(reshapeChartToType(s, "donut").frameId).toBe("bar-table"); // left as-is, not a donut
});

test("isTimeSeries is false for categorical (ZIP/city) data", () => {
  expect(isTimeSeries(usdSpec)).toBe(false);
  expect(isTimeSeries(countSpec)).toBe(false);
  expect(isTimeSeries(trendSpec)).toBe(true);
});

// REGRESSION (line_band_frameid_trips_istimeseries_regex): isTimeSeries asks about the
// DATA (a period axis), never the frame's NAME. It used to regex frameId against
// /zhvi|area|line-band|seasonal|timeline/ — so the line-band case, which deliberately
// emits chart_type "bar" to stay re-reshapeable, was frozen by its own frameId: once a
// chart became a line-band, every later reshape short-circuited and returned it unchanged.
test("a reshaped line-band is NOT a time series — its labels are ZIPs, not dates", () => {
  const band = reshapeChartToType(usdSpec, "line-band");
  expect(band.frameId).toBe("line-band");
  expect(isTimeSeries(band)).toBe(false);
});

test("a line-band chart can be reshaped AGAIN (the frame name must not freeze it)", () => {
  const band = reshapeChartToType(usdSpec, "line-band");
  expect(reshapeChartToType(band, "bar").frameId).toBe("bar-table");
  expect(reshapeChartToType(band, "dotplot").frameId).toBe("dot-plot");
  // and the real values survive the second hop — reshaping only relabels
  expect(reshapeChartToType(band, "bar").rows).toEqual(usdSpec.rows);
});

test("frame names that merely SOUND temporal (seasonal/timeline) don't make categorical data a trend", () => {
  // seasonal-radial is a per-corridor snapshot; storm-timeline is a list of named events.
  // Neither has a period axis — only chart_type "area" or chronological labels do.
  expect(isTimeSeries({ ...usdSpec, frameId: "seasonal-radial" })).toBe(false);
  expect(isTimeSeries({ ...usdSpec, frameId: "storm-timeline" })).toBe(false);
  // A GENUINE trend is still caught by its data, with no help from the frame name.
  expect(isTimeSeries({ ...trendSpec, frameId: "bar-table", chart_type: "bar" })).toBe(true);
  expect(isTimeSeries({ ...trendSpec, frameId: "some-new-frame" })).toBe(true);
});

test("chartTypeFits: composition needs additive (count) data, same test as donut", () => {
  expect(chartTypeFits(countSpec, "composition")).toBe(true);
  expect(chartTypeFits(usdSpec, "composition")).toBe(false);
});

test("count data → composition computes each point's share of the total (never invents a percent)", () => {
  const out = reshapeChartToType(countSpec, "composition");
  expect(out.frameId).toBe("composition");
  const segs = out.options?.segments as { label: string; valuePct: number }[];
  const total = 7412 + 2749 + 298;
  expect(segs[0].valuePct).toBeCloseTo((7412 / total) * 100, 5);
});

test("GUARDRAIL: composition on price (usd) data falls back to a bar", () => {
  expect(reshapeChartToType(usdSpec, "composition").frameId).toBe("bar-table");
});

// REGRESSION (composition_segments_missing_value_key_reshape_deadend): the composition
// writer emits segments keyed `valuePct`, but extractPoints read `value` only — so every
// composition spec extracted ZERO points and hit the <2-point dead end: it could never be
// changed to anything else again. donut-share uses the same `segments` key with `value`,
// so extractPoints must accept BOTH keys.
test("a composition spec is re-reshapeable — segments keyed valuePct are not a dead end", () => {
  const composed = reshapeChartToType(countSpec, "composition");
  expect(composed.frameId).toBe("composition");
  const back = reshapeChartToType(composed, "donut");
  expect(back.frameId).toBe("donut-share");
  expect((back.options?.segments as unknown[]).length).toBe(3);
});

test("composition → bar recovers the ORIGINAL counts, never the shares", () => {
  const composed = reshapeChartToType(countSpec, "composition");
  // The raw value rides alongside valuePct precisely so the round-trip is honest:
  // reshaping back must not render 66.9 (a share) under value_format "count".
  const back = reshapeChartToType(composed, "bar");
  expect(back.frameId).toBe("bar-table");
  expect(back.rows).toEqual([
    ["Lee", 7412],
    ["Collier", 2749],
    ["Hendry", 298],
  ]);
});

test("a FOREIGN composition spec (bindComposition: valuePct only, percent format) still reshapes", () => {
  // lib/deliverable/bind-frame.ts bindComposition emits {label, valuePct} with NO raw
  // value and value_format "percent" — the pct IS the value there, so the fallthrough
  // must carry it through rather than drop the spec.
  const fromBinder: ChartSpec = {
    title: "Flood-zone composition",
    columns: ["segment", "share_pct"],
    rows: [
      ["In a flood zone", 62.4],
      ["Remaining area", 37.6],
    ],
    chart_type: "bar",
    value_format: "percent",
    frameId: "composition",
    asOf: "2026-07-01",
    source: { citation: "SWFL Data Gulf" },
    options: {
      segments: [
        { label: "In a flood zone", valuePct: 62.4 },
        { label: "Remaining area", valuePct: 37.6 },
      ],
    },
  };
  const out = reshapeChartToType(fromBinder, "bar");
  expect(out.frameId).toBe("bar-table");
  expect(out.rows).toEqual([
    ["In a flood zone", 62.4],
    ["Remaining area", 37.6],
  ]);
});

test("PASSTHROUGH: a spec already in the target frameId is returned unchanged", () => {
  const already: ChartSpec = { ...usdSpec, frameId: "corridor-scatter" };
  expect(reshapeChartToType(already, "corridor-scatter")).toBe(already);
});

test("chartTypeFits: z-gauge is passthrough-only — false for any fabricated (multi-point) spec", () => {
  expect(chartTypeFits(usdSpec, "z-gauge")).toBe(false);
  expect(chartTypeFits(countSpec, "z-gauge")).toBe(false);
});

test("PASSTHROUGH: a spec already frameId z-gauge stays z-gauge when re-requested", () => {
  const already: ChartSpec = { ...usdSpec, frameId: "z-gauge" };
  expect(reshapeChartToType(already, "z-gauge")).toBe(already);
});

test("chartTypeFits: storm-timeline + seasonal-radial are passthrough-only (false for any fabricated spec)", () => {
  expect(chartTypeFits(usdSpec, "storm-timeline")).toBe(false);
  expect(chartTypeFits(countSpec, "storm-timeline")).toBe(false);
  expect(chartTypeFits(usdSpec, "seasonal-radial")).toBe(false);
  expect(chartTypeFits(countSpec, "seasonal-radial")).toBe(false);
});

test("PASSTHROUGH: a spec already frameId storm-timeline / seasonal-radial is returned unchanged", () => {
  const storm: ChartSpec = { ...usdSpec, frameId: "storm-timeline" };
  expect(reshapeChartToType(storm, "storm-timeline")).toBe(storm);
  const radial: ChartSpec = { ...usdSpec, frameId: "seasonal-radial" };
  expect(reshapeChartToType(radial, "seasonal-radial")).toBe(radial);
});
