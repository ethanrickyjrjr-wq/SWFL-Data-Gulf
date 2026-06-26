import { test, expect } from "bun:test";
import { sparkGridSvg, type SparkCard } from "./spark-grid";

// SPARK-GRID conformance — the pure SVG builder shared by the web frame
// (SparkGridFrame) and the email PNG path (resvg). These assert the real
// elements render: the title, each card's grey label, a formatted value via the
// one value root (formatAxisTick), and a sparkline <polyline> + end dot per card
// — plus that the output is email-safe (no <script>/<style>/<canvas>) and ≤600px.

const cards: SparkCard[] = [
  {
    label: "Median price",
    value: 1290000,
    series: [410000, 1285000, 1290000, 1310000],
    valueFormat: "usd",
  },
  { label: "Active listings", value: 1840, series: [1500, 1620, 1720, 1840], valueFormat: "count" },
  { label: "Median rent", value: 2450, series: [2300, 2380, 2420, 2450], valueFormat: "rent" },
];

test("renders the title", () => {
  const svg = sparkGridSvg(cards, { title: "Market snapshot", accent: "#1BB8C9" });
  expect(svg).toContain("Market snapshot");
});

test("renders each card's grey label", () => {
  const svg = sparkGridSvg(cards, { title: "x", accent: "#000" });
  expect(svg).toContain("Median price");
  expect(svg).toContain("Active listings");
  expect(svg).toContain("Median rent");
});

test("formats values through the one value root (usd millions, count, rent)", () => {
  const svg = sparkGridSvg(cards, { title: "x", accent: "#000" });
  expect(svg).toContain("$1.3M"); // usd millions branch, never $1290000
  expect(svg).not.toContain("1290000");
  expect(svg).toContain("2k"); // count root abbreviates 1840 → "2k"
  expect(svg).toContain("$2,450"); // rent — full dollars
});

test("draws one sparkline polyline + end dot per card", () => {
  const svg = sparkGridSvg(cards, { title: "x", accent: "#e05c2e" });
  const polylines = (svg.match(/<polyline /g) || []).length;
  expect(polylines).toBe(3); // one per card
  const dots = (svg.match(/<circle /g) || []).length;
  expect(dots).toBe(3); // end dot per card
  expect(svg).toContain('stroke="#e05c2e"'); // accent drives the sparkline
});

test("caps at 4 cards", () => {
  const five: SparkCard[] = [...cards, ...cards].slice(0, 5);
  const svg = sparkGridSvg(five, { title: "x", accent: "#000" });
  const polylines = (svg.match(/<polyline /g) || []).length;
  expect(polylines).toBeLessThanOrEqual(4);
});

test("renders the source + as-of caption as MM/DD/YYYY (Rule 5)", () => {
  const svg = sparkGridSvg(cards, {
    title: "x",
    accent: "#000",
    source: "Lee County PA",
    asOf: "2026-06-23",
  });
  expect(svg).toContain("Lee County PA");
  expect(svg).toContain("06/23/2026");
  expect(svg).not.toContain("2026-06-23");
});

test("escapes data labels — no raw angle brackets from a label", () => {
  const svg = sparkGridSvg([{ label: "<script>x", value: 5, series: [1, 2, 3] }], {
    title: "t",
    accent: "#000",
  });
  expect(svg).toContain("&lt;script&gt;x");
  expect(svg).not.toContain("<script>x");
});

test("is email-safe: a self-contained ≤600px svg with no script/style/canvas", () => {
  const svg = sparkGridSvg(cards, { title: "x", accent: "#000" });
  expect(svg.startsWith("<svg")).toBe(true);
  expect(svg.endsWith("</svg>")).toBe(true);
  expect(svg).not.toContain("<script");
  expect(svg).not.toContain("<style");
  expect(svg).not.toContain("<canvas");
  const w = Number(/width="(\d+)"/.exec(svg)?.[1]);
  expect(w).toBeLessThanOrEqual(600);
});
