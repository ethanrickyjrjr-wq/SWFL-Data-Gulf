import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { env } from "../config/env.mts";
import { getSupabase } from "./supabase.mts";
import { fragmentId } from "../lib/ids.mts";
import { isoTimestamp, expiresDate } from "../lib/dates.mts";

/**
 * FDIC Summary of Deposits source connector.
 *
 * Live mode: reads the SQL aggregate view data_lake.fdic_sod_county_year_v (one row per
 * county x year, SUM already pushed to SQL — docs/sql/20260922_fdic_sod_county_year_v.sql)
 * over data_lake.fdic_sod, populated by ingest/pipelines/fdic_bankfind/pipeline.py.
 * Fixture mode: refinery/__fixtures__/fdic-deposits.sample.json.
 *
 * Deposits are reported by the vendor in THOUSANDS of dollars as of June 30 of `year`.
 * The summary carries them as whole USD (x1000) so key_metrics never need a unit footnote.
 *
 * Latest-year rule: the vendor index can carry a new year before every bank has filed.
 * A year is served only when its branch count is >= 80% of the prior year's; otherwise
 * the prior year is served and the thin one is named in `partial_year`.
 */

const SOURCE_ID = "fdic_sod";
const SCHEMA = "data_lake";
const VIEW = "fdic_sod_county_year_v";
export const FDIC_API_URL = "https://api.fdic.gov/banks/sod";

const COMPLETE_YEAR_FLOOR = 0.8;

const COUNTIES = {
  lee: "12071",
  collier: "12021",
  hendry: "12051",
} as const;

const FIXTURE_PATH = path.join(
  process.cwd(),
  "refinery",
  "__fixtures__",
  "fdic-deposits.sample.json",
);

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FdicCountyYearRow {
  county_fips: string;
  year: number;
  branches: number;
  banks: number;
  deposits_thousands_usd: number;
}

export interface FdicCountyDeposits {
  county_fips: string;
  year: number;
  deposits_usd: number;
  deposits_yoy_pct: number | null;
  branches: number;
  banks: number;
  /** A newer year present in the source but too thin to serve, else null. */
  partial_year: number | null;
}

export interface FdicDepositsSwflSummary {
  kind: "fdic-deposits-swfl-summary";
  lee: FdicCountyDeposits | null;
  collier: FdicCountyDeposits | null;
  hendry: FdicCountyDeposits | null;
}

// ── Computation ────────────────────────────────────────────────────────────────

function yoyPct(latest: number, prior: number | undefined): number | null {
  if (prior == null || prior === 0) return null;
  return Math.round(((latest - prior) / prior) * 100 * 100) / 100;
}

export function latestCompleteIndex(rows: FdicCountyYearRow[]): number {
  // rows sorted ascending by year; walk back from the newest until one is complete.
  let i = rows.length - 1;
  while (i > 0 && rows[i].branches < COMPLETE_YEAR_FLOOR * rows[i - 1].branches) i--;
  return i;
}

export function countyDeposits(rows: FdicCountyYearRow[], fips: string): FdicCountyDeposits | null {
  const mine = rows.filter((r) => r.county_fips === fips).sort((a, b) => a.year - b.year);
  if (mine.length === 0) return null;
  const i = latestCompleteIndex(mine);
  const cur = mine[i];
  const prior = mine[i - 1];
  const newest = mine[mine.length - 1];
  return {
    county_fips: fips,
    year: cur.year,
    deposits_usd: cur.deposits_thousands_usd * 1000,
    deposits_yoy_pct: yoyPct(cur.deposits_thousands_usd, prior?.deposits_thousands_usd),
    branches: cur.branches,
    banks: cur.banks,
    partial_year: newest.year !== cur.year ? newest.year : null,
  };
}

export function buildSummary(rows: FdicCountyYearRow[]): FdicDepositsSwflSummary {
  return {
    kind: "fdic-deposits-swfl-summary",
    lee: countyDeposits(rows, COUNTIES.lee),
    collier: countyDeposits(rows, COUNTIES.collier),
    hendry: countyDeposits(rows, COUNTIES.hendry),
  };
}

// ── Fetch ──────────────────────────────────────────────────────────────────────

async function fetchLive(): Promise<FdicCountyYearRow[]> {
  const sb = getSupabase().schema(SCHEMA);
  const { data, error } = await sb
    .from(VIEW)
    .select("county_fips,year,branches,banks,deposits_thousands_usd")
    .order("county_fips")
    .order("year");
  if (error) throw new Error(`fdic-deposits-source: view query failed — ${error.message}`);
  if (!data || data.length === 0)
    throw new Error(
      `fdic-deposits-source: ${SCHEMA}.${VIEW} returned 0 rows — run ingest/pipelines/fdic_bankfind then docs/sql/20260922_fdic_sod_county_year_v.sql`,
    );
  return (data as FdicCountyYearRow[]).map((r) => ({
    county_fips: String(r.county_fips),
    year: Number(r.year),
    branches: Number(r.branches),
    banks: Number(r.banks),
    deposits_thousands_usd: Number(r.deposits_thousands_usd),
  }));
}

async function loadFixture(): Promise<FdicCountyYearRow[]> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return (JSON.parse(raw) as { records: FdicCountyYearRow[] }).records;
}

// ── Connector ──────────────────────────────────────────────────────────────────

export const fdicDepositsSource: SourceConnector = {
  source_id: SOURCE_ID,
  trust_tier: 1,

  async fetch(): Promise<RawFragment[]> {
    const rows = env.source === "fixture" ? await loadFixture() : await fetchLive();
    const fetched_at = isoTimestamp();
    const summary = buildSummary(rows);
    return [
      {
        fragment_id: fragmentId(SOURCE_ID, "fdic-deposits-swfl-summary"),
        source_id: SOURCE_ID,
        source_trust_tier: 1,
        fetched_at,
        raw: { rows: rows.length, lee_year: summary.lee?.year ?? null },
        normalized: summary,
      },
    ];
  },

  citationMeta(verifiedDate, ttlSeconds): Omit<CitationRow, "id"> {
    const isLive = env.source !== "fixture";
    return {
      source: isLive
        ? `FDIC Summary of Deposits via data_lake.fdic_sod (${FDIC_API_URL}; branch county STCNTYBR in Lee/Collier/Hendry, every year since 1994, deposits as of June 30)`
        : `FDIC Summary of Deposits (fixture; fdic-deposits.sample.json)`,
      verified: verifiedDate,
      expires: expiresDate(verifiedDate, ttlSeconds),
    };
  },
};
