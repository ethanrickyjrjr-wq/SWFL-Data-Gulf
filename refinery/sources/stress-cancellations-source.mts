import { makeDuckDBSource } from "./duckdb-source.mts";
import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { fragmentId } from "../lib/ids.mts";
import { expiresDate } from "../lib/dates.mts";

// Redfin Data Center — contract_cancellations parquet stores numeric columns
// as VARCHAR because "NA" appears alongside decimals in the source CSV.
function toNum(v: unknown): number | null {
  if (v == null || v === "NA") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export interface CancellationsRow {
  zip_code: string;
  period_begin: string; // ISO date "YYYY-MM-DD"
  cancellation_rate_pct: number | null; // cancellations as % of pending sales
}

const SOURCE_ID = "redfin_contract_cancellations_swfl";

export const stressCancSource: SourceConnector = makeDuckDBSource<CancellationsRow>({
  source_id: SOURCE_ID,
  trust_tier: 3,
  parquetViews: [
    {
      name: "canc_view",
      s3_url: "s3://lake-tier1/market/redfin_contract_cancellations.parquet",
    },
  ],
  // Fetch all periods — corpusSummary needs the full 2019–2021 baseline window.
  query: `
    SELECT
      zip_code,
      period_begin::TEXT   AS period_begin,
      cancellation_rate_pct
    FROM canc_view
    ORDER BY zip_code, period_begin
  `,
  rowShape: (raw) => ({
    zip_code: String(raw.zip_code ?? ""),
    period_begin: String(raw.period_begin ?? ""),
    cancellation_rate_pct: toNum(raw.cancellation_rate_pct),
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
      "Redfin Data Center — contract_cancellations ZIP-level monthly rolling-3-month data for SWFL MSAs. Published ~15th of each month. https://www.redfin.com/news/data-center/",
    verified: verifiedDate,
    expires: expiresDate(verifiedDate, ttlSeconds),
  }),
  fixturePath: "refinery/__fixtures__/seller-stress-swfl-canc.sample.json",
});
