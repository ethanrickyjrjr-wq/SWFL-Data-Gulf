// lib/listings/rentcast.ts
//
// The RentCast for-sale listings client — the build-time "named source" lane for
// real, current SWFL inventory (price, beds/baths, DOM, lat/lon, MLS number). Used
// by the social grid lab + email lab today; the listing-lifecycle lake build inherits
// this same client later (see the parked lake handoff).
//
// VERIFIED LIVE 2026-06-30 (RULE 0.4): /v1/listings/sale returns the fields below and
// NO photos. Auth header is `X-Api-Key`. No since-cursor, no native ZIP filter (query
// by city), limit caps at 500 with no total-count header.
//
// Empty-tolerant by contract (four-lane / ODD): no key, non-200, 429 quota, or a
// malformed body → `[]`, NEVER a thrown error and NEVER an invented listing. The free
// Developer tier is 50 requests/month, so callers make ONE call per build and the
// fetch is hour-cached.

const RENTCAST_BASE = "https://api.rentcast.io/v1";

/** A normalized for-sale listing. Agent/office contact info (PII) is intentionally
 *  dropped — captions never need it and it should not ride into a deliverable. */
export interface Listing {
  id: string;
  formattedAddress: string;
  addressLine1: string;
  city: string;
  state: string;
  zipCode: string;
  county: string;
  latitude: number | null;
  longitude: number | null;
  propertyType: string;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFootage: number | null;
  lotSize: number | null;
  yearBuilt: number | null;
  status: string;
  price: number | null;
  listedDate: string | null;
  removedDate: string | null;
  lastSeenDate: string | null;
  daysOnMarket: number | null;
  mlsName: string | null;
  mlsNumber: string | null;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const numOrNull = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * Pure: coerce one raw RentCast listing object into a `Listing`, or `null` when it
 * lacks the minimum identity (an id and at least one address line). Reads ONLY the
 * factual fields — `listingAgent`/`listingOffice` (PII) are never touched.
 */
export function normalizeListing(raw: unknown): Listing | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  const formattedAddress = str(r.formattedAddress);
  const addressLine1 = str(r.addressLine1);
  if (!id || (!formattedAddress && !addressLine1)) return null;
  return {
    id,
    formattedAddress: formattedAddress || addressLine1,
    addressLine1: addressLine1 || formattedAddress,
    city: str(r.city),
    state: str(r.state),
    zipCode: str(r.zipCode),
    county: str(r.county),
    latitude: numOrNull(r.latitude),
    longitude: numOrNull(r.longitude),
    propertyType: str(r.propertyType),
    bedrooms: numOrNull(r.bedrooms),
    bathrooms: numOrNull(r.bathrooms),
    squareFootage: numOrNull(r.squareFootage),
    lotSize: numOrNull(r.lotSize),
    yearBuilt: numOrNull(r.yearBuilt),
    status: str(r.status) || "Active",
    price: numOrNull(r.price),
    listedDate: strOrNull(r.listedDate),
    removedDate: strOrNull(r.removedDate),
    lastSeenDate: strOrNull(r.lastSeenDate),
    daysOnMarket: numOrNull(r.daysOnMarket),
    mlsName: strOrNull(r.mlsName),
    mlsNumber: strOrNull(r.mlsNumber),
  };
}

/**
 * Fetch for-sale listings for one city. Never throws — any failure (no key, non-200,
 * 429 quota, network, bad body) returns `[]` so the build degrades to its no-listings
 * path. Hour-cached to stay frugal on the 50/month free tier.
 */
export async function fetchSaleListings(opts: {
  city: string;
  state?: string;
  status?: string;
  limit?: number;
}): Promise<Listing[]> {
  const key = process.env.RENTCAST_API_KEY;
  if (!key || !opts.city) return [];
  const params = new URLSearchParams({
    city: opts.city,
    state: opts.state ?? "FL",
    status: opts.status ?? "Active",
    limit: String(opts.limit ?? 100),
  });
  try {
    const res = await fetch(`${RENTCAST_BASE}/listings/sale?${params}`, {
      headers: { "X-Api-Key": key, Accept: "application/json" },
      // Next.js fetch cache: repeat builds within the hour reuse the response instead
      // of spending another of the 50 monthly free-tier requests.
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map(normalizeListing).filter((l): l is Listing => l !== null);
  } catch {
    return [];
  }
}
