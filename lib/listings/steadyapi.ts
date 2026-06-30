// lib/listings/steadyapi.ts
//
// SteadyAPI real-estate search client — returns for-sale listings WITH photo URLs
// (realtor.com CDN, rdcpix.com). Used to enrich the email + social lab with real
// listing photos.
//
// VERIFIED LIVE 2026-06-30 (RULE 0.4): GET /v1/real-estate/search returns photo_url
// per listing, 6 259 Cape Coral results confirmed. Auth: Bearer token. Location format:
// "City-Name_FL". Cloudflare requires browser-like headers — plain fetch() from Next.js
// server works; urllib default UA is blocked.
//
// Empty-tolerant (four-lane / ODD): no key, non-200, quota, or bad body → [], never throws.
// Hour-cached to be frugal on the 10 000 req/month Starter tier.

import type { Listing } from "./rentcast";

const BASE = "https://api.steadyapi.com/v1/real-estate";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-site",
  Origin: "https://steadyapi.com",
  Referer: "https://steadyapi.com/",
};

// "Cape Coral" → "Cape-Coral_FL", "Fort Myers" → "Fort-Myers_FL"
function cityToSlug(city: string, state = "FL"): string {
  return `${city.trim().replace(/\s+/g, "-")}_${state}`;
}

interface RawResult {
  property_id?: unknown;
  price?: { amount?: unknown; display?: unknown };
  status?: unknown;
  permalink?: unknown;
  photo_url?: unknown;
  source_type?: unknown;
  description?: {
    beds?: unknown;
    sqft?: unknown;
    lot_sqft?: unknown;
  };
  location?: {
    lat?: unknown;
    lon?: unknown;
    county_fips?: unknown;
  };
  flags?: {
    is_new_listing?: unknown;
    is_price_reduced?: unknown;
    is_new_construction?: unknown;
  };
}

function normalizeResult(raw: RawResult, city: string, state: string): Listing | null {
  const id = typeof raw.property_id === "string" ? raw.property_id : String(raw.property_id ?? "");
  if (!id) return null;
  const price =
    typeof raw.price?.amount === "number"
      ? raw.price.amount
      : typeof raw.price?.amount === "string"
        ? Number(raw.price.amount)
        : null;
  const lat =
    typeof raw.location?.lat === "number"
      ? raw.location.lat
      : typeof raw.location?.lat === "string"
        ? Number(raw.location.lat)
        : null;
  const lon =
    typeof raw.location?.lon === "number"
      ? raw.location.lon
      : typeof raw.location?.lon === "string"
        ? Number(raw.location.lon)
        : null;
  const photoUrl = typeof raw.photo_url === "string" && raw.photo_url ? raw.photo_url : undefined;
  const permalink = typeof raw.permalink === "string" ? raw.permalink : "";
  // last path segment: "1403-NE-19th-Ter_Cape-Coral_FL_33909_M54931-01642"
  const lastSegment = permalink.split("/").pop() ?? "";
  const slugParts = lastSegment.split("_");
  const addressLine1 = (slugParts[0] ?? "").replace(/-/g, " ");
  const zipCode = slugParts.find((p) => /^\d{5}$/.test(p)) ?? "";
  const beds =
    typeof raw.description?.beds === "number"
      ? raw.description.beds
      : typeof raw.description?.beds === "string"
        ? Number(raw.description.beds)
        : null;
  const sqft =
    typeof raw.description?.sqft === "number"
      ? raw.description.sqft
      : typeof raw.description?.sqft === "string"
        ? Number(raw.description.sqft)
        : null;
  return {
    id: `sa_${id}`,
    formattedAddress: [addressLine1, city, state, zipCode].filter(Boolean).join(", "),
    addressLine1,
    city,
    state,
    zipCode,
    county: "",
    latitude: lat != null && Number.isFinite(lat) ? lat : null,
    longitude: lon != null && Number.isFinite(lon) ? lon : null,
    propertyType: "Single Family",
    bedrooms: beds != null && Number.isFinite(beds) ? beds : null,
    bathrooms: null,
    squareFootage: sqft != null && Number.isFinite(sqft) ? sqft : null,
    lotSize: null,
    yearBuilt: null,
    status: typeof raw.status === "string" ? raw.status : "for_sale",
    price: price != null && Number.isFinite(price) ? price : null,
    listedDate: null,
    removedDate: null,
    lastSeenDate: new Date().toISOString().slice(0, 10),
    daysOnMarket: null,
    mlsName: typeof raw.source_type === "string" ? raw.source_type : null,
    mlsNumber: null,
    photoUrl,
  };
}

/**
 * Fetch for-sale listings with photos for one city via SteadyAPI.
 * Never throws — any failure returns [].
 * Results are hour-cached (Next.js fetch cache).
 */
export async function fetchPhotoListings(opts: {
  city: string;
  state?: string;
  limit?: number;
}): Promise<Listing[]> {
  const key = process.env.PHOTOS_API;
  if (!key || !opts.city) return [];
  const state = opts.state ?? "FL";
  const slug = cityToSlug(opts.city, state);
  const params = new URLSearchParams({ location: slug, offset: "0" });
  try {
    const res = await fetch(`${BASE}/search?${params}`, {
      headers: {
        ...BROWSER_HEADERS,
        Authorization: `Bearer ${key}`,
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!data || typeof data !== "object") return [];
    const body = (data as Record<string, unknown>).body;
    if (!Array.isArray(body)) return [];
    const limit = opts.limit ?? 200;
    return body
      .slice(0, limit)
      .map((r) => normalizeResult(r as RawResult, opts.city, state))
      .filter((l): l is Listing => l !== null && l.photoUrl !== undefined);
  } catch {
    return [];
  }
}
