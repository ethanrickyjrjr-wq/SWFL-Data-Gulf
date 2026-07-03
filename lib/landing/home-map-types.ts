// lib/landing/home-map-types.ts
//
// Shared types + color math for the homepage choropleth. Deliberately DATA-FREE:
// the mock fixture lives in home-map-data.ts (import-quarantined by
// lib/highlighter/grounding-coverage.test.ts); live rows come from
// load-home-map-data.ts. Client components import THIS module so they never
// touch the fixture.

/** "permits" is dead (corridor-scoped scrape, no county-wide coverage — operator
 *  ruling 07/03/2026); "activity" = active residential listings took its slot. */
export type MetricKey = "value" | "activity" | "flood";

export const METRIC_ORDER: MetricKey[] = ["value", "activity", "flood"];

export interface MetricDef {
  label: string;
  sublabel: string;
  format: "currency" | "number";
  data: Record<string, number>;
  /** Real min/max of the rendered rows — legend endpoints. Color position is
   *  rank-based (see quantileT), NOT (val-low)/(high-low): SWFL metrics are
   *  heavily skewed and a linear t collapses ~90% of ZIPs onto c0. */
  low: number;
  high: number;
  c0: string;
  c1: string;
  c2: string;
  /** MM/DD/YYYY (or a year range for windowed metrics), stated once per surface. */
  asOf?: string;
  /** True when this metric is the mock fixture (lake unreachable) — surfaces
   *  the "Sample data" badge instead of the live one. */
  sample?: boolean;
}

export interface HomeMapData {
  placeNames: Record<string, string>;
  /** Partial: a metric with no live rows and no honest fixture simply isn't
   *  offered (its pill hides) — never invented, never stale-mislabeled. */
  metrics: Partial<Record<MetricKey, MetricDef>>;
}

export interface HomeStatCell {
  label: string;
  value: string;
  sub: string;
  tag: string;
}

export interface HomeMapPayload {
  data: HomeMapData;
  /** Hero badge line. Live: "Live data · Lee & Collier Counties · as of MM/DD/YYYY".
   *  Any fixture metric in play → the sample wording instead. */
  badge: string;
  anySample: boolean;
  stats: HomeStatCell[];
}

/** Fill for a ZIP the active metric has no row for — visibly neutral, NOT the
 *  canvas background (a data gap must read as "no data", not "no map"). */
export const NO_DATA_FILL = "#2a3942";

function hexToRgb(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}
function lerpColor(a: string, b: string, t: number) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return `rgb(${Math.round(lerp(r1, r2, t))},${Math.round(lerp(g1, g2, t))},${Math.round(lerp(b1, b2, t))})`;
}

/** Three-stop ramp: t∈[0,.5] walks c0→c1, t∈[.5,1] walks c1→c2. */
export function rampColor(t: number, c0: string, c1: string, c2: string): string {
  const tt = Math.max(0, Math.min(1, t));
  return tt < 0.5 ? lerpColor(c0, c1, tt * 2) : lerpColor(c1, c2, (tt - 0.5) * 2);
}

/**
 * Rank-percentile position per ZIP (ties share the average rank). Spreads a
 * skewed distribution across the full ramp so the map reads as data, not as a
 * dead low-end mass. Legend endpoints stay the REAL min/max values — only the
 * color position is rank-based.
 */
export function quantileT(data: Record<string, number>): Record<string, number> {
  const entries = Object.entries(data).sort((a, b) => a[1] - b[1]);
  const n = entries.length;
  const out: Record<string, number> = {};
  if (n === 0) return out;
  if (n === 1) {
    out[entries[0][0]] = 0.5;
    return out;
  }
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && entries[j + 1][1] === entries[i][1]) j++;
    const avgRank = (i + j) / 2;
    const t = avgRank / (n - 1);
    for (let k = i; k <= j; k++) out[entries[k][0]] = t;
    i = j + 1;
  }
  return out;
}
