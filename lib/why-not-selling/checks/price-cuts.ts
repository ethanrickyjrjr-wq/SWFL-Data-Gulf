// lib/why-not-selling/checks/price-cuts.ts — check 3: has the asking price moved, and how
// does this home's cut behavior sit against the ZIP? States cuts as EVENTS ONLY — the
// date and the amount — never a reason. The price-reduced.ts prohibition binds this file:
// never "motivated", never a softening market, never "why it moved". WHY a price changed
// is in no record we hold, so it is never spoken.
import { asOfFromIso } from "../../project/as-of";
import type { CheckFigure, CheckResult, CutEvent, SubjectHome } from "../types";

/** "$15,000" — thousands-separated, no cents. The house-standard money render. */
function usd(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

/**
 * The price-cuts check.
 *
 * FLAG — the ONE design value here — fires only when the home is BOTH speed-flagged (it
 * has sat well past its ZIP/band typical, per checks/market-speed.ts) AND has zero cuts on
 * record: it has been sitting and the price has never moved. Zero cuts alone is not a flag
 * (a home fresh to market has zero cuts and that is normal); a cut on record is never a
 * flag (a moved price is a fact stated plainly, never a problem this check raises).
 *
 * Everything else is `clear`: the cut events are stated plainly (amount + date), one
 * figure each, with the ZIP cut-share figure appended when provided. No subject list price
 * → `unavailable`: without the home's current price there is no honest footing to talk
 * about its price behavior.
 */
export function priceCuts(
  subject: SubjectHome,
  cuts: CutEvent[],
  zipCutShare: { pct: number; source: string; asOf: string } | null,
  speedFlagged: boolean,
): CheckResult {
  const base = { id: "price-cuts", title: "Price changes" };

  // Missing the subject's current price → the check has no honest footing.
  if (subject.listPrice == null) {
    return { ...base, status: "unavailable", headline: null, detail: null, figures: [] };
  }

  // The ZIP cut-share figure — the share of active listings in this ZIP that have cut
  // their price. Carries its OWN source/as-of (it is an aggregate handed in, not a
  // per-home number). Appended to whichever state we return, whenever provided.
  const shareFigure: CheckFigure | null = zipCutShare
    ? {
        label: `Active listings in ${subject.zip} with a price cut`,
        value: `${Math.round(zipCutShare.pct)}%`,
        source: zipCutShare.source,
        asOf: zipCutShare.asOf,
      }
    : null;

  // FLAG: sat long AND the price has never moved. Two facts, no reason.
  if (speedFlagged && cuts.length === 0) {
    return {
      ...base,
      status: "flag",
      headline: "Long on the market, and the price has not moved.",
      detail: null,
      figures: shareFigure ? [shareFigure] : [],
    };
  }

  // CLEAR: state each cut as an event — amount and date, nothing more.
  const cutFigures: CheckFigure[] = cuts.map((c) => {
    const mdy = asOfFromIso(c.at) ?? c.at;
    return {
      label: "Price reduced",
      value: `${usd(Math.abs(c.delta))} on ${mdy}`,
      source: "SWFL Data Gulf",
      asOf: mdy,
    };
  });
  const figures = shareFigure ? [...cutFigures, shareFigure] : cutFigures;

  const headline =
    cuts.length === 0
      ? "No price reductions on record."
      : cuts.length === 1
        ? "One price reduction on record."
        : `${cuts.length} price reductions on record.`;

  return { ...base, status: "clear", headline, detail: null, figures };
}
