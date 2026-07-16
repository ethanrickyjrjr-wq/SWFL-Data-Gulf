// lib/desk/loaders.ts — one loader per /desk zone, all aggregate-at-source.
// Every zone returns its OWN sourceLabel + asOf (the feeds have different
// vintages — a blended page-level stamp would be a lie). Empty-tolerant by
// construction: a dead feed returns null/[] and its zone hides; nothing is
// ever fabricated.
//
// KNOWN-DEBT(data_lake: desk aggregates live in the data_lake schema (typed public only))
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isCoreCounty, isCoreScope } from "@/refinery/lib/core-scope.mts";
import { selectAllPaged } from "@/refinery/lib/paginate.mts";
import {
  mapMarketTemperature,
  type MarketTempGaugeData,
  type MarketTempRow,
} from "@/lib/charts/market-temperature-series";
import { loadMetros } from "@/lib/charts/gallery-loaders";
import {
  fitOverlay,
  serializeOverlay,
  serializeWindowViews,
  windowViews,
} from "@/lib/charts/fit-overlay";
import { fitWindows, trendVerdict } from "@/lib/charts/series-fit";
import { resolveSoldPrice } from "@/lib/listings/sold-price";
import {
  detectPartialScans,
  flagCarryoverDays,
  fmtCount,
  fmtPct,
  fmtUsd,
  isPlausibleCut,
  latestDelta,
  makeTakeaway,
  mD,
  mdY,
  rankMovers,
  MOVERS_MIN_ACTIVE,
  type MomentumRow,
  type SeriesPoint,
} from "./mappers";
import { correlationMatrix, type CorrelationMetric } from "./correlation";
import { zillowAddressUrl } from "./portal-link";
import type {
  CorrelationData,
  DeskData,
  DeskDatum,
  DeskGauges,
  FlashItem,
  HeroCitySeries,
  HeroData,
  MoversData,
  PriceBandsData,
  PulseData,
  PulseDay,
  TickerEntry,
  WatchZipRow,
} from "./types";

type Supabase = SupabaseClient;

const SPINE_SOURCE = "SWFL Data Gulf";
const CITY_DEFS = [
  { key: "cape_coral", label: "Cape Coral", color: "#3DC9C0" }, // gulf-teal, solid
  { key: "fort_myers", label: "Fort Myers", color: "#5bc97a" }, // mangrove
  { key: "naples", label: "Naples", color: "#d4b370" }, // neutral-gold
] as const;

// ---------------------------------------------------------------------------
// daily_truth — daily ASKING price series per city (lake-computed) + mortgage.
// The median_sale_price web-search metric was RETIRED 07/12/2026 (19 days of
// all-NULL rows — no daily sold source exists); the daily lane is now
// median_asking_price, deterministic from our own cleaned active inventory.
// ---------------------------------------------------------------------------

interface TruthRow {
  metric_key: string;
  area: string;
  period: string;
  value: number | null;
  source_title: string | null;
}

interface TruthSeries {
  /** Non-null daily median ASKING points per city (fills from 07/12/2026). */
  askingByCity: Map<string, SeriesPoint[]>;
  mortgage: { points: SeriesPoint[]; sourceTitle: string | null };
}

async function loadTruthSeries(supabase: Supabase): Promise<TruthSeries> {
  const empty: TruthSeries = {
    askingByCity: new Map(),
    mortgage: { points: [], sourceTitle: null },
  };
  try {
    const { data, error } = await supabase
      .schema("data_lake")
      .from("daily_truth")
      .select("metric_key, area, period, value, source_title")
      .in("metric_key", ["median_asking_price", "mortgage_30yr_fixed"])
      .order("period", { ascending: true });
    if (error || !data) return empty;
    const rows = data as TruthRow[];
    const askingByCity = new Map<string, SeriesPoint[]>();
    const mortgagePoints: SeriesPoint[] = [];
    let mortgageSource: string | null = null;
    for (const r of rows) {
      if (typeof r.value !== "number" || !Number.isFinite(r.value)) continue;
      if (r.metric_key === "median_asking_price") {
        const list = askingByCity.get(r.area) ?? [];
        list.push({ period: r.period, value: r.value });
        askingByCity.set(r.area, list);
      } else if (r.metric_key === "mortgage_30yr_fixed") {
        mortgagePoints.push({ period: r.period, value: r.value });
        mortgageSource = r.source_title ?? mortgageSource;
      }
    }
    return { askingByCity, mortgage: { points: mortgagePoints, sourceTitle: mortgageSource } };
  } catch {
    return empty;
  }
}

// ---------------------------------------------------------------------------
// redfin_city_swfl — monthly closed-sale median per city (the SOLD anchor).
// True city-grain sold medians (redfin.com provenance), monthly cadence.
// ---------------------------------------------------------------------------

interface SoldRow {
  area: string;
  period_end: string;
  median_sale_price: number | null;
  months_of_supply: number | null;
}

interface CityMonthlySeries {
  sold: Map<string, SeriesPoint[]>;
  /** Buyer's/seller's-market gauge (Redfin's own definition ties it directly
   *  to price direction — lower supply = seller's market = price pressure
   *  up). Same table, same monthly cadence, same real per-city history as
   *  the sold anchor. */
  monthsSupply: Map<string, SeriesPoint[]>;
}

/**
 * The sold anchor is the deepest PRICE series on the desk and the hero rides it, so a
 * silent short-read here is the most expensive kind of bug on this page: a truncated
 * series doesn't error, it just draws a shorter history and a different trend.
 *
 * Two defenses, both server-side:
 *   1. `.not(median_sale_price, is, null)` — a valueless row was previously fetched, then
 *      discarded in TS below. It still spent a slot against PostgREST's `db-max-rows` cap,
 *      so nulls could push real months off the end of the response.
 *   2. `selectAllPaged` — a bare `.select()` returns AT MOST 1000 rows with NO error. The
 *      three cities run 421 rows today, so the cap is not biting yet; it starts biting the
 *      moment a city or a property_type is added, and it bites silently. Ordered by
 *      (area, period_end), which is unique-together (verified 421/421 distinct against the
 *      lake, 07/14/2026) — `selectAllPaged` owns ALL ordering, so no `.order()` here: a
 *      `period_end`-first sort is NOT unique (every month repeats across all three cities)
 *      and would let PostgREST skip/repeat rows across page seams.
 *
 * COUPLING: `months_of_supply` is read from these same rows, so the null filter on PRICE
 * also gates supply. Verified zero divergence in the lake (07/14/2026 — all 421 rows carry
 * both), and the two arrive paired in the Redfin feed. If that ever changes, a
 * price-null/supply-valued row would be dropped from the supply series too.
 */
export async function loadSoldSeries(supabase: Supabase): Promise<CityMonthlySeries> {
  const empty: CityMonthlySeries = { sold: new Map(), monthsSupply: new Map() };
  try {
    const data = await selectAllPaged<SoldRow>(
      () =>
        supabase
          .schema("data_lake")
          .from("redfin_city_swfl")
          .select("area, period_end, median_sale_price, months_of_supply")
          .eq("property_type", "All Residential")
          .in(
            "area",
            CITY_DEFS.map((c) => c.key),
          )
          .not("median_sale_price", "is", null) as never,
      ["area", "period_end"],
    );
    const sold = new Map<string, SeriesPoint[]>();
    const monthsSupply = new Map<string, SeriesPoint[]>();
    for (const r of data) {
      if (typeof r.median_sale_price === "number") {
        const list = sold.get(r.area) ?? [];
        list.push({ period: r.period_end, value: r.median_sale_price });
        sold.set(r.area, list);
      }
      if (typeof r.months_of_supply === "number") {
        const list = monthsSupply.get(r.area) ?? [];
        list.push({ period: r.period_end, value: r.months_of_supply });
        monthsSupply.set(r.area, list);
      }
    }
    return { sold, monthsSupply };
  } catch {
    return empty;
  }
}

// ---------------------------------------------------------------------------
// listing_active_stats — region/county rollups + per-ZIP medians (spine lane)
// ---------------------------------------------------------------------------

export interface ActiveStatsRow {
  county: string | null;
  zip_code: string | null;
  listing_count: number | null;
  median_list_price: number | null;
  latest_scraped_at: string | null;
}

export interface ActiveStats {
  region: ActiveStatsRow | null;
  counties: ActiveStatsRow[];
  zips: ActiveStatsRow[];
}

/**
 * Pure reducer over the raw view — the ONE place a `listing_active_stats` row is chosen.
 *
 * The view carries stray duplicate rollups at BOTH grains, and the same rule settles both:
 * the row with the most listings is the real one, the thin twin is junk.
 *
 * COUNTY: a Lee rollup with listing_count=1 sits beside the real ~13.9k one.
 *
 * ZIP: three ZIPs are doubled today (verified in the lake 07/14/2026) — 34110 carries a
 * 441-listing row at $659,000 AND a 14-listing row at $1,599,500; 33971 and 34119 are the
 * same shape. Every ZIP row was previously passed through unfiltered, and the downstream
 * `medianByZip` map is LAST-WRITE-WINS — so whichever twin the view happened to return
 * second became that ZIP's median, and it fed the watchlist, the movers board, the asking-
 * price map AND the Pearson correlation matrix. Deduping here (not at each of those four
 * call sites) is the fix: one authority for "which row IS this ZIP".
 *
 * COUNTIES are also scoped to core (Lee + Collier) via `isCoreCounty`. Today the view holds
 * nothing else, so this drops zero rows — it is a guard, so that a county appearing upstream
 * cannot walk onto the desk's ticker without anyone deciding it should.
 */
export function reduceActiveStats(rows: ActiveStatsRow[]): ActiveStats {
  const region = rows.find((r) => r.county == null && r.zip_code == null) ?? null;

  /** Keep the max-`listing_count` row per key — the thin twin is the junk one. */
  const keepFattest = (
    pick: (r: ActiveStatsRow) => string | null,
    include: (r: ActiveStatsRow) => boolean,
  ): ActiveStatsRow[] => {
    const best = new Map<string, ActiveStatsRow>();
    for (const r of rows) {
      const key = pick(r);
      if (key == null || !include(r)) continue;
      const prev = best.get(key);
      if (!prev || (r.listing_count ?? 0) > (prev.listing_count ?? 0)) best.set(key, r);
    }
    return [...best.values()];
  };

  const counties = keepFattest(
    (r) => r.county,
    (r) => r.zip_code == null && isCoreCounty(r.county),
  );
  const zips = keepFattest(
    (r) => r.zip_code,
    () => true,
  );
  return { region, counties, zips };
}

async function loadActiveStats(supabase: Supabase): Promise<ActiveStats> {
  try {
    const { data, error } = await supabase
      .schema("data_lake")
      .from("listing_active_stats")
      .select("county, zip_code, listing_count, median_list_price, latest_scraped_at");
    if (error || !data) return { region: null, counties: [], zips: [] };
    return reduceActiveStats(data as ActiveStatsRow[]);
  } catch {
    return { region: null, counties: [], zips: [] };
  }
}

// ---------------------------------------------------------------------------
// listing_momentum_stats — shares (values are PERCENT, e.g. 15.7)
// ---------------------------------------------------------------------------

interface MomentumStats {
  region: MomentumRow | null;
  zips: MomentumRow[];
  asOf?: string;
}

async function loadMomentum(supabase: Supabase): Promise<MomentumStats> {
  try {
    const { data, error } = await supabase
      .schema("data_lake")
      .from("listing_momentum_stats")
      .select(
        "county, zip_code, active_listing_count, price_reduced_share, new_listing_share, latest_scraped_at",
      );
    if (error || !data) return { region: null, zips: [] };
    const rows = data as (MomentumRow & { latest_scraped_at: string | null })[];
    const region = rows.find((r) => r.county == null && r.zip_code == null) ?? null;
    const asOf = mdY(
      rows
        .map((r) => r.latest_scraped_at)
        .filter((d): d is string => !!d)
        .sort()
        .at(-1),
    );
    return { region, zips: rows.filter((r) => r.zip_code != null), asOf };
  } catch {
    return { region: null, zips: [] };
  }
}

// ---------------------------------------------------------------------------
// listing_pulse_daily — the Daily Market Pulse (aggregated in SQL)
// ---------------------------------------------------------------------------

interface PulseRow {
  day: string;
  new_listings: number;
  price_cuts: number;
  price_increases: number;
  returned: number;
  departures: number;
  sold: number;
  withdrawn: number;
  total_events: number;
  latest_scraped_at: string | null;
}

async function loadPulse(supabase: Supabase): Promise<PulseData | null> {
  try {
    const { data, error } = await supabase
      .schema("data_lake")
      .from("listing_pulse_daily")
      .select("*")
      .order("day", { ascending: true });
    if (error || !data || data.length === 0) return null;
    const rows = data as PulseRow[];
    const partials = detectPartialScans(rows.map((r) => r.total_events));
    const carryovers = flagCarryoverDays(partials);
    const days: PulseDay[] = rows.map((r, i) => ({
      day: r.day,
      label: mD(r.day),
      newListings: r.new_listings,
      priceCuts: r.price_cuts,
      priceIncreases: r.price_increases,
      returned: r.returned,
      departures: r.departures,
      sold: r.sold,
      withdrawn: r.withdrawn,
      total: r.total_events,
      partial: partials[i],
      carryoverAfterPartial: carryovers[i],
    }));
    const asOf = mdY(
      rows
        .map((r) => r.latest_scraped_at)
        .filter((d): d is string => !!d)
        .sort()
        .at(-1),
    );
    return { days: days.slice(-14), asOf, sourceLabel: SPINE_SOURCE };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// listing_state flag counts — the inventory-mix strip (v2 filter-tab lane)
// ---------------------------------------------------------------------------

async function countActiveFlag(supabase: Supabase, flag: string): Promise<number | null> {
  try {
    const { count, error } = await supabase
      .schema("data_lake")
      .from("listing_state")
      .select("listing_id", { count: "exact", head: true })
      .eq("state", "active")
      .eq(flag, true);
    if (error) return null;
    return count ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Flash feed inputs — news, notable cuts, recent closings
// ---------------------------------------------------------------------------

interface NewsRow {
  headline: string | null;
  source_name: string | null;
  article_url: string | null;
  published_date: string | null;
  scraped_at: string | null;
}

async function loadNews(supabase: Supabase): Promise<FlashItem[]> {
  try {
    const { data, error } = await supabase
      .schema("data_lake")
      .from("news_articles_swfl")
      .select("headline, source_name, article_url, published_date, scraped_at")
      .order("scraped_at", { ascending: false })
      .limit(6);
    if (error || !data) return [];
    return (data as NewsRow[])
      .filter((r) => r.headline)
      .map((r, i) => ({
        id: `news-${i}`,
        kind: "news" as const,
        headline: r.headline as string,
        asOf: mdY(r.published_date) ?? mdY(r.scraped_at),
        sourceLabel: r.source_name ?? "SWFL news",
        href: r.article_url ?? undefined,
      }));
  } catch {
    return [];
  }
}

interface CutRow {
  street_address: string | null;
  city: string | null;
  zip_code: string | null;
  list_price: number | null;
  reduced_amount: number | null;
  scraped_at: string | null;
}

async function loadNotableCuts(supabase: Supabase): Promise<FlashItem[]> {
  try {
    const { data, error } = await supabase
      .schema("data_lake")
      .from("listing_state")
      .select("street_address, city, zip_code, list_price, reduced_amount, scraped_at")
      .eq("state", "active")
      .eq("flag_price_reduced", true)
      .not("reduced_amount", "is", null)
      .order("reduced_amount", { ascending: false })
      .limit(15);
    if (error || !data) return [];
    return (data as CutRow[])
      .filter((r) => isPlausibleCut({ reducedAmount: r.reduced_amount, listPrice: r.list_price }))
      .slice(0, 4)
      .map((r, i) => {
        const where = [r.street_address, r.city].filter(Boolean).join(", ");
        return {
          id: `cut-${i}`,
          kind: "price_cut" as const,
          headline: `Price cut${where ? ` — ${where}` : ""}`,
          detail: `Now ${fmtUsd(r.list_price as number)} · cut ${fmtUsd(r.reduced_amount as number)}`,
          asOf: mdY(r.scraped_at),
          sourceLabel: SPINE_SOURCE,
          lookupHref: zillowAddressUrl(r.street_address, r.city, r.zip_code),
        };
      });
  } catch {
    return [];
  }
}

interface SoldTransitionRow {
  listing_id: string | null;
  sold_price: number | null;
  sold_date: string | null;
  price: number | null;
  at: string;
}

interface SoldStateRow {
  listing_id: string;
  street_address: string | null;
  city: string | null;
  zip_code: string | null;
  list_price: number | null;
}

async function loadClosings(supabase: Supabase): Promise<FlashItem[]> {
  try {
    const { data, error } = await supabase
      .schema("data_lake")
      .from("listing_transitions")
      .select("listing_id, sold_price, sold_date, price, at")
      .eq("to_state", "sold")
      .eq("seed", false)
      .order("at", { ascending: false })
      .limit(8);
    if (error || !data || data.length === 0) return [];
    const rows = data as SoldTransitionRow[];
    const ids = rows.map((r) => r.listing_id).filter((id): id is string => !!id);
    const byId = new Map<string, SoldStateRow>();
    if (ids.length > 0) {
      const { data: states } = await supabase
        .schema("data_lake")
        .from("listing_state")
        .select("listing_id, street_address, city, zip_code, list_price")
        .in("listing_id", ids);
      for (const s of (states ?? []) as SoldStateRow[]) byId.set(s.listing_id, s);
    }
    const items: FlashItem[] = [];
    for (const [i, r] of rows.entries()) {
      const state = r.listing_id ? byId.get(r.listing_id) : undefined;
      // Lake-only resolution — NO propertyId, so the paid recorded-event lane
      // can never fire from a page render.
      const display = await resolveSoldPrice({
        soldPrice: r.sold_price,
        soldDate: r.sold_date ?? r.at,
        lastListPrice: r.price ?? state?.list_price,
      });
      if (!display) continue;
      const where = [state?.street_address, state?.city].filter(Boolean).join(", ");
      items.push({
        id: `closing-${i}`,
        kind: "closing",
        headline: `Closed${where ? ` — ${where}` : ""}`,
        detail:
          display.kind === "sold"
            ? `Sold at ${fmtUsd(display.value)}`
            : `Last listed at ${fmtUsd(display.value)}`,
        asOf: display.asOf ?? mdY(r.at),
        sourceLabel: display.source,
        lookupHref: zillowAddressUrl(state?.street_address, state?.city, state?.zip_code),
        disclosure: display.disclosure,
      });
      if (items.length >= 4) break;
    }
    return items;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Gauges — market temperature + price-reduced share
// ---------------------------------------------------------------------------

async function loadMarketTemp(supabase: Supabase): Promise<MarketTempGaugeData | null> {
  try {
    const { data, error } = await supabase
      .schema("data_lake")
      .from("market_details_swfl_latest")
      .select("zip_code, local_hotness_score, captured_date");
    if (error || !data) return null;
    const rows = (data as { zip_code?: string }[]).filter((r) => isCoreScope(r.zip_code));
    return mapMarketTemperature(rows as unknown as MarketTempRow[]);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// listing_price_bands — affordability histogram (aggregated in SQL)
// ---------------------------------------------------------------------------

interface PriceBandRow {
  county: string | null;
  band_order: number;
  band: string;
  listing_count: number;
  latest_scraped_at: string | null;
}

/** Freshness gate: a histogram older than this is hidden, not shown stale. */
const PRICE_BANDS_MAX_AGE_DAYS = 7;

async function loadPriceBands(supabase: Supabase): Promise<PriceBandsData | null> {
  try {
    const { data, error } = await supabase
      .schema("data_lake")
      .from("listing_price_bands")
      .select("county, band_order, band, listing_count, latest_scraped_at")
      .is("county", null)
      .order("band_order", { ascending: true });
    if (error || !data || data.length === 0) return null;
    const rows = data as PriceBandRow[];
    const latest = rows
      .map((r) => r.latest_scraped_at)
      .filter((d): d is string => !!d)
      .sort()
      .at(-1);
    if (!latest) return null;
    const ageDays = (Date.now() - new Date(latest).getTime()) / 86_400_000;
    if (!Number.isFinite(ageDays) || ageDays > PRICE_BANDS_MAX_AGE_DAYS) return null;
    const bands = rows.map((r) => ({ band: r.band, count: r.listing_count }));
    return {
      bands,
      total: bands.reduce((s, b) => s + b.count, 0),
      asOf: mdY(latest),
      sourceLabel: SPINE_SOURCE,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hero — dual signal: daily ASKING line (our inventory) with a monthly SOLD
// anchor (redfin.com); sold-only next; ZHVI the deepest fallback (never refuse)
// ---------------------------------------------------------------------------

function soldAnchorDatum(sold: Map<string, SeriesPoint[]>, cityKey: string): DeskDatum | undefined {
  const latest = sold.get(cityKey)?.at(-1);
  if (!latest) return undefined;
  return {
    label: "Closed-sale median (monthly)",
    value: latest.value,
    unit: "USD",
    display: fmtUsd(latest.value),
    sourceLabel: "redfin.com",
    asOf: mdY(latest.period),
  };
}

/** Comparison tab reads up to this many trailing months of the SOLD series —
 *  real per-city history already in the lake (redfin_city_swfl), so "% since
 *  start" means something instead of a 2-day flat line off the brand-new
 *  daily asking lane. */
const REBASE_TRAILING_MONTHS = 12;

function buildRebaseFromSold(sold: Map<string, SeriesPoint[]>): HeroData["rebase"] {
  const cities: NonNullable<HeroData["rebase"]>["cities"] = [];
  for (const def of CITY_DEFS) {
    const points = (sold.get(def.key) ?? []).slice(-REBASE_TRAILING_MONTHS);
    if (points.length < 2) continue;
    cities.push({
      key: def.key,
      label: def.label,
      color: def.color,
      points: points.map((p) => ({ date: p.period, value: p.value })),
    });
  }
  if (cities.length === 0) return undefined;
  const n = Math.max(...cities.map((c) => c.points.length));
  const first = cities[0].points[0]?.date;
  return {
    cities,
    sourceLabel: "redfin.com",
    windowNote: `${n} monthly closed-sale medians per city since ${mdY(first) ?? "the trailing window"} — true sold prices, redfin.com`,
  };
}

/** Individual city chart reads up to this many trailing months of months-of-
 *  supply — same real per-city history as the sold anchor, chosen because
 *  it's a genuine price-direction indicator (Zillow's HPA forecasting model
 *  and AEI's Housing Center both pair months'-supply with home-price trend;
 *  Redfin's own definition ties it to buyer's/seller's-market direction),
 *  not just a metric that happens to have more rows than the 2-day asking
 *  line. */
const TREND_TRAILING_MONTHS = 24;

function buildHeroFromAsking(
  truth: TruthSeries,
  sold: Map<string, SeriesPoint[]>,
  monthsSupply: Map<string, SeriesPoint[]>,
): HeroData | null {
  const cities: HeroCitySeries[] = [];
  for (const def of CITY_DEFS) {
    const points = truth.askingByCity.get(def.key) ?? [];
    if (points.length < 2) continue;
    const ld = latestDelta(points);
    if (!ld) continue;
    const trendPoints = (monthsSupply.get(def.key) ?? []).slice(-TREND_TRAILING_MONTHS);
    cities.push({
      key: def.key,
      label: def.label,
      color: def.color,
      latest: {
        label: `${def.label} median asking price`,
        value: ld.latest,
        unit: "USD",
        display: fmtUsd(ld.latest),
        sourceLabel: SPINE_SOURCE,
        asOf: mdY(ld.latestPeriod),
        delta: ld.delta ?? undefined,
        deltaDisplay: ld.delta != null ? fmtUsd(Math.abs(ld.delta)) : undefined,
        direction: ld.direction,
        deltaNote: ld.prevPeriod ? `vs. ${mdY(ld.prevPeriod)}` : undefined,
      },
      points: points.map((p) => ({ date: p.period, value: p.value })),
      anchor: soldAnchorDatum(sold, def.key),
      trend:
        trendPoints.length >= 2
          ? {
              points: trendPoints.map((p) => ({ date: p.period, value: p.value })),
              label: `${def.label} months of supply`,
              sourceLabel: "redfin.com",
            }
          : undefined,
    });
  }
  if (cities.length === 0) return null;
  const n = Math.max(...cities.map((c) => c.points.length));
  const first = cities[0].points[0]?.date;
  return {
    cities,
    asOf: cities[0].latest.asOf,
    sourceLabel: SPINE_SOURCE,
    windowNote: `${n} daily asking readings since ${mdY(first) ?? "the window opened"} — live active-listing medians (asking, not sold); the closed-sale anchor steps monthly`,
    rebase: buildRebaseFromSold(sold),
  };
}

/**
 * THE HERO — the closed-sale median, its FULL history, with the fitted trend behind it.
 *
 * This zone is titled "Home Price Trend", and until 07/14/2026 it charted MONTHS OF
 * SUPPLY under a price headline. Months of supply is a real price-direction indicator
 * and a defensible thing to show — but it is not a price, and an area chart under a
 * dollar figure reads as that dollar figure. The panel named a price trend and drew
 * something else.
 *
 * So the hero rides the one deep PRICE series we actually hold: monthly closed-sale
 * medians from redfin.com — 132 months for Cape Coral and Fort Myers, 157 for Naples,
 * every one of them valued (verified against the lake 07/14/2026). That depth is what
 * earns the full window menu, and it is the series `trendVerdict` was built and tested
 * against. Months of supply keeps its place as a stated figure (`supply`), where it can
 * be read for what it is instead of mistaken for a price.
 *
 * NOT sliced to 24 months. The whole thesis of the fit engine is that one window is a
 * liar by omission — the long run and the last two years are BOTH true and the insight
 * is in the comparison. Handing it a pre-truncated series would delete the comparison
 * before it could be made.
 */
function buildHeroFromSold(
  sold: Map<string, SeriesPoint[]>,
  asking: Map<string, SeriesPoint[]>,
  monthsSupply: Map<string, SeriesPoint[]>,
): HeroData | null {
  const cities: HeroCitySeries[] = [];
  for (const def of CITY_DEFS) {
    const points = sold.get(def.key) ?? [];
    if (points.length < 2) continue;
    const ld = latestDelta(points);
    if (!ld) continue;
    const prevMonth = ld.prevPeriod?.slice(0, 7);

    // The fit runs on the SAME points the chart draws. If it ever ran on a different
    // slice, the line would be drawn from numbers the reader cannot see.
    const asOfDate = new Date(`${ld.latestPeriod.slice(0, 10)}T00:00:00Z`);
    const fits = fitWindows(
      points.map((p) => ({ when: new Date(`${p.period.slice(0, 10)}T00:00:00Z`), y: p.value })),
      asOfDate,
    );
    const verdict = trendVerdict(fits);

    const liveAsking = asking.get(def.key)?.at(-1);
    const supply = monthsSupply.get(def.key)?.at(-1);

    cities.push({
      key: def.key,
      label: def.label,
      color: def.color,
      latest: {
        label: `${def.label} median sale price`,
        value: ld.latest,
        unit: "USD",
        display: fmtUsd(ld.latest),
        sourceLabel: "redfin.com",
        asOf: mdY(ld.latestPeriod),
        delta: ld.delta ?? undefined,
        deltaDisplay: ld.delta != null ? fmtUsd(Math.abs(ld.delta)) : undefined,
        direction: ld.direction,
        deltaNote: prevMonth
          ? `vs. ${prevMonth.slice(5)}/${prevMonth.slice(0, 4)} (monthly)`
          : undefined,
      },
      points: points.map((p) => ({ date: p.period, value: p.value })),
      // The live asking median rides along as the FRESH signal — it moves daily, while
      // the sold anchor steps monthly. It is a different question ("what are they
      // asking?") and it is labelled as one.
      anchor: liveAsking
        ? {
            label: "Live asking median",
            value: liveAsking.value,
            unit: "USD",
            display: fmtUsd(liveAsking.value),
            sourceLabel: SPINE_SOURCE,
            asOf: mdY(liveAsking.period),
          }
        : undefined,
      supply: supply
        ? {
            label: "Months of supply",
            value: supply.value,
            unit: "months",
            display: `${supply.value.toFixed(1)} mo`,
            sourceLabel: "redfin.com",
            asOf: mdY(supply.period),
          }
        : undefined,
      fit: verdict ? serializeOverlay(fitOverlay(verdict)) : undefined,
      // THE MENU THIS SERIES EARNED — nothing more. `fitWindows` already dropped every
      // window that would wear a label outrunning its data, so whatever survives here is
      // exactly what the UI may offer. It never adds a row back.
      windows: fits.length > 0 ? serializeWindowViews(windowViews(fits)) : undefined,
    });
  }
  if (cities.length === 0) return null;
  // n and first MUST come from the same city — Cape Coral/Fort Myers run 132 months back
  // to 06/30/2015, Naples runs 157 back to ~2013. Pairing the longest count with cities[0]'s
  // (Cape Coral's) start date produced a sentence no single city's series actually supports.
  const longest = cities.reduce((a, b) => (b.points.length > a.points.length ? b : a));
  const n = longest.points.length;
  const first = longest.points[0]?.date;
  return {
    cities,
    asOf: cities[0].latest.asOf,
    sourceLabel: "redfin.com",
    // No [INFERENCE] language here: the zone renders this note at the TOP and DeskHero
    // renders it again at the bottom, so anything put in it is said twice. The trend read
    // carries its own [INFERENCE] tag, its base value and its falsifier, in the copy block
    // that sits directly under the chart — which is where a reader is actually looking.
    windowNote: `${n} monthly closed-sale medians per city since ${mdY(first) ?? "the window opened"} — true sold prices, redfin.com`,
    // Without this, DeskHero's "% since start" tab falls back to the raw per-city series
    // (hero.cities), which run to DIFFERENT depths and start dates. Rebasing each city from
    // its own first point and merging by date puts a vertical spike wherever the shorter
    // series starts. buildRebaseFromSold gives all three cities the SAME trailing window.
    rebase: buildRebaseFromSold(sold),
  };
}

async function buildHeroFromZhvi(supabase: Supabase): Promise<HeroData | null> {
  // loadMetros is the /charts gallery loader — same view, zero new source.
  const panel = await loadMetros(supabase, "zhvi_pivoted");
  if (panel.error || panel.data.length < 2) return null;
  const months = panel.data.slice(-24);
  const cities: HeroCitySeries[] = [];
  for (const def of CITY_DEFS) {
    const points: SeriesPoint[] = months
      .map((row) => ({
        period: `${String(row.month)}-01`,
        value: row[def.key] as number,
      }))
      .filter((p) => typeof p.value === "number" && Number.isFinite(p.value));
    if (points.length < 2) continue;
    const ld = latestDelta(points);
    if (!ld) continue;
    const prevMonth = ld.prevPeriod?.slice(0, 7);
    cities.push({
      key: def.key,
      label: def.label,
      color: def.color,
      latest: {
        label: `${def.label} typical home value`,
        value: ld.latest,
        unit: "USD",
        display: fmtUsd(ld.latest),
        sourceLabel: "Zillow Home Value Index (ZHVI)",
        asOf: mdY(ld.latestPeriod),
        delta: ld.delta ?? undefined,
        deltaDisplay: ld.delta != null ? fmtUsd(Math.abs(ld.delta)) : undefined,
        direction: ld.direction,
        deltaNote: prevMonth
          ? `vs. ${prevMonth.slice(5)}/${prevMonth.slice(0, 4)} (monthly)`
          : undefined,
      },
      points: points.map((p) => ({ date: p.period, value: p.value })),
    });
  }
  if (cities.length === 0) return null;
  return {
    cities,
    asOf: cities[0].latest.asOf,
    sourceLabel: "Zillow Home Value Index (ZHVI)",
    windowNote: "Monthly typical home value, trailing 24 months",
  };
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export async function loadDeskData(): Promise<DeskData> {
  const supabase = createServiceRoleClientUntyped();

  const [
    truth,
    citySeries,
    stats,
    momentum,
    pulse,
    news,
    cuts,
    closings,
    marketTemp,
    newConstruction,
    pending,
    foreclosures,
    bands,
  ] = await Promise.all([
    loadTruthSeries(supabase),
    loadSoldSeries(supabase),
    loadActiveStats(supabase),
    loadMomentum(supabase),
    loadPulse(supabase),
    loadNews(supabase),
    loadNotableCuts(supabase),
    loadClosings(supabase),
    loadMarketTemp(supabase),
    countActiveFlag(supabase, "flag_new_construction"),
    countActiveFlag(supabase, "flag_pending"),
    countActiveFlag(supabase, "flag_foreclosure"),
    loadPriceBands(supabase),
  ]);

  // Hero ladder — the zone is called "Home Price Trend", so it leads with the deepest
  // real PRICE series and the fitted trend over it:
  //   1. monthly SOLD line (closed-sale medians, redfin.com) + the backlit fit
  //   2. daily ASKING line — only if the sold feed is empty; too short to fit
  //   3. monthly ZHVI (smoothed index) — deepest fallback, never refuse
  //
  // Sold LEADS now (it trailed the 2-day asking lane until 07/14/2026). A trend needs
  // history: the fit engine drops any window under 12 points, and two days of asking is
  // not a trend at any window — it is a reading. The asking median is still on the panel,
  // as the live figure it actually is.
  const hero =
    buildHeroFromSold(citySeries.sold, truth.askingByCity, citySeries.monthsSupply) ??
    buildHeroFromAsking(truth, citySeries.sold, citySeries.monthsSupply) ??
    (await buildHeroFromZhvi(supabase));

  const spineAsOf = mdY(stats.region?.latest_scraped_at ?? undefined);
  const mortgageLd = latestDelta(truth.mortgage.points);
  const mortgageSource = truth.mortgage.sourceTitle ?? "Web-verified source";
  const latestPulseDay = pulse?.days.at(-1) ?? null;

  // --- KPI stat-flow row -------------------------------------------------
  const kpis: DeskDatum[] = [];
  if (stats.region?.median_list_price != null) {
    kpis.push({
      label: "Median asking price",
      value: stats.region.median_list_price,
      unit: "USD",
      display: fmtUsd(stats.region.median_list_price),
      sourceLabel: SPINE_SOURCE,
      asOf: spineAsOf,
    });
  }
  if (stats.region?.listing_count != null) {
    kpis.push({
      label: "Active listings",
      value: stats.region.listing_count,
      unit: "listings",
      display: fmtCount(stats.region.listing_count),
      sourceLabel: SPINE_SOURCE,
      asOf: spineAsOf,
      plural: true,
    });
  }
  if (momentum.region?.price_reduced_share != null) {
    kpis.push({
      label: "Listings with a price cut",
      value: momentum.region.price_reduced_share,
      unit: "%",
      display: fmtPct(momentum.region.price_reduced_share),
      sourceLabel: SPINE_SOURCE,
      asOf: momentum.asOf ?? spineAsOf,
      plural: true,
    });
  }
  if (mortgageLd) {
    kpis.push({
      label: "30-yr fixed mortgage",
      value: mortgageLd.latest,
      unit: "%",
      display: fmtPct(mortgageLd.latest, 2),
      sourceLabel: mortgageSource,
      asOf: mdY(mortgageLd.latestPeriod),
      delta: mortgageLd.delta ?? undefined,
      deltaDisplay:
        mortgageLd.delta != null ? `${Math.abs(mortgageLd.delta).toFixed(2)} pts` : undefined,
      direction: mortgageLd.direction,
      deltaNote: mortgageLd.prevPeriod
        ? `vs. prior reading ${mdY(mortgageLd.prevPeriod)}`
        : undefined,
      national: true,
    });
  }
  if (latestPulseDay) {
    kpis.push({
      label: "New listings, latest scan",
      value: latestPulseDay.newListings,
      unit: "listings",
      display: fmtCount(latestPulseDay.newListings),
      sourceLabel: SPINE_SOURCE,
      asOf: mdY(latestPulseDay.day),
      deltaNote: latestPulseDay.partial ? "partial scan — incomplete sweep" : undefined,
      plural: true,
    });
    kpis.push({
      label: "Confirmed sold, latest scan",
      value: latestPulseDay.sold,
      unit: "listings",
      display: fmtCount(latestPulseDay.sold),
      sourceLabel: SPINE_SOURCE,
      asOf: mdY(latestPulseDay.day),
      deltaNote: latestPulseDay.partial ? "partial scan — incomplete sweep" : undefined,
    });
  }

  // --- Inventory-mix strip (same lane the v2 filter tabs will read) ------
  const mix: DeskDatum[] = [];
  const mixDef: Array<[string, number | null]> = [
    ["New construction", newConstruction],
    ["Pending", pending],
    ["Foreclosures", foreclosures],
  ];
  for (const [label, count] of mixDef) {
    if (count == null) continue;
    mix.push({
      label,
      value: count,
      unit: "listings",
      display: fmtCount(count),
      sourceLabel: SPINE_SOURCE,
      asOf: spineAsOf,
    });
  }

  // --- Movers board -------------------------------------------------------
  const medianByZip = new Map<string, number>();
  for (const z of stats.zips) {
    if (z.zip_code && z.median_list_price != null) medianByZip.set(z.zip_code, z.median_list_price);
  }
  const toMoverRows = (rows: MomentumRow[], key: "price_reduced_share" | "new_listing_share") =>
    rows.map((r) => ({
      zip: r.zip_code as string,
      county: r.county,
      value: r[key] as number,
      display: fmtPct(r[key] as number),
      activeCount: r.active_listing_count ?? 0,
      medianListDisplay:
        r.zip_code && medianByZip.has(r.zip_code)
          ? fmtUsd(medianByZip.get(r.zip_code) as number)
          : undefined,
    }));
  const movers: MoversData | null =
    momentum.zips.length > 0
      ? {
          priceCutShare: toMoverRows(
            rankMovers(momentum.zips, "price_reduced_share"),
            "price_reduced_share",
          ),
          newListingShare: toMoverRows(
            rankMovers(momentum.zips, "new_listing_share"),
            "new_listing_share",
          ),
          pressure: momentum.zips
            .filter(
              (r) =>
                r.zip_code != null &&
                (r.active_listing_count ?? 0) >= MOVERS_MIN_ACTIVE &&
                typeof r.price_reduced_share === "number" &&
                Number.isFinite(r.price_reduced_share) &&
                typeof r.new_listing_share === "number" &&
                Number.isFinite(r.new_listing_share),
            )
            .map((r) => ({
              zip: r.zip_code as string,
              county: r.county,
              cutShare: r.price_reduced_share as number,
              newShare: r.new_listing_share as number,
              activeCount: r.active_listing_count ?? 0,
            })),
          minActive: MOVERS_MIN_ACTIVE,
          asOf: momentum.asOf ?? spineAsOf,
          sourceLabel: SPINE_SOURCE,
        }
      : null;

  // --- Watchlist rows + ⌘K jump list (every core ZIP, SSR-formatted) ------
  const watch: WatchZipRow[] = momentum.zips
    .filter((r) => r.zip_code && isCoreScope(r.zip_code))
    .map((r) => ({
      zip: r.zip_code as string,
      county: r.county,
      activeCount: r.active_listing_count ?? 0,
      medianListDisplay:
        r.zip_code && medianByZip.has(r.zip_code)
          ? fmtUsd(medianByZip.get(r.zip_code) as number)
          : undefined,
      priceCutShareDisplay:
        r.price_reduced_share != null ? fmtPct(r.price_reduced_share) : undefined,
      newListingShareDisplay: r.new_listing_share != null ? fmtPct(r.new_listing_share) : undefined,
    }))
    .sort((a, b) => a.zip.localeCompare(b.zip));

  // --- ZIP×metric correlation (deterministic Pearson, lib/desk/correlation) --
  const CORRELATION_METRICS: CorrelationMetric[] = [
    { key: "median", label: "Median asking price" },
    { key: "active", label: "Active listings" },
    { key: "cuts", label: "Price-cut share" },
    { key: "fresh", label: "New-listing share" },
  ];
  const corrRows = momentum.zips
    .filter((r) => r.zip_code && isCoreScope(r.zip_code))
    .map((r) => ({
      median: r.zip_code ? (medianByZip.get(r.zip_code) ?? null) : null,
      active: r.active_listing_count,
      cuts: r.price_reduced_share,
      fresh: r.new_listing_share,
    }));
  const corr = correlationMatrix(corrRows, CORRELATION_METRICS);
  const correlation: CorrelationData | null = corr
    ? {
        labels: corr.labels,
        matrix: corr.matrix,
        // Each pair carries its OWN verdict + its OWN n. A cell that does not clear
        // its critical r is not a weak correlation — it is NOT A CORRELATION, and
        // the heatmap renders it neutral rather than colouring noise.
        established: corr.established,
        pairN: corr.pairN,
        zipCount: corr.minPairN,
        asOf: momentum.asOf ?? spineAsOf,
        sourceLabel: SPINE_SOURCE,
      }
    : null;

  // --- Asking-price map (homepage MapCanvas, live override) ---------------
  // Reuses the medians already in memory — zero extra queries. Fewer than 20
  // valued ZIPs → zone hides (a sparse map reads as broken, not as data).
  const mapData: Record<string, number> = {};
  for (const z of stats.zips) {
    if (z.zip_code && isCoreScope(z.zip_code) && z.median_list_price != null) {
      mapData[z.zip_code] = z.median_list_price;
    }
  }
  const mapValues = Object.values(mapData);
  const map =
    mapValues.length >= 20
      ? {
          label: "Median asking price",
          sublabel: "Active-listing median asking price per ZIP",
          format: "currency" as const,
          data: mapData,
          low: Math.min(...mapValues),
          high: Math.max(...mapValues),
          // The homepage's brand ramp (operator ruling 07/03/2026): dark slate
          // base, gold→coral where values run high.
          c0: "#33525e",
          c1: "#d4b370",
          c2: "#e08158",
          asOf: spineAsOf,
        }
      : null;

  // --- Flash feed (news + notable events, newest first) -------------------
  const flash: FlashItem[] = [...news, ...cuts, ...closings]
    .sort((a, b) => {
      const ak = a.asOf ? a.asOf.slice(6) + a.asOf.slice(0, 5) : "";
      const bk = b.asOf ? b.asOf.slice(6) + b.asOf.slice(0, 5) : "";
      return bk.localeCompare(ak);
    })
    .slice(0, 12);

  // --- Ticker --------------------------------------------------------------
  const ticker: TickerEntry[] = [];
  if (stats.region?.median_list_price != null) {
    ticker.push({
      id: "t-median",
      label: "SWFL median ask",
      display: fmtUsd(stats.region.median_list_price),
      asOf: spineAsOf,
      sourceLabel: SPINE_SOURCE,
    });
  }
  for (const c of stats.counties) {
    if (c.median_list_price == null || !c.county) continue;
    ticker.push({
      id: `t-${c.county.toLowerCase()}`,
      label: `${c.county} median ask`,
      display: fmtUsd(c.median_list_price),
      asOf: mdY(c.latest_scraped_at),
      sourceLabel: SPINE_SOURCE,
    });
  }
  if (mortgageLd) {
    ticker.push({
      id: "t-mortgage",
      label: "30-yr fixed",
      display: fmtPct(mortgageLd.latest, 2),
      direction: mortgageLd.direction,
      deltaDisplay:
        mortgageLd.delta != null ? `${Math.abs(mortgageLd.delta).toFixed(2)}` : undefined,
      asOf: mdY(mortgageLd.latestPeriod),
      sourceLabel: mortgageSource,
    });
  }
  if (latestPulseDay) {
    const partial = latestPulseDay.partial ? " (partial scan)" : "";
    ticker.push(
      {
        id: "t-new",
        label: `New${partial}`,
        display: fmtCount(latestPulseDay.newListings),
        asOf: mdY(latestPulseDay.day),
        sourceLabel: SPINE_SOURCE,
      },
      {
        id: "t-cuts",
        label: `Price cuts${partial}`,
        display: fmtCount(latestPulseDay.priceCuts),
        asOf: mdY(latestPulseDay.day),
        sourceLabel: SPINE_SOURCE,
      },
      {
        id: "t-sold",
        label: `Sold${partial}`,
        display: fmtCount(latestPulseDay.sold),
        asOf: mdY(latestPulseDay.day),
        sourceLabel: SPINE_SOURCE,
      },
    );
  }

  const gauges: DeskGauges = {
    marketTemp,
    priceReduced:
      momentum.region?.price_reduced_share != null
        ? {
            label: "Share of active listings with a price cut",
            value: momentum.region.price_reduced_share,
            unit: "%",
            display: fmtPct(momentum.region.price_reduced_share),
            sourceLabel: SPINE_SOURCE,
            asOf: momentum.asOf ?? spineAsOf,
          }
        : null,
  };

  // Quotable takeaways (Spec B GEO). Region KPIs + the price-cut gauge are
  // SWFL-scoped; `national`/`plural` are explicit flags set at each push site
  // above — never inferred from label text. Hero city datums already name
  // their city in the label, so no scope.
  const SWFL = "Southwest Florida";
  for (const d of kpis) {
    d.takeaway = makeTakeaway(d, d.national ? undefined : SWFL);
  }
  if (gauges.priceReduced) gauges.priceReduced.takeaway = makeTakeaway(gauges.priceReduced, SWFL);
  if (hero) for (const c of hero.cities) c.latest.takeaway = makeTakeaway(c.latest);

  return { ticker, hero, kpis, mix, pulse, movers, flash, gauges, watch, bands, correlation, map };
}
