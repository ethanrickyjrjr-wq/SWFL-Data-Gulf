import { describe, expect, it } from "bun:test";
import { fitWindows, FIT_WINDOWS } from "./series-fit";
import type { FitPoint } from "./fit-line";

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
