import path from "node:path";
import { makeDuckDBSource } from "./duckdb-source.mts";
import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { env } from "../config/env.mts";
import { fragmentId } from "../lib/ids.mts";
import { expiresDate } from "../lib/dates.mts";

/**
 * USGS Water Services source connector — Tier-1 Parquet dual-read.
 *
 * Live mode: one DuckDB query over the two Parquets that `usgs-monthly.yml`
 * refreshes monthly (`python -m ingest.duckdb_pipelines.usgs.pipeline`):
 *   - s3://lake-tier1/environmental/usgs_water_swfl.parquet        (daily readings)
 *   - s3://lake-tier1/environmental/usgs_water_swfl_sites.parquet  (site catalog)
 * The daily Parquet carries NO site metadata (no huc_cd/county_cd), so the
 * Caloosahatchee filter (huc_cd LIKE '03090205%') must join the site catalog —
 * that is the dual-read. Until 07/19/2026 this connector read
 * data_lake.usgs_daily + data_lake.usgs_sites over PostgREST; that table pair
 * froze on 2026-05-19 when its producing module was deleted (check
 * usgs_tier2_orphan), leaving env-swfl labeling a 2026-05-17 reading "latest".
 *
 * Fixture mode: reads refinery/__fixtures__/usgs-water-joined.sample.json
 * (flat array of the live query's row shape, per makeDuckDBSource contract).
 *
 * Emits one summary fragment (kind: "hydro-swfl-aggregate") with the
 * Caloosahatchee surface-stage aggregate, consumed by env-swfl, plus per-row
 * record fragments for the gage readings that feed the aggregate (the
 * latest-date Caloosahatchee 00065 set). The pre-Parquet connector emitted a
 * record per SWFL daily row — fine against the frozen 605-row stub, unbounded
 * against the full 4.7M-row series — so records now cover exactly the rows
 * the served number is computed from. Groundwater and rainfall metrics are
 * sourced from separate connectors (Lee County NR WellMonitor and NOAA
 * GHCN-D respectively) — not from this connector.
 *
 * Spec of record: docs/API_BLUEPRINTS_USGS.md (committed bbc4a73);
 * zombie-read postmortem: docs/audits/2026-07-18-data-consolidation/P8-bypass-and-zombie.md.
 */

const SOURCE_ID = "usgs_water";
const BUCKET = "lake-tier1";
const DAILY_PARQUET_URL = `s3://${BUCKET}/environmental/usgs_water_swfl.parquet`;
const SITES_PARQUET_URL = `s3://${BUCKET}/environmental/usgs_water_swfl_sites.parquet`;
const API_BASE = "https://waterservices.usgs.gov/nwis";

const CALOOSAHATCHEE_HUC_PREFIX = "03090205";

const FIXTURE_PATH = path.join(
  process.cwd(),
  "refinery",
  "__fixtures__",
  "usgs-water-joined.sample.json",
);

// ── Types ──────────────────────────────────────────────────────────────────────

/** One daily reading joined to its site's metadata (the live query's row shape). */
export interface UsgsJoinedRow {
  site_no: string;
  parameter_cd: string;
  stat_cd: string;
  obs_date: string;
  value: number | null;
  unit: string;
  datum: string;
  huc_cd: string | null;
  county_cd: string | null;
}

export interface MetricWindow {
  start: string | null;
  end: string | null;
  days_covered: number;
  site_nos: string[];
}

export interface HydroSwflAggregate {
  kind: "hydro-swfl-aggregate";
  sw_stage_caloosahatchee_ft: number | null;
  sw_stage_window: MetricWindow;
}

export interface UsgsDailyRecord {
  kind: "usgs-daily-record";
  site_no: string;
  parameter_cd: string;
  obs_date: string;
  value: number | null;
  datum: string;
}

// ── Aggregator helpers ────────────────────────────────────────────────────────

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1]! + sorted[mid]!) / 2;
  return sorted[mid]!;
}

/**
 * Latest-date median across Caloosahatchee gages — same contract as the
 * pre-Parquet connector: parameter 00065, HUC 03090205%, non-null value,
 * anchor on the newest obs_date, median across all gages reporting that day.
 * Re-applies the filter defensively so a looser fixture (or future query
 * change) cannot widen what the served number is computed from.
 */
export function swStageCaloosahatcheeLatest(rows: UsgsJoinedRow[]): {
  value: number | null;
  window: MetricWindow;
  sameDay: UsgsJoinedRow[];
} {
  const usable = rows.filter(
    (r) =>
      r.parameter_cd === "00065" &&
      r.value !== null &&
      !!r.huc_cd &&
      r.huc_cd.startsWith(CALOOSAHATCHEE_HUC_PREFIX),
  );
  let anchor: string | null = null;
  for (const r of usable) {
    if (anchor === null || r.obs_date > anchor) anchor = r.obs_date;
  }
  if (!anchor) {
    return {
      value: null,
      window: { start: null, end: null, days_covered: 0, site_nos: [] },
      sameDay: [],
    };
  }
  const sameDay = usable.filter((r) => r.obs_date === anchor);
  const value = median(sameDay.map((r) => r.value as number));
  const usedSites = Array.from(new Set(sameDay.map((r) => r.site_no))).sort();
  return {
    value: value === null ? null : Math.round(value * 100) / 100,
    window: {
      start: anchor,
      end: anchor,
      days_covered: 1,
      site_nos: usedSites,
    },
    sameDay,
  };
}

// ── Row shaping ────────────────────────────────────────────────────────────────

function toStr(v: unknown): string {
  return v == null ? "" : String(v);
}

function toStrOrNull(v: unknown): string | null {
  return v == null ? null : String(v);
}

function toNumOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "bigint" ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

// ── Connector ──────────────────────────────────────────────────────────────────

export const usgsWaterSource: SourceConnector = makeDuckDBSource<UsgsJoinedRow>({
  source_id: SOURCE_ID,
  trust_tier: 1,
  parquetViews: [
    { name: "usgs_daily", s3_url: DAILY_PARQUET_URL },
    { name: "usgs_sites", s3_url: SITES_PARQUET_URL },
  ],
  // Dual-read: the daily Parquet has no site metadata, so the Caloosahatchee
  // HUC filter joins the site catalog. The latest-date restriction keeps the
  // result to the handful of gage readings the aggregate is computed from
  // (the full series is ~4.7M rows).
  query: `
    WITH caloosa AS (
      SELECT site_no, huc_cd, county_cd
      FROM usgs_sites
      WHERE huc_cd LIKE '${CALOOSAHATCHEE_HUC_PREFIX}%'
    ),
    filtered AS (
      SELECT d.site_no, d.parameter_cd, d.stat_cd,
             CAST(d.obs_date AS VARCHAR) AS obs_date,
             d.value, d.unit, d.datum,
             s.huc_cd, s.county_cd
      FROM usgs_daily d
      JOIN caloosa s USING (site_no)
      WHERE d.parameter_cd = '00065' AND d.value IS NOT NULL
    )
    SELECT * FROM filtered
    WHERE obs_date = (SELECT max(obs_date) FROM filtered)
    ORDER BY site_no
  `,
  rowShape: (r): UsgsJoinedRow => ({
    site_no: toStr(r["site_no"]),
    parameter_cd: toStr(r["parameter_cd"]),
    stat_cd: toStr(r["stat_cd"]),
    obs_date: toStr(r["obs_date"]).slice(0, 10),
    value: toNumOrNull(r["value"]),
    unit: toStr(r["unit"]),
    datum: toStr(r["datum"]),
    huc_cd: toStrOrNull(r["huc_cd"]),
    county_cd: toStrOrNull(r["county_cd"]),
  }),
  normalize: (rows, { fetched_at }): RawFragment[] => {
    const swStage = swStageCaloosahatcheeLatest(rows);
    const fragments: RawFragment[] = [];

    // Per-row records for the readings that feed the aggregate — ledger
    // traceability for exactly what the served number is computed from.
    for (const r of swStage.sameDay) {
      const norm: UsgsDailyRecord = {
        kind: "usgs-daily-record",
        site_no: r.site_no,
        parameter_cd: r.parameter_cd,
        obs_date: r.obs_date,
        value: r.value,
        datum: r.datum,
      };
      fragments.push({
        fragment_id: fragmentId(SOURCE_ID, `${r.site_no}-${r.parameter_cd}-${r.obs_date}`),
        source_id: SOURCE_ID,
        source_trust_tier: 1,
        fetched_at,
        raw: {
          site_no: r.site_no,
          parameter_cd: r.parameter_cd,
          obs_date: r.obs_date,
        },
        normalized: norm,
      });
    }

    const aggregate: HydroSwflAggregate = {
      kind: "hydro-swfl-aggregate",
      sw_stage_caloosahatchee_ft: swStage.value,
      sw_stage_window: swStage.window,
    };
    fragments.push({
      fragment_id: fragmentId(SOURCE_ID, "hydro-swfl-aggregate"),
      source_id: SOURCE_ID,
      source_trust_tier: 1,
      fetched_at,
      raw: {
        swfl_site_count: swStage.window.site_nos.length,
        daily_row_count: rows.length,
      },
      normalized: aggregate,
    });

    return fragments;
  },
  citation: (verifiedDate, ttlSeconds): Omit<CitationRow, "id"> => {
    const isLive = env.source !== "fixture";
    return {
      source: isLive
        ? `USGS Water Services daily values via Tier-1 Parquet ${DAILY_PARQUET_URL} × site catalog ${SITES_PARQUET_URL} (dual-read; refreshed monthly by usgs-monthly.yml → ingest/duckdb_pipelines/usgs/pipeline.py; upstream ${API_BASE}/dv/?stateCd=FL&parameterCd=00065&statCd=00003&siteStatus=active; Caloosahatchee filter huc_cd LIKE '${CALOOSAHATCHEE_HUC_PREFIX}%')`
        : "USGS Water Services (fixture; usgs-water-joined.sample.json, latest-date Caloosahatchee 00065 gage readings)",
      verified: verifiedDate,
      expires: expiresDate(verifiedDate, ttlSeconds),
    };
  },
  fixturePath: FIXTURE_PATH,
});

// ── Smoke-test entry point ─────────────────────────────────────────────────────
// Windows PowerShell: $env:REFINERY_SOURCE="fixture"; npx tsx refinery/sources/usgs-water-source.mts
// bash/zsh:           REFINERY_SOURCE=fixture npx tsx refinery/sources/usgs-water-source.mts

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  usgsWaterSource.fetch().then((fragments) => {
    const summary = fragments.find(
      (f) => (f.normalized as { kind?: string }).kind === "hydro-swfl-aggregate",
    );
    console.log(JSON.stringify(summary?.normalized ?? null, null, 2));
    console.log(`\nTotal fragments: ${fragments.length}`);
  });
}
