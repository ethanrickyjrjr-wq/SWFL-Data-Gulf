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
    expect(fitWindows(pts, AS_OF).map((w) => w.window)).toEqual(["full", "12m", "ex-boom"]);
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
