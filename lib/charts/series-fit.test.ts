import { describe, expect, it } from "bun:test";
import { fitWindows, FIT_WINDOWS, trendVerdict } from "./series-fit";
import type { WindowFit } from "./series-fit";
import type { Fit, FitPoint } from "./fit-line";

/** Monthly points from 06/2015 through 05/2026 on a line, as our real series run. */
function monthly(from: Date, n: number, base: number, slope: number): FitPoint[] {
  return Array.from({ length: n }, (_, i) => ({
    when: new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1)),
    y: base + slope * i,
  }));
}

const AS_OF = new Date(Date.UTC(2026, 4, 31)); // 05/31/2026

describe("fitWindows", () => {
  it("names all six windows", () => {
    expect([...FIT_WINDOWS]).toEqual(["full", "10y", "5y", "24m", "12m", "ex-boom"]);
  });

  it("drops a window with fewer than 12 points instead of drawing it", () => {
    const pts = monthly(new Date(Date.UTC(2024, 11, 1)), 18, 400_000, 1_000);
    const got = fitWindows(pts, AS_OF);
    const keys = got.map((w) => w.window);
    // Every returned window must have cleared the 12-point floor.
    for (const w of got) expect(w.fit.n).toBeGreaterThanOrEqual(12);
    // A window with too few points is absent entirely, not present-and-null.
    expect(keys).not.toContain("10y");
  });

  // THE REACH-BACK RULE. An 18-month series does not reach back ten years, five
  // years, or even twenty-four months. A trailing window may only be OFFERED when
  // the data actually reaches its cut date — otherwise an 18-month fit ships wearing
  // the label "last 10 years" and the window's NAME does the lying. `full` and
  // `ex-boom` are not trailing windows and are not subject to the rule.
  it("never offers a trailing window the data does not reach back to", () => {
    const pts = monthly(new Date(Date.UTC(2024, 11, 1)), 18, 400_000, 1_000);
    // No `ex-boom` either: this series never spanned 2021–22, so the exclusion would
    // have excluded nothing — see the ex-boom-drops-when-it-excluded-nothing test.
    expect(fitWindows(pts, AS_OF).map((w) => w.window)).toEqual(["full", "12m"]);
  });

  // THE REACH-BACK BOUNDARY. `earliest > cut` — STRICTLY greater. A series whose
  // earliest point lands EXACTLY on the cut date DOES reach back to it. Mutating the
  // check to `earliest >= cut` deletes the 12m window here; no other fixture in this
  // file puts a point on a cut date, so this test is the only thing that catches it.
  it("KEEPS a trailing window whose earliest point lands EXACTLY on the cut date", () => {
    // 06/2025 → 05/2026. AS_OF is 05/31/2026, so the 12m cut is exactly 06/01/2025 —
    // exactly the earliest point. Reaching the cut is reaching back.
    const pts = monthly(new Date(Date.UTC(2025, 5, 1)), 12, 400_000, 1_000);
    const got = fitWindows(pts, AS_OF);
    const twelve = got.find((w) => w.window === "12m");
    expect(twelve).toBeDefined();
    expect(twelve!.fit.n).toBe(12);
    expect(twelve!.fit.from).toBe("06/01/2025");
  });

  // AN EXCLUSION THAT EXCLUDED NOTHING IS A LIE. On a post-boom series `ex-boom` drops
  // zero points, fits identically to `full`, and still claims to have removed the
  // 2021–22 run-up. Task 3 quotes that label into a customer email.
  it("DROPS ex-boom when the series has no boom to exclude", () => {
    const pts = monthly(new Date(Date.UTC(2024, 11, 1)), 18, 400_000, 1_000); // 12/2024 →, no boom
    const got = fitWindows(pts, AS_OF);
    expect(got.map((w) => w.window)).not.toContain("ex-boom");
    // ...and it is dropped precisely BECAUSE it would have duplicated `full`.
    expect(got.find((w) => w.window === "full")!.fit.n).toBe(18);
  });

  it("KEEPS ex-boom when the series really does span the boom", () => {
    const pts = monthly(new Date(Date.UTC(2015, 5, 1)), 132, 200_000, 1_800); // 06/2015 →, spans 2021–22
    const ex = fitWindows(pts, AS_OF).find((w) => w.window === "ex-boom");
    expect(ex).toBeDefined();
    expect(ex!.fit.n).toBe(132 - 24);
  });

  // "AS OF X" MEANS AS OF X. A point dated after asOf is in no window — not in a
  // trailing one, and not in `full` either.
  it("excludes points dated AFTER asOf from every window, full included", () => {
    // 06/2015 → 07/2026: the last two points (06/2026, 07/2026) postdate AS_OF.
    const pts = monthly(new Date(Date.UTC(2015, 5, 1)), 134, 200_000, 1_800);
    const got = fitWindows(pts, AS_OF);
    const full = got.find((w) => w.window === "full")!;
    expect(full.fit.n).toBe(132); // the two future points are gone, not fitted
    expect(full.fit.to).toBe("05/01/2026"); // full ends AT the as-of, never past it
    expect(got.find((w) => w.window === "12m")!.fit.n).toBe(12);
  });

  it("offers a trailing window as soon as the data DOES reach back to it", () => {
    // 132 monthly points, 06/2015 → 05/2026: every trailing window is reachable.
    const pts = monthly(new Date(Date.UTC(2015, 5, 1)), 132, 200_000, 1_800);
    const got = fitWindows(pts, AS_OF);
    expect(got.map((w) => w.window)).toEqual(["full", "10y", "5y", "24m", "12m", "ex-boom"]);
    const n = Object.fromEntries(got.map((w) => [w.window, w.fit.n]));
    expect(n["10y"]).toBe(120);
    expect(n["5y"]).toBe(60);
    expect(n["24m"]).toBe(24);
    expect(n["12m"]).toBe(12);
  });

  it("ex-boom EXCLUDES calendar 2021 and 2022", () => {
    const pts = monthly(new Date(Date.UTC(2015, 5, 1)), 132, 200_000, 1_800);
    const ex = fitWindows(pts, AS_OF).find((w) => w.window === "ex-boom")!;
    expect(ex.fit.n).toBe(132 - 24); // 24 months of 2021+2022 removed
  });

  it("ex-boom ALWAYS discloses what it dropped — an undisclosed exclusion is a lie", () => {
    const pts = monthly(new Date(Date.UTC(2015, 5, 1)), 132, 200_000, 1_800);
    const ex = fitWindows(pts, AS_OF).find((w) => w.window === "ex-boom")!;
    expect(ex.label.toLowerCase()).toContain("excluding");
    expect(ex.label).toContain("2021");
    expect(ex.label).toContain("2022");
  });

  it("does not assume the caller handed us a sorted series", () => {
    // The reach-back check must take the TRUE minimum, not points[0]. A shuffled
    // series that DOES reach back must still be offered every window it earns.
    const asc = monthly(new Date(Date.UTC(2015, 5, 1)), 132, 200_000, 1_800);
    const shuffled = [...asc].reverse();
    expect(fitWindows(shuffled, AS_OF).map((w) => w.window)).toEqual([...FIT_WINDOWS]);
  });

  it("never throws on an empty or tiny series", () => {
    expect(() => fitWindows([], AS_OF)).not.toThrow();
    expect(fitWindows([], AS_OF)).toEqual([]);
  });
});

/** Build a WindowFit from the REAL numbers computed on the lake 07/13/2026. */
function wf(
  window: WindowFit["window"],
  slope: number,
  r2: number,
  n: number,
  ci: [number, number],
): WindowFit {
  const fit: Fit = {
    slope,
    intercept: 0,
    r2,
    n,
    se: 0,
    ci,
    established: ci[0] > 0 || ci[1] < 0,
    tight: r2 >= 0.7,
    from: "06/30/2015",
    to: "05/31/2026",
    at: () => 0,
  };
  return { window, label: String(window), fit };
}

describe("trendVerdict — the comparison is CODE's job, never the model's", () => {
  it("CAPE CORAL -> plateau (long-run up; the last 24 months establish NOTHING)", () => {
    const v = trendVerdict([
      wf("full", 1931, 0.787, 132, [1755, 2107]),
      wf("ex-boom", 1802, 0.882, 108, [1674, 1930]),
      wf("5y", -472, 0.105, 60, [-833, -111]),
      wf("24m", -619, 0.151, 24, [-1245, 7]), // CONTAINS ZERO
      wf("12m", 1395, 0.205, 12, [-343, 3132]),
    ])!;
    expect(v.kind).toBe("plateau");
    expect(v.tight).toBe(true);
    // The recent slope's SIGN may not be read: its interval crosses zero.
    expect(v.claim.sentence).not.toContain("619");
  });

  it("LEHIGH ACRES -> reversed (eleven years up; two years down HARD, both strong)", () => {
    const v = trendVerdict([
      wf("full", 1979, 0.887, 132, [1855, 2103]),
      wf("ex-boom", 1923, 0.908, 108, [1804, 2042]),
      wf("5y", 740, 0.213, 60, [366, 1113]),
      wf("24m", -1844, 0.843, 24, [-2183, -1504]), // established, OPPOSITE
      wf("12m", -1977, 0.694, 12, [-2808, -1146]),
    ])!;
    expect(v.kind).toBe("reversed");
    expect(v.tight).toBe(true);
  });

  it("SANIBEL -> plateau, LOOSE (direction IS solid; the FIT is not)", () => {
    const v = trendVerdict([
      wf("full", 3446, 0.334, 131, [2590, 4302]),
      wf("ex-boom", 3055, 0.423, 108, [2361, 3748]),
      wf("5y", -2384, 0.041, 59, [-5435, 667]),
      wf("24m", 317, 0.0, 24, [-9734, 10368]), // establishes nothing
      wf("12m", 13899, 0.072, 12, [-17557, 45355]),
    ])!;
    expect(v.kind).toBe("plateau");
    // "noisy" and "no direction" are DIFFERENT claims. Sanibel's direction is real.
    expect(v.tight).toBe(false);
  });

  it("no-direction when the LONG window establishes nothing", () => {
    const v = trendVerdict([
      wf("full", 120, 0.01, 132, [-400, 640]), // CI contains zero
      wf("24m", 50, 0.0, 24, [-900, 1000]),
    ])!;
    expect(v.kind).toBe("no-direction");
  });

  it("intact when CURRENT agrees with LONG", () => {
    const v = trendVerdict([
      wf("ex-boom", 1800, 0.88, 108, [1670, 1930]),
      wf("24m", 1500, 0.75, 24, [1100, 1900]), // same sign, established
    ])!;
    expect(v.kind).toBe("intact");
  });

  it("returns null when there is no LONG window at all", () => {
    expect(trendVerdict([])).toBeNull();
    expect(trendVerdict([wf("24m", 100, 0.9, 24, [50, 150])])).toBeNull();
  });

  it("THE LICENSE: the verdict is a SettledClaim the claim gate already honors", () => {
    const v = trendVerdict([
      wf("ex-boom", 1802, 0.882, 108, [1674, 1930]),
      wf("24m", -619, 0.151, 24, [-1245, 7]),
    ])!;
    // Same shape as compareToSet/settledCount: a sentence + its numeral anchors.
    expect(typeof v.claim.sentence).toBe("string");
    expect(Array.isArray(v.claim.anchors)).toBe(true);
    // Every numeral in the sentence is anchored, so no unanchored-number violation.
    expect(v.claim.anchors.length).toBeGreaterThan(0);
  });

  it("THE FALSIFIER IS COMPUTED, never a blank for the model to fill", () => {
    const v = trendVerdict([
      wf("ex-boom", 1802, 0.882, 108, [1674, 1930]),
      wf("24m", -619, 0.151, 24, [-1245, 7]),
    ])!;
    expect(Number.isFinite(v.falsifier.value)).toBe(true);
    expect(v.falsifier.sentence.length).toBeGreaterThan(0);
  });
});
