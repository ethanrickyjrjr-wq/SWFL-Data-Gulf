import { makeDuckDBSource } from "./duckdb-source.mts";
import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { fragmentId } from "../lib/ids.mts";
import { expiresDate } from "../lib/dates.mts";

// ── Row shape ─────────────────────────────────────────────────────────────────
// Parquet columns are ALL_CAPS as written by DuckDB COPY, except REGION which
// the pipeline renames to zip_code (lowercase). The SQL query aliases all
// remaining columns to lowercase so rowShape can reference plain property names.
//
// YoY fields (MEDIAN_SALE_PRICE_YOY, MEDIAN_DOM_YOY, INVENTORY_YOY,
// AVG_SALE_TO_LIST_YOY) follow Redfin's convention: decimal fraction
// (0.043 = +4.3%, -0.12 = -12%). MEDIAN_DOM itself is in days.
//
// AVG_SALE_TO_LIST is a ratio (0.997 = 99.7% of list, 1.012 = 1.2% above).
// SOLD_ABOVE_LIST and OFF_MARKET_IN_TWO_WEEKS are fractions 0–1.
//
// PERIOD_DURATION = 1 for all monthly rows (integer in the Parquet; if the
// pipeline ever produces a VARCHAR column, change the WHERE clause to = '1').

export interface HousingZipRow {
  zip_code: string;
  period_begin: string; // ISO date string
  period_end: string;
  parent_metro_region: string;
  median_sale_price: number | null;
  median_list_price: number | null;
  median_ppsf: number | null;
  median_dom: number | null; // days
  avg_sale_to_list: number | null; // ratio around 1.0
  sold_above_list: number | null; // fraction 0–1
  price_drops: number | null; // fraction 0–1
  off_market_in_two_weeks: number | null; // fraction 0–1
  homes_sold: number | null;
  inventory: number | null;
  months_of_supply: number | null;
  pending_sales: number | null;
  median_sale_price_yoy: number | null; // decimal fraction
  median_sale_price_mom: number | null; // decimal fraction
  median_dom_yoy: number | null; // decimal fraction (relative DOM change)
  inventory_yoy: number | null; // decimal fraction
  avg_sale_to_list_yoy: number | null; // decimal fraction
}

const SOURCE_ID = "redfin_swfl";

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
      PERIOD_BEGIN::TEXT          AS period_begin,
      PERIOD_END::TEXT            AS period_end,
      PARENT_METRO_REGION         AS parent_metro_region,
      MEDIAN_SALE_PRICE           AS median_sale_price,
      MEDIAN_LIST_PRICE           AS median_list_price,
      MEDIAN_PPSF                 AS median_ppsf,
      MEDIAN_DOM                  AS median_dom,
      AVG_SALE_TO_LIST            AS avg_sale_to_list,
      SOLD_ABOVE_LIST             AS sold_above_list,
      PRICE_DROPS                 AS price_drops,
      OFF_MARKET_IN_TWO_WEEKS     AS off_market_in_two_weeks,
      HOMES_SOLD                  AS homes_sold,
      INVENTORY                   AS inventory,
      MONTHS_OF_SUPPLY            AS months_of_supply,
      PENDING_SALES               AS pending_sales,
      MEDIAN_SALE_PRICE_YOY       AS median_sale_price_yoy,
      MEDIAN_SALE_PRICE_MOM       AS median_sale_price_mom,
      MEDIAN_DOM_YOY              AS median_dom_yoy,
      INVENTORY_YOY               AS inventory_yoy,
      AVG_SALE_TO_LIST_YOY        AS avg_sale_to_list_yoy
    FROM redfin_swfl
    WHERE REGION_TYPE     = 'zip'
      AND PROPERTY_TYPE   = 'All Residential'
      AND PERIOD_DURATION = 1
    QUALIFY ROW_NUMBER() OVER (PARTITION BY zip_code ORDER BY PERIOD_BEGIN DESC) = 1
    ORDER BY zip_code
  `,
  rowShape: (raw) => ({
    zip_code: String(raw.zip_code ?? ""),
    period_begin: String(raw.period_begin ?? ""),
    period_end: String(raw.period_end ?? ""),
    parent_metro_region: String(raw.parent_metro_region ?? ""),
    median_sale_price:
      raw.median_sale_price != null ? Number(raw.median_sale_price) : null,
    median_list_price:
      raw.median_list_price != null ? Number(raw.median_list_price) : null,
    median_ppsf: raw.median_ppsf != null ? Number(raw.median_ppsf) : null,
    median_dom: raw.median_dom != null ? Number(raw.median_dom) : null,
    avg_sale_to_list:
      raw.avg_sale_to_list != null ? Number(raw.avg_sale_to_list) : null,
    sold_above_list:
      raw.sold_above_list != null ? Number(raw.sold_above_list) : null,
    price_drops: raw.price_drops != null ? Number(raw.price_drops) : null,
    off_market_in_two_weeks:
      raw.off_market_in_two_weeks != null
        ? Number(raw.off_market_in_two_weeks)
        : null,
    homes_sold: raw.homes_sold != null ? Number(raw.homes_sold) : null,
    inventory: raw.inventory != null ? Number(raw.inventory) : null,
    months_of_supply:
      raw.months_of_supply != null ? Number(raw.months_of_supply) : null,
    pending_sales: raw.pending_sales != null ? Number(raw.pending_sales) : null,
    median_sale_price_yoy:
      raw.median_sale_price_yoy != null
        ? Number(raw.median_sale_price_yoy)
        : null,
    median_sale_price_mom:
      raw.median_sale_price_mom != null
        ? Number(raw.median_sale_price_mom)
        : null,
    median_dom_yoy:
      raw.median_dom_yoy != null ? Number(raw.median_dom_yoy) : null,
    inventory_yoy: raw.inventory_yoy != null ? Number(raw.inventory_yoy) : null,
    avg_sale_to_list_yoy:
      raw.avg_sale_to_list_yoy != null
        ? Number(raw.avg_sale_to_list_yoy)
        : null,
  }),
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
      "Redfin Data Center — ZIP-level monthly housing metrics for SWFL MSAs (All Residential). Updated ~3rd Friday each month. https://www.redfin.com/news/data-center/",
    verified: verifiedDate,
    expires: expiresDate(verifiedDate, ttlSeconds),
  }),
  fixturePath: "refinery/__fixtures__/housing-swfl.sample.json",
});
