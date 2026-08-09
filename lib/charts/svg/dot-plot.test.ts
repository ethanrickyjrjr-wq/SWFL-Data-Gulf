import { test, expect } from "bun:test";
import { dotPlotSvg } from "./dot-plot";

// dot-plot / comparison — "this place vs a reference", two dots on a line per row,
// shared horizontal scale. These assert the real shape renders: the title, a row
// label, value + reference dots (≥2 <circle>), the formatted value via the one
// currency root, and the source · as-of caption in MM/DD/YYYY (Rule 5).

const items = [
  { label: "Median sale price", value: 485000, reference: 410000 },
  { label: "Active inventory", value: 1820, reference: 1500 },
  { label: "Days on market", value: 62, reference: 48 },
];

test("renders the title", () => {
  const svg = dotPlotSvg(items, { title: "Lee vs prior year", accent: "#1BB8C9" });
  expect(svg).toContain("Lee vs prior year");
});

test("renders a row label", () => {
  const svg = dotPlotSvg(items, { title: "x", accent: "#000" });
  expect(svg).toContain("Median sale price");
});

test("draws value + reference dots — at least 2 circles per populated row", () => {
  const svg = dotPlotSvg(items, { title: "x", accent: "#000" });
  const circles = (svg.match(/<circle /g) || []).length;
  // 2 legend dots + (value + reference) per row = 2 + 3*2 = 8
  expect(circles).toBeGreaterThanOrEqual(2);
  expect(circles).toBe(8);
});

test("formats the end value through the one currency root (not raw)", () => {
  const svg = dotPlotSvg(items, { title: "x", accent: "#000", valueFormat: "usd" });
  expect(svg).toContain("$485k");
  expect(svg).not.toContain("485000");
});

test("a row with no reference draws only the value dot", () => {
  const svg = dotPlotSvg([{ label: "Solo", value: 100 }], {
    title: "x",
    accent: "#000",
    valueFormat: "count",
  });
  // 2 legend dots + 1 value dot, no reference dot
  const circles = (svg.match(/<circle /g) || []).length;
  expect(circles).toBe(3);
});

test("legend names the reference label + a clear value label (not 'this')", () => {
  const svg = dotPlotSvg(items, { title: "x", accent: "#000", referenceLabel: "2024" });
  expect(svg).toContain("2024");
  expect(svg).toContain("value"); // default value-dot legend (was the cryptic "this")
});

test("the value-dot legend label is configurable", () => {
  const svg = dotPlotSvg(items, { title: "x", accent: "#000", valueLabel: "Home value" });
  expect(svg).toContain("Home value");
  expect(svg).not.toContain(">this<");
});

// Regression: a long value label must push the reference legend to the right so the
// two don't overlap/scramble (the fixed-x layout broke once "this" became a real metric).
test("reference legend sits after the value label (scales with its length)", () => {
  const legendRefCx = (svg: string) => {
    const m = /<circle cx="([\d.]+)" cy="42" r="5" fill="#ffffff" stroke="#B6BDC6"/.exec(svg);
    return m ? Number(m[1]) : NaN;
  };
  const short = dotPlotSvg(items, { title: "x", accent: "#000", valueLabel: "A" });
  const long = dotPlotSvg(items, { title: "x", accent: "#000", valueLabel: "Median sale price" });
  expect(legendRefCx(long)).toBeGreaterThan(legendRefCx(short));
});

// Regression (operator, 07/26/2026 — "why are the words so close to the teal"):
// the linear scale mapped the MIN value dot to the exact track start (flush against
// the row label) and the MAX value dot to the exact track end (flush against the
// value label). Dots must stay clear of both text gutters.
test("min-value dot clears the row-label gutter (inset from track start)", () => {
  const svg = dotPlotSvg(items, { title: "x", accent: "#0aa" });
  const cxs = [...svg.matchAll(/<circle cx="([\d.]+)" cy="[\d.]+" r="6" fill="#0aa"/g)].map((m) =>
    Number(m[1]),
  );
  expect(cxs.length).toBe(items.length);
  // The invariant is CLEARANCE FROM THE TRACK START, not a magic 156. The gutter is now
  // MEASURED from the real labels in the real face (lib/brand/text-metrics), so pinning
  // this to the old hardcoded padL asserted the bug, not the rule: it passed only while
  // the gutter happened to be 156 wide, and would have kept passing if a label ran
  // straight over the dots. Read the track start out of the rendered SVG instead — the
  // per-row baseline rule is the one element that starts exactly at padL.
  const trackStart = Number(/<line x1="([\d.]+)" y1="[\d.]+" x2=/.exec(svg)?.[1] ?? NaN);
  expect(Number.isFinite(trackStart)).toBe(true);
  // the smallest value's dot must sit a visible inset inside the track, not at padL
  // where its 6px radius lands 2px from the label text.
  expect(Math.min(...cxs)).toBeGreaterThanOrEqual(trackStart + 12);
});

test("value labels sit clear of the max-value dot (gap ≥ dot radius + 8)", () => {
  const svg = dotPlotSvg(items, { title: "x", accent: "#0aa" });
  const cxs = [...svg.matchAll(/<circle cx="([\d.]+)" cy="[\d.]+" r="6" fill="#0aa"/g)].map((m) =>
    Number(m[1]),
  );
  // Attribute-order-tolerant on purpose. This regex used to pin the exact string
  // `font-family="Arial" font-size="12" font-weight="bold"`, so adding the tabular-figures
  // attributes between them silently matched ZERO nodes — and a zero-length match makes
  // Math.min() return Infinity, which would have PASSED the clearance assertion while
  // measuring nothing. Match the value-label nodes by what makes them value labels.
  // Matched by TABULAR + bold, which is exactly what makes a node a VALUE label here: it
  // renders a number, so it carries tabular figures, and the bold chart title does not.
  // (A looser `font-weight="bold"` match picks up the title and reports 4 for 3 rows.)
  const labelXs = [
    ...svg.matchAll(/<text x="([\d.]+)" y="[\d.]+"[^>]*tabular-nums[^>]*font-weight="500"/g),
  ].map((m) => Number(m[1]));
  expect(labelXs.length).toBe(items.length);
  const maxDot = Math.max(...cxs);
  const labelX = Math.min(...labelXs);
  expect(labelX - maxDot).toBeGreaterThanOrEqual(14); // 6px radius + 8px daylight
});

test("renders a source · as-of caption with MM/DD/YYYY (Rule 5)", () => {
  const svg = dotPlotSvg(items, {
    title: "x",
    accent: "#000",
    source: "cre-swfl",
    asOf: "2026-05-31",
  });
  expect(svg).toContain("cre-swfl");
  expect(svg).toContain("05/31/2026");
  expect(svg).not.toContain("2026-05-31");
});

test("caps at 8 rows", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ label: `r${i}`, value: i + 1 }));
  const svg = dotPlotSvg(many, { title: "x", accent: "#000", valueFormat: "count" });
  expect(svg).toContain("r7");
  expect(svg).not.toContain("r8");
});

test("is a self-contained, email-safe svg string (no script/style/canvas)", () => {
  const svg = dotPlotSvg(items, { title: "x", accent: "#000" });
  expect(svg.startsWith("<svg")).toBe(true);
  expect(svg.endsWith("</svg>")).toBe(true);
  expect(svg).not.toContain("<script");
  expect(svg).not.toContain("<style");
  expect(svg).not.toContain("<canvas");
});
