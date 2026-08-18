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
//          · [middle: the moment's own CARD] · narrative · [tail: the home's own description]
//          · agent card · CTA(RSVP) · footer
//
// The brand (globalStyle, header, agent card, footer) is lifted from the canvas untouched.
// The chrome is the SHAPE; the brand is the SKIN.
//
// ── THE MOMENT: the one fact no vendor sells us ──────────────────────────────
//
// This is still the cleanest test of THE OPEN-SLOT CONTRACT (playbook Part 4) in the whole
// fan-out, because the date and the time of an open house are in NO feed (all 18 SteadyAPI
// endpoints checked 07/13/2026). They are a lane-2/lane-4 fact: the AGENT supplies them
// (`ListingFacts.openHouseDate`/`openHouseTime`) — never parsed, never guessed.
//
// CHANGED 08/06/2026 — operator, reading the first render: the date and time were folded
// into the six-cell spec strip as two small "+ Add" cells, no more visually weighted than
// Beds or Baths. Moved to their own `signal` callout (`dateTimeCard`, below) — kicker "Open
// House", title the date, body the time — riding in `middle`, directly under the strip and
// ahead of the narrative, because it is the single fact this whole email exists to deliver.
//
//   Canvas  → the block canvas's own dashed "+ Add" affordance for an empty `signal` block.
//   Email   → `null` (neither date nor time held) means NO entry in `middle` at all — never
//             an empty callout box, the T6 lesson (an empty chart box is worse than no
//             chart) applied to a card instead of a chart.
//   Filled  → the FIRST block after the spec strip, ahead of the narrative and the
//             description — the two things this email is actually about, read first.
//
// The six answers (playbook Part 6):
//   1. SUBJECT — the resolved house, handed to us by the dispatcher (ctx.facts). Never a
//      second resolver.
//   2. SKELETON — `buildLifecycleEmail`. The campaign chrome, not a grid of our own.
//   3. CELLS — beds · baths · sq ft · $/sq ft. NOT lot, not type: neither is a fact a
//      visitor decides on standing in the driveway. Date/time moved OUT of the strip into
//      their own card (see above). Each cell renders only if sourced; unsourced is an open
//      slot, never a zero.
//   4. CHART — NONE (declared on the key). A house and a moment are not a number. Two dates
//      is not a chart.
//   5. PROSE — TWO separate blocks, in THIS order (operator ask 08/06/2026: talk about the
//      open house, then the property): the narrator's short invitation FIRST, then the
//      seller's own MLS description verbatim SECOND, via `tail` — never touched by the
//      model, never blended into the narrative (`lib/email/listing-description-block.ts`).
//      The narrator MAY state the real date/time when we hold one — handed in as anchors,
//      so it can say "join us Saturday from 1 to 3" the way a real invite does — but may
//      NEVER invent one when we don't, and may never invent a time-of-day/lighting detail
//      ("evening light") we were never told either way.
//   6. FRAMING — the "Open House" ribbon, the address over the price, one RSVP CTA. The CTA
//      asks for the NEXT ACTION (tell me you're coming), never points at what they are
//      already reading.

import { withCommas } from "@/lib/format-number";
import { buildLifecycleEmail, type ChromeBlock } from "@/lib/email/lifecycle-chrome";
import { createBlock } from "@/lib/email/doc/default-docs";
import { addressLineOf, pricePerSqft, spec } from "@/lib/email/listing-flyer";
import { buildDescriptionBlock } from "@/lib/email/listing-description-block";
import {
  authorListingNarrative,
  clearNarrativeSlots,
  dropEmptyChartSlot,
  fillNarrative,
} from "./shared";
import type { RecipeBuildContext } from "./index";
import type { ListingFacts } from "@/lib/email/listing-scrape";
import type { EmailDoc, StatItem } from "@/lib/email/doc/types";

/**
 * THE STRIP THIS EMAIL WEARS — beds/baths/sq ft/$-per-sq-ft, the campaign strip's own
 * reading order. `Lot` and `Type` stay absent: neither is a fact a visitor decides on
 * standing in the driveway. `$/Sq Ft` shipped 08/06/2026 (operator, reading a render:
 * "where is $ sq.ft in the fucking information") — a plain, non-emphasized cell
 * (`pricePerSqft`, `lib/email/listing-flyer.ts`), same computation every sibling email
 * uses, no derivation footnote (both operands sit in this same strip — CLAUDE.md's rule).
 *
 * DATE AND TIME USED TO LIVE HERE AS TWO OPEN-SLOT CELLS (through 08/06/2026) and were
 * moved OUT to their own callout (`dateTimeCard`, below) — operator, reading a real render:
 * the two facts the whole email is FOR were buried as two small cells in a six-cell hairline
 * strip, no more visually weighted than beds or baths. A moment is not a spec.
 */
export function openHouseSpecs(facts: ListingFacts): StatItem[] {
  return [
    spec(facts.beds, "Beds"),
    spec(facts.baths, "Baths"),
    spec(withCommas(facts.sqft), "Sq Ft"),
    spec(pricePerSqft(facts.price, facts.sqft), "$/Sq Ft"),
    // DOM shipped 08/06/2026 (operator: "DOM too!!!!"), same real per-listing clock every
    // sibling email uses (`facts.daysOnMarket` — our own listing_dom root, never floored,
    // never invented). A plain fact cell, same as beds/baths — the narrator is separately
    // forbidden from turning this NUMBER into leverage-coaching prose (see the narrator
    // call below); showing it here is not that.
    spec(
      facts.daysOnMarket != null && facts.daysOnMarket >= 0
        ? String(facts.daysOnMarket)
        : undefined,
      "DOM",
    ),
  ];
}

/**
 * THE MOMENT'S OWN CARD — a `signal` callout (kicker + title + body), the one block type in
 * the doc model built for exactly this: a highlighted panel, not a table cell. Sits in the
 * chrome's `middle` slot, directly under the spec strip — the first thing a reader sees after
 * the price, because it is the reason this email exists.
 *
 * NEITHER FIELD IS SOURCED FROM ANY VENDOR (see `ListingFacts.openHouseDate`/`openHouseTime`).
 * `null` when BOTH are empty — never a card with an empty title, which is a visible box with
 * nothing in it, the T6 lesson applied to a callout instead of a chart. A card with only ONE
 * of the two still renders: "Time" or "Date" alone is a real, honest partial fact, and the
 * canvas's own "+ Add" cells work the same way (an unfilled cell drops, a filled one ships).
 */
export function dateTimeCard(facts: ListingFacts): ChromeBlock | null {
  const date = facts.openHouseDate?.trim();
  const time = facts.openHouseTime?.trim();
  if (!date && !time) return null;
  return {
    block: {
      id: createBlock("signal").id,
      type: "signal",
      props: {
        kicker: "Open House",
        ...(date ? { title: date } : {}),
        ...(time ? { body: time } : {}),
      },
    },
    height: 3,
  };
}

/** Where an RSVP goes. The agent's own CTA link (their brand, already on the canvas) when they
 *  have one; otherwise the listing's citation URL. Both are real. We never mint a destination. */
function rsvpUrl(current: EmailDoc, facts: ListingFacts): string | undefined {
  const card = current.blocks.find((b) => b.type === "agent-card");
  const cta = card?.type === "agent-card" ? card.props.ctaUrl?.trim() : "";
  return cta || facts.sourceUrl || undefined;
}

/** THE SUBJECT LINE — "open" style (playbook §1.10): 30-40 chars, clarity over cleverness,
 *  never a promised open rate. Street + the real date when we hold one (crawled real invite
 *  subjects lead with both — theclose.com/maestrolabs.com, 08/06/2026); street alone, then
 *  city, then a bare fallback when even that is missing (RULE 0.7 — never refuse a subject
 *  for a miss). Never "this Sunday" or any date we were not actually given. */
export function openHouseSubject(facts: ListingFacts, date?: string): string {
  const street =
    String(facts.address ?? "")
      .split(",")[0]
      ?.trim() ?? "";
  const d = date?.trim();
  if (street) return d ? `Open House: ${street}, ${d}` : `Open House: ${street}`;
  const city = facts.city?.trim();
  if (city) return d ? `Open House in ${city}, ${d}` : `Open House in ${city}`;
  return "You're Invited to an Open House";
}

export async function buildOpenHouse(ctx: RecipeBuildContext): Promise<EmailDoc | null> {
  const { facts, currentDoc } = ctx;
  // No subject → there is no house to invite anyone to. Fall through to the generic author
  // rather than shipping an invitation to nowhere.
  if (!facts) return null;

  // THE MOMENT'S CARD rides in `middle` — directly under the spec strip, ahead of the
  // narrative. `null` (neither date nor time held) means no entry at all, never an empty box.
  const card = dateTimeCard(facts);

  // THE PROPERTY'S OWN DESCRIPTION, verbatim, via `tail` rather than the chrome's built-in
  // `description` slot (which Under Contract uses and which lands BEFORE the narrative,
  // position 5b). Operator ask, reading a real render: an invitation should TALK about the
  // open house first, then let the seller's own words follow — not open with a wall of MLS
  // copy before the reader has been asked to come. `tail` rides right after the narrative
  // text block (both are "body"-zone, so document order is push order — see
  // `lifecycle-chrome.ts`), which is exactly that sequence: narrative, then description.
  // `buildDescriptionBlock` returns null on no/empty remarks — no block, not an empty panel.
  const description = buildDescriptionBlock(facts.remarks, facts.sourceUrl);

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
    // No footnote on the $/Sq Ft cell — both operands (price, sq ft) sit in this same strip,
    // and CLAUDE.md's rule is a footnote only when the reader can't check the arithmetic.
    middle: card ? [card] : [],
    narrative: "", // authored below, never prefilled — see the landmine note.
    tail: description ? [{ block: description, height: 5 }] : [],
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
  //
  // DAYS ON MARKET AND HOA STAY VISIBLE TO THE MODEL (operator, 08/06/2026: "why would the
  // model not see HOA????" — right call). DOM is also a cell on the page (the strip,
  // above); the HOA fee is model-visible ONLY — a reader-facing cost cell is banned on
  // every buyer-facing email (operator decree 08/18/2026, lib/deliverable/cell-policy.ts).
  // The bug was never that the model COULD see these numbers — it was the
  // DEFAULT system prompt (built for a for-sale PITCH, not an invitation) instructing it to
  // MINE them for leverage: handed both, it wrote *"this home came to market roughly two
  // months ago, which gives a buyer walking through today real room to have a conversation
  // about terms... the $1,229 monthly HOA is worth factoring into carrying costs before the
  // visit."* Operator: *"We are talking about an invitation to a fucking open house... What
  // the fuck are you doing?"* The fix is `invitation: true` below, which swaps that entire
  // instruction for one that explicitly forbids market/terms/cost framing — not blinding the
  // model to real, already-shown facts.
  const narratorFacts: ListingFacts = { ...facts };
  delete narratorFacts.isPriceReduced;
  delete narratorFacts.priceReduction;

  // THE DATE/TIME, HANDED TO THE NARRATOR AS ANCHORS when we hold them — operator, 08/06/2026:
  // "Write about the fucking time!!!!!!" Real crawled invite scripts state it directly in the
  // sentence ("our open house this Sunday from 1 to 4 PM") — withholding it entirely, which
  // this recipe did through the first several rounds today, was overcorrecting against a
  // DIFFERENT bug (the narrator inventing "evening light" it was never told). Anchoring the
  // real values lets it state them verbatim without opening the door to inventing one when
  // they are absent — `auditClaims` (the claim gate) only permits numerals/words that appear
  // in an anchor line, same mechanism `pricePerSqft` already relies on above.
  const dateAnchor = facts.openHouseDate?.trim();
  const timeAnchor = facts.openHouseTime?.trim();

  const narrative = await authorListingNarrative(narratorFacts, {
    invitation: true,
    // Open House ships its description via `tail`, not the chrome's built-in slot — but the
    // shared narrator's preamble still needs to know whether it exists at all, or it defaults
    // to assuming one is on the page and a reader who got a build with no remarks would see
    // the narrator refer to a block that was never rendered.
    descriptionRendered: Boolean(description),
    anchors: [
      dateAnchor && `Open house date: ${dateAnchor}`,
      timeAnchor && `Open house time: ${timeAnchor}`,
    ].filter((x): x is string => Boolean(x)),
    framing:
      "An open-house INVITATION. The home is open for visitors and the reader is deciding " +
      "whether to come walk through it. Write the short invite that makes them want to.\n" +
      (dateAnchor || timeAnchor
        ? "• STATE THE DATE AND/OR TIME NATURALLY IN YOUR SENTENCE, exactly as given in the " +
          "anchors above (e.g. 'join us Saturday from 1 to 3' if that is what was given) — " +
          "never reformat, reinterpret, or add a detail ('this weekend', a season, a length " +
          "of visit) beyond what the anchor states. It is also shown in its own card, so a " +
          "little redundancy here is fine and matches how real invite emails are written.\n"
        : "• YOU WERE NOT GIVEN A DATE OR A TIME. Never write one, never imply one ('this " +
          "weekend', 'Saturday', 'stop by Sunday'), never place the open house at any " +
          "particular hour.\n") +
      "• DO NOT ARGUE THE PRICE, THE MARKET, OR THE TERMS. This is an invitation, not a " +
      "price announcement and not a negotiating brief. Even though the days-on-market " +
      "figure below is real and an HOA fee may sit in your sources, do not turn them into " +
      "leverage or cost analysis — no 'room to talk', no 'worth factoring into carrying " +
      "costs', no reading of what the market has done or what homes like this are worth.\n" +
      "• DO NOT RESTATE the square footage, the bed count, the bath count, the price per " +
      "square foot, or the days on market. They sit in the strip directly above your " +
      "paragraph; repeating them wastes the only sentences you get.\n" +
      "• Do not write the word RSVP — the button says it.",
  });
  if (narrative) doc = fillNarrative(doc, narrative);

  // THE SUBJECT LINE — street + the real date when held, never a date we were not given.
  doc = { ...doc, subjectVariants: [openHouseSubject(facts, dateAnchor)] };

  return doc;
}
