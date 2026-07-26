import { test, expect } from "bun:test";
import { slopePairSvg } from "./slope-pair";

// slopegraph — one line per series between a "then" column and a "now" column;
// rising series take the accent, falling take the muted ink. These assert the
// real shape renders: title, column headers, per-series line + endpoint dots,
// direction coloring, formatted endpoints, and the as-of caption (Rule 5).

const items = [
  { label: "Marco Island", then: 1890, now: 2115 },
  { label: "Lehigh Acres", then: 2015, now: 1850 },
  { label: "Naples", then: 5500, now: 5500 },
];

test("renders the title and both column headers", () => {
  const svg = slopePairSvg(items, {
    title: "Rents, a year apart",
    accent: "#1BB8C9",
    thenLabel: "June 2025",
    nowLabel: "June 2026",
  });
  expect(svg).toContain("Rents, a year apart");
  expect(svg).toContain("June 2025");
  expect(svg).toContain("June 2026");
});

test("draws one line + two endpoint dots per series", () => {
  const svg = slopePairSvg(items, { title: "x", accent: "#000" });
  const circles = (svg.match(/<circle /g) || []).length;
  expect(circles).toBe(6); // 2 dots per series
});

test("rising series take the accent, falling/flat the muted ink", () => {
  const svg = slopePairSvg(items, { title: "x", accent: "#E11D48" });
  // Marco rises → accent appears on a stroke; Lehigh falls → muted slate ink appears
  expect(svg).toContain('stroke="#E11D48"');
  expect(svg).toContain('stroke="#94A3B8"');
});

test("endpoints format through the one currency root (not raw)", () => {
  const svg = slopePairSvg(items, { title: "x", accent: "#000", valueFormat: "usd" });
  expect(svg).not.toContain(">1890<");
});

test("series labels ride the now column", () => {
  const svg = slopePairSvg(items, { title: "x", accent: "#000" });
  expect(svg).toContain("Marco Island");
  expect(svg).toContain("Lehigh Acres");
});

test("renders a source · as-of caption with MM/DD/YYYY (Rule 5)", () => {
  const svg = slopePairSvg(items, {
    title: "x",
    accent: "#000",
    source: "Realtor.com Economic Research",
    asOf: "2026-06-30",
  });
  expect(svg).toContain("Realtor.com Economic Research");
  expect(svg).toContain("06/30/2026");
  expect(svg).not.toContain("2026-06-30");
});

test("caps at 8 series", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ label: `s${i}`, then: i, now: i + 1 }));
  const svg = slopePairSvg(many, { title: "x", accent: "#000", valueFormat: "count" });
  expect(svg).toContain("s7");
  expect(svg).not.toContain("s8");
});

test("is a self-contained, email-safe svg string (no script/style/canvas)", () => {
  const svg = slopePairSvg(items, { title: "x", accent: "#000" });
  expect(svg.startsWith("<svg")).toBe(true);
  expect(svg.endsWith("</svg>")).toBe(true);
  expect(svg).not.toContain("<script");
  expect(svg).not.toContain("<style");
  expect(svg).not.toContain("<canvas");
});
