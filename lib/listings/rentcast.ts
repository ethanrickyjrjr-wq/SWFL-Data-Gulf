// lib/listings/rentcast.ts
//
// RentCast is DEAD — no key configured, never call api.rentcast.io again (see
// feedback_no-rentcast-dont-relitigate memory, LOCKED 2026-07-01). `select.ts` reads
// listings from `data_lake.listing_state` (populated daily by
// ingest/pipelines/listing_lifecycle) instead of any live vendor call.
//
// What survives here: the `Listing` shape + `normalizeListing` coercion helper —
// still the shared listing type used across select.ts/build-week.ts/social/design/
// author.ts, and still exercised by listings.test.ts's fixtures.

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
  /** MLS listing photo from SteadyAPI (realtor.com CDN). Undefined when not enriched. */
  photoUrl?: string;
  /** Feed-carried listing page URL, VERBATIM (broker-site feed). Never constructed
   *  from an id (handoff §2.3 — minted URLs 404). Unset until the wave-5 feed
   *  join populates it; the artifact-link resolver treats absence as "no link". */
  listingUrl?: string;
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
