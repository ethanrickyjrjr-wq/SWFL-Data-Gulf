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
 * *** THE GUARD FOR POSTGRES 21000 — DO NOT REMOVE. ***
 *
 * Postgres refuses an `INSERT … ON CONFLICT DO UPDATE` when the INCOMING BATCH contains
 * the same conflict key twice:
 *
 *     21000  ON CONFLICT DO UPDATE command cannot affect row a second time
 *
 * and it rejects the ENTIRE statement, not the duplicate row. A 200-record ZIP pull hits
 * this constantly — a relisted home, a unit variant, the same house appearing in two
 * months of a window.
 *
 * Measured live 08/04/2026: the comps email bought ~600 records across three dated ZIP
 * pulls and the table stayed at the 20 rows it already held. Roughly $6 of paid data
 * discarded, silently, because the error was swallowed and 0 rows looked exactly like
 * nothing to save. Last record wins — a later pull is the fresher read of the same house.
 */
export function dedupeRows(rows: readonly StoredApifyRecord[]): StoredApifyRecord[] {
  const byKey = new Map<string, StoredApifyRecord>();
  for (const r of rows) if (r.address_key) byKey.set(r.address_key, r);
  return [...byKey.values()];
}

/** Rows per statement. Each row carries the full 69-field `raw` blob, so a 600-record
 *  pull in one request is a multi-megabyte body PostgREST may refuse outright. */
const UPSERT_CHUNK = 100;

/**
 * Persist a batch. Best-effort and non-fatal by contract — a failed write must never
 * turn a routine vendor call into a failed email build.
 *
 * Upsert on `address_key`: re-fetching a house REFRESHES it rather than duplicating.
 * Deduped first (see above) and chunked, and a failure is now LOGGED rather than
 * returning a 0 indistinguishable from "nothing to save".
 */
export async function saveApifyRecords(records: readonly ApifyRecord[]): Promise<number> {
  const all = dedupeRows(records.map(toRow).filter((r): r is StoredApifyRecord => r !== null));
  if (all.length === 0) return 0;
  let saved = 0;
  try {
    const db = createServiceRoleClientUntyped();
    for (let i = 0; i < all.length; i += UPSERT_CHUNK) {
      const chunk = all.slice(i, i + UPSERT_CHUNK);
      const { error } = await db
        .schema("data_lake")
        .from("apify_property_records")
        .upsert(chunk, { onConflict: "address_key" });
      if (error) {
        // LOUD. This write is the entire reason a house we already bought is free the
        // second time; losing it silently means re-buying the whole ZIP on every build.
        console.error(
          `[apify-record-store] CACHE WRITE FAILED for ${chunk.length} paid record(s) — ` +
            `they will be re-bought next build: ${error.code ?? ""} ${error.message}`,
        );
      } else {
        saved += chunk.length;
      }
    }
    return saved;
  } catch (e) {
    console.error(
      `[apify-record-store] CACHE WRITE THREW — ${all.length} paid record(s) lost: ` +
        `${e instanceof Error ? e.message : String(e)}`,
    );
    return saved;
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

/**
 * THE SAME ADDRESS, SPELLED TWO WAYS — every non-alphanumeric removed, not folded to a
 * space. `listingAddressKey` preserves word breaks, which is correct as the PRIMARY key
 * and is exactly what makes the two feeds miss each other:
 *
 *   the daily sweep writes  "12554 Kellysands Way"
 *   the paid record writes  "12554 Kelly Sands Way"
 *
 * One street, one house, two spellings, no join.
 */
export function looseAddressKey(street: string, city: string): string {
  return `${street} ${city}`.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * THE UNIT SEAM — the third spelling drift, measured 08/09/2026.
 *
 * The spine writes a condo's unit INTO the street line ("8521 Oakshade Cir #422");
 * the paid record keeps the street bare and the unit in its own column ("8521
 * Oakshade Cir" + "Unit 422"). Neither the exact key nor despacing can join those —
 * of the 4 not-sold paid rows that missed the spine entirely, this seam was the only
 * fixable class (the others had simply left the market).
 *
 * `splitUnitFromStreet` peels a trailing unit token off a street LINE; `unitTokenOf`
 * normalises a unit written any way ("#422", "Unit 422", "Apt 4B") to its bare token.
 * A subject WITH a unit may only match a row whose own unit agrees — a building of
 * condos shares one street line, and guessing the unit would fill one home's email
 * with another home's paid facts.
 */
export function splitUnitFromStreet(street: string): { core: string; unit: string | null } {
  const m = street.match(
    /^(.*?)\s*(?:#|\b(?:unit|apt|apartment|ste|suite)\.?\s*#?)\s*([a-z0-9-]+)\s*$/i,
  );
  if (!m || !m[1].trim()) return { core: street.trim(), unit: null };
  return { core: m[1].trim(), unit: m[2].toLowerCase() };
}

export function unitTokenOf(unit: unknown): string | null {
  if (typeof unit !== "string" || !unit.trim()) return null;
  const m = unit.match(/([a-z0-9-]+)\s*$/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Find the paid row for ONE address when the exact key missed, by house number + city,
 * matched on `looseAddressKey`.
 *
 * ── WHY THIS EXISTS, WITH THE NUMBER ─────────────────────────────────────────
 * Counted live 08/05/2026 over all 26 paid rows against the active book: **8 join on the
 * exact key. Five more join only once spacing is ignored** — McGregor Woods / Mcgregorwoods,
 * Kelly Sands / Kellysands, Marco Island / Marcoisland, Creekside View / Creeksideview,
 * Bristol Bnd / Bristolbnd. That is a 62% lift (8 → 13) on rows we had already paid for and
 * could not reach, and it is why the demo house rendered every paid cell as an open slot.
 *
 * ── WHY IT IS SAFE, ALSO WITH THE NUMBER ─────────────────────────────────────
 * Despacing can in principle merge two different addresses. Measured across **30,655 active
 * listings it produces 25 collisions, and every one is the SAME place spelled two ways**
 * ("fort denaud rd" / "fortdenaud rd", "cape coral" / "capecoral"). Those are the pairs we
 * want merged. The house number and the city both stay in the key, so the "330 5th St,
 * Naples vs Fort Myers" hazard the exact key exists to stop is untouched.
 *
 * SECONDARY ONLY — the caller tries the exact key first, and this never overrides a hit.
 * Never throws; a miss is `undefined`.
 */
export async function fetchCachedRecordLoose(
  street: string,
  city: string,
  maxAgeDays = 30,
): Promise<StoredApifyRecord | undefined> {
  const houseNumber = street.trim().split(/\s+/)[0] ?? "";
  if (!/^\d+$/.test(houseNumber) || !city.trim()) return undefined;
  const want = looseAddressKey(street, city);
  try {
    const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString();
    const db = createServiceRoleClientUntyped();
    const { data } = await db
      .schema("data_lake")
      .from("apify_property_records")
      .select("*")
      .ilike("city", city.trim())
      .ilike("street", `${houseNumber} %`)
      .gte("fetched_at", cutoff)
      .limit(25);
    if (!Array.isArray(data)) return undefined;
    const rows = data as StoredApifyRecord[];
    const hit = rows.find(
      (r) => looseAddressKey(String(r.street ?? ""), String(r.city ?? "")) === want,
    );
    if (hit) return hit;
    // THE UNIT SEAM (see splitUnitFromStreet). Only when the subject street carries a
    // unit token: compare the bare street, and require the row's own unit column to
    // agree. A row with no unit is NEVER matched to a unit-bearing subject — in a condo
    // building that would be a guess, and a wrong condo's facts are wrong facts.
    const { core, unit } = splitUnitFromStreet(street);
    if (!unit) return undefined;
    const wantCore = looseAddressKey(core, city);
    return rows.find(
      (r) =>
        looseAddressKey(String(r.street ?? ""), String(r.city ?? "")) === wantCore &&
        unitTokenOf(r.unit) === unit,
    );
  } catch {
    return undefined;
  }
}
