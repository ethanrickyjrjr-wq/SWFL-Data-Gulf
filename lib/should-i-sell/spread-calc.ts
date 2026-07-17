// lib/should-i-sell/spread-calc.ts
//
// The sell-now-vs-wait dollar spread — the ONE new compute in the Should I Sell
// read, and the one place a wrong default becomes a financial claim on someone's
// largest asset. PURE function: fixed inputs → fixed outputs, no I/O, fully tested.
//
// Every input is sourced, live-fetched-and-cited, or required from the user — this
// module NEVER invents a number:
//   • v0                     — current value (an estimate derived from nearby comps,
//                              or the user's own override). The caller owns V0; it is
//                              never asserted here as "your home is worth $X".
//   • yoyFraction            — this area's own trailing median-sale-price YoY, as a
//                              DECIMAL fraction (e.g. 0.098 for +9.8%). LOAD-BEARING:
//                              the housing brain stores this as a PERCENT (9.8); the
//                              caller divides by 100 before passing it here. Passing
//                              the raw 9.8 would multiply V0 ~6x — a silent catastrophe.
//   • propertyTaxAnnual      — a named/cited live county figure, or the user's real
//                              bill; null when neither is available (never guessed).
//   • insuranceAnnual        — REQUIRED user-entered, NO DEFAULT EVER. null → the
//                              spread is flagged incomplete with an explicit prompt,
//                              never a silent zero.
//   • mortgageInterestAnnual — optional; null → exactly $0, stated plainly.
//
// The projection is [INFERENCE]-tagged (data-protocol rule 7): it cites the YoY base
// by name and carries a falsifier. YoY is frequently NEGATIVE in the live data, so the
// "projected change" is often a projected LOSS — the spread goes negative honestly
// (waiting can cost you); we never floor it at zero.

export type Horizon = 6 | 12;

export interface SpreadInputs {
  /** Current value — an estimate (derived from comps) or the user's override. */
  v0: number;
  /** This area's trailing median-sale-price YoY as a DECIMAL fraction (pct ÷ 100). */
  yoyFraction: number;
  /** Holding horizon in months (user-selectable). */
  months: Horizon;
  /** Annual property tax — cited county figure or user's real bill; null = unavailable. */
  propertyTaxAnnual: number | null;
  /** Annual insurance premium — REQUIRED user-entered; null = omit + prompt (never $0). */
  insuranceAnnual: number | null;
  /** Annual mortgage interest — optional; null → $0, stated. */
  mortgageInterestAnnual: number | null;
}

/** The inference tag every projected figure carries (data-protocol rule 7). */
export const PROJECTION_TAG = "[INFERENCE]";

/** The falsifier stated alongside the projection — never a guarantee. */
export const PROJECTION_FALSIFIER =
  "This assumes the past year's price trend continues; a shift in the market would change it.";

/** The audited base the projection cites, by name. */
export const PROJECTION_BASIS =
  "Based on this area's median sale price change over the past year (Redfin Data Center, via SWFL Data Gulf).";

export type SpreadLineKey = "projected_change" | "property_tax" | "insurance" | "mortgage_interest";

export interface SpreadLine {
  key: SpreadLineKey;
  label: string;
  /** Dollar amount for the holding period; null ONLY when a cost is not included. */
  amount: number | null;
  /** Whether this line is counted in the net. Insurance/tax excluded when unavailable. */
  included: boolean;
  /** Plain note when a line is excluded or defaulted (insurance/tax/mortgage). */
  note?: string;
}

export interface SpreadResult {
  months: Horizon;
  v0: number;
  vFuture: number;
  /** V_future − V0. Can be NEGATIVE (a projected loss) — never floored. */
  projectedChange: number;
  projectionTag: string;
  projectionBasis: string;
  falsifier: string;
  lines: SpreadLine[];
  /** Sum of INCLUDED costs only (insurance excluded when not entered — never a $0 stand-in). */
  carryingCostTotal: number;
  insuranceIncluded: boolean;
  mortgageIncluded: boolean;
  /** projectedChange − carryingCostTotal. When insurance is missing this is a "before
   *  insurance" figure — the renderer must label it so (see `complete`). */
  net: number;
  /** True only when insurance was entered — i.e. the spread is a complete answer. */
  complete: boolean;
}

/**
 * Compute the sell-now-vs-wait spread. Pure — no I/O, no clock, no invention.
 * Every cost is prorated to the holding horizon (annual × months/12).
 */
export function computeSpread(input: SpreadInputs): SpreadResult {
  const { v0, yoyFraction, months } = input;
  const frac = months / 12;

  const vFuture = v0 * (1 + yoyFraction * frac);
  const projectedChange = vFuture - v0; // == v0 * yoyFraction * frac; negative when YoY < 0

  const prorate = (annual: number | null): number | null => (annual == null ? null : annual * frac);

  const taxCost = prorate(input.propertyTaxAnnual); // null = no county figure & no override
  const insuranceCost = prorate(input.insuranceAnnual); // null = not entered (flag, never $0)
  const mortgageIncluded = input.mortgageInterestAnnual != null;
  const mortgageCost = mortgageIncluded ? (input.mortgageInterestAnnual as number) * frac : 0;

  const lines: SpreadLine[] = [
    {
      key: "projected_change",
      label: `Projected value change over ${months} months`,
      amount: projectedChange,
      included: true,
    },
    {
      key: "property_tax",
      label: `Property tax while you hold (${months} mo)`,
      amount: taxCost,
      included: taxCost != null,
      ...(taxCost == null
        ? { note: "county tax not available — add your real bill to include it" }
        : {}),
    },
    {
      key: "insurance",
      label: `Insurance while you hold (${months} mo)`,
      amount: insuranceCost,
      included: insuranceCost != null,
      ...(insuranceCost == null
        ? { note: "insurance not included — add your premium to complete this" }
        : {}),
    },
    {
      key: "mortgage_interest",
      label: `Mortgage interest while you hold (${months} mo)`,
      amount: mortgageCost,
      included: true,
      ...(mortgageIncluded ? {} : { note: "no mortgage entered — counted as $0" }),
    },
  ];

  // Carrying cost = sum of INCLUDED costs. Insurance is left OUT when not entered
  // (an explicit gap, never a silent zero); tax is left out when no figure exists.
  const carryingCostTotal = (taxCost ?? 0) + (insuranceCost ?? 0) + mortgageCost;
  const net = projectedChange - carryingCostTotal;

  return {
    months,
    v0,
    vFuture,
    projectedChange,
    projectionTag: PROJECTION_TAG,
    projectionBasis: PROJECTION_BASIS,
    falsifier: PROJECTION_FALSIFIER,
    lines,
    carryingCostTotal,
    insuranceIncluded: insuranceCost != null,
    mortgageIncluded,
    net,
    complete: insuranceCost != null,
  };
}
