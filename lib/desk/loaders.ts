// lib/desk/loaders.ts — one loader per /desk zone, all aggregate-at-source.
// Every zone returns its OWN sourceLabel + asOf (the feeds have different
// vintages — a blended page-level stamp would be a lie). Empty-tolerant by
// construction: a dead feed returns null/[] and its zone hides; nothing is
// ever fabricated.
//
// KNOWN-DEBT(data_lake: desk aggregates live in the data_lake schema (typed public only))
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isCoreScope } from "@/refinery/lib/core-scope.mts";
import {
  mapMarketTemperature,
  type MarketTempGaugeData,
  type MarketTempRow,
} from "@/lib/charts/market-temperature-series";
import { loadMetros } from "@/lib/charts/gallery-loaders";
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
import type {
  DeskData,
  DeskDatum,
  DeskGauges,
  FlashItem,
  HeroCitySeries,
  HeroData,
  MoversData,
  PulseData,
  PulseDay,
  TickerEntry,
} from "./types";

type Supabase = SupabaseClient;

const SPINE_SOURCE = "SWFL Data Gulf";
const CITY_DEFS = [
  { key: "cape_coral", label: "Cape Coral", color: "#3DC9C0" }, // gulf-teal, solid
  { key: "fort_myers", label: "Fort Myers", color: "#5bc97a" }, // mangrove
  { key: "naples", label: "Naples", color: "#d4b370" }, // neutral-gold
] as const;

// ---------------------------------------------------------------------------
// daily_truth (web-verified lane) — price series per city + mortgage rate
// ---------------------------------------------------------------------------

interface TruthRow {
  metric_key: string;
  area: string;
  period: string;
  value: number | null;
  source_title: string | null;
}

interface TruthSeries {
  /** Non-null daily price points per city — EMPTY when the feed carries no
   *  values (verified 07/11/2026: all median_sale_price rows are unvalued). */
  pricesByCity: Map<string, SeriesPoint[]>;
  mortgage: { points: SeriesPoint[]; sourceTitle: string | null };
}

async function loadTruthSeries(supabase: Supabase): Promise<TruthSeries> {
  const empty: TruthSeries = {
    pricesByCity: new Map(),
    mortgage: { points: [], sourceTitle: null },
  };
  try {
    const { data, error } = await supabase
      .schema("data_lake")
      .from("daily_truth")
      .select("metric_key, area, period, value, source_title")
      .in("metric_key", ["median_sale_price", "mortgage_30yr_fixed"])
      .order("period", { ascending: true });
    if (error || !data) return empty;
    const rows = data as TruthRow[];
    const pricesByCity = new Map<string, SeriesPoint[]>();
    const mortgagePoints: SeriesPoint[] = [];
    let mortgageSource: string | null = null;
    for (const r of rows) {
      if (typeof r.value !== "number" || !Number.isFinite(r.value)) continue;
      if (r.metric_key === "median_sale_price") {
        const list = pricesByCity.get(r.area) ?? [];
        list.push({ period: r.period, value: r.value });
        pricesByCity.set(r.area, list);
      } else if (r.metric_key === "mortgage_30yr_fixed") {
        mortgagePoints.push({ period: r.period, value: r.value });
        mortgageSource = r.source_title ?? mortgageSource;
      }
    }
    return { pricesByCity, mortgage: { points: mortgagePoints, sourceTitle: mortgageSource } };
  } catch {
    return empty;
  }
}

// ---------------------------------------------------------------------------
// listing_active_stats — region/county rollups + per-ZIP medians (spine lane)
// ---------------------------------------------------------------------------

interface ActiveStatsRow {
  county: string | null;
  zip_code: string | null;
  listing_count: number | null;
  median_list_price: number | null;
  latest_scraped_at: string | null;
}

interface ActiveStats {
  region: ActiveStatsRow | null;
  counties: ActiveStatsRow[];
  zips: ActiveStatsRow[];
}

async function loadActiveStats(supabase: Supabase): Promise<ActiveStats> {
  try {
    const { data, error } = await supabase
      .schema("data_lake")
      .from("listing_active_stats")
      .select("county, zip_code, listing_count, median_list_price, latest_scraped_at");
    if (error || !data) return { region: null, counties: [], zips: [] };
    const rows = data as ActiveStatsRow[];
    const region = rows.find((r) => r.county == null && r.zip_code == null) ?? null;
    // The view can carry a stray duplicate county rollup (observed: a Lee row
    // with listing_count=1 beside the real ~20.7k one) — keep the max-count row.
    const byCounty = new Map<string, ActiveStatsRow>();
    for (const r of rows) {
      if (r.county == null || r.zip_code != null) continue;
      const prev = byCounty.get(r.county);
      if (!prev || (r.listing_count ?? 0) > (prev.listing_count ?? 0)) byCounty.set(r.county, r);
    }
    const zips = rows.filter((r) => r.zip_code != null);
    return { region, counties: [...byCounty.values()], zips };
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
        .select("listing_id, street_address, city, list_price")
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
// Hero — daily_truth first; ZHVI monthly fallback (four-lane: never refuse)
// ---------------------------------------------------------------------------

function buildHeroFromTruth(truth: TruthSeries): HeroData | null {
  const cities: HeroCitySeries[] = [];
  for (const def of CITY_DEFS) {
    const points = truth.pricesByCity.get(def.key) ?? [];
    if (points.length < 2) continue;
    const ld = latestDelta(points);
    if (!ld) continue;
    cities.push({
      key: def.key,
      label: def.label,
      color: def.color,
      latest: {
        label: `${def.label} median sale price`,
        value: ld.latest,
        unit: "USD",
        display: fmtUsd(ld.latest),
        sourceLabel: "Web-verified daily read",
        asOf: mdY(ld.latestPeriod),
        delta: ld.delta ?? undefined,
        deltaDisplay: ld.delta != null ? fmtUsd(Math.abs(ld.delta)) : undefined,
        direction: ld.direction,
        deltaNote: ld.prevPeriod ? `vs. ${mdY(ld.prevPeriod)}` : undefined,
      },
      points: points.map((p) => ({ date: p.period, value: p.value })),
    });
  }
  if (cities.length === 0) return null;
  const n = Math.max(...cities.map((c) => c.points.length));
  const first = cities[0].points[0]?.date;
  return {
    cities,
    asOf: cities[0].latest.asOf,
    sourceLabel: "Web-verified daily read",
    windowNote: `${n} daily readings since ${mdY(first) ?? "the window opened"} — a real but short window`,
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
  ] = await Promise.all([
    loadTruthSeries(supabase),
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
  ]);

  // Hero: the web-verified daily price line when it carries values, else the
  // monthly ZHVI lane (self-healing — the daily line takes over the day the
  // feed fills; verified empty 07/11/2026).
  const hero = buildHeroFromTruth(truth) ?? (await buildHeroFromZhvi(supabase));

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
          minActive: MOVERS_MIN_ACTIVE,
          asOf: momentum.asOf ?? spineAsOf,
          sourceLabel: SPINE_SOURCE,
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

  return { ticker, hero, kpis, mix, pulse, movers, flash, gauges };
}
