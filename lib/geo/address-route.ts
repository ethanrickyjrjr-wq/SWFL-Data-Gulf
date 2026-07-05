// lib/geo/address-route.ts — the address-leak routing shim (spec
// 2026-07-05-mobile-pill-address-leak-design.md). A BARE address typed into a
// public chat/search surface (map search, /ask, standalone pill) routes into
// the hero's campaign-build flow instead of the generic answer engine — which
// otherwise answers it with region-grain medians (the 07/05/2026 screenshot).
//
// Deliberately NOT shared with lib/assistant/comp-helper.ts: its ADDRESS_HINT
// is a permissive span-hint gated by comp/value keywords. Reusing it here would
// hijack real questions ("3 bedroom homes in 33904") into the lab. Questions
// ABOUT an address (worth/comps/flood…) still flow to the chat engine — only a
// bare address lookup is a listing signal.

import { HERO_CAMPAIGNS, heroDestination } from "@/lib/campaigns";
import type { AddressSuggestion } from "@/lib/geo/search-box";

/** Street-type token — the strongest "this is an address, not a question" signal. */
const STREET_SUFFIX =
  /\b(st|street|ave|avenue|blvd|boulevard|dr|drive|ln|lane|ct|court|rd|road|way|ter|terrace|pl|place|cir|circle|pkwy|parkway|trl|trail|loop|hwy|highway|bnd|bend|cv|cove|pt|point|run|pass|path|row|walk|xing|crossing)\b\.?/i;

/** Interrogative / analytical words — the input is a question, not a lookup. */
const QUESTION_WORD =
  /[?]|\b(what|what's|how|why|when|where|who|which|is|are|was|were|should|can|does|do|did|compare[ds]?|vs|versus|median|average|market|worth|value[ds]?|comps?|comparables?|cma|estimate[ds]?|apprais\w*|sell|sold|list|rent[s]?|rate[s]?|trend[s]?|forecast|history|risk)\b/i;

/** Query nouns that ride numbers without being addresses ("3 bedroom homes"). */
const QUERY_NOUN =
  /\b(bed|beds|bedroom[s]?|bath[s]?|bathroom[s]?|home[s]?|house[s]?|condo[s]?|listing[s]?|propert(y|ies)|acre[s]?|sq\.?\s?ft|sqft|communit(y|ies)|neighborhood[s]?|plus|best|top|new)\b/i;

/**
 * True when the text is, in shape, nothing but a street address: house number
 * first, short, no question words, and a street suffix (or a comma-carried
 * city / trailing ZIP). Conservative by design — a miss falls through to
 * today's behavior, a false positive would hijack a real question.
 */
export function isBareAddressQuery(text: string): boolean {
  const q = (text || "").trim();
  if (!q) return false;
  if (!/^\d{1,6}\s+\S/.test(q)) return false;
  if (q.split(/\s+/).length > 12) return false;
  if (QUESTION_WORD.test(q) || QUERY_NOUN.test(q)) return false;
  return STREET_SUFFIX.test(q) || q.includes(",") || /\b\d{5}\b\s*$/.test(q);
}

/**
 * Resolve a bare address to the SAME grid-lab URL the homepage hero builds:
 * /api/address-suggest → top suggestion → /api/address-retrieve → ZIP + scope
 * → heroDestination(new-listing). Every failure returns null so the caller
 * falls through to its existing route — empty-tolerant, no error states.
 */
export async function resolveAddressDestination(
  q: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const newListing = HERO_CAMPAIGNS.find((c) => c.key === "new-listing");
  if (!newListing) return null;
  try {
    const session = crypto.randomUUID();
    const sRes = await fetchImpl(
      `/api/address-suggest?q=${encodeURIComponent(q)}&session=${session}`,
    );
    if (!sRes.ok) return null;
    const sJson = (await sRes.json()) as { suggestions?: AddressSuggestion[] };
    const top = sJson.suggestions?.[0];
    if (!top) return null;
    const rRes = await fetchImpl(
      `/api/address-retrieve?id=${encodeURIComponent(top.mapboxId)}&session=${session}`,
    );
    if (rRes.ok) {
      const rJson = (await rRes.json()) as { name: string; zip: string | null };
      return heroDestination(newListing, { filled: rJson.name, zip: rJson.zip });
    }
    return heroDestination(newListing, {
      filled: `${top.name}${top.placeFormatted ? `, ${top.placeFormatted}` : ""}`,
      zip: null,
    });
  } catch {
    return null;
  }
}
