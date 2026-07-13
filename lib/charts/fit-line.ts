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
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
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
    // `instanceof Date` is TRUE for an Invalid Date (`new Date("garbage")`), whose
    // getUTCFullYear() is NaN. Without the getTime() check, ONE unparseable date
    // poisons the whole fit into a CONFIDENT-LOOKING NaN object — slope NaN, ci
    // [NaN, NaN], `established: false`, `from: "NaN/NaN/NaN"` — and "established:
    // false" reads as "we checked, there is no trend" when the truth is "we could
    // not fit this at all". A bad fit must be NULL, never a NaN wearing a Fit's face.
    .filter(
      (p) => p && p.when instanceof Date && !Number.isNaN(p.when.getTime()) && Number.isFinite(p.y),
    )
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
  // BELT AND SUSPENDERS. A degenerate fit is NULL, never a NaN-filled Fit object.
  // Nothing downstream may ever receive `established: false` as the answer to a
  // question we could not compute — that is a lie dressed as a finding.
  if (
    !Number.isFinite(slope) ||
    !Number.isFinite(intercept) ||
    !Number.isFinite(r2) ||
    !Number.isFinite(se)
  ) {
    return null;
  }

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
