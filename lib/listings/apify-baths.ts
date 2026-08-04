// lib/listings/apify-baths.ts
//
// THE PAID BATHS FALLBACK — lane 3 of the bath-count resolver, never lane 1.
//
// ── PROVENANCE ORDER (free before paid, RULE 0.7) ────────────────────────────
//   1. listing.bathrooms as the vendor gave it        (SteadyAPI /search: always null)
//   2. data_lake.listing_state.baths by property_id   (FREE, ~20% fill, already
//      paid for by the nightly ingest — fetchLakeBathsByPropertyId in select.ts)
//   3. THIS: the Apify realtor.com actor, by ADDRESS  ($0.01/result)
//
// The caller (listings-digest) consults this ONLY when lane 2 left a home that
// could otherwise carry a full spec line. A build whose free lane covered
// everything spends nothing.
//
// ── WHY THE DIGEST NEEDS IT ──────────────────────────────────────────────────
// Operator, on the reference email: "WE CAN'T HAVE BED AND SQ FT WITHOUT BATHS."
// SteadyAPI /search sets `bathrooms: null` unconditionally (steadyapi.ts) — the raw
// description it parses declares only beds/sqft/lot_sqft. So without a baths lane
// EVERY card omits its spec line. Lane 2 alone fills ~20%, which under the
// all-cards-or-none rule (F13) means most grids still show none.
//
// ── ONE ACTOR LANE, NOT A SECOND ─────────────────────────────────────────────
// This reuses `fetchApifyComps` / `buildActorInput` from ./apify-comps — the same
// actor, the same cost ceiling, the same empty-tolerant contract. It does NOT open
// a second vendor wrapper.
//
// ── COST + CADENCE ───────────────────────────────────────────────────────────
// PAY_PER_EVENT $0.01/result + $0.00005/actor-start (verified live 08/03/2026).
// `maxResults` is ALWAYS set — an unset `max_results_per_location` means UNLIMITED
// to the vendor (up to 10k), i.e. a $100 run from one omitted field.
// BUILD-TIME ONLY. Never wire this into a cron or scheduled ingest
// (memory: no-paid-search-in-scheduled-ingest).
import { fetchApifyComps, type ApifyCompDeps, type ApifyRecord } from "./apify-comps";

/** Per-build ceiling. A digest reads at most ~30 homes; 60 covers the ZIP's active
 *  inventory with headroom at $0.60/run worst case. Raising this raises the bill
 *  linearly — it is the single cost knob in this file. */
const MAX_RESULTS = 60;

/** The vendor's "no value" sentinels arrive as literal strings. */
const NA = new Set(["<NA>", "NA", "N/A", "null", "undefined", "None", ""]);

/** A count that is really a number. The vendor sends `half_baths` as number OR
 *  string OR its `<NA>` sentinel, so a bare Number() would yield NaN and poison
 *  the total. */
function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && !NA.has(v.trim())) {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Address key: street + city, lowercased and squashed to single spaces.
 *
 * Keeping the CITY in the key is what stops "330 5th St, Naples" lending its bath
 * count to "330 5th St, Fort Myers" — the same discipline as compPhotoKey. Exported
 * so the consumer keys with the IDENTICAL function rather than a near-copy that
 * drifts.
 */
export function listingAddressKey(street: string, city: string): string {
  return `${street} ${city}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Total baths for one vendor record: full + half/2, the standard MLS convention
 * (2 full + 1 half reads "2.5"). Returns null when the record states no full bath
 * count — a half-bath-only total would be a fabricated figure, not a partial one.
 */
export function bathsFromRecord(r: ApifyRecord): number | null {
  const full = num(r.full_baths);
  if (full == null) return null;
  const half = num(r.half_baths) ?? 0;
  return full + half / 2;
}

/**
 * address-key -> bath count for one ZIP's active for-sale inventory.
 *
 * NEVER THROWS and an empty Map is the NORMAL failure shape, not an exception:
 * 2 of the 5 store actors tested for this job returned 0 items (research §4), and
 * failed items are never billed. A consumer that treated [] as an error would turn
 * a routine vendor miss into a failed email build (RULE 0.7 — never refuse a build).
 * A miss simply leaves `bathrooms` null and the card honestly omits its spec line.
 *
 * First writer wins, so an earlier record is not overwritten by a later duplicate.
 */
export async function fetchApifyBathsByAddress(
  zip: string,
  deps: ApifyCompDeps = {},
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const z = zip.trim();
  if (!/^\d{5}$/.test(z)) return out;

  // No radius: the vendor silently IGNORES `radius` unless the location is a
  // specific street address (verified live 08/03/2026), so passing one with a bare
  // ZIP buys a whole-ZIP result set we paid for under a false assumption.
  const records = await fetchApifyComps(
    { location: z, listingType: "for_sale", maxResults: MAX_RESULTS },
    deps,
  );

  for (const r of records) {
    const street = typeof r.street === "string" ? r.street.trim() : "";
    if (!street) continue;
    const baths = bathsFromRecord(r);
    if (baths == null) continue;
    const key = listingAddressKey(street, r.city ?? "");
    if (!out.has(key)) out.set(key, baths);
  }
  return out;
}
