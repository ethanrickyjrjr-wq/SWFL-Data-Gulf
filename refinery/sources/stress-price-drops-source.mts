import { makeDuckDBSource } from "./duckdb-source.mts";
import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { fragmentId } from "../lib/ids.mts";
import { expiresDate } from "../lib/dates.mts";

// Redfin Data Center — price_drops parquet stores numeric columns as VARCHAR
// because "NA" appears alongside decimals in the CSV, forcing DuckDB to infer TEXT.
function toNum(v: unknown): number | null {
  if (v == null || v === "NA") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export interface PriceDropsRow {
  zip_code: string;
  period_begin: string; // ISO date "YYYY-MM-DD"
  pct_active_with_drops: number | null; // % of active listings with a price drop
  avg_price_drop_pct: number | null; // average size of price cuts (%)
}

const SOURCE_ID = "redfin_price_drops_swfl";

export const stressDropsSource: SourceConnector = makeDuckDBSource<PriceDropsRow>({
  source_id: SOURCE_ID,
  trust_tier: 3,
  parquetViews: [
    {
      name: "drops_view",
      s3_url: "s3://lake-tier1/market/redfin_price_drops.parquet",
    },
  ],
  // Fetch all periods — corpusSummary needs the full 2019–2021 baseline window.
  query: `
    SELECT
      zip_code,
      period_begin::TEXT   AS period_begin,
      pct_active_with_drops,
      avg_price_drop_pct
    FROM drops_view
    ORDER BY zip_code, period_begin
  `,
  rowShape: (raw) => ({
    zip_code: String(raw.zip_code ?? ""),
    period_begin: String(raw.period_begin ?? ""),
    pct_active_with_drops: toNum(raw.pct_active_with_drops),
    avg_price_drop_pct: toNum(raw.avg_price_drop_pct),
  }),
  normalize: (rows, { fetched_at }): RawFragment[] =>
    rows.map((r) => ({
      fragment_id: fragmentId(SOURCE_ID, `${r.zip_code}|${r.period_begin}`),
      source_id: SOURCE_ID,
      source_trust_tier: 3,
      fetched_at,
      raw: r,
      normalized: r,
    })),
  citation: (verifiedDate, ttlSeconds): Omit<CitationRow, "id"> => ({
    source:
      "Redfin Data Center — price_drops ZIP-level monthly rolling-3-month data for SWFL MSAs. Published ~15th of each month. https://www.redfin.com/news/data-center/",
    verified: verifiedDate,
    expires: expiresDate(verifiedDate, ttlSeconds),
  }),
  fixturePath: "refinery/__fixtures__/seller-stress-swfl-drops.sample.json",
});
