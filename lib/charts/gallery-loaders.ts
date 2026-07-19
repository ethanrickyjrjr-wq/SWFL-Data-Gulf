// KNOWN-DEBT(data_lake: gallery aggregates live in the data_lake schema (typed public only))
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import { mapPivotedCityRows, mapPivotedCityYoY } from "@/lib/charts/pivoted-series";
import { mapAirportTotalWithSmoothed, type AirportMonthRow } from "@/lib/charts/airport-series";
import {
  mapTierIndexed,
  mapTierYoY,
  type TierPivotedRow,
} from "@/lib/charts/tier-divergence-series";
import {
  SWFL_METRO_SERIES,
  REDFIN_METRO_SOLD_SERIES,
  REGION_AIR_TRAVEL_SERIES,
  TIER_INDEXED_SERIES,
} from "@/lib/charts/series";
import type { ChartRow, ChartSeriesDef, PivotedCityMonth } from "@/types/viz";
import type { ValueFormat } from "@/lib/charts/format";

type Supabase = ReturnType<typeof createServiceRoleClientUntyped>;

export interface LoadedPanel {
  data: ChartRow[];
  asOf?: string;
  error: string | null;
}

export interface GalleryPanel {
  rootId: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  valueFormat: ValueFormat;
  series: ChartSeriesDef[];
  variant?: "line" | "area";
  data: ChartRow[];
  asOf?: string;
  error: string | null;
}

// Exported so page.tsx can use the same tier-yoy series definition.
export const TIER_YOY_SERIES: ChartSeriesDef[] = [
  { key: "luxury_yoy", label: "Luxury homes", color: "#3DC9C0", dash: "" },
  { key: "starter_yoy", label: "Starter homes", color: "#5bc97a", dash: "8 5" },
];

export async function loadMetros(supabase: Supabase, view: string): Promise<LoadedPanel> {
  try {
    const { data, error } = await supabase
      .schema("data_lake")
      .from(view)
      .select("month, cape_coral, fort_myers, naples")
      .order("month", { ascending: true });
    if (error) return { data: [], asOf: undefined, error: error.message };
    const mapped = mapPivotedCityRows(data as PivotedCityMonth[] | null);
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

export async function loadHomeValueMomentum(supabase: Supabase): Promise<LoadedPanel> {
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

export async function loadTierIndexed(supabase: Supabase): Promise<LoadedPanel> {
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

export async function loadTierYoY(supabase: Supabase): Promise<LoadedPanel> {
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

export async function loadPassengers(supabase: Supabase): Promise<LoadedPanel> {
  try {
    const { data, error } = await supabase
      .from("rsw_airport_monthly")
      .select("report_month, value")
      .eq("airport_code", "RSW")
      .eq("metric", "total_passengers")
      .order("report_month", { ascending: true });
    if (error) return { data: [], asOf: undefined, error: error.message };
    const mapped = mapAirportTotalWithSmoothed(data as AirportMonthRow[] | null);
    return { data: mapped.entries, asOf: mapped.asOf, error: null };
  } catch (err) {
    return { data: [], asOf: undefined, error: err instanceof Error ? err.message : String(err) };
  }
}

// --- /desk panels ----------------------------------------------------------

/** Series for the desk Daily Market Pulse panel (listing_pulse_daily view). */
export const DESK_PULSE_SERIES: ChartSeriesDef[] = [
  { key: "new_listings", label: "New listings", color: "#5bc97a", dash: "" }, // mangrove
  { key: "price_cuts", label: "Price cuts", color: "#d4b370", dash: "8 5" }, // neutral-gold
  { key: "departures", label: "Departures (reason not asserted)", color: "#807e76", dash: "2 5" },
  { key: "sold", label: "Sold", color: "#3DC9C0", dash: "4 3" }, // gulf-teal
];

/** Daily transition counts — the desk pulse zone's savable chart. */
export async function loadDeskPulsePanel(supabase: Supabase): Promise<LoadedPanel> {
  try {
    const { data, error } = await supabase
      .schema("data_lake")
      .from("listing_pulse_daily")
      .select("day, new_listings, price_cuts, departures, sold")
      .order("day", { ascending: true });
    if (error) return { data: [], asOf: undefined, error: error.message };
    const rows: ChartRow[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      month: String(r.day),
      new_listings: r.new_listings as number,
      price_cuts: r.price_cuts as number,
      departures: r.departures as number,
      sold: r.sold as number,
    }));
    return { data: rows, asOf: rows.at(-1)?.month as string | undefined, error: null };
  } catch (err) {
    return { data: [], asOf: undefined, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Desk price trend — three lanes, most-alive first (dual-signal, 07/12/2026):
 *   1. daily median ASKING price per city — daily_truth `median_asking_price`,
 *      computed deterministically from our own cleaned active inventory
 *      (the retired `median_sale_price` web-search never carried a value);
 *   2. monthly closed-sale median per city — data_lake.redfin_city_swfl
 *      (true sold, city grain, redfin.com provenance);
 *   3. monthly ZHVI (smoothed index) — the deepest fallback.
 * Self-healing: saved copies of this panel upgrade lanes as feeds fill.
 */
export async function loadDeskPriceTrend(supabase: Supabase): Promise<LoadedPanel> {
  try {
    const { data, error } = await supabase
      .schema("data_lake")
      .from("daily_truth")
      .select("metric_key, area, period, value")
      .eq("metric_key", "median_asking_price")
      .not("value", "is", null)
      .order("period", { ascending: true });
    if (!error && data && data.length > 0) {
      const byDay = new Map<string, ChartRow>();
      for (const r of data as { area: string; period: string; value: number }[]) {
        const row = byDay.get(r.period) ?? { month: r.period };
        row[r.area] = r.value;
        byDay.set(r.period, row);
      }
      const rows = [...byDay.values()];
      // >= 2 DISTINCT days — a single-day "line" reads as a broken chart.
      if (rows.length >= 2) {
        return { data: rows, asOf: rows.at(-1)?.month as string | undefined, error: null };
      }
    }
  } catch {
    // fall through to the sold lane
  }
  try {
    const { data, error } = await supabase
      .schema("data_lake")
      .from("redfin_city_swfl")
      .select("area, period_end, median_sale_price")
      .eq("property_type", "All Residential")
      .in("area", ["cape_coral", "fort_myers", "naples"])
      .not("median_sale_price", "is", null)
      .order("period_end", { ascending: true });
    if (!error && data && data.length > 0) {
      const byMonth = new Map<string, ChartRow>();
      for (const r of data as { area: string; period_end: string; median_sale_price: number }[]) {
        const row = byMonth.get(r.period_end) ?? { month: r.period_end };
        row[r.area] = r.median_sale_price;
        byMonth.set(r.period_end, row);
      }
      const rows = [...byMonth.values()].slice(-24);
      if (rows.length >= 2) {
        return { data: rows, asOf: rows.at(-1)?.month as string | undefined, error: null };
      }
    }
  } catch {
    // fall through to the ZHVI lane
  }
  return loadMetros(supabase, "zhvi_pivoted");
}

interface PanelConfig {
  rootId: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  valueFormat: ValueFormat;
  series: ChartSeriesDef[];
  variant?: "line" | "area";
  load: (supabase: Supabase) => Promise<LoadedPanel>;
}

// Panel metadata without data — used in the route to know which loader + series to use.
const PANEL_CONFIGS: PanelConfig[] = [
  {
    rootId: "home-values",
    eyebrow: "Southwest Florida",
    title: "Median Sale Price",
    subtitle: "Cape Coral · Fort Myers · Naples (city)",
    valueFormat: "usd",
    series: REDFIN_METRO_SOLD_SERIES,
    variant: "area",
    load: (db) => loadMetros(db, "redfin_metro_sold_pivoted"),
  },
  {
    rootId: "rents",
    eyebrow: "Southwest Florida",
    title: "Median Monthly Rent",
    subtitle: "Cape Coral · Fort Myers · Naples",
    valueFormat: "rent",
    series: SWFL_METRO_SERIES,
    load: (db) => loadMetros(db, "zori_pivoted"),
  },
  {
    rootId: "air-travel",
    eyebrow: "Southwest Florida",
    title: "RSW Airport Passenger Volume",
    subtitle: "Monthly Arrivals + Departures — RSW, with 12-Month Average",
    valueFormat: "count",
    series: REGION_AIR_TRAVEL_SERIES,
    load: (db) => loadPassengers(db),
  },
  {
    rootId: "home-value-momentum",
    eyebrow: "Southwest Florida",
    title: "Home Value Year-Over-Year Growth",
    subtitle: "Year-over-year change — Cape Coral · Fort Myers · Naples",
    valueFormat: "pct",
    series: SWFL_METRO_SERIES,
    load: (db) => loadHomeValueMomentum(db),
  },
  {
    rootId: "tier-gap",
    eyebrow: "Southwest Florida",
    title: "Luxury vs. Starter Home Price Index",
    subtitle:
      "Each set to 100 in Jan 2019 — regionally the two tiers have risen in near-lockstep (the K-shaped split shows up ZIP by ZIP, not in the median)",
    valueFormat: "index",
    series: TIER_INDEXED_SERIES,
    load: (db) => loadTierIndexed(db),
  },
  {
    rootId: "tier-momentum",
    eyebrow: "Southwest Florida",
    title: "Luxury vs. Starter: Yearly Price Change",
    subtitle:
      "Year-over-year change in each tier's typical price — the two ride the same cycle but trade the lead: starter runs hotter in recoveries, luxury holds firmer in downturns. Both are falling now, luxury a little less.",
    valueFormat: "pct",
    series: TIER_YOY_SERIES,
    load: (db) => loadTierYoY(db),
  },
  {
    rootId: "desk-price-trend",
    eyebrow: "Southwest Florida",
    title: "Median Home Price Trend",
    subtitle:
      "Cape Coral · Fort Myers · Naples — daily asking medians once the live window fills; monthly sold / typical-value history meanwhile",
    valueFormat: "usd",
    series: SWFL_METRO_SERIES,
    variant: "area",
    load: (db) => loadDeskPriceTrend(db),
  },
  {
    rootId: "desk-pulse",
    eyebrow: "Southwest Florida",
    title: "Daily Market Pulse",
    subtitle: "New listings · price cuts · departures · sold, per scan day",
    valueFormat: "count",
    series: DESK_PULSE_SERIES,
    load: (db) => loadDeskPulsePanel(db),
  },
];

export async function loadGalleryPanel(
  supabase: Supabase,
  rootId: string,
): Promise<GalleryPanel | null> {
  const config = PANEL_CONFIGS.find((p) => p.rootId === rootId);
  if (!config) return null;
  const { data, asOf, error } = await config.load(supabase);
  return {
    rootId: config.rootId,
    eyebrow: config.eyebrow,
    title: config.title,
    subtitle: config.subtitle,
    valueFormat: config.valueFormat,
    series: config.series,
    variant: config.variant,
    data,
    asOf,
    error,
  };
}
