// lib/email/place-from-prompt.ts
//
// Resolves a named SWFL place inside free text (an email-lab prompt: "...for Cape
// Coral") to its real ZIP scope — same sourced crosswalk lib/project/derive-name.ts
// reads for ProjectItem[] scope inference. Kept as its own small file rather than
// exporting a sibling function from derive-name.ts because that file was under an
// active edit claim from another session when this was written (07/06/2026) —
// reconcile into one root the next time derive-name.ts is free; do not let a third
// copy of this crosswalk-needle scan appear anywhere else.
import { PLACE_ZIP_CROSSWALK } from "@/refinery/lib/geography-gazetteer.mts";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NEEDLES: { needle: string; place: string; zips: string[] }[] = (() => {
  const out: { needle: string; place: string; zips: string[] }[] = [];
  for (const e of PLACE_ZIP_CROSSWALK.entries) {
    const zips = [e.zip, ...e.alt_zips];
    out.push({ needle: normalize(e.place), place: e.place, zips });
    for (const alias of e.aliases) {
      out.push({ needle: normalize(alias), place: e.place, zips });
    }
  }
  // Longest/most-specific needle first so "fort myers beach" wins over "fort myers".
  return out.sort((a, b) => b.needle.length - a.needle.length);
})();

/** Find the first (most specific) known SWFL place named in free text, whole-word
 *  matched (so "landscape" never matches "cape"). `zips` is EVERY ZIP the place
 *  spans (a multi-ZIP city like Cape Coral is six ZIPs, not one) — `zip` is the
 *  primary/reference ZIP only, kept for callers that need a single value (the
 *  master-dossier fetch, the chart scope). A caller pulling FIGURES for the place
 *  must use the full `zips` list — collapsing to `zip` alone silently drops most
 *  of the city (fixed 07/06/2026: the first cut of this file did exactly that).
 *  Never invents a ZIP; a place absent from the sourced crosswalk is undefined. */
/**
 * A place-name QUALIFIER. If one of these sits immediately before a matched needle, the
 * text is naming a DIFFERENT place than the needle — and one this crosswalk does not hold.
 *
 * "North Fort Myers" is not Fort Myers. It is a distinct, real community in Lee County
 * with its own ZIPs. But " fort myers " is a substring of " north fort myers ", so the
 * matcher below happily returned **Fort Myers** — and the recipe then built a confident,
 * beautifully-cited email about the WRONG CITY, on the ordinary Lab door. Verified live
 * on 07/13/2026: "I farm North Fort Myers" → Fort Myers · "East Naples"/"North Naples" →
 * Naples · "Bonita Beach" → Bonita Springs.
 *
 * That is worse than a missing figure. A gap is honest; a confidently wrong city is a lie
 * the agent will send to their own sphere under their own name.
 */
const QUALIFIER_BEFORE =
  /\b(north|south|east|west|northeast|northwest|southeast|southwest|upper|lower|old|new|greater|downtown|central)$/;

/** A place-noun AFTER a needle means the same thing: "Bonita Beach" is not "Bonita
 *  Springs", and "Fort Myers Shores" is not "Fort Myers". */
const SUFFIX_AFTER =
  /^(beach|shores?|island|isles?|park|gardens?|heights|estates?|village|acres|bay|point|springs|harbou?r)\b/;

/**
 * Find the first (most specific) known SWFL place named in free text — or REFUSE.
 *
 * A place we do not hold must resolve to NOTHING, so the caller leaves an open slot and
 * asks. It must never silently resolve to a NEIGHBOURING city. "I do not know this place"
 * is an answer; a wrong city is not.
 */
export function zipFromPromptPlace(
  text: string,
): { place: string; zip: string; zips: string[] } | undefined {
  const norm = normalize(text);
  const padded = ` ${norm} `;

  const known = new Set(NEEDLES.map((n) => n.needle));

  for (const n of NEEDLES) {
    if (!n.needle) continue;
    const at = padded.indexOf(` ${n.needle} `);
    if (at < 0) continue;

    // What sits either side of the match, in the ORIGINAL text?
    const before = padded.slice(0, at).trimEnd(); // words preceding the needle
    const after = padded.slice(at + n.needle.length + 2).trimStart(); // words following it

    // "north fort myers" — the needle is only PART of the place the text names. Unless the
    // FULL phrase is itself a needle we hold, we do not know this place.
    const qualifier = QUALIFIER_BEFORE.exec(before)?.[1];
    if (qualifier && !known.has(`${qualifier} ${n.needle}`)) return undefined;

    // "bonita beach" — same, on the other side.
    const suffix = SUFFIX_AFTER.exec(after)?.[1];
    if (suffix && !known.has(`${n.needle} ${suffix}`)) return undefined;

    // If the text also names an EXPLICIT ZIP that belongs to this place (e.g. "...Fort
    // Myers, FL 33905" — 33905 is one of Fort Myers's own alt_zips, not its primary
    // 33901), that explicit ZIP wins over the place's primary ZIP. Check EVERY 5-digit
    // span, not just the first — an address's house number (e.g. "14189") is also
    // 5 digits and would otherwise be mistaken for the ZIP; only a number that is
    // actually one of this place's known ZIPs qualifies. Otherwise every downstream
    // figure/chart scopes to the primary ZIP even though the user named a different,
    // equally valid one — two disagreeing ZIPs in one email (postmortem 07/20/2026).
    const explicitZip = (norm.match(/\b\d{5}\b/g) ?? []).find((z) => n.zips.includes(z));
    if (explicitZip) {
      return { place: n.place, zip: explicitZip, zips: [explicitZip] };
    }

    return { place: n.place, zip: n.zips[0], zips: n.zips };
  }
  return undefined;
}
