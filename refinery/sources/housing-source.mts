import { makeDuckDBSource } from "./duckdb-source.mts";
import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { fragmentId } from "../lib/ids.mts";
import { expiresDate } from "../lib/dates.mts";

// ── Row shape ─────────────────────────────────────────────────────────────────
// Since the redfin_data_center retarget (07/16/2026, spec:
// docs/superpowers/specs/2026-07-17-redfin-datacenter-retarget-design.md) the
// Tier-1 parquet stores the vendor's values AS-WRITTEN with snake_case names
// carrying the unit suffix (_pct = percent, _ppts = percentage points). This
// file is the ONE place vendor units become contract units — mapHousingRow
// divides by 100 exactly once:
//   avg_sale_to_list_pct 96.12      → avg_sale_to_list 0.9612 (ratio ~1.0)
//   sold_above_list_pct / off_market_in_two_weeks_pct → fractions 0–1
//   *_yoy_pct / *_mom_pct           → decimal fractions (3.98 → 0.0398)
//   avg_sale_to_list_yoy_ppts       → the absolute delta of the ~1.0 ratio
//                                     (-0.4 ppts → -0.004)
//
// MEDIAN_DOM_YOY history — the units bug that keeps trying to ship: the LEGACY
// feed published it as an ABSOLUTE DAY DIFFERENCE and rendering it ×100 shipped
// "650.0% YoY" to users (empirically verified 06/03/2026). The NEW feed
// publishes a PERCENT; here it becomes a decimal fraction like every other YoY.
// It is NEVER days again — the pack renders it via formatDomYoyPct.
//
// Fields with NO successor column in the new feed stay in the contract as
// permanent nulls (never mapped from a lookalike):
//   median_list_price — "MEDIAN NEW LISTING PRICE" is a DIFFERENT concept
//   price_drops       — split into its own dataset (see cadence_registry
//                       redfin_price_drops; seller-stress-swfl consumes it)
//
// The parquet is pre-filtered by the pipeline (SWFL metros, REGION TYPE 'Zip',
// all-property-types rollup file) — no PROPERTY_TYPE/REGION_TYPE re-filter here.
// Windows are rolling 3 months (~90 days) labeled by PERIOD BEGIN.

export interface HousingZipRow {
  zip_code: string;
  period_begin: string; // ISO date string
  period_end: string;
  parent_metro_region: string;
  median_sale_price: number | null;
  median_list_price: number | null; // always null post-retarget (no successor)
  median_ppsf: number | null; // median SALE price per sq.ft.
  median_dom: number | null; // days
  avg_sale_to_list: number | null; // ratio around 1.0
  sold_above_list: number | null; // fraction 0–1
  price_drops: number | null; // always null post-retarget (own dataset)
  off_market_in_two_weeks: number | null; // fraction 0–1
  homes_sold: number | null;
  inventory: number | null;
  months_of_supply: number | null;
  pending_sales: number | null;
  median_sale_price_yoy: number | null; // decimal fraction
  median_sale_price_mom: number | null; // decimal fraction
  median_dom_yoy: number | null; // decimal fraction (NEVER days — see above)
  inventory_yoy: number | null; // decimal fraction
  avg_sale_to_list_yoy: number | null; // absolute ratio delta (ppts / 100)
}

const SOURCE_ID = "redfin_swfl";

// The retargeted pipeline TRY_CASTs Redfin's literal "NA" to SQL NULL, so
// numerics arrive as numbers — toNum stays as a belt-and-braces guard for any
// row that predates the retarget or arrives as text.
function toNum(v: unknown): number | null {
  if (v == null || v === "NA") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Vendor percent → contract fraction. The ÷100 lives here and ONLY here.
function pctToFraction(v: unknown): number | null {
  const n = toNum(v);
  return n === null ? null : n / 100;
}

export function mapHousingRow(raw: Record<string, unknown>): HousingZipRow {
  return {
    zip_code: String(raw.zip_code ?? ""),
    period_begin: String(raw.period_begin ?? ""),
    period_end: String(raw.period_end ?? ""),
    parent_metro_region: String(raw.metro ?? ""),
    median_sale_price: toNum(raw.median_sale_price),
    median_list_price: null, // no successor column in the new feed
    median_ppsf: toNum(raw.median_ppsf),
    median_dom: toNum(raw.median_dom),
    avg_sale_to_list: pctToFraction(raw.avg_sale_to_list_pct),
    sold_above_list: pctToFraction(raw.sold_above_list_pct),
    price_drops: null, // lives in its own dataset now (redfin_price_drops)
    off_market_in_two_weeks: pctToFraction(raw.off_market_in_two_weeks_pct),
    homes_sold: toNum(raw.homes_sold),
    inventory: toNum(raw.inventory),
    months_of_supply: toNum(raw.months_of_supply),
    pending_sales: toNum(raw.pending_sales),
    median_sale_price_yoy: pctToFraction(raw.median_sale_price_yoy_pct),
    median_sale_price_mom: pctToFraction(raw.median_sale_price_mom_pct),
    median_dom_yoy: pctToFraction(raw.median_dom_yoy_pct),
    inventory_yoy: pctToFraction(raw.inventory_yoy_pct),
    avg_sale_to_list_yoy: pctToFraction(raw.avg_sale_to_list_yoy_ppts),
  };
}

export const housingSource: SourceConnector = makeDuckDBSource<HousingZipRow>({
  source_id: SOURCE_ID,
  trust_tier: 3,
  parquetViews: [
    {
      name: "redfin_swfl",
      s3_url: "s3://lake-tier1/market/redfin_swfl.parquet",
    },
  ],
  query: `
    SELECT
      zip_code,
      period_begin,
      period_end,
      metro,
      median_sale_price,
      median_ppsf,
      median_dom,
      avg_sale_to_list_pct,
      sold_above_list_pct,
      off_market_in_two_weeks_pct,
      homes_sold,
      inventory,
      months_of_supply,
      pending_sales,
      median_sale_price_yoy_pct,
      median_sale_price_mom_pct,
      median_dom_yoy_pct,
      inventory_yoy_pct,
      avg_sale_to_list_yoy_ppts
    FROM redfin_swfl
    QUALIFY ROW_NUMBER() OVER (PARTITION BY zip_code ORDER BY period_begin DESC) = 1
    ORDER BY zip_code
  `,
  rowShape: mapHousingRow,
  normalize: (rows, { fetched_at }): RawFragment[] =>
    rows.map((r) => ({
      fragment_id: fragmentId(SOURCE_ID, r.zip_code),
      source_id: SOURCE_ID,
      source_trust_tier: 3,
      fetched_at,
      raw: r,
      normalized: r,
    })),
  citation: (verifiedDate, ttlSeconds): Omit<CitationRow, "id"> => ({
    source:
      "Redfin Data Center — ZIP-level monthly housing metrics for SWFL MSAs (all property types). Updated monthly ~mid-month. https://www.redfin.com/news/data-center/",
    verified: verifiedDate,
    expires: expiresDate(verifiedDate, ttlSeconds),
  }),
  fixturePath: "refinery/__fixtures__/housing-swfl.sample.json",
});
