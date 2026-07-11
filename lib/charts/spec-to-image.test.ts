import { test, expect } from "bun:test";
import { chartSpecToEmailSvg } from "./spec-to-image";
import type { ChartSpec } from "@/components/charts/registry/chart-spec";

const barSpec = {
  frameId: "bar-table",
  title: "Median price by ZIP",
  chart_type: "bar",
  value_format: "usd",
  source: { citation: "cre-swfl" },
  asOf: "2026-06-30",
  columns: ["ZIP", "Median"],
  rows: [
    ["33901", 412000],
    ["33903", 389000],
    ["33914", 675000],
  ],
} as ChartSpec;

const compositionSpec = {
  frameId: "composition",
  title: "Flood exposure composition",
  chart_type: "bar",
  value_format: "count",
  source: { citation: "env-swfl" },
  asOf: "2026-06-30",
  theme: { primary: "#0f1d24", accent: "#e05c2e", logoUrl: "" },
  options: {
    segments: [
      { label: "SFHA (in flood zone)", valuePct: 32 },
      { label: "Outside SFHA", valuePct: 68 },
    ],
    callout: "357× AAL multiplier",
  },
} as ChartSpec;

test("bar-table renders a segmented bar SVG (MM/DD/YYYY date, real values)", async () => {
  const svg = await chartSpecToEmailSvg(barSpec, "#0ea5e9");
  expect(svg).not.toBeNull();
  expect(svg).toContain("<svg");
  expect(svg).toContain("Median price by ZIP");
  expect(svg).toContain("06/30/2026");
});

test("composition forwards spec.theme accent to the segment fill (§8: theme not dropped)", async () => {
  const svg = await chartSpecToEmailSvg(compositionSpec, "#0ea5e9");
  expect(svg).not.toBeNull();
  // resolveCompositionColors anchors on spec.theme.accent (#e05c2e). If the
  // extraction dropped `spec.theme`, this fill would fall back to the default
  // teal and this assertion would fail — that is the §8 regression guard.
  expect(svg).toContain("#e05c2e");
  expect(svg).toContain("357");
});

test("an unsupported frame returns null (never throws — RULE 0.7)", async () => {
  const svg = await chartSpecToEmailSvg({ frameId: "not-a-frame" } as ChartSpec, "#0ea5e9");
  expect(svg).toBeNull();
});
