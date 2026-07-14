// lib/listings/listing-detail.ts
//
// Listing DETAIL-page facts — the community lane the index scrape never captured.
//
// Our listing index scrape (ingest/pipelines/listing_lifecycle) reads card-level fields only:
// price, beds, baths, sqft, community NAME. The per-listing detail page carries the facts an
// address build actually wants and we had nowhere to get: whether the community has GOLF, a
// POOL, a clubhouse, whether it is GATED — plus Property SubType (the real condo/single-family
// grain our listing rows collapse to "residential") and Year Built.
//
// Verified against the live page 07/14/2026 (8665 Bay Colony Dr, Naples — fixture
// __fixtures__/johnrwood-detail-condo.html). Markup is server-rendered and flat:
//
//   <li class="field community-features-">
//     <span class="field-name">Community Features: </span>
//     <span class="field-value">Golf, Gated, Tennis Court(s), Street Lights</span>
//   </li>
//
// NOT on the page, on either a single-family or a condo listing (both checked live): HOA FEE.
// An internal note claimed detail pages carry it; they do not. Do not promise it downstream.
// Golf PRESENCE is here; golf STRUCTURE (bundled vs equity, hole count) is nobody's data.
//
// NEVER THROWS. A fetch that 404s, times out, or hits a relaid-out page yields an EMPTY fact
// set — never a partial guess. This is load-bearing: the narrator's claim-gate opens strictly
// on facts present here, so "fetch failed" must degrade to the model staying SILENT about
// golf/pool, not to it inventing them. Empty is a safe answer; a wrong answer is not.

/** One listing's detail-page facts. Every field null/empty when the page didn't state it. */
export interface ListingDetailFacts {
  /** Marketed community/subdivision as the listing states it (e.g. "Port Royal"). */
  subdivision: string | null;
  /** Structural type — "Condominium", "Single Family Residence". The detail page carries the
   *  real grain; our listing rows collapse everything to "residential". */
  propertySubType: string | null;
  yearBuilt: number | null;
  /** "Community Features" — e.g. ["Golf", "Gated", "Tennis Court(s)", "Street Lights"]. */
  communityFeatures: string[];
  /** "Amenities" — e.g. ["Clubhouse", "Fitness Center", "Pool", "Restaurant"]. */
  amenities: string[];
  /** "Other Amenities" — e.g. ["Beachfront", "Pool", "Golf", "Waterfront"]. */
  otherAmenities: string[];
  /** True only when the page SAYS so. `false` means the page listed features and golf was not
   *  among them; `null` means the page never stated community features at all. The distinction
   *  matters — `null` must not be rendered as "no golf". */
  hasGolf: boolean | null;
  hasPool: boolean | null;
  isGated: boolean | null;
  /** Provenance — the page we read it from, for the citation. */
  sourceUrl: string;
  /** True when the page yielded at least one community fact. */
  ok: boolean;
}

export function emptyDetailFacts(sourceUrl: string): ListingDetailFacts {
  return {
    subdivision: null,
    propertySubType: null,
    yearBuilt: null,
    communityFeatures: [],
    amenities: [],
    otherAmenities: [],
    hasGolf: null,
    hasPool: null,
    isGated: null,
    sourceUrl,
    ok: false,
  };
}

/** `<span class="field-name">Label: </span><span class="field-value">Value</span>` — one pass
 *  over the page yields every labelled field regardless of which section it sits in. */
const FIELD_RE =
  /<span class="field-name">\s*([^<:]+?)\s*:\s*<\/span>\s*<span class="field-value">\s*([\s\S]*?)\s*<\/span>/gi;

function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split a comma-joined field value, keeping parenthesised suffixes intact:
 *  "Golf, Tennis Court(s), Street Lights" → ["Golf", "Tennis Court(s)", "Street Lights"]. */
function splitList(v: string): string[] {
  return v
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0 && x.toLowerCase() !== "see remarks" && x.toLowerCase() !== "none");
}

/** Does any entry in these lists name the thing? Substring, case-insensitive — the source writes
 *  "Golf", "Golf Course", "Private Membership"; "Pool" appears as "Pool" and "Community Pool". */
function names(lists: string[][], needle: string): boolean {
  const n = needle.toLowerCase();
  return lists.some((l) => l.some((v) => v.toLowerCase().includes(n)));
}

/** Parse detail-page HTML into community facts. Pure — no I/O, so it tests against a fixture. */
export function parseListingDetail(html: string, sourceUrl: string): ListingDetailFacts {
  const facts = emptyDetailFacts(sourceUrl);
  if (!html) return facts;

  // No length floor: whether we learned anything is decided by whether any labelled field
  // parsed, not by how many bytes arrived. A short page is not automatically a broken one.
  const fields = new Map<string, string>();
  for (const m of html.matchAll(FIELD_RE)) {
    const label = stripTags(m[1]).toLowerCase();
    const value = stripTags(m[2]);
    if (label && value && !fields.has(label)) fields.set(label, value);
  }
  if (fields.size === 0) return facts;

  facts.subdivision = fields.get("subdivision") ?? null;
  facts.propertySubType = fields.get("property subtype") ?? null;

  const yb = fields.get("year built");
  if (yb) {
    const n = Number.parseInt(yb.replace(/[^0-9]/g, ""), 10);
    // A plausible year only — a mangled parse must not become a fabricated build year.
    if (Number.isFinite(n) && n >= 1800 && n <= 2100) facts.yearBuilt = n;
  }

  const cf = fields.get("community features");
  const am = fields.get("amenities");
  const oa = fields.get("other amenities");
  facts.communityFeatures = cf ? splitList(cf) : [];
  facts.amenities = am ? splitList(am) : [];
  facts.otherAmenities = oa ? splitList(oa) : [];

  // Only assert true/false when the page actually stated a feature list. No list → null, and
  // null must never render as "this community has no golf".
  const stated =
    facts.communityFeatures.length + facts.amenities.length + facts.otherAmenities.length > 0;
  if (stated) {
    const lists = [facts.communityFeatures, facts.amenities, facts.otherAmenities];
    facts.hasGolf = names(lists, "golf");
    facts.hasPool = names(lists, "pool");
    facts.isGated =
      names(lists, "gated") && !facts.communityFeatures.some((v) => /^non-?gated$/i.test(v.trim()));
  }

  facts.ok =
    stated ||
    facts.subdivision !== null ||
    facts.propertySubType !== null ||
    facts.yearBuilt !== null;
  return facts;
}

/**
 * The community fact, rendered for a narrator's source list. ONE AUTHORITY — every recipe that
 * tells a model about the community reads it from here, so the "these are the COMMUNITY's, not
 * the HOUSE's" warning cannot drift out of one copy.
 *
 * WHY THIS UNLOCKS THE WORD-BANS WITHOUT EDITING THEM. The prose guards flag an attribute word
 * only when the PARAGRAPH says it and the SOURCES do not. "golf"/"pool" were never banned
 * outright — we simply held no fact stating them, so any use WAS invention. Put the fact in the
 * sources and the word legitimises itself; leave it out (fetch failed) and the guard still
 * hard-blocks it. The gate is the FACT, not the vocabulary.
 *
 * THE TRAP IT IS WORDED AGAINST: these belong to the COMMUNITY, not the house. "Pool" here means
 * the community has one — NOT that this home has a private one. The word-guards match words and
 * cannot tell those apart, so the distinction has to be carried in the source text itself.
 *
 * THE NAME ALWAYS SHIPS. Every recipe names the community — including the coming-soon teaser.
 * That email withholds the DOORSTEP (street, number, ZIP), not the map: "coming soon in Bay
 * Colony" is the whole appeal, and nobody drives to a subdivision and knocks on it.
 */
export function communitySourceLine(f: ListingDetailFacts | undefined): string | null {
  if (!f || !f.ok) return null;
  const parts: string[] = [];
  if (f.communityFeatures.length)
    parts.push(`Community features: ${f.communityFeatures.join(", ")}`);
  if (f.amenities.length) parts.push(`Community amenities: ${f.amenities.join(", ")}`);
  if (f.otherAmenities.length) parts.push(`Also noted: ${f.otherAmenities.join(", ")}`);
  if (parts.length === 0) return null;

  const where = f.subdivision ? ` (${f.subdivision})` : "";

  return (
    `THE COMMUNITY${where}, from the listing's own detail page. NAME IT. THESE DESCRIBE THE ` +
    `COMMUNITY, NOT THIS HOUSE — a pool here is the COMMUNITY's pool, and golf here means the ` +
    `COMMUNITY has golf. You may say the community has them. You may NOT say this home has ` +
    `them.\n${parts.join("\n")}`
  );
}

// NO FETCHER LIVES HERE, DELIBERATELY.
//
// `lib/email/listing-scrape.ts#fetchListingFacts` already fetches this exact page — through
// `safeFetchPublicUrl`, the SSRF guard — and holds the HTML. Community facts are parsed from
// THAT html (see `ListingFacts.community`), so the build costs ZERO extra requests and cannot
// grow a second, unguarded egress path. An earlier draft of this file shipped its own bare
// `fetch(listingUrl)`: both a duplicate round-trip per build and an SSRF hole, since the URL
// is attacker-influencable. Parse, don't fetch. If a standalone fetch is ever genuinely needed,
// route it through `safeFetchPublicUrl` — never bare `fetch`.
