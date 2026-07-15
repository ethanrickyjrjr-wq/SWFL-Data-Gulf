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
import { listingDescriptionFromPrompt } from "@/lib/email/listing-intent";
import { auditClaims, numeralsIn, CLAIM_PROHIBITION } from "@/lib/deliverable/claims";
import { communitySourceLine } from "@/lib/listings/listing-detail";
import {
  resolveCommunityForListing,
  neighborhoodStatsSourceLine,
} from "@/lib/listings/community-lookup";
import type { ListingFacts } from "@/lib/email/listing-scrape";
import type { EmailDoc } from "@/lib/email/doc/types";

/**
 * THE ONE SHARED FRAMING BLOCK — pasted VERBATIM (never paraphrased) into the system
 * prompt of every narrator whose job is stating facts about a property or a price:
 * `authorListingNarrative` (this file), `authorUnderContractNote`
 * (recipes/under-contract.ts), `buildNarratorPrompt` (recipes/market-comps.ts).
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

export async function resolveSubject(address: string, prompt: string): Promise<ResolvedSubject> {
  const zip = zip5From(address);
  const [hit, communityForListing] = await Promise.all([
    resolveSubjectListing(address).catch(() => null),
    zip ? resolveCommunityForListing(address, zip).catch(() => null) : Promise.resolve(null),
  ]);
  const facts: ListingFacts = hit ?? { address, photos: [], sourceUrl: BASE_URL };
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

  if (facts.photos[0]) {
    const mirrored = await mirrorHeroPhoto(facts.photos[0]).catch(() => null);
    if (mirrored) facts.photos[0] = mirrored;
  }

  return { facts, resolved: Boolean(hit) };
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
export function fillNarrative(doc: EmailDoc, body: string): EmailDoc {
  let done = false;
  return {
    ...doc,
    blocks: doc.blocks.map((b) => {
      if (done || b.type !== "text" || (b.props.body ?? "").trim()) return b;
      done = true;
      return { ...b, props: { ...b.props, body } };
    }),
  };
}

/** Clear every text block so `fillNarrative` can actually write into it. */
export function clearNarrativeSlots(doc: EmailDoc): EmailDoc {
  return {
    ...doc,
    blocks: doc.blocks.map((b) =>
      b.type === "text" ? { ...b, props: { ...b.props, body: "" } } : b,
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
  opts: { framing?: string; context?: string } = {},
): Promise<string | null> {
  // Nothing real to describe → leave the slot empty (never improvise a house).
  if (!facts.price && !facts.beds && !facts.sqft) return null;
  const lines = [
    facts.address && `Address: ${facts.address}`,
    facts.price && `List price: ${facts.price}`,
    facts.beds && `Beds: ${facts.beds}`,
    facts.baths && `Baths: ${facts.baths}`,
    facts.sqft && `Square feet: ${facts.sqft}`,
    facts.lotSize && `Lot: ${facts.lotSize}`,
    facts.propertyType && `Type: ${facts.propertyType}`,
    facts.yearBuilt && `Year built: ${facts.yearBuilt}`,
    facts.city && `City: ${facts.city}`,
    facts.zip && `ZIP: ${facts.zip}`,
    facts.isNewConstruction && `This is NEW CONSTRUCTION (vendor-stated).`,
    facts.isPriceReduced &&
      facts.priceReduction &&
      `The price was REDUCED by ${facts.priceReduction} from its original ask.`,
    facts.remarks && `The listing's own description: ${facts.remarks.slice(0, 1200)}`,
    // THE COMMUNITY — golf, pool, gated, clubhouse — off the listing's own detail page, which
    // `fetchListingFacts` already had in hand. Every recipe on this shared narrator (new-listing,
    // just-sold, open-house, price-reduced) gets it from this one line. Absent when we could not
    // read the page — and absent must stay SILENT: the HARD RULES below gate the vocabulary on
    // this fact being present, so "no community line" means the model may not mention golf at all,
    // NOT that the community lacks it.
    communitySourceLine(facts.community),
    neighborhoodStatsSourceLine(facts.communityStats),
    opts.context && `Background context (NOT the subject of this email):\n${opts.context}`,
  ].filter(Boolean);

  const system =
    `You write the property description for a real-estate email — the paragraph an ` +
    `agent puts under the photo. Two to four sentences.\n\n` +
    (opts.framing ? `WHAT THIS EMAIL IS: ${opts.framing}\n\n` : "") +
    `THIS EMAIL IS ABOUT THE HOUSE. Not the market, not the comps. A buyer reading it ` +
    `wants to know what this property IS.\n\n` +
    `IF THE AGENT'S OWN LISTING DESCRIPTION IS PROVIDED, IT IS THE SOURCE OF TRUTH and ` +
    `your job is to TIGHTEN it into email prose — pull the details that make this home ` +
    `distinctive (the setting, the water, the rooms, the standout features) and cut the ` +
    `rest. Do not reproduce it at full length, and do not flatten it into generalities: ` +
    `the specifics ARE the value. Without it, lead with what is most distinctive and ` +
    `true from the facts — new construction, a price that has come down, scale, the lot.\n\n` +
    `THE SPEC GRID ALREADY SHOWS price, beds, baths, square feet, lot, and type directly ` +
    `above your paragraph. Do NOT list them back. A description that recites the specs is ` +
    `a failure. Background context is BACKGROUND ONLY — do not turn this into a market ` +
    `analysis; at most one clause may touch the market, and only if it serves the house.\n\n` +
    `WHEN YOU USE THE AGENT'S WORDS, KEEP THEM TRUE. "Five-minute idle to open water" does ` +
    `not become "five minutes to the river" — if you restate a detail, restate what it ` +
    `actually said. And never add a selling claim of your own: "priced to move", "won't ` +
    `last", "a rare opportunity" are YOUR words, not facts about the house. Describe; ` +
    `do not pitch.\n\n` +
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
    `may restate ONLY the home count and median value it states, word for word. This is an ` +
    `ASSESSED value from the tax roll, not a sale or list price — never call it "median home ` +
    `price" or say homes in this neighborhood "sell for" this figure. Never invent a trend, a ` +
    `comparison to another neighborhood, or a characterization of whether the value is high or ` +
    `low — that is a claim, not a restatement. If there is NO "THE NEIGHBORHOOD" line, say ` +
    `NOTHING about neighborhood home counts or values.\n\n` +
    `Return ONLY the paragraph.`;

  const user = `FACTS:\n${lines.join("\n")}\n\nWrite the description.`;
  try {
    const msg = await getAnthropic("email_build").messages.create({
      // Prose quality is the whole job here; Haiku wrote the robot sentence.
      model: EMAIL_MODEL_SONNET,
      max_tokens: 500,
      system: `${system}\n\n${CLAIM_PROHIBITION}`,
      messages: [{ role: "user", content: user }],
    });
    const t = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    if (!t) return null;

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
  } catch {
    return null;
  }
}
