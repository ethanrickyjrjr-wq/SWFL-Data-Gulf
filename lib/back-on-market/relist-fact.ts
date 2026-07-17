// lib/back-on-market/relist-fact.ts
//
// Lane 2 — the per-home relist fact. Given a specific back-on-market address, resolve
// its ONE clean relist event: a `holding → active` transition on
// data_lake.listing_transitions for that home's address_key, whose TRUE off-market
// duration (Phase-2's `days_off_market`) is >= 7 days. The >= 7d floor strips the
// same-week scan flicker (a listing dropping out of one scan and back into the next is
// not a real departure); genuine relists-after-departure cluster at 7-30 days.
//
// The record NEVER states WHY the deal ended — `holding` is reason-unknown by design.
// This fact says only WHEN the home returned and HOW LONG it was gone. Never a reason,
// never "stigmatized", never a claim about the seller.
//
// Empty-tolerant (four-lane / ODD): null on empty input, a geocoder miss, out of
// Lee/Collier, no matching transition, or a below-threshold event. Never throws, never
// invents. Forward-only by construction: rows detected before Phase 2 shipped carry
// `days_off_market = NULL` and are excluded (the `.gte` filter drops NULLs), so the read
// surfaces relist facts only from the first post-deploy live sweep onward.
//
// ── THE address_key ROUND-TRIP (probed live 07/17/2026, 22 real rows) ───────────────
// The transition is keyed on `address_key` = addressKey(street, zip). Deriving that key
// from the user's TYPED address reproduces the stored key for single-family homes
// natively. For CONDOS it does NOT, and the reason is subtle: the ingest keyed off the
// vendor PERMALINK (word-form unit, "-apt-201" -> "UNIT201"), while the display address a
// user types shows the "#201" form — and addressKey's `\b#` alternative matches NEITHER
// in TS NOR Python (they are in parity; this is not an addressKey bug). So we normalize
// "#<x>" -> "Unit <x>" at THIS boundary before deriving, which reproduces the stored
// permalink-derived UNIT key (validated against 15 real condo rows + 7 single-family).
// A bare unmarked trailing unit ("...Dr 201", no marker) still won't match and degrades
// to null — exactly the "unmarked-trailing-unit smush" the ingest's address_key.py
// docstring already defers.
import { geocodeAddress, type GeocodeFn } from "@/lib/geo/geocode-address";
import { addressKey } from "@/lib/listings/address-key";
// KNOWN-DEBT(data_lake): listing_transitions lives in the data_lake schema, which the
// typed Supabase client intentionally does not cover — see utils/supabase/service-role.ts.
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";

/** The floor, in days off-market, below which a `holding -> active` reappearance is
 *  treated as scan flicker, not a real relist. A documented judgment floor (not a derived
 *  value): the persistence probe showed genuine departures cluster at 7-30 days and
 *  flicker at 0-2. Mirrors the same constant the Phase-2 detector was designed against. */
export const RELIST_MIN_DAYS_OFF_MARKET = 7;

/** Lee / Collier only — the seller-stress footprint this surface speaks for. */
const LEE_FIPS = "12071";
const COLLIER_FIPS = "12021";

/** One clean relist event for a specific home. */
export interface RelistFact {
  /** The derived property key the transition was matched on (internal/provenance). */
  addressKey: string;
  /** The relist date as the record holds it (ISO "YYYY-MM-DD"). */
  isoDate: string;
  /** The relist date for display, MM/DD/YYYY (as-of-date convention). */
  date: string;
  /** TRUE off-market duration in days (>= RELIST_MIN_DAYS_OFF_MARKET). */
  daysOffMarket: number;
}

/** One `holding -> active` transition row, as read from the lake. */
interface RelistRow {
  at: string | null;
  days_off_market: number | null;
}

export interface RelistFactDeps {
  /** Injectable geocoder — tests never touch Mapbox/Census. */
  geocode?: GeocodeFn;
  /** Injectable lake read — tests never touch Supabase. Returns candidate relist rows
   *  for a derived key; the >= 7d guard is applied in resolveRelistFact (so a mock can
   *  hand back a below-threshold row and prove the guard, not just the SQL). */
  fetchRelistRows?: (addressKey: string) => Promise<RelistRow[]>;
}

/** The street line = everything before the first comma (the house-number + street the
 *  address_key is built from). No comma → the whole trimmed string. */
function streetOf(input: string): string {
  const comma = input.indexOf(",");
  return (comma > 0 ? input.slice(0, comma) : input).trim();
}

/** ISO "YYYY-MM-DD" → "MM/DD/YYYY". "" on anything unparseable. */
function toMdY(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : "";
}

/** The default lake read: the home's clean relist events, freshest first. Empty-tolerant
 *  — no creds, no rows, or any query error → []. NOTE: source_name is deliberately NOT
 *  filtered. `days_off_market` is populated only by the live forward-only sweep, so the
 *  old-format-key seed rows the address_key.py docstring warns about carry NULL and are
 *  auto-excluded by `.gte` — a source filter would add a live-feed coupling for no gain. */
async function defaultFetchRelistRows(key: string): Promise<RelistRow[]> {
  try {
    const db = createServiceRoleClientUntyped();
    const { data } = await db
      .schema("data_lake")
      .from("listing_transitions")
      .select("at, days_off_market")
      .eq("address_key", key)
      .eq("sale_or_rent", "sale")
      .eq("from_state", "holding")
      .eq("to_state", "active")
      .gte("days_off_market", RELIST_MIN_DAYS_OFF_MARKET)
      .order("at", { ascending: false })
      .limit(5);
    return Array.isArray(data) ? (data as RelistRow[]) : [];
  } catch {
    return [];
  }
}

/**
 * Resolve a specific address to its one clean relist fact, or null.
 *
 * Null (degrade to Lane 1, never an error, never a fabricated event) on: empty input, a
 * geocoder miss, an address outside Lee/Collier, a street with no house number, no
 * matching transition, or a relist below the RELIST_MIN_DAYS_OFF_MARKET floor.
 */
export async function resolveRelistFact(
  address: string | null | undefined,
  deps: RelistFactDeps = {},
): Promise<RelistFact | null> {
  const raw = String(address ?? "").trim();
  if (!raw) return null;

  let geo;
  try {
    geo = await geocodeAddress(raw, deps.geocode ? { geocode: deps.geocode } : {});
  } catch {
    return null;
  }
  // Need a ZIP for the key, and the home must be in the Lee/Collier footprint.
  if (!geo?.zip) return null;
  if (geo.countyFips !== LEE_FIPS && geo.countyFips !== COLLIER_FIPS) return null;

  const street = streetOf(raw);
  if (!street) return null;
  // Normalize the display "#<unit>" form to the permalink word form the ingest keyed on
  // (see the file header). Single-family addresses are unaffected.
  const key = addressKey(street.replace(/#\s*/g, "Unit "), geo.zip);

  const fetchRows = deps.fetchRelistRows ?? defaultFetchRelistRows;
  let rows: RelistRow[];
  try {
    rows = await fetchRows(key);
  } catch {
    return null;
  }

  // The >= 7d guard runs HERE, in code, so it is exercised by the below-threshold test
  // (not only by the SQL `.gte`). Pick the freshest qualifying event.
  const qualifying = rows
    .filter(
      (r): r is { at: string; days_off_market: number } =>
        typeof r.at === "string" &&
        r.at.length > 0 &&
        typeof r.days_off_market === "number" &&
        r.days_off_market >= RELIST_MIN_DAYS_OFF_MARKET,
    )
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  const top = qualifying[0];
  if (!top) return null;

  return {
    addressKey: key,
    isoDate: top.at,
    date: toMdY(top.at),
    daysOffMarket: top.days_off_market,
  };
}
