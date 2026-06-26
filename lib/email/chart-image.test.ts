import { test, expect } from "bun:test";
import { trendChartSvg } from "./chart-image";

// QUALITY-BAR conformance for the email chart (docs/email-marketing/QUALITY-BAR-data-deliverables.md).
// These assert the chart reads "pro, not pencil-drawn": gridlines, area fill, multiple
// formatted axis labels, the millions currency branch, MM/YYYY dates, grain-aware title,
// and a source/as-of caption. trendChartSvg is pure (no I/O), so it tests directly.

const pts = [
  { label: "2025-01", value: 410000 },
  { label: "2025-02", value: 1285000 },
  { label: "2025-03", value: 1290000 },
  { label: "2025-04", value: 1310000 },
];

test("draws gridlines + an area fill, not a bare baseline", () => {
  const svg = trendChartSvg(pts, { title: "Median price", accent: "#1BB8C9" });
  const lineCount = (svg.match(/<line /g) || []).length;
  expect(lineCount).toBeGreaterThanOrEqual(4); // multiple gridlines, not one baseline
  expect(svg).toMatch(/<path[^>]*fill-opacity/); // area fill under the hero line
});

test("currency uses the millions branch — never $1285K", () => {
  const svg = trendChartSvg(pts, { title: "x", accent: "#000", valueFormat: "usd" });
  expect(svg).toContain("$1.3M");
  expect(svg).not.toContain("1285K");
  expect(svg).not.toContain("1285k");
});

test("YYYY-MM axis labels render as MM/YYYY (Rule 5)", () => {
  const svg = trendChartSvg(pts, { title: "x", accent: "#000" });
  expect(svg).toContain("01/2025");
  expect(svg).not.toContain("2025-01");
});

test("shows 4 evenly-spaced x labels, not just first + last", () => {
  const svg = trendChartSvg(pts, { title: "x", accent: "#000" });
  for (const lbl of ["01/2025", "02/2025", "03/2025", "04/2025"]) {
    expect(svg).toContain(lbl);
  }
});

test("zip-grain title prefixes the ZIP", () => {
  const svg = trendChartSvg(pts, {
    title: "Naples",
    accent: "#000",
    grain: "zip",
    zip_code: "34102",
  });
  expect(svg).toContain("34102 — Naples");
});

test("renders a source · as-of caption with MM/DD/YYYY", () => {
  const svg = trendChartSvg(pts, {
    title: "x",
    accent: "#000",
    source: "Redfin",
    asOf: "2026-06-26",
  });
  expect(svg).toContain("Redfin");
  expect(svg).toContain("06/26/2026");
});
