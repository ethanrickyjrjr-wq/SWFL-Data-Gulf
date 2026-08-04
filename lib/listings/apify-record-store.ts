// lib/listings/apify-record-store.ts
//
// KEEP WHAT WE PAID FOR. Every Apify realtor.com record carries 69 fields
// (live-counted 08/04/2026 on "3600 Heritage Ln, Fort Myers, FL"); the pipeline read
// two of them — full_baths and half_baths — and dropped the record when the process
// exited. The next build re-bought the same house.
//
// Operator, on being shown the field list: "we want all of that!!!!!!!!!!!!!!!!!!!"
//
// ── WHAT THIS IS NOT ─────────────────────────────────────────────────────────
// NOT a second vendor client — `apify-comps.ts` remains the ONE fetch root and this
// is called from inside it, so every lane (baths, comp photos, descriptions) gets
// persistence without opting in.
// NOT `listing_state` — that table's upsert/transition machinery is keyed on the
// vendor property_id an Apify record does not reliably carry, so a row inserted there
// sits inside a state machine that cannot own it (probed 08/03/2026). This is its own
// root, catalogued in docs/standards/data-roots.md.
//
// ── EVERY PATH IS NON-FATAL ──────────────────────────────────────────────────
// A cache miss, a dead connection, a schema drift — none of it may break an email
// build (RULE 0.7: never refuse a build). Writes are best-effort; reads degrade to
// "not cached" and the caller pays the vendor as it did before.
// KNOWN-DEBT (08/04/2026): untyped client, allowlisted in
// verification/supabase-untyped-allowlist.json. `data_lake.apify_property_records` was
// created in this same session and is not in the generated Supabase types yet, so the
// typed client cannot name it. Swap to createServiceRoleClient the next time types are
// regenerated — the table shape is fixed and catalogued in data-roots.md.
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import { listingAddressKey } from "./apify-baths";
import type { ApifyRecord } from "./apify-comps";

/** The vendor's "no value" sentinels arrive as literal strings, not nulls. */
const NA = new Set(["<NA>", "NA", "N/A", "null", "undefined", "None", ""]);

function str(v: unknown): string | null {
  if (typeof v !== "string") return v == null ? null : String(v);
  const t = v.trim();
  return t && !NA.has(t) ? t : null;
}
function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = str(v);
  if (s == null) return null;
  const n = Number(s.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function int(v: unknown): number | null {
  const n = num(v);
  return n == null ? null : Math.round(n);
}
function bool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  const s = str(v)?.toLowerCase();
  return s === "true" ? true : s === "false" ? false : null;
}
/** ISO date or null. The vendor also emits non-ISO forms like "Mar 8, 2021"
 *  (recorded in the 08/02 property-tax-history research) — Date.parse handles those,
 *  and anything it cannot read becomes null rather than a fabricated date. */
function date(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}
/** `alt_photos` arrives as a comma-joined string OR an array, depending on actor. */
function photos(v: unknown): string[] | null {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  const s = str(v);
  if (!s) return null;
  const parts = s
    .split(",")
    .map((p) => p.trim())
    .filter((p) => /^https?:\/\//i.test(p));
  return parts.length ? parts : null;
}

/** Total baths, full + half/2 — the MLS convention, same as apify-baths. */
function bathsTotal(r: ApifyRecord): number | null {
  const full = num((r as Record<string, unknown>).full_baths);
  if (full == null) return null;
  return full + (num((r as Record<string, unknown>).half_baths) ?? 0) / 2;
}

export interface StoredApifyRecord {
  address_key: string;
  raw: Record<string, unknown>;
  [k: string]: unknown;
}

/** One vendor record -> one row. Promoted columns for what we query on; `raw` keeps
 *  the whole thing so a field we did not think to promote is still ours tomorrow. */
export function toRow(r: ApifyRecord): StoredApifyRecord | null {
  const rec = r as unknown as Record<string, unknown>;
  const street = str(rec.street);
  const city = str(rec.city);
  if (!street || !city) return null; // no key, no row — never a keyless duplicate
  return {
    address_key: listingAddressKey(street, city),
    property_id: str(rec.property_id),
    listing_id: str(rec.listing_id),
    street,
    unit: str(rec.unit),
    city,
    state: str(rec.state),
    zip_code: str(rec.zip_code),
    county: str(rec.county),
    latitude: num(rec.latitude),
    longitude: num(rec.longitude),
    beds: int(rec.beds),
    full_baths: num(rec.full_baths),
    half_baths: num(rec.half_baths),
    baths_total: bathsTotal(r),
    sqft: int(rec.sqft),
    lot_sqft: int(rec.lot_sqft),
    year_built: int(rec.year_built),
    stories: num(rec.stories),
    style: str(rec.style),
    parking_garage: num(rec.parking_garage),
    new_construction: bool(rec.new_construction),
    list_price: num(rec.list_price),
    price_per_sqft: num(rec.price_per_sqft),
    estimated_value: num(rec.estimated_value),
    assessed_value: num(rec.assessed_value),
    hoa_fee: num(rec.hoa_fee),
    tax: num(rec.tax),
    last_sold_price: num(rec.last_sold_price),
    last_sold_date: date(rec.last_sold_date),
    sold_price: num(rec.sold_price),
    mls: str(rec.mls),
    mls_status: str(rec.mls_status),
    status: str(rec.status),
    list_date: date(rec.list_date),
    pending_date: date(rec.pending_date),
    days_on_mls: int(rec.days_on_mls),
    last_status_change_date: date(rec.last_status_change_date),
    description: str(rec.text),
    primary_photo: str(rec.primary_photo),
    alt_photos: photos(rec.alt_photos),
    property_url: str(rec.property_url),
    permalink: str(rec.permalink),
    raw: rec,
    source_tag: "apify_realtor",
    fetched_at: new Date().toISOString(),
  };
}

/**
 * Persist a batch. Best-effort and non-fatal by contract — a failed write must never
 * turn a routine vendor call into a failed email build.
 *
 * Upsert on `address_key`: re-fetching a house REFRESHES it rather than duplicating.
 */
export async function saveApifyRecords(records: readonly ApifyRecord[]): Promise<number> {
  const rows = records.map(toRow).filter((r): r is StoredApifyRecord => r !== null);
  if (rows.length === 0) return 0;
  try {
    const db = createServiceRoleClientUntyped();
    const { error } = await db
      .schema("data_lake")
      .from("apify_property_records")
      .upsert(rows, { onConflict: "address_key" });
    return error ? 0 : rows.length;
  } catch {
    return 0;
  }
}

/**
 * Read cached records by address key. THE POINT OF THE TABLE: a house we already
 * bought is free the second time.
 *
 * `maxAgeDays` guards staleness — a list price or status from months ago should not
 * silently stand in for today's. Specs (beds/baths/sqft/style/year) barely move, so
 * callers wanting only those can pass a long window.
 */
export async function fetchCachedRecords(
  addressKeys: readonly string[],
  maxAgeDays = 30,
): Promise<Map<string, StoredApifyRecord>> {
  const out = new Map<string, StoredApifyRecord>();
  const keys = [...new Set(addressKeys.filter(Boolean))];
  if (keys.length === 0) return out;
  try {
    const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString();
    const db = createServiceRoleClientUntyped();
    const { data } = await db
      .schema("data_lake")
      .from("apify_property_records")
      .select("*")
      .in("address_key", keys)
      .gte("fetched_at", cutoff);
    if (!Array.isArray(data)) return out;
    for (const row of data as StoredApifyRecord[]) {
      if (row.address_key && !out.has(row.address_key)) out.set(row.address_key, row);
    }
    return out;
  } catch {
    return out;
  }
}
