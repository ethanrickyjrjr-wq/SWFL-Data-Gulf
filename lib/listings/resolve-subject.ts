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
// throws, never invents a number: every field is the vendor record's own value.
//
// The photo-search feed (fetchPhotoListings) returns for-sale listings WITH photos
// keyed by CITY; we page it and match the subject by its canonicalized street line
// ("16447 Rainbow Meadows Court" ≡ the record's "16447 Rainbow Meadows Ct").
import { geocodeAddress, type GeocodeFn } from "@/lib/geo/geocode-address";
import { fetchPhotoListings } from "./steadyapi";
import type { Listing } from "./rentcast";
import type { ListingFacts } from "@/lib/email/listing-scrape";

export type FetchListingsFn = (opts: {
  city: string;
  state?: string;
  limit?: number;
  offset?: number;
}) => Promise<Listing[]>;

export interface ResolveSubjectDeps {
  /** Injectable geocoder — tests never touch Mapbox/Census. */
  geocode?: GeocodeFn;
  /** Injectable city listings feed — tests never touch SteadyAPI. */
  fetchListings?: FetchListingsFn;
  /** Pages of ~200 to scan for the subject before giving up (1 Steady call each). */
  maxPages?: number;
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
function commaCity(s: string): string {
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
  const maxPages = Math.max(1, deps.maxPages ?? 4);
  const PAGE = 200;

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

  for (let page = 0; page < maxPages; page++) {
    let rows: Listing[];
    try {
      rows = await fetchListings({ city, limit: PAGE, offset: page * PAGE });
    } catch {
      return null;
    }
    if (!rows.length) break;
    const hit = rows.find((r) => {
      const rc = canonStreet(r.addressLine1 || r.formattedAddress);
      return rc === target || rc.startsWith(target + " ") || target.startsWith(rc + " ");
    });
    if (hit) return toFacts(hit, geo.zip, subject);
    if (rows.length < PAGE) break; // last (short) page — no more to scan
  }
  return null;
}
