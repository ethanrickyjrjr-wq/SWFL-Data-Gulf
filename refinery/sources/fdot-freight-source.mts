import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { env } from "../config/env.mts";
import { getSupabase } from "./supabase.mts";
import { fragmentId } from "../lib/ids.mts";
import { isoTimestamp, expiresDate } from "../lib/dates.mts";

/**
 * fdot-freight source connector — freight-coded subset of data_lake.fdot_aadt_fl
 * (interstates + US routes for Lee + Collier, latest year). The connector
 * pre-computes per-segment annualized freight tonnage using the locked AADT-→-tons
 * conversion (see `tonsFromAadt()`) so the consuming pack reads a small set of
 * normalized fragments rather than re-running the math.
 *
 * Sibling of `fdot-source.mts`. That connector exists for the
 * `traffic-swfl` brain (corridor-demand reads). This connector exists for the
 * `logistics-swfl-nowcast` brain (freight-tonnage deviation reads). The two
 * share the underlying table but apply DIFFERENT filters and emit DIFFERENT
 * fragment shapes — keeping them separated avoids loading one brain's worth of
 * cohort math when the other brain runs.
 *
 * Trust tier: 2 (state-published; same as fdot-source).
 *
 * Filter (live): `roadway LIKE 'I-%' OR roadway LIKE 'US-%'` for counties Lee +
 * Collier, year_ = LATEST_FDOT_YEAR. Tier 2 has annual AADT only — the "daily"
 * cadence the nowcast brain uses is synthetic (`tons_per_year ÷ 365`). This
 * limitation is surfaced in the pack's caveats.
 *
 * Shock log: a SECOND live read pulls the last N rows of
 * `data_lake.fdot_freight_nowcast_shock_log` so the brain can compute its
 * consecutive-day breach counter. The shock-log read is wrapped in a tolerant
 * try/catch because the table is brand-new (Lane 2D ships its DDL alongside
 * this connector) — on first run before the table exists the connector returns
 * an empty log array and the brain treats this as a cold start.
 */

const SOURCE_ID = "fdot_freight_swfl";
const SCHEMA = "data_lake";
const TABLE = "fdot_aadt_fl";
const SHOCK_LOG_TABLE = "fdot_freight_nowcast_shock_log";

/** Latest published FDOT AADT year — kept in sync with fdot-source.mts. */
export const LATEST_FDOT_YEAR = 2025;

/** Brain scope: Lee + Collier. The nowcast does NOT include Charlotte (that's
 * traffic-swfl's storm exception, not a freight-flow scope decision). */
const BRAIN_COUNTIES = ["LEE", "COLLIER"] as const;

/**
 * Average payload per truck (tons). FHWA Highway Statistics 2023, Table VM-1
 * (Functional System Travel — Annual Vehicle Distance Traveled). Combination-
 * truck average payload ≈ 16 tons. This is the ONE fabrication-prone number in
 * the conversion — every other input (AADT, tfctr, shape_length) lives on the
 * fragment. The constant is captured here so a sourced citation lives next to
 * the value, and a single grep finds it for future updates.
 *
 * Source: https://www.fhwa.dot.gov/policyinformation/statistics/2023/vm1.cfm
 */
export const AVG_PAYLOAD_TONS_PER_TRUCK = 16.0;

/** Convert meters to miles. shape_length on FDOT segments is in meters
 * (auto-generated from the layer geometry in the EPSG projection FDOT uses). */
const METERS_PER_MILE = 1609.344;

/** Coefficient of variation applied to baseline_mu to derive baseline_sigma.
 * 0.10 default per FHWA FAF5 §3.2 freight-flow uncertainty bands — published
 * confidence intervals for FAF flow estimates run ~±10% at the zone-pair level
 * for inbound domestic. Exposed for tests + the brain's deviation math. */
export const BASELINE_COEFFICIENT_OF_VARIATION = 0.1;

/** Number of prior shock-log rows the connector pulls. The brain only needs
 * the last ~90 to compute the 90-day rolling consecutive-breach counter — pull
 * a tiny safety margin (100) so the math is robust to an extra reading or two. */
const SHOCK_LOG_PULL_COUNT = 100;

const FIXTURE_PATH = path.join(
  process.cwd(),
  "refinery",
  "__fixtures__",
  "logistics-swfl-nowcast.sample.json",
);

/** One freight-coded segment, with the per-segment annualized tonnage already
 * computed by the connector (so the pack is a thin reader). */
export interface FreightSegmentNormalized {
  kind: "fdot-freight-segment";
  county: string;
  year: number;
  roadway: string;
  desc_frm: string;
  desc_to: string;
  aadt: number;
  tfctr: number;
  shape_length_m: number;
  tons_per_year: number;
}

/** One row of the shock log (mutable Tier 2 state, see DDL header). */
export interface ShockLogRow {
  kind: "fdot-freight-shock-log";
  refined_at: string;
  deviation_z: number | null;
  shock_state: "normal" | "anomaly" | "structural_break";
  baseline_validity_flag?: "valid" | "stale-structural";
}

/** Locked formula (TypeScript-typed, unit-tested). Pure function. */
export function tonsFromAadt(opts: {
  aadt: number;
  tfctr: number;
  shape_length_m: number;
  payload?: number;
}): number {
  const payload = opts.payload ?? AVG_PAYLOAD_TONS_PER_TRUCK;
  return (
    opts.aadt *
    opts.tfctr *
    payload *
    365 *
    (opts.shape_length_m / METERS_PER_MILE)
  );
}

/** Raw segment row from data_lake.fdot_aadt_fl (subset used by this connector). */
interface SegmentRow {
  year_: number;
  county: string;
  roadway: string;
  desc_frm: string;
  desc_to: string;
  aadt: number;
  tfctr: number | null;
  shape_length: number | null;
}

interface FixtureSegment {
  year_: number;
  county: string;
  roadway: string;
  desc_frm: string;
  desc_to: string;
  aadt: number;
  tfctr: number;
  shape_length: number;
}

interface PriorShockLogEntry {
  refined_at: string;
  deviation_z: number;
  shock_state: "normal" | "anomaly" | "structural_break";
  baseline_validity_flag?: "valid" | "stale-structural";
}

interface PriorShockLogGenerator {
  kind: "consecutive_breaches";
  count: number;
  z: number;
  end_date: string;
}

interface FixtureScenario {
  segments: FixtureSegment[];
  prior_shock_log?: PriorShockLogEntry[];
  prior_shock_log_generator?: PriorShockLogGenerator;
}

interface FixtureShape {
  scenarios: Record<string, FixtureScenario>;
}

function isFreightRoadway(roadway: string): boolean {
  // Freight-coded segments are the interstates + US routes. State + county
  // roads carry local traffic that's mostly NOT in the FAF5 baseline scope.
  return /^I-/.test(roadway) || /^US-/.test(roadway);
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Build the synthetic prior-shock-log for a fixture scenario. Either reads the
 * `prior_shock_log` literal array, or expands the `prior_shock_log_generator`
 * into N consecutive breach rows ending at `end_date`. The 30d/90d scenarios
 * use the generator so fixture JSON stays readable.
 */
function buildPriorShockLog(scenario: FixtureScenario): ShockLogRow[] {
  if (scenario.prior_shock_log && scenario.prior_shock_log.length > 0) {
    return scenario.prior_shock_log.map(
      (e): ShockLogRow => ({
        kind: "fdot-freight-shock-log",
        refined_at: e.refined_at,
        deviation_z: e.deviation_z,
        shock_state: e.shock_state,
        baseline_validity_flag: e.baseline_validity_flag,
      }),
    );
  }
  const gen = scenario.prior_shock_log_generator;
  if (!gen) return [];
  const endMs = Date.parse(gen.end_date);
  const rows: ShockLogRow[] = [];
  // Generator builds `count` consecutive prior days ending one day before
  // end_date — the brain's CURRENT run becomes the next day in the chain.
  for (let i = 0; i < gen.count; i++) {
    const ts = new Date(endMs - (gen.count - i) * 86_400_000).toISOString();
    rows.push({
      kind: "fdot-freight-shock-log",
      refined_at: ts,
      deviation_z: gen.z,
      shock_state: "normal",
      baseline_validity_flag: "valid",
    });
  }
  return rows;
}

async function loadFixture(): Promise<{
  scenario: FixtureScenario;
  scenarioName: string;
}> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  const data = JSON.parse(raw) as FixtureShape;
  const scenarioName = process.env["REFINERY_FIXTURE_SCENARIO"] ?? "nominal";
  const scenario = data.scenarios[scenarioName];
  if (!scenario) {
    const known = Object.keys(data.scenarios).join(", ");
    throw new Error(
      `fdot-freight-source: fixture scenario "${scenarioName}" not found. Known scenarios: ${known}`,
    );
  }
  return { scenario, scenarioName };
}

/**
 * Helper extracted from fetchLive so it can be unit-tested without standing up
 * a Supabase mock. Throws when the live query returns no rows (almost always
 * means the dlt pipeline did not run, or the freight-coded filter rejected
 * everything — both surface here, not as a silent zero).
 */
export function assertSegmentsNonEmpty(segments: SegmentRow[]): void {
  if (segments.length > 0) return;
  throw new Error(
    `fdot-freight-source: ${SCHEMA}.${TABLE} returned 0 freight-coded rows for counties=${BRAIN_COUNTIES.join(",")} year=${LATEST_FDOT_YEAR}. ` +
      "Confirm the dlt pipeline ran (python -m ingest.pipelines.fdot.pipeline) and that docs/sql/fdot_aadt_fl_grant.sql was applied (service_role needs SELECT on data_lake.fdot_aadt_fl). " +
      "Also check that freight-coded roadways (I-* / US-*) are actually present in the table — county roads alone won't pass the connector filter.",
  );
}

async function fetchLiveSegments(): Promise<SegmentRow[]> {
  const sb = getSupabase().schema(SCHEMA);
  // Pre-filter by counties + year; freight-roadway filter applied in TS
  // because Postgres' LIKE on a bigint-shaped roadway column would need a cast
  // (`roadway::text LIKE 'I-%'`) that supabase-js doesn't expose ergonomically.
  // The set is small (<1k segments per county) so the TS filter is cheap.
  const resp = await sb
    .from(TABLE)
    .select("year_,county,roadway,desc_frm,desc_to,aadt,tfctr,shape_length")
    .in("county", [...BRAIN_COUNTIES])
    .eq("year_", LATEST_FDOT_YEAR)
    .not("aadt", "is", null)
    .limit(10000);
  if (resp.error) {
    throw new Error(
      `fdot-freight-source: ${SCHEMA}.${TABLE} query failed — ${resp.error.message}`,
    );
  }
  const rows = (resp.data ?? []) as SegmentRow[];
  const freight = rows.filter(
    (r) => typeof r.roadway === "string" && isFreightRoadway(r.roadway),
  );
  assertSegmentsNonEmpty(freight);
  return freight;
}

async function fetchLiveShockLog(): Promise<ShockLogRow[]> {
  // Tolerant — the shock-log table is freshly minted in Lane 2D. On the very
  // first deploy before the DDL is applied this read errors; we treat it as a
  // cold start and let the brain see an empty log.
  try {
    const sb = getSupabase().schema(SCHEMA);
    const resp = await sb
      .from(SHOCK_LOG_TABLE)
      .select("refined_at,deviation_z,shock_state,baseline_validity_flag")
      .order("refined_at", { ascending: false })
      .limit(SHOCK_LOG_PULL_COUNT);
    if (resp.error) {
      console.warn(
        `[fdot-freight-source] shock-log read returned an error (${resp.error.message}); treating as cold start.`,
      );
      return [];
    }
    const rows = (resp.data ?? []) as Array<{
      refined_at: string;
      deviation_z: number | null;
      shock_state: "normal" | "anomaly" | "structural_break";
      baseline_validity_flag?: "valid" | "stale-structural";
    }>;
    return rows.map(
      (r): ShockLogRow => ({
        kind: "fdot-freight-shock-log",
        refined_at: r.refined_at,
        deviation_z: r.deviation_z,
        shock_state: r.shock_state,
        baseline_validity_flag: r.baseline_validity_flag,
      }),
    );
  } catch (err) {
    console.warn(
      `[fdot-freight-source] shock-log read threw (${(err as Error).message}); treating as cold start.`,
    );
    return [];
  }
}

export const fdotFreightSegmentsSource: SourceConnector = {
  source_id: SOURCE_ID,
  trust_tier: 2,
  async fetch(): Promise<RawFragment[]> {
    const fetched_at = isoTimestamp();
    const fragments: RawFragment[] = [];

    let segmentRows: SegmentRow[];
    let shockLog: ShockLogRow[];

    if (env.source === "fixture") {
      const { scenario } = await loadFixture();
      segmentRows = scenario.segments
        .filter((s) => isFreightRoadway(s.roadway))
        .map(
          (s): SegmentRow => ({
            year_: s.year_,
            county: s.county,
            roadway: s.roadway,
            desc_frm: s.desc_frm,
            desc_to: s.desc_to,
            aadt: s.aadt,
            tfctr: s.tfctr,
            shape_length: s.shape_length,
          }),
        );
      shockLog = buildPriorShockLog(scenario);
    } else {
      [segmentRows, shockLog] = await Promise.all([
        fetchLiveSegments(),
        fetchLiveShockLog(),
      ]);
    }

    for (const row of segmentRows) {
      const tfctr = toNum(row.tfctr);
      const shapeLen = toNum(row.shape_length);
      if (tfctr == null || shapeLen == null || shapeLen <= 0) continue;
      const tons = tonsFromAadt({
        aadt: row.aadt,
        tfctr,
        shape_length_m: shapeLen,
      });
      const normalized: FreightSegmentNormalized = {
        kind: "fdot-freight-segment",
        county: row.county,
        year: row.year_,
        roadway: row.roadway,
        desc_frm: row.desc_frm,
        desc_to: row.desc_to,
        aadt: row.aadt,
        tfctr,
        shape_length_m: shapeLen,
        tons_per_year: tons,
      };
      fragments.push({
        fragment_id: fragmentId(
          SOURCE_ID,
          `${row.county.toLowerCase()}-${row.roadway}-${row.desc_frm}-${row.desc_to}-${row.year_}`,
        ),
        source_id: SOURCE_ID,
        source_trust_tier: 2,
        fetched_at,
        raw: { ...row } as Record<string, unknown>,
        normalized,
      });
    }

    for (const entry of shockLog) {
      fragments.push({
        fragment_id: fragmentId(SOURCE_ID, `shock-${entry.refined_at}`),
        source_id: SOURCE_ID,
        source_trust_tier: 2,
        fetched_at,
        raw: { ...entry } as Record<string, unknown>,
        normalized: entry,
      });
    }

    return fragments;
  },
  citationMeta(verifiedDate, ttlSeconds): Omit<CitationRow, "id"> {
    const liveUrl =
      env.source === "live" && env.supabaseUrl
        ? `${env.supabaseUrl}/rest/v1/${TABLE}?select=year_,county,roadway,desc_frm,desc_to,aadt,tfctr,shape_length&county=in.(${BRAIN_COUNTIES.join(",")})&year_=eq.${LATEST_FDOT_YEAR}`
        : `fixture://refinery/__fixtures__/logistics-swfl-nowcast.sample.json`;
    return {
      source:
        env.source === "fixture"
          ? `FDOT freight-coded segments (fixture; ${SCHEMA}.${TABLE}, counties ${BRAIN_COUNTIES.join("+")}, year ${LATEST_FDOT_YEAR}, roadways I-* + US-* only) plus prior shock-log entries — ${liveUrl}`
          : `FDOT freight-coded segments via ${SCHEMA}.${TABLE} (dlt-ingested from FDOT FTO_PROD/MapServer/7; counties ${BRAIN_COUNTIES.join("+")}, year ${LATEST_FDOT_YEAR}, roadways I-* + US-* only) plus the last ${SHOCK_LOG_PULL_COUNT} rows of ${SCHEMA}.${SHOCK_LOG_TABLE} — ${liveUrl}`,
      verified: verifiedDate,
      expires: expiresDate(verifiedDate, ttlSeconds),
    };
  },
};
