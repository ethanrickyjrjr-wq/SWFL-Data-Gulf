// lib/why-not-selling/checks/price-position.ts — check 4: where the home's asking price
// sits among the active listings in its ZIP, as a percentile. States the position as a
// fact; never a value judgment ("overpriced", "a deal") — the reader draws the conclusion.
import type { CheckFigure, CheckResult, PricePosition, SubjectHome } from "../types";

/** The percentile at/above which the asking price is flagged as sitting at the top of the
 *  ZIP's active market. A spec judgment value: the 80th percentile is "priced above four
 *  in five active listings", the point where price becomes a plausible reason a home sits. */
const PRICE_PCTILE_FLAG = 80;

/** The minimum number of active comparables behind a percentile before we will state it.
 *  A spec judgment value (kept above the shared MIN_ZIP_SAMPLE floor of 8): a percentile
 *  computed from fewer than ten listings is too thin to call a market position. Applies to
 *  BOTH the price percentile (gates the whole check) and the $/sqft percentile (gates only
 *  its own figure). */
const MIN_PCTILE_SAMPLE = 10;

/**
 * The price-position check.
 *
 * FLAG when the asking-price percentile is >= PRICE_PCTILE_FLAG on a real sample
 * (priceN >= MIN_PCTILE_SAMPLE). The $/sqft percentile is a SECOND, optional figure — it
 * renders only when its own sample clears MIN_PCTILE_SAMPLE AND the subject actually has a
 * sqft (a $/sqft position on a home with no sqft is meaningless). Both thresholds are
 * documented design values above.
 *
 * `unavailable` when there is no position at all, no computed price percentile, or the
 * price sample is under the floor — no honest percentile to state.
 */
export function pricePosition(
  subject: SubjectHome,
  pos: PricePosition | null,
  asOf: string,
): CheckResult {
  const base = { id: "price-position", title: "Asking price" };

  if (!pos || pos.pricePctile == null || pos.priceN < MIN_PCTILE_SAMPLE) {
    return { ...base, status: "unavailable", headline: null, detail: null, figures: [] };
  }

  const pricePctile = Math.round(pos.pricePctile);
  const figures: CheckFigure[] = [
    {
      label: `Asking price vs. active listings in ${subject.zip}`,
      value: `Above ${pricePctile}% of them`,
      source: "SWFL Data Gulf",
      asOf,
    },
  ];

  // The $/sqft percentile — a second figure only when its sample is real AND the subject
  // carries a sqft to make a per-sqft position meaningful.
  if (pos.ppsfPctile != null && pos.ppsfN >= MIN_PCTILE_SAMPLE && subject.sqft != null) {
    figures.push({
      label: `Price per sq ft vs. active listings in ${subject.zip}`,
      value: `Above ${Math.round(pos.ppsfPctile)}% of them`,
      source: "SWFL Data Gulf",
      asOf,
    });
  }

  const flagged = pos.pricePctile >= PRICE_PCTILE_FLAG;
  return {
    ...base,
    status: flagged ? "flag" : "clear",
    headline: flagged
      ? `This home is priced above ${pricePctile}% of active listings in ${subject.zip}.`
      : `This home is priced above ${pricePctile}% of active listings in ${subject.zip} — within the typical range.`,
    detail: null,
    figures,
  };
}
