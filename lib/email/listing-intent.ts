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
