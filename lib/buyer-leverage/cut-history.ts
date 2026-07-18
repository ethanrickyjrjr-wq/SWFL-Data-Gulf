// lib/buyer-leverage/cut-history.ts
import type { CutHistory, CutEvent } from "./types";

/** One transition row as read from data_lake.listing_transitions. */
export interface TransitionRow {
  at: string | null;
  from_state: string | null;
  to_state: string | null;
  price: number | null;
  price_delta: number | null;
}

/** ISO "YYYY-MM-DD…" → "MM/DD/YYYY". "" on anything unparseable. */
function toMdY(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : "";
}

/**
 * Derive the observed price-cut history from a home's transition rows.
 *
 * A cut = a SAME-STATE move with a negative delta (from_state === to_state, price_delta < 0).
 * State-change deltas (e.g. holding→active relists) and raises are excluded. FORWARD-ONLY:
 * these rows only exist from the second scan onward, so on a floored subject the count is a
 * lower bound — `complete` is false and the composer hedges.
 */
export function deriveCutHistory(rows: TransitionRow[], subjectFloored: boolean): CutHistory {
  const events: CutEvent[] = rows
    .filter(
      (r) =>
        r.from_state != null &&
        r.from_state === r.to_state &&
        typeof r.price_delta === "number" &&
        r.price_delta < 0 &&
        typeof r.at === "string" &&
        r.at.length > 0,
    )
    // Sort on the ISO `at` field (chronologically correct, freshest-first) BEFORE mapping
    // to the formatted MM/DD/YYYY string — that formatted form sorts wrong across a year
    // boundary (01/05/2027 lexically below 12/20/2026). `at` is a non-empty string here (filter).
    .sort((a, b) =>
      (a.at as string) < (b.at as string) ? 1 : (a.at as string) > (b.at as string) ? -1 : 0,
    )
    .map((r) => ({ date: toMdY(r.at as string), sizeUsd: Math.abs(r.price_delta as number) }));
  const totalCutUsd = events.reduce((s, e) => s + e.sizeUsd, 0);
  return { count: events.length, totalCutUsd, events, complete: !subjectFloored };
}

// KNOWN-DEBT(data_lake): listing_transitions lives in the data_lake schema, which the
// typed Supabase client intentionally does not cover — see utils/supabase/service-role.ts.
// Same untyped service-role read as lib/back-on-market/relist-fact.ts.
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";

export interface CutDeps {
  /** Injectable lake read — tests never touch Supabase. */
  fetchRows?: (addressKey: string) => Promise<TransitionRow[]>;
}

/** Default read: this home's sale transitions, freshest first. Empty-tolerant — any error → []. */
async function defaultFetchRows(key: string): Promise<TransitionRow[]> {
  try {
    const db = createServiceRoleClientUntyped();
    const { data } = await db
      .schema("data_lake")
      .from("listing_transitions")
      .select("at, from_state, to_state, price, price_delta")
      .eq("address_key", key)
      .eq("sale_or_rent", "sale")
      .order("at", { ascending: false })
      .limit(25);
    return Array.isArray(data) ? (data as TransitionRow[]) : [];
  } catch {
    return [];
  }
}

/** Fetch a home's transition rows for a derived address_key. Never throws. */
export async function fetchCutRows(
  addressKey: string,
  deps: CutDeps = {},
): Promise<TransitionRow[]> {
  const fetchRows = deps.fetchRows ?? defaultFetchRows;
  try {
    return await fetchRows(addressKey);
  } catch {
    return [];
  }
}
