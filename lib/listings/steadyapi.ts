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
// Hour-cached. Quota: 50,000 req/month (dashboard screenshot 07/16/2026: 10,795 used that
// cycle — supersedes the old "10k Starter tier" guess this header carried). 429/5xx/network errors get
// a bounded jittered retry (see steadyGet) before degrading — a single throttle no longer
// silently reads as "no data".

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

// ── bounded retry (07/16/2026) ────────────────────────────────────────────────
// The vendor's effective rate limit is UNVERIFIED and the evidence disagrees:
// docs.steadyapi.com claims 15 req/s; the account dashboard's failed-request log
// shows a 1 req/s rejection exists on the account ("Rate limit exceeded. Maximum
// 1 request(s) per second.", retry_after: 1 — likely the site demo lane); a live
// 3-concurrent burst with these exact headers passed clean 07/16/2026. Sustained
// un-paced walks DID 429 on 07/07/2026. So when a 429 does arrive, the retry
// waits out a full 1s window (floor below) — correct under every hypothesis; the
// old 0.2–0.6s first backoff could re-collide inside a 1s window. Before retry
// existed, a single 429 in a build session silently became [] — the user read
// "no comps" for data that exists.

/** Why a call finally gave up. Only TRANSIENT failures report — a deterministic
 *  4xx (bad key, bad params, no such resource) degrades silently exactly as
 *  before, because retrying it would burn quota on the same answer. */
export type SteadyDegradeReason = "throttled" | "upstream" | "network";

export interface SteadyFetchDeps {
  fetchImpl?: typeof fetch;
  /** Injectable backoff wait — tests pass a no-op; production sleeps for real. */
  sleep?: (ms: number) => Promise<void>;
  /** Fires once, only when every attempt failed on a TRANSIENT error — lets a
   *  caller say "briefly unavailable" instead of the false "nothing found". */
  onDegrade?: (reason: SteadyDegradeReason) => void;
}

const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 400;
// Vendor answers a 429 with retry_after: 1 (second) — a throttled retry inside that
// window is a guaranteed second 429, so it waits out the window plus a small margin.
const THROTTLE_RETRY_FLOOR_MS = 1_100;
const ATTEMPT_TIMEOUT_MS = 10_000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** One GET against the SteadyAPI base with bounded, jittered exponential backoff
 *  on 429/5xx/network errors only. Returns the OK Response, or null once it gives
 *  up — the callers' empty-tolerant contracts ([]/null, never throw) are unchanged. */
async function steadyGet(
  pathAndQuery: string,
  key: string,
  deps: SteadyFetchDeps,
): Promise<Response | null> {
  const doFetch = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? realSleep;
  let reason: SteadyDegradeReason = "network";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      // full jitter: base·2^(attempt-1) scaled by 0.5–1.5, so concurrent callers
      // never re-collide in step; a THROTTLED retry is additionally floored at the
      // vendor's enforced 1 req/s window (see header) or it cannot succeed.
      let wait = BACKOFF_BASE_MS * 2 ** (attempt - 1) * (0.5 + Math.random());
      if (reason === "throttled") wait = Math.max(wait, THROTTLE_RETRY_FLOOR_MS);
      await sleep(wait);
    }
    try {
      const res = await doFetch(`${BASE}/${pathAndQuery}`, {
        headers: { ...BROWSER_HEADERS, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
        next: { revalidate: 3600 },
      });
      if (res.ok) return res;
      if (!RETRYABLE_STATUS.has(res.status)) return null; // deterministic — same silent degrade as before
      reason = res.status === 429 ? "throttled" : "upstream";
    } catch {
      reason = "network"; // includes the per-attempt timeout
    }
  }
  deps.onDegrade?.(reason);
  return null;
}

/** realtor.com detail-page base, observed VERBATIM in SteadyAPI /search responses
 *  (docs.steadyapi.com, verified 07/11/2026). Used ONLY to promote a bare slug the
 *  same API returns on the nearby lanes — never to mint a URL from an address. */
const RDC_DETAIL_BASE = "https://www.realtor.com/realestateandhomes-detail/";

/** Canonicalize a SteadyAPI `permalink` into a realtor.com detail URL, or undefined.
 *  Accepts exactly two shapes: the full detail URL (verbatim pass-through) and the
 *  bare slug (one path segment, e.g. "765-Geary-St_San-Francisco_CA_94109_M24733-64190").
 *  Anything else — other hosts, other paths, junk — is refused (capture-only moat). */
export function canonicalRealtorUrl(permalink: unknown): string | undefined {
  if (typeof permalink !== "string") return undefined;
  const p = permalink.trim();
  if (!p) return undefined;
  if (p.startsWith(RDC_DETAIL_BASE) && p.length > RDC_DETAIL_BASE.length) return p;
  if (/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(p)) return RDC_DETAIL_BASE + p;
  return undefined;
}

interface RawResult {
  property_id?: unknown;
  /** `reduced_amount` is the size of the CUT, not the old price — the old price is
   *  amount + reduced_amount (verified live 07/13/2026: $595,000 + $104,975 cut,
   *  display "$595,000 (Reduced $104,975)"). */
  price?: { amount?: unknown; display?: unknown; reduced_amount?: unknown };
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
    street_view_url?: unknown;
  };
  /** Real, vendor-stated characteristics of the LISTING — the only descriptive facts
   *  this endpoint carries. A new-listing email is about the house, and these are what
   *  we can say about it without inventing: is it new construction, was the price cut,
   *  is it actually new to market, is it coming soon. */
  flags?: {
    is_new_listing?: unknown;
    is_price_reduced?: unknown;
    is_new_construction?: unknown;
    is_coming_soon?: unknown;
    is_pending?: unknown;
    is_contingent?: unknown;
    is_foreclosure?: unknown;
  };
}

export function normalizeResult(raw: RawResult, city: string, state: string): Listing | null {
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
  const listingUrl = canonicalRealtorUrl(permalink);
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
  const lotSqft =
    typeof raw.description?.lot_sqft === "number"
      ? raw.description.lot_sqft
      : typeof raw.description?.lot_sqft === "string"
        ? Number(raw.description.lot_sqft)
        : null;
  // /search returns NO property-type field on any row (verified live 07/07/2026 against every
  // real-estate endpoint) — property_type is a request-side filter only, one value per call,
  // which this single-page photo fetch doesn't sweep (see ingest/pipelines/listing_lifecycle/
  // extract_api.py's build_type_lookup for the full per-type-sweep design). Asserting "Single
  // Family" for every result was a fabricated fact — a condo or townhouse showed as "Single
  // Family" in listing copy. Land is still cheaply detectable (no beds + a lot_sqft); everything
  // else gets the honest generic "Residential" rather than a specific type we don't hold.
  const propertyType = beds == null && lotSqft ? "Land" : "Residential";
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
    propertyType,
    bedrooms: beds != null && Number.isFinite(beds) ? beds : null,
    bathrooms: null,
    squareFootage: sqft != null && Number.isFinite(sqft) ? sqft : null,
    // Listing.lotSize is ACRES by convention (select.ts sets it from the lake's
    // lot_acres column) — SteadyAPI's description.lot_sqft is square feet, so convert.
    lotSize:
      lotSqft != null && Number.isFinite(lotSqft) && lotSqft > 0
        ? Math.round((lotSqft / 43560) * 100) / 100
        : null,
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
    ...(listingUrl ? { listingUrl } : {}),
    // The descriptive half of the row — dropped until 07/13/2026, which is why a
    // "new listing" email had nothing to SAY about the house and fell back to reciting
    // its own spec cells. These are vendor-stated, never inferred.
    ...(typeof raw.price?.reduced_amount === "number" && raw.price.reduced_amount > 0
      ? { priceReduction: raw.price.reduced_amount }
      : {}),
    ...(typeof raw.flags?.is_new_construction === "boolean"
      ? { isNewConstruction: raw.flags.is_new_construction }
      : {}),
    ...(typeof raw.flags?.is_price_reduced === "boolean"
      ? { isPriceReduced: raw.flags.is_price_reduced }
      : {}),
    ...(typeof raw.flags?.is_new_listing === "boolean"
      ? { isNewListing: raw.flags.is_new_listing }
      : {}),
    ...(typeof raw.location?.street_view_url === "string" && raw.location.street_view_url
      ? { streetViewUrl: raw.location.street_view_url }
      : {}),
  };
}

/**
 * Fetch for-sale listings with photos for one city via SteadyAPI.
 * Never throws — any failure returns [].
 * Results are hour-cached (Next.js fetch cache).
 */
export async function fetchPhotoListings(
  opts: {
    city: string;
    state?: string;
    limit?: number;
    /** Server-side page offset (SteadyAPI honors `offset`) — lets a caller page past
     *  the first ~200 to find a specific address in a large city. Default 0. */
    offset?: number;
    /** Full `location` slug override, e.g. "5370-Holland-St_Naples_FL_34113". When
     *  present, queries that address directly instead of paging the whole city —
     *  SteadyAPI centers the result set on the exact address (verified 07/08/2026).
     *  Far cheaper + more reliable than scanning ~800 city rows for one house. */
    location?: string;
  },
  deps: SteadyFetchDeps = {},
): Promise<Listing[]> {
  const key = process.env.PHOTOS_API;
  if (!key || (!opts.city && !opts.location)) return [];
  const state = opts.state ?? "FL";
  const slug = opts.location ?? cityToSlug(opts.city, state);
  const params = new URLSearchParams({ location: slug, offset: String(opts.offset ?? 0) });
  try {
    const res = await steadyGet(`search?${params}`, key, deps);
    if (!res) return [];
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

// ---------------------------------------------------------------------------
// On-demand comp helper (SteadyAPI Sole-Spine Phase 2B) — two per-point endpoints
// that feed lib/assistant/comp-helper.ts. Verbatim vendor contracts recorded in
// docs/superpowers/specs/2026-06-30-steadyapi-comp-helper-design.md (crawl4ai on
// docs.steadyapi.com, 06/30/2026). Same auth/headers/hour-cache/never-throws shape
// as the /search client above; PHOTOS_API is a Vercel env var (not a repo secret),
// so every path is empty-tolerant and no live call fires without the key.
// ---------------------------------------------------------------------------

function toNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Raw `/nearby-home-values` property (only the fields we read are typed). The
 *  id/url fields ARE listed here so the normalizer can deliberately DROP them. */
export interface RawNearbyProperty {
  property_id?: unknown;
  listing_id?: unknown;
  status?: unknown;
  list_price?: unknown;
  href?: unknown;
  permalink?: unknown;
  address?: { line?: unknown; city?: unknown; state_code?: unknown; postal_code?: unknown };
  description?: { beds?: unknown; baths?: unknown; sqft?: unknown; lot_sqft?: unknown };
  estimates?: { best?: { value?: unknown; date?: unknown } };
  source?: { id?: unknown };
}

/** A nearby comparable. MLS ids stay scrubbed at this boundary: `listing_id` and
 *  `source.id` are dropped and never placed on this object; `propertyId` survives
 *  ONLY as the internal +1 sold-event join key — the render layer never emits it.
 *  `permalink` is CARRIED (canonicalized) as `sourceUrl` since the 07/11/2026
 *  operator unlock: it is the comp's functional click-through link. Citations are
 *  unaffected — they stay domain-level ("SWFL Data Gulf · realtor.com"). */
export interface NearbyComp {
  addressLine: string;
  city: string;
  state: string;
  zip: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lotSqft: number | null;
  status: string;
  /** Last LIST price (not a sale). */
  listPrice: number | null;
  /** realtor.com AVM estimate + its date (not a sale). */
  estimateValue: number | null;
  estimateDate: string | null;
  /** Internal realtor.com join key for the +1 sold-event lookup — NEVER surfaced. */
  propertyId: string | null;
  /** Captured realtor.com detail URL (canonicalized permalink), or null. A
   *  functional link destination — never a citation, never surfaced as an id. */
  sourceUrl: string | null;
}

/** Normalize one raw property into a scrubbed NearbyComp. Null when there is no
 *  usable street address. Pure — unit-tested against the doc-JSON fixture. */
export function normalizeNearbyComp(raw: RawNearbyProperty): NearbyComp | null {
  const addr = raw.address ?? {};
  const addressLine = typeof addr.line === "string" ? addr.line : "";
  if (!addressLine) return null;
  const desc = raw.description ?? {};
  const best = raw.estimates?.best;
  const propertyId =
    typeof raw.property_id === "string"
      ? raw.property_id
      : raw.property_id != null
        ? String(raw.property_id)
        : null;
  return {
    addressLine,
    city: typeof addr.city === "string" ? addr.city : "",
    state: typeof addr.state_code === "string" ? addr.state_code : "",
    zip: typeof addr.postal_code === "string" ? addr.postal_code : "",
    beds: toNum(desc.beds),
    baths: toNum(desc.baths), // arrives as a string like "2.5"
    sqft: toNum(desc.sqft),
    lotSqft: toNum(desc.lot_sqft),
    status: typeof raw.status === "string" ? raw.status : "",
    listPrice: toNum(raw.list_price),
    estimateValue: best ? toNum(best.value) : null,
    estimateDate: best && typeof best.date === "string" ? best.date : null,
    propertyId,
    sourceUrl: canonicalRealtorUrl(raw.permalink) ?? null,
  };
}

/**
 * One `/nearby-home-values` call — the comp source (up to ~25 nearby properties with
 * beds/baths/sqft + AVM + last list price + status). Empty-tolerant: no key, bad
 * coords, non-200, or bad body → `[]`, never throws. `fetchImpl` is injectable for
 * offline tests (default: the Next.js-cached global fetch).
 *
 * NOTE: the contract carries no distance field and no per-property lat/lon, so this
 * never surfaces a "0.X mi" figure. "Nearest" = the API's returned order.
 */
export async function fetchNearbyValues(
  opts: { lat: number; lon: number; radius?: string | number; status?: string; limit?: number },
  deps: SteadyFetchDeps = {},
): Promise<NearbyComp[]> {
  const key = process.env.PHOTOS_API;
  if (!key || !Number.isFinite(opts.lat) || !Number.isFinite(opts.lon)) return [];
  const params = new URLSearchParams({
    lat: String(opts.lat),
    lon: String(opts.lon),
    limit: String(opts.limit ?? 25),
  });
  if (opts.radius != null) params.set("radius", String(opts.radius));
  if (opts.status) params.set("status", opts.status);
  try {
    const res = await steadyGet(`nearby-home-values?${params}`, key, deps);
    if (!res) return [];
    const data: unknown = await res.json();
    const props = (data as { body?: { properties?: unknown } })?.body?.properties;
    if (!Array.isArray(props)) return [];
    return props
      .map((p) => normalizeNearbyComp(p as RawNearbyProperty))
      .filter((c): c is NearbyComp => c !== null);
  } catch {
    return [];
  }
}

/** The exact recorded sale for one property (from `/property-tax-history`). */
export interface SoldEvent {
  soldPrice: number;
  soldDate: string;
}

/** Read the most-recent `event_name == "Sold"` row out of a tax-history body.
 *  ISO dates sort lexically, so `date > best.soldDate` keeps the latest. Pure. */
export function parseSoldEvent(body: unknown): SoldEvent | null {
  const history = (body as { body?: { property_history?: unknown } })?.body?.property_history;
  if (!Array.isArray(history)) return null;
  let best: SoldEvent | null = null;
  for (const row of history) {
    const r = row as { date?: unknown; event_name?: unknown; price?: unknown };
    if (r.event_name !== "Sold") continue;
    const price = toNum(r.price);
    const date = typeof r.date === "string" ? r.date : null;
    if (price == null || !date) continue;
    if (!best || date > best.soldDate) best = { soldPrice: price, soldDate: date };
  }
  return best;
}

/**
 * One `/property-tax-history` call — the exact sold price+date for a chosen comp.
 * `propertyId` is an argument only; it never appears in the return. Empty-tolerant:
 * no key, non-200, no Sold event, or bad body → null, never throws.
 */
export async function fetchSoldEvent(
  propertyId: string,
  deps: SteadyFetchDeps = {},
): Promise<SoldEvent | null> {
  const key = process.env.PHOTOS_API;
  if (!key || !propertyId) return null;
  const params = new URLSearchParams({ propertyId });
  try {
    const res = await steadyGet(`property-tax-history?${params}`, key, deps);
    if (!res) return null;
    return parseSoldEvent(await res.json());
  } catch {
    return null;
  }
}
