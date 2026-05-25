import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { env } from "../config/env.mts";
import { getSupabase } from "./supabase.mts";
import { fragmentId } from "../lib/ids.mts";
import { isoTimestamp, expiresDate } from "../lib/dates.mts";

/**
 * BLS LAUS source connector.
 *
 * Live mode: queries data_lake.bls_laus (Tier 2, populated by
 * ingest/pipelines/bls_laus/pipeline.py). Three parallel Supabase queries —
 * one per area FIPS (FL state, Lee County, Collier County). Logs the queried
 * FIPS values at debug level — FIPS mismatch between ingest and source is the
 * primary phantom-data bug class in this pipeline.
 *
 * Fixture mode: reads refinery/__fixtures__/bls-laus.sample.json.
 *
 * Emits only a single laus-swfl-summary fragment (no per-row fragments).
 * macro-swfl needs the summary; row-level fragments would add cost with no
 * consumer today.
 */

const SOURCE_ID = "bls_laus";
const SCHEMA = "data_lake";
const TABLE = "bls_laus";
const API_BASE = "https://api.bls.gov/publicAPI/v2/timeseries/data/";

const FL_FIPS = "12000";
const LEE_FIPS = "12071";
const COLLIER_FIPS = "12021";

const FIXTURE_PATH = path.join(
  process.cwd(),
  "refinery",
  "__fixtures__",
  "bls-laus.sample.json",
);

// ── Types ──────────────────────────────────────────────────────────────────────

interface DbRow {
  series_id: string;
  area_fips: string;
  measure_code: string;
  measure_label: string | null;
  year: number;
  period: string;
  period_name: string | null;
  value: number | null;
  footnote_codes: string | null;
  _ingested_at: string | null;
}

export interface LausCountyMetrics {
  unemployment_rate: number | null;
  labor_force: number | null;
  employed: number | null;
  unemployment_rate_yoy_delta: number | null;
}

export interface LausSwflSummary {
  kind: "laus-swfl-summary";
  reference_month: string | null;
  is_preliminary: boolean;
  fl_state: LausCountyMetrics;
  lee_county: LausCountyMetrics;
  collier_county: LausCountyMetrics;
}

// ── Computation helpers ────────────────────────────────────────────────────────

function latestPeriod(rows: DbRow[]): { year: number; period: string } | null {
  let best: { year: number; period: string } | null = null;
  for (const r of rows) {
    if (
      best === null ||
      r.year > best.year ||
      (r.year === best.year && r.period > best.period)
    ) {
      best = { year: r.year, period: r.period };
    }
  }
  return best;
}

function getMeasure(
  rows: DbRow[],
  fips: string,
  mc: string,
  year: number,
  period: string,
): number | null {
  return (
    rows.find(
      (r) =>
        r.area_fips === fips &&
        r.measure_code === mc &&
        r.year === year &&
        r.period === period,
    )?.value ?? null
  );
}

// ±0.2pp threshold: BLS LAUS county-level monthly revisions typically swing
// ±0.1pp (BLS LAUS methodology). 0.2pp exceeds revision noise so direction
// calls are not revision-driven. Use strict inequality (>0.2 = directional).
function yoyDelta(current: number | null, prior: number | null): number | null {
  if (current == null || prior == null) return null;
  return Math.round((current - prior) * 10) / 10;
}

function buildCountyMetrics(
  rows: DbRow[],
  fips: string,
  refYear: number,
  refPeriod: string,
  priorYear: number,
  priorPeriod: string,
): LausCountyMetrics {
  const rate = getMeasure(rows, fips, "03", refYear, refPeriod);
  const lf = getMeasure(rows, fips, "06", refYear, refPeriod);
  const employed = getMeasure(rows, fips, "05", refYear, refPeriod);
  const priorRate = getMeasure(rows, fips, "03", priorYear, priorPeriod);

  return {
    unemployment_rate: rate,
    labor_force: lf,
    employed,
    unemployment_rate_yoy_delta: yoyDelta(rate, priorRate),
  };
}

function buildLausSwflSummary(rows: DbRow[]): LausSwflSummary {
  const leeRows = rows.filter((r) => r.area_fips === LEE_FIPS);
  const rateRows = leeRows.filter((r) => r.measure_code === "03");
  const ref = latestPeriod(rateRows);

  if (!ref) {
    return {
      kind: "laus-swfl-summary",
      reference_month: null,
      is_preliminary: false,
      fl_state: {
        unemployment_rate: null,
        labor_force: null,
        employed: null,
        unemployment_rate_yoy_delta: null,
      },
      lee_county: {
        unemployment_rate: null,
        labor_force: null,
        employed: null,
        unemployment_rate_yoy_delta: null,
      },
      collier_county: {
        unemployment_rate: null,
        labor_force: null,
        employed: null,
        unemployment_rate_yoy_delta: null,
      },
    };
  }

  const refYear = ref.year;
  const refPeriod = ref.period;

  // Prior-year same period for YoY delta
  const priorYear = refYear - 1;
  const priorPeriod = refPeriod;

  const isPrelim = rows.some(
    (r) =>
      r.year === refYear && r.period === refPeriod && r.footnote_codes === "P",
  );

  return {
    kind: "laus-swfl-summary",
    reference_month: `${refYear}-${refPeriod}`,
    is_preliminary: isPrelim,
    fl_state: buildCountyMetrics(
      rows,
      FL_FIPS,
      refYear,
      refPeriod,
      priorYear,
      priorPeriod,
    ),
    lee_county: buildCountyMetrics(
      rows,
      LEE_FIPS,
      refYear,
      refPeriod,
      priorYear,
      priorPeriod,
    ),
    collier_county: buildCountyMetrics(
      rows,
      COLLIER_FIPS,
      refYear,
      refPeriod,
      priorYear,
      priorPeriod,
    ),
  };
}

// ── Live fetch ─────────────────────────────────────────────────────────────────

const COLS =
  "series_id,area_fips,measure_code,measure_label,year,period,period_name," +
  "value,footnote_codes,_ingested_at";

async function fetchLive(): Promise<DbRow[]> {
  const sb = getSupabase().schema(SCHEMA);

  // Log FIPS values at debug level — FIPS mismatch is the primary phantom-data
  // bug class in this pipeline. An explicit log makes it catchable without a
  // full Supabase query audit.
  console.debug(
    `[bls-laus-source] querying area_fips IN (${FL_FIPS}, ${LEE_FIPS}, ${COLLIER_FIPS})`,
  );

  const [flResp, leeResp, collierResp] = await Promise.all([
    sb
      .from(TABLE)
      .select(COLS)
      .eq("area_fips", FL_FIPS)
      .in("measure_code", ["03", "04", "05", "06"])
      .order("year")
      .order("period"),
    sb
      .from(TABLE)
      .select(COLS)
      .eq("area_fips", LEE_FIPS)
      .in("measure_code", ["03", "04", "05", "06"])
      .order("year")
      .order("period"),
    sb
      .from(TABLE)
      .select(COLS)
      .eq("area_fips", COLLIER_FIPS)
      .in("measure_code", ["03", "04", "05", "06"])
      .order("year")
      .order("period"),
  ]);

  if (flResp.error)
    throw new Error(
      `bls-laus-source: FL query failed — ${flResp.error.message}`,
    );
  if (leeResp.error)
    throw new Error(
      `bls-laus-source: Lee query failed — ${leeResp.error.message}`,
    );
  if (collierResp.error)
    throw new Error(
      `bls-laus-source: Collier query failed — ${collierResp.error.message}`,
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

export const blsLausSource: SourceConnector = {
  source_id: SOURCE_ID,
  trust_tier: 1,

  async fetch(): Promise<RawFragment[]> {
    const rows =
      env.source === "fixture" ? await loadFixture() : await fetchLive();

    const fetched_at = isoTimestamp();
    const summary = buildLausSwflSummary(rows);

    return [
      {
        fragment_id: fragmentId(SOURCE_ID, "laus-swfl-summary"),
        source_id: SOURCE_ID,
        source_trust_tier: 1,
        fetched_at,
        raw: {
          reference_month: summary.reference_month,
          is_preliminary: summary.is_preliminary,
        },
        normalized: summary,
      },
    ];
  },

  citationMeta(verifiedDate, ttlSeconds): Omit<CitationRow, "id"> {
    const isLive = env.source !== "fixture";
    // Series prefixes: FL=LAUST12, Lee=LAUCN12071, Collier=LAUCN12021
    return {
      source: isLive
        ? `BLS Local Area Unemployment Statistics (LAUS) via data_lake.bls_laus (${API_BASE}; series prefixes LAUST12, LAUCN12071, LAUCN12021; measures 03/04/05/06; monthly, not seasonally adjusted)`
        : `BLS LAUS (fixture; bls-laus.sample.json, 168 rows)`,
      verified: verifiedDate,
      expires: expiresDate(verifiedDate, ttlSeconds),
    };
  },
};

// ── Smoke-test entry point ─────────────────────────────────────────────────────
// Windows PowerShell: $env:REFINERY_SOURCE="fixture"; npx tsx refinery/sources/bls-laus-source.mts
// bash/zsh:           REFINERY_SOURCE=fixture npx tsx refinery/sources/bls-laus-source.mts

if (
  process.argv[1] &&
  import.meta.url.endsWith(path.basename(process.argv[1]))
) {
  blsLausSource.fetch().then((fragments) => {
    const summary = fragments.find(
      (f) => (f.normalized as { kind?: string }).kind === "laus-swfl-summary",
    );
    console.log(JSON.stringify(summary?.normalized ?? null, null, 2));
    console.log(`\nTotal fragments: ${fragments.length}`);
  });
}
