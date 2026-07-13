// lib/deliverable/recipes/open-house.ts
//
// R6 · OPEN HOUSE — the invitation. The same resolved house as New Listing, wearing a
// different hat: this email is about a house and a MOMENT.
//
// ── IT IS THE SAME EMAIL AS THE OTHER SIX ────────────────────────────────────
//
// This recipe used to own its own grid (header · photo · hero(LEFT) · stats[2] · stats[3] ·
// text · cta · card · …) — one of SEVEN different layouts across a SEVEN-EMAIL CAMPAIGN. A
// subscriber walking Coming Soon → Open House → Sold got three emails that looked like three
// different companies. The layout now comes from ONE place, `buildLifecycleEmail`
// (lib/email/lifecycle-chrome.ts), and this file supplies only the four things a recipe is
// allowed to own: the RIBBON WORD, the numbers, its own middle, and the CTA.
//
//   header · RIBBON("Open House") · photo · hero(address over price) · spec strip
//          · [no middle] · narrative · agent card · CTA(RSVP) · footer
//
// The brand (globalStyle, header, agent card, footer) is lifted from the canvas untouched.
// The chrome is the SHAPE; the brand is the SKIN.
//
// ── THE MOMENT: the one fact no vendor sells us ──────────────────────────────
//
// This is still the cleanest test of THE OPEN-SLOT CONTRACT (playbook Part 4) in the whole
// fan-out, because the date and the time of an open house are in NO feed (all 18 SteadyAPI
// endpoints checked 07/13/2026). They are a lane-2/lane-4 fact: the AGENT supplies them.
//
// So they are never invented, never a placeholder date, never "TBD". They are the first two
// cells of the SPEC STRIP, with empty values:
//
//   Canvas  → two dashed "+ Add" cells reading OPEN HOUSE DATE / OPEN HOUSE TIME.
//   Email   → StatsBlock drops an empty cell (`emailRender`), so an un-dated invitation says
//             nothing at all about a date. No zero, no naked label.
//   Filled  → they render in the accent colour (`emphasis: "primary"`) at the top of the
//             strip, directly under the address — the two numbers that win this email.
//
// The labels are written to read as CAPTIONS once filled ("Open House Date"), never as
// canvas-only imperatives ("Add the date here") — because the moment the agent fills the
// cell, the label ships under the value to the recipient (lib/email/CLAUDE.md, THE SLOT RULE).
//
// The strip is the ONLY place in the document model where an unsourceable fact can be BOTH an
// instruction the agent sees AND nothing at all in the email: it is the one block type that
// carries a PER-CELL label and honors `emailRender`. The hero cannot — HeroBlock takes no
// `emailRender` flag and would ship its instruction label naked to a real recipient. That is
// why the moment lives one row BELOW the hero and not inside it.
//
// The six answers (playbook Part 6):
//   1. SUBJECT — the resolved house, handed to us by the dispatcher (ctx.facts). Never a
//      second resolver.
//   2. SKELETON — `buildLifecycleEmail`. The campaign chrome, not a grid of our own.
//   3. CELLS — date · time (open slots, primary) · beds · baths · sq ft. NOT $/sq ft, not lot,
//      not type: those are the price argument, and this email is an invitation. Each cell
//      renders only if sourced; unsourced is an open slot, never a zero.
//   4. CHART — NONE (declared on the key). A house and a moment are not a number. Two dates
//      is not a chart.
//   5. PROSE — the vendor record + the agent's pasted description (lane 2). Plus ONE extra
//      prohibition this recipe needs and no other does: the narrator may not name a day, a
//      date, or a time. It was not given one, so "this Saturday" would be an invented FACT
//      wearing the costume of a friendly sentence.
//   6. FRAMING — the "Open House" ribbon, the address over the price, one RSVP CTA. The CTA
//      asks for the NEXT ACTION (tell me you're coming), never points at what they are
//      already reading.

import { buildLifecycleEmail } from "@/lib/email/lifecycle-chrome";
import { addressLineOf, spec } from "@/lib/email/listing-flyer";
import {
  authorListingNarrative,
  clearNarrativeSlots,
  dropEmptyChartSlot,
  fillNarrative,
} from "./shared";
import type { RecipeBuildContext } from "./index";
import type { ListingFacts } from "@/lib/email/listing-scrape";
import type { EmailDoc, StatItem } from "@/lib/email/doc/types";

/** "2847" → "2,847". Nothing in → undefined (an open slot, never a fabricated 0). */
function withCommas(n?: string): string | undefined {
  const digits = (n ?? "").replace(/[^\d]/g, "");
  if (!digits) return undefined;
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * THE STRIP THIS EMAIL WEARS — the campaign's hairline row, with the MOMENT in front.
 *
 * The two cells that matter most here are the two we cannot source, so they lead and they
 * carry `emphasis: "primary"` (accent colour, larger). Beds/baths/sq ft follow as the campaign
 * strip's own reading order. `$/Sq Ft`, `Lot` and `Type` are deliberately absent: they are the
 * argument New Listing and Price Improved make, and an invitation does not argue price.
 */
export function openHouseSpecs(facts: ListingFacts): StatItem[] {
  return [
    // NO VENDOR HOLDS THESE. Empty = an open slot, and the LABEL is the instruction.
    spec(undefined, "Open House Date", "primary"),
    spec(undefined, "Open House Time", "primary"),
    spec(facts.beds, "Beds"),
    spec(facts.baths, "Baths"),
    spec(withCommas(facts.sqft), "Sq Ft"),
  ];
}

/** Where an RSVP goes. The agent's own CTA link (their brand, already on the canvas) when they
 *  have one; otherwise the listing's citation URL. Both are real. We never mint a destination. */
function rsvpUrl(current: EmailDoc, facts: ListingFacts): string | undefined {
  const card = current.blocks.find((b) => b.type === "agent-card");
  const cta = card?.type === "agent-card" ? card.props.ctaUrl?.trim() : "";
  return cta || facts.sourceUrl || undefined;
}

export async function buildOpenHouse(ctx: RecipeBuildContext): Promise<EmailDoc | null> {
  const { facts, currentDoc } = ctx;
  // No subject → there is no house to invite anyone to. Fall through to the generic author
  // rather than shipping an invitation to nowhere.
  if (!facts) return null;

  // THE CAMPAIGN CHROME. Same shape as New Listing, Coming Soon, Just Sold — different word,
  // different numbers, different CTA. That is the whole idea.
  let doc = buildLifecycleEmail(currentDoc, {
    ribbon: "Open House",
    photo: facts.photos[0]
      ? {
          url: facts.photos[0],
          alt: addressLineOf(facts) || "Featured property",
          linkUrl: facts.sourceUrl,
        }
      : null, // no photo → a canvas dropzone, absent from the email. Never a stock image.
    heroValue: facts.price ?? "",
    heroLabel: addressLineOf(facts),
    specs: openHouseSpecs(facts),
    // No footnote: this strip carries no DERIVED cell (that is $/Sq Ft's provenance line, and
    // $/Sq Ft is not on this email).
    narrative: "", // authored below, never prefilled — see the landmine note.
    ctaLabel: "RSVP for the Open House",
    ctaUrl: rsvpUrl(currentDoc, facts),
  });

  // NO CHART. Declared on the key: this deliverable is about a house and a moment. The chrome
  // emits no chart slot today, so this is a no-op — it is the policy stated in code, and it
  // guards a chart slot ever arriving from the chrome.
  doc = dropEmptyChartSlot(doc);

  // THE PROSE. Clear FIRST and UNCONDITIONALLY — `fillNarrative` SKIPS a text block that
  // already has content, so a null narrative (no key, a failed call, nothing real to say)
  // would otherwise leave whatever sat in the slot. A gap here stays an OPEN SLOT for the
  // agent, never a fabrication.
  doc = clearNarrativeSlots(doc);

  // WHICH SOURCES THE NARRATOR GETS (playbook Part 3, rule 4: hand it sources, forbid the
  // rest). Everything the record holds about the HOUSE — minus the price cut.
  //
  // The cut is a real vendor fact and it is NOT this email's story: it is R7's (price-reduced)
  // entire hat. Handed it, Sonnet reached for it every time and wrote itself into a price
  // argument — "the price now reflects where the market has settled on homes of this scale"
  // (live, 07/13/2026), a market claim we never gave it and cannot cite. Withholding it hides
  // nothing: the asking price is the hero. It is choosing which facts THIS email is about.
  const narratorFacts: ListingFacts = { ...facts };
  delete narratorFacts.isPriceReduced;
  delete narratorFacts.priceReduction;

  const narrative = await authorListingNarrative(narratorFacts, {
    framing:
      "An open-house INVITATION. The home is open for visitors and the reader is deciding " +
      "whether to come walk through it. Write the paragraph that makes them want to — " +
      "describe what they will actually SEE when they get there.\n" +
      "• YOU WERE NOT GIVEN A DATE, A TIME, OR A DAY. They are shown separately, above " +
      "your paragraph. Never write one, never imply one ('this weekend', 'Saturday', " +
      "'stop by Sunday'), and never place the open house at any particular time.\n" +
      "• DO NOT ARGUE THE PRICE. This is an invitation, not a price announcement, and it " +
      "is not a market analysis. Say nothing about what the market has done, what homes " +
      "like this are worth, or what the price reflects — you were given no market data.\n" +
      "• DO NOT RESTATE the square footage, the bed count, the bath count or the lot size. " +
      "They sit in the strip directly above your paragraph; repeating them wastes the only " +
      "sentences you get.\n" +
      "• Do not write the word RSVP — the button says it.",
  });
  if (narrative) doc = fillNarrative(doc, narrative);

  return doc;
}
