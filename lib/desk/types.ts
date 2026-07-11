// lib/desk/types.ts — the per-zone data contract for /desk (SWFL Data Desk).
//
// SPEC-B SEAM (do not reshape): every zone loader returns values carrying
// `{ label, value, unit?, sourceLabel, asOf, takeaway? }`. Spec B (discovery
// flywheel) reads this exact shape to emit Dataset `variableMeasured` and the
// embeddable-widget payload — `takeaway` stays empty in Spec A and is filled
// with the quotable one-liner by B. Everything here is JSON-serializable
// (server loaders → client zone components cross the RSC boundary).

export type DeskDirection = "up" | "down" | "flat";

/** One desk figure with its OWN provenance. `asOf` is MM/DD/YYYY — the feeds
 *  have different vintages, so a figure never borrows a page-level stamp. */
export interface DeskDatum {
  label: string;
  value: number;
  unit?: string;
  /** Preformatted display string — rendered into SSR HTML verbatim. */
  display: string;
  sourceLabel: string;
  asOf?: string;
  /** Spec B fills this; empty in Spec A. */
  takeaway?: string;
  /** True ONLY for a national figure (e.g. 30-yr mortgage) — takeaway omits the
   *  Southwest Florida scope clause. Explicit, set at construction — never
   *  inferred from the label text. */
  national?: boolean;
  /** True when `label` is a grammatical plural ("Active listings") — takeaway
   *  uses "are" instead of "is". */
  plural?: boolean;
  delta?: number;
  deltaDisplay?: string;
  direction?: DeskDirection;
  /** Honesty note for sparse feeds, e.g. "vs. prior reading 07/07/2026". */
  deltaNote?: string;
}

/** Wire-ticker chip. */
export interface TickerEntry {
  id: string;
  label: string;
  display: string;
  direction?: DeskDirection;
  deltaDisplay?: string;
  asOf?: string;
  sourceLabel: string;
}

/** One city's daily price track for the hero (short real window — label it). */
export interface HeroCitySeries {
  key: string;
  label: string;
  color: string;
  latest: DeskDatum;
  /** ISO date + value, chronological. Client converts to Date for the chart. */
  points: Array<{ date: string; value: number }>;
}

export interface HeroData {
  cities: HeroCitySeries[];
  asOf?: string;
  sourceLabel: string;
  /** Honest window caption, e.g. "19 daily readings since 06/12/2026". */
  windowNote: string;
}

/** One day of the Daily Market Pulse (from data_lake.listing_pulse_daily). */
export interface PulseDay {
  /** ISO date. */
  day: string;
  /** Short display label, e.g. "07/08". */
  label: string;
  newListings: number;
  priceCuts: number;
  priceIncreases: number;
  returned: number;
  /** ->holding: AMBIGUOUS departure — the state machine never asserts why. */
  departures: number;
  sold: number;
  withdrawn: number;
  total: number;
  /** Incomplete sweep (low coverage vs. window median) — labeled, never hidden. */
  partial: boolean;
  /** Follows a partial-scan day — likely carries some of that day's undetected activity
   *  (the diff engine can't re-split a blend it never dated independently). */
  carryoverAfterPartial: boolean;
}

export interface PulseData {
  /** Chronological. */
  days: PulseDay[];
  asOf?: string;
  sourceLabel: string;
}

export interface MoverRow {
  zip: string;
  county: string | null;
  value: number;
  display: string;
  activeCount: number;
  medianListDisplay?: string;
}

export interface MoversData {
  priceCutShare: MoverRow[];
  newListingShare: MoverRow[];
  /** ZIPs below this active-listing count are excluded from ranking (noise guard). */
  minActive: number;
  asOf?: string;
  sourceLabel: string;
}

export interface FlashItem {
  id: string;
  kind: "news" | "price_cut" | "closing";
  headline: string;
  detail?: string;
  /** MM/DD/YYYY of the underlying event/article. */
  asOf?: string;
  sourceLabel: string;
  href?: string;
  /** Code-owned honesty wording (e.g. sold-price disclosure) — rendered verbatim. */
  disclosure?: string;
}

export interface DeskGauges {
  /** Median hotness dial input — reuses MarketTempGaugeData upstream shape. */
  marketTemp: { medianHotness: number; zipCount: number; asOf?: string } | null;
  priceReduced: DeskDatum | null;
}

/** Everything the /desk page renders, one field per zone. */
export interface DeskData {
  ticker: TickerEntry[];
  hero: HeroData | null;
  kpis: DeskDatum[];
  /** Inventory-mix strip (new construction / pending / foreclosures) — same
   *  query lane the v2 filter tabs will read. */
  mix: DeskDatum[];
  pulse: PulseData | null;
  movers: MoversData | null;
  flash: FlashItem[];
  gauges: DeskGauges;
}
