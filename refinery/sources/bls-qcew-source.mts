import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { env } from "../config/env.mts";
import { getSupabase } from "./supabase.mts";
import { fragmentId } from "../lib/ids.mts";
import { isoTimestamp, expiresDate } from "../lib/dates.mts";

/**
 * BLS QCEW source connector.
 *
 * Live mode: queries data_lake.bls_qcew (Tier 2, populated by
 * ingest/pipelines/bls_qcew/pipeline.py). Three parallel Supabase queries —
 * one per area FIPS (FL state, Lee County, Collier County). The table holds
 * the latest available quarter AND the same quarter one year prior, enabling
 * deterministic YoY wage and employment deltas.
 *
 * Fixture mode: reads refinery/__fixtures__/bls-qcew.sample.json.
 *
 * Private-sector (own_code="5") is the primary signal for CRE/franchise
 * purchasing-power models — government wages (codes "1"/"2"/"3") are stored
 * but not surfaced in the thin-pipe summary.
 */

const SOURCE_ID = "bls_qcew";
const SCHEMA = "data_lake";
const TABLE = "bls_qcew";
const API_BASE = "https://data.bls.gov/cew/data/api";

const FL_FIPS = "12000";
const LEE_FIPS = "12071";
const COLLIER_FIPS = "12021";

const FIXTURE_PATH = path.join(
  process.cwd(),
  "refinery",
  "__fixtures__",
  "bls-qcew.sample.json",
);

// ── Types ──────────────────────────────────────────────────────────────────────

interface DbRow {
  area_fips: string;
  own_code: string;
  industry_code: string;
  year: number;
  qtr: string;
  area_title: string | null;
  own_title: string | null;
  qtrly_estabs: number | null;
  month1_emplvl: number | null;
  month2_emplvl: number | null;
  month3_emplvl: number | null;
  total_qtrly_wages: number | null;
  avg_wkly_wage: number | null;
}

interface AreaMetrics {
  avg_wkly_wage: number | null;
  avg_wkly_wage_yoy_pct: number | null;
  month3_emplvl: number | null;
  employment_yoy_pct: number | null;
  qtrly_estabs: number | null;
  total_qtrly_wages: number | null;
}

interface AreaTotalMetrics {
  avg_wkly_wage: number | null;
  month3_emplvl: number | null;
  qtrly_estabs: number | null;
}

interface AreaSummary {
  private: AreaMetrics;
  total: AreaTotalMetrics;
}

export interface LaborSwflSummary {
  kind: "labor-swfl-summary";
  latest_quarter: string | null;
  prior_quarter: string | null;
  fl_state: AreaSummary;
  lee_county: AreaSummary;
  collier_county: AreaSummary;
}

export interface QcewRecord {
  kind: "bls-qcew-record";
  area_fips: string;
  own_code: string;
  year: number;
  qtr: string;
  avg_wkly_wage: number | null;
  month3_emplvl: number | null;
  qtrly_estabs: number | null;
  total_qtrly_wages: number | null;
}

// ── Computation helpers ────────────────────────────────────────────────────────

function toQtrString(year: number, qtr: string): string {
  return `${year}-Q${qtr}`;
}

function yoyPct(latest: number | null, prior: number | null): number | null {
  if (latest == null || prior == null || prior === 0) return null;
  return Math.round(((latest - prior) / prior) * 100 * 100) / 100;
}

function computeAreaSummary(
  rows: DbRow[],
  fips: string,
): { summary: AreaSummary; latestQtr: string | null; priorQtr: string | null } {
  const areaRows = rows.filter((r) => r.area_fips === fips);

  const qtrs = [
    ...new Set(areaRows.map((r) => toQtrString(r.year, r.qtr))),
  ].sort();
  const latestQtr = qtrs[qtrs.length - 1] ?? null;
  const priorQtr = qtrs[qtrs.length - 2] ?? null;

  const findRow = (qtrStr: string | null, ownCode: string): DbRow | null => {
    if (!qtrStr) return null;
    const [yr, q] = qtrStr.split("-Q");
    return (
      areaRows.find(
        (r) => r.year === Number(yr) && r.qtr === q && r.own_code === ownCode,
      ) ?? null
    );
  };

  const latestPrivate = findRow(latestQtr, "5");
  const priorPrivate = findRow(priorQtr, "5");
  const latestTotal = findRow(latestQtr, "0");

  return {
    latestQtr,
    priorQtr,
    summary: {
      private: {
        avg_wkly_wage: latestPrivate?.avg_wkly_wage ?? null,
        avg_wkly_wage_yoy_pct: yoyPct(
          latestPrivate?.avg_wkly_wage ?? null,
          priorPrivate?.avg_wkly_wage ?? null,
        ),
        month3_emplvl: latestPrivate?.month3_emplvl ?? null,
        employment_yoy_pct: yoyPct(
          latestPrivate?.month3_emplvl ?? null,
          priorPrivate?.month3_emplvl ?? null,
        ),
        qtrly_estabs: latestPrivate?.qtrly_estabs ?? null,
        total_qtrly_wages: latestPrivate?.total_qtrly_wages ?? null,
      },
      total: {
        avg_wkly_wage: latestTotal?.avg_wkly_wage ?? null,
        month3_emplvl: latestTotal?.month3_emplvl ?? null,
        qtrly_estabs: latestTotal?.qtrly_estabs ?? null,
      },
    },
  };
}

function buildLaborSwflSummary(rows: DbRow[]): LaborSwflSummary {
  const fl = computeAreaSummary(rows, FL_FIPS);
  const lee = computeAreaSummary(rows, LEE_FIPS);
  const collier = computeAreaSummary(rows, COLLIER_FIPS);

  return {
    kind: "labor-swfl-summary",
    latest_quarter: lee.latestQtr, // Lee County is the primary market reference
    prior_quarter: lee.priorQtr,
    fl_state: fl.summary,
    lee_county: lee.summary,
    collier_county: collier.summary,
  };
}

// ── Live fetch ─────────────────────────────────────────────────────────────────

const COLS =
  "area_fips,own_code,industry_code,year,qtr,area_title,own_title," +
  "qtrly_estabs,month1_emplvl,month2_emplvl,month3_emplvl,total_qtrly_wages,avg_wkly_wage";

async function fetchLive(): Promise<DbRow[]> {
  const sb = getSupabase().schema(SCHEMA);

  const [flResp, leeResp, collierResp] = await Promise.all([
    sb
      .from(TABLE)
      .select(COLS)
      .eq("area_fips", FL_FIPS)
      .order("year")
      .order("qtr"),
    sb
      .from(TABLE)
      .select(COLS)
      .eq("area_fips", LEE_FIPS)
      .order("year")
      .order("qtr"),
    sb
      .from(TABLE)
      .select(COLS)
      .eq("area_fips", COLLIER_FIPS)
      .order("year")
      .order("qtr"),
  ]);

  if (flResp.error)
    throw new Error(
      `bls-qcew-source: FL query failed — ${flResp.error.message}`,
    );
  if (leeResp.error)
    throw new Error(
      `bls-qcew-source: Lee query failed — ${leeResp.error.message}`,
    );
  if (collierResp.error)
    throw new Error(
      `bls-qcew-source: Collier query failed — ${collierResp.error.message}`,
    );

  return [
    ...((flResp.data ?? []) as DbRow[]),
    ...((leeResp.data ?? []) as DbRow[]),
    ...((collierResp.data ?? []) as DbRow[]),
  ];
}

// ── Fixture ────────────────────────────────────────────────────────────────────

interface FixtureShape {
  records: DbRow[];
}

async function loadFixture(): Promise<DbRow[]> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  const data = JSON.parse(raw) as FixtureShape;
  return data.records;
}

// ── Connector ──────────────────────────────────────────────────────────────────

export const blsQcewSource: SourceConnector = {
  source_id: SOURCE_ID,
  trust_tier: 1,

  async fetch(): Promise<RawFragment[]> {
    const rows =
      env.source === "fixture" ? await loadFixture() : await fetchLive();

    const fetched_at = isoTimestamp();
    const fragments: RawFragment[] = [];

    for (const r of rows) {
      const norm: QcewRecord = {
        kind: "bls-qcew-record",
        area_fips: r.area_fips,
        own_code: r.own_code,
        year: r.year,
        qtr: r.qtr,
        avg_wkly_wage: r.avg_wkly_wage,
        month3_emplvl: r.month3_emplvl,
        qtrly_estabs: r.qtrly_estabs,
        total_qtrly_wages: r.total_qtrly_wages,
      };
      fragments.push({
        fragment_id: fragmentId(
          SOURCE_ID,
          `${r.area_fips}-${r.own_code}-${r.year}-${r.qtr}`,
        ),
        source_id: SOURCE_ID,
        source_trust_tier: 1,
        fetched_at,
        raw: {
          area_fips: r.area_fips,
          own_code: r.own_code,
          year: r.year,
          qtr: r.qtr,
        },
        normalized: norm,
      });
    }

    const summary = buildLaborSwflSummary(rows);
    fragments.push({
      fragment_id: fragmentId(SOURCE_ID, "labor-swfl-summary"),
      source_id: SOURCE_ID,
      source_trust_tier: 1,
      fetched_at,
      raw: {
        latest_quarter: summary.latest_quarter,
        prior_quarter: summary.prior_quarter,
      },
      normalized: summary,
    });

    return fragments;
  },

  citationMeta(verifiedDate, ttlSeconds): Omit<CitationRow, "id"> {
    const isLive = env.source !== "fixture";
    return {
      source: isLive
        ? `BLS Quarterly Census of Employment and Wages via data_lake.bls_qcew (${API_BASE}/{year}/q{qtr}/area/{fips}.json; FL state + Lee County + Collier County, all industries, all ownership codes, merge-tracked 2 quarters)`
        : `BLS QCEW (fixture; bls-qcew.sample.json, 30 rows)`,
      verified: verifiedDate,
      expires: expiresDate(verifiedDate, ttlSeconds),
    };
  },
};

// ── Smoke-test entry point ─────────────────────────────────────────────────────
// Windows PowerShell: $env:REFINERY_SOURCE="fixture"; npx tsx refinery/sources/bls-qcew-source.mts
// bash/zsh:           REFINERY_SOURCE=fixture npx tsx refinery/sources/bls-qcew-source.mts

if (
  process.argv[1] &&
  import.meta.url.endsWith(path.basename(process.argv[1]))
) {
  blsQcewSource.fetch().then((fragments) => {
    const summary = fragments.find(
      (f) => (f.normalized as { kind?: string }).kind === "labor-swfl-summary",
    );
    console.log(JSON.stringify(summary?.normalized ?? null, null, 2));
    console.log(`\nTotal fragments: ${fragments.length}`);
  });
}
