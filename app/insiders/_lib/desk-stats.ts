// app/insiders/_lib/desk-stats.ts
//
// The FRESH layer of the /insiders wire (operator ruling 07/10/2026: never lead
// the centerpiece with the laggiest series we hold). Reads the same live views
// the homepage stats bar reads — verbatim row values + counts only, no derived
// rates: active-listing total + scrape date (data_lake.listing_active_stats,
// updated same-day), busiest ZIP, news-desk story count for the current month
// (data_lake.news_articles_swfl, daily), and the highest-value ZIP (zhvi_zip_latest).
// Zillow's monthly indices stay on the page as the trend layer with their own
// honest as-of; THIS loader is what proves the desk moved today.
//
// Empty-tolerant by contract: no creds / no rows / any error → nulls, the page
// drops those wire items, never a thrown error and never an invented number.

// KNOWN-DEBT(data_lake: live market views live in the data_lake schema (typed public only))
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import { HOME_MAP_DATA } from "@/lib/landing/home-map-data";

export interface DeskStats {
  /** Active residential listings, Lee + Collier (sum of per-ZIP counts). */
  listingsTotal: number | null;
  /** MM/DD/YYYY of the newest listing scrape — the "desk updated" date. */
  listingsAsOf: string | null;
  mostActive: { zip: string; place: string | null; count: number } | null;
  /** Stories the news desk filed since the 1st of the current month. */
  newsThisMonth: number | null;
  /** e.g. "July" — the month the news count covers. */
  newsMonthName: string;
  topValue: { zip: string; place: string | null; usd: string } | null;
}

const EMPTY = (monthName: string): DeskStats => ({
  listingsTotal: null,
  listingsAsOf: null,
  mostActive: null,
  newsThisMonth: null,
  newsMonthName: monthName,
  topValue: null,
});

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

const mdY = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;
};

const usdShort = (n: number): string => {
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1000) return "$" + Math.round(n / 1000) + "K";
  return "$" + Math.round(n).toLocaleString("en-US");
};

const placeName = (zip: string, city?: string | null): string | null =>
  HOME_MAP_DATA.placeNames[zip] ?? city ?? null;

export async function loadDeskStats(now: Date = new Date()): Promise<DeskStats> {
  const monthName = now.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;

  let db: ReturnType<typeof createServiceRoleClientUntyped>;
  try {
    db = createServiceRoleClientUntyped();
  } catch {
    return EMPTY(monthName); // no lake creds in this env — every fresh item hides
  }
  const stats = EMPTY(monthName);

  // ── Active listings: total + scrape date + busiest ZIP ───────────────────
  // The view carries a null-zip county-rollup row — the zip filter drops it so
  // the total never double-counts (same gate the homepage applies via MAP_ZIPS).
  try {
    const { data, error } = await db
      .schema("data_lake")
      .from("listing_active_stats")
      .select("zip_code, listing_count, latest_scraped_at")
      .not("zip_code", "is", null);
    if (!error && data && data.length > 0) {
      const rows = data as Array<{
        zip_code: string;
        listing_count: number | string | null;
        latest_scraped_at: string | null;
      }>;
      let total = 0;
      let latest: string | null = null;
      let top: { zip: string; count: number } | null = null;
      for (const r of rows) {
        const c = num(r.listing_count);
        if (c == null) continue;
        total += c;
        if (!top || c > top.count) top = { zip: r.zip_code, count: c };
        if (r.latest_scraped_at && (!latest || r.latest_scraped_at > latest))
          latest = r.latest_scraped_at;
      }
      if (total > 0) {
        stats.listingsTotal = total;
        stats.listingsAsOf = mdY(latest);
        if (top) stats.mostActive = { zip: top.zip, place: placeName(top.zip), count: top.count };
      }
    }
  } catch {
    /* item hides */
  }

  // ── News desk: stories filed since the 1st (count only) ─────────────────
  try {
    const { count, error } = await db
      .schema("data_lake")
      .from("news_articles_swfl")
      .select("*", { count: "exact", head: true })
      .gte("published_date", monthStart);
    if (!error && typeof count === "number") stats.newsThisMonth = count;
  } catch {
    /* item hides */
  }

  // ── Highest-value ZIP (verbatim top row) ─────────────────────────────────
  try {
    const { data, error } = await db
      .schema("data_lake")
      .from("zhvi_zip_latest")
      .select("zip_code, city, home_value_latest")
      .order("home_value_latest", { ascending: false, nullsFirst: false })
      .limit(1);
    if (!error && data && data.length > 0) {
      const r = data[0] as { zip_code: string; city: string | null; home_value_latest: unknown };
      const v = num(r.home_value_latest);
      if (v != null)
        stats.topValue = {
          zip: r.zip_code,
          place: placeName(r.zip_code, r.city),
          usd: usdShort(v),
        };
    }
  } catch {
    /* item hides */
  }

  return stats;
}
