// lib/deliverable/language-banks.ts — the ONE recipe-key → sentence-bank registry.
// Banks import the engine (language.ts); builders import THIS. Never the reverse —
// the engine stays pure and recipes stay free of each other.
import type { SentenceBank } from "./language";
import { PRICE_REDUCED_BANK } from "./recipes/price-reduced.language";

const BANKS: Record<string, SentenceBank> = {
  "price-reduced": PRICE_REDUCED_BANK,
};

/** Null for an un-banked recipe — its builder runs EXACTLY today's path (spec FM6:
 *  no bank, no behavior change). */
export function bankFor(recipe: string): SentenceBank | null {
  return BANKS[recipe] ?? null;
}
