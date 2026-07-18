// lib/email/market-context.ts
//
// The data feed the Email Lab builder pulls from. Given a scope ({zip} or
// {county}), reads the live lake market views via the service-role PostgREST
// client (same pattern as lib/zip-summary/load.ts) and returns cited figures —
// real value + source + as-of for every number. This is what makes the AI
// "create this" box able to create: it pulls the information itself instead of
// being spoon-fed.
//
// Empty-tolerant by contract (four-lane / ODD): no creds, no rows, any query
// error → fewer/zero figures, NEVER a thrown error and NEVER an invented number.
// data_lake views carry `service_role` SELECT (verified 2026-06-25).

// KNOWN-DEBT(data_lake: market views (zhvi/zori/active listings/acs/redfin) live in the data_lake schema)
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import { getSourcedFigures, type SourcedFigure } from "@/lib/figures/sourced";

export interface MarketFigure {
  key: string;
  label: string;
  value: string;
  source: string;
  as_of?: string;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`;
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
/** "Lee County" → "Lee"; maps to the redfin_<county>_market table when one exists. */
const REDFIN_TABLE: Record<string, string> = {
  lee: "redfin_lee_market",
  collier: "redfin_collier_market",
};

type Db = ReturnType<typeof createServiceRoleClientUntyped>;

async function zipFigures(db: Db, zip: string, figs: MarketFigure[]): Promise<string | null> {
  let county: string | null = null;

  try {
    const { data } = await db
      .schema("data_lake")
      .from("zhvi_zip_latest")
      .select("home_value_latest, value_yoy_pct, latest_period, city, county_name")
      .eq("zip_code", zip)
      .maybeSingle();
    if (data) {
      county = (data.county_name ?? "").replace(/\s*County$/i, "").trim() || null;
      const hv = num(data.home_value_latest);
      const yoy = num(data.value_yoy_pct);
      const asOf = mdY(data.latest_period);
      if (hv != null && hv > 0)
        figs.push({
          key: "home_value",
          label: `Median home value — ${data.city ?? zip} (${zip})`,
          value: usd(hv),
          source: "Zillow ZHVI",
          as_of: asOf,
        });
      if (yoy != null)
        figs.push({
          key: "home_value_yoy",
          label: "Home value, year over year",
          value: pct(yoy),
          source: "Zillow ZHVI",
          as_of: asOf,
        });
    }
  } catch {
    /* degrade */
  }

  try {
    const { data } = await db
      .schema("data_lake")
      .from("zori_zip_latest")
      .select("rent_index_latest, rent_yoy_pct, latest_period")
      .eq("zip_code", zip)
      .maybeSingle();
    if (data) {
      const r = num(data.rent_index_latest);
      const yoy = num(data.rent_yoy_pct);
      const asOf = mdY(data.latest_period);
      if (r != null && r > 0)
        figs.push({
          key: "rent",
          label: "Typical asking rent",
          value: `${usd(r)}/mo`,
          source: "Zillow ZORI",
          as_of: asOf,
        });
      if (yoy != null)
        figs.push({
          key: "rent_yoy",
          label: "Rent, year over year",
          value: pct(yoy),
          source: "Zillow ZORI",
          as_of: asOf,
        });
    }
  } catch {
    /* degrade */
  }

  try {
    const { data } = await db
      .schema("data_lake")
      .from("listing_active_stats")
      .select("listing_count, median_list_price, avg_days_on_market, latest_scraped_at, county")
      .eq("zip_code", zip)
      .maybeSingle();
    if (data) {
      county = county ?? ((data.county ?? "").replace(/\s*County$/i, "").trim() || null);
      const cnt = num(data.listing_count);
      const ml = num(data.median_list_price);
      const dom = num(data.avg_days_on_market);
      const asOf = mdY(data.latest_scraped_at);
      if (cnt != null)
        figs.push({
          key: "active",
          label: `Active listings in ${zip}`,
          value: String(cnt),
          source: "SWFL Data Gulf",
          as_of: asOf,
        });
      if (ml != null && ml > 0)
        figs.push({
          key: "median_list",
          label: "Median list price",
          value: usd(ml),
          source: "SWFL Data Gulf",
          as_of: asOf,
        });
      if (dom != null)
        figs.push({
          key: "dom",
          label: "Average days on market",
          value: String(dom),
          source: "SWFL Data Gulf",
          as_of: asOf,
        });
    }
  } catch {
    /* degrade */
  }

  // ZIP-grain SOLD median — the "third point" (value → sold → list) that no email
  // carried before. Realtor.com per-ZIP median sold from data_lake.market_details_swfl_latest
  // (the same latest snapshot the market-temperature source reads). A recorded-sale
  // reference between the modelled value (ZHVI) and the active asking median, so the
  // list-vs-value gap has a measured middle. Empty-tolerant like every block here.
  try {
    const { data } = await db
      .schema("data_lake")
      .from("market_details_swfl_latest")
      .select("median_sold_price, captured_date")
      .eq("zip_code", zip)
      .maybeSingle();
    if (data) {
      const sold = num(data.median_sold_price);
      const asOf = mdY(data.captured_date);
      if (sold != null && sold > 0)
        figs.push({
          key: "sold_median",
          label: "Median sold price",
          value: usd(sold),
          source: "Realtor.com",
          as_of: asOf,
        });
    }
  } catch {
    /* degrade */
  }

  try {
    const { data } = await db
      .schema("data_lake")
      .from("census_acs_zcta")
      .select("total_population, median_household_income, owner_occupied_pct, acs_year")
      .eq("geo_id", zip)
      .maybeSingle();
    if (data) {
      const asOf = data.acs_year ? `12/31/${data.acs_year}` : undefined;
      const pop = num(data.total_population);
      const inc = num(data.median_household_income);
      const own = num(data.owner_occupied_pct);
      if (pop != null)
        figs.push({
          key: "population",
          label: `Population (${zip})`,
          value: pop.toLocaleString("en-US"),
          source: "U.S. Census ACS",
          as_of: asOf,
        });
      if (inc != null && inc > 0)
        figs.push({
          key: "income",
          label: "Median household income",
          value: usd(inc),
          source: "U.S. Census ACS",
          as_of: asOf,
        });
      if (own != null)
        figs.push({
          key: "owner_occupied",
          label: "Owner-occupied homes",
          value: `${own}%`,
          source: "U.S. Census ACS",
          as_of: asOf,
        });
    }
  } catch {
    /* degrade */
  }

  return county;
}

async function countyFigures(db: Db, county: string, figs: MarketFigure[]): Promise<void> {
  const tbl = REDFIN_TABLE[county.toLowerCase()];
  if (!tbl) return; // only Lee/Collier have a redfin market table — degrade quietly
  try {
    const { data } = await db
      .schema("data_lake")
      .from(tbl)
      .select(
        "median_sale_price, median_sale_price_yoy, homes_sold, months_of_supply, median_dom, period_end",
      )
      .eq("property_type", "All Residential")
      .order("period_end", { ascending: false })
      .limit(1);
    const row = data?.[0];
    if (row) {
      const asOf = mdY(row.period_end);
      const ms = num(row.median_sale_price);
      const yoy = num(row.median_sale_price_yoy);
      const sold = num(row.homes_sold);
      const sup = num(row.months_of_supply);
      const dom = num(row.median_dom);
      if (ms != null && ms > 0)
        figs.push({
          key: "county_sale",
          label: `${county} County median sale price`,
          value: usd(ms),
          source: "Redfin",
          as_of: asOf,
        });
      if (yoy != null)
        figs.push({
          key: "county_sale_yoy",
          label: `${county} County sale price, year over year`,
          value: pct(yoy * (Math.abs(yoy) < 1 ? 100 : 1)),
          source: "Redfin",
          as_of: asOf,
        });
      if (sold != null)
        figs.push({
          key: "county_sold",
          label: `${county} County homes sold (month)`,
          value: sold.toLocaleString("en-US"),
          source: "Redfin",
          as_of: asOf,
        });
      if (sup != null)
        figs.push({
          key: "county_supply",
          label: `${county} County months of supply`,
          value: `${sup} mo`,
          source: "Redfin",
          as_of: asOf,
        });
      if (dom != null)
        figs.push({
          key: "county_dom",
          label: `${county} County median days on market`,
          value: String(dom),
          source: "Redfin",
          as_of: asOf,
        });
    }
  } catch {
    /* degrade */
  }
}

export interface SourceDiscrepancy {
  key: string;
  sources: string[];
}

/** One source tag per metric per artifact (invention-surface-guards §D).
 *  The first source wins; a second source for the same key is dropped from the
 *  customer artifact and returned as a discrepancy for the operator log. */
export function singleSourcePerMetric(figs: MarketFigure[]): {
  figures: MarketFigure[];
  discrepancies: SourceDiscrepancy[];
} {
  const firstSource = new Map<string, string>();
  const figures: MarketFigure[] = [];
  const disc = new Map<string, Set<string>>();
  for (const f of figs) {
    const prior = firstSource.get(f.key);
    if (prior === undefined) {
      firstSource.set(f.key, f.source);
      figures.push(f);
    } else if (prior === f.source) {
      figures.push(f);
    } else {
      if (!disc.has(f.key)) disc.set(f.key, new Set([prior]));
      disc.get(f.key)!.add(f.source);
    }
  }
  return {
    figures,
    discrepancies: [...disc.entries()].map(([key, s]) => ({ key, sources: [...s] })),
  };
}

/** Fold cached lane-3 figures (sourced_figures) into the builder feed. Held lake
 *  figures win on key collision — a found figure only fills a key the lake doesn't
 *  cover. Pure; exported for tests. */
export function mergeSourcedFigures(
  held: MarketFigure[],
  sourced: SourcedFigure[],
): MarketFigure[] {
  const heldKeys = new Set(held.map((f) => f.key));
  const extra = sourced
    .filter((s) => !heldKeys.has(s.key))
    .map((s) => ({ key: s.key, label: s.label, value: s.value, source: s.source, as_of: s.as_of }));
  return [...held, ...extra];
}

/**
 * Pull cited market figures for a scope. zip scope → per-ZIP value/rent/listings/
 * demographics + that ZIP's county sale figures; county scope → county sale figures.
 * Always returns an array (possibly empty); never throws.
 */
export async function loadMarketFigures(scope?: {
  kind?: string;
  value?: string;
}): Promise<MarketFigure[]> {
  if (!scope?.value) return [];
  let db: Db;
  try {
    db = createServiceRoleClientUntyped();
  } catch {
    return []; // no lake creds in this env — degrade, never throw
  }
  const figs: MarketFigure[] = [];
  try {
    if (scope.kind === "zip") {
      const county = await zipFigures(db, scope.value, figs);
      if (county) await countyFigures(db, county, figs);
    } else if (scope.kind === "county") {
      await countyFigures(db, scope.value.replace(/\s*County$/i, "").trim(), figs);
    }
  } catch {
    /* degrade — return whatever we gathered */
  }
  // Shared lane-3 cache: figures found via the Find-it button ride into every
  // builder (email lab + social) — found numbers are platform-wide, never page-local.
  let merged = figs;
  if (scope.kind === "zip" || scope.kind === "county") {
    try {
      const sourced = await getSourcedFigures({ kind: scope.kind, key: scope.value });
      merged = mergeSourcedFigures(figs, sourced);
    } catch {
      /* degrade — held figures only */
    }
  }
  const { figures, discrepancies } = singleSourcePerMetric(merged);
  if (discrepancies.length > 0) {
    // Operator-facing record; never reaches the customer artifact.
    console.warn("[market-context] one-source-per-metric tripwire:", JSON.stringify(discrepancies));
  }
  return figures;
}

interface LifecycleStatsRow {
  price_cuts_30d: number | null;
  price_raises_30d: number | null;
  new_holdings_30d: number | null;
  sales_30d: number | null;
  new_listings_30d: number | null;
  price_cuts_90d: number | null;
  price_raises_90d: number | null;
  new_holdings_90d: number | null;
  sales_90d: number | null;
  new_listings_90d: number | null;
  latest_at: string | null;
  sales_price_pending_30d: number | null;
  sales_price_pending_90d: number | null;
}

/** Exported for tests only. */
export function digestValue(
  cuts: number,
  raises: number,
  holdings: number,
  sales: number,
  listings: number,
  salesPricePending = 0,
): string | null {
  const parts: string[] = [];
  if (cuts) parts.push(`${cuts} price cut${cuts === 1 ? "" : "s"}`);
  if (raises) parts.push(`${raises} price raise${raises === 1 ? "" : "s"}`);
  if (holdings) parts.push(`${holdings} pulled to holding`);
  if (sales) {
    // A sale with no positive price in the county record yet is still a CONFIRMED sale — count
    // it, and say the price is pending rather than silently folding it in as if recorded.
    const pending = Math.min(salesPricePending, sales);
    const recorded = sales - pending;
    const noun = `${sales} sale${sales === 1 ? "" : "s"}`;
    if (pending === 0) parts.push(noun);
    else if (recorded > 0)
      parts.push(`${noun} (${recorded} recorded, ${pending} awaiting county record)`);
    else parts.push(`${noun} (closing price${pending === 1 ? "" : "s"} awaiting county record)`);
  }
  if (listings) parts.push(`${listings} new listing${listings === 1 ? "" : "s"}`);
  return parts.length ? parts.join(", ") : null;
}

/** Real-estate lifecycle activity (price cuts / holdings / sales / new listings), adaptive-window:
 *  prefers the last 30 days, falls back to 90 if a slower-moving scope shows no 30-day signal, and
 *  returns null (no figure) if BOTH windows are empty — never forces an empty-looking line. */
export async function loadLifecycleDigest(scope?: {
  kind?: string;
  value?: string;
}): Promise<MarketFigure | null> {
  if (!scope?.value) return null;
  let db: Db;
  try {
    db = createServiceRoleClientUntyped();
  } catch {
    return null;
  }
  try {
    let q = db
      .schema("data_lake")
      .from("listing_transitions_recent_zip_stats")
      .select(
        "price_cuts_30d, price_raises_30d, new_holdings_30d, sales_30d, new_listings_30d, " +
          "price_cuts_90d, price_raises_90d, new_holdings_90d, sales_90d, new_listings_90d, latest_at, " +
          "sales_price_pending_30d, sales_price_pending_90d",
      );
    q =
      scope.kind === "zip"
        ? q.eq("zip_code", scope.value)
        : q.eq("county", scope.value.replace(/\s*County$/i, "").trim()).is("zip_code", null);
    const { data } = await q.maybeSingle();
    const row = data as LifecycleStatsRow | null;
    if (!row) return null;

    const v30 = digestValue(
      row.price_cuts_30d ?? 0,
      row.price_raises_30d ?? 0,
      row.new_holdings_30d ?? 0,
      row.sales_30d ?? 0,
      row.new_listings_30d ?? 0,
      row.sales_price_pending_30d ?? 0,
    );
    const v90 = digestValue(
      row.price_cuts_90d ?? 0,
      row.price_raises_90d ?? 0,
      row.new_holdings_90d ?? 0,
      row.sales_90d ?? 0,
      row.new_listings_90d ?? 0,
      row.sales_price_pending_90d ?? 0,
    );
    const value = v30 ?? v90;
    if (!value) return null;
    const windowDays = v30 ? 30 : 90;
    const asOf = mdY(row.latest_at) ?? mdY(new Date().toISOString());

    return {
      key: "lifecycle_digest",
      label: `Lifecycle activity — ${scope.value} (last ${windowDays} days)`,
      value,
      source: "SWFL Data Gulf",
      as_of: asOf,
    };
  } catch {
    return null;
  }
}

/** Render figures as the labeled "REAL LAKE DATA" block the fill AI reads. */
export function figuresToPromptBlock(figs: MarketFigure[]): string {
  if (!figs.length) return "";
  return figs
    .map(
      (f) => `- ${f.label}: ${f.value}${f.as_of ? ` (${f.source}, ${f.as_of})` : ` (${f.source})`}`,
    )
    .join("\n");
}
