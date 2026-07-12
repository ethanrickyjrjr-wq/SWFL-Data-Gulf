// lib/desk/correlation.ts — deterministic Pearson correlation for the /desk
// ZIP×metric heatmap. Numbers computed in code (platform rule: deterministic
// math, never model-produced). Descriptive only — the zone copy says "moved
// together", never causal or predictive.

export interface CorrelationMetric {
  key: string;
  label: string;
}

export interface CorrelationResult {
  labels: string[];
  /** matrix[i][j] = Pearson r of metric i vs metric j (−1..1, 2 dp); null when
   *  that PAIR had too few complete rows. Diagonal is exactly 1. */
  matrix: (number | null)[][];
  /** Smallest complete-case n across all pairs — stated in the zone copy. */
  minPairN: number;
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
  let minPairN = Number.POSITIVE_INFINITY;

  for (let i = 0; i < k; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < k; j++) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const row of rows) {
        const a = row[metrics[i].key];
        const b = row[metrics[j].key];
        if (typeof a !== "number" || !Number.isFinite(a)) continue;
        if (typeof b !== "number" || !Number.isFinite(b)) continue;
        xs.push(a);
        ys.push(b);
      }
      if (xs.length < CORRELATION_MIN_ZIPS) return null;
      minPairN = Math.min(minPairN, xs.length);
      const r = pearson(xs, ys);
      if (r == null) return null;
      const rounded = Math.round(r * 100) / 100;
      matrix[i][j] = rounded;
      matrix[j][i] = rounded;
    }
  }

  if (!Number.isFinite(minPairN)) return null;
  return { labels: metrics.map((m) => m.label), matrix, minPairN };
}
