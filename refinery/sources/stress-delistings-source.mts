import { makeDuckDBSource } from "./duckdb-source.mts";
import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { fragmentId } from "../lib/ids.mts";
import { expiresDate } from "../lib/dates.mts";

// Redfin Data Center — delistings_relistings parquet stores numeric columns
// as VARCHAR because "NA" appears alongside decimals in the source CSV.
function toNum(v: unknown): number | null {
  if (v == null || v === "NA") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export interface DelistingsRow {
  zip_code: string;
  period_begin: string; // ISO date "YYYY-MM-DD"
  share_delisted_pct: number | null; // % of listings delisted (leading indicator)
  share_relisted_pct: number | null; // % of listings relisted after delisting
}

const SOURCE_ID = "redfin_delistings_relistings_swfl";

export const stressDelistSource: SourceConnector = makeDuckDBSource<DelistingsRow>({
  source_id: SOURCE_ID,
  trust_tier: 3,
  parquetViews: [
    {
      name: "delist_view",
      s3_url: "s3://lake-tier1/market/redfin_delistings_relistings.parquet",
    },
  ],
  // Fetch all periods — corpusSummary needs the full 2019–2021 baseline window.
  query: `
    SELECT
      zip_code,
      period_begin::TEXT   AS period_begin,
      share_delisted_pct,
      share_relisted_pct
    FROM delist_view
    ORDER BY zip_code, period_begin
  `,
  rowShape: (raw) => ({
    zip_code: String(raw.zip_code ?? ""),
    period_begin: String(raw.period_begin ?? ""),
    share_delisted_pct: toNum(raw.share_delisted_pct),
    share_relisted_pct: toNum(raw.share_relisted_pct),
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
      "Redfin Data Center — delistings_relistings ZIP-level monthly rolling-3-month data for SWFL MSAs. Published ~15th of each month. https://www.redfin.com/news/data-center/",
    verified: verifiedDate,
    expires: expiresDate(verifiedDate, ttlSeconds),
  }),
  fixturePath: "refinery/__fixtures__/seller-stress-swfl-delist.sample.json",
});
