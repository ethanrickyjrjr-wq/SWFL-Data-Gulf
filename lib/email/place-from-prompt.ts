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
export function zipFromPromptPlace(
  text: string,
): { place: string; zip: string; zips: string[] } | undefined {
  const padded = ` ${normalize(text)} `;
  const hit = NEEDLES.find((n) => n.needle && padded.includes(` ${n.needle} `));
  return hit ? { place: hit.place, zip: hit.zips[0], zips: hit.zips } : undefined;
}
