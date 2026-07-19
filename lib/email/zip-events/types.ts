// lib/email/zip-events/types.ts
//
// Market-area alerts data model (spec 2026-07-10-market-area-alerts-design.md).
// PURE data — no imports, no I/O. Detection state is one ZipMetricsSnapshot per
// ZIP (market_event_snapshots.payload); a MarketEvent is a typed, fact-backed
// occurrence a detector derived from comparing a STORED snapshot to fresh data.
// Missing input ⇒ no event — an absent metric is null, never a guessed number.

export type MarketEventType =
  "threshold_cross" | "rank_flip" | "lifecycle_burst" | "nearby_news" | "heat_shift";

/** alert = fires standalone (≤1 email/day); weekly = roundup material;
 *  baseline = the one-time welcome snapshot (first issue after signup). */
export type MarketEventClass = "alert" | "weekly" | "baseline";

export type MarketEventGrain = "zip" | "area" | "city" | "county";

/** One held, citable figure. `source` names where the number lives (e.g.
 *  "SWFL Data Gulf listings data" / "SWFL Data Gulf market rankings") —
 *  it rides the collapsed source list, never inline copy. */
export interface MarketFact {
  label: string;
  from?: number | null;
  to?: number | null;
  value: number | null;
  unit: string; // "$", " days", "%", "" — display suffix/prefix hint
  source: string;
  /** Click-through for the fact (a news story's source article). Optional —
   *  numeric facts have no destination; stories always should (operator 07/19). */
  url?: string;
}

export interface MarketEvent {
  type: MarketEventType;
  grain: MarketEventGrain;
  area_id: string;
  zip?: string;
  class: MarketEventClass;
  facts: MarketFact[];
}

/** The deltable per-ZIP metrics the engine tracks. Extend here + METRIC_LABELS
 *  together — a key without a label is a compile error downstream. */
export type MetricKey =
  "median_sale_price" | "median_dom" | "actives" | "sold_count_30d" | "sale_to_list_ratio";

export const METRIC_LABELS: Record<MetricKey, string> = {
  median_sale_price: "Median sale price",
  median_dom: "Median days on market",
  actives: "Active listings",
  sold_count_30d: "Homes sold (30 days)",
  sale_to_list_ratio: "Sale-to-list ratio",
};

export const METRIC_UNITS: Record<MetricKey, string> = {
  median_sale_price: "$",
  median_dom: " days",
  actives: "",
  sold_count_30d: "",
  sale_to_list_ratio: "%",
};

/** The stored per-ZIP detection state — "the facts last shown". Heat inputs are
 *  per-ZIP so an area's previous heat rank is recomputable deterministically
 *  from stored rows (no separate area snapshot). */
export interface ZipMetricsSnapshot {
  zip: string;
  /** YYYY-MM-DD the underlying data was as-of when captured. */
  as_of: string;
  metrics: Record<MetricKey, number | null>;
  /** Position (1-based) in the ranked signal pool's headline metric, or null. */
  rank_position: number | null;
  /** Heat inputs at capture time (nulls preserved — an area missing inputs is
   *  EXCLUDED from the heat rank, never zero-filled). Pace = absorption rate
   *  (30-day sold count / active inventory × 100, higher = faster = hotter) —
   *  the lake holds NO days-on-market (listing_state.days_on_market and
   *  listed_date are null at source, verified live 07/10/2026), and first_seen
   *  math would be an invented figure. */
  heat: {
    absorption_rate_pct: number | null;
    sale_to_list_ratio: number | null;
    price_momentum_pct: number | null;
    sold_momentum_pct: number | null;
  };
}
