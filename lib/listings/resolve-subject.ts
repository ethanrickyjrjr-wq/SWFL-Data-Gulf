// lib/listings/resolve-subject.ts
//
// Resolve a typed SUBJECT listing address → that property's OWN for-sale record
// (real photo + list price + beds/sqft) as ListingFacts, so the New Listing recipe
// fills its fixed grid (buildListingFlyer) from the actual house instead of the
// generic author's ZIP/comp grab-bag. This is the address lane that pairs with the
// existing pasted-URL lane (listing-scrape.ts) — both feed the SAME flyer builder.
//
// Empty-tolerant by contract (four-lane / ODD): no geocode, out of the SteadyAPI
// footprint (Lee 12071 / Collier 12021), no address match, or no key → null, and
// the caller falls back to the "paste your listing link or add a photo" ask. Never
// throws, never invents a number: every field is the record's own value.
//
// LAKE-FIRST (07/19/2026). The vendor /search address-slug lane BROKE: a
// `location=<street>_<city>_FL_<zip>` slug now returns rows byte-identical to the
// bare city slug (probed live 07/19/2026 — the "centers on the exact address"
// behavior verified 07/08/2026 is gone), and the city-scan fallback reads at most
// ~800 rows of cities that hold thousands of actives. Net effect: nearly every
// subject address missed, and every address-spine recipe shipped an empty
// skeleton. The nightly sweep already lands these same listings in
// data_lake.listing_state (surfaced through the listing_dom authority view), so
// OUR OWN LAKE is now the primary resolver — four-lane lane 1 — with the vendor
// slug + city scan kept as fallbacks for listings the sweep hasn't landed yet.
//
// The photo-search feed (fetchPhotoListings) returns for-sale listings WITH photos
// keyed by CITY; we page it and match the subject by its canonicalized street line
// ("16447 Rainbow Meadows Court" ≡ the record's "16447 Rainbow Meadows Ct").
import { geocodeAddress, type GeocodeFn } from "@/lib/geo/geocode-address";
import { fetchPhotoListings, fetchNearbyValues } from "./steadyapi";
import {
  lakeRowToListing,
  healFlooredRows,
  LAKE_LISTING_COLUMNS,
  type LakeListingRow,
} from "./select";
// KNOWN-DEBT(data_lake: listing_state/listing_dom live in the data_lake schema, which
// the typed Supabase client intentionally does not cover — see utils/supabase/service-role.ts):
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import type { Listing } from "./rentcast";
import type { ListingFacts } from "@/lib/email/listing-scrape";

export type FetchListingsFn = (opts: {
  city: string;
  state?: string;
  limit?: number;
  offset?: number;
  /** Full address `location` slug override — query the exact address directly. */
  location?: string;
}) => Promise<Listing[]>;

/** The bath lane's fetcher — injectable so the offline test never touches the network. */
export type FetchNearbyFn = (opts: {
  lat: number;
  lon: number;
  limit?: number;
}) => Promise<{ addressLine: string; baths: number | null }[]>;

/** The FREE bath lane — LeePA layer-23 counts served through lee_comp_sales_v
 *  (wired 08/02/2026), keyed by house number + ZIP. Injectable for offline tests. */
export type FetchLeePaBathsFn = (q: {
  houseNumber: string;
  zip: string | null;
}) => Promise<{ addressLine: string; baths: number | null }[]>;

/** Lane-1 candidate fetcher — our own lake, keyed by house number + ZIP (or city).
 *  Returns CANDIDATES; the resolver applies the one canonical street match. */
export type FetchLakeSubjectFn = (q: {
  houseNumber: string;
  zip: string | null;
  city: string;
}) => Promise<Listing[]>;

/** Lane-0 candidate fetcher — our own lake, keyed by the vendor's EXACT numeric
 *  listing id (never a street-text compare). Returns candidates; the resolver takes
 *  the first live row, since an id match needs no further disambiguation. */
export type FetchLakeByIdFn = (propertyId: string) => Promise<Listing[]>;

export interface ResolveSubjectDeps {
  /** Nearby-values fetcher — the PAID bath fallback (/search carries no bath count). */
  fetchNearby?: FetchNearbyFn;
  /** Free bath fallback — LeePA via lee_comp_sales_v; tried BEFORE fetchNearby. */
  fetchLeePaBaths?: FetchLeePaBathsFn;
  /** Injectable geocoder — tests never touch Mapbox/Census. */
  geocode?: GeocodeFn;
  /** Injectable lake candidates feed — tests never touch Supabase. */
  fetchLakeCandidates?: FetchLakeSubjectFn;
  /** Injectable EXACT-ID lake feed — see `extractRealtorPropertyId`. */
  fetchLakeById?: FetchLakeByIdFn;
  /** Injectable city listings feed — tests never touch SteadyAPI. */
  fetchListings?: FetchListingsFn;
  /** Pages of ~200 to scan for the subject before giving up (1 Steady call each). */
  maxPages?: number;
}

/**
 * A pasted realtor.com detail-page URL carries the vendor's own numeric listing id
 * in its trailing slug — "..._M68630-97870". That id is an EXACT join key against
 * `data_lake.listing_state`/`listing_dom`'s `property_id` column (verified live
 * 08/06/2026: 4140 Horsecreek Blvd's `property_id` is "6863097870", exactly that id
 * with the dash removed).
 *
 * *** WHY THIS EXISTS — the Horsecreek postmortem, same day. *** A correctly-typed
 * "4140 Horse Creek Blvd" MISSED the lake's own "4140 Horsecreek Blvd" through
 * `canonStreet`, which folds suffix abbreviations and directionals but has no rule for
 * a compound street name the MLS feed spells as one word. That is a real, structural
 * gap in ANY street-text matcher — abbreviations and spacing drift are not the same
 * failure, and this one has no text-normalization fix. An id needs no normalization at
 * all: it either equals the stored value or it doesn't.
 *
 * Only realtor.com's id shape is recognized — other vendors' URLs return null rather
 * than guessing at a slug format never verified against a real row.
 */
export function extractRealtorPropertyId(text: string): string | null {
  const m = /realtor\.com\/[^\s"'<>]*_M(\d+)-(\d+)\b/i.exec(String(text ?? ""));
  return m ? `${m[1]}${m[2]}` : null;
}

/** Default lane-0 impl: an EXACT `property_id` read off the same authority view the
 *  street-text lane uses (`listing_dom`) — free, no geocode, no county gate. Empty-
 *  tolerant: no creds, no row, any query error → `[]`, never throws (four-lane/ODD). */
async function fetchLakeCandidatesById(propertyId: string): Promise<Listing[]> {
  if (!propertyId) return [];
  try {
    const db = createServiceRoleClientUntyped();
    const { data } = await db
      .schema("data_lake")
      .from("listing_dom")
      .select(LAKE_LISTING_COLUMNS)
      .eq("sale_or_rent", "sale")
      .eq("property_id", propertyId)
      .limit(5);
    if (!Array.isArray(data)) return [];
    const rows = data as unknown as LakeListingRow[];
    await healFlooredRows(rows);
    return rows.map(lakeRowToListing).filter((l): l is Listing => l !== null);
  } catch {
    return [];
  }
}

/** Default lane-1 impl: active for-sale rows from the listing_dom authority view
 *  (nightly sweep — no live vendor call, no per-request cost), narrowed to the
 *  subject's house number + ZIP so the fetch stays tiny. Empty-tolerant: no creds,
 *  no rows, any query error → `[]`, never throws (four-lane/ODD contract). */
async function fetchLakeSubjectCandidates(q: {
  houseNumber: string;
  zip: string | null;
  city: string;
}): Promise<Listing[]> {
  try {
    const db = createServiceRoleClientUntyped();
    let sel = db
      .schema("data_lake")
      .from("listing_dom")
      .select(LAKE_LISTING_COLUMNS)
      .eq("sale_or_rent", "sale")
      .eq("state", "active")
      .ilike("street_address", `${q.houseNumber} %`)
      .limit(25);
    sel = q.zip ? sel.eq("zip_code", q.zip) : sel.ilike("city", q.city);
    const { data } = await sel;
    if (!Array.isArray(data)) return [];
    const rows = data as unknown as LakeListingRow[];
    // Probe-on-use DOM healing, same as the city feed (select.ts): a floored row
    // being SURFACED gets its true list date resolved + persisted, so the flyer's
    // DOM cell is real. Capped inside healFlooredRows; failures keep the floor.
    await healFlooredRows(rows);
    return rows.map(lakeRowToListing).filter((l): l is Listing => l !== null);
  } catch {
    return [];
  }
}

/** Default free-bath-lane impl: LeePA layer-23 counts through lee_comp_sales_v
 *  (beds/baths landed 08/02/2026 behind the view's 1-10 sanity ceiling), narrowed
 *  to house number + ZIP so the fetch stays tiny. Empty-tolerant: no creds, no
 *  rows, any query error → `[]`, never throws (four-lane/ODD contract). */
async function fetchLeePaBathsFromLake(q: {
  houseNumber: string;
  zip: string | null;
}): Promise<{ addressLine: string; baths: number | null }[]> {
  if (!q.houseNumber || !q.zip) return [];
  try {
    const db = createServiceRoleClientUntyped();
    const { data } = await db
      .schema("data_lake")
      .from("lee_comp_sales_v")
      .select("address_line, baths")
      .eq("zip_code", q.zip)
      .ilike("address_line", `${q.houseNumber} %`)
      .limit(25);
    if (!Array.isArray(data)) return [];
    return (data as { address_line: string | null; baths: number | null }[])
      .filter((r) => r.address_line)
      .map((r) => ({ addressLine: r.address_line as string, baths: r.baths }));
  } catch {
    return [];
  }
}

/** Standard USPS-ish street-suffix folding so "Court" and "Ct" canonicalize equal. */
const SUFFIX: Record<string, string> = {
  street: "st",
  st: "st",
  avenue: "ave",
  ave: "ave",
  av: "ave",
  boulevard: "blvd",
  blvd: "blvd",
  drive: "dr",
  dr: "dr",
  lane: "ln",
  ln: "ln",
  road: "rd",
  rd: "rd",
  court: "ct",
  ct: "ct",
  terrace: "ter",
  ter: "ter",
  place: "pl",
  pl: "pl",
  circle: "cir",
  cir: "cir",
  way: "way",
  parkway: "pkwy",
  pkwy: "pkwy",
  trail: "trl",
  trl: "trl",
  loop: "loop",
  cove: "cv",
  cv: "cv",
  point: "pt",
  pt: "pt",
  bend: "bnd",
  bnd: "bnd",
  highway: "hwy",
  hwy: "hwy",
  crossing: "xing",
  xing: "xing",
  run: "run",
  pass: "pass",
  // Directionals fold both ways so "10th Street North" ≡ the vendor's "10th St N"
  // (USPS-standard). Without these, any N/S/E/W address silently missed.
  north: "n",
  n: "n",
  south: "s",
  s: "s",
  east: "e",
  e: "e",
  west: "w",
  w: "w",
  northeast: "ne",
  ne: "ne",
  northwest: "nw",
  nw: "nw",
  southeast: "se",
  se: "se",
  southwest: "sw",
  sw: "sw",
};

/** A street line → a canonical token string for matching: lowercased, punctuation
 *  removed, unit/apt tokens dropped, standard suffix abbreviations applied, and
 *  directionals folded. Both the typed subject and the vendor record run through
 *  this, so surface differences (Court/Ct, "N."/"n") never block a real match. */
export function canonStreet(line: string): string {
  return String(line ?? "")
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\b(?:apt|unit|ste|suite|lot)\s*\w+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => SUFFIX[w] ?? w)
    .join(" ");
}

/**
 * Space-insensitive canonical-street equality — the compound-word rule the Horsecreek
 * postmortem said "has no text-normalization fix." It does: an MLS feed spelling
 * "Horse Creek" as "Horsecreek" (or the operator typing "Park Shore" against the
 * feed's "Parkshore" — 08/19/2026, property_id 5601341444, a $6.9M listing rendered
 * as an empty skeleton over data we held) differs ONLY by internal spacing, so two
 * canonical lines that are equal with spaces removed are the same street line.
 * FULL-string equality only — a despaced prefix ("767park…") would let Park Ave
 * swallow Parkshore, so prefix comparisons stay space-faithful.
 */
export function sameCanonStreet(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || a.replace(/ /g, "") === b.replace(/ /g, "");
}

/** The street line of a typed address — everything before the first comma. */
function streetLineOf(address: string): string {
  return (
    String(address ?? "")
      .split(",")[0]
      ?.trim() ?? ""
  );
}

/** The city token — the comma-segment after the street, with any trailing state /
 *  ZIP stripped. Falls back to the geocoder's matched place's city segment. */
function cityOf(address: string, matched: string): string {
  const fromInput = commaCity(address);
  return fromInput || commaCity(matched);
}
export function commaCity(s: string): string {
  const parts = String(s ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const cand = parts[1] ?? "";
  // Drop a leading/trailing state word or ZIP so "Fort Myers FL 33908" → "Fort Myers".
  const cleaned = cand
    .replace(/\b(fl|florida|united states|usa)\b/gi, " ")
    .replace(/\b\d{5}(?:-\d{4})?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // A pure state/number segment (city missing) yields "" → caller falls back.
  return /[a-z]/i.test(cleaned) ? cleaned : "";
}

function usd(n: number): string {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** Vendor record → ListingFacts (the shape buildListingFlyer fills). A missing
 *  field is simply omitted — never a zero, never a guessed value. The citation is
 *  the SWFL Data Gulf root, never the vendor permalink (listing-citation policy). */
function toFacts(l: Listing, geoZip: string | null, subject: string): ListingFacts {
  const address =
    l.formattedAddress ||
    [l.addressLine1, l.city, l.state, l.zipCode].filter(Boolean).join(", ") ||
    subject;
  return {
    address,
    city: l.city || undefined,
    state: l.state || undefined,
    zip: l.zipCode || geoZip || undefined,
    price: l.price != null ? usd(l.price) : undefined,
    beds: l.bedrooms != null ? String(l.bedrooms) : undefined,
    baths: l.bathrooms != null ? String(l.bathrooms) : undefined,
    sqft: l.squareFootage != null ? String(l.squareFootage) : undefined,
    // The vendor row DOES carry these two and we were dropping them on the floor —
    // the flyer has always read facts.lotSize / facts.propertyType (the scrape lane
    // fills them), so the address lane rendered "Lot" and "Type" as bare labels over
    // data we already held. lotSize is ACRES by convention (see steadyapi.ts);
    // lake rows carry raw floats, so round to 2dp for display (never re-derive).
    lotSize: l.lotSize != null ? `${Math.round(l.lotSize * 100) / 100} ac` : undefined,
    propertyType: l.propertyType || undefined,
    yearBuilt: l.yearBuilt != null ? String(l.yearBuilt) : undefined,
    lat: typeof l.latitude === "number" ? l.latitude : undefined,
    lon: typeof l.longitude === "number" ? l.longitude : undefined,
    // What we can actually SAY about this house (the feed carries no MLS remarks).
    ...(l.isNewConstruction != null ? { isNewConstruction: l.isNewConstruction } : {}),
    ...(l.isPriceReduced != null ? { isPriceReduced: l.isPriceReduced } : {}),
    ...(l.priceReduction != null ? { priceReduction: usd(l.priceReduction) } : {}),
    photos: l.photoUrl ? [l.photoUrl] : [],
    // The flyer uses sourceUrl for the hero photo link + the CTA; keep it on our
    // own site, never the realtor.com permalink (never surface a vendor deep link).
    sourceUrl: "https://www.swfldatagulf.com",
  };
}

/**
 * Resolve a subject listing address to its own for-sale record. Returns null on any
 * miss (empty input, geocode miss, out of Lee/Collier, no matching for-sale record
 * with a photo, or no key) — the caller then asks for a link/photo. Never throws.
 */
export async function resolveSubjectListing(
  address: string | null | undefined,
  deps: ResolveSubjectDeps = {},
): Promise<ListingFacts | null> {
  const subject = String(address ?? "").trim();
  if (!subject) return null;

  const fetchListings = deps.fetchListings ?? fetchPhotoListings;
  // Default to the real endpoint in prod; the offline test injects a stub so resolving a
  // subject still makes ZERO live calls (the contract this file has always held).
  const fetchNearby: FetchNearbyFn = deps.fetchNearby ?? fetchNearbyValues;
  const fetchLeePa: FetchLeePaBathsFn = deps.fetchLeePaBaths ?? fetchLeePaBathsFromLake;
  const maxPages = Math.max(1, deps.maxPages ?? 4);
  const PAGE = 200;

  // 0) THE EXACT VENDOR ID — tried BEFORE geocoding, because it needs no address text
  //    at all. Beats every lane below it: no geocode call, no county gate, no
  //    street-suffix or compound-word normalization to get right. See
  //    `extractRealtorPropertyId` for why this lane exists (the Horsecreek postmortem).
  const idHint = extractRealtorPropertyId(subject);
  if (idHint) {
    const fetchById = deps.fetchLakeById ?? fetchLakeCandidatesById;
    const idHit = (await fetchById(idHint).catch(() => [] as Listing[])).find(Boolean);
    if (idHit) {
      const facts = toFacts(idHit, idHit.zipCode || null, subject);
      const full = [idHit.addressLine1, idHit.city, idHit.state, idHit.zipCode]
        .filter(Boolean)
        .join(", ");
      if (full) facts.address = full;
      if (idHit.domIsFloor !== true && idHit.daysOnMarket != null && idHit.daysOnMarket >= 0) {
        facts.daysOnMarket = idHit.daysOnMarket;
      }
      // The MATCHED record's own street, never the raw pasted text — an id hit has
      // already settled identity, so this is purely for the baths lane's canonical key.
      const idTarget = canonStreet(idHit.addressLine1 || idHit.formattedAddress);
      return withBaths(facts, idTarget, fetchLeePa, fetchNearby);
    }
    // An id was found but isn't in the lake yet (not swept, or genuinely elsewhere) —
    // fall through to the ordinary address-text lanes below. A URL alone rarely parses
    // as a usable street/city, so this commonly still ends in an honest null, same as
    // it always has; this lane can only ADD a resolve, never remove one.
  }

  let geo;
  try {
    geo = await geocodeAddress(subject, deps.geocode ? { geocode: deps.geocode } : {});
  } catch {
    return null;
  }
  if (!geo) return null;
  // The photo feed covers the SteadyAPI footprint — Lee (12071) / Collier (12021).
  if (geo.countyFips !== "12071" && geo.countyFips !== "12021") return null;

  const city = cityOf(subject, geo.matchedAddress);
  const target = canonStreet(streetLineOf(subject));
  if (!city || !target) return null;

  const matches = (r: Listing): boolean => {
    const rc = canonStreet(r.addressLine1 || r.formattedAddress);
    return (
      sameCanonStreet(rc, target) || rc.startsWith(target + " ") || target.startsWith(rc + " ")
    );
  };

  // 0) OUR OWN LAKE — lane 1 of the four-lane order, and since 07/19/2026 the
  //    primary lane outright: the vendor slug lane below stopped centering on the
  //    address (see header), so the sweep we already run nightly is what actually
  //    finds the subject. Tiny fetch (house number + ZIP), canonical street match,
  //    zero vendor quota.
  const houseNumber = /^\d+$/.test(target.split(" ")[0] ?? "") ? target.split(" ")[0]! : "";
  if (houseNumber) {
    const fetchLake = deps.fetchLakeCandidates ?? fetchLakeSubjectCandidates;
    const lakeRows = await fetchLake({ houseNumber, zip: geo.zip ?? null, city }).catch(
      () => [] as Listing[],
    );
    const lakeHit = lakeRows.find(matches);
    if (lakeHit) {
      const facts = toFacts(lakeHit, geo.zip, subject);
      // The lake row's formattedAddress is the bare street line — print the full one.
      const full = [lakeHit.addressLine1, lakeHit.city, lakeHit.state, lakeHit.zipCode]
        .filter(Boolean)
        .join(", ");
      if (full && !(facts.address ?? "").includes(",")) facts.address = full;
      // THE DOM CELL — from our own per-listing DOM root (listing_dom, healed above).
      // A first-seen floor ("at least N") is never printed as an exact count; recipes
      // holding this skip the two-call vendor list-date chain entirely.
      if (
        lakeHit.domIsFloor !== true &&
        lakeHit.daysOnMarket != null &&
        lakeHit.daysOnMarket >= 0
      ) {
        facts.daysOnMarket = lakeHit.daysOnMarket;
      }
      return withBaths(facts, target, fetchLeePa, fetchNearby);
    }
  }

  // 1) DIRECT address query — SteadyAPI used to center its result set on the exact
  //    address slug ("850-10th-St-N_Naples_FL_34102") so the subject sat right at
  //    the top (verified 07/08/2026). That behavior BROKE by 07/19/2026 (the slug
  //    now returns the plain city feed — see header), but the call is kept: it
  //    costs the same as one city page, and if the vendor restores centering this
  //    lane silently starts hitting again for listings the sweep hasn't landed.
  if (geo.zip) {
    const slug =
      `${streetLineOf(subject).trim().replace(/\s+/g, "-")}` +
      `_${city.replace(/\s+/g, "-")}_FL_${geo.zip}`;
    try {
      const direct = await fetchListings({ city, state: "FL", location: slug, limit: PAGE });
      const hit = direct.find(matches);
      if (hit) return withBaths(toFacts(hit, geo.zip, subject), target, fetchLeePa, fetchNearby);
    } catch {
      /* fall through to the city scan */
    }
  }

  // 2) Fallback — page the city feed (the pre-07/08 behavior) in case the direct
  //    slug didn't center on the address (odd formatting, missing ZIP).
  for (let page = 0; page < maxPages; page++) {
    let rows: Listing[];
    try {
      rows = await fetchListings({ city, limit: PAGE, offset: page * PAGE });
    } catch {
      return null;
    }
    if (!rows.length) break;
    const hit = rows.find(matches);
    if (hit) return withBaths(toFacts(hit, geo.zip, subject), target, fetchLeePa, fetchNearby);
    if (rows.length < PAGE) break; // last (short) page — no more to scan
  }
  return null;
}

/**
 * BATHS. The /search row carries beds, sqft and lot — and no bath count at all, which
 * is why every listing in the product shipped a blank "Baths" cell. Two fallback
 * lanes, in provenance order (P1b Step 2, 08/02/2026):
 *
 *   1. FREE — LeePA layer-23 counts through lee_comp_sales_v, matched on the
 *      canonical street key. Fills ONLY on exactly one matching parcel: two folios
 *      sharing a key is an ambiguity, and an ambiguous bath count is a guess.
 *   2. PAID — /nearby-home-values: a property is always the nearest property to its
 *      OWN coordinates, so the subject returns as its own first row (verified live
 *      07/13/2026 — 326 Shore Dr → baths 3.5). One vendor call, only when LeePA missed.
 *
 * A count the record already carries is never overwritten. Any miss leaves baths
 * undefined and the cell simply doesn't render. Never invents a count.
 */
async function withBaths(
  facts: ListingFacts,
  target: string,
  fetchLeePa: FetchLeePaBathsFn,
  fetchNearby: FetchNearbyFn,
): Promise<ListingFacts> {
  if (facts.baths) return facts;

  const houseNumber = /^\d+$/.test(target.split(" ")[0] ?? "") ? target.split(" ")[0]! : "";
  if (houseNumber) {
    try {
      const parcels = await fetchLeePa({ houseNumber, zip: facts.zip ?? null });
      const hits = parcels.filter((p) => sameCanonStreet(canonStreet(p.addressLine), target));
      if (hits.length === 1 && hits[0]!.baths != null) {
        facts.baths = String(hits[0]!.baths);
        return facts;
      }
    } catch {
      /* free lane failed — fall through to the paid lane */
    }
  }

  if (facts.lat == null || facts.lon == null) return facts;
  try {
    const nearby = await fetchNearby({ lat: facts.lat, lon: facts.lon, limit: 25 });
    const self = nearby.find((c) => sameCanonStreet(canonStreet(c.addressLine), target));
    if (self?.baths != null) facts.baths = String(self.baths);
  } catch {
    /* baths stay absent — an empty cell is dropped, never faked */
  }
  return facts;
}
