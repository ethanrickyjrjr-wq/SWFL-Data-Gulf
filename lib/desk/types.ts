// lib/desk/types.ts — the per-zone data contract for /desk (SWFL Data Desk).
//
// SPEC-B SEAM (do not reshape): every zone loader returns values carrying
// `{ label, value, unit?, sourceLabel, asOf, takeaway? }`. Spec B (discovery
// flywheel) reads this exact shape to emit Dataset `variableMeasured` and the
// embeddable-widget payload — `takeaway` stays empty in Spec A and is filled
// with the quotable one-liner by B. Everything here is JSON-serializable
// (server loaders → client zone components cross the RSC boundary).

import type { SerializedFitOverlay, SerializedWindowView } from "@/lib/charts/fit-overlay";
import type { MetricDef } from "@/lib/landing/home-map-types";

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
  /** The monthly closed-sale median beneath the daily asking line (dual-signal:
   *  asking moves daily, sold is the true anchor and steps monthly). Absent when
   *  the sold feed has no row for this city. */
  anchor?: DeskDatum;
  /** A complementary monthly market-trend series charted for this city INSTEAD
   *  of `points` when present — months of supply, a real price-direction
   *  indicator (not just "more rows than the 2-day asking line"). Absent →
   *  the chart falls back to `points`. */
  trend?: {
    points: Array<{ date: string; value: number }>;
    label: string;
    sourceLabel: string;
  };
  /** Months of supply — kept as a stated figure rather than charted under a PRICE
   *  headline, where a reader reasonably reads the area as the price. */
  supply?: DeskDatum;
  /** THE BACKLIT TREND. What may be drawn over this city's series, and the two
   *  sentences that must ship with it. Built by `fitOverlay` on the server — the
   *  ONE authority on whether a direction may be read at all. Absent when the
   *  series is too short to fit honestly (< 12 monthly points), which is a real
   *  answer and not an error: we draw no trend rather than a thin one. */
  fit?: SerializedFitOverlay;
  /** THE WINDOW MENU — every window this city's series HONESTLY EARNS, each with its own
   *  fitted layer and its own two sentences. `fitWindows` has already dropped the ones it
   *  does not earn; the UI renders exactly these rows and NEVER synthesizes a missing one.
   *  A city with a short series gets a short menu, and that is the honest answer. */
  windows?: SerializedWindowView[];
}

export interface HeroData {
  cities: HeroCitySeries[];
  asOf?: string;
  sourceLabel: string;
  /** Honest window caption, e.g. "19 daily readings since 06/12/2026". */
  windowNote: string;
  /** Longer-window basis for the "% since start" comparison tab, used ONLY
   *  when `cities[].points` is too short (fresh daily lane) to read as a
   *  trend — sourced from the deeper monthly sold history we already hold,
   *  never invented. Absent → the comparison tab falls back to `cities`. */
  rebase?: {
    cities: Array<{
      key: string;
      label: string;
      color: string;
      points: Array<{ date: string; value: number }>;
    }>;
    sourceLabel: string;
    windowNote: string;
  };
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

/** One core ZIP's numeric momentum pair for the pressure scatter. Shares are
 *  percentages (0–100) as held — the chart never recomputes a rate. */
export interface PressurePoint {
  zip: string;
  county: string | null;
  cutShare: number;
  newShare: number;
  activeCount: number;
}

export interface MoversData {
  priceCutShare: MoverRow[];
  newListingShare: MoverRow[];
  /** ZIPs below this active-listing count are excluded from ranking (noise guard). */
  minActive: number;
  /** Cut share vs new-listing share for every qualifying core ZIP (same
   *  min-active noise guard as the boards) — additive; absent hides the chart. */
  pressure?: PressurePoint[];
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
  /** External ADDRESS-LOOKUP convenience (e.g. Zillow) — never provenance.
   *  Renders as the headline link when `href` is absent; deliberately NOT
   *  included in filed notes (flashNoteText reads only `href`). */
  lookupHref?: string;
  /** Code-owned honesty wording (e.g. sold-price disclosure) — rendered verbatim. */
  disclosure?: string;
}

/** One core ZIP's stat bundle — the watchlist rail + ⌘K jump list read this.
 *  Display strings preformatted server-side (SSR numbers, client only filters). */
export interface WatchZipRow {
  zip: string;
  county: string | null;
  activeCount: number;
  medianListDisplay?: string;
  priceCutShareDisplay?: string;
  newListingShareDisplay?: string;
}

/** One price band of the affordability histogram (from
 *  data_lake.listing_price_bands — aggregated in SQL, never raw rows). */
export interface PriceBand {
  band: string;
  count: number;
}

export interface PriceBandsData {
  /** Region-wide bands in ascending price order. */
  bands: PriceBand[];
  total: number;
  asOf?: string;
  sourceLabel: string;
}

/** Metric×metric Pearson matrix computed across core ZIPs (lib/desk/correlation). */
export interface CorrelationData {
  labels: string[];
  matrix: (number | null)[][];
  /** established[i][j] = that pair's |r| clears its OWN critical value at 95%
   *  (lib/desk/correlation `isEstablished`). FALSE = indistinguishable from zero:
   *  the cell renders NEUTRAL no matter how large r looks, and says why. Without
   *  this, the heatmap coloured the whole 0.2–0.6 band as signal when at n = 10
   *  the critical r is 0.632 — i.e. it painted noise. */
  established: boolean[][];
  /** pairN[i][j] = that pair's OWN complete-case ZIP count — what the tooltip
   *  states. Each pair is judged against this, never the global minimum. */
  pairN: number[][];
  /** Smallest complete-case ZIP count across pairs — stated in the zone copy. */
  zipCount: number;
  asOf?: string;
  sourceLabel: string;
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
  /** Every core ZIP with stats — watchlist rail + ⌘K jump list (v2). */
  watch: WatchZipRow[];
  /** Price-band histogram (v2) — null hides the zone. */
  bands: PriceBandsData | null;
  /** ZIP×metric correlation matrix (v2) — null hides the zone. */
  correlation: CorrelationData | null;
  /** Live per-ZIP asking-price map (v2) — the SAME MetricDef shape + component
   *  the homepage map runs on (MapCanvas `override`); null hides the zone. */
  map: MetricDef | null;
}
