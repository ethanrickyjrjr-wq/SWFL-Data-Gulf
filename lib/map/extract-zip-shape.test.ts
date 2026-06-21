import { describe, expect, it } from "bun:test";
import { parseBounds, extractZipShape } from "./extract-zip-shape";

describe("parseBounds", () => {
  it("walks relative commands (the old regex only saw the absolute M anchor)", () => {
    // A 50×50 square drawn with the relative h/v commands the contractor map uses.
    const b = parseBounds('<path d="M100,100 h50 v50 h-50 z" />');
    expect(b).toEqual({ minX: 100, minY: 100, maxX: 150, maxY: 150 });
  });

  it("handles glued numbers and leading-dot decimals", () => {
    const b = parseBounds('<path d="M10,10l.5.5h-.25v2" />');
    expect(b.minX).toBeCloseTo(10, 5);
    expect(b.maxX).toBeCloseTo(10.5, 5);
    expect(b.maxY).toBeCloseTo(12.5, 5);
  });

  it("folds in Bézier control points so curves stay inside the box", () => {
    const b = parseBounds('<path d="M0,0 C10,40 30,40 40,0" />');
    expect(b.maxY).toBeCloseTo(40, 5); // control points reach y=40
    expect(b.maxX).toBeCloseTo(40, 5);
  });

  it("unions bounds across multiple paths in a group", () => {
    const b = parseBounds('<path d="M0,0 h10 v10" /><path d="M100,100 h5 v5" />');
    expect(b).toEqual({ minX: 0, minY: 0, maxX: 105, maxY: 105 });
  });

  it("falls back to the full map box when no path data is present", () => {
    expect(parseBounds("<g></g>")).toEqual({ minX: 0, minY: 0, maxX: 1190, maxY: 1237 });
  });
});

describe("extractZipShape", () => {
  it("frames relative-heavy ZIPs with a sane, non-degenerate viewBox", () => {
    // 34142 (Immokalee) is built almost entirely from relative commands — the
    // exact case that blew up the cutout before the parser fix.
    const { svgMarkup, found } = extractZipShape("34142");
    expect(found).toBe(true);
    const vb = svgMarkup.match(/viewBox="([^"]+)"/)?.[1] ?? "";
    const [, , w, h] = vb.split(" ").map(Number);
    expect(w).toBeGreaterThan(50);
    expect(h).toBeGreaterThan(50);
    // aspect ratio should be reasonable, not a wildly clipped sliver
    expect(w / h).toBeGreaterThan(0.3);
    expect(w / h).toBeLessThan(4);
  });
});
