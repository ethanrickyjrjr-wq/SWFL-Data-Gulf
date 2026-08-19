// lib/deliverable/recipes/shared.ts
//
// The pieces EVERY recipe builder shares. These moved out of build-doc.ts so a
// builder can import them without a cycle (build-doc dispatches INTO the builders).
//
// THE RULE THEY EXIST TO ENFORCE (playbook Part 3, rule 1): resolve the subject
// ONCE, from a real record, before any layout happens. The five listing-lifecycle
// recipes are the SAME resolved house wearing different hats — they differ in
// framing, cells, chart and prose, never in how the house is found.
//
//   *** DO NOT WRITE A SECOND RESOLVER. ***
//
// If your recipe needs a fact the resolver doesn't return, check first whether we
// are already fetching it and throwing it away — `lotSize` and `propertyType` were
// in the vendor row and never mapped; `baths` was on an endpoint we already call.
// Both rendered as empty labels over data we held.

import { getAnthropic } from "@/refinery/agents/anthropic.mts";
import { EMAIL_MODEL_SONNET } from "@/lib/email/model-router";
import { resolveSubjectListing } from "@/lib/listings/resolve-subject";
import { mirrorHeroPhoto } from "@/lib/media/hero-photo";
import { fillFromPaidRecord, NO_FILL } from "@/lib/listings/paid-record-lane";
import {
  fetchApifyPropertyByAddress,
  fillFactsFromFreshRow,
  seedFactsLocationFromAddress,
} from "@/lib/listings/apify-property-lookup";
import { listingDescriptionFromPrompt } from "@/lib/email/listing-intent";

import { auditClaims, numeralsIn, CLAIM_PROHIBITION } from "@/lib/deliverable/claims";
import { communitySourceLine } from "@/lib/listings/listing-detail";
import { pricePerSqft } from "@/lib/email/listing-flyer";
import {
  neighborhoodAmenitiesSourceLine,
  resolveNeighborhoodForListing,
} from "@/lib/listings/neighborhood-amenities";
import {
  resolveCommunityForListing,
  neighborhoodStatsSourceLine,
} from "@/lib/listings/community-lookup";
import {
  resolveInsideTheGate,
  insideTheGateSourceLine,
} from "@/lib/listings/community-inside-the-gate";
import type { ListingFacts } from "@/lib/email/listing-scrape";
import type { EmailDoc } from "@/lib/email/doc/types";

/**
 * THE ONE SHARED FRAMING BLOCK — pasted VERBATIM (never paraphrased) into the system
 * prompt of every narrator whose job is stating facts about a property or a price:
 * `authorListingNarrative` (this file) and `buildNarratorPrompt` (recipes/market-comps.ts).
 *
 * **Was three.** `authorUnderContractNote` (recipes/under-contract.ts) was the third and died
 * with the July under-contract recipe, rewritten new 08/06/2026. The replacement carries no
 * narrator prompt of its own — it calls `authorListingNarrative`, so it INHERITS this block
 * instead of pasting a second copy. That is the preferred shape for any new recipe: one more
 * verbatim paste is one more place this can silently drift.
 *
 * NEVER pasted into `authorAreaRead` (agent-brand-intro.ts) or `LETTER_SYSTEM`
 * (agent-launch.ts) — both carry an absolute no-numbers/no-facts constraint this
 * block would directly contradict ("numbers beat adjectives" inside a prompt that
 * says "not one digit, anywhere" is not inert, it's a conflicting instruction). See
 * docs/superpowers/specs/2026-07-15-sell-side-favorable-framing-design.md §3/§4/§4a.
 *
 * Every rule here traces to _ASSISTANT/research/2026-07-15-sell-side-copywriting-research.md
 * and _ASSISTANT/research/2026-07-15-authority-reasoning-not-hype-research.md — real,
 * named sources, not invented style guidance.
 */
export const FAVORABLE_FRAMING_POLICY =
  `<favorable_framing_policy>\n` +
  `PRIORITY, STATED FIRST: cited facts — including unfavorable ones, a real price cut, ` +
  `a slow-selling comparable — are never dropped, softened, or omitted. This policy ` +
  `governs the EMPHASIS AND ORDERING of true facts. It never governs which facts appear.\n\n` +
  `Write for someone deciding whether to act on this property or this agent. Write like ` +
  `the person with the most data in the room, not like someone selling something:\n` +
  `- Benefit rides on the fact; it never replaces it. State the sourced number, then ` +
  `attach the one concrete thing it lets the reader do.\n` +
  `- Lead with a confirmed strength before any limitation.\n` +
  `- When you must acknowledge a less-favorable data point, name the specific factual ` +
  `difference — never drop it silently and never go vague.\n` +
  `- Numbers beat adjectives, categorically. A specific, sourced figure always outranks ` +
  `a descriptive word standing in for it.\n` +
  `- When the facts you were given show a LARGE gap, state its size directly and plainly. ` +
  `Do not soften a big, sourced number into hedge language ("somewhat," "a bit," "in the ` +
  `neighborhood of") — the size of the gap is the case on its own. This applies IDENTICALLY ` +
  `whichever direction the number points: a big gap is not more "sayable" just because it ` +
  `happens to favor the subject.\n` +
  `- No steering language, no describing who "should" want this property.\n` +
  `- Never a superlative or intensifier — "unbeatable," "guaranteed," "won't last," "a rare ` +
  `opportunity" remain forbidden, exactly as they always were.\n\n` +
  `WORKED EXAMPLES.\n` +
  `Weak (hedged, buries a real number): "The price is somewhat below what similar homes ` +
  `have been asking."\n` +
  `Strong (favorable, still 100% sourced, same underlying fact): "The asking price sits ` +
  `$91,000 below every comparable home in the set."\n\n` +
  `Weak (an adjective standing in for a fact): "This is an unbeatable price."\n` +
  `Strong: state the sourced figure and stop there — the number is the whole argument, not ` +
  `an adjective layered on top of it.\n\n` +
  `COUNTER-EXAMPLE — favorable framing tipping into invention (forbidden): "This home is a ` +
  `better value than anything else in the neighborhood." That is an unsourced comparison to ` +
  `homes you were never shown — the same violation this prompt has always forbidden, dressed ` +
  `up as enthusiasm instead of a market claim.\n` +
  `</favorable_framing_policy>`;

import type { RenderComp } from "@/lib/assistant/comp-helper";

/** A comp is a HOME iff the vendor gave us beds AND sqft AND a price. Anything else is
 *  bare land (or unpriced) and can never sit on a chart beside a house. Extracted here
 *  (copy #2 — was private in market-comps.ts, price-reduced.ts needs the same rule)
 *  per "one authority per shared concept". */
export function isComparableHome(c: RenderComp): boolean {
  return c.beds != null && c.sqft != null && c.sqft > 0 && c.price != null && c.price > 0;
}

/** Price ÷ square feet, rounded. Null unless BOTH parts are real (never back-solved). */
export function perSqft(price: number | null, sqft: number | null): number | null {
  if (price == null || sqft == null || sqft <= 0) return null;
  const v = Math.round(price / sqft);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** The median of a numeric set. Even count → the mean of the two middle values. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.swfldatagulf.com";

/** The resolved subject house, plus whether the vendor actually matched it. */
export interface ResolvedSubject {
  facts: ListingFacts;
  /** False = we fell back to an address-only skeleton. The grid still lands (never
   *  refuse — RULE 0.7); every cell is simply an open slot for the user to fill. */
  resolved: boolean;
}

/**
 * THE ONE SUBJECT RESOLVER for every address-spine recipe.
 *
 * geocode (Mapbox) → Lee (12071) / Collier (12021) gate → vendor `/search` by
 * address slug → match on canonicalized street line → one extra call for the bath
 * count. Then: mirror the hero photo into OUR storage so a re-send months later
 * doesn't depend on the vendor CDN, and take the agent's pasted listing copy as
 * lane-2 truth (no vendor sells us MLS remarks — all 18 endpoints checked
 * 07/13/2026, and realtor.com blocks the page, so the agent IS the source).
 *
 * NEVER REFUSES. A resolve miss returns an address-only fact set so the branded
 * grid always lands on the canvas with open slots, never a blank page and never an
 * invented number.
 */
// A 5-digit ZIP, optionally with a +4 suffix, read from the LAST comma-segment of the raw
// address string (typically "..., FL 34102") -- independent of geocoding, so this can run
// in PARALLEL with the vendor listing lookup below rather than waiting on its result. Only
// searches the last segment, not the whole string, so a 5-digit HOUSE NUMBER (e.g.
// "10500 Main St, Naples, FL 34102") is never mistaken for the ZIP.
function zip5From(address: string): string {
  const lastSegment =
    String(address ?? "")
      .split(",")
      .pop() ?? "";
  const m = /\b(\d{5})(?:-\d{4})?\b/.exec(lastSegment);
  return m ? m[1] : "";
}

export interface ResolveSubjectSeams {
  /** Injectable so tests never reach the guarded live runner. Default is the
   *  real by-address buy (lib/listings/apify-property-lookup.ts). */
  lookupPaidRecord?: typeof fetchApifyPropertyByAddress;
}

export async function resolveSubject(
  address: string,
  prompt: string,
  seams: ResolveSubjectSeams = {},
): Promise<ResolvedSubject> {
  const zip = zip5From(address);
  const [hit, communityForListing] = await Promise.all([
    resolveSubjectListing(address).catch(() => null),
    zip ? resolveCommunityForListing(address, zip).catch(() => null) : Promise.resolve(null),
  ]);
  const facts: ListingFacts = hit ?? { address, photos: [], sourceUrl: BASE_URL };
  // A resolve miss leaves BARE facts — no city, no ZIP — and the paid-cache key
  // below needs street + city to exist at all. Seed absent cells from the typed
  // text, or the already-bought row for a non-SWFL address is invisible and
  // every rebuild of the same address re-buys it (the RULE 0.7a defect).
  seedFactsLocationFromAddress(facts);
  if (communityForListing && (communityForListing as { matched: boolean }).matched) {
    const c = communityForListing as {
      matched: true;
      subdivisionName: string;
      homeCount: number | null;
      medianJustValue: number | null;
      countByType: Record<string, number> | null;
      sourceUrl: string;
      asOf: string | null;
    };
    facts.communityStats = {
      subdivisionName: c.subdivisionName,
      homeCount: c.homeCount,
      medianJustValue: c.medianJustValue,
      countByType: c.countByType,
      sourceUrl: c.sourceUrl,
      asOf: c.asOf,
    };
  }

  // LANE 2 — the agent's own words. Never overwrites a description the record
  // already carries; it fills the gap the feed leaves.
  if (!facts.remarks) {
    const pasted = listingDescriptionFromPrompt(prompt);
    if (pasted) facts.remarks = pasted;
  }

  // AROUND THIS HOME — the vendor's neighborhood + what sits within its amenity
  // radius, off this listing's OWN coordinates (no name typed, no vendor call). Runs
  // in parallel with the photo mirror; both are best-effort and neither can fail a
  // build. Needs lat/lon, so it is silently absent for an unresolved address —
  // which is correct: no coordinates, no honest community claim.
  const [mirrored, neighborhood] = await Promise.all([
    facts.photos[0] ? mirrorHeroPhoto(facts.photos[0]).catch(() => null) : Promise.resolve(null),
    facts.lat != null && facts.lon != null
      ? resolveNeighborhoodForListing({ lat: facts.lat, lon: facts.lon }).catch(() => null)
      : Promise.resolve(null),
  ]);
  if (mirrored) facts.photos[0] = mirrored;
  if (neighborhood) facts.neighborhood = neighborhood;

  // INSIDE THE GATE — the third community layer, and the one that never reached an email
  // built from a typed address. It keys off the subdivision the tax-roll lookup just
  // resolved, so it costs one indexed single-row read on a table we already hold and
  // cannot drift onto a different name for the same place. A miss is NORMAL (81 profiles
  // against 20,400 subdivisions) and a miss keeps the narrator's golf/pool/gate
  // prohibition switched ON, which is the correct default.
  if (facts.communityStats?.subdivisionName) {
    const gate = await resolveInsideTheGate(facts.communityStats.subdivisionName).catch(() => null);
    if (gate) facts.insideTheGate = gate;
  }

  // LANE 3 — THE PAID ROW WE ALREADY OWN. Every email starts at the same spot, so
  // this sits HERE and not in any one recipe. Gap-fill only: the full MLS description,
  // the 9-to-55-photo gallery, the bath count (the only source at all for a Collier
  // listing), and an HOA fee that is greater than zero. It spends nothing — the row
  // was bought already — and it runs LAST so neither the live record nor the agent's
  // own pasted words can be overwritten by it. Runs after the mirror on purpose: the
  // hero stays our mirrored copy and the vendor gallery lands behind it.
  const paid = await fillFromPaidRecord(facts).catch(() => ({ ...NO_FILL }));

  // LANE 3b — THE LIVE BY-ADDRESS BUY (storefront decree 08/10/2026: ANY address,
  // filled through the Apify rung). Reached when the free spine missed AND no
  // already-bought row exists — OR (amended same night, operator: "THAT IS EXACTLY
  // WHEN APIFY SHOULD FUCKING RUN", on a Coming Soon that shipped "+ Add" for
  // baths on a house the feed otherwise held) when the subject RESOLVED but the
  // spec strip still has a hole (beds, baths, or sqft) after the free spine and
  // the cached row. That is rung 3 of RULE 0.7a read precisely: one call for one
  // NAMED missing field, never a routine step — a subject with a full strip never
  // reaches this line, and a cached row that exists but lacks the field does not
  // re-buy (bought once, read forever). One call, one result, behind the spend
  // switch (OPERATOR_APPROVED_PAID_RUN); the row saves through the ONE write
  // root, so the NEXT build of this address is a cache READ above. On a miss the
  // fresh row may fill the moving facts (ask, DOM) precisely because it is
  // seconds old; on a resolved subject every fill below is gap-only
  // (fillFactsFromFreshRow rides fillFromPaidRecord's fill-only contract, and
  // price fills only when absent), so the live feed's ask can never be clobbered
  // by the vendor's.
  const specGap = !facts.beds || !facts.baths || !facts.sqft;
  if (!paid.rowFound && (!hit || specGap)) {
    const lookup = seams.lookupPaidRecord ?? fetchApifyPropertyByAddress;
    const fresh = await lookup(address).catch(() => null);
    if (fresh) {
      const heroBefore = facts.photos[0];
      await fillFactsFromFreshRow(facts, fresh).catch(() => undefined);
      // The pull's hero is a vendor CDN URL — mirror it like every other lane's
      // hero, so a re-send months later doesn't depend on the vendor keeping it.
      // Only a hero the FRESH ROW just contributed: a resolved subject's hero was
      // mirrored above already, and re-mirroring a mirror is a wasted write.
      if (facts.photos[0] && facts.photos[0] !== heroBefore) {
        const mirroredHero = await mirrorHeroPhoto(facts.photos[0]).catch(() => null);
        if (mirroredHero) facts.photos[0] = mirroredHero;
      }
      return { facts, resolved: true };
    }
  }

  // `resolved` documents "not an address-only skeleton". A cached paid row that
  // joined THIS address settles identity and fills the spec cells, so it counts —
  // otherwise a rebuild of a bought address would re-trigger every "paste your
  // listing link" fallback its first build already answered.
  return { facts, resolved: Boolean(hit) || paid.rowFound };
}

/** Drop an unfilled chart slot, AND CLOSE THE HOLE IT LEAVES.
 *
 *  An EMPTY CHART BOX IS WORSE THAN NO CHART — if your recipe's chart policy is
 *  "none", or its chart failed to resolve, call this. A chart is a bonus, never a
 *  blocker, and never a reason to refuse a build.
 *
 *  The original only FILTERED. Blocks carry absolute grid positions, so removing a
 *  5-row chart from the middle of the flyer left a 5-row VOID between the description
 *  and the agent card — and since New Listing drops its chart by design, that void
 *  was in the one deliverable we had shipped. Filtering a positioned block is not the
 *  same as removing it; everything below has to come up. */
export function dropEmptyChartSlot(doc: EmailDoc): EmailDoc {
  const isEmptyChart = (b: EmailDoc["blocks"][number]) =>
    b.type === "image" && b.props.kind === "chart" && !b.props.url;

  const dropped = doc.blocks.filter(isEmptyChart);
  if (dropped.length === 0) return doc;

  const kept = doc.blocks.filter((b) => !isEmptyChart(b));
  return {
    ...doc,
    blocks: kept.map((b) => {
      if (!b.layout) return b;
      // Everything strictly BELOW a removed block rises by that block's height. A
      // block sharing the removed row (a multi-column sibling) must NOT move.
      const rise = dropped.reduce((sum, d) => {
        const dy = d.layout?.y ?? 0;
        const dh = d.layout?.h ?? 0;
        return b.layout!.y >= dy + dh ? sum + dh : sum;
      }, 0);
      return rise > 0 ? { ...b, layout: { ...b.layout, y: b.layout.y - rise } } : b;
    }),
  };
}

/** Fill the FIRST EMPTY text block (the commentary slot) with the paragraph.
 *
 *  LANDMINE: this SKIPS a text block that already has content. A skeleton that
 *  prefills the commentary slot with raw remarks will therefore keep them — and
 *  2,000 characters of raw MLS copy ships instead of authored prose. CLEAR the slot
 *  first, then author. This cost real time on 07/13. */
/** The description marker, read WITHOUT narrowing the block type.
 *  `isDescriptionBlock` is a type predicate (`b is BlockOf<"text">`), so negating it
 *  inside a branch already narrowed to `text` collapses the else-side to `never` and the
 *  file stops compiling. Reading the prop directly keeps both passes type-safe. */
function isDescriptionSlot(props: unknown): boolean {
  return (props as { descriptionSlot?: boolean } | null)?.descriptionSlot === true;
}

export function fillNarrative(doc: EmailDoc, body: string): EmailDoc {
  let done = false;
  return {
    ...doc,
    blocks: doc.blocks.map((b) => {
      if (done || b.type !== "text" || isDescriptionSlot(b.props) || (b.props.body ?? "").trim()) {
        return b;
      }
      done = true;
      return { ...b, props: { ...b.props, body } };
    }),
  };
}

/** Clear every text block so `fillNarrative` can actually write into it —
 *  EXCEPT the listing's own description.
 *
 *  *** THE DESCRIPTION SLOT IS NOT A NARRATIVE SLOT, AND THIS IS WHAT ENFORCES IT. ***
 *  `isDescriptionBlock` has existed since 08/03/2026 with a test saying it exists "so a
 *  narrative pass can skip it" — but nothing here actually checked it, so the skip was a
 *  claim, not a behaviour. That is why the description could not simply be RESERVED in
 *  the chrome next to the stats strip where it belongs: an empty reserved slot would be
 *  blanked here and then overwritten with the narrator's paragraph by `fillNarrative`.
 *  The workaround was to splice the block in afterwards, which hand-positioned it and
 *  landed it at the bottom of the email, under the CTA and the sources line — which is
 *  what the operator opened on his phone on 08/04/2026.
 *
 *  With the marker honoured, the slot is reserved through the layout seam like every
 *  other block, and neither pass touches it. */
export function clearNarrativeSlots(doc: EmailDoc): EmailDoc {
  return {
    ...doc,
    blocks: doc.blocks.map((b) =>
      b.type === "text" && !isDescriptionSlot(b.props)
        ? { ...b, props: { ...b.props, body: "" } }
        : b,
    ),
  };
}

/**
 * The property paragraph — one constrained call, built from ONLY the real record.
 *
 * THE MODEL WRITES PROSE. NOTHING ELSE (playbook Part 3, rule 4). Not layout, not
 * which cells exist, not numbers. And prose is only as good as what you hand it:
 * handed the spec cells and told "use only these facts", the only sentence it can
 * write is the cells read back — which is exactly what it wrote, printed under a
 * grid that already said the same thing.
 *
 * A FACT ABOUT THE HOME IS NOT ONLY A NUMBER. A view, a waterfront, a pool, a
 * renovation, a school, a finish is equally an invention if it wasn't given. (The
 * model once guessed "waterfront character" and happened to be RIGHT. Guessing
 * correctly is luck, not sourcing.)
 *
 * Best-effort: nothing real to say, or any failure → null, and the slot stays an
 * OPEN SLOT for the user to fill. Never invents.
 *
 * `framing` is how YOUR recipe wears the hat — the one thing that differs between
 * the lifecycle emails. Pass the sentence that says what this email is (a teaser
 * that must not name the street; a sold announcement; a price improvement).
 */
export async function authorListingNarrative(
  facts: ListingFacts,
  opts: {
    framing?: string;
    context?: string;
    /**
     * EXTRA SETTLED FACTS THIS RECIPE COMPUTED, which `ListingFacts` has no field for.
     * Each string is handed to the model AND registered with the claim gate, exactly like
     * the `$/sq ft` line below — so its numerals stop being "unanchored".
     *
     * WHY THIS EXISTS (measured 08/06/2026, first Just Sold acceptance run). A fact stated
     * only in `framing` is shown to the model but is NOT settled, so the gate correctly
     * kills the paragraph for repeating it. Just Sold's framing handed the narrator a
     * RECORDED close and its date — both real, both sourced, neither on `ListingFacts` —
     * and the run dropped with `unanchored-number("08"), ("29"), ("2025")`. The framing
     * itself induced the drop: the email whose entire job is one number was forbidden to
     * mention it. **A fact you want the narrator to state goes HERE, not in the framing.**
     * The gate is not weakened — an anchor is a sentence CODE authored, same as every
     * other settled line.
     */
    anchors?: string[];
    /**
     * Does the reader actually SEE the listing's own description on this email?
     *
     * Default TRUE — every lifecycle email ships it in its own reserved block. **Just Sold does
     * not** (a for-sale pitch is stale the moment the house closes), and the system prompt below
     * used to assert the block was there regardless. Pass `false` when your recipe suppresses it,
     * or the narrator will write sentences that point the reader at a block that is not on the page.
     */
    descriptionRendered?: boolean;
    /**
     * TRUE ONLY FOR OPEN HOUSE. Every other caller (New Listing, Just Sold, Price Reduced) is
     * a FOR-SALE PITCH — "should you act on this" — and the default system prompt below is
     * built for exactly that job: mine the facts the seller's copy leaves out (days on market,
     * HOA, $/sq ft, neighborhood value) and say what they mean for a BUY decision.
     *
     * An open house is not a buy decision, it is an RSVP to walk through a house. Crawled
     * real open-house invite copy (theclose.com, maestrolabs.com, 08/06/2026 — RULE 0.4) is
     * uniformly two sentences: "we warmly invite you... we look forward to giving you a tour."
     * None mention days on market, HOA cost, or "terms." Live proof of the default prompt
     * misapplied here, same day: it wrote *"this home came to market roughly two months ago,
     * which gives a buyer walking through today real room to have a conversation about
     * terms... the $1,229 monthly HOA is worth factoring into carrying costs before the
     * visit"* — negotiating-leverage coaching on an INVITATION. Operator: *"We are talking
     * about an invitation to a fucking open house... What the fuck are you doing?"*
     *
     * `invitation: true` swaps the "write what the description doesn't say" analytical
     * directive for one built from that research: warm, direct, describes what a VISITOR will
     * see and feel walking through — never a data point standing alone, never a cost or a
     * market fact. Community/neighborhood/area sub-rules are unchanged — "the pool is a short
     * walk away" is a reason to come, not a market claim.
     */
    invitation?: boolean;
  } = {},
): Promise<string | null> {
  // Nothing real to describe → leave the slot empty (never improvise a house).
  if (!facts.price && !facts.beds && !facts.sqft) return null;
  const lines = [
    facts.address && `Address: ${facts.address}`,
    facts.price && `List price: ${facts.price}`,
    facts.beds && `Beds: ${facts.beds}`,
    facts.baths && `Baths: ${facts.baths}`,
    facts.sqft && `Square feet: ${facts.sqft}`,
    // THE SAME $/SQFT THE SPEC GRID ALREADY SHOWS (`pricePerSqft`, listing-flyer.ts) — handed
    // here as its OWN settled anchor. Without this line the model still computes it (price and
    // square feet are both given, and it's the single most natural thing to say about a listing),
    // and the claim gate correctly treats an unstated-but-derivable number as unanchored and
    // throws the WHOLE paragraph away. Reproduced live 08/05/2026: `[narrative] DROPPED — the
    // narrator made 1 claim(s) it was not given: unanchored-number("231")` — on a real house
    // where every other lane succeeded. Anchoring the figure here fixes the false trip without
    // weakening the gate against an actually-invented claim (a view, a pool, a school).
    pricePerSqft(facts.price, facts.sqft) &&
      `Price per square foot: ${pricePerSqft(facts.price, facts.sqft)} (already shown in the ` +
        `spec grid above your paragraph — do not restate it as a bare figure).`,
    facts.lotSize && `Lot: ${facts.lotSize}`,
    facts.propertyType && `Type: ${facts.propertyType}`,
    facts.yearBuilt && `Year built: ${facts.yearBuilt}`,
    // THE THREE FACTS A SELLER'S DESCRIPTION ALMOST NEVER CARRIES — and the ones this
    // paragraph is now told to write ABOUT rather than around. They were missing from this
    // list entirely, so the instruction "say what the description doesn't" would have had
    // nothing to say it WITH, and an instruction without material is an invitation to invent.
    // They are also what makes each figure legal under the claim gate below: `auditClaims`
    // only permits numerals that appear in these settled lines.
    facts.daysOnMarket != null &&
      `Days on the market so far: ${facts.daysOnMarket} (an exact count from our own records, not an estimate).`,
    facts.hoaFee != null &&
      `HOA fee: $${Math.round(facts.hoaFee).toLocaleString("en-US")} per month.`,
    facts.city && `City: ${facts.city}`,
    facts.zip && `ZIP: ${facts.zip}`,
    facts.isNewConstruction && `This is NEW CONSTRUCTION (vendor-stated).`,
    facts.isPriceReduced &&
      facts.priceReduction &&
      `The price was REDUCED by ${facts.priceReduction} from its original ask.`,
    // THE WHOLE DESCRIPTION, NOT ITS FIRST 1,200 CHARS (fixed 08/10/2026). The old
    // slice fed the model AND the claim gate the same cut, so every feature past it —
    // the pool, the lanai, the amenity list of a 2,263-char Naples listing — was both
    // invisible fuel and an illegal word: the model, told to describe a home it could
    // half-see, improvised the missing half and the gate correctly dropped the
    // paragraph. Fuel clipping was manufacturing invention. Real MLS remarks run
    // ~3,000 chars (apify-comps.ts); 6,000 is prompt-size control, not a fuel cut.
    facts.remarks && `The listing's own description: ${facts.remarks.slice(0, 6000)}`,
    // THE COMMUNITY — golf, pool, gated, clubhouse — off the listing's own detail page, which
    // `fetchListingFacts` already had in hand. Every recipe on this shared narrator (new-listing,
    // just-sold, open-house, price-reduced) gets it from this one line. Absent when we could not
    // read the page — and absent must stay SILENT: the HARD RULES below gate the vocabulary on
    // this fact being present, so "no community line" means the model may not mention golf at all,
    // NOT that the community lacks it.
    communitySourceLine(facts.community),
    // INSIDE THE GATE, from our own community_profiles table — the layer that reaches an
    // email built from a typed address, where `communitySourceLine` above only ever fires
    // on the pasted-URL lane. Same lifting rule: present → the narrator may name golf/pool/
    // gate; absent → the blanket prohibition below stays on.
    insideTheGateSourceLine(facts.insideTheGate),
    neighborhoodStatsSourceLine(facts.communityStats),
    // AROUND the home — nearby businesses in the vendor's radius. The line carries its
    // own prohibition (never "the community has/includes/features", never on-site,
    // never resident-only) because that distinction is the whole risk of this fact.
    // `communityHasGolf` wires the in-gate lanes INTO it (operator decree 08/10/2026:
    // "IF THEY LIVE IN A GOLF COMMUNITY, GOLF IS RIGHT FUCKING THERE") — when either
    // community lane states golf, the nearby-golf rows are dropped at the root so the
    // narrator can never tell a golf-community reader how far away golf is.
    neighborhoodAmenitiesSourceLine(facts.neighborhood, {
      communityHasGolf: facts.insideTheGate?.golf === true || facts.community?.hasGolf === true,
    }),
    // The recipe's own code-computed facts — settled exactly like every line above.
    ...(opts.anchors ?? []),
    opts.context && `Background context (NOT the subject of this email):\n${opts.context}`,
  ].filter(Boolean);

  // ROLE + VOICE over prohibition-piling (08/10/2026 polish decree — "TALKS LIKE AI").
  // The prompt below was a wall of bans with no voice model, and the paragraphs read
  // like a model: "which softens the inland trade-off the listing's own copy
  // acknowledges" shipped live. Anthropic's own prompting guide (crawled 08/10/2026,
  // RULE 0.4): "Examples are one of the most reliable ways to steer Claude's output
  // format, tone, and structure" and "Setting a role in the system prompt focuses
  // Claude's behavior and tone… Even a single sentence makes a difference." The AI
  // tells banned in SOUND LIKE A PERSON below are the measured ones from Wikipedia's
  // signs-of-AI-writing catalog (same crawl): marketing verbs standing in for "has",
  // negative parallelisms ("not just X, but Y"), rule-of-three lists, and
  // significance-summing final clauses.
  const system =
    `You are a Southwest Florida real-estate agent writing to your own contact list — ` +
    `people who know you. You write the short paragraph under the photo, and you write ` +
    `it the way you would say it out loud to a neighbor: plain words, short sentences ` +
    `(a third-grader could read them), warm and specific. Two to four sentences.\n\n` +
    (opts.framing ? `WHAT THIS EMAIL IS: ${opts.framing}\n\n` : "") +
    `THIS EMAIL IS ABOUT THE HOUSE. Not the market, not the comps. A buyer reading it ` +
    `wants to know what this property IS.\n\n` +
    // *** THE DESCRIPTION IS ALREADY ON THE PAGE. DO NOT REWRITE IT. ***
    //
    // This instruction used to read "the description IS THE SOURCE OF TRUTH and your job is
    // to TIGHTEN it into email prose." That was correct while the description never shipped —
    // the paragraph WAS the description, cleaned up. On 08/05/2026 the description got its own
    // verbatim block directly above this paragraph, and this line was not changed with it, so
    // the reader got the same sentences twice: once in the seller's words, once paraphrased.
    // Operator: *"why the fuck would the commentary repeat what was said up top!!!"*
    //
    // Adding a block changed this writer's job. That is the second-order check that was
    // skipped, and this is the correction.
    // WHETHER THE DESCRIPTION IS ACTUALLY ON THE PAGE IS NOT UNIVERSAL — measured 08/06/2026.
    // Just Sold deliberately suppresses the block (a for-sale pitch is stale once the house
    // closes), so telling its narrator the description sits "directly above your paragraph" is
    // a false premise, and it wrote to it: *"The listing description covers the interior updates
    // in full"* — pointing the reader at something that is not there. Found by rendering and
    // looking, one screenshot after the block was removed. The instruction now follows the
    // rendering instead of assuming it.
    (opts.descriptionRendered === false
      ? `*** THE LISTING'S OWN DESCRIPTION IS **NOT** ON THIS PAGE. THE READER CANNOT SEE IT. *** ` +
        `You are given it below only so you know what is true about the home. NEVER refer to "the ` +
        `listing", "the description", or "the listing description" — to the reader those point at ` +
        `nothing. Do not summarise it either: describe the home in your own words from the facts.\n\n`
      : `*** THE LISTING'S OWN DESCRIPTION IS PRINTED IN FULL, VERBATIM, DIRECTLY ABOVE YOUR ` +
        `PARAGRAPH. THE READER HAS ALREADY READ IT. *** Your job is NOT to summarise it, tighten ` +
        `it, restate it, or "pull out the highlights" — every one of those puts the same sentences ` +
        `on the page twice and is a FAILURE. Use it only to know what is already covered, so you ` +
        `can avoid it.\n\n`) +
    (opts.invitation
      ? // *** THE INVITATION BRANCH — Open House ONLY. *** Real open-house invite scripts,
        // crawled 08/06/2026 (RULE 0.4 — theclose.com, maestrolabs.com, and the operator's
        // own link, digitaldreamhomes.com/open-house-announcement-script-for-realtors)
        // converge on ONE shape: "I wanted to personally invite you to our open house this
        // Sunday from 1 to 4 PM at 123 Main Street. It's a beautifully updated 3-bedroom
        // with an open floor plan and a backyard made for entertaining. We'll have light
        // refreshments, and I'd love for you to stop by." SHORT. Warm greeting, ONE feature
        // said the way a person talks (never a computed number), then the ask.
        //
        // Two corrections landed here, both from live proof on the same subject: (1) the
        // first version asked for a full descriptive paragraph and produced a 5-6 sentence
        // essay; (2) the SECOND version banned every detail to fix that, and produced "we
        // look forward to welcoming you" with a golf-course-and-restaurant-count sentence
        // right before it that read like a GIS printout, not an invite — operator: *"No one
        // says a fucking golf course .57 miles away!!!! Just fucking invite to the fucking
        // open house."* The crawled scripts show the actual fix: not zero detail, ONE detail,
        // said in PLAIN HUMAN WORDS instead of a distance or a count.
        `THIS IS A SHORT INVITATION, NOT A DESCRIPTION. Do not re-describe the home — that is ` +
        `not your job here (see above whether the description is on the page). Model it on a ` +
        `real agent's invite: "I wanted to personally invite you to our open house at [this ` +
        `home]. It's a [ONE plain, human feature], and I'd love for you to stop by."\n\n` +
        `ONE OR TWO SENTENCES. Roughly 15-35 words. A warm greeting, AT MOST ONE feature, ` +
        `then the ask — not a paragraph, not a list, not a walk through the house.\n\n` +
        `THE ONE FEATURE, IF YOU USE ONE, MUST BE SAID THE WAY A PERSON TALKS, NEVER A NUMBER. ` +
        `"A chef's kitchen" or "sweeping golf course views" — real words from the facts or the ` +
        `description above. NEVER a mileage figure, a count ("six restaurants"), a percentage, ` +
        `or anything that reads like a data point rather than a sentence a person would say ` +
        `out loud. If the only material you have IS a number, skip the feature and just invite.\n\n` +
        `NEVER MENTION: how long the home has been on the market, the HOA fee or any carrying ` +
        `cost, price per square foot, or anything framed as a negotiating fact, a term, or ` +
        `something "worth factoring into" a decision. This is not the email that argues the ` +
        `deal.\n\n` +
        `NEVER INVENT A TIME OF DAY. You were not given when the open house happens — that is ` +
        `shown separately, in its own card, and it could be any hour. Never write "evening ` +
        `light," "sunset," "morning sun," "golden hour," or any other time-of-day or lighting ` +
        `detail — you have no way to know it will be true, and a home shown at 1pm does not ` +
        `have an evening.\n\n`
      : // THE ASSIGNMENT, REWRITTEN 08/10/2026 (operator): the old version handed the
        // narrator "the monthly HOA, what the price works out to per square foot" as
        // its material, and the live paragraph dutifully recited "$225 a month" cost
        // talk under a grid that already showed it. Costs are the agent's conversation
        // with the buyer; this paragraph sells the WANTING, and its material is the
        // GOOD around the home — the community and area fact lines below.
        `WRITE THE GOOD THE DESCRIPTION DOES NOT SAY. That is the entire assignment. The fact ` +
        `lines below carry what makes this ADDRESS worth wanting, and the seller's copy almost ` +
        `never covers it: what the community itself has (when a COMMUNITY or INSIDE THE GATE ` +
        `line is present), what sits close by — a beach, groceries, restaurants, golf (when an ` +
        `AROUND THIS HOME line is present), the shape of the neighborhood around it. Pick the ` +
        `one or two strongest and say them the way a person points something out, not the way ` +
        `a report lists it. If it just came to market, that is news you may share.\n\n` +
        `NEVER TALK ABOUT COSTS. Not the HOA fee, not taxes, not insurance, not carrying costs, ` +
        `not price per square foot, not what anything runs per month. Every cost figure is ` +
        `already in the grid above, and cost questions are a conversation for the agent to ` +
        `have in person — your paragraph is about wanting the house, never about paying ` +
        `for it.\n\n` +
        `NEVER A NEGATIVE. You are writing so someone wants to see this house. Never name a ` +
        `drawback, a trade-off, a compromise, or anything to "factor in" or "keep in mind". ` +
        `Never frame the location by what it is far from — if the home sits inland, say what is ` +
        `close, and stop. No concessions in any form: "even though", "although", "despite" all ` +
        `frame a fact as a drawback, and none of them belong in this paragraph. And never ` +
        `restate as a concession something the seller's copy states as a strength.\n\n` +
        `If the description is ABSENT, then and only then describe the home itself — lead with what ` +
        `is most distinctive and true from the facts (new construction, a price that has come down, ` +
        `scale, the lot).\n\n` +
        `THE SPEC GRID ALREADY SHOWS every number you were given — price, beds, baths, square ` +
        `feet, lot, type, days on the market, year built, HOA — directly above your paragraph. ` +
        `Do NOT list them back. A paragraph that recites the specs is a failure. The distinction ` +
        `that matters: the grid shows a NUMBER, you may say what it MEANS. "Eleven days on the ` +
        `market" as a bare restatement is a failure; noting that it came to market this month is ` +
        `the same fact doing work. Never more than one figure in a sentence, and never a figure ` +
        `you were not given. Background context is BACKGROUND ONLY — do not turn this into a ` +
        `market analysis; at most one clause may touch the market, and only if it serves the ` +
        `house.\n\n`) +
    `WHEN YOU USE THE AGENT'S WORDS, KEEP THEM TRUE. "Five-minute idle to open water" does ` +
    `not become "five minutes to the river" — if you restate a detail, restate what it ` +
    `actually said. And never add a selling claim of your own: "priced to move", "won't ` +
    `last", "a rare opportunity" are YOUR words, not facts about the house. Describe; ` +
    `do not pitch.\n\n` +
    `SOUND LIKE A PERSON, NOT A MODEL. Say it the way you would say it out loud. "Has" beats ` +
    `"boasts", "offers", "features", "showcases". Never "not just X, but Y" or "isn't only ` +
    `X — it's Y". Never three parallel items where one or two would do. Never a closing ` +
    `clause that explains the sentence you just wrote — no "...which means", "...making it ` +
    `perfect for", "...adding to the appeal". No "nestled", "vibrant", "sought-after". At ` +
    `most one dash in the whole paragraph.\n\n` +
    `WORKED EXAMPLE — the same community fact, two ways.\n` +
    `Weak (reads like a machine): "Residents enjoy access to a vibrant gated community ` +
    `boasting numerous amenities, making it perfect for the Florida lifestyle."\n` +
    `Strong (reads like an agent): "The community has its own pool and clubhouse." — plain ` +
    `verbs, only what the fact lines actually say.\n` +
    // 08/19/2026, caught live on 13501 Brown Bear Run: this example used to end "...and
    // the gate is staffed", and the model echoed that clause into a real email about a
    // community whose gate-staffing we hold NO fact for. The claim gate is numeric and
    // never sees word-only inventions, so the example itself was the leak. An example
    // sentence may not contain a claim the fact lines don't back — and the line below
    // fences the ones that remain.
    `The example above teaches STYLE ONLY — its details are invented for the lesson. ` +
    `Never copy a detail from an example into your paragraph; your facts come only from ` +
    `the fact lines you were given.\n\n` +
    `A FACT ALREADY ON THE PAGE IS ALREADY ON THE PAGE. The seller's description and the ` +
    `spec grid sit right above your paragraph. Anything either already states — the ` +
    `community's name and size, the lot, gated status, a pool — you do not say again ` +
    `unless you are adding something new about it, and never the same figure. If the ` +
    `description says the community is 150 homes, writing "a community of 150 homes" is ` +
    `a failure.\n\n` +
    `HARD RULES. Every number you write must appear in the facts given. And a FACT ABOUT ` +
    `THE HOME IS NOT ONLY A NUMBER: you may not assert a view, a waterfront, a pool, a ` +
    `renovation, a garage, a school, a floor plan, a finish, a builder, or a neighborhood ` +
    `character unless the facts state it. You are describing a house you have never seen — ` +
    `you know its price, size, lot, type, and what sold near it, and NOTHING ELSE. If a ` +
    `sentence needs a detail you were not given, cut the sentence. No hype ("stunning", ` +
    `"dream home", "won't last"), no exclamation marks. Plain, confident, specific.\n\n` +
    // The community line is the ONE thing that lifts the golf/pool/gate prohibition above —
    // and only for the community, only when the fact is actually present.
    `THE COMMUNITY. If — and ONLY if — a "THE COMMUNITY" fact line is present above, you may ` +
    `say that the COMMUNITY has golf, a pool, a clubhouse, tennis, or that it is gated. Name ` +
    `only what that line lists. These belong to the COMMUNITY, never to this house: "the ` +
    `community has a pool" is allowed, "the home has a pool" is a fabrication and the ` +
    `paragraph is thrown away. If there is NO community line, say NOTHING about golf, a pool, ` +
    `a gate or amenities — its absence means we could not read the page, NOT that the ` +
    `community lacks them. Never write that a community lacks something.\n\n` +
    `THE NEIGHBORHOOD. If — and ONLY if — a "THE NEIGHBORHOOD" fact line is present above, you ` +
    `may restate ONLY the home count and median value it states, word for word — and NEVER when ` +
    `the seller's description already states that count; a figure on the page twice is a failure. This is an ` +
    `ASSESSED value from the tax roll, not a sale or list price — never call it "median home ` +
    `price" or say homes in this neighborhood "sell for" this figure. Never invent a trend, a ` +
    `comparison to another neighborhood, or a characterization of whether the value is high or ` +
    `low — that is a claim, not a restatement. If there is NO "THE NEIGHBORHOOD" line, say ` +
    `NOTHING about neighborhood home counts or values.\n\n` +
    // ADDED 08/05/2026 — the "AROUND THIS HOME" fact line was in `lines` with zero instruction
    // pointed at it, the only fact line in that position. The model was handed real counts and
    // nearest-mile distances ("restaurants: 6 (nearest 0.63 mi), local groceries: 3 (nearest
    // 0.71 mi)") and, with nothing telling it what to DO with the specifics, flattened them into
    // "Groceries and restaurants are within a mile" — technically not wrong, but it threw away
    // every number it was actually given and produced the same sentence any listing email could
    // print. Operator: "THIS IS FUCKING TERRIBLE." Named here so it isn't vague again.
    // REWRITTEN 08/10/2026 (operator: "WE DON'T FUCKING NEED DISTANCE FOR EVERY FUCKING
    // THING… JUST FUCKING MENTION ONE OR TWO AND TALK ABOUT THE OTHER GREAT THINGS TO
    // DO"). The prior wording ("name ONE OR TWO categories and their nearest distance
    // EXACTLY AS THE LINE WRITES IT") made a distance MANDATORY for every named category,
    // and the live paragraph strung three mileage clauses in a row — a survey, not a
    // person. The fact line itself now hands over at most TWO distances (structural cap,
    // MAX_SPOKEN_DISTANCES in neighborhood-amenities.ts); this instruction matches it:
    // a distance is seasoning, the rest is what there is to DO nearby.
    `THE AREA. If — and ONLY if — an "AROUND THIS HOME" fact line is present above, talk about ` +
    `it the way a person points out their neighborhood: state a distance for AT MOST one or two ` +
    `things — only where the line itself gives one, repeated exactly as written ("about half a ` +
    `mile"), NEVER converted to a decimal like "0.57 miles" — and mention the rest as good ` +
    `things close by with NO distance at all ("good restaurants close by", "a farmers market"). ` +
    `A paragraph where every sentence carries a mileage is a FAILURE — one distance clause, two ` +
    `at the very most. When the line lists a beach, lead with the beach — in this market ` +
    `nothing beats being close to the sand. Still be specific to THIS address (a category and ` +
    `its count are specifics), not a vague "close to shopping and dining" that could describe ` +
    `any address. Never invent a business name — the line deliberately carries none. These are ` +
    `businesses in the vendor's radius, never the community's own amenities: never "the ` +
    `community has" or "on-site." If the community's own fact lines above already give it golf ` +
    `or a marina, that thing is RIGHT THERE where the reader would live — never describe it as ` +
    `some distance away. If there is NO "AROUND THIS HOME" line, say NOTHING about nearby ` +
    `businesses.\n\n` +
    `Return ONLY the paragraph.`;

  const user = `FACTS:\n${lines.join("\n")}\n\nWrite the description.`;
  try {
    const msg = await getAnthropic("email_build").messages.create({
      // Prose quality is the whole job here; Haiku wrote the robot sentence.
      model: EMAIL_MODEL_SONNET,
      max_tokens: 500,
      system: `${system}\n\n${CLAIM_PROHIBITION}\n\n${FAVORABLE_FRAMING_POLICY}`,
      messages: [{ role: "user", content: user }],
    });
    const raw = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    if (!raw) return null;

    // ── STRIP LEAKED SCAFFOLDING, AT THE SHARED ROOT (08/09/2026, closes
    // `shared_narrator_leaks_reasoning_preamble`) ─────────────────────────────
    // The model sometimes narrates its own constraints INTO the paragraph, and that is
    // not a claim-gate violation (no invented fact), so it shipped raw — three times on
    // live renders: "THE COMMUNITY fact line is absent, so I will say nothing…" (back-on-
    // market, 08/06/2026, fixed LOCALLY there because this file was claimed by a parallel
    // session), "THE LISTING'S OWN DESCRIPTION IS ABSENT, so I am describing the home
    // itself" (new-listing capture), and "No community facts, neighborhood figures, or
    // nearby business distances were provided for this address, so the honest description
    // stops at the home itself" (price-reduced, 08/09/2026 — operator: unprintable).
    // Sentence-level and DELETE-ONLY (back-on-market's own bracket lesson: one bad clause
    // is one bad clause — nothing is rewritten, so nothing can be invented). First person
    // is the strongest tell; the phrase list is the shapes measured live, extended with
    // the provision-talk variant the "not provided" enumeration missed.
    const t = raw
      .split(/\n\s*(?:-{3,}|\*{3,}|_{3,})\s*\n/)
      .flatMap((seg) => seg.split(/\n{2,}/))
      .flatMap((p) => p.split(/(?<=[.!?])\s+/))
      .map((s) => s.trim())
      .filter((s) => s && !/[[\]]/.test(s))
      // First person in ANY form is the tell — "I will describe", "my instructions",
      // "would not serve me". A property description has no use for any of them
      // ("my instructions define as a failure" shipped LIVE 08/09/2026 straight past
      // the bare \bI\b test — a possessive is the same leak in a different case).
      .filter((s) => !/\b(I|me|my|mine)\b/.test(s))
      .filter(
        (s) =>
          // "already open|written by us|fixed copy|sentences above|supersede" added
          // 08/09/2026 (second-order audit 4.7): the sentence-bank addendum introduced
          // exactly that meta-vocabulary into the prompt, and this recipe family has
          // FOUR measured live leaks of prompt language shipping as prose.
          !/\b(fact line|is absent|are absent|is present|not given|not provided|was provided|were provided|honest description|the description stops|describing the home itself|instructions?|the reader|grid figures?|already open|written by us|fixed copy|sentences? above|supersedes?)\b/i.test(
            s,
          ),
      )
      // ── COST TALK AND NEGATIVITY, ENFORCED IN CODE (08/10/2026 decree) ─────────
      // "LET'S NOT TALK ABOUT MORE COSTS LIKE HOW MUCH THE HOA IS, THAT IS A QUESTION
      // THE REALTOR CAN ANSWER" + "TALKS NEGETIVE ABOUT BEING INLAND". The prompt now
      // forbids both; these delete-only filters are the guard behind the rule (a rule
      // only in a prompt is a rule the model can miss — live proof: "at $225 a month
      // the HOA covers…" and "softens the inland trade-off" both shipped). Same
      // contract as the scaffolding strip above: one bad sentence is one bad
      // sentence, deleted whole, nothing rewritten. The HOA/DOM facts stay VISIBLE
      // to the model (operator, 08/06/2026: "why would the model not see HOA????") —
      // this governs what the prose may SAY, never what the model may see.
      .filter(
        (s) =>
          !/\bHOA\b|homeowners['’]? association|carrying cost|monthly (?:fee|dues|cost)|\bdues\b|\$[\d,]+\s*(?:a|per)\s*month/i.test(
            s,
          ),
      )
      // Concessives included (first live draw after the rewrite): "daily errands stay
      // easy even though you're tucked inland" — "even though" IS the negative, in a
      // sentence with no banned noun in it.
      .filter(
        (s) =>
          !/\btrade-?offs?\b|\bdownsides?\b|\bdrawbacks?\b|\bcompromises?\b|\beven though\b|\balthough\b|\bdespite\b/i.test(
            s,
          ),
      )
      .join(" ")
      .trim();
    if (!t) {
      console.warn("[narrative] DROPPED — nothing but narration scaffolding survived the strip");
      return null;
    }

    // THE CLAIM GATE, on the shared listing narrator. It was wired into the individual
    // recipes and NOT into here — so the reference implementation itself still invented.
    // Caught live 07/13/2026: "room to spread across a scale that is UNCOMMON FOR THE PRICE
    // POINT" — a comparison against a set it was never shown — and, earlier, "a generous
    // floor plan with room to live large", a floor plan we do not hold.
    //
    // Every fact it was handed is a settled claim; anything it derives on top is not.
    // FAIL CLOSED: the paragraph is dropped to an OPEN SLOT rather than shipped. A missing
    // paragraph is honest; a confident false one is not.
    const settled = lines.map((l) => ({ sentence: String(l), anchors: numeralsIn(String(l)) }));
    const violations = auditClaims(t, settled);
    if (violations.length > 0) {
      console.warn(
        `[narrative] DROPPED — the narrator made ${violations.length} claim(s) it was not given: ` +
          violations.map((v) => `${v.kind}("${v.match}")`).join(", "),
      );
      return null;
    }
    return t;
  } catch (e) {
    // NEVER SILENT (08/10/2026). This catch ate real failures while both drop paths
    // above logged theirs — a narrator that died here was indistinguishable from
    // "no description existed", and the coming-soon demo shipped wordless for a
    // night while three people hunted the wrong layer. Same fail-closed contract
    // (null → open slot), but the failure is named.
    console.warn(`[narrative] DROPPED — narrator call failed: ${String(e).slice(0, 200)}`);
    return null;
  }
}
