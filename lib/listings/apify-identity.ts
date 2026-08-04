// lib/listings/apify-identity.ts
//
// ═══════════════════════════════════════════════════════════════════════════════
// *** `location` IS A SEARCH AREA. IT IS NOT A LOOKUP KEY. ***
// ═══════════════════════════════════════════════════════════════════════════════
//
// Passing a full street address as the actor's `location` does NOT return that house.
// It returns houses NEAR that house, in the vendor's own order. Every record coming back
// is a CANDIDATE, never an answer. It becomes an answer only by passing `matchesAddress`.
//
// Both live defects found on 08/04/2026 — by building a real comps email and looking at
// it (`_ASSISTANT/2026-08-04-comp-photos-FINDINGS.md`) — are the same failure to respect
// that one sentence:
//
//   1. ZIP-WIDE SAMPLING NEVER JOINS. The photo lane asked for 24 arbitrary sold homes in
//      ZIP 33908 and tried to key them onto 6 SPECIFIC comp addresses. Live intersection:
//      0 of 6 — not bad luck, a structural impossibility. 33908 has hundreds of sales in
//      the window; the odds our exact six are in an arbitrary 24 are ~nil. We paid for 24
//      photos of the wrong houses and discarded all 24, and the empty result was
//      byte-identical to "these houses have no photos."
//
//   2. `[0]` WITH NO IDENTITY CHECK. The subject lane passed the subject's own address as
//      `location` and accepted record [0] blind. For 8348 Southwindbay Cir, Fort Myers
//      33908 it returned 306 Chattanooga Dr, Fort Myers 33905 — different street,
//      different ZIP — and that stranger's listing became the hero photo link, the
//      "Find Out More" CTA, and the source of the subject's style in the footnote.
//
// This module is the fix for both, and it is deliberately SEPARATE from apify-comps.ts so
// that the rule has a file of its own to be found in. `compPhotoKey` is imported, never
// re-implemented — one address normalizer, shared by every lane (comp-photos.ts's rule).

import { compPhotoKey } from "./comp-photos";
import { fetchApifyComps, type ApifyRecord } from "./apify-comps";
import { listingAddressKey } from "./apify-baths";
import { fetchCachedRecords } from "./apify-record-store";

/** The vendor's own "no value" sentinels — they arrive as literal strings. */
const NA = new Set(["<NA>", "NA", "N/A", "null", "undefined", "None"]);

function isRealString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0 && !NA.has(v.trim());
}

/** Only ever an http(s) URL — a `javascript:` or `data:` string must never reach an
 *  `href` or an `<img src>`, and a relative path is not a listing page. */
function isHttpUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\/\S+$/i.test(v.trim());
}

/**
 * Does this vendor record describe THIS house?
 *
 * Street core + city, through the SAME `compPhotoKey` normalizer both photo lanes use —
 * never a second matcher, never a fuzzy or partial compare. The city half is what stops
 * "330 5th St, Naples" from answering for "330 5th St, Fort Myers". A record with no
 * street, or a blank target, can never match.
 */
export function matchesAddress(
  record: ApifyRecord,
  addressLine: string,
  city: string | null | undefined,
): boolean {
  if (!isRealString(record.street) || !isRealString(addressLine)) return false;
  return compPhotoKey(record.street, record.city ?? "") === compPhotoKey(addressLine, city ?? "");
}

/**
 * The ONLY sanctioned way to take one record out of an area search. Replaces `[0]`.
 *
 * Returns null when the search brought back only other houses — a normal, frequent
 * outcome that must never be dressed up as this house. A null costs an open slot; a
 * wrong `[0]` costs a wrong-house link in a sent email.
 */
export function pickAddressMatch(
  records: ApifyRecord[],
  addressLine: string,
  city: string | null | undefined,
): ApifyRecord | null {
  for (const r of records) if (matchesAddress(r, addressLine, city)) return r;
  return null;
}

/**
 * address-key -> realtor.com detail URL. THE COMP ROW'S LINK.
 *
 * `comp-helper.ts:291` sets `sourceUrl: null` on every Lee lake comp, because that lane
 * is deed data and carries no listing page. That is why the rendered comps email had 0 of
 * 6 rows linked — the decree's fallback ("no photo -> still a link") had nothing to link
 * TO. The vendor record carries `property_url` and it rides in on the SAME call that
 * fetches the photo, so the link costs nothing extra.
 */
export function apifyListingUrlIndex(records: ApifyRecord[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of records) {
    if (!isRealString(r.street) || !isHttpUrl(r.property_url)) continue;
    const k = compPhotoKey(r.street, r.city ?? "");
    if (!out.has(k)) out.set(k, r.property_url.trim());
  }
  return out;
}

export interface AddressTarget {
  addressLine: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

/** Injectable seam so every test runs offline and no test can ever spend money. */
export interface AddressFetchDeps {
  fetch?: typeof fetchApifyComps;
}

/**
 * ONE house, VERIFIED. The per-address replacement for ZIP-wide sampling.
 *
 * A tight radius keeps the vendor's area search small — and `buildActorInput` only sends
 * `radius` at all when the location is not a bare ZIP, which is exactly this case. We
 * still do not trust the result: whatever comes back is filtered through `matchesAddress`.
 *
 * NEVER THROWS. Null is the normal miss and costs the caller nothing but an open slot.
 */
export async function fetchApifyRecordForAddress(
  addr: AddressTarget,
  listingType: "sold" | "for_sale" | "pending",
  deps: AddressFetchDeps = {},
): Promise<ApifyRecord | null> {
  if (!isRealString(addr.addressLine)) return null;
  const location = [
    addr.addressLine,
    addr.city ?? "",
    [addr.state ?? "", addr.zip ?? ""].filter(Boolean).join(" "),
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");
  if (!isRealString(location)) return null;

  const run = deps.fetch ?? fetchApifyComps;
  try {
    const records = await run({
      location,
      listingType,
      // Small cap: we want ONE house. The extras exist only because the vendor answers an
      // AREA, so the true match can sit behind a neighbour or two.
      maxResults: 5,
      radiusMiles: 0.3,
    });
    return pickAddressMatch(records, addr.addressLine, addr.city);
  } catch {
    return null; // a paid-lane miss is never a build failure (RULE 0.7)
  }
}

// ── READ THE CACHE BEFORE YOU PAY ────────────────────────────────────────────
//
// `data_lake.apify_property_records` (apify-record-store.ts) holds every record we have
// ever bought — 46 promoted columns + the untouched `raw`. It is WRITTEN from inside
// `fetchApifyComps`, so every call below also refills it for the next build.
//
// ⚠️ TWO ADDRESS KEYS EXIST IN THIS DIRECTORY, AND THEY ARE NOT INTERCHANGEABLE:
//     listingAddressKey("14503 DOLCE VISTA RD","FORT MYERS") -> "14503 dolce vista rd fort myers"
//     compPhotoKey     ("14503 DOLCE VISTA RD","FORT MYERS") -> "14503DOLCEVISTARD@FORTMYERS"
// The CACHE TABLE is keyed with the first. The PHOTO INDEXES are keyed with the second.
// Reading the table with a compPhotoKey returns ZERO ROWS AND NO ERROR — the exact silent
// nothing-joined shape that cost us this whole session. Each key is used only against the
// structure it belongs to, and that is why both are imported here.

/** What a comp row needs filled, resolved for one house. Absent = open slot, never a guess. */
export interface CompEnrichment {
  photoUrl?: string;
  listingUrl?: string;
  style?: string;
}

/** Photos, listing URLs and style barely move once a home is sold — unlike `list_price`
 *  or `mls_status`, which §2.1 of the cache handoff forbids serving stale. A sold home's
 *  photo from 90 days ago is the same photo. */
const STABLE_FIELD_MAX_AGE_DAYS = 180;

const str = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : "";
  return s && isHttpUrlOrText(s) ? s : undefined;
};
const isHttpUrlOrText = (s: string) => !NA.has(s);

/**
 * THE COMP ENRICHMENT LANE — cache first, then ONE verified call per remaining house.
 *
 * Replaces the ZIP-wide sample that returned 24 photos of the wrong houses and joined 0
 * of 6. Per house: a cache hit costs nothing; a miss costs one ~$0.01 call that also
 * writes the record back for every future build. `maxPaidLookups` is the spend ceiling.
 *
 * NEVER THROWS. Every failure degrades to an open slot.
 */
export async function resolveCompEnrichment(
  comps: readonly {
    addressLine: string;
    city?: string | null;
    /** WHICH SEARCH FINDS THIS HOUSE. A recorded sale is only in the `sold` index; a
     *  valuation or active listing is only in `for_sale`. Querying the wrong one returns
     *  the house's NEIGHBOURS, `matchesAddress` rejects them all, and the slot comes back
     *  empty with no error — measured live 08/04/2026 on a 4-valuation comp set. */
    listingType?: "sold" | "for_sale" | "pending";
  }[],
  opts: {
    state?: string | null;
    zip?: string | null;
    maxPaidLookups?: number;
    fetchOne?: typeof fetchApifyRecordForAddress;
    readCache?: typeof fetchCachedRecords;
  } = {},
): Promise<Map<string, CompEnrichment>> {
  const out = new Map<string, CompEnrichment>();
  const wanted = comps.filter((c) => c.addressLine?.trim());
  if (!wanted.length) return out;

  const put = (addressLine: string, rec: Record<string, unknown>) => {
    const e: CompEnrichment = {};
    const photo = str(rec.primary_photo);
    const url = str(rec.property_url);
    const style = str(rec.style);
    if (photo && /^https?:\/\//i.test(photo)) e.photoUrl = photo;
    if (url && /^https?:\/\//i.test(url)) e.listingUrl = url;
    if (style) e.style = style;
    if (e.photoUrl || e.listingUrl || e.style) out.set(addressLine, e);
  };

  // ── LANE A · the cache. Free, and the reason we stop re-buying the same houses.
  try {
    const readCache = opts.readCache ?? fetchCachedRecords;
    const keyed = wanted.map((c) => ({
      c,
      key: listingAddressKey(c.addressLine, c.city ?? ""),
    }));
    const cached = await readCache(
      keyed.map((k) => k.key),
      STABLE_FIELD_MAX_AGE_DAYS,
    );
    for (const { c, key } of keyed) {
      const row = cached.get(key);
      if (row) put(c.addressLine, row as unknown as Record<string, unknown>);
    }
  } catch {
    // No cache, no creds, table missing -> lane B still runs. Never a build failure.
  }

  // ── LANE B · one VERIFIED paid lookup per house the cache did not cover.
  const missing = wanted.filter((c) => !out.has(c.addressLine));
  const budget = opts.maxPaidLookups ?? 6;
  const fetchOne = opts.fetchOne ?? fetchApifyRecordForAddress;
  for (const c of missing.slice(0, budget)) {
    const rec = await fetchOne(
      { addressLine: c.addressLine, city: c.city, state: opts.state, zip: opts.zip },
      c.listingType ?? "sold",
    );
    if (rec) put(c.addressLine, rec as unknown as Record<string, unknown>);
  }
  return out;
}
