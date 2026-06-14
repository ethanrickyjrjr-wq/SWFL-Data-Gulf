import { readFile } from "node:fs/promises";
import path from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { fragmentId } from "../lib/ids.mts";
import { isoTimestamp, expiresDate } from "../lib/dates.mts";
import { composeQuery } from "./duckdb-source.mts";

/**
 * Franchise Outcomes source connector.
 *
 * Two modes controlled by REFINERY_FRANCHISE_SOURCE:
 *   fixture (default) — reads the committed 15-brand curated sample. Safe with
 *     no credentials; used until the first quarterly SBA FOIA pipeline run lands.
 *   live              — reads s3://lake-tier1/franchise/sba_foia_franchise_county.parquet
 *     via DuckDB. Requires SUPABASE_S3_* env vars.
 *
 * The REFINERY_FRANCHISE_SOURCE flag is intentionally separate from the global
 * REFINERY_SOURCE so franchise can be graduated to live independently of the rest
 * of the refinery (or vice versa).
 *
 * The former live RPC source + its backing Postgres table were dropped 2026-06-14
 * (see docs/sql/20260614_drop_sba_franchise_outcomes.sql). The Parquet lane is
 * its replacement (Tier-1 Storage, ingest/duckdb_pipelines/franchise_outcomes/).
 */

const COUNTY_PARQUET_URL = "s3://lake-tier1/franchise/sba_foia_franchise_county.parquet";

const SOURCE_ID = "sba_loans_franchise_outcomes";

const FIXTURE_PATH = path.join(
  process.cwd(),
  "refinery",
  "__fixtures__",
  "franchise-outcomes.sample.json",
);

/** Deterministic projection of a view/RPC row — the shape Stage 2's fitScore() reads. */
export interface FranchiseNormalized {
  franchise_code: string;
  franchise_name: string;
  /** TOTAL loans for the brand, including still-active ones */
  n_loans: number;
  n_paid_in_full: number;
  n_charged_off: number;
  /** % over RESOLVED loans (paid_in_full + charged_off); null = no resolved loans */
  survival_rate: number | null;
  chargeoff_rate: number | null;
  total_gross_approval: number;
}

/** Coerce a count/amount to a finite number; null/garbage -> 0. */
function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Coerce a rate to a 0-100 number, or null when there is no data.
 * Normalizes both representations: a 0-1 ratio (fixture) and a 0-100
 * percentage (the live RPC) both land at 0-100.
 */
function toRate(v: unknown): number | null {
  if (v == null) return null;
  const raw = typeof v === "string" ? parseFloat(v) : Number(v);
  if (!Number.isFinite(raw)) return null;
  return raw <= 1 ? raw * 100 : raw;
}

/**
 * Map one raw view/RPC row to the normalized shape. The live RPC produces
 * `n_chargeoffs` / `total_approved`; the synthetic fixture uses
 * `n_charged_off` / `total_gross_approval` — both are handled.
 */
export function normalize(row: Record<string, unknown>): FranchiseNormalized {
  const chargedOff = "n_charged_off" in row ? row.n_charged_off : row.n_chargeoffs;
  const grossApproval =
    "total_gross_approval" in row ? row.total_gross_approval : row.total_approved;
  return {
    franchise_code: String(row.franchise_code ?? ""),
    franchise_name: String(row.franchise_name ?? ""),
    n_loans: toNum(row.n_loans),
    n_paid_in_full: toNum(row.n_paid_in_full),
    n_charged_off: toNum(chargedOff),
    survival_rate: toRate(row.survival_rate),
    chargeoff_rate: toRate(row.chargeoff_rate),
    total_gross_approval: toNum(grossApproval),
  };
}

/** Load the fixture file and unwrap the `{ __meta, rows }` wrapper to a plain array. */
async function loadFixtureRows(): Promise<Record<string, unknown>[]> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  const data = JSON.parse(raw) as { rows?: unknown[]; data?: unknown[] } | unknown[];
  const rows: unknown[] = Array.isArray(data) ? data : (data.rows ?? data.data ?? []);
  return rows as Record<string, unknown>[];
}

/** Wrap raw rows into RawFragments — shared by the fixture and live paths. */
function rowsToFragments(rows: Record<string, unknown>[]): RawFragment[] {
  const fetched_at = isoTimestamp();
  return rows.map((row) => {
    const normalized = normalize(row);
    const key = normalized.franchise_code || normalized.franchise_name || JSON.stringify(row);
    return {
      fragment_id: fragmentId(SOURCE_ID, key),
      source_id: SOURCE_ID,
      source_trust_tier: 1, // SBA = federal agency
      fetched_at,
      raw: row,
      normalized,
    } satisfies RawFragment<FranchiseNormalized>;
  });
}

/**
 * Live path: read county-grain Parquet from Tier-1 Storage via DuckDB.
 * Only called when REFINERY_FRANCHISE_SOURCE=live.
 * Requires SUPABASE_S3_ENDPOINT, SUPABASE_S3_ACCESS_KEY_ID, SUPABASE_S3_SECRET_ACCESS_KEY.
 */
async function fetchLive(): Promise<RawFragment[]> {
  const endpointRaw = process.env["SUPABASE_S3_ENDPOINT"] ?? "";
  const accessKey = process.env["SUPABASE_S3_ACCESS_KEY_ID"];
  const secretKey = process.env["SUPABASE_S3_SECRET_ACCESS_KEY"];
  if (!endpointRaw || !accessKey || !secretKey) {
    throw new Error(
      "REFINERY_FRANCHISE_SOURCE=live requires SUPABASE_S3_ENDPOINT, " +
        "SUPABASE_S3_ACCESS_KEY_ID, SUPABASE_S3_SECRET_ACCESS_KEY",
    );
  }
  const statements = composeQuery({
    source_id: SOURCE_ID,
    parquetViews: [{ name: "county_brands", s3_url: COUNTY_PARQUET_URL }],
    query: `
      SELECT
        franchise_code,
        franchise_name,
        n_loans::BIGINT        AS n_loans,
        n_paid_in_full::BIGINT AS n_paid_in_full,
        n_charged_off::BIGINT  AS n_charged_off,
        survival_rate,
        chargeoff_rate,
        total_gross_approval
      FROM county_brands
      ORDER BY franchise_name
    `,
    s3: {
      endpoint: endpointRaw.replace(/^https?:\/\//, ""),
      accessKey,
      secretKey,
    },
  });
  const instance = await DuckDBInstance.create(":memory:");
  const conn = await instance.connect();
  try {
    for (let i = 0; i < statements.length - 1; i++) {
      await conn.run(statements[i]!);
    }
    const reader = await conn.runAndReadAll(statements[statements.length - 1]!);
    return rowsToFragments(reader.getRowObjects() as Record<string, unknown>[]);
  } finally {
    conn.closeSync();
  }
}

/**
 * Fetch raw fragments from the franchise outcomes source.
 * Defaults to fixture; set REFINERY_FRANCHISE_SOURCE=live to read the Tier-1 Parquet.
 */
export async function fetch(): Promise<RawFragment[]> {
  if (process.env["REFINERY_FRANCHISE_SOURCE"] === "live") return fetchLive();
  return rowsToFragments(await loadFixtureRows());
}

/**
 * Citation metadata for this source. Stage 4 assigns the citation `id` (s01...).
 *
 * County-grain live citation: states "county-grain Parquet" — this connector reads
 * only sba_foia_franchise_county.parquet. The ZIP-approx Parquet (franchise_zip_approx)
 * is not yet consumed by this connector. TODO: when a ZIP-approx detail_tables consumer
 * is added, its citation source string MUST carry "ZIP-approx (borrower city → nearest
 * ZCTA centroid; NOT project ZIP)" so zip_is_approx=True is legible to downstream callers.
 * See SOURCED.md#sba-foia-franchise-row-counts → "ZIP citation deferred".
 */
export function citationMeta(verifiedDate: string, ttlSeconds: number): Omit<CitationRow, "id"> {
  const isLive = process.env["REFINERY_FRANCHISE_SOURCE"] === "live";
  return {
    source: isLive
      ? "SBA 7(a) FOIA — franchise loan outcomes, Lee & Collier FL (county-grain Parquet, Tier-1 Storage)"
      : "SBA 7(a)/504 franchise loan outcomes — Lee & Collier counties, FL",
    verified: verifiedDate,
    expires: expiresDate(verifiedDate, ttlSeconds),
  };
}

/**
 * The connector. Satisfies SourceConnector (source_id / fetch / citationMeta —
 * what the pipeline consumes) and also carries `id` + `normalize`.
 */
export const franchiseSource: SourceConnector & {
  id: string;
  normalize: typeof normalize;
} = {
  id: "franchise-outcomes",
  source_id: SOURCE_ID,
  trust_tier: 1, // SBA = federal agency, primary source
  fetch,
  normalize,
  citationMeta,
};
