import { describe, expect, test } from "bun:test";
import { rankedDeltaSvg, type RankedDeltaItem } from "./ranked-delta";

const ITEMS: RankedDeltaItem[] = [
  { label: "Cape Coral", value: 412000, delta: 18000 },
  { label: "Fort Myers", value: 365000, delta: -9500 },
  { label: "Naples", value: 925000, delta: 0 },
  { label: "Bonita Springs", value: 540000 }, // no delta → no chip
];

describe("rankedDeltaSvg", () => {
  const svg = rankedDeltaSvg(ITEMS, {
    title: "Median sale price by city",
    accent: "#e05c2e",
    valueFormat: "usd",
    source: "Lee County Property Appraiser",
    asOf: "2026-05-31",
  });

  test("is a self-contained, email-safe svg string", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    // email-safe: no script/style/foreignObject/canvas
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("<style");
    expect(svg).not.toContain("<foreignObject");
  });

  test("renders the title", () => {
    expect(svg).toContain("Median sale price by city");
  });

  test("renders a row label", () => {
    expect(svg).toContain("Cape Coral");
  });

  test("renders a formatted value through the value root (usd → $412k)", () => {
    expect(svg).toContain("$412k");
  });

  test("renders an up arrow (green) and a down arrow (red)", () => {
    expect(svg).toContain("▲");
    expect(svg).toContain("▼");
    expect(svg).toContain("#15803D"); // up text color
    expect(svg).toContain("#DC2626"); // down text color
  });

  test("renders the bars/tracks: at least 4 <rect> elements", () => {
    const rectCount = (svg.match(/<rect/g) ?? []).length;
    expect(rectCount).toBeGreaterThanOrEqual(4);
  });

  test("renders the accent bar fill", () => {
    expect(svg).toContain("#e05c2e");
  });

  test("omits the delta chip when delta is absent (Bonita has no arrow row)", () => {
    // 3 of 4 rows have a delta → exactly 3 chip backgrounds among the arrows
    const arrows = (svg.match(/[▲▼→]/g) ?? []).length;
    expect(arrows).toBe(3);
  });

  test("formats the as-of date as MM/DD/YYYY (Rule 5)", () => {
    expect(svg).toContain("05/31/2026");
    expect(svg).not.toContain("2026-05-31");
  });

  test("caps at 8 rows", () => {
    const many: RankedDeltaItem[] = Array.from({ length: 15 }, (_, i) => ({
      label: `Row ${i}`,
      value: 100 - i,
      delta: 1,
    }));
    const out = rankedDeltaSvg(many, { title: "T", accent: "#000" });
    expect(out).toContain("Row 7");
    expect(out).not.toContain("Row 8");
  });
});
