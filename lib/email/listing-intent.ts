// lib/email/listing-intent.ts
//
// Decide whether an Email Lab prompt is "build me a flyer for THIS specific
// listing" vs the ordinary newsletter ask. True only when BOTH hold:
//   • a URL is present (a concrete page we can scrape for real facts), AND
//   • the wording points at a single listing (not the market in general).
// A market ask that merely carries the agent's brand URL must stay false, or we
// would wrongly replace a newsletter with a flyer. Pure, no model call.

import { extractUrls } from "./og-image";

const LISTING_SIGNAL =
  /\b(this (listing|property|home|house|place)|just (got|listed)|new listing|my (new )?listing|(feature|describe|showcase) (this|the|my|it)|just sold|open house)\b/i;

export function isListingIntent(prompt: string): boolean {
  if (!prompt) return false;
  if (extractUrls(prompt).length === 0) return false;
  return LISTING_SIGNAL.test(prompt);
}

// The NEW-LISTING announce recipe, detected AFTER its [[address]] blank is filled
// (so campaignKeyForPrompt's exact-prompt match no longer fits). Deliberately tight:
// only the "announce a new listing" wording, NOT coming-soon (holds the address
// back), open-house, price-reduced, or just-sold — those carry different framing and
// must not inherit the flyer's "New Listing" hero. Paired with a subject address in
// scope, this routes the build to the subject-listing flyer (build-doc authorDoc).
const NEW_LISTING_RECIPE = /\bnew[-\s]?listing\b|\bjust[-\s]listed\b|\bnewly listed\b/i;

export function isNewListingRecipePrompt(prompt: string): boolean {
  return !!prompt && NEW_LISTING_RECIPE.test(prompt);
}

// The subject address INSIDE a filled New-Listing prompt. The homepage hero has an
// address FIELD (→ scope.address), but the Email Lab's campaign button only seeds the
// recipe text — the address the user types over the [[blank]] then lives NOWHERE BUT
// THIS STRING. Without this, scope.address is undefined, the flyer lane in authorDoc
// never fires, and the free author improvises a generic ZIP grab-bag (median list
// price, "typical asking rent") with no photo, no price, no address. The recipe's shape
// is fixed — "…for my listing at <ADDRESS> — key specs, …" — so anchor on the "at" and
// stop at the em-dash that opens the requirements clause. A span with no house number
// is not an address; return null and let the caller fall through to the old behavior.
const SUBJECT_AT = /\b(?:listing|property|home|house)\s+at\s+(.+?)(?:\s*[—–]|\s+-\s+|$)/i;

// FALLBACK — a bare US street-address SHAPE (house number + up to 6 street words + a
// common suffix), independent of the connective word before it. SUBJECT_AT above only
// matches the machine seed's rigid "...at <addr> —" template; a naturally typed prompt
// ("for", "of", "regarding", or no connective at all — e.g. "New listing announcement
// for 14189 Mindello Dr, Fort Myers, FL 33905") matches none of it and used to fall
// through to null, silently dropping the address and sending the build to the generic
// ZIP-stats author instead of the real listing (postmortem 07/20/2026).
const STREET_SUFFIX =
  "(?:St|Street|Dr|Drive|Ave|Avenue|Rd|Road|Blvd|Boulevard|Ln|Lane|Ct|Court|Way|Cir|Circle|Pl|Place|Ter|Terrace|Pkwy|Parkway|Trl|Trail|Loop|Run|Path)";
const STREET_CORE = new RegExp(
  String.raw`\b\d{1,6}[A-Za-z]?\s+(?:[A-Za-z0-9'.]+\s+){0,5}${STREET_SUFFIX}\b\.?`,
  "i",
);
// After the street core, optionally keep reading through ", City[, FL][ ZIP]" — but
// stop at the first sentence end, dash, or a comma that opens an instruction clause,
// so a trailing ask ("...use the real photo") never gets folded into "the address".
const TAIL_STOP =
  /[.!?]|(?:\s+[—–]\s+|\s+-\s+)|,?\s*(?:use|please|with|and|showing|note|thanks)\b/i;

export function subjectAddressFromPrompt(prompt: string): string | null {
  const p = prompt || "";

  const atSpan = SUBJECT_AT.exec(p)?.[1]
    ?.trim()
    .replace(/[,\s]+$/, "");
  if (atSpan && /\d/.test(atSpan) && atSpan.length >= 6) return atSpan;

  const core = STREET_CORE.exec(p);
  if (!core) return null;
  const rest = p.slice(core.index + core[0].length);
  const stop = TAIL_STOP.exec(rest);
  const tail = stop ? rest.slice(0, stop.index) : rest.slice(0, 60);
  const full = (core[0] + tail).trim().replace(/[,\s]+$/, "");

  if (!/\d/.test(full) || full.length < 6) return null;
  return full;
}

// The LISTING DESCRIPTION — lane 2, the agent's own words.
//
// No vendor sells us this text: SteadyAPI's 18 real-estate endpoints carry beds, sqft,
// lot, price and flags but no MLS remarks (verified against their docs 07/13/2026), and
// realtor.com blocks the listing page. So the paragraph that says "direct Gulf access,
// no bridges, a 16,000-pound boat lift" can only come from the person who wrote it —
// the agent. Without it the narrator has nothing to describe and falls back to reciting
// the spec grid, which is the robot sentence the operator kept getting.
//
// The build box IS the input. The recipe seeds ONE instruction sentence; anything
// substantial the user pastes alongside it is their listing copy. Strip the instruction,
// and what's left — if it's a real block of prose — is the description.
const INSTRUCTION_LINE = /^\s*(build|write|create|make|draft)\b[^\n]*/i;

export function listingDescriptionFromPrompt(prompt: string): string | null {
  const rest = String(prompt ?? "")
    .replace(INSTRUCTION_LINE, "")
    .trim();
  // A stray clause isn't a description. Real listing copy is a paragraph: long, and
  // more than one sentence. Below that bar we'd rather have nothing than a fragment.
  if (rest.length < 150) return null;
  if ((rest.match(/[.!?]/g) ?? []).length < 2) return null;
  return rest;
}
