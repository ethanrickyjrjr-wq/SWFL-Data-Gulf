// lib/desk/correlation.ts — deterministic Pearson correlation for the /desk
// ZIP×metric heatmap. Numbers computed in code (platform rule: deterministic
// math, never model-produced). Descriptive only — the zone copy says "moved
// together", never causal or predictive.
//
// ── A CORRELATION MUST BE ESTABLISHED, NOT MERELY COMPUTED ──────────────────
// This module used to gate on n >= CORRELATION_MIN_ZIPS and NOTHING ELSE. But n
// is a floor on how much data went in, not a test of whether the answer is real.
// At n = 10 the critical r is 0.632 — and the heatmap colours everything from
// 0.2 upward as a correlation. The entire 0.2–0.6 band was noise, painted as
// signal, on a live page.
//
// Same bug as the R²-vs-confidence-interval error in lib/charts/fit-line.ts: a
// STRENGTH number used as if it were a SIGNIFICANCE test. They are different
// questions. r says how tightly the points hug the line; only a confidence test
// says whether the line is distinguishable from flat.
//
//   pearson()      = the strength.         <- a QUALIFIER
//   isEstablished() = distinguishable from zero at 95%.   <- THE GATE
//
// If `established` is false, THE CELL MAY NOT BE COLOURED.

import { tQuantile975 } from "@/lib/charts/fit-line";

export interface CorrelationMetric {
  key: string;
  label: string;
}

export interface CorrelationResult {
  labels: string[];
  /** matrix[i][j] = Pearson r of metric i vs metric j (−1..1, 2 dp); null when
   *  that PAIR had too few complete rows. Diagonal is exactly 1. */
  matrix: (number | null)[][];
  /** established[i][j] = that pair's |r| clears ITS OWN critical value at 95%.
   *  FALSE means the cell is indistinguishable from zero and MAY NOT be coloured
   *  — regardless of how large r looks. Diagonal is true (r = 1). */
  established: boolean[][];
  /** pairN[i][j] = that pair's OWN complete-case n. Each pair is judged against
   *  its own n, never the global minimum — different pairs have different gaps,
   *  and the global min would wrongly condemn a pair with plenty of data. */
  pairN: number[][];
  /** Smallest complete-case n across all pairs — stated in the zone copy. */
  minPairN: number;
}

/**
 * The smallest |r| distinguishable from zero at 95%, two-sided, for `n` pairs.
 *
 * WHY THIS EXISTS: this module gated on n >= 10 and NOTHING ELSE. At n = 10 the
 * critical r is 0.632 — and the /desk heatmap colours everything from 0.2 upward
 * as a correlation. The entire 0.2–0.6 band was noise, painted as signal.
 *
 * Same bug as the R²-vs-confidence-interval error in lib/charts/fit-line.ts: a
 * STRENGTH number used as if it were a SIGNIFICANCE test. Different questions.
 *
 * r_crit = t / sqrt(t² + df), df = n − 2, t = the 97.5th percentile of Student's
 * t. Reproduces the published table: n = 10 → 0.632, n = 30 → 0.361.
 */
export function criticalR(n: number): number {
  const df = n - 2;
  // df <= 0 → no test is possible. Return 1: nothing can clear it, so a pair we
  // cannot judge is never called established. Never let an unjudgeable pair pass.
  if (df <= 0) return 1;
  const t = tQuantile975(df);
  return t / Math.sqrt(t * t + df);
}

/** Is this correlation distinguishable from zero? If not, it MAY NOT be coloured. */
export function isEstablished(r: number | null, n: number): boolean {
  if (r === null || !Number.isFinite(r)) return false;
  return Math.abs(r) >= criticalR(n);
}

/** Fewer complete ZIP rows than this on any pair → the whole zone hides.
 *  Correlations on single-digit n read as signal but are noise. */
export const CORRELATION_MIN_ZIPS = 10;

/** Pearson r over paired finite values; null when n < CORRELATION_MIN_ZIPS or
 *  either side has zero variance. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < CORRELATION_MIN_ZIPS) return null;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (vx === 0 || vy === 0) return null;
  return cov / Math.sqrt(vx * vy);
}

/**
 * Pairwise complete-case correlation matrix across rows (one row = one ZIP).
 * Returns null when any pair falls under CORRELATION_MIN_ZIPS — a partially
 * trustworthy matrix would still read as a complete one.
 */
export function correlationMatrix(
  rows: Array<Record<string, number | null | undefined>>,
  metrics: CorrelationMetric[],
): CorrelationResult | null {
  const k = metrics.length;
  const matrix: (number | null)[][] = Array.from({ length: k }, () => Array(k).fill(null));
  const established: boolean[][] = Array.from({ length: k }, () => Array(k).fill(false));
  const pairN: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  let minPairN = Number.POSITIVE_INFINITY;

  const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

  for (let i = 0; i < k; i++) {
    matrix[i][i] = 1;
    // The diagonal is a metric against itself: r = 1, trivially established. Its n
    // is that metric's own finite count — so the tooltip can state a true number.
    pairN[i][i] = rows.filter((row) => finite(row[metrics[i].key])).length;
    established[i][i] = true;

    for (let j = i + 1; j < k; j++) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const row of rows) {
        const a = row[metrics[i].key];
        const b = row[metrics[j].key];
        if (!finite(a) || !finite(b)) continue;
        xs.push(a);
        ys.push(b);
      }
      if (xs.length < CORRELATION_MIN_ZIPS) return null;
      const n = xs.length;
      minPairN = Math.min(minPairN, n);
      const r = pearson(xs, ys);
      if (r == null) return null;

      // THE GATE runs on the RAW r against THIS PAIR'S OWN n. Not the rounded cell
      // (rounding must never decide significance) and not the global minPairN (a
      // pair with plenty of data must not be condemned by the sparsest pair).
      const ok = isEstablished(r, n);

      const rounded = Math.round(r * 100) / 100;
      matrix[i][j] = rounded;
      matrix[j][i] = rounded;
      established[i][j] = ok;
      established[j][i] = ok;
      pairN[i][j] = n;
      pairN[j][i] = n;
    }
  }

  if (!Number.isFinite(minPairN)) return null;
  return { labels: metrics.map((m) => m.label), matrix, established, pairN, minPairN };
}
