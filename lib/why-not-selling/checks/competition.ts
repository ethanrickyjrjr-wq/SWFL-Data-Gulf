// lib/why-not-selling/checks/competition.ts — check 6: how crowded is the field this home
// competes in? Two independent legs, each honest on its own:
//   list-side (ours) — the ZIP's active book and how much of it is long-sitting, from
//     zip_active_stale_share. The 90+/180+ counts are over EXACT-DOM rows only (the SQL
//     filters floored rows), so the ratio's denominator is exactCount, never activeCount.
//   sold-side (labeled) — months of supply / sold DOM / sale-to-list off the published
//     housing read. Sold-side figures SAY they are sold-side ("of SOLD homes") so the
//     list-side and sold-side numbers never blur (T-rule: the two DOMs never interchange).
// Either leg can be absent; the check renders what it honestly has, and is unavailable
// only when BOTH are missing.
import { MIN_ZIP_SAMPLE } from "../types";
import type { CheckFigure, CheckResult, StaleShare } from "../types";
import type { MarketSnapshot } from "../../should-i-sell/load-market-snapshot";

/** Share of the exact-DOM book sitting 90+ days at/above which competition flags.
 *  Judgment value (spec §checks): at 40% the field the home sits in is measurably stuck. */
const STALE_SHARE_FLAG = 0.4;

/** Months of supply at/above which the sold-side alone flags. Judgment value: 9 months is
 *  deep buyer's-market territory by the industry's own 6-month-balance convention. */
const MONTHS_SUPPLY_FLAG = 9;

export function competition(
  stale: StaleShare | null,
  snapshot: MarketSnapshot | null,
  zip: string,
): CheckResult {
  const base = { id: "competition", title: "Competition" };
  const housing = snapshot?.housing ?? null;
  if (!stale && !housing) {
    return { ...base, status: "unavailable", headline: null, detail: null, figures: [] };
  }

  const figures: CheckFigure[] = [];
  if (stale) {
    figures.push({
      label: `Active listings in ${zip}`,
      value: `${stale.activeCount}`,
      source: "SWFL Data Gulf",
      asOf: stale.asOf,
    });
    if (stale.exactCount > 0) {
      figures.push({
        label: "Sitting 90+ days",
        value: `${stale.over90} of the ${stale.exactCount} with exact day counts`,
        source: "SWFL Data Gulf",
        asOf: stale.asOf,
      });
      figures.push({
        label: "Sitting 180+ days",
        value: `${stale.over180} of the ${stale.exactCount} with exact day counts`,
        source: "SWFL Data Gulf",
        asOf: stale.asOf,
      });
    }
  }
  if (housing) {
    const src = housing.source.label;
    const asOf = housing.source.asOf;
    if (housing.monthsOfSupply != null) {
      figures.push({
        label: "Months of supply (sold-side pace)",
        value: `${housing.monthsOfSupply} months`,
        source: src,
        asOf,
      });
    }
    if (housing.medianDom != null) {
      figures.push({
        label: "Typical days on market of SOLD homes",
        value: `${Math.round(housing.medianDom)} days`,
        source: src,
        asOf,
      });
    }
    if (housing.saleToListPct != null) {
      figures.push({
        label: "Sale-to-list price of SOLD homes",
        value: `${housing.saleToListPct}%`,
        source: src,
        asOf,
      });
    }
  }

  // The stale-share leg can only speak when its denominator clears the shared floor —
  // 4 of 5 exact rows is an artifact, not a market read.
  const staleRatioFlag =
    stale != null &&
    stale.exactCount >= MIN_ZIP_SAMPLE &&
    stale.over90 / stale.exactCount >= STALE_SHARE_FLAG;
  const supplyFlag =
    housing?.monthsOfSupply != null && housing.monthsOfSupply >= MONTHS_SUPPLY_FLAG;

  const headline = staleRatioFlag
    ? `${stale!.over90} of the ${stale!.exactCount} active listings with exact day counts in ${zip} have sat 90 days or more.`
    : supplyFlag
      ? `At the recent sales pace, ${zip} is carrying ${housing!.monthsOfSupply} months of homes for sale.`
      : stale
        ? `${stale.activeCount} active listings in ${zip} — the field looks typical.`
        : `Sold-side context for ${zip}.`;

  return {
    ...base,
    status: staleRatioFlag || supplyFlag ? "flag" : "clear",
    headline,
    detail: null,
    figures,
  };
}
