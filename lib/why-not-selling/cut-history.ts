// lib/why-not-selling/cut-history.ts — the per-home price-cut history read.
//
// A CUT EVENT is a `data_lake.listing_transitions` row whose `from_state === to_state`
// AND whose `price_delta < 0` (the transitions.py:68-72 contract — a price move WITHIN a
// state, not a state change). PostgREST cannot compare two columns to each other, so the
// `from_state === to_state` test is applied CLIENT-SIDE here, after the fetch — the SQL
// only narrows by address, sale-side, and ordering.
//
// This read states events, never reasons — it carries WHEN the price moved and BY HOW
// MUCH, nothing about WHY (the price-reduced.ts prohibition: a cut is never a "motivated
// seller", never a "softening market"; those are inventions). The consuming check
// (checks/price-cuts.ts) holds the same line.
//
// Empty-tolerant (four-lane / ODD): no creds, no rows, or ANY query/parse error → [].
// Never throws, never invents. The whole body is wrapped so a caller can rely on always
// getting an array.
//
// KNOWN-DEBT(data_lake): listing_transitions lives in the data_lake schema, which the
// typed Supabase client intentionally does not cover — see utils/supabase/service-role.ts.
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import type { CutEvent } from "./types";

/** One `listing_transitions` row as this read consumes it — every field nullable, exactly
 *  as the lake hands it back. The narrowing to a real CutEvent happens in loadCutHistory. */
export interface CutRow {
  at: string | null;
  price: number | null;
  price_delta: number | null;
  from_state: string | null;
  to_state: string | null;
}

/** How many transition rows to pull for one home before filtering. A generous ceiling —
 *  a single listing's full transition history is far smaller — so the client-side cut
 *  filter never misses an event to a truncated page. */
const CUT_ROW_LIMIT = 200;

export interface CutHistoryDeps {
  /** Injectable lake read — tests never touch Supabase. Returns the candidate transition
   *  rows for an address_key; the same-state + negative-delta filter is applied in
   *  loadCutHistory (so a mock can hand back non-cut rows and prove the filter). */
  fetchRows?: (addressKey: string) => Promise<CutRow[]>;
}

/** The default lake read: this home's sale-side transitions, oldest first. The two-column
 *  `from_state === to_state` compare is NOT expressible in PostgREST, so it is done in
 *  loadCutHistory over these rows — here we only narrow by key + side and order. */
async function defaultFetchRows(addressKey: string): Promise<CutRow[]> {
  const db = createServiceRoleClientUntyped();
  const { data } = await db
    .schema("data_lake")
    .from("listing_transitions")
    .select("at, price, price_delta, from_state, to_state")
    .eq("address_key", addressKey)
    .eq("sale_or_rent", "sale")
    .order("at", { ascending: true })
    .limit(CUT_ROW_LIMIT);
  return Array.isArray(data) ? (data as CutRow[]) : [];
}

/**
 * The home's price-cut history — same-state, negative-delta transitions only, oldest
 * first. Empty-tolerant: any error (no creds, fetch failure, bad shape) → []. The sort is
 * done HERE, not left to the SQL, so an injected fetch that returns rows in any order
 * still yields a chronological history.
 *
 * The `at`/`price` non-null guards keep CutEvent's non-null contract WITHOUT inventing a
 * value — a row missing its date or price is dropped, never coerced to 0.
 */
export async function loadCutHistory(
  addressKey: string,
  deps: CutHistoryDeps = {},
): Promise<CutEvent[]> {
  const fetchRows = deps.fetchRows ?? defaultFetchRows;
  try {
    const rows = await fetchRows(addressKey);
    return (Array.isArray(rows) ? rows : [])
      .filter(
        (r): r is CutRow & { at: string; price: number; price_delta: number } =>
          r.from_state === r.to_state &&
          typeof r.at === "string" &&
          r.at.length > 0 &&
          typeof r.price === "number" &&
          typeof r.price_delta === "number" &&
          r.price_delta < 0,
      )
      .map((r) => ({ at: r.at, price: r.price, delta: r.price_delta }))
      .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  } catch {
    return [];
  }
}
