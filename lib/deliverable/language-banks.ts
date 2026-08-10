// lib/deliverable/language-banks.ts — the ONE recipe-key → sentence-bank registry.
// Banks import the engine (language.ts); builders import THIS. Never the reverse —
// the engine stays pure and recipes stay free of each other.
import type { SentenceBank } from "./language";
import type { RecipeKey } from "./recipes";
import { PRICE_REDUCED_BANK } from "./recipes/price-reduced.language";
import { JUST_SOLD_BANK } from "./recipes/just-sold.language";

// Keyed by RecipeKey (second-order audit 08/09/2026, finding 2.6): a plain string key
// meant a key rename or typo silently returned null — indistinguishable from the
// designed un-banked path. Now a stale key fails to compile.
const BANKS: Partial<Record<RecipeKey, SentenceBank>> = {
  "price-reduced": PRICE_REDUCED_BANK,
  "just-sold": JUST_SOLD_BANK,
};

/** Null for an un-banked recipe — its builder runs EXACTLY today's path (spec FM6:
 *  no bank, no behavior change). */
export function bankFor(recipe: RecipeKey): SentenceBank | null {
  return BANKS[recipe] ?? null;
}
