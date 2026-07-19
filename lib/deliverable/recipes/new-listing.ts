// lib/deliverable/recipes/new-listing.ts
//
// R1 · NEW LISTING — THE REFERENCE IMPLEMENTATION.
//
// This is the one deliverable that was made to actually work, end to end, from the
// address alone (07/13/2026). Every other listing recipe is this one wearing a
// different hat. Read it before you write yours; copy the SHAPE, not the framing.
//
// The six answers (playbook Part 6) — these are the ONLY things that differ
// between recipes:
//
//   1. SUBJECT — the listing address, from the field OR the prompt. The BUILDER
//      decides which, never the door. (Gating this on `scope.address` alone is what
//      sent every in-lab campaign build to the free author and produced the
//      photo-less ZIP grab-bag.) Already resolved for you by the dispatcher.
//   2. SKELETON — the coded flyer grid (`buildListingFlyer`).
//   3. CELLS — price · beds · baths · sqft · $/sqft · lot · type. Each renders only
//      if sourced; unsourced becomes an OPEN SLOT the user can fill, and is absent
//      from the sent email. Never a zero. ($/sqft is computed from price ÷ sqft —
//      both must parse, or the cell is an open slot.)
//   4. CHART — NONE. Operator ruling, 07/13/2026. This email is about a HOUSE, and
//      its visual IS the photo. An area index says nothing about the house; a comps
//      bar turns it into a comps email; price then-vs-now is two bars, which is a
//      fact wearing a chart costume. Write the fact.
//   5. PROSE — the agent's pasted description, tightened. No invented qualities, no
//      pitch. NO comps context: handing the narrator a comp set is what turned the
//      paragraph into a market analysis.
//   6. FRAMING — "New Listing" kicker, price + address hero, "View the Full Listing".
//
// LIVE PROOF (07/13/2026, 326 Shore Dr, Fort Myers 33905): $595,000 · 3 beds ·
// 3.5 baths · 2,847 sqft · $209/sqft · 0.26 ac · Residential, with the real photo.
// ⚠️ `465 Gordonia Road` (the Latitude 26 showcase house) is FICTIONAL and does not
// resolve. Never use the hand-written showcase HTML as an acceptance target.

import { buildListingFlyer } from "@/lib/email/listing-flyer";
import { daysSinceListed, resolveSubjectListDate } from "./under-contract";
import {
  authorListingNarrative,
  clearNarrativeSlots,
  dropEmptyChartSlot,
  fillNarrative,
} from "./shared";
import type { RecipeBuildContext } from "./index";
import type { EmailDoc } from "@/lib/email/doc/types";

export async function buildNewListing(ctx: RecipeBuildContext): Promise<EmailDoc | null> {
  const { facts, currentDoc } = ctx;
  // No subject → nothing to announce. Fall through to the generic author rather
  // than shipping an empty flyer (never refuse, but never fake a house either).
  if (!facts) return null;

  // DAYS ON MARKET — the real one. `today − the vendor's list_date`, resolved off the lat/lon
  // the dispatcher already has (`/nearby-home-values` → property_id → `/property-tax-history`,
  // both hour-cached). This home is ACTIVE, so its MLS clock is still running and the count IS
  // days on market — the "Days Since Listed" hedge belongs to under-contract, whose clock
  // stopped at a pending date we do not hold.
  //
  // Best-effort by contract: a vendor miss → null → the Type cell simply keeps its slot. The
  // build is NEVER blocked on it (RULE 0.7), and no number is ever invented to fill it.
  //
  // LAKE-FIRST (07/19/2026): a lake-resolved subject already carries the healed count
  // from our own per-listing DOM root (listing_dom) — use it and skip both vendor calls.
  const daysOnMarket =
    facts.daysOnMarket ?? daysSinceListed(await resolveSubjectListDate(facts), new Date());

  // The coded flyer grid. Brand (globalStyle, header, footer, agent card) is sticky
  // and lifted from whatever is on the canvas — we never author a brand.
  let doc = buildListingFlyer(facts, currentDoc, daysOnMarket);

  // NO CHART ON A NEW LISTING. The slot exists in the grid; drop it rather than
  // fill it with filler. An empty chart box is worse than no chart.
  doc = dropEmptyChartSlot(doc);

  // LANDMINE: buildListingFlyer prefills the commentary slot with the raw remarks,
  // and fillNarrative SKIPS a slot that already has content — so leaving it would
  // ship ~2,000 characters of raw MLS copy instead of authored prose. Clear, then
  // author. The remarks are the narrator's SOURCE, not the body.
  const narrative = await authorListingNarrative(facts, {
    framing: "A new listing announcement — the home has just come to market. Introduce it.",
  });
  if (narrative) doc = fillNarrative(clearNarrativeSlots(doc), narrative);

  return doc;
}
