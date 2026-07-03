// lib/zip-report/signal-rank.ts
//
// Deterministic signal ranker for the ZIP report page (spec §2). Pure — no I/O,
// no model. Score = 0.6 × extremity + 0.4 × movement, where
//   extremity = |percentile − 50| / 50        (0..1; unknown percentile → 0)
//   movement  = min(|YoY %| / 20, 1)          (metric with no delta → 0)
// Uncovered candidates never compete — they surface as Find-it slots instead.
// The why-tag only restates held rank/delta values — never an invented number.

export interface SignalCandidate {
  key: string;
  label: string;
  /** Preformatted display value, e.g. "$485K" — restates a held number verbatim. */
  display: string;
  /** Secondary line under the value, e.g. "90-day median sale price". */
  sub?: string;
  /** 0–100 percentile across SWFL ZIPs for this metric; null when unknown. */
  percentile: number | null;
  /** Rank position in the same distribution, e.g. #3 of 57. */
  rankPos?: number;
  rankOf?: number;
  /** Signed YoY % movement; null when the metric carries no delta. */
  movementPct: number | null;
  /** The held delta restated for display, e.g. "↑ 18% YoY" / "↓ 12 days YoY". */
  movementText?: string;
  covered: boolean;
  source?: { label: string; url: string };
}

export interface RankedSignal extends SignalCandidate {
  score: number;
  /** Why this signal leads — "#2 of 57 SWFL ZIPs" or "↑ 18% YoY". */
  why: string;
}

/** Deterministic tie-break: earlier key wins. Unlisted keys sort after, alphabetically. */
export const SIGNAL_PRIORITY: readonly string[] = [
  "flood_aal",
  "median_sale_price",
  "median_dom",
  "permits_90d",
  "months_of_supply",
  "homes_sold",
  "inventory",
  "avg_sale_to_list_pct",
  "median_household_income",
  "population",
  "owner_occupied",
  "median_age",
  "poverty_rate",
  "employment_rate",
  "household_size",
  "moved_past_year",
];

function priorityIdx(key: string): number {
  const i = SIGNAL_PRIORITY.indexOf(key);
  return i === -1 ? SIGNAL_PRIORITY.length : i;
}

/**
 * Percentile (0–100, higher = larger value) + rank position (#1 = largest)
 * of `v` within `values`. Null when the distribution is empty.
 */
export function percentileOf(
  values: number[],
  v: number,
): { percentile: number; rankPos: number; rankOf: number } | null {
  const sorted = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0 || !Number.isFinite(v)) return null;
  let below = 0;
  while (below < n && sorted[below] < v) below++;
  const percentile = n === 1 ? 100 : Math.round((below / (n - 1)) * 100);
  let above = 0;
  for (const x of sorted) if (x > v) above++;
  return { percentile: Math.min(100, percentile), rankPos: above + 1, rankOf: n };
}

export function rankSignals(candidates: SignalCandidate[]): RankedSignal[] {
  const scored: RankedSignal[] = candidates
    .filter((c) => c.covered)
    .map((c) => {
      const extremity = c.percentile == null ? 0 : Math.abs(c.percentile - 50) / 50;
      const movement = c.movementPct == null ? 0 : Math.min(Math.abs(c.movementPct) / 20, 1);
      const extremityTerm = 0.6 * extremity;
      const movementTerm = 0.4 * movement;
      const rankWhy =
        c.rankPos != null && c.rankOf != null ? `#${c.rankPos} of ${c.rankOf} SWFL ZIPs` : "";
      const moveWhy = c.movementText ?? "";
      // The why-tag names the WINNING term; falls back to whichever exists.
      const why = movementTerm > extremityTerm ? moveWhy || rankWhy : rankWhy || moveWhy;
      return { ...c, score: extremityTerm + movementTerm, why };
    });
  scored.sort(
    (a, b) =>
      b.score - a.score || priorityIdx(a.key) - priorityIdx(b.key) || a.key.localeCompare(b.key),
  );
  return scored;
}
