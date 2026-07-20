// lib/deliverable/campaign-sim/events.ts
//
// The campaign simulator's event journal → ListingFacts reducer. Pure: no I/O, no
// clock, no randomness. Given the subject's REAL resolved facts and the stage the
// campaign has reached, return the facts as they would stand at that moment.
//
// WHY THIS IS THE ONLY LOGIC WORTH TESTING IN THE SIM: everything else the sim does
// is a call into already-tested product code (resolve → authorDoc → render → send).
// This function is the one place the sim can be WRONG IN SILENCE — and the way it
// would be wrong is documented, specific, and has already shipped once elsewhere.
//
// ── THE DIRECTION TRAP (price-reduced.ts, probed live 07/13/2026) ────────────────
//
//   `ListingFacts.priceReduction` is the SIZE OF THE CUT. It is NOT the old price.
//   The recipe derives:  previous = current + cut
//
//   Put the previous price in that field and the email renders "Price cut $683,000"
//   above a $635,000 ask — a reduction TO a number ABOVE the asking price, in 48px
//   accent type, about a real address. events.test.ts names this case.
//
// The reducer NEVER invents and never coerces: a listing with no price takes no cut
// (not a $0 ask), and a cut that would drive the price to zero or below is refused
// outright rather than rendered as a negative.

import type { ListingFacts } from "@/lib/email/listing-scrape";

/** A simulated event in the listing's life. `fromStage` is the 0-based stage index
 *  at which the event is IN FORCE, and it stays in force for every later stage —
 *  a price cut does not un-happen on the next email. */
export type CampaignEvent =
  | { kind: "price-cut"; fromStage: number; cutUsd: number }
  | { kind: "sold"; fromStage: number; closeUsd: number; closedOn: string };

/** A recorded sale of the subject — the shape just-sold.ts's close lane expects. */
export interface CampaignClose {
  price: number;
  /** ISO date of the recorded sale. Rendered MM/DD/YYYY downstream, never raw. */
  date: string;
}

/** Digits of a money string → a positive number, else null. Mirrors the same guard
 *  price-reduced.ts uses: anything that isn't a positive finite number is a MISS,
 *  and a miss leaves the cell an open slot rather than becoming a zero. */
function money(s?: string): number | null {
  const n = Number((s ?? "").replace(/[^\d.]/g, ""));
  return n > 0 && Number.isFinite(n) ? n : null;
}

function usd(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

/**
 * The subject's facts as they stand at `stageIndex`. Returns a NEW object; the
 * caller's facts are never mutated (the sim resolves the real listing once and
 * replays it through every stage, so a mutation would leak stage 5's cut backwards
 * onto stage 2's teaser — spec failure mode #11).
 */
export function applyEventsToFacts(
  facts: ListingFacts,
  events: readonly CampaignEvent[],
  stageIndex: number,
): ListingFacts {
  const cut = events
    .filter((e): e is Extract<CampaignEvent, { kind: "price-cut" }> => e.kind === "price-cut")
    .filter((e) => stageIndex >= e.fromStage)
    // Latest cut in force wins — the journal is a timeline, not a set.
    .sort((a, b) => a.fromStage - b.fromStage)
    .at(-1);
  if (!cut) return { ...facts };

  const current = money(facts.price);
  // No sourced price → no cut. Never a $0 ask, never a fabricated anchor.
  if (current === null || cut.cutUsd <= 0) return { ...facts };
  const reduced = current - cut.cutUsd;
  // A cut that would zero or invert the price is refused outright.
  if (reduced <= 0) return { ...facts };

  return {
    ...facts,
    price: usd(reduced),
    // THE CUT SIZE. Not the previous price. See this file's header.
    priceReduction: usd(cut.cutUsd),
    isPriceReduced: true,
  };
}

/**
 * The recorded close in force at `stageIndex`, or null. Null is the honest and
 * COMMON answer — county recording lags weeks behind a closing, so just-sold.ts
 * treats an unsourced close as an open slot the agent fills.
 */
export function closeInForce(
  events: readonly CampaignEvent[],
  stageIndex: number,
): CampaignClose | null {
  const sold = events
    .filter((e): e is Extract<CampaignEvent, { kind: "sold" }> => e.kind === "sold")
    .filter((e) => stageIndex >= e.fromStage)
    .sort((a, b) => a.fromStage - b.fromStage)
    .at(-1);
  if (!sold || sold.closeUsd <= 0) return null;
  return { price: sold.closeUsd, date: sold.closedOn };
}
