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
    .map((r) => ({ date: toMdY(r.at as string), sizeUsd: Math.abs(r.price_delta as number) }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const totalCutUsd = events.reduce((s, e) => s + e.sizeUsd, 0);
  return { count: events.length, totalCutUsd, events, complete: !subjectFloored };
}
