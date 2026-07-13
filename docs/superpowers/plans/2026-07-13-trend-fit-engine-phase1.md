# Trend Fit Engine — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 6 tasks, 14 files, keywords: migration, architecture

**Goal:** One surface-neutral least-squares engine that reports whether a trend's direction is statistically established, and a code-computed verdict the narrator may restate but not invent.

**Architecture:** `fitLine` (pure OLS + standard error + 95% CI, owns its date→month-index encoding) → `fitWindows` (fixed window menu) → `trendVerdict` (deterministic classification returning a `SettledClaim`). The verdict flows through the EXISTING claim gate — no changes to `claims.ts`. No renderer, no `ChartSpec` change, no model call in this phase.

**Tech Stack:** TypeScript, `bun test`, Next.js. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-13-trend-fit-engine-design.md`
**Check:** `trend_fit_engine_live_verify`

## Global Constraints

- **Deterministic math, narrative prose.** Every number in this phase is computed in code. No model call exists in phase 1.
- **The gate is the confidence interval, NOT R².** If the 95% CI on the slope contains zero, the sign of that slope MAY NOT BE READ — not by code, not by a narrator. R² is a *qualifier* (tight ≥ 0.7 / loose < 0.7), never a gate.
- **Real t-table, df = n−2.** A hardcoded 1.96 is a bug: at n = 12, df = 10, t\* = 2.228.
- **`MIN_FIT_POINTS = 12`.** Never call `pearson()` from `lib/desk/correlation.ts` — it carries `CORRELATION_MIN_ZIPS = 10`, a different floor for the same concept.
- **`fitLine` owns the x-encoding.** It takes dates and derives an absolute month index internally. Callers never supply `x`. This is what preserves the `ex-boom` gap.
- **Never throws.** Every function returns `null` or an empty result on bad input.
- **As-of dates are `MM/DD/YYYY`.** Never the raw internal token.
- **Verify with `bunx next build`, never `npx tsc`.**
- **Commit explicit paths only** (`git commit -- <paths>`). The git index is shared with parallel sessions. Never `git add -A`.

---

## File Structure

- **Create** `lib/charts/fit-line.ts` — OLS, standard error, t-quantile, 95% CI, `established`. Pure. No I/O. No date parsing beyond month-index derivation.
- **Create** `lib/charts/fit-line.test.ts`
- **Create** `lib/charts/series-fit.ts` — `FIT_WINDOWS`, `fitWindows`, `trendVerdict`. Depends only on `fit-line.ts` and `claims.ts` types.
- **Create** `lib/charts/series-fit.test.ts`
- **Modify** `lib/charts/tier-projection-series.ts` — `trailingSlope` deleted; `projectTierTrend` reimplemented on `fitLine`.
- **Modify** `lib/charts/tier-projection-series.test.ts`
- **Modify** `lib/charts/airport-series.ts` — the field named `trend` is a moving average. Rename it.
- **Modify** `lib/charts/airport-series.test.ts`, `components/charts/AirportPassengerChart.tsx` (or whatever consumes it — Task 5 locates it)
- **Modify** `lib/desk/correlation.ts` — add a significance gate.
- **Modify** `lib/desk/correlation.test.ts`, `lib/desk/types.ts`, `components/charts/DeskCorrelationHeatmap.tsx`

**Not in this phase (own plans):** the renderers drawing the line, `ChartSpec.trend`, the Email Lab preset, `/desk` trend block, the narrator/read.

---

### Task 1: `fitLine` — OLS with a confidence interval

**Files:**
- Create: `lib/charts/fit-line.ts`
- Test: `lib/charts/fit-line.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Fit`, `fitLine(points)`, `MIN_FIT_POINTS`, `tQuantile975(df)`.

**Background the implementer needs:**

Simple linear regression. Given points `(x_i, y_i)`:
- `Sxx = Σ(x−x̄)²`, `Syy = Σ(y−ȳ)²`, `Sxy = Σ(x−x̄)(y−ȳ)`
- `slope b = Sxy / Sxx`; `intercept a = ȳ − b·x̄`
- `SSE = Syy − Sxy²/Sxx` (residual sum of squares)
- `R² = (Sxy²)/(Sxx·Syy)`
- `SE(b) = sqrt( (SSE/(n−2)) / Sxx )`
- 95% CI on the slope = `b ± t*(n−2, 0.975) · SE(b)`
- **`established` = the CI does not contain zero.**

`t*(df, 0.975)` uses the Abramowitz–Stegun expansion with `z = 1.959964`:
```
t = z + (z³+z)/(4·df) + (5z⁵+16z³+3z)/(96·df²) + (3z⁷+19z⁵+17z³−15z)/(384·df³)
```
This is accurate to ~0.001 against the real table (df=10 → 2.228, df=20 → 2.086, df=30 → 2.042, df=120 → 1.980).

**x is derived from the dates, never passed in.** `x_i` = whole months from the FIRST point's month to point `i`'s month. This is what keeps the `ex-boom` window's gap (2021–22 removed) intact — a contiguous `0..n` re-index would silently change its slope.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test lib/charts/fit-line.test.ts`
Expected: FAIL — `Cannot find module './fit-line'`

- [ ] **Step 3: Write the implementation**

```ts
// lib/charts/fit-line.ts
//
// THE ONE FIT. Simple least-squares over a dated series, with the statistics that
// say whether its direction may be READ AT ALL.
//
// ── WHY THE GATE IS THE CONFIDENCE INTERVAL AND NOT R² ──────────────────────
// An earlier design gated on R². That is wrong, and our own data refutes it:
// Cape Coral's 5-year window has R² 0.105 — garbage — yet its slope is −$472/mo
// with a 95% interval of [−833, −111], which EXCLUDES ZERO. The slope is real.
// R² says how tightly the points hug the line. It does NOT say whether the
// direction is real. Those are different questions and conflating them was a bug.
//
//   established = the 95% CI on the slope excludes zero.   <- THE GATE
//   r2          = how tight the scatter is.                <- a QUALIFIER
//
// If `established` is false, the SIGN OF THE SLOPE MAY NOT BE READ — not by code,
// not by a narrator, not by a chart label.
//
// ── WHY THIS FUNCTION OWNS ITS x ────────────────────────────────────────────
// Callers pass DATES, never an index. Two callers indexing time differently would
// get different slopes from identical data, and no comment prevents that. x is an
// absolute month offset from the first point, so a GAP in the series (the ex-boom
// window drops 2021–22) survives — which is exactly what makes that window's fit
// correct. A contiguous 0..n re-index would silently change it.

export const MIN_FIT_POINTS = 12;

/** R² at or above this reads as a TIGHT fit. Below it, LOOSE. Never a gate. */
export const TIGHT_R2 = 0.7;

export interface Fit {
  /** Per MONTH. The unit is owned by this module, not implied by the caller. */
  slope: number;
  intercept: number;
  /** 0..1. The QUALIFIER (tight/loose) — never the significance gate. */
  r2: number;
  n: number;
  /** Standard error of the slope. */
  se: number;
  /** 95% confidence interval on the slope, df = n−2. */
  ci: [number, number];
  /** The CI excludes zero. IF FALSE, THE DIRECTION MAY NOT BE READ. */
  established: boolean;
  /** R² >= TIGHT_R2. Only meaningful when `established`. */
  tight: boolean;
  /** MM/DD/YYYY of the first fitted point. */
  from: string;
  /** MM/DD/YYYY of the last fitted point. */
  to: string;
  /** The FITTED line at any date — never anchored to the last observed value. */
  at(when: Date): number;
}

export interface FitPoint {
  when: Date;
  y: number;
}

/** Whole months from `a` to `b` (may be negative). */
function monthsBetween(a: Date, b: Date): number {
  return (
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
  );
}

function mdy(d: Date): string {
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getUTCFullYear()}`;
}

/**
 * The 97.5th percentile of Student's t with `df` degrees of freedom —
 * Abramowitz & Stegun expansion. Accurate to ~0.001 against the published table.
 *
 * A HARDCODED 1.96 IS A BUG: at df = 10 the true value is 2.228, so a naive
 * normal approximation would call an unestablished slope established.
 */
export function tQuantile975(df: number): number {
  if (df <= 0) return Number.POSITIVE_INFINITY;
  const z = 1.959964;
  const z3 = z ** 3;
  const z5 = z ** 5;
  const z7 = z ** 7;
  return (
    z +
    (z3 + z) / (4 * df) +
    (5 * z5 + 16 * z3 + 3 * z) / (96 * df ** 2) +
    (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / (384 * df ** 3)
  );
}

/** Least-squares fit over a dated series. `null` when it cannot honestly be fit. */
export function fitLine(points: readonly FitPoint[]): Fit | null {
  const pts = (points ?? [])
    .filter((p) => p && p.when instanceof Date && Number.isFinite(p.y))
    .slice()
    .sort((a, b) => a.when.getTime() - b.when.getTime());

  const n = pts.length;
  if (n < MIN_FIT_POINTS) return null;

  const origin = pts[0].when;
  const xs = pts.map((p) => monthsBetween(origin, p.when)); // absolute — gaps survive
  const ys = pts.map((p) => p.y);

  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  // No variance on either axis → there is no line. Never throw; say so.
  if (sxx === 0 || syy === 0) return null;

  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = (sxy * sxy) / (sxx * syy);

  const sse = syy - (sxy * sxy) / sxx;
  const df = n - 2;
  // Floating-point can make a perfect fit's SSE a hair negative.
  const se = Math.sqrt(Math.max(0, sse / df) / sxx);
  const t = tQuantile975(df);
  const ci: [number, number] = [slope - t * se, slope + t * se];
  const established = ci[0] > 0 || ci[1] < 0;

  return {
    slope,
    intercept,
    r2,
    n,
    se,
    ci,
    established,
    tight: r2 >= TIGHT_R2,
    from: mdy(pts[0].when),
    to: mdy(pts[n - 1].when),
    at: (when: Date) => intercept + slope * monthsBetween(origin, when),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test lib/charts/fit-line.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add lib/charts/fit-line.ts lib/charts/fit-line.test.ts
git commit -m "feat(charts): fitLine — OLS with the interval that says if a direction is real

The gate is the 95% CI on the slope, not R2. Cape Coral's 5-year window has
R2 0.105 and a CI of [-833,-111] — the slope is REAL and an R2 bar would have
thrown it away. R2 grades tightness; the interval establishes direction.

Real t-table (Abramowitz-Stegun), df=n-2 — a hardcoded 1.96 calls an
unestablished slope established at n=12 (true t* = 2.228).

fitLine owns its x-encoding: it takes dates and derives an absolute month
index, so a GAP in the series survives. That is what makes the ex-boom window
(2021-22 dropped) correct instead of silently re-indexed."
```

---

### Task 2: `fitWindows` — the window menu

**Files:**
- 🔴 Create: `lib/charts/series-fit.ts`
- 🔴 Test: `lib/charts/series-fit.test.ts`

**Interfaces:**
- Consumes: `fitLine`, `Fit`, `MIN_FIT_POINTS` from Task 1.
- Produces: `FIT_WINDOWS`, `FitWindow`, `WindowFit`, `fitWindows(points, asOf)`.

**Background:**

Six windows. Any window yielding fewer than `MIN_FIT_POINTS` points is **dropped from the menu entirely** — not drawn faintly, not returned with a caveat. A straight line through 6 points looks authoritative and means nothing.

`ex-boom` drops calendar 2021 and 2022 (the pandemic run-up). **Its label MUST always disclose the exclusion** — an undisclosed exclusion is a lie by omission. This is test-enforced.

- [ ] **Step 1: Write the failing test**

```ts
// lib/charts/series-fit.test.ts
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
    // Only 18 months of data: 'full' and '12m' survive; '24m' does NOT (18 >= 12,
    // so it DOES survive) — use a 14-month series so 12m survives and nothing else thin.
    const pts = monthly(new Date(Date.UTC(2024, 11, 1)), 18, 400_000, 1_000);
    const got = fitWindows(pts, AS_OF);
    const keys = got.map((w) => w.window);
    // Every returned window must have cleared the 12-point floor.
    for (const w of got) expect(w.fit.n).toBeGreaterThanOrEqual(12);
    // A window with too few points is absent entirely, not present-and-null.
    expect(keys).not.toContain("10y");
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

  it("never throws on an empty or tiny series", () => {
    expect(() => fitWindows([], AS_OF)).not.toThrow();
    expect(fitWindows([], AS_OF)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test lib/charts/series-fit.test.ts`
Expected: FAIL — `Cannot find module './series-fit'`

- [ ] **Step 3: Write the implementation (windows only — the verdict lands in Task 3)**

```ts
// lib/charts/series-fit.ts
//
// THE WINDOW MENU + THE VERDICT.
//
// A single fit is a liar by omission. Cape Coral's eleven-year slope is +$1,931/mo;
// its last twenty-four months are −$619/mo. BOTH ARE TRUE. The insight lives in the
// comparison — which is why we fit a fixed MENU of windows rather than picking one.
//
// And the comparison is CODE'S JOB, not the model's. See `trendVerdict`.

import { fitLine, MIN_FIT_POINTS, type Fit, type FitPoint } from "./fit-line";

export const FIT_WINDOWS = ["full", "10y", "5y", "24m", "12m", "ex-boom"] as const;
export type FitWindow = (typeof FIT_WINDOWS)[number];

export interface WindowFit {
  window: FitWindow;
  /** Human label. For `ex-boom` this MUST disclose the exclusion. */
  label: string;
  fit: Fit;
}

/** The pandemic run-up. Excluded by the `ex-boom` window, always disclosed. */
const BOOM_YEARS = new Set([2021, 2022]);

function monthsBack(asOf: Date, months: number): Date {
  return new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - months + 1, 1));
}

function select(points: readonly FitPoint[], w: FitWindow, asOf: Date): FitPoint[] {
  if (w === "ex-boom") {
    return points.filter((p) => !BOOM_YEARS.has(p.when.getUTCFullYear()));
  }
  if (w === "full") return [...points];
  const months = w === "10y" ? 120 : w === "5y" ? 60 : w === "24m" ? 24 : 12;
  const cut = monthsBack(asOf, months);
  return points.filter((p) => p.when >= cut);
}

function labelFor(w: FitWindow): string {
  switch (w) {
    case "full":
      return "full history";
    case "10y":
      return "last 10 years";
    case "5y":
      return "last 5 years";
    case "24m":
      return "last 24 months";
    case "12m":
      return "last 12 months";
    // NEVER silently exclude. The label carries the exclusion onto every surface.
    case "ex-boom":
      return "full history, excluding the 2021–2022 run-up";
  }
}

/**
 * Fit every window. A window with fewer than MIN_FIT_POINTS points is DROPPED —
 * a straight line through six points looks authoritative and means nothing. That is
 * how a 15-row traffic series or a 6-row rainfall series would lie to us.
 */
export function fitWindows(points: readonly FitPoint[], asOf: Date): WindowFit[] {
  const out: WindowFit[] = [];
  for (const w of FIT_WINDOWS) {
    const sel = select(points, w, asOf);
    if (sel.length < MIN_FIT_POINTS) continue; // dropped, not drawn
    const fit = fitLine(sel);
    if (!fit) continue;
    out.push({ window: w, label: labelFor(w), fit });
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test lib/charts/series-fit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/charts/series-fit.ts lib/charts/series-fit.test.ts
git commit -m "feat(charts): the window menu — a single fit is a liar by omission

Cape Coral's 11-year slope is +\$1,931/mo and its last 24 months are -\$619/mo.
Both true. The insight is the comparison, so we fit a fixed menu.

A window under 12 points is DROPPED, not drawn faintly — that is how a 15-row
traffic series would lie. ex-boom always discloses its exclusion in the label;
an undisclosed exclusion is a lie by omission, and it is test-enforced."
```

---

### Task 3: `trendVerdict` — the comparison, computed in code, as a SettledClaim

**Files:**
- 🔴 Modify: `lib/charts/series-fit.ts`
- 🔴 Modify: `lib/charts/series-fit.test.ts`

**Interfaces:**
- Consumes: `WindowFit` (Task 2), `SettledClaim` from `@/lib/deliverable/claims`.
- Produces: `Verdict`, `VerdictKind`, `trendVerdict(fits): Verdict | null`.

**Background — read this before writing code:**

On 07/13/2026 four of seven deliverables shipped a falsehood, and **not one contained an invented number**. What was invented was the claim drawn *between* correctly-sourced numbers — `sphere-weekly` wrote *"the gap is widening"* given a single level and no trend. `lib/deliverable/claims.ts` exists to stop that, and it has a live passing test:

```
expect(gateLetterProse("Prices in Cape Coral are climbing.", s)).toBe("")
```

**That is the exact sentence this feature exists to write, and the gate kills it today.** Correctly — until now we never had a fit, so every trajectory WAS invention.

**The fit is the license.** And the mechanism already exists: `auditClaims` (`claims.ts:278`) lets a claim shape through when the narrator's sentence is a verbatim restatement of a **settled sentence**. So `trendVerdict` returns a `SettledClaim` — the same shape `compareToSet` and `settledCount` already return — and it flows through the existing gate unchanged. **Do NOT add a licensing parameter to `auditClaims`. Do NOT write a second trajectory checker.** (Repo rule: one authority per shared concept.)

The window mapping is **fixed and outcome-determining** — do not improvise it:
- **LONG** = `ex-boom` if present, else `full`.
- **CURRENT** = `24m`. Not `12m` (its interval is so wide it establishes almost nothing — Sanibel's spans ±$31,000). Not `5y` (not "now").
- Both must be `established` before their sign is read.

- [ ] **Step 1: Write the failing test**

These fixtures are REAL — computed against `data_lake.redfin_city_swfl` on 07/13/2026, single-family median sale price. Do not adjust them to make code pass.

```ts
// append to lib/charts/series-fit.test.ts
import { trendVerdict } from "./series-fit";
import type { WindowFit } from "./series-fit";
import type { Fit } from "./fit-line";

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test lib/charts/series-fit.test.ts`
Expected: FAIL — `trendVerdict is not a function`

- [ ] **Step 3: Write the implementation**

Append to `lib/charts/series-fit.ts`:

```ts
import { numeralsIn, type SettledClaim } from "@/lib/deliverable/claims";

export type VerdictKind = "intact" | "reversed" | "plateau" | "no-direction";

export interface Verdict {
  kind: VerdictKind;
  /** R² of the LONG window >= TIGHT_R2. "Loose" ≠ "no direction". */
  tight: boolean;
  long: WindowFit;
  current: WindowFit | null;
  /**
   * THE LICENSE. A settled sentence — the same shape `compareToSet` and
   * `settledCount` return. `auditClaims` lets a trajectory through ONLY as a
   * verbatim restatement of a settled sentence, so handing this to the narrator
   * is what permits it to say "climbing" at all. A trajectory the model invents
   * on its own still dies in the gate. NO CHANGE TO claims.ts IS NEEDED.
   */
  claim: SettledClaim;
  /** Computed, never a blank. A spec that asks the model for a number is a lie. */
  falsifier: { value: number; sentence: string };
}

const usd0 = (n: number) =>
  `$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;

/**
 * The comparison across windows — COMPUTED. The model never sees the window table
 * and therefore cannot draw its own trajectory between rows of it. (sphere-weekly
 * wrote "the gap is widening" from a single level; that is the failure this stops.)
 *
 * LONG    = ex-boom if present, else full.
 * CURRENT = 24m, fixed. 12m's interval establishes almost nothing; 5y is not "now".
 *
 * A window whose CI contains zero has NO READABLE DIRECTION. Its sign is never used.
 */
export function trendVerdict(fits: readonly WindowFit[]): Verdict | null {
  const long =
    fits.find((f) => f.window === "ex-boom") ?? fits.find((f) => f.window === "full");
  if (!long) return null;

  const current = fits.find((f) => f.window === "24m") ?? null;
  const tight = long.fit.tight;
  const dir = (n: number) => (n > 0 ? "up" : "down");

  // The LONG window doesn't establish a direction → we say nothing about direction.
  if (!long.fit.established) {
    const sentence =
      `Over the ${long.label} this series does not follow a straight line — ` +
      `its trend is not statistically distinguishable from flat.`;
    return {
      kind: "no-direction",
      tight,
      long,
      current,
      claim: { sentence, anchors: numeralsIn(sentence) },
      falsifier: {
        value: 0,
        sentence: `A direction becomes readable only once a fitted slope's 95% interval clears zero.`,
      },
    };
  }

  const longRate = `${usd0(long.fit.slope)} a month`;
  const longDir = dir(long.fit.slope);
  const climb = longDir === "up" ? "climbing" : "falling";

  let kind: VerdictKind;
  let sentence: string;

  if (!current || !current.fit.established) {
    // PLATEAU — the long run is real; the recent window establishes NOTHING. We may
    // not read the recent slope's sign at all, so it is absent from the sentence.
    kind = "plateau";
    sentence =
      `Across the ${long.label} this market has been ${climb} ${longRate} ` +
      `(${long.fit.from} to ${long.fit.to}). The last 24 months do not establish a ` +
      `direction either way — that is a plateau, not a turn.`;
  } else if (dir(current.fit.slope) === longDir) {
    kind = "intact";
    sentence =
      `Across the ${long.label} this market has been ${climb} ${longRate}, and the ` +
      `last 24 months are still ${climb}, at ${usd0(current.fit.slope)} a month.`;
  } else {
    kind = "reversed";
    const nowDir = dir(current.fit.slope) === "up" ? "climbing" : "falling";
    sentence =
      `Across the ${long.label} this market was ${climb} ${longRate}. Over the last ` +
      `24 months it has been ${nowDir}, at ${usd0(current.fit.slope)} a month. ` +
      `The direction has turned.`;
  }

  // THE FALSIFIER, COMPUTED. The long-run line's own lower bound is the number the
  // next print must clear for the trend to hold.
  const bound = longDir === "up" ? long.fit.ci[0] : long.fit.ci[1];
  const falsifier = {
    value: bound,
    sentence:
      `This read breaks if the next two months move against the fitted line by more ` +
      `than ${usd0(bound)} a month.`,
  };

  return {
    kind,
    tight,
    long,
    current,
    claim: { sentence, anchors: numeralsIn(sentence) },
    falsifier,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test lib/charts/series-fit.test.ts`
Expected: PASS, all fixtures.

- [ ] **Step 5: Verify the build**

Run: `bunx next build`
Expected: compiles clean. (Never `npx tsc`.)

- [ ] **Step 6: Commit**

```bash
git add lib/charts/series-fit.ts lib/charts/series-fit.test.ts
git commit -m "feat(charts): trendVerdict — the trajectory word is CODE OUTPUT

sphere-weekly wrote 'the gap is widening' off ONE level and no trend, and the
claim gate has killed every trajectory since — including the exact sentence this
feature exists to write (gateLetterProse('Prices in Cape Coral are climbing.')
=== '' is a LIVE test). The gate was right: until now, every trajectory WAS
invention, because we had no fit.

The fit is the license. trendVerdict returns a SettledClaim — the same shape
compareToSet/settledCount return — so it rides the EXISTING allowance in
auditClaims (a verbatim restatement of a settled sentence). No change to
claims.ts. No second trajectory checker. A trajectory the model invents on its
own still dies.

A window whose CI contains zero has NO readable direction: Cape Coral's -\$619/mo
recent slope never appears in the sentence, because its interval crosses zero.
Fixtures are REAL (Cape Coral plateau / Lehigh reversed / Sanibel loose),
computed on the lake, not asserted."
```

---

### Task 4: Migrate `TierProjectionChart` off `trailingSlope`

**Files:**
- Modify: `lib/charts/tier-projection-series.ts`
- Modify: `lib/charts/tier-projection-series.test.ts`
- Read (do not change its props): `components/charts/TierProjectionChart.tsx:50` (calls `projectTierTrend(data)`)

**Interfaces:**
- Consumes: `fitLine` (Task 1).
- Produces: `projectTierTrend(entries, horizonMonths?, window?)` — **same signature, same `TierProjection` return shape**, so the component needs no change.

**Background:**

`trailingSlope` is the only real OLS in the repo and it is being replaced. Its consumer `projectTierTrend` currently does:

```ts
luxuryEnd: luxuryLatest + trailingSlope(luxWin) * horizonMonths
```

That extrapolates from the **last observed value**, not the fitted line's endpoint. One noisy final month drags the whole projection with it. **This is a deliberate behavior change** — the new code projects from the fitted line, which is what a regression is for.

`ChartRow` has `luxury_index` / `starter_index`. Check whether it carries a date field; if it does **not**, synthesize monthly dates from the row order (the series is monthly and ordered) — `fitLine` needs `when`, and a synthetic contiguous month sequence is correct here because this window has no gaps.

Every projection call site must already carry `[INFERENCE]` + base value + falsifier in visible copy (rules of engagement). `TierProjectionChart.tsx:112` already renders that copy — **do not remove it**.

- [ ] **Step 1: Write the failing test**

```ts
// lib/charts/tier-projection-series.test.ts — replace the trailingSlope tests
import { describe, expect, it } from "bun:test";
import { projectTierTrend } from "./tier-projection-series";
import type { ChartRow } from "@/types/viz";

function rows(n: number, base: number, slope: number): ChartRow[] {
  return Array.from({ length: n }, (_, i) => ({
    luxury_index: base + slope * i,
    starter_index: base + slope * i,
  })) as unknown as ChartRow[];
}

describe("projectTierTrend", () => {
  it("projects from the FITTED LINE, not the last observed value", () => {
    // 12 months on an exact line, then spike the LAST point. The old trailingSlope
    // implementation anchored at that spike and dragged the projection with it.
    const r = rows(12, 100, 2);
    (r[11] as { luxury_index: number }).luxury_index = 500; // outlier
    const p = projectTierTrend(r, 6, 12)!;
    // The fitted line at month 11 is ~122, so a 6-month projection lands nowhere
    // near 500 + slope*6. Anchoring at the observed 500 would.
    expect(p.luxuryEnd).toBeLessThan(400);
  });

  it("returns null below the window size", () => {
    expect(projectTierTrend(rows(5, 100, 2), 6, 12)).toBeNull();
  });

  it("keeps its shape so TierProjectionChart needs no change", () => {
    const p = projectTierTrend(rows(24, 100, 2), 6, 12)!;
    expect(p).toHaveProperty("luxuryLatest");
    expect(p).toHaveProperty("starterLatest");
    expect(p).toHaveProperty("luxuryEnd");
    expect(p).toHaveProperty("starterEnd");
    expect(p.horizonMonths).toBe(6);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test lib/charts/tier-projection-series.test.ts`
Expected: FAIL on the fitted-line test (the current code anchors at the observed value).

- [ ] **Step 3: Rewrite `tier-projection-series.ts`**

```ts
// lib/charts/tier-projection-series.ts
import type { ChartRow } from "@/types/viz";
import { fitLine, type FitPoint } from "./fit-line";

export interface TierProjection {
  luxuryLatest: number;
  starterLatest: number;
  luxuryEnd: number;
  starterEnd: number;
  horizonMonths: number;
}

/** The window is monthly and ordered, with no gaps — synthesize its month stamps. */
function toPoints(values: number[]): FitPoint[] {
  return values.map((y, i) => ({ when: new Date(Date.UTC(2000, i, 1)), y }));
}

/** Project a tier `horizonMonths` past the window's end, ON THE FITTED LINE. */
function project(values: number[], horizonMonths: number): number | null {
  const fit = fitLine(toPoints(values));
  if (!fit) return null;
  // The fitted line at (last month + horizon). NOT `lastObserved + slope*horizon` —
  // that was trailingSlope's bug: one noisy final print dragged the whole projection.
  const endMonth = values.length - 1 + horizonMonths;
  return fit.at(new Date(Date.UTC(2000, endMonth, 1)));
}

/**
 * Deterministic linear extrapolation of each tier's index on its trailing
 * `window`-month least-squares trend. This is the [INFERENCE] base math — the
 * CALLER must render the tag, the audited base values, and one falsifier in
 * visible copy (rules of engagement rule 2). TierProjectionChart already does.
 */
export function projectTierTrend(
  entries: ChartRow[],
  horizonMonths = 6,
  window = 12,
): TierProjection | null {
  const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  const lux = entries.map((e) => e.luxury_index).filter(num);
  const star = entries.map((e) => e.starter_index).filter(num);
  if (lux.length < window || star.length < window) return null;

  const luxWin = lux.slice(-window);
  const starWin = star.slice(-window);
  const luxuryEnd = project(luxWin, horizonMonths);
  const starterEnd = project(starWin, horizonMonths);
  if (luxuryEnd === null || starterEnd === null) return null;

  return {
    luxuryLatest: luxWin[luxWin.length - 1],
    starterLatest: starWin[starWin.length - 1],
    luxuryEnd,
    starterEnd,
    horizonMonths,
  };
}
```

- [ ] **Step 4: Run tests + build**

Run: `bun test lib/charts/tier-projection-series.test.ts && bunx next build`
Expected: PASS, clean build.

- [ ] **Step 5: Commit**

```bash
git add lib/charts/tier-projection-series.ts lib/charts/tier-projection-series.test.ts
git commit -m "fix(charts): project from the fitted line, not the last observed point

trailingSlope was the only real OLS in the repo and it anchored its projection at
the LAST OBSERVED VALUE — so one noisy final month dragged the whole forecast.
A regression exists precisely so it doesn't. Deliberate behavior change, asserted:
spike the final point and the projection barely moves.

Same signature, same return shape — TierProjectionChart is untouched, and its
[INFERENCE] + base + falsifier copy stays exactly as it is."
```

---

### Task 5 (FOLLOW-UP): the airport chart calls a moving average a "trend"

**Files:**
- Modify: `lib/charts/airport-series.ts` (`movingAverage`, `mapAirportTotalWithTrend`)
- Modify: `lib/charts/airport-series.test.ts`
- Modify: the consuming component (find it: `grep -rn "mapAirportTotalWithTrend" components/ app/`)

**Background — the hole:**

`movingAverage()` is a 12-month trailing mean, and its output rides on each row under the key **`trend`**. A moving average is a **smoother**: it has no slope, no goodness-of-fit, and cannot be extended forward. Calling it a trend is the same class of error the whole spec is about — a weaker statistic wearing a stronger name. Nobody lied on purpose; the name did the lying.

**This task does NOT add a fit.** It stops the mislabel. A real fit on this series is a later task once the renderer exists.

- [ ] **Step 1: Locate every consumer**

Run: `grep -rn "mapAirportTotalWithTrend\|\.trend\b" --include=*.ts --include=*.tsx lib/charts/airport-series.ts components/ app/`
Record every file that reads the `trend` key. All of them get renamed in this task.

- [ ] **Step 2: Write the failing test**

```ts
// lib/charts/airport-series.test.ts — add
import { mapAirportTotalWithTrend } from "./airport-series";

describe("a moving average is a SMOOTHER, and must not be called a trend", () => {
  it("carries the smoothed mean under `smoothed`, never `trend`", () => {
    const rows = Array.from({ length: 14 }, (_, i) => ({
      report_month: `2025-${String((i % 12) + 1).padStart(2, "0")}-01`,
      value: 100 + i,
    }));
    const out = mapAirportTotalWithTrend(rows);
    const row = out.points.at(-1)!;
    expect(row).toHaveProperty("smoothed");
    // The old key is GONE — a 12-month mean is not a trend and must not claim to be.
    expect(row).not.toHaveProperty("trend");
  });
});
```

- [ ] **Step 3: Rename the field and the concept**

In `lib/charts/airport-series.ts`: rename the emitted key `trend` → `smoothed`, and add this comment above `movingAverage`:

```ts
/**
 * A 12-month trailing mean. THIS IS A SMOOTHER, NOT A TREND.
 *
 * It follows every wiggle, has no slope, no goodness-of-fit, and cannot be extended
 * forward. It answers "what does this look like with the noise taken out" — NOT
 * "which way is this heading, and how confident are we." That question is answered
 * by `fitLine` (lib/charts/fit-line.ts), and only when the fitted slope's 95%
 * interval clears zero.
 *
 * It was called `trend` until 07/13/2026. The name was doing the lying.
 */
```

Update every consumer found in Step 1 (the chart's series key and any axis/legend label — the visible label must say "12-month average", never "trend").

- [ ] **Step 4: Run tests + build**

Run: `bun test lib/charts/airport-series.test.ts && bunx next build`
Expected: PASS, clean build.

- [ ] **Step 5: Commit**

```bash
git add lib/charts/airport-series.ts lib/charts/airport-series.test.ts components/charts/
git commit -m "fix(charts): a 12-month moving average is not a trend, and stops saying it is

movingAverage() emitted its 12-month trailing mean under the key \`trend\`, and the
chart labeled it as one. A smoother has no slope, no goodness-of-fit, and cannot be
extended forward — it cannot answer 'which way is this heading'. Renamed to
\`smoothed\`; the visible label now says '12-month average'.

Nobody lied on purpose. The name did the lying."
```

---

### Task 6 (FOLLOW-UP): the desk correlation heatmap paints noise as signal

**Files:**
- Modify: `lib/desk/correlation.ts`
- Modify: `lib/desk/correlation.test.ts`
- Modify: `lib/desk/types.ts` (`CorrelationData`)
- Modify: `components/charts/DeskCorrelationHeatmap.tsx`

**Background — the hole, and it is LIVE on `/desk` today:**

`lib/desk/correlation.ts` gates on **n ≥ 10 and nothing else** (`CORRELATION_MIN_ZIPS = 10`). It never tests significance. But the critical value of Pearson r at n = 10 (df = 8) is about **0.632** — below that, r is not statistically distinguishable from zero.

The heatmap's own buckets are `≤ −0.6 · −0.6 to −0.2 · −0.2 to 0.2 · 0.2 to 0.6 · ≥ 0.6`. So at the guard's own floor, **the entire 0.2–0.6 band is being colored as a correlation when it is indistinguishable from noise.**

This is exactly the bug the spec fixed in `fitLine`: a *strength* number used as if it were a *significance* test. Same class, different chart.

The critical r for a two-sided 95% test: `r_crit = t / sqrt(t² + df)` where `t = tQuantile975(df)`, `df = n − 2`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/desk/correlation.test.ts — add
import { pearson, isEstablished, criticalR } from "./correlation";

describe("a correlation must be ESTABLISHED, not merely computed", () => {
  it("criticalR matches the published table", () => {
    expect(criticalR(10)).toBeCloseTo(0.632, 2); // n=10, df=8
    expect(criticalR(30)).toBeCloseTo(0.361, 2); // n=30, df=28
  });

  it("r = 0.5 at n = 10 is NOT established — the heatmap colors it today", () => {
    // 0.5 lands in the '0.2 to 0.6' bucket and renders as a real correlation.
    // At n=10 the critical value is 0.632, so 0.5 is indistinguishable from zero.
    expect(isEstablished(0.5, 10)).toBe(false);
  });

  it("r = 0.7 at n = 10 IS established", () => {
    expect(isEstablished(0.7, 10)).toBe(true);
  });

  it("the same r becomes established with more data", () => {
    expect(isEstablished(0.5, 10)).toBe(false);
    expect(isEstablished(0.5, 30)).toBe(true); // crit ~0.361
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test lib/desk/correlation.test.ts`
Expected: FAIL — `criticalR is not a function`

- [ ] **Step 3: Add the significance gate**

In `lib/desk/correlation.ts`:

```ts
import { tQuantile975 } from "@/lib/charts/fit-line";

/**
 * The smallest |r| that is distinguishable from zero at 95%, two-sided, for `n` pairs.
 *
 * WHY THIS EXISTS: this module gated on n >= 10 and NOTHING ELSE. But at n = 10 the
 * critical r is 0.632 — and the /desk heatmap's buckets color everything from 0.2
 * upward as a correlation. The entire 0.2–0.6 band was noise painted as signal.
 *
 * Same bug as the R²-vs-confidence-interval error in lib/charts/fit-line.ts: a
 * STRENGTH number used as if it were a SIGNIFICANCE test. They are different questions.
 */
export function criticalR(n: number): number {
  const df = n - 2;
  if (df <= 0) return 1;
  const t = tQuantile975(df);
  return t / Math.sqrt(t * t + df);
}

/** Is this correlation distinguishable from zero? If not, it MAY NOT be colored. */
export function isEstablished(r: number | null, n: number): boolean {
  if (r === null || !Number.isFinite(r)) return false;
  return Math.abs(r) >= criticalR(n);
}
```

Then in `correlationMatrix`, alongside `matrix`, emit a parallel `established: boolean[][]` (using each pair's own complete-case n, not the global min). Add `established` to `CorrelationData` in `lib/desk/types.ts`.

- [ ] **Step 4: Render the unestablished cells as unestablished**

In `components/charts/DeskCorrelationHeatmap.tsx`: a cell whose `established` is `false` renders in the **neutral** bucket (the same as the `−0.2 to 0.2` band) regardless of its r, and its tooltip says so explicitly — e.g. `not distinguishable from zero (n = 12)`. **Do not silently hide it**; say why it is grey.

- [ ] **Step 5: Run tests + build**

Run: `bun test lib/desk/ && bunx next build`
Expected: PASS, clean build.

- [ ] **Step 6: Commit**

```bash
git add lib/desk/correlation.ts lib/desk/correlation.test.ts lib/desk/types.ts components/charts/DeskCorrelationHeatmap.tsx
git commit -m "fix(desk): the correlation heatmap was painting noise as signal

correlation.ts gated on n >= 10 and nothing else — it never tested significance.
At n = 10 the critical r is 0.632, but the heatmap's buckets color everything from
0.2 up as a real correlation. The whole 0.2-0.6 band was noise, colored.

Same class of bug as the R2-vs-confidence-interval error the trend-fit spec caught:
a STRENGTH number used as if it were a SIGNIFICANCE test. Cells that don't clear
their own critical r now render neutral and SAY WHY in the tooltip."
```

---

## Self-Review

**Spec coverage.** `fitLine` + CI gate + real t-table + date-owned x → Task 1. Window menu + 12-point floor + ex-boom disclosure → Task 2. `trendVerdict` + the named LONG/CURRENT mapping + computed falsifier + the claim-gate license → Task 3. `TierProjectionChart` migration → Task 4. The two same-class holes in other charts → Tasks 5 and 6.

**Deliberately NOT in this plan** (each needs its own): the renderers drawing the line (web + email SVG parity), `ChartSpec.trend`, the Email Lab "Line + trend" preset, the `/desk` trend block, the narrator writing the read, and the phase-2 scatter fit (which is blocked on `CorrelationData` retaining raw pairs). **No model call exists anywhere in this plan** — so nothing here can collide with the recipe work in flight.

**One spec correction this plan makes:** the spec said "extend `auditClaims` with a licensing `Verdict[]` parameter." That is unnecessary. `auditClaims:278` already allows a claim shape inside a verbatim restatement of a settled sentence, so `trendVerdict` returning a `SettledClaim` rides the existing mechanism with **zero changes to `claims.ts`** — which is more faithful to one-authority-per-shared-concept than the extension would have been.

**Types are consistent across tasks:** `Fit` / `FitPoint` / `MIN_FIT_POINTS` / `tQuantile975` (Task 1) are consumed by name in Tasks 2, 4, and 6; `WindowFit` / `FitWindow` (Task 2) by Task 3; `SettledClaim` (existing, `lib/deliverable/claims.ts`) by Task 3.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 2, Task 3 | `lib/charts/series-fit.ts`, `lib/charts/series-fit.test.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
