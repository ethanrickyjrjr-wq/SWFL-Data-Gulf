// lib/deliverable/recipes/price-reduced.ts
//
// R7 · PRICE IMPROVED — the same resolved house as New Listing, wearing the hat of
// a price CUT. Lead with the cut.
//
// This was an ORPHAN skeleton: `price-reduced` has lived in SEED_DOCS since the
// template gallery shipped, and no button ever offered it. So the seed card was the
// only thing a user could reach, and nothing in the product could FILL it. This
// builder gives it a build path, so the card and the button are one deliverable.
//
// The six answers (playbook Part 6):
//
//   1. SUBJECT — the listing address, from the field OR the prompt. The dispatcher
//      already resolved it (ctx.facts). We never write a second resolver.
//   2. SKELETON — the committed `price-reduced` grid in SEED_DOCS. Loaded by key.
//      Its shape (hero LEFT, price-story stats RIGHT, photo, paragraph, CTA) and its
//      palette are the skeleton's; the divergences are named in THE SEED REWRITE below.
//   3. CELLS — the cut · the new price · the previous price · beds · baths · sq ft ·
//      $/sq ft · lot · type. Each renders only if sourced. Days on Market is NOT a
//      field our record carries at all, so it is an OPEN SLOT — never a zero.
//   4. CHART — NONE (declared on the key). Two bars, was and now, is a fact wearing a
//      chart costume. WRITE THE FACT: it is the kicker, the hero, and one stat cell.
//      dropEmptyChartSlot enforces the policy in code.
//   5. PROSE — the vendor record + the agent's pasted description (lane 2), under the
//      TIGHTEST prohibition list in the fan-out. See THE INVENTION TRAP below.
//   6. FRAMING — the cut as an accent kicker ABOVE the price, the new price as the
//      hero, the address under it, one CTA to the listing.
//
// ── THE ARITHMETIC (probed live, 07/13/2026 — get this backwards and we ship a lie
//    about someone's house) ──────────────────────────────────────────────────────
//
//   The vendor's `price.reduced_amount` is the SIZE OF THE CUT. It is NOT the old
//   price. 326 Shore Dr came back with `price: $595,000` and `reduced_amount:
//   104975`, so:
//
//       previous = current + cut = 595,000 + 104,975 = $699,975     ✅
//       previous = reduced_amount = $104,975                         ❌ absurd —
//           that is LESS than the current asking price. A "reduction" TO $104,975
//           from $595,000 is not a price improvement, it is a fantasy.
//
//   `ListingFacts.priceReduction` is ALREADY the formatted string "$104,975" (the
//   normalizer ran `usd()` in resolve-subject.ts). DO NOT convert it again. We parse
//   the digits back out ONCE, add, and re-format — the only derivation in this file,
//   and it is the same class as the reference implementation's $/sqft (a value
//   computed from two numbers the vendor stated, never back-solved from one).
//
// ── THE INVENTION TRAP: this recipe's narrator is where a lie would actually ship ─
//
//   open-house.ts found (live) that Sonnet, handed the price cut, reached for it
//   every time and wrote itself a market rationale — "the price now reflects where
//   the market has settled on homes of this scale." Its fix was to DELETE the cut
//   from the narrator's facts. We cannot: the cut is our entire hat.
//
//   Worse, this recipe's own registry prompt invites the failure — "one honest line
//   on what the new price means." Read literally by a model with no market data, the
//   only sentences that "explain" a price cut are inventions: a motivated seller, a
//   softening market, a bargain, a deal. We know NONE of those things. We know the
//   price moved and by how much. WHY it moved is not in any record we hold.
//
//   So the framing below forbids, by name: a REASON for the cut, a claim about the
//   SELLER, a claim about the MARKET, and any value judgment ("deal", "bargain",
//   "priced to move", "won't last"). What survives is the honest reading of "what the
//   new price means": you can now buy THIS house — with its real, cited features — at
//   this price. So the paragraph describes the HOUSE. The numbers stay in the grid.

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
const SEED_ID = "price-reduced";

/** Reuse the current canvas doc's block of a type — the agent's brand (header, the
 *  CAN-SPAM footer) is STICKY and we never author one. Falls back to the skeleton's. */
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

/** Position a block on the 12-col grid. */
function at<T extends EmailBlock>(block: T, layout: BlockLayout): T {
  return { ...block, layout };
}

/** "2847" → "2,847". Undefined in → undefined (an open slot, never a fabricated 0). */
function withCommas(n?: string): string | undefined {
  const digits = (n ?? "").replace(/[^\d]/g, "");
  if (!digits) return undefined;
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** The digits of a money string → a number. "$104,975" → 104975. Anything that isn't
 *  a positive finite number → undefined, and every cell that depended on it becomes
 *  an open slot. We never coerce a miss into a 0. */
function money(s?: string): number | undefined {
  const n = Number((s ?? "").replace(/[^\d.]/g, ""));
  return n > 0 && Number.isFinite(n) ? n : undefined;
}

function usd(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

/**
 * THE PREVIOUS PRICE. current + cut — the ONE derivation in this file.
 *
 * Both operands are the vendor's own stated numbers (`price`, `price.reduced_amount`),
 * so this is arithmetic on sourced values, not a back-solve. A missing operand returns
 * undefined and the cell becomes an OPEN SLOT — never a guessed anchor price, which
 * would be a lie about what someone's home used to cost.
 */
export function previousPrice(facts: ListingFacts): string | undefined {
  if (!facts.isPriceReduced) return undefined;
  const current = money(facts.price);
  const cut = money(facts.priceReduction);
  if (current === undefined || cut === undefined) return undefined;
  return usd(current + cut);
}

/**
 * THE OPERATOR'S TREATMENT, verbatim (07/13/2026): "SHOW THE REDUCED AMOUNT IN A
 * DIFFERENT COLOR ABOVE PRICE IN SMALLER FONT — Price cut."
 *
 * The hero KICKER is exactly that slot, and it already has exactly that styling —
 * HeroBlock.tsx renders it directly above `value` at fontSize 11px (the value is
 * 40px) in `globalStyle.accentColor` (the price renders in the text color). So the
 * treatment is the document model's own, not a new component and not an inline hack:
 *
 *     PRICE CUT $104,975     ← 11px, accent (#E05A00 on this skeleton)
 *     $595,000               ← 40px, text color
 *     326 Shore Dr, Fort Myers, FL 33905
 *
 * No cut → EMPTY kicker, and HeroBlock drops a falsy kicker on the sendable path
 * (`props.kicker || scope`), so a house with no reduction never ships the words
 * "Price cut" over nothing.
 */
export function priceCutKicker(facts: ListingFacts): string {
  if (!facts.isPriceReduced || !facts.priceReduction) return "";
  return `Price cut ${facts.priceReduction}`;
}

/** List price ÷ listed square footage → "$209". Both must parse; anything missing →
 *  undefined (an open slot, never a fabricated value). This is the NEW price per
 *  square foot — which is the whole point of showing it on a price-cut email. */
function pricePerSqft(facts: ListingFacts): string | undefined {
  const p = money(facts.price);
  const s = money(facts.sqft);
  if (p === undefined || s === undefined) return undefined;
  return usd(p / s);
}

/** A short, cell-sized property-type label (the stat cell caps at 24 chars). */
function shortType(t?: string): string | undefined {
  if (!t) return undefined;
  const seg =
    t
      .split(/\s[-–—]\s/)
      .pop()
      ?.trim() || t.trim();
  return seg.slice(0, 24) || undefined;
}

/** A stat cell. An unsourced value stays EMPTY — on the canvas that is an editable
 *  open slot whose LABEL is the instruction; on the sendable paths StatsBlock drops
 *  the cell, and drops the whole row when none survive. Never a zero. */
function cell(value: string | undefined, label: string): StatItem {
  return { value: value && value.trim() ? value.trim().slice(0, 24) : "", label };
}

/** The address, composed from the record's STRUCTURED fields.
 *
 *  The vendor's `formattedAddress` comes back "326 Shore Dr, Fort Myers, FL, 33905" —
 *  a stray comma before the ZIP (seen live 07/13/2026). city/state/zip are the same
 *  record's own fields and compose cleanly. The raw address is the fallback for a
 *  subject the vendor never matched (the typed address is all we have, and it is
 *  still real). Nothing here is invented — only re-punctuated. */
function addressLine(facts: ListingFacts): string {
  const full = (facts.address ?? "").trim();
  const comma = full.indexOf(",");
  const street = comma > 0 ? full.slice(0, comma).trim() : full;
  const locality = [facts.city, [facts.state, facts.zip].filter(Boolean).join(" ").trim()]
    .filter(Boolean)
    .join(", ");
  if (!street) return locality;
  return locality ? `${street}, ${locality}` : full;
}

export async function buildPriceReduced(ctx: RecipeBuildContext): Promise<EmailDoc | null> {
  const { facts, currentDoc, recipe } = ctx;
  // No subject → there is no price to have improved. Fall through to the generic
  // author rather than announcing a cut on a house that doesn't exist.
  if (!facts) return null;

  const seed = seedById(recipe.skeleton ?? SEED_ID)?.build();
  if (!seed) return null; // a skeleton that vanished degrades; it never throws

  // Brand-or-skeleton: a real user brand carries through untouched; only a canvas
  // still on the house default adopts the skeleton's price-cut palette.
  const brandIsHouse = currentDoc.globalStyle.accentColor === DEFAULT_GLOBAL_STYLE.accentColor;
  const globalStyle = brandIsHouse ? { ...seed.globalStyle } : { ...currentDoc.globalStyle };

  // ── THE THREE NUMBERS. Each appears exactly ONCE, and they check each other:
  //    previous − cut = current. A reader can do the arithmetic and it holds.
  const kicker = priceCutKicker(facts); // "Price cut $104,975" — vendor's reduced_amount
  const previous = previousPrice(facts); // "$699,975"          — current + cut
  const photo = facts.photos[0];

  const blocks: EmailBlock[] = [];

  // 1. Header — the agent's branded header, sticky.
  blocks.push(at(stick(currentDoc, seed, "header"), { x: 0, y: 0, w: 12, h: 2 }));

  // 2. THE HERO — the operator's treatment. The cut sits ABOVE the price, smaller and
  //    in the accent color (the kicker slot's own styling); the new price is the hero
  //    value; the address is under it. A house with no reduction ships an empty kicker,
  //    which HeroBlock omits — never the words "Price cut" over nothing.
  const seedHero = seedBlockOf(seed, "hero");
  blocks.push(
    at(
      {
        id: seedHero?.id ?? createBlock("hero").id,
        type: "hero",
        props: {
          kicker,
          value: facts.price ?? "",
          label: addressLine(facts),
          prose: "",
        },
      },
      { x: 0, y: 2, w: 6, h: 4 },
    ),
  );

  // 3. THE PRICE STORY — beside the hero, per the skeleton.
  //
  //    "Previous Price" is the anchor that makes the cut checkable. It is DERIVED
  //    (current + cut) from two vendor-stated numbers — the same class as $/sqft.
  //
  //    "Days on Market" is an OPEN SLOT, and honestly so: `ListingFacts` carries no
  //    days-on-market field at all — not "the vendor returned null", but "we never
  //    modeled it". The agent knows it; the label is the instruction; the sent email
  //    omits the cell entirely. Never a zero, never a guess.
  //
  //    The seed's third cell ("Price Drop") is deliberately GONE: the operator moved
  //    the cut into the hero, and printing $104,975 twice, six inches apart, is noise.
  blocks.push(
    at(
      {
        id: seedBlockOf(seed, "stats")?.id ?? createBlock("stats").id,
        type: "stats",
        props: { stats: [cell(previous, "Previous Price"), cell(undefined, "Days on Market")] },
      },
      { x: 6, y: 2, w: 6, h: 4 },
    ),
  );

  // 4. The photo. Sourced → the real listing photo, already mirrored into OUR storage
  //    by the resolver (a re-send months from now must not depend on the vendor CDN).
  //    Unsourced → an OPEN SLOT: the canvas renders a file-picker + paste-a-link
  //    dropzone whose instruction is the alt text; the email omits it entirely.
  const seedImage = seedBlockOf(seed, "image");
  blocks.push(
    at(
      {
        id: seedImage?.id ?? createBlock("image").id,
        type: "image",
        props: {
          url: photo ?? "",
          kind: "photo",
          ratio: "4:3", // the skeleton's own ratio
          alt: facts.address ?? "Property photo",
          ...(photo && facts.sourceUrl ? { linkUrl: facts.sourceUrl } : {}),
        },
      },
      { x: 0, y: 6, w: 12, h: 5 },
    ),
  );

  // 5/6. THE KEY SPECS — required by the recipe's own prompt ("the home's key specs")
  //      and absent from the seed entirely (reported). Same seven-slot vocabulary as
  //      the reference flyer, minus "Built" (this record carries no yearBuilt, and a
  //      third row holding one perpetually-empty cell is a worse card than two full
  //      rows). $/Sq Ft is computed on the NEW price — which is the entire point of
  //      showing it on a price-cut email.
  blocks.push(
    at(
      {
        id: createBlock("stats").id,
        type: "stats",
        props: {
          stats: [
            cell(facts.beds, "Beds"),
            cell(facts.baths, "Baths"),
            cell(withCommas(facts.sqft), "Sq Ft"),
          ],
        },
      },
      { x: 0, y: 11, w: 12, h: 2 },
    ),
  );
  blocks.push(
    at(
      {
        id: createBlock("stats").id,
        type: "stats",
        props: {
          stats: [
            cell(pricePerSqft(facts), "$/Sq Ft"),
            cell(facts.lotSize, "Lot"),
            cell(shortType(facts.propertyType), "Type"),
          ],
        },
      },
      { x: 0, y: 13, w: 12, h: 2 },
    ),
  );

  // 7. The paragraph — authored below. EMPTY here: the seed PREFILLS this body with
  //    "Say why this is a good value now — what changed, and why a motivated seller
  //    means room to negotiate." TextBlock ships any non-empty body, so left alone
  //    that canvas hint reaches the recipient as if it were the agent's prose — and it
  //    is not merely filler, it is a coaching note that asks for two claims we cannot
  //    source (a motivated seller, room to negotiate). It is cleared unconditionally.
  const seedText = seedBlockOf(seed, "text");
  blocks.push(
    at(
      {
        id: seedText?.id ?? createBlock("text").id,
        type: "text",
        props: { body: "", align: "left" },
      },
      { x: 0, y: 15, w: 12, h: 4 },
    ),
  );

  // 8. The agent card — ONLY if the canvas already has one. We never `createBlock` a
  //    default: its default props are HOUSE_BRAND placeholder prose ("A short bio that
  //    builds trust with your readers"), and AgentCardBlock takes NO `emailRender`
  //    flag — so a defaulted card ships that placeholder to a real recipient. Sticky
  //    brand or nothing.
  const agentCard = currentDoc.blocks.find((b) => b.type === "agent-card");
  let y = 19;
  if (agentCard) {
    blocks.push(at(agentCard, { x: 0, y, w: 12, h: 4 }));
    y += 4;
  }

  // 9. The CTA — the skeleton's own label. It points at our citation root, never a
  //    vendor permalink (listing-citation policy).
  const seedButton = seedBlockOf(seed, "button");
  const seedLabel = seedButton?.type === "button" ? (seedButton.props.label ?? "").trim() : "";
  blocks.push(
    at(
      {
        id: seedButton?.id ?? createBlock("button").id,
        type: "button",
        // NOT "See the New Price" (operator, 07/13/2026: *"why would the button be SEE THE
        // NEW PRICE when we already show the price"*). The email's entire job is showing the
        // new price — the hero IS the new price, with the cut above it. A button pointing at
        // what the reader is already looking at asks them to do nothing.
        //
        // A price cut exists to get people through the door. So the CTA is the NEXT ACTION.
        props: { label: seedLabel || "Schedule a Showing", url: facts.sourceUrl },
      },
      { x: 0, y, w: 12, h: 2 },
    ),
  );
  y += 2;

  // 10. Footer — the agent's CAN-SPAM footer (address, socials, unsubscribe). Sticky.
  blocks.push(at(stick(currentDoc, seed, "footer"), { x: 0, y, w: 12, h: 3, static: true }));

  // NO CHART. Declared on the key: was-and-now is TWO BARS, which is a fact wearing a
  // chart costume — so we wrote the fact instead (the kicker, the hero, the stat). The
  // seed carries no chart block, so this is a no-op today; it is the policy stated in
  // code, and it guards a chart slot ever arriving from the skeleton.
  let doc = dropEmptyChartSlot({ globalStyle, blocks });

  // THE PROSE. Clear FIRST and UNCONDITIONALLY — fillNarrative SKIPS a text block that
  // already has content, so a null narrative (no key, no facts, a failed call) would
  // otherwise leave the seed's coaching note sitting in the slot. Then fill, only if
  // the model gave us something real. A gap stays an OPEN SLOT, never a fabrication.
  doc = clearNarrativeSlots(doc);

  // ── NO DESCRIPTION → NO PARAGRAPH. THE SLOT STAYS OPEN. ──────────────────────
  //
  // This is the most important decision in the file, and it was made by LOOKING at
  // what the model actually wrote (live, 07/13/2026) when handed the record alone:
  //
  //   "New construction on a quarter-acre lot in Fort Myers, this three-bedroom,
  //    three-and-a-half-bath home delivers nearly 2,850 square feet — and the asking
  //    price has come down. THE ADDRESS ON SHORE DRIVE SUGGESTS A SETTING WORTH A
  //    CLOSER LOOK, and the scale of the floor plan offers ROOM THAT NEWER BUILDS AT
  //    THIS SIZE RARELY COMPROMISE ON. WORTH SCHEDULING A SHOWING…"
  //
  // Three inventions and a recitation, from a model under an explicit ban on all four:
  // a SETTING inferred from the street NAME (the playbook's "waterfront character"
  // guess, exactly); a comparative claim about OTHER BUILDS it was shown none of; a
  // SELLING CLAIM of its own; and the spec grid read back to a reader who can see it.
  //
  // More prohibitions do not fix this, and the playbook already says why (Part 3,
  // rule 4): "handed the spec cells and told 'use only these facts', the only sentence
  // it can write is the cells read back." A house's DESCRIPTION is not in any feed we
  // buy — no vendor sells MLS remarks. So without lane 2, the narrator has NO SOURCE
  // for a paragraph about this home, and a paragraph with no source is exactly the one
  // thing this product forbids.
  //
  // So: the paragraph is authored ONLY from a real descriptive source. With none, the
  // slot stays OPEN — on the canvas TextBlock renders its instruction ("Paste your
  // text here — we'll tighten it") and the agent pastes the remarks they already own;
  // in the SENT email the block does not exist (TextBlock, emailRender). The grid, the
  // photo and the cut still carry the email. Never refuse, never invent.
  if (!facts.remarks?.trim()) return doc;

  // ── WHAT THE NARRATOR MAY DRAW FROM ──────────────────────────────────────────
  // authorListingNarrative hands it the record AND the agent's pasted description as
  // lane-2 truth — the description is the SOURCE, the record only keeps it honest. The
  // framing is where THIS recipe earns its keep: it is the only recipe whose subject is
  // a number that MOVED, and "why did it move" is the one question nothing we hold can
  // answer.
  const reduced = Boolean(kicker);
  const framing = reduced
    ? "A PRICE IMPROVEMENT announcement. The asking price on this home has come DOWN, and " +
      "that is the news.\n" +
      `• THE NUMBERS ARE ALREADY ON THE PAGE, directly above your paragraph: the size of the ` +
      `cut (${facts.priceReduction}), the new asking price (${facts.price})` +
      (previous ? `, and the previous price (${previous})` : "") +
      `. You may refer to the fact that the price came down, ONCE, in plain words. Do not ` +
      `recite the figures back — they are in the grid, and repeating them wastes the only ` +
      `sentences you get.\n` +
      "• YOU DO NOT KNOW WHY THE PRICE CAME DOWN. No record we hold says why, so you may not " +
      "say why. Never suggest the seller is motivated, anxious, relocating, or open to " +
      "negotiation; never suggest there is 'room' on the price; never invite an offer below " +
      "the ask. You were told a number changed, nothing more.\n" +
      "• YOU WERE GIVEN NO MARKET DATA. Not one comparable sale, not one trend. So you may not " +
      "say the price 'reflects the market', that homes like this have softened, that this is " +
      "now a deal, a value, a bargain, a steal, or 'priced to move' or that it 'won't last'. " +
      "Those are sales claims, and every one of them is a fact about a market you were never " +
      "shown.\n" +
      "• THE AGENT'S OWN DESCRIPTION IS YOUR SOURCE. Pull the specifics from it — the setting, " +
      "the rooms, the finishes, the standout features — and tighten them. Keep them TRUE: " +
      "restate what it actually said, never an upgraded version of it.\n" +
      "• NEVER READ THE ADDRESS AS A FACT. A street called Shore Drive tells you NOTHING about " +
      "water, a view, or a setting. Do not infer, hint at, or 'suggest' any quality of the " +
      "location from its name — that is inventing a feature out of a word.\n" +
      "• NEVER COMPARE THIS HOME TO OTHER HOMES. You were shown no other property. 'Rare at this " +
      "size', 'unlike newer builds', 'hard to find' are claims about a market you never saw.\n" +
      "• DO NOT RESTATE the bed count, the bath count, the square footage, the lot size or the " +
      "type. They sit in the grid directly above your paragraph. A description that recites the " +
      "specs is a failure.\n" +
      "• DO NOT WRITE A CALL TO ACTION. No 'schedule a showing', no 'worth a look', no 'book a " +
      "tour' — the button below your paragraph does that job.\n" +
      "• NEVER REFER TO THE PAGE ITSELF. No 'the grid above', 'listed below', 'as you can see', " +
      "'shown here'. The reader sees a home, not a layout. Write about the house.\n" +
      "• WHAT YOU MAY WRITE: what a buyer actually GETS at this price — the home itself, from " +
      "the agent's description. That IS what the new price means. Describe the house."
    : // The vendor does not flag this house as reduced, and we hold no previous price.
      // The grid renders the cut cells as OPEN SLOTS for the agent; the narrator is told
      // NOTHING about a cut, because a framing that says "lead with the reduction" when
      // there is no sourced reduction is an invitation to invent one.
      "A listing update for a home on the market. The asking price shown is its CURRENT " +
      "price.\n" +
      "• YOU WERE NOT TOLD THE PRICE CHANGED. No record we hold says it did. Never write that " +
      "the price was reduced, improved, cut, adjusted or lowered; never name a previous price; " +
      "never imply the number moved.\n" +
      "• Describe the home itself, from the facts and the agent's own description.";

  const narrative = await authorListingNarrative(facts, { framing });
  if (narrative) doc = fillNarrative(doc, narrative);

  return doc;
}
