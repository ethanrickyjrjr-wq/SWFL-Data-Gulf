// lib/listings/sold-event-store.ts
//
// KEEP THE SOLD EVENT. The `/property-tax-history` body is the ONLY day-grain source of
// a recorded close we can reach at build time — the lake's comp view is month-grain
// (`lee_comp_sales_v.sale_month`, live-probed 08/19/2026) and `/nearby-home-values`
// carries no sale date at all (data-roots T9). Yet the TypeScript build path read three
// numbers out of that body and dropped it when the request ended: a close that rendered
// in one build was simply gone from the next when the vendor didn't return it, with
// nothing of ours to fall back on.
//
// The ingest side already fixed exactly this discard for its own lane on 08/02/2026
// (`extract_api.py fetch_sold_event`, playbook
// docs/superpowers/plans/2026-08-02-steadyapi-raw-landing-playbook.md). It lands bodies
// in `data_lake.steadyapi_property_history_raw` — 18,319 rows, still landing 08/14/2026.
// The build path was never wired to it: it neither wrote nor read a single row
// (tree-wide search 08/19/2026 — 33 files name that table, none under lib/ or app/).
//
// ── WHAT THIS IS NOT ─────────────────────────────────────────────────────────
// NOT a second root. It writes the SAME table the Python lane writes, on the SAME
// primary key (`property_id`), so one property has one body no matter which lane
// probed it. RULE 0.55: add a root, never a second table.
// NOT a second address-key dialect. The stored keys are Python's
// `address_key(street, zip)` grammar ("1229CARLENEAVE:33901"); the parity port
// `./address-key` is the ONE TS spelling of it. Never invent a third.
//
// ── EVERY PATH IS NON-FATAL ──────────────────────────────────────────────────
// A dead connection, a schema drift, a permissions change — none of it may break an
// email build (RULE 0.7: never refuse a build). Writes are best-effort; a read miss
// degrades to "we don't hold it" and the caller behaves exactly as it did before.
//
// KNOWN-DEBT (08/19/2026): untyped client, allowlisted in
// verification/supabase-untyped-allowlist.json. `data_lake.steadyapi_property_history_raw`
// has been live since 08/02/2026 but is not in the generated Supabase types (grep of
// database.types.ts: 0 hits), so the typed client cannot name it. Swap to
// createServiceRoleClient the next time types are regenerated — the table shape is fixed by
// migrations/20260802_steadyapi_property_history_raw.sql and catalogued in data-roots.md.
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import { addressKey } from "./address-key";

const TABLE = "steadyapi_property_history_raw";

/** What the caller knows about the property that the vendor body does NOT carry.
 *  Live-probed 08/19/2026: the stored body is `{meta, body}` and holds no address
 *  anywhere, so `address_key` can only ever come from the call site. */
export interface HistoryMeta {
  street?: string | null;
  zip?: string | null;
  county?: string | null;
}

export interface StoredHistory {
  /** The verbatim vendor envelope, exactly as landed: `{ meta, body }`. */
  body: unknown;
  /** ISO timestamp the body was captured — the honest as-of for anything read out of it. */
  fetchedAt: string;
}

export interface HistoryRow {
  property_id: string;
  body: unknown;
  fetched_at: string;
  address_key?: string;
  county?: string;
}

/**
 * One vendor body -> one row. Pure.
 *
 * *** THE NULL-WIPE GUARD — DO NOT "SIMPLIFY" BY ALWAYS SETTING address_key. ***
 * PostgREST builds its `ON CONFLICT DO UPDATE SET` list from the keys PRESENT in the
 * payload. The 18,319 rows already landed carry good `address_key`/`county` values
 * written by the ingest lane, which knows them from `listing_state`; a build-path
 * re-probe usually does NOT. Emitting `address_key: null` would overwrite a real key
 * with nothing on every re-probe — the same silent-loss shape this file exists to
 * stop. So an unknown field is OMITTED, not nulled, and the stored value survives.
 */
export function toHistoryRow(
  propertyId: string,
  body: unknown,
  meta: HistoryMeta = {},
  now: Date = new Date(),
): HistoryRow | null {
  const id = String(propertyId ?? "").trim();
  if (!id) return null; // no key, no row
  if (!body || typeof body !== "object") return null; // never land a non-body
  const row: HistoryRow = { property_id: id, body, fetched_at: now.toISOString() };
  const street = meta.street?.trim();
  const zip = meta.zip?.trim();
  if (street && zip) {
    const key = addressKey(street, zip);
    // `addressKey` returns "…:" for a zip that carries no digits — a keyless key.
    if (/^[A-Z0-9]+:\d{5}$/.test(key)) row.address_key = key;
  }
  const county = meta.county?.trim();
  if (county) row.county = county;
  return row;
}

/**
 * Persist one body. Best-effort and non-fatal by contract — a failed write must never
 * turn a routine vendor call into a failed build. Upsert on `property_id`: a re-probe
 * REFRESHES the body rather than duplicating it, matching the ingest lane's writer.
 */
export async function saveHistoryBody(
  propertyId: string,
  body: unknown,
  meta: HistoryMeta = {},
): Promise<boolean> {
  const row = toHistoryRow(propertyId, body, meta);
  if (!row) return false;
  try {
    const db = createServiceRoleClientUntyped();
    const { error } = await db
      .schema("data_lake")
      .from(TABLE)
      .upsert(row, { onConflict: "property_id" });
    if (error) {
      // LOUD. This write is the entire reason a close we already saw survives to the
      // next build; losing it silently is how the hole opened in the first place.
      console.error(
        `[sold-event-store] HISTORY WRITE FAILED for property ${row.property_id} — ` +
          `the next build will have nothing to fall back on: ${error.code ?? ""} ${error.message}`,
      );
      return false;
    }
    return true;
  } catch (e) {
    console.error(
      `[sold-event-store] HISTORY WRITE THREW for property ${row.property_id}: ` +
        `${e instanceof Error ? e.message : String(e)}`,
    );
    return false;
  }
}

/**
 * THE FALLBACK CAP. A recorded sale does not change once recorded, so a stored body
 * stays TRUE indefinitely — what ages is its claim to be the LATEST sale. Past this
 * window we would rather hold nothing than quietly present a year-old observation as
 * the current state of a home, so the fallback expires and the caller degrades exactly
 * as it does today. (Strike shape `stale-source-served-silently`.)
 */
export const STORED_FALLBACK_MAX_AGE_DAYS = 180;

/**
 * Read the body we already landed for one property. Returns the capture time with it —
 * every caller gets the as-of, so nothing can render a stored observation as a live one.
 * Never throws; a miss, an error, or an over-age row is `null`.
 */
export async function fetchStoredHistory(
  propertyId: string,
  maxAgeDays: number = STORED_FALLBACK_MAX_AGE_DAYS,
  now: Date = new Date(),
): Promise<StoredHistory | null> {
  const id = String(propertyId ?? "").trim();
  if (!id) return null;
  try {
    const cutoff = new Date(now.getTime() - maxAgeDays * 86_400_000).toISOString();
    const db = createServiceRoleClientUntyped();
    const { data } = await db
      .schema("data_lake")
      .from(TABLE)
      .select("body,fetched_at")
      .eq("property_id", id)
      .gte("fetched_at", cutoff)
      .limit(1);
    if (!Array.isArray(data) || data.length === 0) return null;
    const row = data[0] as { body?: unknown; fetched_at?: unknown };
    if (!row.body || typeof row.fetched_at !== "string") return null;
    return { body: row.body, fetchedAt: row.fetched_at };
  } catch {
    return null;
  }
}
