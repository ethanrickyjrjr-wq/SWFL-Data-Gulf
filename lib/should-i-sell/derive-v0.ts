// lib/should-i-sell/derive-v0.ts
//
// V0 (the home's CURRENT value) for the sell-now-vs-wait spread.
//
// The comp helper (lib/assistant/comp-helper.ts) returns NEARBY COMPS, not a subject
// valuation — its own buildCompsChartSpec notes "the geocoded comp-helper subject has
// no price to anchor it." So V0 is DERIVED here (the median of the priced nearby comps)
// and ALWAYS labeled an estimate — never asserted as "your home is worth $X". It is
// user-overridable, mirroring the tax/insurance inputs. This is the single most
// invention-prone number in the read, so it is stated as an estimate with its basis.
import type { CompResult } from "@/lib/assistant/comp-helper";

export interface V0Estimate {
  /** The estimate — median of priced nearby comps. Never presented as an appraisal. */
  value: number;
  /** How many priced comps the median rests on (surfaced so the reader sees the basis). */
  basisCount: number;
  /** The comp call date, MM/DD/YYYY (from the comp helper). */
  asOf: string;
}

/**
 * Median of the priced nearby comps → an ESTIMATE of the subject's value. Returns null
 * when fewer than 2 priced comps came back (too thin to state an estimate — the section
 * then asks the user for their own number rather than inventing one). Pure.
 */
export function deriveV0FromComps(result: CompResult): V0Estimate | null {
  const prices = result.comps
    .map((c) => c.price)
    .filter((p): p is number => typeof p === "number" && Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);
  if (prices.length < 2) return null;
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];
  return { value: Math.round(median), basisCount: prices.length, asOf: result.asOf };
}
