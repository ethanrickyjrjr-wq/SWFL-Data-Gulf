import { makeDuckDBSource } from "./duckdb-source.mts";
import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { fragmentId } from "../lib/ids.mts";
import { expiresDate } from "../lib/dates.mts";

function toNum(v: unknown): number | null {
  if (v == null || v === "NA" || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export interface MarketHeatHotnessRow {
  zip_code: string;
  month: string; // YYYYMM
  hotness_score: number | null; // RELATIVE — cross-sectional rank, never a vote driver
  supply_score: number | null;
  demand_score: number | null;
  hotness_rank: number | null;
  median_dom_vs_us: number | null;
  quality_flag: number | null;
}

const SOURCE_ID = "realtor_market_heat_hotness_swfl";

export const marketHeatHotnessSource: SourceConnector = makeDuckDBSource<MarketHeatHotnessRow>({
  source_id: SOURCE_ID,
  trust_tier: 3,
  parquetViews: [
    {
      name: "hotness_view",
      s3_url: "s3://lake-tier1/market/market_heat_hotness_swfl.parquet",
    },
  ],
  query: `
      SELECT
        postal_code::TEXT       AS zip_code,
        month_date_yyyymm::TEXT AS month,
        hotness_score,
        supply_score,
        demand_score,
        hotness_rank,
        median_dom_vs_us,
        quality_flag
      FROM hotness_view
      ORDER BY zip_code, month
    `,
  rowShape: (raw): MarketHeatHotnessRow => ({
    zip_code: String(raw.zip_code ?? ""),
    month: String(raw.month ?? ""),
    hotness_score: toNum(raw.hotness_score),
    supply_score: toNum(raw.supply_score),
    demand_score: toNum(raw.demand_score),
    hotness_rank: toNum(raw.hotness_rank),
    median_dom_vs_us: toNum(raw.median_dom_vs_us),
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
      "Data provided by Realtor.com — Economic Research Data Library, Market Hotness Metrics (ZIP, monthly). Relative cross-sectional rank. Attribution-only license. https://www.realtor.com/research/data/",
    verified: verifiedDate,
    expires: expiresDate(verifiedDate, ttlSeconds),
  }),
  fixturePath: "refinery/__fixtures__/market-heat-swfl-hotness.sample.json",
});
