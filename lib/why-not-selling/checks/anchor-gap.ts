// lib/why-not-selling/checks/anchor-gap.ts — check 5: the report's centerpiece. What the
// owner paid (county parcel record) vs. what the current ASK implies, set beside how the
// ZIP's typical home value actually moved over the same span.
//
// It states three numbers and restates them in ONE sentence — it draws NO conclusion beyond
// them ("the ask implies +Z% since MM/YYYY; typical here moved +Y%"). The reader decides
// whether the gap is justified; the check never says "overpriced" or "a stretch".
//
// ZHVI is a TYPICAL home value, never a median (binding repo rule) — the ZHVI figure's source
// string is exactly "Zillow ZHVI (typical home value)".
//
// FLAG is a documented judgment value: the implied gain outruns the ZIP's typical move by at
// least ANCHOR_GAP_FLAG_PTS percentage points — the point where the ask leans on appreciation
// the wider market did not deliver. Computed from the RAW percentages (not the rounded
// display) so a value sitting on the threshold flags on its true magnitude.
import type { CheckFigure, CheckResult, ParcelFact, SubjectHome, ZhviChange } from "../types";

/** Percentage-point gap between the implied gain and the ZIP's typical move at/above which
 *  the anchor is flagged. Judgment value (spec §checks). */
const ANCHOR_GAP_FLAG_PTS = 10;

/** ZHVI source string — "typical home value", NEVER "median". A binding label rule. */
const ZHVI_SOURCE = "Zillow ZHVI (typical home value)";

const pad2 = (n: number): string => String(n).padStart(2, "0");
const usd = (n: number): string => `$${Math.round(n).toLocaleString("en-US")}`;
const signedPct = (n: number): string => `${n >= 0 ? "+" : ""}${Math.round(n)}%`;

export function anchorGap(
  subject: SubjectHome,
  parcel: ParcelFact | null,
  zhvi: ZhviChange | null,
): CheckResult {
  const base = { id: "anchor-gap", title: "What the owner paid vs. what the ask implies" };

  // Missing any leg — the parcel anchor, the ZHVI comparator, or the ask — leaves no honest
  // number to state (the Marco-condo miss class lands here via a null parcel).
  if (!parcel || !zhvi || subject.listPrice == null) {
    return { ...base, status: "unavailable", headline: null, detail: null, figures: [] };
  }

  const impliedPct = ((subject.listPrice - parcel.salePrice) / parcel.salePrice) * 100;
  const zhviPct = zhvi.pctChange;
  const purchaseMdy = `${pad2(parcel.saleMonth)}/${parcel.saleYear}`;
  const parcelSource =
    parcel.county === "Lee" ? "Lee County property records" : "Collier County property records";

  const figures: CheckFigure[] = [
    {
      label: "What the owner paid",
      value: `${purchaseMdy} for ${usd(parcel.salePrice)}`,
      source: parcelSource,
      asOf: zhvi.asOf,
    },
    {
      label: `Typical home value in ${subject.zip} since then`,
      value: signedPct(zhviPct),
      source: ZHVI_SOURCE,
      asOf: zhvi.asOf,
    },
    {
      label: "What the current ask implies",
      value: signedPct(impliedPct),
      source: "SWFL Data Gulf",
      asOf: zhvi.asOf,
    },
  ];

  const flagged = impliedPct - zhviPct >= ANCHOR_GAP_FLAG_PTS;
  return {
    ...base,
    status: flagged ? "flag" : "clear",
    // Restates the numbers only — no conclusion clause beyond them.
    headline: `The ask implies ${signedPct(impliedPct)} since ${purchaseMdy}; typical here moved ${signedPct(zhviPct)}.`,
    detail: null,
    figures,
  };
}
