import path from "node:path";
import { makeDuckDBSource } from "./duckdb-source.mts";
import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { fragmentId } from "../lib/ids.mts";
import { expiresDate } from "../lib/dates.mts";

/**
 * bls-ppi source connector — BLS Producer Price Index, "Nonresidential
 * Building Construction" sector (NAICS 236 subset). Cold Lane edition, same
 * shape as faf5-source.mts: DuckDB reads Parquet directly from lake-tier1,
 * no external API call from refinery (the Python ingest already owns that).
 *
 * `ingest/pipelines/bls_ppi/pipeline.py` writes a NEW file every monthly run
 * (`macro/bls_ppi/{YYYY-MM}.parquet`), and each run re-fetches the FULL
 * 10-year window — so multiple monthly files overlap on (series_id, year,
 * period). The query below collapses that with GROUP BY + MAX(value); BLS can
 * revise a recent observation within ~30 days, so MAX is a deterministic,
 * documented tie-break, not a claim of "always latest".
 *
 * 12 series ingested; this connector normalizes all 12 (cre-swfl.mts decides
 * which 8 to surface — see BLS_PPI_METRIC_MAP there. 236222/236400/236500/
 * 2381MR normalize here like everything else; cre-swfl simply doesn't map
 * them to a key_metric).
 *
 * Trust tier: 1 (BLS is a primary federal source, same tier as FRED in
 * macro-us-source.mts).
 */

const SOURCE_ID = "bls_ppi_construction";
const BUCKET = "lake-tier1";

const FIXTURE_PATH = path.join(process.cwd(), "refinery", "__fixtures__", "bls-ppi.sample.json");

export interface BlsPpiSeriesSpec {
  series_id: string;
  naics: string;
  label: string;
}

// Live-verified 07/17/2026 against download.bls.gov/pub/time.series/pc/pc.industry
// + data.bls.gov/timeseries/<id> — see docs/superpowers/specs/
// 2026-07-17-bls-ppi-cre-swfl-consumer-design.md for the verification trail.
export const BLS_PPI_SERIES: BlsPpiSeriesSpec[] = [
  { series_id: "PCU236211236211", naics: "236211", label: "New industrial building construction" },
  { series_id: "PCU236221236221", naics: "236221", label: "New warehouse building construction" },
  { series_id: "PCU236222236222", naics: "236222", label: "New school building construction" },
  { series_id: "PCU236223236223", naics: "236223", label: "New office building construction" },
  { series_id: "PCU236224236224", naics: "236224", label: "New health care building construction" },
  {
    series_id: "PCU23811X23811X",
    naics: "23811X",
    label: "Concrete contractors, nonresidential building work",
  },
  {
    series_id: "PCU23816X23816X",
    naics: "23816X",
    label: "Roofing contractors, nonresidential building work",
  },
  {
    series_id: "PCU23821X23821X",
    naics: "23821X",
    label: "Electrical contractors, nonresidential building work",
  },
  {
    series_id: "PCU23822X23822X",
    naics: "23822X",
    label: "Plumbing/HVAC contractors, nonresidential building work",
  },
  {
    series_id: "PCU236400236400",
    naics: "236400",
    label: "New nonresidential building construction by contractor type/region",
  },
  {
    series_id: "PCU236500236500",
    naics: "236500",
    label: "New nonresidential building construction by region",
  },
  {
    series_id: "PCU2381MR2381MR",
    naics: "2381MR",
    label: "Nonresidential building maintenance & repair",
  },
];

/** Normalized BLS PPI indicator — what Stage 2 / Stage 3 see. */
export interface BlsPpiNormalized {
  kind: "bls-ppi-index";
  series_id: string;
  label: string;
  value: number;
  /** "YYYY-MM" of the latest observation. */
  period: string;
  direction: "rising" | "falling" | "stable";
}

interface BlsPpiRow {
  series_id: string;
  year: number;
  period: string;
  period_name: string;
  value: number;
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Sortable rank for (year, "M06")-style BLS periods — higher = more recent. */
function periodRank(year: number, period: string): number {
  const m = parseInt(period.replace(/^M/, ""), 10);
  return year * 100 + (Number.isFinite(m) ? m : 0);
}

/** Same threshold convention as macro-us-source.mts::computeDirection. */
function computeDirection(sortedDesc: BlsPpiRow[]): BlsPpiNormalized["direction"] {
  if (sortedDesc.length < 2) return "stable";
  const latest = sortedDesc[0]!.value;
  const compareIdx = Math.min(sortedDesc.length - 1, 6);
  const prior = sortedDesc[compareIdx]!.value;
  if (!Number.isFinite(latest) || !Number.isFinite(prior) || prior === 0) {
    return "stable";
  }
  const relChange = (latest - prior) / Math.abs(prior);
  if (relChange > 0.02) return "rising";
  if (relChange < -0.02) return "falling";
  return "stable";
}

export const blsPpiSource: SourceConnector = makeDuckDBSource<BlsPpiRow>({
  source_id: SOURCE_ID,
  trust_tier: 1,
  parquetViews: [{ name: "bls_ppi_raw", s3_url: `s3://${BUCKET}/macro/bls_ppi/*.parquet` }],
  query: `
    SELECT series_id, year, period, period_name, MAX(value) AS value
    FROM bls_ppi_raw
    GROUP BY series_id, year, period, period_name
    ORDER BY series_id, year, period
  `,
  rowShape: (r) => ({
    series_id: String(r["series_id"] ?? ""),
    year: toNum(r["year"]),
    period: String(r["period"] ?? ""),
    period_name: String(r["period_name"] ?? ""),
    value: toNum(r["value"]),
  }),
  normalize: (rows, { fetched_at }): RawFragment[] => {
    const bySeries = new Map<string, BlsPpiRow[]>();
    for (const r of rows) {
      const bucket = bySeries.get(r.series_id) ?? [];
      bucket.push(r);
      bySeries.set(r.series_id, bucket);
    }
    const fragments: RawFragment[] = [];
    for (const spec of BLS_PPI_SERIES) {
      const seriesRows = bySeries.get(spec.series_id);
      if (!seriesRows || seriesRows.length === 0) continue;
      const sortedDesc = [...seriesRows].sort(
        (a, b) => periodRank(b.year, b.period) - periodRank(a.year, a.period),
      );
      const latest = sortedDesc[0]!;
      const normalized: BlsPpiNormalized = {
        kind: "bls-ppi-index",
        series_id: spec.series_id,
        label: spec.label,
        value: latest.value,
        period: `${latest.year}-${latest.period.replace(/^M/, "").padStart(2, "0")}`,
        direction: computeDirection(sortedDesc),
      };
      fragments.push({
        fragment_id: fragmentId(SOURCE_ID, spec.series_id),
        source_id: SOURCE_ID,
        source_trust_tier: 1,
        fetched_at,
        raw: { series_id: latest.series_id, year: latest.year, period: latest.period },
        normalized,
      });
    }
    return fragments;
  },
  citation: (verifiedDate, ttlSeconds): Omit<CitationRow, "id"> => ({
    source:
      "BLS Producer Price Index — Nonresidential Building Construction sector " +
      "(NAICS 236 industry data; monthly, not seasonally adjusted) — https://www.bls.gov/ppi/",
    verified: verifiedDate,
    expires: expiresDate(verifiedDate, ttlSeconds),
  }),
  fixturePath: FIXTURE_PATH,
});
