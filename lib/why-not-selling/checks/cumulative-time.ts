// lib/why-not-selling/checks/cumulative-time.ts — check 2: does the home's current
// on-market spell hide a much longer CUMULATIVE history across relists? The current
// spell is the counter realtor.com shows (it resets on relist); the cumulative rides
// along only when it changes the story. ALL day-on-market wording comes from formatDom.
import { formatDom } from "../../listings/dom";
import { asOfFromIso } from "../../project/as-of";
import type { CheckResult, SubjectHome } from "../types";

/** The story-changing gap, in days, between cumulative and current-spell DOM that trips
 *  the flag — a spec judgment value, kept identical to the 14-day threshold formatDom
 *  itself uses to decide a relist is worth telling, so the headline and the flag agree. */
const CUMULATIVE_GAP_FLAG = 14;

export function cumulativeTime(
  subject: SubjectHome,
  relist: { date: string; daysOffMarket: number } | null,
): CheckResult {
  const base = { id: "cumulative-time", title: "Time on market" };
  const { domDays, cdomDays, domIsFloor } = subject;
  // As-of provenance for the DOM figures = the listing's own record/anchor date, the one
  // real, sourced date this per-home read carries. We deliberately do NOT reconstruct a
  // "today" read-date as listedDate + domDays: dom_days is a stored listing_dom column of
  // independent derivation (lib/buyer-leverage/dom-read.ts), so that sum would be a
  // back-solved value, not a sourced one — presenting it as provenance breaks the
  // no-invention rule. (Sibling market-speed stamps the same subject-DOM figure with an
  // injected aggregate's currency; cumulative-time has no aggregate, so it cites the
  // listing's own date.) A missing/garbage listedDate leaves no real as-of to cite → the
  // check is unavailable rather than shipping a figure without honest provenance.
  const asOf = asOfFromIso(subject.listedDate);
  // Headline current-spell phrase carries the relist context (cdomDays passed) so the
  // combined story rides along, exactly as formatDom decides it is worth telling.
  const headlinePhrase = formatDom({ domDays, isFloor: domIsFloor, cdomDays });
  // The current-spell FIGURE is the clean current number only (cdom withheld): the
  // cumulative is its own separate figure below, so embedding it here would double-count.
  const spellPhrase = formatDom({ domDays, isFloor: domIsFloor });
  if (cdomDays == null || domDays == null || !headlinePhrase || !spellPhrase || !asOf) {
    return { ...base, status: "unavailable", headline: null, detail: null, figures: [] };
  }

  const flagged = cdomDays - domDays >= CUMULATIVE_GAP_FLAG;

  const figures = [
    { label: "This listing", value: spellPhrase, source: "SWFL Data Gulf", asOf },
    { label: "Total across relistings", value: `${cdomDays} days`, source: "SWFL Data Gulf", asOf },
  ];
  if (relist) {
    figures.push({
      label: "Returned to market",
      value: relist.date,
      source: "SWFL Data Gulf",
      asOf: relist.date,
    });
  }

  const headline = relist
    ? `${headlinePhrase} — returned to market ${relist.date} after ${relist.daysOffMarket} days off.`
    : `${headlinePhrase}.`;

  return { ...base, status: flagged ? "flag" : "clear", headline, detail: null, figures };
}
