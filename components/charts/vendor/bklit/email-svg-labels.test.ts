// Failure-mode tests for the on-chart value-label helpers (decree 08/02/2026:
// "NO NUMBERS ON THE CHART"). Each test is named for the failure it blocks.
import { describe, expect, test } from "bun:test";
import { axisLabel, barRects, defaultValueDisplay, lineEndpoints } from "./email-svg";

describe("lineEndpoints — geometry drift never misplaces a label", () => {
  test("extracts first/last pair from a visx line path", () => {
    const svg = `<path class="visx-linepath" d="M0,120L50,80L100,40" />`;
    expect(lineEndpoints(svg)).toEqual({ x0: 0, y0: 120, x1: 100, y1: 40 });
  });
  test("bklit class rename (drift) → null, not a wrong position", () => {
    expect(lineEndpoints(`<path class="renamed" d="M0,1L2,3"/>`)).toBeNull();
  });
  test("degenerate single-pair path → null", () => {
    expect(lineEndpoints(`<path class="visx-linepath" d="M5,5" />`)).toBeNull();
  });
});

describe("barRects — count mismatch is detectable", () => {
  const accent = "#2a8c85";
  test("returns rect centers in document order", () => {
    const svg =
      `<rect fill="${accent}" height="10" width="20" x="0" y="90"/>` +
      `<rect fill="${accent}" height="40" width="20" x="30" y="60"/>`;
    expect(barRects(svg, accent)).toEqual([
      { cx: 10, top: 90 },
      { cx: 40, top: 60 },
    ]);
  });
  test("non-accent rects (grid, average line) are not counted as bars", () => {
    const svg = `<rect fill="#EAECEF" height="1" width="500" x="0" y="50"/>`;
    expect(barRects(svg, accent)).toEqual([]);
  });
});

describe("axisLabel / defaultValueDisplay — presentation, never invention", () => {
  test("ISO month → Mon ’YY", () => {
    expect(axisLabel("2025-01")).toBe("Jan ’25");
    expect(axisLabel("2026-06-30")).toBe("Jun ’26");
  });
  test("category label passes through untouched (ZIPs are not dates)", () => {
    expect(axisLabel("33921")).toBe("33921");
    expect(axisLabel("Cape Coral")).toBe("Cape Coral");
  });
  test("month 13+ (malformed) passes through rather than crashing", () => {
    expect(axisLabel("2025-13")).toBe("2025-13");
  });
  test("display default: locale format, one decimal max, no unit invented", () => {
    expect(defaultValueDisplay(3.53)).toBe("3.5");
    expect(defaultValueDisplay(108881)).toBe("108,881");
  });
});
