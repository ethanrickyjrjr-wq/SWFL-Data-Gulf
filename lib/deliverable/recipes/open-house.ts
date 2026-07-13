// lib/deliverable/recipes/open-house.ts
//
// R6 · OPEN HOUSE — the invitation. The same resolved house as New Listing, wearing
// a different hat: this email is about a house and a MOMENT.
//
// It is also the cleanest test of THE OPEN-SLOT CONTRACT (playbook Part 4) in the
// whole fan-out, because the moment is the one fact NO vendor sells us.
//
// The six answers (playbook Part 6):
//
//   1. SUBJECT — the listing address, from the field OR the prompt. Already resolved
//      for us by the dispatcher (ctx.facts). We never write a second resolver.
//   2. SKELETON — the committed `open-house` grid in SEED_DOCS (default-docs.ts). It
//      already existed and no button offered it: this recipe was an ORPHAN skeleton.
//      We load it, so the seed card and the build are the same deliverable.
//      ONE structural addition, made HERE and reported for the seed: a 2-cell "moment"
//      stats row above the specs (see THE MOMENT below). Everything else — the
//      palette, the block order, the kicker, the stat labels — is the seed's.
//   3. CELLS — photo · date · time · price · beds/baths · sqft. Each renders only if
//      sourced. The DATE and the TIME cannot be sourced (below), so they are OPEN
//      SLOTS: an invitation to the agent on the canvas, ABSENT from the sent email.
//      Never a zero, never a placeholder date.
//   4. CHART — NONE (declared on the key). A house and a moment are not a number.
//      Two dates is not a chart. dropEmptyChartSlot enforces it.
//   5. PROSE — the vendor record + the agent's pasted description (lane 2). And ONE
//      extra prohibition this recipe needs and no other does: the narrator may not
//      name a day, a date, or a time. It was not given one, so writing "this Saturday"
//      would be an invented FACT wearing the costume of a friendly sentence.
//   6. FRAMING — "You're Invited · Open House" kicker, address hero, one RSVP CTA.
//
// ── THE MOMENT: why the date/time live in a STATS row and not in the hero ─────
//
// The seed's hero was authored to carry them (`value: ""`, `label: "Date, time, and
// address"`). It cannot, and this is a code fact, not a taste call:
//
//   HeroBlock takes NO `emailRender` flag. It renders every truthy field on the
//   sendable path. So an unfilled hero value with that instruction label ships a
//   NAKED LABEL — the exact thing the contract forbids — to a real recipient.
//
// Three block types honor the contract today (BlockRenderer.tsx): `stats`, `text`,
// `image`. Of those, only `stats` carries a PER-CELL label — and the label is the
// instruction (lib/email/CLAUDE.md, THE SLOT RULE). So `stats` is the only place in
// the document model where an unsourceable fact can be BOTH an instruction the agent
// sees on the canvas AND nothing at all in the email. That makes it the answer.
//
// The labels are written to read as CAPTIONS once filled ("Open House Date"), never
// as canvas-only imperatives ("Add the date here") — because the moment the agent
// fills the cell, the label ships under the value to the recipient.
//
// TRADEOFF, named rather than fought: "date and time up front" is here satisfied one
// row BELOW the hero, not inside it. That is as far up as the open-slot contract
// allows until HeroBlock honors `emailRender` (reported).

import { seedById, createBlock, DEFAULT_GLOBAL_STYLE } from "@/lib/email/doc/default-docs";
import {
  authorListingNarrative,
  clearNarrativeSlots,
  dropEmptyChartSlot,
  fillNarrative,
} from "./shared";
import type { RecipeBuildContext } from "./index";
import type { ListingFacts } from "@/lib/email/listing-scrape";
import type { BlockLayout, EmailBlock, EmailDoc, StatItem } from "@/lib/email/doc/types";

/** The committed grid this recipe fills. Declared on the key (recipes.ts); the
 *  constant is only the fallback if the registry entry is ever unassigned. */
const SEED_ID = "open-house";

/** Reuse the current canvas doc's block of a type — the agent's brand (header, agent
 *  card, CAN-SPAM footer) is STICKY and we never author one. Falls back to the
 *  skeleton's own block. */
function stick(current: EmailDoc, seed: EmailDoc, type: EmailBlock["type"]): EmailBlock {
  return (
    current.blocks.find((b) => b.type === type) ??
    seed.blocks.find((b) => b.type === type) ??
    createBlock(type)
  );
}

/** The seed's own block of a type (palette, kicker, labels — the skeleton's authority). */
function seedBlockOf(seed: EmailDoc, type: EmailBlock["type"]): EmailBlock | undefined {
  return seed.blocks.find((b) => b.type === type);
}

/** Position a block on the 12-col grid. Same helper shape as buildListingFlyer's. */
function at<T extends EmailBlock>(block: T, layout: BlockLayout): T {
  return { ...block, layout };
}

/** "2847" → "2,847". Undefined in → undefined (an open slot, never a fabricated 0). */
function withCommas(n?: string): string | undefined {
  const digits = (n ?? "").replace(/[^\d]/g, "");
  if (!digits) return undefined;
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** A stat cell. An unsourced value stays EMPTY — on the canvas that is an editable
 *  open slot whose LABEL is the instruction; on the sendable paths StatsBlock drops
 *  the cell, and drops the whole row when none survive. Never a zero. */
function cell(value: string | undefined, label: string): StatItem {
  return { value: value && value.trim() ? value.trim().slice(0, 24) : "", label };
}

/**
 * Beds and baths share one cell, so the LABEL must describe what actually landed in
 * it. "3" under a "Beds / Baths" label reads as a bath count to a skimming buyer —
 * that is a lie told by a label, and it is the same class of failure as a naked one.
 */
function bedsBathsCell(facts: ListingFacts): StatItem {
  const beds = (facts.beds ?? "").trim();
  const baths = (facts.baths ?? "").trim();
  if (beds && baths) return { value: `${beds} / ${baths}`, label: "Beds / Baths" };
  if (beds) return { value: beds, label: "Beds" };
  if (baths) return { value: baths, label: "Baths" };
  return { value: "", label: "Beds / Baths" }; // open slot; the label is the instruction
}

/** The street line and the locality, split for the hero (a 48px value wants the short
 *  half). Every half is the resolved record's own value — nothing is composed.
 *
 *  The STRUCTURED fields win over the address tail. The vendor's `formattedAddress`
 *  comes back "326 Shore Dr, Fort Myers, FL, 33905" — a comma before the ZIP — so
 *  slicing the tail off it prints "Fort Myers, FL, 33905" (seen live 07/13/2026).
 *  city/state/zip are the same record's own fields and compose cleanly. The tail is
 *  the fallback for a subject the vendor never matched (the typed address is all we
 *  have, and it is still real). */
function splitAddress(facts: ListingFacts): { street: string; locality: string } {
  const full = (facts.address ?? "").trim();
  const comma = full.indexOf(",");
  const street = comma > 0 ? full.slice(0, comma).trim() : full;
  const tail = comma > 0 ? full.slice(comma + 1).trim() : "";
  const fromFields = [facts.city, [facts.state, facts.zip].filter(Boolean).join(" ").trim()]
    .filter(Boolean)
    .join(", ");
  return { street, locality: fromFields || tail };
}

/** Where an RSVP goes. The agent's own CTA link (their brand, already on the canvas)
 *  when they have one; otherwise our site — the same citation the flyer's CTA uses.
 *  Both are real. We never mint a destination. */
function rsvpUrl(current: EmailDoc, facts: ListingFacts): string | undefined {
  const card = current.blocks.find((b) => b.type === "agent-card");
  const cta = card?.type === "agent-card" ? card.props.ctaUrl?.trim() : "";
  return cta || facts.sourceUrl || undefined;
}

export async function buildOpenHouse(ctx: RecipeBuildContext): Promise<EmailDoc | null> {
  const { facts, currentDoc, recipe } = ctx;
  // No subject → there is no house to invite anyone to. Fall through to the generic
  // author rather than shipping an invitation to nowhere.
  if (!facts) return null;

  const seed = seedById(recipe.skeleton ?? SEED_ID)?.build();
  if (!seed) return null; // a skeleton that vanished degrades; it never throws

  // Brand-or-skeleton: a real user brand carries through untouched; only a canvas
  // still on the house default adopts the skeleton's open-house palette.
  const brandIsHouse = currentDoc.globalStyle.accentColor === DEFAULT_GLOBAL_STYLE.accentColor;
  const globalStyle = brandIsHouse ? { ...seed.globalStyle } : { ...currentDoc.globalStyle };

  const { street, locality } = splitAddress(facts);
  const photo = facts.photos[0];

  // ── The blocks, in the skeleton's order, with the moment row inserted ────────
  const blocks: EmailBlock[] = [];

  // 1. Header — the agent's branded header, sticky.
  blocks.push(at(stick(currentDoc, seed, "header"), { x: 0, y: 0, w: 12, h: 2 }));

  // 2. The photo. Sourced → the real (mirrored) listing photo. Unsourced → an OPEN
  //    SLOT: the canvas renders a file-picker + paste-a-link dropzone whose
  //    instruction is the alt text; the email omits it entirely.
  const seedImage = seedBlockOf(seed, "image");
  blocks.push(
    at(
      {
        id: seedImage?.id ?? createBlock("image").id,
        type: "image",
        props: {
          url: photo ?? "",
          kind: "photo",
          ratio: "3:2",
          alt: facts.address ?? "Property exterior",
          ...(photo && facts.sourceUrl ? { linkUrl: facts.sourceUrl } : {}),
        },
      },
      { x: 0, y: 2, w: 12, h: 6 },
    ),
  );

  // 3. Hero — the seed's invitation kicker, over the ADDRESS. Both halves are the
  //    resolved record's own value. The seed's label ("Date, time, and address") is
  //    an instruction, and HeroBlock would ship it naked to a recipient — so the
  //    address takes the slot and the moment goes where it can be suppressed.
  const seedHero = seedBlockOf(seed, "hero");
  blocks.push(
    at(
      {
        id: seedHero?.id ?? createBlock("hero").id,
        type: "hero",
        props: {
          kicker: seedHero?.type === "hero" ? (seedHero.props.kicker ?? "") : "",
          value: street,
          label: locality,
          prose: "",
        },
      },
      { x: 0, y: 8, w: 12, h: 4 },
    ),
  );

  // 4. THE MOMENT — two OPEN SLOTS, and the whole point of this recipe.
  //
  //    No vendor feed carries an open-house date or time. It is a lane-2/lane-4 fact:
  //    the agent supplies it. So it is never invented, never a placeholder date, and
  //    never "TBD". It is an empty cell whose LABEL is the instruction.
  //
  //    Canvas  → two dashed "+ Add" cells reading "Open House Date" / "Open House Time".
  //    Email   → StatsBlock drops an empty cell, and drops the ROW when every cell is
  //              empty. An un-dated invitation therefore says nothing about a date.
  //    Filled  → they render at 32px directly under the invitation: date and time up
  //              front, and the labels still read as captions.
  blocks.push(
    at(
      {
        id: createBlock("stats").id,
        type: "stats",
        props: {
          stats: [cell(undefined, "Open House Date"), cell(undefined, "Open House Time")],
        },
      },
      { x: 0, y: 12, w: 12, h: 3 },
    ),
  );

  // 5. The specs — the seed's own labels, the record's own values.
  const seedStats = seedBlockOf(seed, "stats");
  blocks.push(
    at(
      {
        id: seedStats?.id ?? createBlock("stats").id,
        type: "stats",
        props: {
          stats: [
            cell(facts.price, "Asking Price"),
            bedsBathsCell(facts),
            cell(withCommas(facts.sqft), "Sq Ft"),
          ],
        },
      },
      { x: 0, y: 15, w: 12, h: 3 },
    ),
  );

  // 6. The paragraph — authored below. Empty here: the seed PREFILLS this body with a
  //    canvas hint ("Write a couple of sentences that get someone off the couch…"),
  //    and TextBlock ships any non-empty body. Left alone, that hint reaches the
  //    recipient as if it were the agent's prose. It is cleared unconditionally.
  const seedText = seedBlockOf(seed, "text");
  blocks.push(
    at(
      {
        id: seedText?.id ?? createBlock("text").id,
        type: "text",
        props: { body: "", align: "left" },
      },
      { x: 0, y: 18, w: 7, h: 4 },
    ),
  );

  // 7. The ONE CTA — an RSVP, per the recipe's framing (the seed still says "Get
  //    Directions"; reported). The key is the authority over the seed on framing.
  const seedButton = seedBlockOf(seed, "button");
  blocks.push(
    at(
      {
        id: seedButton?.id ?? createBlock("button").id,
        type: "button",
        props: { label: "RSVP for the Open House", url: rsvpUrl(currentDoc, facts) },
      },
      { x: 7, y: 18, w: 5, h: 4 },
    ),
  );

  // 8/9. Agent card + CAN-SPAM footer — sticky brand, never authored.
  blocks.push(at(stick(currentDoc, seed, "agent-card"), { x: 0, y: 22, w: 12, h: 4 }));
  blocks.push(at(stick(currentDoc, seed, "footer"), { x: 0, y: 26, w: 12, h: 3, static: true }));

  // NO CHART. Declared on the key: this deliverable is about a house and a moment.
  // The seed carries no chart block, so this is a no-op today — it is the policy
  // stated in code, and it guards a chart slot ever arriving from the skeleton.
  let doc = dropEmptyChartSlot({ globalStyle, blocks });

  // THE PROSE. Clear FIRST and UNCONDITIONALLY — fillNarrative skips a text block that
  // already has content, so a null narrative (no key, no facts, a failed call) would
  // otherwise leave whatever sat in the slot. Then fill, only if the model gave us
  // something real. A gap here stays an OPEN SLOT for the agent, never a fabrication.
  doc = clearNarrativeSlots(doc);

  // WHICH SOURCES THE NARRATOR GETS (playbook Part 3, rule 4: hand it sources, forbid
  // the rest). Everything the record holds about the HOUSE — minus the price cut.
  //
  // The cut is a real vendor fact and it is NOT this email's story: it is R7's
  // (price-reduced) entire hat. Handed it, Sonnet reached for it every time and wrote
  // itself into a price argument — "the price now reflects where the market has
  // settled on homes of this scale" (live, 07/13/2026), which is a market claim we
  // never gave it and cannot cite. Withholding it is not hiding a number: the asking
  // price is right there in the grid. It is choosing which facts THIS email is about.
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
      "They sit in the grid directly above your paragraph; repeating them wastes the only " +
      "sentences you get.\n" +
      "• Do not write the word RSVP — the button says it.",
  });
  if (narrative) doc = fillNarrative(doc, narrative);

  return doc;
}
