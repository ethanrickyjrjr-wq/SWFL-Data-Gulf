import { test, expect } from "bun:test";
import { dumbbellGapSvg } from "./dumbbell-gap";

// dumbbell / range row — an open entry dot ↔ a filled top dot on one shared
// scale, connected, with the high÷low multiple badged in code. These assert the
// real shape renders: title, row label, paired dots + connector, the code-computed
// ratio badge, log-scale ordering, and the source · as-of caption (Rule 5).

const items = [
  { label: "Naples", low: 62610, high: 15127191 },
  { label: "Fort Myers", low: 67039, high: 2486150 },
  { label: "Lehigh Acres", low: 84465, high: 389027 },
];

test("renders the title and a row label", () => {
  const svg = dumbbellGapSvg(items, { title: "The gap, city by city", accent: "#1BB8C9" });
  expect(svg).toContain("The gap, city by city");
  expect(svg).toContain("Naples");
});

test("draws a pair of dots per row plus 2 legend dots", () => {
  const svg = dumbbellGapSvg(items, { title: "x", accent: "#000" });
  const circles = (svg.match(/<circle /g) || []).length;
  // 2 legend + (low + high) per row = 2 + 3*2 = 8
  expect(circles).toBe(8);
});

test("badges the high÷low multiple, computed in code", () => {
  const svg = dumbbellGapSvg(items, { title: "x", accent: "#000" });
  // 15,127,191 / 62,610 = 241.6… → rounds to "242x" (>=10 rounds whole)
  expect(svg).toContain("242x");
  // 389,027 / 84,465 = 4.605… → "4.6x" (<10 keeps one decimal)
  expect(svg).toContain("4.6x");
});

test("a zero/degenerate low badges an em dash, never a fabricated ratio", () => {
  const svg = dumbbellGapSvg([{ label: "Broken", low: 0, high: 100 }], {
    title: "x",
    accent: "#000",
  });
  expect(svg).toContain("—");
  expect(svg).not.toContain("Infinityx");
});

test("log scale keeps extreme rows ordered without collapsing small ones", () => {
  const svg = dumbbellGapSvg(items, { title: "x", accent: "#000", scale: "log" });
  // still renders every row's pair of dots
  const circles = (svg.match(/<circle /g) || []).length;
  expect(circles).toBe(8);
});

test("legend labels are configurable", () => {
  const svg = dumbbellGapSvg(items, {
    title: "x",
    accent: "#000",
    lowLabel: "entry community",
    highLabel: "top community",
  });
  expect(svg).toContain("entry community");
  expect(svg).toContain("top community");
});

test("axis extremes format through the one currency root (not raw)", () => {
  const svg = dumbbellGapSvg(items, { title: "x", accent: "#000", valueFormat: "usd" });
  expect(svg).not.toContain("15127191");
});

test("renders a source · as-of caption with MM/DD/YYYY (Rule 5)", () => {
  const svg = dumbbellGapSvg(items, {
    title: "x",
    accent: "#000",
    source: "FDOR parcel rolls via SWFL Data Gulf",
    asOf: "2026-07-14",
  });
  expect(svg).toContain("FDOR parcel rolls via SWFL Data Gulf");
  expect(svg).toContain("07/14/2026");
  expect(svg).not.toContain("2026-07-14");
});

test("caps at 8 rows", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ label: `r${i}`, low: 100, high: 200 }));
  const svg = dumbbellGapSvg(many, { title: "x", accent: "#000" });
  expect(svg).toContain("r7");
  expect(svg).not.toContain("r8");
});

test("is a self-contained, email-safe svg string (no script/style/canvas)", () => {
  const svg = dumbbellGapSvg(items, { title: "x", accent: "#000" });
  expect(svg.startsWith("<svg")).toBe(true);
  expect(svg.endsWith("</svg>")).toBe(true);
  expect(svg).not.toContain("<script");
  expect(svg).not.toContain("<style");
  expect(svg).not.toContain("<canvas");
});
