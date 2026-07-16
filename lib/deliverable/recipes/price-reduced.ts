// lib/deliverable/recipes/price-reduced.ts
//
// R7 · PRICE IMPROVED — the same resolved house as New Listing, wearing the hat of
// a price CUT. Now a THIN CHROME CALL.
//
// ── WHY THIS FILE SHRANK (07/13/2026) ────────────────────────────────────────────
//
// It used to own its own grid: header · hero(LEFT) · stats[2] · photo · stats[3] ·
// stats[3] · text · CTA · footer — and NO agent card at all. Six sibling recipes each
// owned a different grid, so a subscriber walking the campaign from Coming Soon to Sold
// got seven emails that looked like seven different companies. That is not a campaign;
// it is a pile.
//
// The layout now lives in ONE place — `buildLifecycleEmail` (lib/email/lifecycle-chrome.ts):
//
//   header · RIBBON · photo · hero(centred: ADDRESS over PRICE) · spec strip
//          · [middle] · narrative · agent card · CTA · footer
//
// What this recipe still owns — and ONLY this:
//   • the RIBBON WORD ...... "Price Improved"
//   • the HERO KICKER ...... "Price cut $104,975" — the accent line ABOVE the price,
//                            smaller (the operator's ruling; see THE TREATMENT below)
//   • the SPEC CELLS ....... the campaign's six + the PREVIOUS PRICE, the anchor that
//                            makes the cut checkable
//   • the MIDDLE ........... NOTHING. No chart (declared on the key): was-and-now is
//                            two bars, which is a fact wearing a chart costume.
//   • the CTA .............. "Schedule a Showing" — the NEXT action, never "See the New
//                            Price" (the email IS the new price)
//   • the FRAMING .......... the narrator's prohibition list — where the lie would ship
//
// It does NOT own the shape, and it does not own the brand. Both are the chrome's.
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
//   and it is the same class as the shared strip's $/sqft (a value computed from two
//   numbers the vendor stated, never back-solved from one). Its provenance is printed
//   under the strip, where the reader can see it.
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

import { buildLifecycleEmail } from "@/lib/email/lifecycle-chrome";
import { listingSpecs, spec, specFootnote } from "@/lib/email/listing-flyer";
import {
  authorListingNarrative,
  clearNarrativeSlots,
  dropEmptyChartSlot,
  fillNarrative,
  isComparableHome,
  median,
  perSqft,
} from "./shared";
import { compsForAddress, type RenderComp } from "@/lib/assistant/comp-helper";
import { chartSpecToEmailImage } from "@/lib/email/spec-to-png";
import { createBlock } from "@/lib/email/doc/default-docs";
import type { RecipeBuildContext } from "./index";
import type { ListingFacts } from "@/lib/email/listing-scrape";
import type { EmailDoc, StatItem } from "@/lib/email/doc/types";
import type { ChartSpec } from "@/components/charts/registry/chart-spec";

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

/** How many real comps to require before charting a reference — one point is not a
 *  market, it's a coincidence. Matches the honest-evidence floor used elsewhere in
 *  this recipe set (buildPriceCase requires >=1 priced comp; a reference computed
 *  from ONE comp is too thin to call a market position, so this recipe asks for 2). */
const MIN_COMPS_FOR_CHART = 2;

/** How many nearby comps to pull before filtering. Mirrors market-comps.ts's COMP_POOL:
 *  pull more than we need because the vacant-lot filter (isComparableHome) eats some. */
const COMP_POOL = 12;

/**
 * The new price's $/sq ft vs. the median $/sq ft of real nearby comparable homes — one
 * value, one reference, on the already-registered `dot-plot` frame (no new chart-
 * rendering code). Pure: no I/O, invents nothing. Comps are used ONLY to compute this
 * chart — this function's caller must NEVER hand `comps` to the narrator (see
 * `buildPriceReduced`'s own header: the narrator holds zero market data, by design,
 * specifically to prevent it inventing a reason the price moved).
 *
 * Null when there's no defensible reference: fewer than MIN_COMPS_FOR_CHART comps with a
 * USABLE $/sqft value (never merely MIN_COMPS_FOR_CHART comps that pass isComparableHome —
 * see the floor computation below), or the subject itself has no price or sqft.
 * `dropEmptyChartSlot` (shared.ts) removes the reserved slot when this returns null — never
 * an empty box.
 */
export function priceVsAreaDotSpec(facts: ListingFacts, comps: RenderComp[]): ChartSpec | null {
  const subjectPrice = money(facts.price);
  const subjectSqft = money(facts.sqft);
  const subjectPpsf = perSqft(subjectPrice ?? null, subjectSqft ?? null);
  if (subjectPpsf == null) return null;

  // THE FLOOR IS ON USABLE $/SQFT VALUES, NEVER ON COMP COUNT (final-review fix,
  // 07/16/2026). `isComparableHome` only asks for beds + sqft + a POSITIVE price — a $100
  // nominal-price deed (a family transfer, a quitclaim) clears it while `perSqft` correctly
  // discards it (its own >0 guard rounds $100/2,000 sqft to $0 and returns null). Gating on
  // `comparable.length` let a 2-"home" set with only ONE real $/sqft value still ship a
  // "median" that was really just that one comp's own number. Compute the FILTERED array
  // first and gate the floor on ITS length — it now measures what the median is actually
  // built from, not what merely looks like a house.
  const comparable = comps.filter(isComparableHome);
  const ppsfValues = comparable
    .map((c) => perSqft(c.price, c.sqft))
    .filter((v): v is number => v != null);
  const referencePpsf = median(ppsfValues);
  if (referencePpsf == null || ppsfValues.length < MIN_COMPS_FOR_CHART) return null;

  const street = facts.address?.split(",")[0]?.trim() || "This home";
  return {
    frameId: "dot-plot",
    title: "The new price vs. nearby comparable homes",
    columns: ["Row", "$/Sq Ft"],
    rows: [
      [street, subjectPpsf],
      ["Comparable homes (median)", referencePpsf],
    ],
    value_format: "usd",
    chart_type: "scatter",
    asOf: new Date().toISOString().slice(0, 10),
    source: { citation: "SWFL Data Gulf · realtor.com", url: "https://www.realtor.com" },
    options: {
      data: [{ label: street, value: subjectPpsf, reference: referencePpsf }],
      // FIX (final-review, 07/16/2026): a SINGLE-ITEM dot-plot scales its track to
      // [value, reference], so the two dots always sit at opposite ends of the track no
      // matter how close the real numbers are — a $1/sqft gap renders identical to a
      // $200/sqft gap, and neither figure appeared anywhere in the email. Folding the
      // already-computed, already-sourced numbers into the legend labels is the minimal
      // fix — no new data, no new derivation.
      referenceLabel: `comparable homes (median ${usd(referencePpsf)}/sq ft)`,
      valueLabel: `this home, new price (${usd(subjectPpsf)}/sq ft)`,
    },
  };
}

/**
 * THE OPERATOR'S TREATMENT, verbatim (07/13/2026): "SHOW THE REDUCED AMOUNT IN A
 * DIFFERENT COLOR ABOVE PRICE IN SMALLER FONT — Price cut."
 *
 * The chrome's `heroKicker` is exactly that slot, and it already has exactly that
 * styling — HeroBlock renders a non-ribbon kicker at 11px, in `globalStyle.accentColor`,
 * above the hero's own lines. The chrome's hero is centred and label-first, so the
 * campaign's subject block reads:
 *
 *     PRICE CUT $104,975                  ← 11px, accent
 *     326 Shore Dr, Fort Myers, FL 33905  ← 27px display serif
 *     $595,000                            ← 48px accent
 *
 * So the treatment is the document model's own, not a new component and not an inline
 * hack. No cut → an EMPTY kicker, and the chrome omits a falsy kicker entirely, so a
 * house with no reduction never ships the words "Price cut" over nothing.
 */
export function priceCutKicker(facts: ListingFacts): string {
  if (!facts.isPriceReduced || !facts.priceReduction) return "";
  return `Price cut ${facts.priceReduction}`;
}

/** The address, composed from the record's STRUCTURED fields.
 *
 *  The vendor's `formattedAddress` comes back "326 Shore Dr, Fort Myers, FL, 33905" —
 *  a stray comma before the ZIP (seen live 07/13/2026). city/state/zip are the same
 *  record's own fields and compose cleanly. The raw address is the fallback for a
 *  subject the vendor never matched (the typed address is all we have, and it is
 *  still real). Nothing here is invented — only re-punctuated.
 *
 *  ⚠️ REPORTED, NOT FIXED: `addressLineOf` in lib/email/listing-flyer.ts (the shared
 *  root every lifecycle recipe reads) returns `facts.address` RAW, so the rest of the
 *  campaign still ships the stray comma. This helper should be lifted into that root —
 *  one authority per shared concept — but that file is not mine to edit. */
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

/**
 * THE SPEC STRIP — the campaign's shared spec line, with the PREVIOUS PRICE in front
 * and TYPE dropped to make room.
 *
 * `listingSpecs` is the line every lifecycle email wears (Beds · Baths · Sq Ft · Lot ·
 * $/Sq Ft · Type), so this strip stays a true sibling of New Listing's — same order,
 * same emphasis grammar: ONE primary ($/Sq Ft, the number that wins a listing argument)
 * and ONE muted.
 *
 * What this email adds is the ANCHOR: the previous price, the cell that makes the cut
 * CHECKABLE (previous − cut = current, and a reader can do it in their head). It is
 * `muted` deliberately — it is the number that has been SUPERSEDED, and it must never
 * out-shout the price the reader can actually pay (the 48px accent hero).
 *
 * ⚠️ SOMETHING HAD TO GO, AND THE REASON IS NOT AESTHETIC. `EmailDocSchema` caps a stats
 * row at SIX cells. A seventh does not merely crowd the strip — it FAILS VALIDATION, and
 * build-doc then falls through to the GENERIC AUTHOR. Caught only by building through the
 * real `authorDoc` path (07/13/2026): the fallback email it produced wrote *"one of the
 * sharpest values on the waterfront today"* and *"Fort Myers values have pulled back from
 * their 2023 peak"* — the exact market inventions this recipe's framing exists to forbid.
 * A cell count is a NO-INVENTION CONCERN here, not a layout preference. The doc-parses
 * test below is the guard.
 *
 * TYPE is the cell that goes. It is the muted context cell in every listing strip, and on
 * an email whose entire subject is A NUMBER THAT MOVED, "Residential" is the one cell a
 * reader will never use. The anchor takes its slot.
 *
 * "Days on Market" — the old grid's second cell — is also gone. We hold no such field:
 * not "the vendor returned null", but "we never modeled it". A permanently-empty ghost in
 * a hairline strip is dead weight on every canvas and absent from every sent email. A cell
 * no lane can ever fill is not an open slot; it is clutter.
 */
function priceStrip(facts: ListingFacts, previous?: string): StatItem[] {
  return [
    spec(previous, "Previous Price", "muted"),
    ...listingSpecs(facts).filter((c) => c.label !== "Type"),
  ];
}

/** Provenance for the strip's DERIVED cells, stated where the reader can see it. The
 *  $/sqft note is the campaign's shared sentence (`specFootnote`); the previous-price
 *  note is this recipe's, because this recipe is the only one that derives it. */
function priceStripFootnote(facts: ListingFacts, previous?: string): string | undefined {
  const notes = [specFootnote(facts)];
  if (previous) notes.push("Previous price = this asking price plus the reduction on record.");
  const kept = notes.filter((n): n is string => Boolean(n));
  if (kept.length === 0) return undefined;
  const line = kept.join(" ");
  return line.startsWith("*") ? line : `*${line}`;
}

/** A deterministic, storage-key-safe slug of the subject's street (final-review fix,
 *  07/16/2026): lowercase, every run of non-alphanumerics collapsed to one hyphen, capped at
 *  24 chars, no leading/trailing hyphen. NO Date.now()/randomness — the SAME house rebuilt
 *  the same day must land on the SAME key (the media host upserts on it, which is the
 *  point), while TWO DIFFERENT houses must never collide on one. Before this, the storage
 *  key carried zip + date + accent-tint and NOTHING that named the house — two listings in
 *  the same ZIP, cut on the same day, sharing the agent's accent color, silently shared one
 *  URL, and the second build overwrote the first house's already-SENT chart image in place. */
function streetSlug(address?: string): string {
  const street = (address ?? "").split(",")[0]?.trim() ?? "";
  const slug = street
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/, "");
  return slug || "home";
}

/** Fill the reserved chart slot IN PLACE (preserving its grid position). Mirrors the
 *  same private helper in market-comps.ts — a generic block-filler, not extracted, since
 *  it carries no business rule (unlike isComparableHome/perSqft/median, Task 8). */
function fillChartSlot(doc: EmailDoc, url: string, alt: string, caption: string): EmailDoc {
  return {
    ...doc,
    blocks: doc.blocks.map((b) =>
      b.type === "image" && b.props.kind === "chart" && !b.props.url
        ? { ...b, props: { ...b.props, url, alt, caption } }
        : b,
    ),
  };
}

export async function buildPriceReduced(ctx: RecipeBuildContext): Promise<EmailDoc | null> {
  const { facts, currentDoc } = ctx;
  // No subject → there is no price to have improved. Fall through to the generic
  // author rather than announcing a cut on a house that doesn't exist.
  if (!facts) return null;

  // ── THE THREE NUMBERS. Each appears exactly ONCE, and they check each other:
  //    previous − cut = current. A reader can do the arithmetic and it holds.
  const kicker = priceCutKicker(facts); // "Price cut $104,975" — the vendor's reduced_amount
  const previous = previousPrice(facts); // "$699,975"          — current + cut
  const photo = facts.photos[0];

  // THE ONE LAYOUT. Brand (globalStyle, header, agent card, footer) is STICKY and lifted
  // from the canvas — we never author a user's colours or their signature.
  let doc = buildLifecycleEmail(currentDoc, {
    ribbon: "Price Improved",

    // The real listing photo, already mirrored into OUR storage by the resolver (a
    // re-send months from now must not depend on the vendor CDN). Unsourced → `null`,
    // and the chrome lays down a dropzone the agent fills; the sent email omits it.
    photo: photo
      ? { url: photo, alt: facts.address ?? "Featured property", linkUrl: facts.sourceUrl }
      : null,

    // The hero: the CUT above, the ADDRESS, then the NEW price. An empty kicker is
    // dropped by the chrome — never "Price cut" over nothing.
    heroKicker: kicker,
    heroValue: facts.price ?? "",
    heroLabel: addressLine(facts),

    specs: priceStrip(facts, previous),
    specFootnote: priceStripFootnote(facts, previous),

    // A reduction reserves ONE chart slot — where the NEW price sits against real
    // nearby comps (priceVsAreaDotSpec, filled below, in place, after the async comp
    // fetch). The was/now comparison stays a written fact, not a chart (two bars from
    // the SAME house is still a fact wearing a chart costume) — this is a DIFFERENT,
    // additional argument: the new price against the market. No reduction → no slot:
    // there is no price argument to make on a listing with no sourced cut.
    middle: kicker
      ? [
          {
            block: {
              id: createBlock("image").id,
              type: "image",
              props: {
                url: "",
                kind: "chart",
                alt: "The new price vs. nearby comparable homes",
                caption: "",
              },
            },
            height: 6,
          },
        ]
      : [],

    // The narrative is authored BELOW, and only from a real descriptive source. An empty
    // string here is an OPEN SLOT: an instruction on the canvas, absent from the email.
    narrative: "",

    // NOT "See the New Price" (operator, 07/13/2026: *"why would the button be SEE THE
    // NEW PRICE when we already show the price"*). The email's entire job is showing the
    // new price — the hero IS the new price, with the cut above it. A button pointing at
    // what the reader is already looking at asks them to do nothing.
    //
    // A price cut exists to get people through the door. So the CTA is the NEXT ACTION.
    ctaLabel: "Schedule a Showing",
    ctaUrl: facts.sourceUrl,
  });

  // ── THE CHART: where the new price sits against real nearby comps. Comps are used
  // ONLY to compute this chart — NEVER handed to the narrator below, which stays
  // exactly as constrained as it has always been (zero market data, so it can never
  // invent a reason the price moved). A chart is a bonus, never a blocker: any miss
  // here (no comps, fetch failure, render failure) simply drops the reserved slot.
  //
  // NO CROSS-QUANTITY COHERENCE CHECK. This recipe's hero is the TOTAL price; this
  // chart plots $/SQFT — two different quantities, and chart-coherence.ts's own
  // header states its honest scope: it compares MAGNITUDE within one UnitClass, and
  // that 4-way class (currency/percent/count/other) has no way to say "this currency
  // figure is a per-sqft rate, not a total" — both would read as plain "currency" and
  // the gate would fire on every real listing (price is ~1000x its $/sqft, far past
  // FACTOR=3), dropping this chart every time it could otherwise ship. Calling it here
  // would be the exact cross-quantity comparison the module documents as unsafe, not a
  // real coherence check. This chart needs no such gate anyway: it is magnitude-
  // self-consistent BY CONSTRUCTION — both plotted values (the subject's $/sqft and
  // the comps' median $/sqft) come from the same perSqft/median math over the same
  // sourced comps, so they can never disagree by more than the comps themselves do.
  if (kicker && facts.address) {
    const result = await compsForAddress(facts.address, { topN: COMP_POOL }).catch(() => null);
    const spec = priceVsAreaDotSpec(facts, result?.comps ?? []);
    if (spec) {
      const accent = doc.globalStyle.accentColor || "#B98F45";
      const tint = accent.replace(/[^0-9a-fA-F]/g, "").slice(0, 6) || "x";
      // The subject discriminator (final-review fix, 07/16/2026) — see streetSlug's own
      // doc comment for the collision this closes.
      const key =
        `email-charts/price-reduced-${facts.zip ?? "swfl"}-${streetSlug(facts.address)}-` +
        `${spec.asOf}-${tint}.png`;
      // NO block caption — the PNG already bakes in the title, source and as-of date; a
      // text caption would duplicate it (mirrors market-comps.ts's own chart fill).
      const image = await chartSpecToEmailImage(spec, accent, key).catch(() => null);
      if (image) doc = fillChartSlot(doc, image.url, image.alt, "");
    }
  }
  // Nothing resolved (no reduction, no comps, no image) → drop the slot. An empty
  // chart box is worse than no chart.
  doc = dropEmptyChartSlot(doc);

  // Clear FIRST and UNCONDITIONALLY — `fillNarrative` SKIPS a text block that already has
  // content, so any prefilled body (a skeleton's coaching note, a stale draft) would sit
  // there and ship as if it were the agent's prose. Clear, then fill only if the model
  // gave us something real. A gap stays an OPEN SLOT, never a fabrication.
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
  // in the SENT email the block does not exist (TextBlock, emailRender). The strip, the
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
      // The strip renders the cut cells as OPEN SLOTS for the agent; the narrator is told
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
