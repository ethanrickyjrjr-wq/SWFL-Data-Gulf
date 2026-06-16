/**
 * lib/email/__fixtures__/golden/cases.ts — the frozen-golden equivalence matrix.
 *
 * Each case is rendered by BOTH the pre-spine `reportToEmailHtml` (captured once into
 * `<name>.html`) and the post-spine `reportToEmailHtml`. `render-golden.test.ts` asserts
 * the post-spine output is byte-identical to the committed golden. The matrix is built
 * to touch every branch of the render + its helpers (hero present/empty, brand on/off,
 * delta changed / re-verified / absent, all four MetricChange directions + favorability,
 * markdown + HTML-escape, MAX_METRIC_ROWS / MAX_LINES caps, null place/county, null
 * freshness token, custom cta/origin).
 */

import type { AssembledReport, ReportMetric, ReportLine } from "../../activation/snapshot";
import type { RenderReportOptions } from "../../activation/render";
import type { ReportDelta } from "../../activation/types";

export interface GoldenCase {
  name: string;
  report: AssembledReport;
  opts: RenderReportOptions;
}

function metric(over: Partial<ReportMetric> = {}): ReportMetric {
  return {
    key: "housing.median_sale_price",
    label: "Median sale price",
    value: 412000,
    unit: "",
    direction: "neutral",
    display: "$412,000",
    ...over,
  };
}

function line(over: Partial<ReportLine> = {}): ReportLine {
  return {
    brain_id: "city-pulse-swfl",
    grain: "city",
    is_true_zip: false,
    label: "Fort Myers Beach-area",
    text: "**Fort Myers Beach-area** — a new beachfront mixed-use approval cleared review.",
    source_url: "https://example.com/pulse",
    source_citation: "City pulse",
    ...over,
  };
}

function baseReport(over: Partial<AssembledReport> = {}): AssembledReport {
  return {
    in_scope: true,
    zip: "33931",
    primaryPlace: "Fort Myers Beach",
    countyName: "Lee",
    freshness_token: "SWFL-7421-v6-20260613",
    metrics: [
      metric(),
      metric({
        key: "housing.median_dom",
        label: "Days on market",
        value: 45,
        unit: " days",
        direction: "lower_is_better",
        display: "45",
      }),
      metric({
        key: "env.flood_aal_usd",
        label: "Flood avg annual loss",
        value: 30074,
        unit: "",
        direction: "lower_is_better",
        display: "$30,074 / yr",
      }),
    ],
    lines: [line()],
    coverage_caveats: [],
    snapshot: {
      zip: "33931",
      freshness_token: "SWFL-7421-v6-20260613",
      captured_at: "2026-06-13T00:00:00.000Z",
      metrics: [],
      lines: [],
    },
    ...over,
  };
}

const DELTA_CHANGED: ReportDelta = {
  zip: "33931",
  has_change: true,
  freshness_moved: true,
  freshness_token_prev: "SWFL-7421-v5-20260610",
  freshness_token_current: "SWFL-7421-v6-20260613",
  metric_changes: [
    {
      key: "housing.median_sale_price",
      label: "Median sale price",
      from: 400000,
      to: 412000,
      delta: 12000,
      direction: "up",
      favorable: null,
      unit: "",
    },
    {
      key: "housing.median_dom",
      label: "Days on market",
      from: 60,
      to: 45,
      delta: -15,
      direction: "down",
      favorable: true,
      unit: " days",
    },
    {
      key: "env.flood_aal_usd",
      label: "Flood avg annual loss",
      from: null,
      to: 30074,
      delta: null,
      direction: "appeared",
      favorable: false,
      unit: "",
    },
    {
      key: "housing.inventory",
      label: "Active inventory",
      from: 120,
      to: null,
      delta: null,
      direction: "disappeared",
      favorable: null,
      unit: "",
    },
  ],
  signal_changes: [{ brain_id: "city-pulse-swfl", label: "Local city pulse" }],
};

const DELTA_REVERIFIED: ReportDelta = {
  zip: "33931",
  has_change: false,
  freshness_moved: true,
  freshness_token_prev: "SWFL-7421-v5-20260610",
  freshness_token_current: "SWFL-7421-v6-20260613",
  metric_changes: [],
  signal_changes: [],
};

export const GOLDEN_CASES: GoldenCase[] = [
  { name: "plain", report: baseReport(), opts: {} },
  {
    name: "branded",
    report: baseReport(),
    opts: {
      brand: {
        primary: "#7b2d8e",
        accent: "#f0a",
        logoUrl: "https://cdn.example/logo.png",
        companyName: 'Gulf Coast Realty & Co <"flagship">',
      },
    },
  },
  { name: "delta-changed", report: baseReport(), opts: { delta: DELTA_CHANGED } },
  { name: "delta-reverified", report: baseReport(), opts: { delta: DELTA_REVERIFIED } },
  {
    name: "custom-cta",
    report: baseReport(),
    opts: {
      ctaUrl: "https://gulfcoast.example/start?ref=a&b=1",
      siteOrigin: "https://gulfcoast.example",
    },
  },
  { name: "empty-metrics", report: baseReport({ metrics: [] }), opts: {} },
  { name: "no-freshness", report: baseReport({ freshness_token: null }), opts: {} },
  {
    name: "rich-markdown",
    report: baseReport({
      lines: [
        line({
          text: '**Bold lead** with `inline_code` and _emphasis_ and a < b & "quote".\n\nSecond paragraph after a break.\nSame paragraph, new line.',
        }),
      ],
    }),
    opts: {},
  },
  {
    name: "overflow-caps",
    report: baseReport({
      metrics: Array.from({ length: 8 }, (_, i) =>
        metric({ key: `m.${i}`, label: `Metric ${i}`, value: i, display: `${i}` }),
      ),
      lines: Array.from({ length: 7 }, (_, i) =>
        line({ brain_id: `b-${i}`, label: `Line ${i}`, text: `Line **${i}** body.` }),
      ),
    }),
    opts: {},
  },
  {
    name: "null-place-county",
    report: baseReport({ primaryPlace: null, countyName: null }),
    opts: {},
  },
];
