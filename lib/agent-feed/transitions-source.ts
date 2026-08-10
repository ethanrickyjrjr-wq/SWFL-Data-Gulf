// lib/agent-feed/transitions-source.ts
//
// DB-access layer for the agent-feed transitions route (Task 3, hermes-email-driver spec
// 2026-08-10). Reads the two sources the feed UNIONs and tags each row with its origin so
// the route never has to guess which table a row came from:
//   - "real"  <- data_lake.listing_transitions (the actual detector, Piece 1, no new code
//     there). Its columns are the ingest _TRANS_COLS (ingest/pipelines/listing_lifecycle/
//     distill.py) plus source_name and the `id bigint IDENTITY PRIMARY KEY` from
//     migrations/20260627_listing_lifecycle.sql. There is NO human-readable "address"
//     column on this table (only address_key) -- RULE 0.5 probed this directly rather than
//     guessing, so `address` is resolved via a join to data_lake.listing_state.street_address
//     (same batch-join shape as lib/back-on-market/relist-fact.ts and lib/desk/loaders.ts
//     loadClosings). Falls back to address_key itself if the join misses (never blocks the
//     feed on a join gap -- four-lane sourcing, never a fabricated street address).
//     seed=true rows are the first-scan baseline (NOT real flow -- same distinction
//     lib/desk/loaders.ts:499 already draws with .eq("seed", false)) and are excluded here
//     too; a baseline row leaking into the feed would read to Hermes as a live transition.
//   - "test"  <- public.agent_feed_test_events (migrations/20260810_agent_driver.sql,
//     Task 1). Already carries a human `address` column directly -- no join needed.
//     source_name is always the literal "test-inject" per the design doc (Piece 2).
//
// CURSOR PUSHDOWN (review fix, 08/10/2026, was CRITICAL). The cursor format
// `<at ISO>|<id>` is plan-locked; this module now pushes the FULL (at, id) tuple down as a
// keyset predicate on EACH source query: at > cursor.at OR (at = cursor.at AND id >
// cursor.id). The prior version only bounded the fetch with .gte("at", sinceAt) -- the
// date half alone -- so on any date with more rows than the page cap (production sees
// 1,090+ on a single date) the query kept re-fetching the SAME lowest-id page forever; the
// route in-memory isAfterCursor filter then discarded all of them and next_cursor never
// advanced. Keyset pushdown makes the fetch itself start strictly after the full cursor, so
// paging through a single oversized date terminates in ceil(rows/limit) calls like any
// other day.
//
// PRECISION (review fix, was MEDIUM-HIGH). listing_transitions.at is a Postgres date;
// agent_feed_test_events.at is timestamptz. Comparing those as raw strings mixed real
// and test rows unsafely (a same-day test row could permanently shadow that day remaining
// real rows once the cursor advanced past it). Every `at` this module returns is
// normalized to full millisecond-precision ISO-8601 UTC (toFullIso) BEFORE it is used for
// ordering, the keyset predicate, or serialized into the response -- so every `at` the feed
// ever emits or accepts back as a cursor is the same precision, always. A bare date like
// 2026-08-01 normalizes to 2026-08-01T00:00:00.000Z (JS treats a date-only ISO string as
// UTC midnight, matching how the row is actually stored). Pushing that normalized value back
// down as a filter against the date column still works correctly: PostgREST/Postgres casts
// the operand to date, truncating the time-of-day back off -- so gt/eq against the real
// table behave as "later calendar day" / "same calendar day", exactly the semantics a date
// column needs, while the timestamptz test table gets the full precision compare it needs.
import type { SupabaseClient } from "@supabase/supabase-js";
// KNOWN-DEBT(data_lake): listing_transitions/listing_state live in the data_lake schema,
// which the typed Supabase client intentionally does not cover (see
// utils/supabase/service-role.ts). agent_feed_test_events is also not yet in
// database.types.ts (migration landed this session, codegen not re-run). This module owns
// the ONE untyped client for both reads -- verification/supabase-untyped-allowlist.json.
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";

export interface Cursor {
  at: string;
  id: number;
}

export interface TransitionEvent {
  origin: "real" | "test";
  /** Internal only -- used for cursor math, stripped before the row leaves the route. */
  id: number;
  address: string;
  address_key: string;
  sale_or_rent: string;
  from_state: string | null;
  to_state: string;
  price_delta: number | null;
  /** Always full millisecond-precision ISO-8601 UTC -- see the PRECISION note above. */
  at: string;
  source_name: string;
}

interface RealTransitionRow {
  id: number;
  address_key: string;
  sale_or_rent: string;
  from_state: string | null;
  to_state: string;
  price_delta: number | null;
  at: string;
  source_name: string;
}

interface TestEventRow {
  id: number;
  address: string;
  address_key: string;
  sale_or_rent: string;
  from_state: string | null;
  to_state: string;
  price_delta: number | null;
  at: string;
}

/** Canonicalize any Postgres-serialized `at` (bare date, or timestamptz in any offset
 *  notation) to full millisecond-precision ISO-8601 UTC, so every `at` this module ever
 *  returns compares safely as a plain string regardless of which source produced it.
 *  Falls back to the raw value on anything unparseable -- never throws, never blocks the
 *  feed on a malformed row. */
function toFullIso(raw: string): string {
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toISOString();
}

/** The keyset predicate for "strictly after this cursor", PostgREST .or() syntax:
 *  at > cursor.at  OR  (at = cursor.at AND id > cursor.id). Undefined (no filter) when the
 *  cursor is the beginning-of-time sentinel or otherwise unusable -- the caller fetches from
 *  the start in that case. */
function keysetFilter(cursor: Cursor): string | undefined {
  if (!cursor.at || !Number.isFinite(cursor.id)) return undefined;
  return `at.gt.${cursor.at},and(at.eq.${cursor.at},id.gt.${cursor.id})`;
}

async function fetchRealTransitions(
  db: SupabaseClient,
  cursor: Cursor,
  limit: number,
): Promise<TransitionEvent[]> {
  let query = db
    .schema("data_lake")
    .from("listing_transitions")
    .select("id, address_key, sale_or_rent, from_state, to_state, price_delta, at, source_name")
    // seed=true is the first-scan baseline, not real flow (mirrors lib/desk/loaders.ts:499).
    .eq("seed", false)
    .order("at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);
  const filter = keysetFilter(cursor);
  if (filter) query = query.or(filter);

  const { data, error } = await query;
  if (error || !data) return [];
  const rows = data as RealTransitionRow[];
  if (rows.length === 0) return [];

  // Batch-join the human street address. listing_state PK is (source_name, address_key,
  // sale_or_rent) -- more than one row per address_key is possible (e.g. sale plus rent),
  // and a plain last-write-wins Map.set() could clobber a good address with a null from a
  // different row. Prefer the first non-null seen; never let a null overwrite one already
  // resolved (review fix, was LOW-MEDIUM).
  const keys = [...new Set(rows.map((r) => r.address_key))];
  const streetByKey = new Map<string, string | null>();
  if (keys.length > 0) {
    const { data: states } = await db
      .schema("data_lake")
      .from("listing_state")
      .select("address_key, street_address")
      .in("address_key", keys);
    for (const s of (states ?? []) as { address_key: string; street_address: string | null }[]) {
      const prev = streetByKey.get(s.address_key);
      if (prev === undefined) {
        streetByKey.set(s.address_key, s.street_address);
      } else if (prev === null && s.street_address != null) {
        streetByKey.set(s.address_key, s.street_address);
      }
    }
  }

  return rows.map((r) => ({
    origin: "real" as const,
    id: r.id,
    address: streetByKey.get(r.address_key) || r.address_key,
    address_key: r.address_key,
    sale_or_rent: r.sale_or_rent,
    from_state: r.from_state,
    to_state: r.to_state,
    price_delta: r.price_delta,
    at: toFullIso(r.at),
    source_name: r.source_name,
  }));
}

async function fetchTestEvents(
  db: SupabaseClient,
  cursor: Cursor,
  limit: number,
): Promise<TransitionEvent[]> {
  let query = db
    .from("agent_feed_test_events")
    .select("id, address, address_key, sale_or_rent, from_state, to_state, price_delta, at")
    .order("at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);
  const filter = keysetFilter(cursor);
  if (filter) query = query.or(filter);

  const { data, error } = await query;
  if (error || !data) return [];

  return (data as TestEventRow[]).map((r) => ({
    origin: "test" as const,
    id: r.id,
    address: r.address,
    address_key: r.address_key,
    sale_or_rent: r.sale_or_rent,
    from_state: r.from_state,
    to_state: r.to_state,
    price_delta: r.price_delta,
    at: toFullIso(r.at),
    source_name: "test-inject",
  }));
}

/** Candidate rows from BOTH sources, each already filtered strictly-after `cursor` AT THE
 *  DB LEVEL (keyset pushdown, not a loose bound) and normalized to full-ISO `at`. Unsorted
 *  across sources -- the route does the final (at,id) merge sort and page cap. */
export async function fetchTransitionCandidates(
  cursor: Cursor,
  limit: number,
): Promise<TransitionEvent[]> {
  const db = createServiceRoleClientUntyped();
  const [real, test] = await Promise.all([
    fetchRealTransitions(db, cursor, limit),
    fetchTestEvents(db, cursor, limit),
  ]);
  return [...real, ...test];
}
