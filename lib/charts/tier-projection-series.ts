import type { ChartRow } from "@/types/viz";

export interface TierProjection {
  luxuryLatest: number;
  starterLatest: number;
  luxuryEnd: number;
  starterEnd: number;
  horizonMonths: number;
}

/** Least-squares slope of the values per index step (= per month). */
function trailingSlope(values: number[]): number {
  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/**
 * Deterministic linear extrapolation of each tier's index on its trailing
 * `window`-month least-squares trend, `horizonMonths` ahead. This is the
 * [INFERENCE] base math — the CALLER must render the tag, the audited base
 * values, and one falsifier in visible copy (rules of engagement rule 2).
 */
export function projectTierTrend(
  entries: ChartRow[],
  horizonMonths = 6,
  window = 12,
): TierProjection | null {
  const lux = entries
    .map((e) => e.luxury_index)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const star = entries
    .map((e) => e.starter_index)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (lux.length < window || star.length < window) return null;
  const luxWin = lux.slice(-window);
  const starWin = star.slice(-window);
  const luxuryLatest = luxWin[luxWin.length - 1];
  const starterLatest = starWin[starWin.length - 1];
  return {
    luxuryLatest,
    starterLatest,
    luxuryEnd: luxuryLatest + trailingSlope(luxWin) * horizonMonths,
    starterEnd: starterLatest + trailingSlope(starWin) * horizonMonths,
    horizonMonths,
  };
}
