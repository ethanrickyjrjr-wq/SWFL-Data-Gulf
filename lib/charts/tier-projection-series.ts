import type { ChartRow } from "@/types/viz";
import { fitLine, type FitPoint } from "./fit-line";

export interface TierProjection {
  luxuryLatest: number;
  starterLatest: number;
  luxuryEnd: number;
  starterEnd: number;
  horizonMonths: number;
}

/**
 * The window is monthly and ordered, with no gaps — synthesize its month stamps.
 * Synthesized rather than read off `ChartRow.month` deliberately: the stamps only
 * have to space the window correctly, and building them here means a row with a
 * missing/unparseable month can never quietly become `new Date(null)` = 1970-01-01,
 * which `fitLine` cannot detect and which would silently wreck the fit.
 */
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
 *
 * Null when either tier cannot honestly be fit: fewer than `window` readings, or
 * a window with no variance at all (a perfectly flat series has no line to read).
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
