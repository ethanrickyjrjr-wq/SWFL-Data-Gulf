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
import { listingButtonUrl } from "@/lib/listings/listing-url";
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
import { priceReducedSubject } from "./subject-lines";
import { bankFor } from "../language-banks";
import { bodyWordCount, fillSentences } from "../language";
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

/** Slot values for PRICE_REDUCED_BANK, from the recipe's ALREADY-RESOLVED facts —
 *  the engine never fetches (spec FM3: the four-lane ladder runs upstream, in
 *  resolveSubject, never here). The street slot only earns a value when the vendor
 *  actually flags a reduction — the same condition as the kicker — so the bank's cut
 *  sentence can never announce a move the record doesn't hold. Community comes from
 *  the parcel-resolved subdivision (the field the narrator's inside-the-gate lane
 *  keys on, shared.ts) — absent is the normal case and the sentence drops whole. */
export function bankValues(facts: ListingFacts): Record<string, string | undefined> {
  const street = (facts.address ?? "").split(",")[0]?.trim() || undefined;
  return {
    // EXACTLY the kicker's condition — flag AND amount (second-order audit 08/09/2026,
    // finding 2.2): gating on the flag alone let code-owned prose announce a cut on an
    // email whose kicker, Previous cell, and narrator all held "no sourced cut". The
    // one divergence lane (flag true, amount absent) now drops the sentence whole.
    street: facts.isPriceReduced && facts.priceReduction ? street : undefined,
    community: facts.communityStats?.subdivisionName?.trim() || undefined,
  };
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
  const withPpsf = comparable
    .map((c) => ({ c, ppsf: perSqft(c.price, c.sqft) }))
    .filter((x): x is { c: RenderComp; ppsf: number } => x.ppsf != null)
    .sort((a, b) => a.ppsf - b.ppsf);
  const referencePpsf = median(withPpsf.map((x) => x.ppsf));
  if (referencePpsf == null || withPpsf.length < MIN_COMPS_FOR_CHART) return null;

  // ── A REAL BKLIT CHART, NOT THE DOT-PLOT (operator decree 08/09/2026: "WHERE ARE
  // ALL THE BKLIT CHARTS… STOP WITH THE SAME FUCKING CHARTS"). The two-dot slider is
  // gone: this is bklit's ComposedChart via the email bridge (bklitComposedSvg,
  // "composed-bar-line" in the spec-to-image dispatch) — each nearby comparable
  // home's own $/sq ft as a bar, sorted ascending, and THIS home's NEW $/sq ft drawn
  // across them as the reference line. Where the line cuts the bars IS the argument.
  // Every plotted number is a sourced comp's own figure or the subject's own
  // derivation — the bridge's "average" parameter carries the subject's value, a
  // real derived number, never a second invented one (the bridge's own rule).
  //
  // Bar labels are HOUSE NUMBERS (the street line's leading token): full addresses
  // measured 20.7px over the plot on a 600px canvas (market-comps postmortem), and
  // the title already says what the bars are. Endpoint value labels ON — a chart
  // with no numbers on it sucks (decree 08/02/2026).
  return {
    frameId: "composed-bar-line",
    // The title says what the BARS are; the line carries its own on-chart label
    // (`average_label` below), so neither leans on the other. "this size" is true by
    // construction: the caller arms compsForAddress's ±25% living-area band with the
    // subject's own sqft, and this spec cannot exist without that sqft (subjectPpsf
    // guard above) — so a plotted set is always a size-banded set.
    title: "Price per sq ft — nearby homes this size",
    columns: ["Comparable", "$/Sq Ft"],
    rows: withPpsf.map((x) => [x.c.addressLine, Math.round(x.ppsf)]) as (string | number)[][],
    value_format: "usd",
    chart_type: "bar",
    asOf: new Date().toISOString().slice(0, 10),
    source: { citation: "SWFL Data Gulf · realtor.com", url: "https://www.realtor.com" },
    options: {
      // Category labels are EMPTY on purpose (looked at 08/09/2026): the first render
      // used house numbers, and "1720 … 1801" under a chart reads as YEARS. Which comp
      // is which is the table's job (rows above carry full address lines); the chart's
      // job is the shape. `display` puts the DOLLAR form on the endpoint labels — WITH
      // its unit (looked at again 08/09/2026: a bare "$421" over a house chart reads as
      // a price, and the operator read it exactly that way).
      items: withPpsf.map((x) => ({
        label: "",
        value: Math.round(x.ppsf),
        display: `${usd(Math.round(x.ppsf))}/sq ft`,
      })),
      average: subjectPpsf,
      // Drawn ON the line by the bridge, dark ink — the reference line identifies
      // itself instead of asking the reader to find the title's clause about it.
      average_label: `${usd(subjectPpsf)}/sq ft — this home now`,
      value_labels: "endpoints",
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
 * "Days on Market" IS BACK (08/19/2026). This paragraph used to say DOM was cut because
 * "we never modeled it" — TRUE for exactly three days: written 07/13 (bf77c817), and the
 * `listing_dom` root shipped 07/16 (d8019515, the paid SteadyAPI heal lane included).
 * Nobody came back, so for a month the ONE email whose whole argument is "time is not
 * moving the price" omitted the number that says how much time. `resolve-subject`
 * attaches `facts.daysOnMarket` only when it is a real count (never a first-seen floor),
 * and `listingSpecs` already seats it in Type's slot — Type is gone here anyway, so on
 * this strip DOM evicts LOT instead (just-sold's 08/09 decree logic, "INCLUDE % SQ FT /
 * DOM": the least informative cell yields, and lot acreage is context on an email about
 * a price that moved). No DOM held → Lot keeps its slot; a ghost cell never ships.
 */
function priceStrip(facts: ListingFacts, previous?: string): StatItem[] {
  const shared = listingSpecs(facts, facts.daysOnMarket).filter((c) => c.label !== "Type");
  const domHeld = shared.some((c) => c.label === "DOM");
  return [
    // "PREVIOUS" — third label on this cell, this time MEASURED, not guessed
    // (08/09/2026). "Previous Price" wrapped its 94px cell (two words + tracking);
    // "Was" fit but read as noise on the rendered strip (operator: "WHAT THE FUCK
    // IS 'WAS'"). "PREVIOUS" measures ~70px + tracking against the 78px content
    // box (text-metrics, run before adoption) and is ONE word, so it cannot wrap
    // in any face. The footnote still states the full derivation.
    spec(previous, "Previous", "muted"),
    ...(domHeld ? shared.filter((c) => c.label !== "Lot") : shared),
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

  // §1.8 (fixed 08/09/2026, same defect the back-on-market walk found): `facts.sourceUrl`
  // is the CITATION field and resolve-subject hardcodes it to our own homepage — which is
  // exactly the value that must never become a button or a photo link. The flyer's ladder
  // is the ONE root for this decision: a real listing page or nothing.
  const realLink = listingButtonUrl(facts);

  // THE ONE LAYOUT. Brand (globalStyle, header, agent card, footer) is STICKY and lifted
  // from the canvas — we never author a user's colours or their signature.
  let doc = buildLifecycleEmail(currentDoc, {
    ribbon: "Price Improved",

    // The real listing photo, already mirrored into OUR storage by the resolver (a
    // re-send months from now must not depend on the vendor CDN). Unsourced → `null`,
    // and the chrome lays down a dropzone the agent fills; the sent email omits it.
    photo: photo
      ? {
          url: photo,
          alt: facts.address ?? "Featured property",
          ...(realLink ? { linkUrl: realLink } : {}),
        }
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

    // The seller's own description, verbatim in its own block — the chrome emits it only
    // when we actually hold one (never an open slot to a recipient). The July draft never
    // passed this at all, so even a paid-row description rendered nowhere on this email
    // while every walked sibling shipped it (found in the 08/09/2026 playbook rebuild).
    description: facts.remarks,

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
    ...(realLink ? { ctaUrl: realLink } : {}),
  });
  // THE SUBJECT LINE — deterministic, never model-authored (subject-lines.ts). Set here,
  // before every early-return path below, so it applies whether or not the narrative or
  // chart resolve. `newPrice` is the SOURCED verbatim facts.price — never derived.
  doc = { ...doc, subjectVariants: [priceReducedSubject(facts.address, facts.price)] };

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
    // SUBJECT SHAPE ARMS THE SIZE BAND (looked at 08/09/2026 — operator, on the render:
    // "COMPS ARE NOT 421 AND 173 DOLLARS"). Without `subjectSqft`, compsForAddress falls
    // back to a blind vendor slice, and this chart plotted a $173–$421/sq ft spread
    // against a 2,123 sq ft subject — shack-sized rows "compared" to a real house, the
    // exact defect `comps_no_size_band_guard` names. The ranker (comp-rank.ts, ±25%
    // living-area band, same-ZIP first) was already built and ratified; this call just
    // never armed it. The chart's own gate (subjectPpsf requires facts.sqft) means a
    // chart can only exist when the band could arm — an unbanded set can never plot.
    const result = await compsForAddress(facts.address, {
      topN: COMP_POOL,
      subjectSqft: money(facts.sqft) ?? null,
      subjectBeds: money(facts.beds) ?? null,
      subjectBaths: money(facts.baths) ?? null,
    }).catch(() => null);
    const spec = priceVsAreaDotSpec(facts, result?.comps ?? []);
    if (spec) {
      const accent = doc.globalStyle.accentColor || "#B98F45";
      const tint = accent.replace(/[^0-9a-fA-F]/g, "").slice(0, 6) || "x";
      // The subject discriminator (final-review fix, 07/16/2026) — see streetSlug's own
      // doc comment for the collision this closes.
      // THE KEY IS CONTENT-STAMPED (08/09/2026). email-media is cached immutable, so
      // `{hash}` becomes the sha1 of the RENDERED PNG inside chartSpecToEmailImage —
      // not a spec hash. A spec hash was the first fix and missed a renderer change
      // the same night (same spec, new drawing, same key, stale edge cache forever).
      // Same house + same pixels still lands one stable key (deterministic).
      const key =
        `email-charts/price-reduced-${facts.zip ?? "swfl"}-` +
        `${streetSlug(facts.address)}-${spec.asOf}-${tint}-{hash}.png`;
      // NO block caption — the PNG already bakes in the title, source and as-of date; a
      // text caption would duplicate it (mirrors market-comps.ts's own chart fill).
      const image = await chartSpecToEmailImage(
        spec,
        accent,
        key,
        doc.globalStyle.fontFamily,
      ).catch(() => null);
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

  // ── THE PARAGRAPH RIDES THE WALKED NARRATOR LANE (rebuilt 08/09/2026) ────────
  //
  // The July draft hard-returned here without a paid-row description, shipping a
  // ZERO-word body — below the playbook's 50-word floor, and a divergence from every
  // walked sibling (new-listing's acceptance run ships a sourced house paragraph on
  // the SAME no-remarks house class). That July decision was made by looking at what
  // the model wrote when handed the bare record — three inventions — but it predates
  // what the shared narrator has since become: a settled-facts anchor list (record +
  // $/sqft + DOM + HOA + community/inside-the-gate/nearby-amenity lanes), the claim
  // gate that DROPS any paragraph making a claim it was not given, and the
  // descriptionRendered contract. The guard against invention is the GATE now, not
  // silence. A gate drop takes only the model's connective — the code-owned bank
  // sentences below still ship (never refused, never invented, RULE 0.7's posture);
  // with no bank sentence either, the slot stays open.

  // ── WHAT THE NARRATOR MAY DRAW FROM ──────────────────────────────────────────
  // authorListingNarrative hands it the record AND the agent's pasted description as
  // lane-2 truth — the description is the SOURCE, the record only keeps it honest. The
  // framing is where THIS recipe earns its keep: it is the only recipe whose subject is
  // a number that MOVED, and "why did it move" is the one question nothing we hold can
  // answer.
  const reduced = Boolean(kicker);
  const hasRemarks = Boolean(facts.remarks?.trim());
  // The source bullet follows what we actually hold — telling the model a description
  // is "your source" when none exists is a false premise (the shared narrator's own
  // descriptionRendered lesson, measured on Just Sold 08/06/2026).
  const sourceBullet = hasRemarks
    ? "• THE AGENT'S OWN DESCRIPTION IS YOUR SOURCE. Pull the specifics from it — the setting, " +
      "the rooms, the finishes, the standout features — and tighten them. Keep them TRUE: " +
      "restate what it actually said, never an upgraded version of it.\n"
    : "• YOUR SOURCE IS THE RECORD AND THE VERIFIED NEARBY FACTS in the settled lines you were " +
      "given — the community, what's inside the gate, what's genuinely close by. Describe what " +
      "a buyer actually gets from those facts alone; a fact not in those lines does not exist.\n";
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
      sourceBullet +
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
      "your source above. That IS what the new price means. Describe the house."
    : // The vendor does not flag this house as reduced, and we hold no previous price.
      // The strip renders the cut cells as OPEN SLOTS for the agent; the narrator is told
      // NOTHING about a cut, because a framing that says "lead with the reduction" when
      // there is no sourced reduction is an invitation to invent one.
      "A listing update for a home on the market. The asking price shown is its CURRENT " +
      "price.\n" +
      "• YOU WERE NOT TOLD THE PRICE CHANGED. No record we hold says it did. Never write that " +
      "the price was reduced, improved, cut, adjusted or lowered; never name a previous price; " +
      "never imply the number moved.\n" +
      "• Describe the home itself, from the facts" +
      (hasRemarks ? " and the agent's own description." : " you were given, and nothing else.");

  // ── THE SENTENCE BANK (spec 2026-08-10-sentence-banks-design.md) ─────────────
  // Code-owned fact sentences open the paragraph; the model NEVER sees them as
  // rewritable text — it only ADDS connective after them, and the claim gate keeps
  // gating its additions exactly as before. The bank now owns the ONE legal mention
  // of the move, so the framing must forbid the model restating it in any words.
  const bank = bankFor("price-reduced");
  const bankFilled = bank ? fillSentences(bank, bankValues(facts)).filled : [];
  // The addendum SUPERSEDES the framing's "you may refer ONCE" bullet by name — without
  // that sentence the prompt told the model both "once" and "never" about the same move
  // (second-order audit 08/09/2026, finding 2.1: a live self-contradiction on every
  // reduced build).
  const bankAddendum = bankFilled.length
    ? "\n• THESE SENTENCES ALREADY OPEN THE PARAGRAPH (fixed copy, not yours to repeat, " +
      "rephrase, or contradict): " +
      bankFilled.map((s) => `"${s}"`).join(" ") +
      "\n• THIS SUPERSEDES THE 'ONCE, IN PLAIN WORDS' PERMISSION ABOVE: the one permitted " +
      "mention of the price move is already written. You may NOT mention the move at all — " +
      "not the new price, not the previous price, not that anything changed."
    : "";

  // TWO attempts, same as back-on-market's NARRATOR_ATTEMPTS: the claim gate legitimately
  // drops an inventing paragraph (measured on this recipe's first live walk run 08/09/2026:
  // an invented "2022" year and a "since the listing" sequence) and one clean re-ask is a
  // bounded, recorded spend — never a loop. Both drop → the CONNECTIVE stays out; the
  // code-owned bank sentences still ship (the baked lane, RULE 0.7b), and with no bank
  // the slot stays OPEN. The gate is never lowered to fill anything.
  let narrative: string | null = null;
  for (let attempt = 0; attempt < 2 && !narrative; attempt++) {
    narrative = await authorListingNarrative(facts, {
      framing: framing + bankAddendum,
      // The previous price is THIS recipe's own derivation. Pre-bank, it was anchored so a
      // single legal mention could survive the claim gate (the Just Sold lesson). With the
      // bank's cut sentence on the page the addendum forbids the model the move ENTIRELY,
      // so the anchor only rides along when no bank sentence fired — whitelisting a claim
      // the same prompt bans would be the 2.1 contradiction back in anchor form.
      ...(previous && !bankFilled.length
        ? { anchors: [`The previous asking price was ${previous}.`] }
        : {}),
      // The chrome ships the verbatim description block only when we hold remarks — tell the
      // narrator the truth about what the reader can see.
      descriptionRendered: hasRemarks,
    }).catch(() => null);
  }

  // CODE assembles: bank first, connective after. The model never touched the bank words.
  const paragraph = [...bankFilled, narrative ?? ""].join(" ").trim();

  // FLOOR GUARD (spec FM7; emails.md §0.1 — the floor bites harder than the ceiling).
  // Previously enforced NOWHERE in the build path (verified 08/09/2026). Under 50 words
  // is logged LOUDLY, never padded and never blocked — the grid still carries the email;
  // the log is what makes the shortfall visible (T8's lesson: a silent drop looks like
  // nothing being wrong).
  if (paragraph && bodyWordCount(paragraph) < 50) {
    console.error(
      `[price-reduced] body ${bodyWordCount(paragraph)} words — under the 50-word floor ` +
        `(bank ${bankFilled.length} sentence(s), connective ${narrative ? "ran" : "dropped"})`,
    );
  }
  if (paragraph) doc = fillNarrative(doc, paragraph);

  return doc;
}
