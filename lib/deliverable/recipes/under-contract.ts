// lib/deliverable/recipes/under-contract.ts
//
// R4 · UNDER CONTRACT — the same resolved house as New Listing, wearing the
// "it's pending, send me your backup offer" hat.
//
// ── THE REFUTATION THIS FILE WAS REWRITTEN AROUND (07/13/2026) ───────────────
//
// The first build of this recipe SHIPPED A FABRICATED INTERVAL. It rendered:
//
//     "This home went under contract after 75 days on market, in line with the
//      72-day median... The seller had reduced the asking price by $104,975
//      BEFORE A CONTRACT WAS REACHED."
//
// Every clause after "This home" was invented:
//
//   • "after 75 days" — 75 was ELAPSED days (vendor list_date → TODAY) on a
//     listing the vendor reports `is_pending: FALSE`. The DAYS-TO-CONTRACT
//     interval is held by NO endpoint. A real number re-labelled as a quantity
//     we do not hold is STILL an invented figure. That is the hard block.
//   • "in line with the 72-day median" — apples to oranges. `median_dom` is
//     Redfin's SOLD-COHORT median (it sits beside homes_sold / avg_sale_to_list
//     / sold_above_list in `housing_by_zip`): a COMPLETED clock. The subject's
//     was an UNFINISHED clock still ticking. Comparing them is a false
//     comparative claim, and a comparative claim is a factual claim.
//   • "BEFORE a contract was reached" — the vendor gives a price-cut AMOUNT
//     (`price.reduced_amount`) and nothing else. No cut date, no contract date,
//     no ordering. The narrator invented a SEQUENCE OF EVENTS.
//
// The old guard was blind to all of it because a fabricated interval carries
// digits that LOOK sourced, and the old test suite pinned the defect as correct.
//
// ── THE FIX: THE INTERVAL IS AN OPEN SLOT *BY CONSTRUCTION* ──────────────────
//
// This is an UNDER CONTRACT email. The agent chose this recipe because THEIR
// listing went under contract — so THE AGENT HOLDS THE CONTRACT DATE and we
// never will. That is not a failure path, it is LANE 4 (RULE 0.7: our data →
// the user's upload → a named web source → a figure the user states).
//
// So "Days to Contract" is ALWAYS an open slot whose LABEL is the instruction:
// an editable invitation on the canvas, ABSENT from the sent email (StatsBlock
// drops empty cells and empty rows under `emailRender`). Never a number from us,
// never a zero, never a narrative about timing.
//
// ── WHAT WE ACTUALLY HOLD, AND WHAT EACH THING IS ────────────────────────────
//
//   SOURCED (ships):
//     • The LIST DATE — `/property-tax-history` → `property_history[].listing
//       .list_date`, the current for-sale cycle. This is a DATE, not an interval.
//       "Listed 04/29/2026" asserts nothing about when a contract came. It is the
//       honest use of the one date-bearing field the vendor gives us.
//     • The ZIP's MEDIAN DAYS ON MARKET — housing-swfl `housing_by_zip
//       .median_dom`, cited, with its as-of. Stated as ITS OWN fact about the
//       AREA. We never subtract it from anything.
//     • price · beds · baths · sqft · $/sqft · lot · type · new-construction ·
//       the SIZE of the price cut — all straight off the resolved vendor record.
//
//   NOT HELD — never asserted, in a cell or in prose:
//     • days-to-contract (OPEN SLOT — lane 4, the agent knows)
//     • the contract date, the contract price, any contract term
//     • the ORDER of the price cut relative to the contract
//     • whether the home was fast or slow
//
//   NOT VENDOR-CONFIRMED: the pending status itself. `/search` `flags.is_pending`
//   is FALSE on the canonical fixture. "Under Contract" is the AGENT'S framing
//   (they picked this recipe for their own listing) — legitimate as a kicker,
//   never printed as a vendor-verified fact.
//
// Probed live 07/13/2026, and this is a VENDOR CEILING, not a code gap:
//   • `/search` has NO daysOnMarket field at all (zero date-bearing keys, 200 rows);
//   • on a genuinely pending row (property 5998615101, `is_pending: true`) the
//     tax-history `listing.status` STILL reads "for_sale" and there is NO "Pending"
//     event in `property_history` (events seen: Listed / Price Changed / Listing
//     removed / Sold / *for rent);
//   • `days_after_listed` is null on every event of both properties probed.
//   `cadence_registry.yaml:1800` says the same thing: "true per-listing
//   days-on-market [is a] genuine vendor ceiling… only aggregate
//   median_days_on_market exists (city/county/ZIP grain), not per-listing."
//
// ── THE SIX ANSWERS (playbook Part 6) ───────────────────────────────────────
//   1. SUBJECT — the listing address, already resolved into `ctx.facts`. NO SECOND
//      RESOLVER; we only ENRICH with the list date, the same shape as `withBaths`.
//   2. SKELETON — a coded grid, here. There is no `under-contract` SEED_DOC.
//   3. CELLS — listed date · DAYS TO CONTRACT (always open) · the ZIP's typical ·
//      price · beds · baths · sqft · $/sqft · lot · type.
//   4. CHART — DROPPED. See `NO CHART` below. Reported, not fabricated.
//   5. PROSE — this recipe's own narrator, handed sources that contain NO
//      day-count, and triple-guarded (attributes · offer terms · TIMING).
//   6. FRAMING — "Under Contract" kicker, price hero, backup-offer CTA.

import { getAnthropic } from "@/refinery/agents/anthropic.mts";
import { EMAIL_MODEL_SONNET } from "@/lib/email/model-router";
import { fetchNearbyValues } from "@/lib/listings/steadyapi";
import { canonStreet } from "@/lib/listings/resolve-subject";
import { marketSnapshotForZip } from "@/lib/listings/market-snapshot";
import { createBlock, DEFAULT_GLOBAL_STYLE } from "@/lib/email/doc/default-docs";
import { heroPhotoBlock } from "@/lib/email/inject-photo";
import { clearNarrativeSlots, fillNarrative } from "./shared";
import type { RecipeBuildContext } from "./index";
import type {
  BlockLayout,
  EmailBlock,
  EmailDoc,
  FontFamily,
  StatItem,
} from "@/lib/email/doc/types";
import type { ListingFacts } from "@/lib/email/listing-scrape";

// ── The vendor lane: the LIST DATE (the fact `/search` does not carry) ────────
//
// This duplicates the auth/header/empty-tolerant shape of lib/listings/steadyapi.ts
// on purpose: that file is SHARED and a 13-way parallel build must not touch it.
// REPORTED FOR EXTRACTION — `fetchActiveListDate` belongs next to `fetchSoldEvent`,
// which already fetches this exact body and reads one event type out of it.

const STEADY_BASE = "https://api.steadyapi.com/v1/real-estate";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://steadyapi.com",
  Referer: "https://steadyapi.com/",
};

/** One row of `body.property_history` — only the fields we read are typed. */
interface RawHistoryEvent {
  date?: unknown;
  event_name?: unknown;
  listing?: {
    status?: unknown;
    list_date?: unknown;
  };
}

/**
 * PURE: the ACTIVE for-sale listing's `list_date` out of a `/property-tax-history`
 * body, as an ISO instant — or null.
 *
 * A property carries its whole history: old sold listings, old rental listings, the
 * current one. We take the LATEST `list_date` among events whose own
 * `listing.status` is "for_sale" — the sale lane, current cycle. A prior sale
 * (status "sold"), a withdrawn one ("off_market") and every rental event are
 * excluded, so a 2023 sale's list date can never be mistaken for today's.
 *
 * Never throws; anything unexpected → null (→ the cell becomes an open slot).
 */
export function parseActiveListDate(body: unknown): string | null {
  const history = (body as { body?: { property_history?: unknown } })?.body?.property_history;
  if (!Array.isArray(history)) return null;
  let best: string | null = null;
  for (const row of history as RawHistoryEvent[]) {
    if (row?.listing?.status !== "for_sale") continue;
    const listed = row.listing.list_date;
    if (typeof listed !== "string" || !listed) continue;
    // ISO instants sort lexically — the max is the current cycle's list date.
    if (!best || listed > best) best = listed;
  }
  return best;
}

/**
 * PURE: an ISO instant → MM/DD/YYYY (the Rule-5 date format), in UTC so the output
 * cannot drift with the server's timezone. Anything unparseable → null.
 *
 * THIS IS A DATE, NOT AN INTERVAL. It is the ONLY timing fact about this listing we
 * are entitled to print. We deliberately do NOT subtract it from `now`: that
 * difference is elapsed-days-since-listed, which on an under-contract home keeps
 * ticking PAST the contract and is therefore not the days-to-contract interval the
 * old build claimed it was.
 */
export function formatListDate(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  const ms = t.getTime();
  if (!Number.isFinite(ms)) return null;
  const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(t.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${t.getUTCFullYear()}`;
}

/** One `/property-tax-history` call → the active listing's list date, or null.
 *  Empty-tolerant by contract: no key, non-200, bad body → null, never throws. */
export async function fetchActiveListDate(propertyId: string): Promise<string | null> {
  const key = process.env.PHOTOS_API;
  if (!key || !propertyId) return null;
  try {
    const res = await fetch(`${STEADY_BASE}/property-tax-history?propertyId=${propertyId}`, {
      headers: { ...BROWSER_HEADERS, Authorization: `Bearer ${key}` },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return parseActiveListDate(await res.json());
  } catch {
    return null;
  }
}

/**
 * The subject's LIST DATE (ISO), or null. Two hour-cached vendor calls, keyed off
 * the lat/lon the dispatcher already resolved:
 *
 *   1. `/nearby-home-values` — a property is the nearest property to its OWN
 *      coordinates, so the subject comes back as its own row (the same trick
 *      `withBaths` uses). That row is the ONLY place we can read the vendor's
 *      `property_id`, because `ListingFacts` carries neither an id nor a permalink.
 *   2. `/property-tax-history?propertyId=…` — the list date.
 *
 * This is NOT a second subject resolver: the house is already resolved. It is an
 * enrichment of the resolved subject, exactly like the bath count.
 *
 * Best-effort: any miss → null, and the Listed cell becomes an open slot. Never throws.
 */
export async function resolveSubjectListDate(facts: ListingFacts): Promise<string | null> {
  if (facts.lat == null || facts.lon == null || !facts.address) return null;
  const target = canonStreet(facts.address.split(",")[0] ?? "");
  if (!target) return null;
  try {
    const nearby = await fetchNearbyValues({ lat: facts.lat, lon: facts.lon, limit: 25 });
    const self = nearby.find((c) => canonStreet(c.addressLine) === target);
    if (!self?.propertyId) return null;
    return await fetchActiveListDate(self.propertyId);
  } catch {
    return null;
  }
}

// ── The AREA's timing — a fact about the ZIP, never about this house ──────────

/**
 * The ZIP's median days on market. THIS IS AN AREA FACT AND NOTHING ELSE.
 *
 * There is deliberately NO subject field on this type, NO delta and NO verdict.
 * The old build had all three (`DomComparison`: subjectDom / deltaDays / verdict /
 * chartWorthy) and every one of them was a lie built on an interval we do not hold.
 * You cannot subtract the subject from this number, because there is no subject
 * number — and `median_dom` is a COMPLETED (sold-cohort) clock that would not be
 * commensurable with an elapsed one even if there were.
 */
export interface MarketTiming {
  /** housing-swfl `housing_by_zip.median_dom` — Redfin, the ZIP's SOLD cohort. */
  areaDom: number;
  zip: string;
  /** MM/DD/YYYY — the housing brain's as-of, per the Rule-5 date format. */
  asOf: string;
}

// ── NO CHART (a reported deviation, not a fabrication) ────────────────────────
//
// The registry declares `chart: "dom-vs-area"` (lib/deliverable/recipes.ts). That
// chart needs TWO commensurable bars: this home's days-to-contract, and the ZIP's
// typical. WE DO NOT HOLD THE FIRST BAR — no endpoint carries it (vendor ceiling,
// above). The old build drew it anyway, using elapsed-days-since-listed as the
// subject bar: an unfinished clock beside a finished median, i.e. the fabricated
// comparison rendered as a PICTURE, which is worse than in prose because a chart
// reads as measured.
//
// So this recipe SHIPS NO CHART, and reserves no chart slot — an empty chart box is
// worse than no chart, and here the box could never be honestly filled. A chart is a
// bonus, never a blocker, and never a reason to refuse a build (New Listing, the
// reference implementation, also drops its chart by design).
//
// REPORTED, NOT EDITED (shared file, 13 agents): `recipes.ts` should carry
// `chart: null` for "under-contract", and its `prompt` — "lead with how fast it went
// pending compared to the ZIP's typical days on market" — asks for precisely the
// number that does not exist. That prompt is what steered the first build into the
// fabrication. It should read: "…announce it's under contract, show when it was
// listed against the ZIP's typical days on market, and invite backup offers."

// ── The coded grid ───────────────────────────────────────────────────────────
//
// Mirrors buildListingFlyer's shape (brand-sticky chrome, hero photo, hero, spec
// rows, commentary, agent card, CTA, footer) because this is the same house — but the
// HERO leads with the price, the first spec row is the TIMING row, and the CTA asks
// for a backup offer.
//
// REPORTED FOR EXTRACTION: this is copy #2 of that grid. Coming Soon, Just Sold and
// Price Improved will each need copy #3/#4/#5. A parameterized
// `listingFlyerGrid({ kicker, heroValue, leadStats, ctaLabel })` in listing-flyer.ts
// is the right home for it — I cannot make that edit (shared file, 13 agents).

const EDITORIAL_STYLE = {
  primaryColor: "#0A2A2C",
  accentColor: "#B98F45",
  fontFamily: "BOOK_SERIF" as FontFamily,
  displayFontFamily: "PLAYFAIR_SERIF" as FontFamily,
  textColor: "#23302F",
  backdropColor: "#EFE9DD",
};

function keepOrDefault(current: EmailDoc, type: EmailBlock["type"]): EmailBlock {
  return current.blocks.find((b) => b.type === type) ?? createBlock(type);
}

function withCommas(n?: string): string | undefined {
  const digits = (n ?? "").replace(/[^\d]/g, "");
  return digits ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : undefined;
}

/** price ÷ sqft. Both must parse, or the cell is an open slot — never fabricated. */
function pricePerSqft(price?: string, sqft?: string): string | undefined {
  const p = Number((price ?? "").replace(/[^\d.]/g, ""));
  const s = Number((sqft ?? "").replace(/[^\d.]/g, ""));
  if (!p || !s || !Number.isFinite(p) || !Number.isFinite(s)) return undefined;
  return "$" + Math.round(p / s).toLocaleString("en-US");
}

function shortType(t?: string): string | undefined {
  if (!t) return undefined;
  const seg =
    t
      .split(/\s[-–—]\s/)
      .pop()
      ?.trim() || t.trim();
  return seg.slice(0, 24) || undefined;
}

/** A stat cell. A value we cannot source becomes an OPEN SLOT: an empty value whose
 *  LABEL is the instruction (the house rule — lib/email/CLAUDE.md, THE SLOT RULE).
 *  On the canvas that is an editable invitation; under `emailRender` StatsBlock drops
 *  the cell, and drops the row when none survive. Never a zero, never a naked label. */
function cell(value: string | undefined, label: string, instruction: string): StatItem {
  const v = value?.trim();
  return v
    ? { value: v.slice(0, 24), label: label.slice(0, 60) }
    : { value: "", label: instruction.slice(0, 60) };
}

function at<T extends EmailBlock>(block: T, y: number, h: number, opts?: Partial<BlockLayout>): T {
  return { ...block, layout: { x: 0, y, w: 12, h, ...opts } };
}

export interface UnderContractGridOpts {
  facts: ListingFacts;
  current: EmailDoc;
  /** The subject's list date, MM/DD/YYYY, or null → an open slot. A DATE, never an
   *  interval: we do not hold how long it took to go under contract. */
  listedOn: string | null;
  /** The ZIP's median days on market, or null → an open slot. An AREA fact. */
  timing: MarketTiming | null;
}

/** PURE: facts → the positioned EmailDoc. No I/O, so the test drives it with fixture
 *  data and makes zero live calls. */
export function buildUnderContractGrid(opts: UnderContractGridOpts): EmailDoc {
  const { facts, current, listedOn, timing } = opts;

  // Brand is STICKY — a real user brand carries through untouched; only a still-house
  // default falls back to the editorial palette.
  const brandIsHouse = current.globalStyle.accentColor === DEFAULT_GLOBAL_STYLE.accentColor;
  const globalStyle = brandIsHouse
    ? { ...current.globalStyle, ...EDITORIAL_STYLE }
    : { ...current.globalStyle };

  const addressLine =
    facts.address ?? ([facts.city, facts.state].filter(Boolean).join(", ") || undefined);

  const blocks: EmailBlock[] = [];
  let y = 0;
  const push = (block: EmailBlock, h: number, o?: Partial<BlockLayout>) => {
    blocks.push(at(block, y, h, o));
    y += h;
  };

  // 1. Header — the agent's branded header.
  push(keepOrDefault(current, "header"), 2);

  // 2. Hero PHOTO — the real listing photo (mirrored into our storage by the
  //    resolver), else an EMPTY image block: a drag-drop upload on the canvas,
  //    absent from the email.
  push(
    facts.photos[0]
      ? heroPhotoBlock({
          url: facts.photos[0],
          alt: facts.address ?? "Property under contract",
          linkUrl: facts.sourceUrl,
        })
      : {
          id: createBlock("image").id,
          type: "image",
          props: { url: "", kind: "photo", alt: facts.address ?? "Property under contract" },
        },
    6,
  );

  // 3. Hero — "Under Contract" + the PRICE.
  //
  //    The old hero led with "75 days on market" — the fabricated interval, in the
  //    largest type on the page. The price is what a backup-offer reader actually
  //    needs and it is a hard sourced fact. The hero has no emailRender suppression,
  //    so it must never be a naked kicker: with no price, the kicker still carries the
  //    address in its label.
  push(
    {
      id: createBlock("hero").id,
      type: "hero",
      props: {
        kicker: "Under Contract",
        value: (facts.price ?? "").slice(0, 24),
        label: addressLine ?? "",
      },
    },
    3,
  );

  // 4a. THE TIMING ROW.
  //
  //     Listed  — a DATE we hold (vendor list_date). Asserts no interval.
  //     Days to Contract — ALWAYS AN OPEN SLOT. This is the number the email is
  //       nominally about and NO SOURCE HOLDS IT (vendor ceiling). The AGENT holds it
  //       — they chose this recipe for their own listing — so the label is the
  //       instruction and they type it in on the canvas (LANE 4). Absent from the sent
  //       email until they do. Never a number from us, never a zero.
  //     Typical in {zip} — the ZIP's median days on market, cited in the prose. An
  //       AREA fact, standing alone. We never subtract it from anything.
  const zip = timing?.zip ?? facts.zip;
  push(
    {
      id: createBlock("stats").id,
      type: "stats",
      props: {
        stats: [
          cell(listedOn ?? undefined, "Listed", "Listed — type the date it hit the market"),
          // No `value` argument at all: this cell is an open slot BY CONSTRUCTION,
          // not on failure. There is nothing to pass it.
          cell(undefined, "Days to Contract", "Days to Contract — type how long it took"),
          cell(
            timing ? String(timing.areaDom) : undefined,
            zip ? `Typical Days in ${zip}` : "Typical Days Nearby",
            "Typical days on market — add your area's figure",
          ),
        ],
      },
    },
    2,
  );

  // 4b. The house itself — a backup-offer reader needs to know what they'd be
  //     backing up on. Every cell sourced from the resolved vendor record.
  const specs: StatItem[] = [
    cell(facts.price, "List Price", "List Price — type the asking price"),
    cell(facts.beds, "Beds", "Beds — type the bedroom count"),
    cell(facts.baths, "Baths", "Baths — type the bathroom count"),
    cell(withCommas(facts.sqft), "Sq Ft", "Sq Ft — type the living area"),
    cell(pricePerSqft(facts.price, facts.sqft), "$/Sq Ft", "$/Sq Ft — needs price and sq ft"),
    cell(facts.lotSize, "Lot", "Lot — type the lot size"),
    cell(shortType(facts.propertyType), "Type", "Type — type the property type"),
  ];
  for (let i = 0; i < specs.length; i += 3) {
    push(
      { id: createBlock("stats").id, type: "stats", props: { stats: specs.slice(i, i + 3) } },
      2,
    );
  }

  // 5. Commentary — EMPTY here by design. The builder clears every text slot and the
  //    narrator writes into it (fillNarrative SKIPS a slot that already has content —
  //    that landmine shipped 2,000 characters of raw MLS copy once already).
  push({ id: createBlock("text").id, type: "text", props: { body: "", align: "left" } }, 4);

  // 6. NO CHART SLOT. Not "reserved then dropped" — never created. See the NO CHART
  //    block above: the subject bar does not exist, so the box could never be honestly
  //    filled, and a box that can only ever be empty should not be built.

  // 7. Agent card — the agent's own, if the canvas had one.
  push(keepOrDefault(current, "agent-card"), 4);

  // 8. CTA — the whole ask of this email.
  push(
    {
      id: createBlock("button").id,
      type: "button",
      props: { label: "Submit a Backup Offer", url: facts.sourceUrl },
    },
    2,
  );

  // 9. Footer — CAN-SPAM address, socials, unsubscribe. The agent's own.
  push(keepOrDefault(current, "footer"), 3, { static: true });

  return { globalStyle, blocks };
}

// ── PROSE — and why this recipe does NOT use `authorListingNarrative` ────────
//
// I tried the shared narrator first, with this recipe's `framing` + the timing as
// `context`. It is the wrong tool here, and it FAILED THE HARD BLOCK. Live,
// 07/13/2026, on the 326 Shore Dr facts it INVENTED a physical attribute ("this
// three-story home"), RECITED the spec cells every run, and added SELLING CLAIMS of
// its own ("the scale here is notably generous") — all three forbidden by its OWN
// system prompt. The cause is structural: `authorListingNarrative` is a PROPERTY
// DESCRIPTION writer ("THIS EMAIL IS ABOUT THE HOUSE. Not the market"). With no
// pasted MLS remarks it has nothing real to describe, so it fills the vacuum by
// reciting numbers and inventing qualities. An under-contract email is not a
// description — it is a TRANSACTION note. The photo and the grid already show the
// house.
//
// So the prose layer is owned HERE, and it is TRIPLE-GUARDED. Reported for
// extraction: all three guards belong in shared.ts for every recipe.

/**
 * INVENTION CLASS 1 — a claim about the HOUSE that is not a number: a view, a
 * waterfront, a pool, a renovation, a finish, a storey count. `gateNarrative` gates
 * NUMBERS only, so nothing in the product catches this. If one of these words is not
 * in the sources we handed the model, the model made it up.
 */
const ATTRIBUTE_CLAIMS = [
  "story",
  "stories",
  "storey",
  "storeys",
  "split-level",
  "waterfront",
  "water",
  "canal",
  "river",
  "gulf",
  "bay",
  "lake",
  "dock",
  "boat",
  "seawall",
  "pool",
  "spa",
  "hot tub",
  "jacuzzi",
  "view",
  "views",
  "vista",
  "overlook",
  "garage",
  "carport",
  "lanai",
  "porch",
  "patio",
  "deck",
  "courtyard",
  "balcony",
  "granite",
  "quartz",
  "marble",
  "hardwood",
  "stainless",
  "tile",
  "fireplace",
  "vaulted",
  "renovated",
  "remodeled",
  "remodelled",
  "updated",
  "upgraded",
  "restored",
  "gated",
  "golf",
  "beach",
  "waterside",
  "cul-de-sac",
  "fenced",
  "landscaped",
  "chef",
  "gourmet",
  "open-concept",
  "walk-in",
  "en-suite",
  "ensuite",
  "guest house",
  "casita",
] as const;

/**
 * PURE. Attribute words the paragraph asserts that the SOURCES never stated.
 * A non-empty result means the model invented — the paragraph is rejected, never
 * shipped. Word-boundary matched so "waterfront" in the agent's own pasted copy
 * legitimises "waterfront" in the prose.
 */
export function inventedAttributes(paragraph: string, sourceText: string): string[] {
  const src = sourceText.toLowerCase();
  const body = paragraph.toLowerCase();
  const hits = new Set<string>();
  for (const term of ATTRIBUTE_CLAIMS) {
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(body) && !re.test(src)) hits.add(term);
  }
  return [...hits];
}

/**
 * INVENTION CLASS 2 — a claim about the OFFER.
 *
 * The list price is the SELLER'S ASK. Nothing we hold says what the buyer agreed to
 * pay: `/search` carries `price.amount` (the ask) and a pending BOOLEAN, and no
 * endpoint carries a contract price. Live, 07/13/2026, the model wrote "the seller
 * accepted an offer at the current ask of $595,000" — a fabricated contract term
 * wearing a sourced number. The attribute guard cannot see it (every word is
 * legitimate), so it gets its own detector.
 */
const OFFER_CLAIM_PATTERNS: readonly RegExp[] = [
  /\boffer\s+(?:at|of|for)\s+\$/i,
  /\b(?:at|for)\s+(?:the\s+)?(?:full|current|list(?:ed)?|asking)\s+(?:price|ask)\b/i,
  /\b(?:over|above|below|under)\s+(?:the\s+)?(?:ask|asking)\b/i,
  /\bfull[-\s]price\s+offer\b/i,
  /\b(?:accepted|agreed to|took)\b[^.]{0,30}\b(?:the\s+)?(?:ask|asking price|list price)\b/i,
];

/** PURE: offer-price claims the paragraph makes that no source can support. Non-empty
 *  → the paragraph is rejected. Never shipped, not even when it sounds plausible. */
export function offerClaims(paragraph: string): string[] {
  return OFFER_CLAIM_PATTERNS.filter((re) => re.test(paragraph)).map((re) => re.source);
}

/**
 * INVENTION CLASS 3 — THE ONE THAT SHIPPED. A claim about TIME.
 *
 * This is the guard whose absence got this recipe refuted. The old build rendered
 * "went under contract after 75 days on market, in line with the 72-day median" and
 * "reduced the asking price BEFORE A CONTRACT WAS REACHED" — and BOTH the attribute
 * guard and the offer guard returned clean, because a fabricated INTERVAL carries
 * digits that look sourced and every individual word is legitimate.
 *
 * THE RULE THAT MAKES THIS GUARD SHARP: the sources handed to the model contain NO
 * DAY-COUNT AT ALL. Not the subject's (we don't hold it) and not the area's (that is
 * a CELL, and reciting the grid is already forbidden). So ANY duration in the
 * paragraph is unsourced BY CONSTRUCTION, and we can simply ban all of them —
 * no fragile subject-vs-area parsing.
 *
 * It bans, in the paragraph:
 *   • any duration ("75 days", "72-day", "three weeks", "a month");
 *   • any days-on-market phrasing;
 *   • any ORDERING of events against the contract or the price cut ("before a
 *     contract was reached", "after the price cut", "the cut brought a buyer");
 *   • any SPEED characterization ("quickly", "didn't last", "snapped up");
 *   • any COMPARISON of this home to the area's typical.
 */
const TIMING_CLAIM_PATTERNS: readonly RegExp[] = [
  // Any numeric duration — "75 days", "72-day", "3 weeks", "18 months".
  /\b\d+[\s-]*(?:day|week|month|year)s?\b/i,
  // Any spelled-out duration — "after seventy days", "in just two weeks".
  /\b(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|several|a few|couple of|handful of)\s+(?:day|week|month)s?\b/i,
  // Days-on-market phrasing in any form.
  /\bdays?\s+on\s+(?:the\s+)?market\b/i,
  /\bdays?\s+to\s+(?:contract|pending|offer)\b/i,
  /\btime\s+on\s+(?:the\s+)?market\b/i,
  // ORDERING against the contract — the exact fabrication that shipped.
  /\b(?:before|prior to|ahead of|after|following|once|when)\s+(?:the\s+|a\s+|any\s+)?(?:contract|pending|going under contract)\b/i,
  /\bcontract\s+was\s+(?:reached|accepted|signed|executed|struck)\b/i,
  // ORDERING against the price cut — "after the reduction", "the cut then drew…".
  /\b(?:after|following|since|once|upon)\s+(?:the\s+)?(?:price\s+)?(?:cut|reduction|drop|adjustment|reprice)\b/i,
  /\b(?:led to|resulted in|prompted|triggered|brought(?:\s+in)?|drew|attracted|produced)\b[^.]{0,40}\b(?:contract|offer|buyer)\b/i,
  // SPEED characterization — ours to state, never the model's, and we never state it.
  /\b(?:quick|quickly|quicker|fast|faster|fastest|swift|swiftly|rapid|rapidly|speedy|speedily|brisk|briskly|slow|slower|slowly|sluggish|lingered|languished|promptly|immediately)\b/i,
  /\b(?:didn'?t last|did not last|flew off|snapped up|went fast|barely hit the market|no time at all|in record time)\b/i,
  // COMPARING this home to the area — a comparative claim is a factual claim.
  /\b(?:in line with|compared (?:to|with)|versus|vs\.?|against|outpac\w+|beat|bested|trailed|ahead of|behind)\b[^.]{0,40}\b(?:median|typical|average|area|market|zip)\b/i,
  /\b(?:median|typical|average)\b[^.]{0,30}\bdays?\b/i,
];

/** PURE: timing/sequence/speed claims the paragraph makes that no source can support.
 *  Non-empty → the paragraph is rejected. This is the hard block. */
export function timingClaims(paragraph: string): string[] {
  return TIMING_CLAIM_PATTERNS.filter((re) => re.test(paragraph)).map((re) => re.source);
}

/** PURE: every reason this paragraph may not ship. Empty = clean. */
export function proseViolations(paragraph: string, sourceText: string): string[] {
  return [
    ...inventedAttributes(paragraph, sourceText),
    ...offerClaims(paragraph),
    ...timingClaims(paragraph),
  ];
}

const CTA_HINT =
  "The seller is still accepting backup offers — if this one was on your list, it is worth putting your position on paper now.";

/**
 * PURE: the deterministic note — zero model. Used when the model invents twice or the
 * API fails, so the slot is never empty while we hold something real to say.
 *
 * THE OLD ONE FABRICATED BY CONSTRUCTION. It emitted "It went under contract after 45
 * days on the market - 27 days quicker than the 72-day median for ZIP 33905" — the
 * guaranteed-on-API-failure path was a guaranteed lie. This one states ONLY the
 * status (the agent's own), the sourced price cut AMOUNT with no ordering, and the
 * ask. No interval, no sequence, no speed. It passes its own `proseViolations`, and a
 * test asserts that.
 */
export function fallbackNote(facts: ListingFacts): string {
  const parts = ["This home is under contract."];
  if (facts.isNewConstruction) parts.push("It is new construction.");
  if (facts.isPriceReduced && facts.priceReduction) {
    // The AMOUNT is sourced (`price.reduced_amount`). The DATE of the cut is not, so
    // this sentence must never place it relative to the contract.
    parts.push(
      facts.price
        ? `The asking price came down by ${facts.priceReduction} from the original ask, to ${facts.price}.`
        : `The asking price came down by ${facts.priceReduction} from the original ask.`,
    );
  }
  parts.push(CTA_HINT);
  return parts.join(" ");
}

/**
 * The under-contract note. ONE constrained call. The model writes PROSE AND NOTHING
 * ELSE, from sources that contain NO DAY-COUNT and NO CONTRACT TERM — so the two
 * fabrications that got this recipe refuted are not merely forbidden, they are
 * UNREACHABLE: there is no number in its context to build them out of.
 *
 * Sources, and nothing beyond them:
 *   • the STATUS (the agent's own — explicitly labelled as such),
 *   • the vendor's flags (new construction, the SIZE of the price cut) and the ask,
 *   • the agent's pasted listing description, if they gave us one (LANE 2).
 *
 * Deliberately NOT in the sources: the list date, the ZIP median, any day-count.
 * Those live in CELLS, where they are labelled and cannot be re-narrated into an
 * interval. Reciting the grid is a failure anyway.
 *
 * Two strikes and we fall back to the deterministic note. Never invents, never blocks.
 */
export async function authorUnderContractNote(facts: ListingFacts): Promise<string> {
  const sources = [
    `STATUS: this home is UNDER CONTRACT. (This is the listing agent's own status. We hold NO contract date, NO days-to-contract figure, and NO term of the contract.)`,
    facts.isNewConstruction ? "The vendor states this is NEW CONSTRUCTION." : null,
    facts.isPriceReduced && facts.priceReduction
      ? `The price was cut by ${facts.priceReduction} from the original ask (current ask: ${facts.price}). WE DO NOT KNOW WHEN this cut happened, and nothing tells us whether it came before or after any contract.`
      : null,
    facts.remarks ? `THE AGENT'S OWN LISTING DESCRIPTION:\n${facts.remarks.slice(0, 1200)}` : null,
  ].filter(Boolean) as string[];

  // Nothing beyond the bare status → skip the model entirely (and the spend): the
  // deterministic note already says everything we hold.
  if (sources.length === 1) return fallbackNote(facts);

  const system =
    `You write ONE short paragraph (2–3 sentences) for a real-estate email announcing that ` +
    `a home has gone UNDER CONTRACT, and inviting BACKUP OFFERS.\n\n` +
    `THIS EMAIL IS ABOUT THE TRANSACTION, NOT A TOUR OF THE HOUSE. The photo shows the ` +
    `home and a spec grid directly above your paragraph already lists the price, beds, ` +
    `baths, square feet, lot and type. DO NOT LIST THEM BACK — a paragraph that recites ` +
    `the grid is a failure.\n\n` +
    `HARD RULES.\n` +
    `1. Every number you write must appear in the SOURCES below. No others.\n` +
    `2. *** YOU DO NOT KNOW ANYTHING ABOUT TIME. *** You do not know how long this home ` +
    `was on the market. You do not know when it went under contract, or how many days that ` +
    `took. You do not know when the price was cut, or whether it was cut before or after ` +
    `any contract. NEVER write a number of days, weeks or months. NEVER write "after N ` +
    `days", "days on market", "it took", "before a contract was reached", "after the price ` +
    `cut", or any sentence that puts two events in an order. NEVER say it was fast, quick, ` +
    `slow, "didn't last", or "snapped up". NEVER compare this home's timing to the area's ` +
    `typical. A paragraph that does ANY of these is thrown away.\n` +
    `3. A FACT ABOUT THE HOME IS NOT ONLY A NUMBER. You may NOT assert a view, water, a ` +
    `canal, a pool, a garage, a lanai, a storey count, a finish, a renovation, a school, ` +
    `a floor plan, or any neighborhood character unless the SOURCES state it. You have ` +
    `never seen this house.\n` +
    `4. Never add a selling claim of your own — "priced to move", "won't last", "a rare ` +
    `opportunity", "a second chance" are YOUR words, not facts. Do not editorialize about ` +
    `scale, value, or what the price "means".\n` +
    `5. Do not claim the home SOLD or CLOSED. It is under contract.\n` +
    `6. YOU DO NOT KNOW THE OFFER. The list price is the SELLER'S ASK — it is NOT what the ` +
    `buyer agreed to pay, and no source here states the accepted price or any term of the ` +
    `contract. Never write that an offer came in "at the asking price", "at full price", ` +
    `"over ask", "below ask", or that the seller "accepted the ask".\n` +
    `7. If the agent's own description is provided, you may draw ONE true detail from it, ` +
    `restated faithfully.\n\n` +
    `What you MAY say: that it is under contract, that backup offers are open, the sourced ` +
    `size of the price cut (with NO claim about when it happened), that it is new ` +
    `construction if the sources say so, and one true detail from the agent's description.\n\n` +
    `No hype, no exclamation marks. Plain, confident, specific. Return ONLY the paragraph.`;

  const user = `SOURCES:\n${sources.join("\n")}\n\nWrite the paragraph.`;
  const sourceText = sources.join(" ");

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const msg = await getAnthropic("email_build").messages.create({
        model: EMAIL_MODEL_SONNET,
        max_tokens: 400,
        system,
        messages: [{ role: "user", content: user }],
      });
      const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
      if (!text) continue;
      // THE HARD BLOCK. An invented attribute, a fabricated contract term, or ANY
      // timing claim never ships — not once, not "it's probably right". Guessing
      // correctly is luck, not sourcing.
      if (proseViolations(text, sourceText).length === 0) return text;
    } catch {
      break;
    }
  }
  // Two strikes (or an API failure): the deterministic note, which fabricates nothing.
  return fallbackNote(facts);
}

// ── The builder ──────────────────────────────────────────────────────────────

export async function buildUnderContract(ctx: RecipeBuildContext): Promise<EmailDoc | null> {
  const { facts, currentDoc } = ctx;
  // No subject → nothing is under contract. Fall through to the generic author
  // rather than announcing a house we don't have (never refuse, never fake one).
  if (!facts) return null;

  // Both timing facts, in parallel. Each is independently best-effort: a miss on
  // either becomes an OPEN SLOT, never a zero and never a guess.
  //
  // NOTE WHAT IS *NOT* HERE: any subtraction. The list date is formatted as a DATE and
  // the ZIP median is carried as an AREA fact. They are never combined, because the
  // quantity that would come out of combining them (days to contract) is not a
  // quantity either of them holds.
  const zip = facts.zip ?? ctx.zip;
  const [listDateIso, snapshot] = await Promise.all([
    resolveSubjectListDate(facts).catch(() => null),
    zip ? marketSnapshotForZip(zip).catch(() => null) : Promise.resolve(null),
  ]);

  const areaDom = snapshot?.medianDom ?? null;
  const timing: MarketTiming | null =
    areaDom != null && zip ? { areaDom, zip, asOf: snapshot!.asOf } : null;

  const doc = buildUnderContractGrid({
    facts,
    current: currentDoc,
    listedOn: formatListDate(listDateIso),
    timing,
  });

  // PROSE — this recipe's own triple-guarded narrator. It writes prose and nothing
  // else; an invented attribute, a fabricated contract term, or ANY timing claim is
  // caught and never ships.
  //
  // LANDMINE: fillNarrative SKIPS a text block that already has content, so CLEAR
  // first. (This grid leaves the slot empty by design, but the doc on the canvas may
  // not — and that is how 2,000 characters of raw MLS copy shipped once already.)
  const narrative = await authorUnderContractNote(facts).catch(() => null);
  return narrative ? fillNarrative(clearNarrativeSlots(doc), narrative) : doc;
}
