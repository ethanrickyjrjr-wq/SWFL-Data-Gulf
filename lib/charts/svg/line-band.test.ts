// lib/charts/svg/line-band.test.ts
//
// PROOF for the line-with-confidence-band SVG builder. One renderer, two surfaces
// (React frame wraps this string; email PNG path rasterizes the SAME string), so
// the proof lives on the pure string: real <svg> elements + a formatted value.

import { test, expect } from "bun:test";
import { lineBandSvg } from "./line-band";

const POINTS = [
  { label: "2026-01", value: 410000 },
  { label: "2026-02", value: 418000 },
  { label: "2026-03", value: 425000 },
  // projection tail with a confidence band
  { label: "2026-04", value: 433000, lo: 420000, hi: 446000 },
  { label: "2026-05", value: 441000, lo: 422000, hi: 460000 },
  { label: "2026-06", value: 449000, lo: 423000, hi: 475000 },
];

test("lineBandSvg renders the title", () => {
  const svg = lineBandSvg(POINTS, { title: "ZHVI projection", accent: "#e05c2e" });
  expect(svg).toContain("<svg");
  expect(svg).toContain("ZHVI projection");
});

test("lineBandSvg draws at least 4 gridlines", () => {
  const svg = lineBandSvg(POINTS, { title: "T", accent: "#e05c2e" });
  const lineCount = (svg.match(/<line /g) ?? []).length;
  expect(lineCount).toBeGreaterThanOrEqual(4);
});

test("lineBandSvg shades a confidence band with fill-opacity", () => {
  const svg = lineBandSvg(POINTS, { title: "T", accent: "#e05c2e" });
  expect(svg).toMatch(/<path[^>]*fill-opacity="0\.12"/);
});

test("lineBandSvg draws the main line as a polyline", () => {
  const svg = lineBandSvg(POINTS, { title: "T", accent: "#e05c2e" });
  expect(svg).toContain("<polyline");
});

test("lineBandSvg prints a formatted y value (usd default)", () => {
  const svg = lineBandSvg(POINTS, { title: "T", accent: "#e05c2e" });
  // end-of-line label: 449000 -> "$449k" via formatAxisTick("usd", ...)
  expect(svg).toContain("$449k");
});

test("lineBandSvg prints an MM/YYYY x label", () => {
  const svg = lineBandSvg(POINTS, { title: "T", accent: "#e05c2e" });
  expect(svg).toContain("01/2026");
});

test("lineBandSvg escapes data + renders a source/as-of caption", () => {
  const svg = lineBandSvg(POINTS, {
    title: "A & B <chart>",
    accent: "#e05c2e",
    source: "Zillow ZHVI",
    asOf: "2026-06-30",
  });
  expect(svg).toContain("A &amp; B &lt;chart&gt;");
  expect(svg).toContain("Zillow ZHVI");
  expect(svg).toContain("as of 06/30/2026");
});

test("lineBandSvg tolerates points with no band (plain trend)", () => {
  const svg = lineBandSvg(
    [
      { label: "2026-01", value: 100 },
      { label: "2026-02", value: 120 },
    ],
    { title: "T", accent: "#000000", valueFormat: "count" },
  );
  expect(svg).toContain("<polyline");
});
