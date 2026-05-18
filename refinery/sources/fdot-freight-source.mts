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
 * pre-computes a per-segment annualized FREIGHT ACTIVITY proxy using the
 * locked AADT-→-activity conversion (see `activityFromAadt()`) so the consuming
 * pack reads a small set of normalized fragments rather than re-running the math.
 *
 * Sibling of `fdot-source.mts`. That connector exists for the
 * `traffic-swfl` brain (corridor-demand reads). This connector exists for the
 * `logistics-swfl-nowcast` brain (freight-activity deviation reads). The two
 * share the underlying table but apply DIFFERENT filters and emit DIFFERENT
 * fragment shapes — keeping them separated avoids loading one brain's worth of
 * cohort math when the other brain runs.
 *
 * Trust tier: 2 (state-published; same as fdot-source).
 *
 * Filter (live): `roadway LIKE 'I-%' OR roadway LIKE 'US-%'` for counties Lee +
 * Collier, year_ = LATEST_FDOT_YEAR. Tier 2 has annual AADT only — the "daily"
 * cadence the nowcast brain uses is synthetic. This limitation is surfaced in
 * the pack's caveats.
 *
 * UNITS DISCIPLINE (Path B refactor 2026-05-18, post-commit 297ad23):
 * `activityFromAadt` deliberately omits the segment length factor. The v1
 * design multiplied by `(shape_length_m / METERS_PER_MILE)` which turned the
 * value into ton-MILES/year and made the deviation math comparable to the
 * FAF5 baseline (tons/year) only by accident. Path B drops the miles factor:
 * the connector emits TONS crossing each segment per year, summed over the
 * corpus. This over-counts pass-through traffic (one truck traversing five
 * segments contributes to five segment-counts) but at least keeps units in
 * the tons family. The downstream brain compares THIS quantity against its
 * own rolling history — not against FAF5 — so the over-count is constant
 * across days and cancels in the z-score.
 *
 * Shock log: a SECOND live read pulls the last N rows of
 * `data_lake.fdot_freight_nowcast_shock_log` so the brain can compute its
 * consecutive-day breach counter AND its rolling-mean / rolling-stddev baseline.
 * The shock-log read is wrapped in a tolerant try/catch because the table is
 * brand-new (Lane 2D ships its DDL alongside this connector) — on first run
 * before the table exists the connector returns an empty log array and the
 * brain treats this as a cold start (suppresses z, emits insufficient_history
 * caveat).
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

/** Convert meters to miles. Retained for reference; Path B no longer uses
 * segment length in the activity math (see header comment), but the constant
 * stays exported in case a future v2 brain wants ton-mile reads. */
export const METERS_PER_MILE = 1609.344;

/**
 * (Retired in Path B 2026-05-18.) Coefficient of variation that v1 applied to
 * the FAF5 baseline_mu to derive baseline_sigma. Kept exported so legacy tests
 * + downstream packs that still reference the constant keep compiling. Path B
 * derives baseline_sigma from FDOT's own rolling history (not from a fixed CoV
 * applied to FAF5), so this value no longer participates in the deviation math.
 * Leave the value at 0.10 for documentation purposes.
 */
export const BASELINE_COEFFICIENT_OF_VARIATION = 0.1;

/** Number of prior shock-log rows the connector pulls. The brain needs the
 * last ~90 for the rolling baseline (mean + stddev) AND the consecutive-day
 * breach counter — pull a tiny safety margin (120) so the rolling window has
 * room to grow without bumping the pull count again. */
const SHOCK_LOG_PULL_COUNT = 120;

const FIXTURE_PATH = path.join(
  process.cwd(),
  "refinery",
  "__fixtures__",
  "logistics-swfl-nowcast.sample.json",
);

/** One freight-coded segment, with the per-segment annualized activity proxy
 * already computed by the connector (so the pack is a thin reader). */
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
  /**
   * TONS per year crossing this segment — AADT × tfctr × payload × 365.
   * Deliberately omits segment length (Path B refactor): the downstream brain
   * compares the corpus sum against its own rolling history, not against FAF5,
   * so unit-purity vs FAF5 is no longer the goal. See connector header for
   * the full rationale on the unit discipline.
   */
  activity_tons_per_year: number;
}

/** One row of the shock log (mutable Tier 2 state, see DDL header). */
export interface ShockLogRow {
  kind: "fdot-freight-shock-log";
  refined_at: string;
  deviation_z: number | null;
  shock_state:
    | "normal"
    | "anomaly"
    | "structural_break"
    | "insufficient_history";
  baseline_validity_flag?: "valid" | "stale-structural";
  /**
   * The CURRENT-RUN activity value (tons/year) the brain computed and logged
   * on that day. Path B reads the last N rows of this column to build the
   * rolling mean + rolling stddev that anchor the deviation z-score. NULL on
   * cold-start rows (no current_activity to log because there wasn't enough
   * history to compute a deviation in the first place — preserves append-only
   * monotonicity without poisoning the rolling stats).
   */
  current_activity_tons_year: number | null;
}

/**
 * Locked formula (TypeScript-typed, unit-tested). Pure function. Returns
 * annualized TONS crossing a segment (`AADT × tfctr × payload × 365`).
 *
 * Path B refactor (2026-05-18): the v1 `tonsFromAadt` multiplied by segment
 * length to produce ton-miles, which mismatched FAF5's tons/year baseline.
 * Path B drops the miles factor and renames the function so the units are
 * honest. Downstream comparison is FDOT-vs-FDOT-history, not FDOT-vs-FAF5.
 */
export function activityFromAadt(opts: {
  aadt: number;
  tfctr: number;
  payload?: number;
}): number {
  const payload = opts.payload ?? AVG_PAYLOAD_TONS_PER_TRUCK;
  return opts.aadt * opts.tfctr * payload * 365;
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
  deviation_z: number | null;
  shock_state:
    | "normal"
    | "anomaly"
    | "structural_break"
    | "insufficient_history";
  baseline_validity_flag?: "valid" | "stale-structural";
  current_activity_tons_year?: number | null;
}

interface PriorShockLogGenerator {
  kind: "consecutive_breaches";
  count: number;
  z: number;
  /** Optional — synthetic activity value to seed each generated row's
   * `current_activity_tons_year`. Path B uses this to build a clean rolling
   * baseline against which the current-run activity is compared. If unset,
   * the generated rows leave current_activity_tons_year unset (rolling stats
   * fall through to empty). */
  current_activity_tons_year?: number;
  end_date: string;
}

interface PriorShockLogHistoryGenerator {
  /** Build N rows of synthetic in-band history so the rolling baseline has
   * enough samples to clear the cold-start threshold. All rows are in-band
   * (deviation_z in ±2, shock_state = "normal", flag = "valid"). The current
   * activity values are drawn from a tight band around `base_activity` with
   * spread `±spread_pct` percent — the brain computes mean ≈ base_activity
   * and a small but non-zero stddev. */
  kind: "in_band_history";
  count: number;
  base_activity: number;
  spread_pct: number;
  end_date: string;
}

interface FixtureScenario {
  segments: FixtureSegment[];
  prior_shock_log?: PriorShockLogEntry[];
  prior_shock_log_generator?: PriorShockLogGenerator;
  /**
   * Path B: synthetic in-band history that clears the cold-start threshold.
   * Composes with `prior_shock_log_generator` — the history is prepended (older
   * dates) so the consecutive-breach generator still anchors to the tail. */
  prior_shock_log_history?: PriorShockLogHistoryGenerator;
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
 * Build the synthetic prior-shock-log for a fixture scenario.
 *
 * Three composable shapes (each optional, can stack):
 *   1. `prior_shock_log`            — literal array of explicit rows.
 *   2. `prior_shock_log_history`    — N synthetic in-band rows around a
 *                                     base activity value (clears cold-start).
 *   3. `prior_shock_log_generator`  — N consecutive breach rows ending at
 *                                     `end_date`.
 *
 * When multiple shapes are present the order is: history (oldest), then
 * literal entries, then generator (newest). This is the natural order the
 * brain's rolling-stats and breach-counter logic want to see.
 */
function buildPriorShockLog(scenario: FixtureScenario): ShockLogRow[] {
  const rows: ShockLogRow[] = [];

  // 1. Synthetic in-band history (oldest segment of the log).
  const history = scenario.prior_shock_log_history;
  if (history) {
    const endMs = Date.parse(history.end_date);
    // History sits BEFORE the generator's window — push it back by
    // (history.count + generator.count) days from end_date when generator is
    // present, otherwise just history.count days.
    const genCount = scenario.prior_shock_log_generator?.count ?? 0;
    const totalOffsetDays = history.count + genCount;
    for (let i = 0; i < history.count; i++) {
      const offsetDays = totalOffsetDays - i;
      const ts = new Date(endMs - offsetDays * 86_400_000).toISOString();
      // Deterministic pseudo-random jitter in ±spread_pct around base_activity.
      // Use a simple hash on i so values vary without needing crypto/random.
      const jitter = (((i * 9301 + 49297) % 233280) / 233280 - 0.5) * 2; // [-1, 1)
      const activity =
        history.base_activity * (1 + (jitter * history.spread_pct) / 100);
      rows.push({
        kind: "fdot-freight-shock-log",
        refined_at: ts,
        deviation_z: jitter * 2, // in ±2, well inside |z|<=3
        shock_state: "normal",
        baseline_validity_flag: "valid",
        current_activity_tons_year: activity,
      });
    }
  }

  // 2. Literal log entries.
  if (scenario.prior_shock_log && scenario.prior_shock_log.length > 0) {
    for (const e of scenario.prior_shock_log) {
      rows.push({
        kind: "fdot-freight-shock-log",
        refined_at: e.refined_at,
        deviation_z: e.deviation_z,
        shock_state: e.shock_state,
        baseline_validity_flag: e.baseline_validity_flag,
        current_activity_tons_year:
          e.current_activity_tons_year === undefined
            ? null
            : e.current_activity_tons_year,
      });
    }
  }

  // 3. Consecutive-breach generator (newest, immediately precedes the CURRENT run).
  const gen = scenario.prior_shock_log_generator;
  if (gen) {
    const endMs = Date.parse(gen.end_date);
    for (let i = 0; i < gen.count; i++) {
      const ts = new Date(endMs - (gen.count - i) * 86_400_000).toISOString();
      rows.push({
        kind: "fdot-freight-shock-log",
        refined_at: ts,
        deviation_z: gen.z,
        shock_state: "anomaly",
        baseline_validity_flag: "valid",
        current_activity_tons_year: gen.current_activity_tons_year ?? null,
      });
    }
  }

  // Final guarantee: rows are sorted oldest-first by refined_at so the brain's
  // rolling-window read (last N) walks the correct end of the array.
  rows.sort((a, b) => Date.parse(a.refined_at) - Date.parse(b.refined_at));
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
      .select(
        "refined_at,deviation_z,shock_state,baseline_validity_flag,current_activity_tons_year",
      )
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
      shock_state:
        | "normal"
        | "anomaly"
        | "structural_break"
        | "insufficient_history";
      baseline_validity_flag?: "valid" | "stale-structural";
      current_activity_tons_year: number | null;
    }>;
    // Connector returns the log in OLDEST-FIRST order (matches the fixture
    // builder's contract) — Supabase returned DESC for limit efficiency, so
    // reverse before returning.
    return rows
      .map(
        (r): ShockLogRow => ({
          kind: "fdot-freight-shock-log",
          refined_at: r.refined_at,
          deviation_z: r.deviation_z,
          shock_state: r.shock_state,
          baseline_validity_flag: r.baseline_validity_flag,
          current_activity_tons_year: r.current_activity_tons_year,
        }),
      )
      .reverse();
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
      // shape_length is no longer used by the activity formula (Path B), but
      // the live SegmentRow still carries it for provenance — drop the
      // shape-length validity gate so the connector doesn't silently drop
      // segments with missing geometry. Keep the tfctr null-check (a missing
      // truck-factor genuinely invalidates the activity computation).
      if (tfctr == null) continue;
      const activity = activityFromAadt({ aadt: row.aadt, tfctr });
      const normalized: FreightSegmentNormalized = {
        kind: "fdot-freight-segment",
        county: row.county,
        year: row.year_,
        roadway: row.roadway,
        desc_frm: row.desc_frm,
        desc_to: row.desc_to,
        aadt: row.aadt,
        tfctr,
        shape_length_m: shapeLen ?? 0,
        activity_tons_per_year: activity,
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
          ? `FDOT freight-coded segments (fixture; ${SCHEMA}.${TABLE}, counties ${BRAIN_COUNTIES.join("+")}, year ${LATEST_FDOT_YEAR}, roadways I-* + US-* only) plus prior shock-log activity history — ${liveUrl}`
          : `FDOT freight-coded segments via ${SCHEMA}.${TABLE} (dlt-ingested from FDOT FTO_PROD/MapServer/7; counties ${BRAIN_COUNTIES.join("+")}, year ${LATEST_FDOT_YEAR}, roadways I-* + US-* only) plus the last ${SHOCK_LOG_PULL_COUNT} rows of ${SCHEMA}.${SHOCK_LOG_TABLE} — ${liveUrl}`,
      verified: verifiedDate,
      expires: expiresDate(verifiedDate, ttlSeconds),
    };
  },
};
