// lib/landing/load-home-map-data.ts
//
// Live-lake loader for the homepage hero map + stats bar (Lane B Phase 1 —
// kills the mock). Reads data_lake views via the service-role PostgREST client
// (same pattern as lib/zip-summary/load.ts / lib/email/market-context.ts) and
// returns the HomeMapData shape the Hero renders.
//
// Pill set (operator ruling 07/03/2026): Home Value (default, orange brand
// ramp) · Market Activity · Days on Market. Flood/permits lost their pills —
// hollow first-click cells. Market Activity ← data_lake.listing_active_stats
// (active inventory, full Lee+Collier); Days on Market ← market_details_swfl_latest
// (realtor.com median DOM, full Lee+Collier). The old
// active_listings_residential_zip_stats scraper table is ABANDONED here — its
// Collier coverage collapsed to 3 ZIPs (WAF-blocked datacenter IP), which
// rendered the southern half of the map dead gray (operator report 07/03/2026).
//
// Empty-tolerant by contract (four-lane / ODD): no creds, no rows, any query
// error → per-metric fallback, NEVER a thrown error and NEVER an invented
// number. Home Value falls back to the mock fixture WITH `sample: true` (badge
// renders "Sample data"); the listing metrics have no fixture — on failure
// their pills simply don't render.
//
// KNOWN-DEBT(data_lake: market views live in the data_lake schema (typed public only))
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import type { HomeMapData, HomeMapPayload, HomeStatCell, MetricDef } from "./home-map-types";
import { HOME_MAP_DATA } from "./home-map-data";

export type { HomeMapPayload, HomeStatCell } from "./home-map-types";

/** The ZIP set the contractor SVG can draw — rows outside it are dropped. */
const MAP_ZIPS = new Set(Object.keys(HOME_MAP_DATA.placeNames));

const usdShort = (n: number): string => {
  if (n >= 1_000_000_000) return "$" + (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1000) return "$" + Math.round(n / 1000) + "K";
  return "$" + Math.round(n).toLocaleString("en-US");
};

const mdY = (iso: string | null | undefined): string | undefined => {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

interface ZhviRow {
  zip_code: string;
  home_value_latest: number | string | null;
  latest_period: string | null;
  city: string | null;
}
interface ActivityRow {
  zip_code: string;
  county: string | null;
  listing_count: number | string | null;
  median_list_price: number | string | null;
  latest_scraped_at: string | null;
}
interface DomRow {
  zip_code: string;
  county: string | null;
  median_days_on_market: number | string | null;
  captured_date: string | null;
}

function metricFromRows(
  rows: Array<{ zip: string; val: number }>,
  base: Omit<MetricDef, "data" | "low" | "high">,
): MetricDef | null {
  if (rows.length === 0) return null;
  const data: Record<string, number> = {};
  let low = Infinity;
  let high = -Infinity;
  for (const { zip, val } of rows) {
    data[zip] = val;
    if (val < low) low = val;
    if (val > high) high = val;
  }
  return { ...base, data, low, high };
}

export async function loadHomeMapData(): Promise<HomeMapPayload> {
  let db: ReturnType<typeof createServiceRoleClientUntyped> | null = null;
  try {
    db = createServiceRoleClientUntyped();
  } catch {
    db = null; // no lake creds in this env — fixture fallback below
  }

  const placeNames: Record<string, string> = { ...HOME_MAP_DATA.placeNames };
  let value: MetricDef | null = null;
  let activity: MetricDef | null = null;
  let dom: MetricDef | null = null;

  let zhviRows: ZhviRow[] = [];
  let activityRows: ActivityRow[] = [];

  // ── Home Value — data_lake.zhvi_zip_latest (Zillow ZHVI) ──
  if (db) {
    try {
      const { data, error } = await db
        .schema("data_lake")
        .from("zhvi_zip_latest")
        .select("zip_code, home_value_latest, latest_period, city");
      if (!error && data) {
        zhviRows = (data as ZhviRow[]).filter((r) => MAP_ZIPS.has(r.zip_code));
        const rows = zhviRows
          .map((r) => ({ zip: r.zip_code, val: num(r.home_value_latest) }))
          .filter((r): r is { zip: string; val: number } => r.val != null);
        const latest = zhviRows
          .map((r) => r.latest_period)
          .sort()
          .at(-1);
        value = metricFromRows(rows, {
          label: "Home Value",
          sublabel: "Median home value (Zillow ZHVI)",
          format: "currency",
          // The orange brand ramp (operator ruling 07/03/2026): dark slate
          // base, gold→coral coast — Home Value is the first map and wears it.
          c0: "#33525e",
          c1: "#d4b370",
          c2: "#e08158",
          asOf: mdY(latest),
        });
        for (const r of zhviRows)
          if (r.city && !placeNames[r.zip_code]) placeNames[r.zip_code] = r.city;
      }
    } catch {
      /* fall through to fixture */
    }
  }

  // ── Market Activity — data_lake.listing_active_stats (active inventory; full
  //    Lee+Collier). Row grain is per-ZIP; a null-zip county-rollup row also
  //    lives here (Collier total ~7,673) — the MAP_ZIPS gate drops it. ──
  if (db) {
    try {
      const { data, error } = await db
        .schema("data_lake")
        .from("listing_active_stats")
        .select("zip_code, county, listing_count, median_list_price, latest_scraped_at");
      if (!error && data) {
        activityRows = (data as ActivityRow[]).filter(
          (r) => r.zip_code != null && MAP_ZIPS.has(r.zip_code),
        );
        const latest = activityRows
          .map((r) => r.latest_scraped_at)
          .sort()
          .at(-1);
        activity = metricFromRows(
          activityRows
            .map((r) => ({ zip: r.zip_code, val: num(r.listing_count) }))
            .filter((r): r is { zip: string; val: number } => r.val != null),
          {
            label: "Market Activity",
            sublabel: "Active residential listings (SWFL Data Gulf)",
            format: "number",
            c0: "#314a6b",
            c1: "#4a6fa8",
            c2: "#a0c4ff",
            asOf: mdY(latest),
          },
        );
      }
    } catch {
      /* no fixture for the activity metric — its pill hides */
    }
  }

  // ── Days on Market — data_lake.market_details_swfl_latest (realtor.com median
  //    DOM; full Lee+Collier). Separate source from activity: listing_active_stats
  //    carries no DOM for Collier (null), so DOM rides realtor.com's ZIP grain. ──
  if (db) {
    try {
      const { data, error } = await db
        .schema("data_lake")
        .from("market_details_swfl_latest")
        .select("zip_code, county, median_days_on_market, captured_date");
      if (!error && data) {
        const domRows = (data as DomRow[]).filter(
          (r) => r.zip_code != null && MAP_ZIPS.has(r.zip_code),
        );
        const latest = domRows
          .map((r) => r.captured_date)
          .sort()
          .at(-1);
        dom = metricFromRows(
          domRows
            .map((r) => ({ zip: r.zip_code, val: num(r.median_days_on_market) }))
            .filter((r): r is { zip: string; val: number } => r.val != null),
          {
            label: "Days on Market",
            sublabel: "Median days on market, residential listings (realtor.com)",
            format: "number",
            c0: "#1f4f4a",
            c1: "#3DC9C0",
            c2: "#b9ede8",
            asOf: mdY(latest),
          },
        );
      }
    } catch {
      /* no fixture for the DOM metric — its pill hides */
    }
  }

  // ── Fixture fallback (sample:true rides it) ──
  if (!value) value = HOME_MAP_DATA.metrics.value;

  const anySample = Boolean(value.sample);

  const data: HomeMapData = {
    placeNames,
    metrics: {
      value,
      ...(activity ? { activity } : {}),
      ...(dom ? { dom } : {}),
    },
  };

  // Badge: the freshest live as-of date on the page (listings scrape > ZHVI period).
  const freshest =
    (activity && !activity.sample && activity.asOf) || (!value.sample && value.asOf) || undefined;
  const badge = anySample
    ? "Sample data · Lee & Collier Counties"
    : `Live data · Lee & Collier Counties${freshest ? ` · as of ${freshest}` : ""}`;

  // ── Stats bar — verbatim row values + counts only (no derived rates) ──
  const stats: HomeStatCell[] = [];

  if (activityRows.length > 0 && activity && !activity.sample) {
    const total = activityRows.reduce((s, r) => s + (num(r.listing_count) ?? 0), 0);
    stats.push({
      label: "Active Listings",
      value: total.toLocaleString("en-US"),
      sub: "Lee & Collier Counties",
      tag: `SWFL Data Gulf${activity.asOf ? ` · ${activity.asOf}` : ""}`,
    });
    const busiest = [...activityRows].sort(
      (a, b) => (num(b.listing_count) ?? 0) - (num(a.listing_count) ?? 0),
    )[0];
    if (busiest) {
      stats.push({
        label: "Most Active ZIP",
        value: busiest.zip_code,
        sub: `${placeNames[busiest.zip_code] ?? busiest.county ?? ""} · ${(num(busiest.listing_count) ?? 0).toLocaleString("en-US")} listings`,
        tag: "SWFL Data Gulf",
      });
    }
  }

  if (zhviRows.length > 0 && value && !value.sample) {
    const ranked = zhviRows
      .map((r) => ({ zip: r.zip_code, val: num(r.home_value_latest) }))
      .filter((r): r is { zip: string; val: number } => r.val != null)
      .sort((a, b) => b.val - a.val);
    const top = ranked[0];
    const bottom = ranked[ranked.length - 1];
    if (top) {
      stats.push({
        label: "Highest Home Value",
        value: usdShort(top.val),
        sub: `${placeNames[top.zip] ?? top.zip} (${top.zip})`,
        tag: `Zillow ZHVI${value.asOf ? ` · ${value.asOf}` : ""}`,
      });
    }
    if (top && bottom && ranked.length > 1) {
      stats.push({
        label: "Market Range",
        value: `${ranked.length} ZIPs`,
        sub: `${usdShort(bottom.val)} ${placeNames[bottom.zip] ?? bottom.zip} → ${usdShort(top.val)} ${placeNames[top.zip] ?? top.zip}`,
        tag: "Zillow ZHVI",
      });
    }
  }

  return { data, badge, anySample, stats };
}
