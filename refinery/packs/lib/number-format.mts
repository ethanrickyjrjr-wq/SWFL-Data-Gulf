/**
 * Shared narrative-prose number formatters for refinery/packs/*.mts conclusion,
 * key_metrics.value (string form), and detail_table cell text.
 *
 * Every pack used to define its own local fmtK/fmtUsd/fmt1 (or nothing at all),
 * which is why the same platform could render `548798` next to `30,551` in two
 * different brains, and the same percentage as `43.2%` in prose but `43.20%` in
 * the auto-appended key_metric citation (refinery/render/speaker.mts
 * formatNumericValue — the locked display chokepoint — always uses 2 decimals
 * for percent). fmtPct here matches that chokepoint on purpose so prose and
 * citation never disagree again.
 */

/** Thousands-comma integer: 548798 -> "548,798". Rounds non-integers. */
export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Whole-dollar currency: 1234.5 -> "$1,235". */
export function fmtUsd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/**
 * Percentage-points, 2 decimals, matches refinery/render/speaker.mts
 * formatNumericValue's "percent" branch: 43.2 -> "43.20%". Pass a value already
 * in percentage-point scale (36.7, not 0.367).
 */
export function fmtPct(n: number): string {
  return `${n.toFixed(2)}%`;
}

/** 1-decimal ratio/rate, no suffix: z-scores, per-1,000 rates. 65.34 -> "65.3". */
export function fmtRatio(n: number): string {
  return n.toFixed(1);
}
