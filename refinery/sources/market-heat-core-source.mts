import { makeDuckDBSource } from "./duckdb-source.mts";
import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { fragmentId } from "../lib/ids.mts";
import { expiresDate } from "../lib/dates.mts";

// realtor.com numeric columns can arrive as DOUBLE/BIGINT or null (we wrote
// blanks/'NA' as null in the pipeline). Coerce everything to number|null.
function toNum(v: unknown): number | null {
  if (v == null || v === "NA" || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export interface MarketHeatCoreRow {
  zip_code: string;
  month: string; // YYYYMM, e.g. "202605"
  active_listing_count: number | null;
  active_listing_count_yy: number | null; // fractional YoY
  median_days_on_market: number | null;
  median_days_on_market_yy: number | null; // fractional YoY
  pending_ratio: number | null; // pending ÷ active
  pending_ratio_yy: number | null; // fractional YoY
  new_listing_count: number | null;
  price_reduced_share: number | null;
  price_reduced_share_yy: number | null; // fractional YoY
  median_listing_price: number | null;
  quality_flag: number | null; // realtor's own confidence flag (0 = ok)
}

const SOURCE_ID = "realtor_market_heat_core_swfl";

export const marketHeatCoreSource: SourceConnector = makeDuckDBSource<MarketHeatCoreRow>({
  source_id: SOURCE_ID,
  trust_tier: 3,
  parquetViews: [
    {
      name: "core_view",
      s3_url: "s3://lake-tier1/market/market_heat_core_swfl.parquet",
    },
  ],
  // Fetch all periods — corpusSummary needs the trailing window for the
  // multi-month falsifier (pending falls 2+ months while inventory rises).
  query: `
    SELECT
      postal_code::TEXT          AS zip_code,
      month_date_yyyymm::TEXT    AS month,
      active_listing_count,
      active_listing_count_yy,
      median_days_on_market,
      median_days_on_market_yy,
      pending_ratio,
      pending_ratio_yy,
      new_listing_count,
      price_reduced_share,
      price_reduced_share_yy,
      median_listing_price,
      quality_flag
    FROM core_view
    ORDER BY zip_code, month
  `,
  rowShape: (raw): MarketHeatCoreRow => ({
    zip_code: String(raw.zip_code ?? ""),
    month: String(raw.month ?? ""),
    active_listing_count: toNum(raw.active_listing_count),
    active_listing_count_yy: toNum(raw.active_listing_count_yy),
    median_days_on_market: toNum(raw.median_days_on_market),
    median_days_on_market_yy: toNum(raw.median_days_on_market_yy),
    pending_ratio: toNum(raw.pending_ratio),
    pending_ratio_yy: toNum(raw.pending_ratio_yy),
    new_listing_count: toNum(raw.new_listing_count),
    price_reduced_share: toNum(raw.price_reduced_share),
    price_reduced_share_yy: toNum(raw.price_reduced_share_yy),
    median_listing_price: toNum(raw.median_listing_price),
    quality_flag: toNum(raw.quality_flag),
  }),
  normalize: (rows, { fetched_at }): RawFragment[] =>
    rows.map((r) => ({
      fragment_id: fragmentId(SOURCE_ID, `${r.zip_code}|${r.month}`),
      source_id: SOURCE_ID,
      source_trust_tier: 3,
      fetched_at,
      raw: r,
      normalized: r,
    })),
  citation: (verifiedDate, ttlSeconds): Omit<CitationRow, "id"> => ({
    source:
      "Data provided by Realtor.com — Economic Research Data Library, Core Inventory Metrics (ZIP, monthly). Attribution-only license. https://www.realtor.com/research/data/",
    verified: verifiedDate,
    expires: expiresDate(verifiedDate, ttlSeconds),
  }),
  fixturePath: "refinery/__fixtures__/market-heat-swfl-core.sample.json",
});
