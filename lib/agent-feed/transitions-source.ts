// lib/agent-feed/transitions-source.ts
//
// DB-access layer for the agent-feed transitions route (Task 3, hermes-email-driver spec
// 2026-08-10). Reads the two sources the feed UNIONs and tags each row with its origin so
// the route never has to guess which table a row came from:
//   - "real"  <- data_lake.listing_transitions (the actual detector, Piece 1 — no new code
//     there). Its columns are the ingest's _TRANS_COLS (ingest/pipelines/listing_lifecycle/
//     distill.py) + source_name + the `id bigint IDENTITY PRIMARY KEY` from
//     migrations/20260627_listing_lifecycle.sql. There is NO human-readable "address"
//     column on this table (only address_key) — RULE 0.5 probed this directly rather than
//     guessing, so `address` is resolved via a join to data_lake.listing_state.street_address
//     (same batch-join shape as lib/back-on-market/relist-fact.ts / lib/desk/loaders.ts
//     loadClosings). Falls back to address_key itself if the join misses (never blocks the
//     feed on a join gap — four-lane sourcing, never a fabricated street address).
//   - "test"  <- public.agent_feed_test_events (migrations/20260810_agent_driver.sql,
//     Task 1). Already carries a human `address` column directly — no join needed.
//     source_name is always the literal "test-inject" per the design doc (§Piece 2).
//
// Each fetch is a loose lower-bound read (`at >= sinceAt`, ascending at,id, capped at
// `limit`) — the route does the exact strictly-greater-than cursor filter, the global
// (at,id) merge sort, and the final page cap in memory. Fetching `limit` rows ascending
// from EACH source is sufficient to compute the true merged top-`limit`: a source can
// never contribute more than `limit` rows to a `limit`-sized merged prefix, and the rows
// it *would* contribute are exactly its own smallest (at,id) rows — which is what "order
// ascending, take `limit`" already returns.
import type { SupabaseClient } from "@supabase/supabase-js";
// KNOWN-DEBT(data_lake): listing_transitions/listing_state live in the data_lake schema,
// which the typed Supabase client intentionally does not cover (see
// utils/supabase/service-role.ts). agent_feed_test_events is also not yet in
// database.types.ts (migration landed this session, codegen not re-run). This module owns
// the ONE untyped client for both reads — verification/supabase-untyped-allowlist.json.
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";

export interface TransitionEvent {
  origin: "real" | "test";
  /** Internal only — used for cursor math, stripped before the row leaves the route. */
  id: number;
  address: string;
  address_key: string;
  sale_or_rent: string;
  from_state: string | null;
  to_state: string;
  price_delta: number | null;
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

async function fetchRealTransitions(
  db: SupabaseClient,
  sinceAt: string,
  limit: number,
): Promise<TransitionEvent[]> {
  let query = db
    .schema("data_lake")
    .from("listing_transitions")
    .select("id, address_key, sale_or_rent, from_state, to_state, price_delta, at, source_name")
    .order("at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);
  if (sinceAt) query = query.gte("at", sinceAt);

  const { data, error } = await query;
  if (error || !data) return [];
  const rows = data as RealTransitionRow[];
  if (rows.length === 0) return [];

  const keys = [...new Set(rows.map((r) => r.address_key))];
  const streetByKey = new Map<string, string | null>();
  if (keys.length > 0) {
    const { data: states } = await db
      .schema("data_lake")
      .from("listing_state")
      .select("address_key, street_address")
      .in("address_key", keys);
    for (const s of (states ?? []) as { address_key: string; street_address: string | null }[]) {
      streetByKey.set(s.address_key, s.street_address);
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
    at: r.at,
    source_name: r.source_name,
  }));
}

async function fetchTestEvents(
  db: SupabaseClient,
  sinceAt: string,
  limit: number,
): Promise<TransitionEvent[]> {
  let query = db
    .from("agent_feed_test_events")
    .select("id, address, address_key, sale_or_rent, from_state, to_state, price_delta, at")
    .order("at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);
  if (sinceAt) query = query.gte("at", sinceAt);

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
    at: r.at,
    source_name: "test-inject",
  }));
}

/** Loose-bounded candidate rows from BOTH sources, unsorted/unfiltered — the route applies
 *  the exact strictly-greater-than cursor filter and the final merge sort + page cap. */
export async function fetchTransitionCandidates(
  sinceAt: string,
  limit: number,
): Promise<TransitionEvent[]> {
  const db = createServiceRoleClientUntyped();
  const [real, test] = await Promise.all([
    fetchRealTransitions(db, sinceAt, limit),
    fetchTestEvents(db, sinceAt, limit),
  ]);
  return [...real, ...test];
}
