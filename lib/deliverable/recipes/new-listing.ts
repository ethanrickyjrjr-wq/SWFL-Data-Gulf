// lib/deliverable/recipes/new-listing.ts
//
// R1 · NEW LISTING — THE REFERENCE IMPLEMENTATION.
//
// This is the one deliverable that was made to actually work, end to end, from the
// address alone (07/13/2026). Every other listing recipe is this one wearing a
// different hat. Read it before you write yours; copy the SHAPE, not the framing.
//
// THE FULL INGREDIENT LIST — every cell, every source, and what fills it when the first
// source misses — is `docs/standards/email-build-playbook.md` §2.1. Read that, not this
// header, when you need to know where a number came from.
//
// The six answers (playbook Part 6) — these are the ONLY things that differ
// between recipes:
//
//   1. SUBJECT — the listing address, from the field OR the prompt. The BUILDER
//      decides which, never the door. (Gating this on `scope.address` alone is what
//      sent every in-lab campaign build to the free author and produced the
//      photo-less ZIP grab-bag.) Already resolved for you by the dispatcher.
//   2. SKELETON — the coded flyer grid (`buildListingFlyer`).
//   3. CELLS — price · beds · baths · sqft · $/sqft · lot · DOM, then a second row of
//      year built · HOA · type. Each renders only if sourced; unsourced becomes an OPEN
//      SLOT the user can fill, and is absent from the sent email. Never a zero.
//   4. CHART — NONE. Operator ruling, 07/13/2026. This email is about a HOUSE, and
//      its visual IS the photo. An area index says nothing about the house; a comps
//      bar turns it into a comps email; price then-vs-now is two bars, which is a
//      fact wearing a chart costume. Write the fact.
//   5. PROSE — the listing's own description ships VERBATIM in its own block, and the
//      model writes ONE separate paragraph beside it. NO comps context: handing the
//      narrator a comp set is what turned the paragraph into a market analysis.
//   6. FRAMING — "New Listing" kicker, price + address hero, "View the Full Listing"
//      pointed at the real listing page — or NO BUTTON at all.
//
// LIVE PROOF (08/05/2026, 12554 Kellysands Way, Fort Myers 33908 — every lane exercised
// with zero new spend): $350,000 · 2 beds · 2 baths · 1,515 sqft · 0.22 ac · DOM 11 (real,
// not a floor) from our own listing clock · year built 1988 and HOA $1,326/mo and a
// 549-character description and a 43-photo gallery and the realtor.com link, all from the
// paid row already sitting on disk for that address.
// ⚠️ `465 Gordonia Road` (the Latitude 26 showcase house) is FICTIONAL and does not
// resolve. Never use the hand-written showcase HTML as an acceptance target.

import { buildListingFlyer, spec, shortType } from "@/lib/email/listing-flyer";
import { createBlock } from "@/lib/email/doc/default-docs";
import { daysSinceListed, resolveSubjectListDate } from "@/lib/listings/list-date";
import {
  authorListingNarrative,
  clearNarrativeSlots,
  dropEmptyChartSlot,
  fillNarrative,
} from "./shared";
import { newListingSubject } from "./subject-lines";
import type { RecipeBuildContext } from "./index";
import type { ListingFacts } from "@/lib/email/listing-scrape";
import type { EmailDoc, StatItem } from "@/lib/email/doc/types";
import type { ChromeBlock } from "@/lib/email/lifecycle-chrome";

/** A monthly HOA fee as a reader reads it. Only ever called with a `> 0` value — the
 *  `0` gate lives at the source (`paid-record-lane.ts servableHoaFee`), because a vendor
 *  `0` is indistinguishable from an unfilled field and "$0/mo" is a fabricated figure. */
function hoaCell(fee: number | undefined): string | undefined {
  return typeof fee === "number" && fee > 0
    ? `$${Math.round(fee).toLocaleString("en-US")}`
    : undefined;
}

/**
 * THE SECOND SPEC ROW — year built · HOA · property type.
 *
 * These three were being RESOLVED AND THROWN AWAY. The first strip holds six cells and
 * DOM already takes the last one from Type, so `year_built` (the paid row's, the only
 * source we hold anywhere — the free spine has no such column at all) and `hoa_fee`
 * (12 of 26 rows carry a servable one) reached `ListingFacts` and then rendered nowhere.
 *
 * Emitted ONLY when at least TWO of the three are sourced — three empty cells under a full
 * strip is a wall, and one lone survivor is a full-width 28px orphan (see below).
 * `4+4+4` is a blessed row shape (§1.2).
 */
export function secondSpecRow(
  facts: ListingFacts,
  /** Whether the FIRST strip gave its last slot to DOM. When it did, Type was displaced and
   *  belongs here; when it did not, Type is already on screen and must not print twice. */
  domTookTypeSlot: boolean,
): ChromeBlock[] {
  // ALL THREE AT THE SAME SIZE. The first cut marked Type `muted`, and the operator's
  // screenshot of this exact row (08/05/2026) is the argument against it: "1988" and "$1,326"
  // rendered large while "Single Family" rendered small, so a three-cell row read as two cells
  // and an afterthought. A row of peers is a row of peers.
  const cells: StatItem[] = [
    spec(facts.yearBuilt, "Built"),
    spec(hoaCell(facts.hoaFee), "HOA/mo"),
    spec(domTookTypeSlot ? shortType(facts.propertyType) || undefined : undefined, "Type"),
  ];
  // A ROW OF PEERS NEEDS PEERS (operator, 08/09/2026: "nor can house type or
  // whatever it is [sit] on its own line"). StatsBlock drops unsourced cells at
  // render, so a row emitted with ONE sourced cell ships as a single full-width
  // 28px orphan — the rendered new-listing capture showed a lone "Residential /
  // Type" band when Built + HOA both missed. Two sourced cells make a row; one
  // does not. Type alone is the cell the reader "will never use" (listingSpecs'
  // own words) and Built/HOA alone read no better, so a lone survivor is dropped,
  // never enthroned.
  if (cells.filter((c) => c.value.trim().length > 0).length < 2) return [];
  return [
    {
      block: { id: createBlock("stats").id, type: "stats", props: { stats: cells } },
      height: 3,
    },
  ];
}

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
  // Coverage counted live 08/05/2026: 31,825 of 34,904 listings carry a REAL count (91.2%);
  // the rest are first-seen floors and a floor is never printed as a fact.
  const daysOnMarket =
    facts.daysOnMarket ?? daysSinceListed(await resolveSubjectListDate(facts), new Date());

  // The coded flyer grid. Brand (globalStyle, header, footer, agent card) is sticky
  // and lifted from whatever is on the canvas — we never author a brand.
  //
  // The flyer now also reserves the listing's OWN DESCRIPTION as its own block (marked
  // `descriptionSlot`, which both narrative passes below skip) and points its single
  // button at the real listing page — or drops the button entirely when we hold no link.
  //
  // The second spec row carries `year_built` and the HOA fee — two facts we already hold and
  // were resolving into `ListingFacts` and then rendering NOWHERE, because the six-cell strip
  // is full and DOM already took Type's slot.
  const domTookTypeSlot = daysOnMarket != null && daysOnMarket >= 0;
  let doc = buildListingFlyer(
    facts,
    currentDoc,
    daysOnMarket,
    secondSpecRow(facts, domTookTypeSlot),
  );

  // THE SUBJECT LINE — deterministic, never model-authored (subject-lines.ts).
  doc = { ...doc, subjectVariants: [newListingSubject(facts.address)] };

  // NO CHART ON A NEW LISTING. The slot exists in the grid; drop it rather than
  // fill it with filler. An empty chart box is worse than no chart.
  doc = dropEmptyChartSlot(doc);

  // THE PARAGRAPH — the ONLY thing the model writes on this email, and it writes PROSE,
  // never a figure. It is handed the listing's description as its SOURCE plus the three
  // community layers (inside the gate · nearby businesses · the subdivision's size and
  // assessed value), each carrying its own prohibition so none can impersonate another.
  //
  // It gets NO COMPS. Handing the narrator a comp set is what once turned this paragraph
  // into a market analysis.
  //
  // `clearNarrativeSlots` blanks every text block EXCEPT the description slot, so the
  // seller's own words survive and the authored paragraph lands beside them rather than
  // on top of them. Before the description had its own marked slot, this pair of calls
  // silently destroyed it on every build.
  const narrative = await authorListingNarrative(facts, {
    framing: "A new listing announcement — the home has just come to market. Introduce it.",
  });
  if (narrative) doc = fillNarrative(clearNarrativeSlots(doc), narrative);

  return doc;
}
