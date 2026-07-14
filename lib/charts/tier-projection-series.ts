import type { ChartRow } from "@/types/viz";
import { fitLine, type FitPoint } from "./fit-line";

export interface TierProjection {
  luxuryLatest: number;
  starterLatest: number;
  luxuryEnd: number;
  starterEnd: number;
  horizonMonths: number;
  /**
   * The luxury slope's 95% interval EXCLUDES ZERO — its direction may be read.
   * IF FALSE, THE ENDPOINT MAY NOT BE DRAWN. `luxuryEnd` is still computed (the
   * math has an answer); the CALLER decides whether that answer may be shown.
   */
  luxuryEstablished: boolean;
  /** Same gate, starter tier. See `luxuryEstablished`. */
  starterEstablished: boolean;
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

/**
 * Project a tier `horizonMonths` past the window's end, ON THE FITTED LINE — and
 * report whether that line's direction may be read at all.
 *
 * ONE `fitLine` call. The endpoint and the flag MUST come from the same fit over
 * the same points: a second fit over a different slice (say the full history rather
 * than the window) would answer a different question and could bless an endpoint
 * the window never established.
 */
function project(
  values: number[],
  horizonMonths: number,
): { end: number; established: boolean } | null {
  const fit = fitLine(toPoints(values));
  if (!fit) return null;
  // The fitted line at (last month + horizon). NOT `lastObserved + slope*horizon` —
  // that was trailingSlope's bug: one noisy final print dragged the whole projection.
  const endMonth = values.length - 1 + horizonMonths;
  return { end: fit.at(new Date(Date.UTC(2000, endMonth, 1))), established: fit.established };
}

/**
 * Deterministic linear extrapolation of each tier's index on its trailing
 * `window`-month least-squares trend. This is the [INFERENCE] base math — the
 * CALLER must render the tag, the audited base values, and one falsifier in
 * visible copy (rules of engagement rule 2). TierProjectionChart already does.
 *
 * Null when either tier cannot honestly be fit: fewer than `window` readings, or
 * a window with no variance at all (a perfectly flat series has no line to read).
 *
 * NOT null when a tier's direction is merely UNREADABLE — that is a different
 * finding, and it is reported, not swallowed. `*Established: false` means "we
 * fitted it and the direction cannot be read"; null means "we could not fit it".
 * Collapsing the two would hand the caller a silence it cannot tell apart from a
 * missing series. Every field stays computed; the caller gates the render.
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
  const luxFit = project(luxWin, horizonMonths);
  const starFit = project(starWin, horizonMonths);
  if (luxFit === null || starFit === null) return null;

  return {
    luxuryLatest: luxWin[luxWin.length - 1],
    starterLatest: starWin[starWin.length - 1],
    luxuryEnd: luxFit.end,
    starterEnd: starFit.end,
    horizonMonths,
    luxuryEstablished: luxFit.established,
    starterEstablished: starFit.established,
  };
}
