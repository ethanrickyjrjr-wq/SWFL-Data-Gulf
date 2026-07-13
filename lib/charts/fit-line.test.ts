// lib/charts/fit-line.test.ts
import { describe, expect, it } from "bun:test";
import { fitLine, tQuantile975, MIN_FIT_POINTS } from "./fit-line";

/** n monthly points on an exact line y = intercept + slope*month. */
function line(n: number, intercept: number, slope: number) {
  return Array.from({ length: n }, (_, i) => ({
    when: new Date(Date.UTC(2015, 5 + i, 1)),
    y: intercept + slope * i,
  }));
}

describe("tQuantile975 — a REAL t-table, not a hardcoded 1.96", () => {
  it("matches published critical values", () => {
    expect(tQuantile975(10)).toBeCloseTo(2.228, 2);
    expect(tQuantile975(20)).toBeCloseTo(2.086, 2);
    expect(tQuantile975(30)).toBeCloseTo(2.042, 2);
    expect(tQuantile975(120)).toBeCloseTo(1.98, 2);
  });
});

describe("fitLine", () => {
  it("recovers a known slope and intercept", () => {
    const f = fitLine(line(24, 100_000, 2_000))!;
    expect(f.slope).toBeCloseTo(2_000, 6);
    expect(f.intercept).toBeCloseTo(100_000, 6);
    expect(f.n).toBe(24);
  });

  it("a perfect line has R2 = 1 and is established", () => {
    const f = fitLine(line(24, 100_000, 2_000))!;
    expect(f.r2).toBeCloseTo(1, 9);
    expect(f.established).toBe(true);
  });

  it("evaluates the FITTED line, not the last observed point", () => {
    // Anti-regression for trailingSlope's bug: it extrapolated from the last
    // OBSERVED value. Perturb the final point; the fitted line must barely move.
    const pts = line(24, 100_000, 2_000);
    pts[pts.length - 1].y += 50_000; // one outlier at the end
    const f = fitLine(pts)!;
    const lastX = new Date(Date.UTC(2015, 5 + 23, 1));
    // The fitted value at the last month is NOT the observed (inflated) value.
    expect(f.at(lastX)).toBeLessThan(100_000 + 2_000 * 23 + 50_000);
  });

  it("returns null below MIN_FIT_POINTS", () => {
    expect(MIN_FIT_POINTS).toBe(12);
    expect(fitLine(line(11, 1, 1))).toBeNull();
  });

  it("returns null on zero variance and never throws", () => {
    const flat = Array.from({ length: 24 }, (_, i) => ({
      when: new Date(Date.UTC(2015, 5 + i, 1)),
      y: 500,
    }));
    // y has no variance -> no line to fit.
    expect(fitLine(flat)).toBeNull();
    expect(() => fitLine([])).not.toThrow();
    expect(fitLine([])).toBeNull();
  });

  it("PRESERVES A GAP in x — the ex-boom window's whole correctness", () => {
    // Two 12-month runs on the SAME line, with a 24-month hole between them.
    // If x were re-indexed 0..23 contiguously, the slope would come out WRONG.
    const a = line(12, 100_000, 2_000); // months 0..11
    const b = Array.from({ length: 12 }, (_, i) => ({
      when: new Date(Date.UTC(2015, 5 + 36 + i, 1)), // months 36..47
      y: 100_000 + 2_000 * (36 + i),
    }));
    const f = fitLine([...a, ...b])!;
    expect(f.slope).toBeCloseTo(2_000, 6); // the TRUE slope survives the gap
  });

  it("an UNESTABLISHED direction: noise around a flat line", () => {
    // Alternating +/- noise, no real slope. The CI must contain zero.
    const pts = Array.from({ length: 24 }, (_, i) => ({
      when: new Date(Date.UTC(2015, 5 + i, 1)),
      y: 500_000 + (i % 2 === 0 ? 40_000 : -40_000),
    }));
    const f = fitLine(pts)!;
    expect(f.established).toBe(false);
    expect(f.ci[0]).toBeLessThan(0);
    expect(f.ci[1]).toBeGreaterThan(0);
  });
});
