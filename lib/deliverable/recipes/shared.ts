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
import type { ListingFacts } from "@/lib/email/listing-scrape";
import type { EmailDoc } from "@/lib/email/doc/types";

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
export async function resolveSubject(address: string, prompt: string): Promise<ResolvedSubject> {
  const hit = await resolveSubjectListing(address).catch(() => null);
  const facts: ListingFacts = hit ?? { address, photos: [], sourceUrl: BASE_URL };

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
    `"dream home", "won't last"), no exclamation marks. Plain, confident, specific. ` +
    `Return ONLY the paragraph.`;

  const user = `FACTS:\n${lines.join("\n")}\n\nWrite the description.`;
  try {
    const msg = await getAnthropic("email_build").messages.create({
      // Prose quality is the whole job here; Haiku wrote the robot sentence.
      model: EMAIL_MODEL_SONNET,
      max_tokens: 500,
      system,
      messages: [{ role: "user", content: user }],
    });
    const t = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    return t || null;
  } catch {
    return null;
  }
}
