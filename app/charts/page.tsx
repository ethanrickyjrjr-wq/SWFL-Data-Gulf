import Image from "next/image";
import { PageShell } from "@/components/PageShell";
import {
  MetroAreaChart,
  HurricaneRingChart,
  MarketTemperatureGauge,
  ZipMomentumHeatmap,
  MomentumProfitLossPanel,
  TierProjectionChart,
} from "@/components/charts";
import {
  mapMarketTemperature,
  type MarketTempRow,
  type MarketTempGaugeData,
} from "@/lib/charts/market-temperature-series";
import {
  mapZipHeatmap,
  type ZipYoYRow,
  type ZipHeatmapData,
} from "@/lib/charts/zip-heatmap-series";
import { AddChartToProject } from "./AddChartToProject";
import { mapPivotedCityRows, mapPivotedCityYoY } from "@/lib/charts/pivoted-series";
import { mapAirportTotalWithTrend, type AirportMonthRow } from "@/lib/charts/airport-series";
import {
  mapTierIndexed,
  mapTierYoY,
  type TierPivotedRow,
} from "@/lib/charts/tier-divergence-series";
import { SWFL_METRO_SERIES, REGION_AIR_TRAVEL_SERIES } from "@/lib/charts/series";
import type { ChartRow, ChartSeriesDef, PivotedCityMonth } from "@/types/viz";
import type { ValueFormat } from "@/lib/charts/format";
// KNOWN-DEBT(data_lake: reads chart aggregates from the data_lake schema (typed public only))
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import { isCoreScope } from "@/refinery/lib/core-scope.mts";

// 5 min: reduces post-migration stale window from 60 min to 5 min.
// Data is purely Supabase PostgreSQL — no external API cost amplification.
export const revalidate = 300;

type Supabase = ReturnType<typeof createServiceRoleClientUntyped>;

interface LoadedPanel {
  data: ChartRow[];
  asOf?: string;
  error: string | null;
}

// 3-metro pivoted view ({ month, cape_coral, fort_myers, naples }).
async function loadMetros(supabase: Supabase, view: string): Promise<LoadedPanel> {
  try {
    const { data, error } = await supabase
      .schema("data_lake")
      .from(view)
      .select("month, cape_coral, fort_myers, naples")
      .order("month", { ascending: true });
    if (error) return { data: [], asOf: undefined, error: error.message };
    // ~136–316 rows per view — a single .select() is safe (well under the 1000-row
    // PostgREST cap). Point a panel at a long ZIP×month view and switch to
    // selectAllPaged (refinery/lib/paginate.mts) instead.
    const mapped = mapPivotedCityRows(data as PivotedCityMonth[] | null);
    // Re-shape into plain ChartRow literals: a MetroTrendEntry interface has no
    // index signature, so it won't assign to ChartRow without this (literals are
    // checked against the index signature and pass cleanly — no `unknown` cast).
    const rows: ChartRow[] = mapped.entries.map((e) => ({
      month: e.month,
      cape_coral: e.cape_coral,
      fort_myers: e.fort_myers,
      naples: e.naples,
    }));
    return { data: rows, asOf: mapped.asOf, error: null };
  } catch (err) {
    return { data: [], asOf: undefined, error: err instanceof Error ? err.message : String(err) };
  }
}

// YoY % momentum derived from the same zhvi_pivoted view — zero new source.
async function loadHomeValueMomentum(supabase: Supabase): Promise<LoadedPanel> {
  try {
    const { data, error } = await supabase
      .schema("data_lake")
      .from("zhvi_pivoted")
      .select("month, cape_coral, fort_myers, naples")
      .order("month", { ascending: true });
    if (error) return { data: [], asOf: undefined, error: error.message };
    const mapped = mapPivotedCityYoY(data as PivotedCityMonth[] | null);
    const rows: ChartRow[] = mapped.entries.map((e) => ({
      month: e.month,
      cape_coral: e.cape_coral,
      fort_myers: e.fort_myers,
      naples: e.naples,
    }));
    return { data: rows, asOf: mapped.asOf, error: null };
  } catch (err) {
    return { data: [], asOf: undefined, error: err instanceof Error ? err.message : String(err) };
  }
}

// Luxury vs. starter home-price tracks, each indexed to 100 at 2019-01
// (data_lake.tier_divergence_pivoted — 363 monthly rows, well under the 1000-row
// PostgREST cap, so a single .select() is safe).
async function loadTierIndexed(supabase: Supabase): Promise<LoadedPanel> {
  try {
    const { data, error } = await supabase
      .schema("data_lake")
      .from("tier_divergence_pivoted")
      .select("month, median_top_tier, median_bottom_tier")
      .order("month", { ascending: true });
    if (error) return { data: [], asOf: undefined, error: error.message };
    const mapped = mapTierIndexed(data as TierPivotedRow[] | null);
    return { data: mapped.entries, asOf: mapped.asOf, error: null };
  } catch (err) {
    return { data: [], asOf: undefined, error: err instanceof Error ? err.message : String(err) };
  }
}

const TIER_YOY_SERIES: ChartSeriesDef[] = [
  { key: "luxury_yoy", label: "Luxury homes", color: "#3DC9C0", dash: "" },
  { key: "starter_yoy", label: "Starter homes", color: "#5bc97a", dash: "8 5" },
];

async function loadTierYoY(supabase: Supabase): Promise<LoadedPanel> {
  try {
    const { data, error } = await supabase
      .schema("data_lake")
      .from("tier_divergence_pivoted")
      .select("month, median_top_tier, median_bottom_tier")
      .order("month", { ascending: true });
    if (error) return { data: [], asOf: undefined, error: error.message };
    const mapped = mapTierYoY(data as TierPivotedRow[] | null);
    return { data: mapped.entries, asOf: mapped.asOf, error: null };
  } catch (err) {
    return { data: [], asOf: undefined, error: err instanceof Error ? err.message : String(err) };
  }
}

// Median per-ZIP market hotness for the temperature dial
// (data_lake.market_details_swfl_latest — ~54 rows, one per ZIP).
async function loadMarketTemperature(
  supabase: Supabase,
): Promise<{ gauge: MarketTempGaugeData | null }> {
  try {
    const { data, error } = await supabase
      .schema("data_lake")
      .from("market_details_swfl_latest")
      .select("zip_code, local_hotness_score, captured_date");
    if (error) return { gauge: null };
    // Core scope (57) only. Without this, non-core SWFL ZIPs (Sarasota/Charlotte) inflate BOTH the
    // "N scored ZIPs" count AND the median hotness the dial reports as "SWFL". The lake view is the
    // direct source here — neither the pack source-fix nor candidates.ts reaches this panel.
    const rows = ((data ?? []) as { zip_code?: string }[]).filter((r) => isCoreScope(r.zip_code));
    return { gauge: mapMarketTemperature(rows as MarketTempRow[]) };
  } catch {
    return { gauge: null };
  }
}

// Trailing-13-month ZIP×month YoY window for the momentum heatmap
// (data_lake.zhvi_zip_yoy_monthly — aggregate-at-source view). 13 months ×
// 109 ZIPs ≈ 1,400 rows, over the 1000-row PostgREST cap, so page through it.
async function loadZipHeatmap(supabase: Supabase): Promise<{ grid: ZipHeatmapData | null }> {
  try {
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - 13);
    const sinceIso = since.toISOString().slice(0, 10);
    const pageSize = 1000;
    const all: ZipYoYRow[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .schema("data_lake")
        .from("zhvi_zip_yoy_monthly")
        .select("zip_code, period_end, yoy_pct")
        .gte("period_end", sinceIso)
        .order("period_end", { ascending: true })
        .order("zip_code", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) return { grid: null };
      all.push(...((data ?? []) as ZipYoYRow[]));
      if (!data || data.length < pageSize) break;
    }
    // Core scope (57) only — the view carries ~109 ZIPs incl. non-core SWFL + spillover.
    return { grid: mapZipHeatmap(all.filter((r) => isCoreScope(r.zip_code))) };
  } catch {
    return { grid: null };
  }
}

// Total-passenger feed with 12-month trend overlay (public.rsw_airport_monthly).
async function loadPassengers(supabase: Supabase): Promise<LoadedPanel> {
  try {
    const { data, error } = await supabase
      .from("rsw_airport_monthly")
      .select("report_month, value")
      .eq("airport_code", "RSW")
      .eq("metric", "total_passengers")
      .order("report_month", { ascending: true });
    if (error) return { data: [], asOf: undefined, error: error.message };
    const mapped = mapAirportTotalWithTrend(data as AirportMonthRow[] | null);
    return { data: mapped.entries, asOf: mapped.asOf, error: null };
  } catch (err) {
    return { data: [], asOf: undefined, error: err instanceof Error ? err.message : String(err) };
  }
}

interface RenderedPanel extends LoadedPanel {
  rootId: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  valueFormat: ValueFormat;
  series: ChartSeriesDef[];
  variant?: "line" | "area";
}

export default async function ChartsPage() {
  const supabase = createServiceRoleClientUntyped();
  const [
    homeValues,
    rents,
    passengers,
    homeValueMomentum,
    tierIndexed,
    tierYoY,
    marketTemp,
    zipHeat,
  ] = await Promise.all([
    loadMetros(supabase, "zhvi_pivoted"),
    loadMetros(supabase, "zori_pivoted"),
    loadPassengers(supabase),
    loadHomeValueMomentum(supabase),
    loadTierIndexed(supabase),
    loadTierYoY(supabase),
    loadMarketTemperature(supabase),
    loadZipHeatmap(supabase),
  ]);

  const panels: RenderedPanel[] = [
    {
      rootId: "home-values",
      eyebrow: "Southwest Florida",
      title: "Median Home Value",
      subtitle: "Cape Coral · Fort Myers · Naples",
      valueFormat: "usd",
      series: SWFL_METRO_SERIES,
      variant: "area",
      ...homeValues,
    },
    {
      rootId: "rents",
      eyebrow: "Southwest Florida",
      title: "Median Monthly Rent",
      subtitle: "Cape Coral · Fort Myers · Naples",
      valueFormat: "rent",
      series: SWFL_METRO_SERIES,
      ...rents,
    },
    {
      rootId: "air-travel",
      eyebrow: "Southwest Florida",
      title: "RSW Airport Passenger Volume",
      subtitle: "Monthly Arrivals + Departures — RSW, with 12-Month Trend",
      valueFormat: "count",
      series: REGION_AIR_TRAVEL_SERIES,
      ...passengers,
    },
    // home-value-momentum + tier-gap moved off recharts: the momentum panel is
    // now MomentumProfitLossPanel (sign-colored P/L small multiples) and the
    // tier index is TierProjectionChart (bklit LineChart + 6-month projection),
    // rendered below alongside this array.
    {
      rootId: "tier-momentum",
      eyebrow: "Southwest Florida",
      title: "Luxury vs. Starter: Yearly Price Change",
      subtitle:
        "Year-over-year change in each tier's typical price — the two ride the same cycle but trade the lead: starter runs hotter in recoveries, luxury holds firmer in downturns. Both are falling now, luxury a little less.",
      valueFormat: "pct",
      series: TIER_YOY_SERIES,
      ...tierYoY,
    },
  ];

  return (
    <div className="min-h-dvh bg-navy-dark font-sans text-white">
      <PageShell>
        <header className="border-b border-white/10 pb-6 mb-8">
          <div className="flex items-center gap-2 text-gray-400">
            <Image
              src="/logo.png"
              alt="SWFL Data Gulf"
              width={28}
              height={28}
              className="h-7 w-7 rounded-lg"
            />
            <p className="text-xs uppercase tracking-wider">SWFL Data Gulf</p>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Southwest Florida — Market Trends
          </h1>
          <p className="mt-1 text-sm text-gray-500 font-mono">
            Home values, rents, air travel, and momentum across Lee and Collier County.
          </p>
        </header>

        <div className="flex flex-col gap-6">
          {marketTemp.gauge && <MarketTemperatureGauge gauge={marketTemp.gauge} />}

          <div>
            <div className="flex justify-end mb-2">
              <AddChartToProject rootId="hurricane-rings" title="Hurricane Impact by Category" />
            </div>
            <HurricaneRingChart />
          </div>

          {panels.map((panel) => (
            <div key={panel.rootId}>
              <div className="flex justify-end mb-2">
                <AddChartToProject rootId={panel.rootId} title={panel.title} />
              </div>
              <MetroAreaChart
                data={panel.data}
                series={panel.series}
                variant={panel.variant}
                asOf={panel.asOf}
                eyebrow={panel.eyebrow}
                title={panel.title}
                subtitle={panel.subtitle}
                valueFormat={panel.valueFormat}
                rootId={`${panel.rootId}-chart`}
                emptyTitle={panel.error ? "Data unavailable" : "No data yet"}
                emptyHint={
                  panel.error
                    ? panel.error
                    : `No ${panel.title.toLowerCase()} to graph yet — check back after the next refresh.`
                }
              />
            </div>
          ))}

          <MomentumProfitLossPanel
            data={homeValueMomentum.data}
            asOf={homeValueMomentum.asOf}
            error={homeValueMomentum.error}
          />

          {zipHeat.grid && <ZipMomentumHeatmap grid={zipHeat.grid} />}

          <TierProjectionChart
            data={tierIndexed.data}
            asOf={tierIndexed.asOf}
            error={tierIndexed.error}
          />
        </div>

        <footer className="mt-12 border-t border-white/10 pt-6 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="" width={16} height={16} className="h-4 w-4 rounded" />
            <span>SWFL Data Gulf</span>
          </div>
        </footer>
      </PageShell>
    </div>
  );
}
