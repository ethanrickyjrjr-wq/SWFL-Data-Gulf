// lib/should-i-sell/soh-portability.ts
//
// Save-Our-Homes portability math — PURE statute arithmetic, no I/O, no invention.
// Every constant and formula is verbatim from the cited primary source (fetched
// in-session 07/19/2026; evidence in the design spec):
//   • s. 193.155, Florida Statutes — annual cap (1); transfer formulas (8)(a)/(8)(b).
//   • Florida DOR PT-112 (R. 08/24) — 3-year window from Jan 1 of the abandonment
//     year; DR-501T filed with DR-501 by March 1.
// Projection method mirrors spread-calc.ts (linear proration) so the two
// projections on the page agree in method; assessed growth uses the 3% CEILING
// case (the statute caps at the lesser of 3% or CPI) and says so in the basis.

/** s. 193.155(8)(a)/(b) F.S. — maximum transferable assessment difference. */
export const SOH_PORT_CAP = 500_000;
/** s. 193.155(1) F.S. — annual assessed growth cap: lesser of 3% or CPI. 3% = ceiling case. */
export const SOH_ANNUAL_CAP_FRACTION = 0.03;
/** PT-112: establish the new homestead within 3 years of Jan 1 of the abandonment year. */
export const PORT_WINDOW_YEARS = 3;

export const SOH_SOURCES = {
  statute: {
    label: "s. 193.155, Florida Statutes",
    url: "http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0100-0199/0193/Sections/0193.155.html",
  },
  dorGuide: {
    label: "Florida DOR, Save Our Homes guide PT-112",
    url: "https://floridarevenue.com/property/Documents/pt112.pdf",
  },
} as const;

export const SOH_PROJECTION_TAG = "[INFERENCE]";
export const SOH_PROJECTION_BASIS =
  "Based on this area's median sale price change over the past year (Redfin Data Center, via SWFL Data Gulf), with your assessed value grown at the 3% statutory ceiling (the cap is the lesser of 3% or CPI).";
export const SOH_PROJECTION_FALSIFIER =
  "This assumes the past year's price trend continues; a market shift — or a CPI reading under 3% — would change it.";

/** The SOH benefit: homestead just value minus homestead assessed value, floored at 0. */
export function sohBenefit(jvHmstd: number, avHmstd: number): number {
  return Math.max(0, jvHmstd - avHmstd);
}

/** What can port in the buy-equal-or-up case: the benefit, capped at $500,000. */
export function portableAmount(benefit: number): number {
  return Math.min(SOH_PORT_CAP, Math.max(0, benefit));
}

export interface NextHomePort {
  newAssessed: number;
  portedReduction: number;
  downsized: boolean;
}

/**
 * s. 193.155(8) transfer, both branches:
 *   (a) next ≥ oldJv:  assessed = next − min($500k, oldJv − oldAv)
 *   (b) next < oldJv:  assessed = (next ÷ oldJv) × oldAv; if next − assessed > $500k,
 *       assessed is raised so the difference equals exactly $500k.
 */
export function portForNextHome(args: {
  oldJv: number;
  oldAv: number;
  nextHomePrice: number;
}): NextHomePort | null {
  const { oldJv, oldAv, nextHomePrice } = args;
  if (oldJv <= 0 || oldAv <= 0 || nextHomePrice <= 0) return null;
  if (nextHomePrice >= oldJv) {
    const portedReduction = portableAmount(sohBenefit(oldJv, oldAv));
    return { newAssessed: nextHomePrice - portedReduction, portedReduction, downsized: false };
  }
  let newAssessed = (nextHomePrice / oldJv) * oldAv;
  if (nextHomePrice - newAssessed > SOH_PORT_CAP) newAssessed = nextHomePrice - SOH_PORT_CAP;
  return { newAssessed, portedReduction: nextHomePrice - newAssessed, downsized: true };
}

export interface SohProjection {
  projectedJv: number;
  projectedAv: number;
  projectedBenefit: number;
  projectedPortable: number;
  excessOverCap: number;
}

/** Project the gap forward: just value at the area trend, assessed at the 3% ceiling,
 *  assessed clamped to just (s. 193.155(2)). Linear proration, like spread-calc. */
export function projectSoh(args: {
  jv: number;
  av: number;
  yoyFraction: number;
  months: 6 | 12;
}): SohProjection {
  const frac = args.months / 12;
  const projectedJv = args.jv * (1 + args.yoyFraction * frac);
  const projectedAv = Math.min(projectedJv, args.av * (1 + SOH_ANNUAL_CAP_FRACTION * frac));
  const projectedBenefit = Math.max(0, projectedJv - projectedAv);
  return {
    projectedJv,
    projectedAv,
    projectedBenefit,
    projectedPortable: Math.min(SOH_PORT_CAP, projectedBenefit),
    excessOverCap: Math.max(0, projectedBenefit - SOH_PORT_CAP),
  };
}
