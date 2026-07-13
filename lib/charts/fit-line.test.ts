// lib/charts/fit-line.test.ts
import { describe, expect, it } from "bun:test";
import { fitLine, tQuantile975, MIN_FIT_POINTS, TIGHT_R2 } from "./fit-line";

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

  // ── A FALLING MARKET IS A FINDING, NOT A SHRUG ────────────────────────────
  // THE MUTATION KILLER. Every test above this line passes if `established` is
  // narrowed to `ci[0] > 0` — i.e. if the module can only ever establish a RISING
  // trend and silently reports every real DECLINE as "no trend". This is exactly
  // the case the module's own header is about (Cape Coral: slope −472, CI
  // [−833, −111] — a REAL fall). A one-sided gate is the whole bug.
  it("an ESTABLISHED NEGATIVE trend — the CI is entirely BELOW zero", () => {
    const f = fitLine(line(24, 500_000, -2_000))!;
    expect(f.slope).toBeCloseTo(-2_000, 6);
    expect(f.established).toBe(true); // KILLS `established = ci[0] > 0`
    expect(f.ci[1]).toBeLessThan(0); // the whole interval sits below zero
  });

  it("a LOOSE but ESTABLISHED fall — the Cape Coral case: bad R2, real slope", () => {
    // Heavy alternating noise on a real downtrend. R2 is garbage; the direction
    // is still established. R2 IS NOT THE GATE — this is the test that says so.
    const pts = Array.from({ length: 36 }, (_, i) => ({
      when: new Date(Date.UTC(2015, 5 + i, 1)),
      y: 500_000 - 2_000 * i + (i % 2 === 0 ? 25_000 : -25_000),
    }));
    const f = fitLine(pts)!;
    expect(f.r2).toBeLessThan(TIGHT_R2); // loose scatter
    expect(f.tight).toBe(false);
    expect(f.established).toBe(true); // ...and yet the fall is REAL
    expect(f.ci[1]).toBeLessThan(0);
  });

  it("tight is R2 >= 0.7 — true for a near-perfect fit, false for noise", () => {
    expect(TIGHT_R2).toBe(0.7);
    const clean = fitLine(line(24, 100_000, 2_000))!;
    expect(clean.r2).toBeGreaterThanOrEqual(TIGHT_R2);
    expect(clean.tight).toBe(true);

    const noisy = fitLine(
      Array.from({ length: 24 }, (_, i) => ({
        when: new Date(Date.UTC(2015, 5 + i, 1)),
        y: 500_000 + (i % 2 === 0 ? 40_000 : -40_000),
      })),
    )!;
    expect(noisy.r2).toBeLessThan(TIGHT_R2);
    expect(noisy.tight).toBe(false);
  });

  it("from/to are MM/DD/YYYY — the format a customer actually reads", () => {
    const f = fitLine(line(24, 100_000, 2_000))!;
    expect(f.from).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(f.to).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(f.from).toBe("06/01/2015"); // line() starts at month index 5 = June
    expect(f.to).toBe("05/01/2017");
  });

  // ── A BAD DATE MUST BE NULL, NOT A CONFIDENT NaN ──────────────────────────
  it("an INVALID DATE returns null — never a NaN Fit wearing `established: false`", () => {
    const pts = line(12, 100_000, 2_000);
    pts[5].when = new Date("garbage"); // instanceof Date === true, getTime() === NaN
    // Dropping it leaves 11 points — below MIN_FIT_POINTS — so the answer is null.
    // The failure this guards: a Fit with slope NaN, ci [NaN, NaN], from
    // "NaN/NaN/NaN", and `established: false` — which reads as "we checked, there
    // is no trend" when the truth is "we could not fit this at all".
    expect(fitLine(pts)).toBeNull();

    // With enough good points left over, the bad one is simply DROPPED and the
    // surviving fit is honest — not silently anchored to some phantom date.
    const many = line(24, 100_000, 2_000);
    many[7].when = new Date("garbage");
    const f = fitLine(many)!;
    expect(f).not.toBeNull();
    expect(f.n).toBe(23);
    expect(Number.isFinite(f.slope)).toBe(true);
    expect(f.from).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(f.from).not.toContain("NaN");
  });

  it("a null-ish date is DROPPED, never coerced to 1970", () => {
    // The lake can return a null `period_end`. The caller's conversion decides:
    // `new Date(null)` is NOT invalid — it is the epoch, a silently WRONG point
    // this module cannot distinguish from real 1970 data. That is a CALLER-side
    // guard, and this documents the hazard:
    expect(Number.isNaN(new Date(null as unknown as string).getTime())).toBe(false);

    // The safe conversion is through a string — "null", "", undefined all yield an
    // Invalid Date, which fitLine now REJECTS.
    for (const bad of [String(null), String(undefined), ""]) {
      expect(Number.isNaN(new Date(bad).getTime())).toBe(true);
    }

    const pts = line(24, 100_000, 2_000);
    pts[0].when = new Date(String(null as unknown as string)); // "null" -> Invalid
    const f = fitLine(pts)!;
    expect(f.n).toBe(23);
    expect(f.from).not.toBe("01/01/1970"); // NOT coerced to the epoch
    expect(f.from).toBe("07/01/2015"); // the real first SURVIVING point
  });
});
