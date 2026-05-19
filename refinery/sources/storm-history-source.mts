import path from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { env } from "../config/env.mts";
import { fragmentId } from "../lib/ids.mts";
import { isoTimestamp, expiresDate } from "../lib/dates.mts";

/**
 * storm-history-source — NOAA Storm Events Database for SWFL (Lee, Collier,
 * Charlotte counties), 1996-2025 modern-schema vintage.
 *
 * Reads directly from a Parquet file in Tier 1 Supabase Storage via DuckDB
 * httpfs. The Python ingest pipeline (ingest/duckdb_pipelines/storm_history_swfl)
 * already pre-filtered to SWFL counties and FLORIDA state, so this connector
 * only re-aggregates per-county totals + corpus-level rollups.
 *
 * Trust tier: 1 (NOAA / NCEI is the federal primary source for storm events).
 *
 * Two modes via env.source:
 *   - "fixture": reads refinery/__fixtures__/storm-history-swfl.sample.parquet
 *     (91 rows, 2022-2024 — captures Hurricane Ian on 2022-09-28). No creds needed.
 *   - "live": reads s3://lake-tier1/environmental/storm_events_swfl.parquet
 *     (1,178 rows, 1996-2025). Requires SUPABASE_S3_* creds.
 *
 * NOAA columns are UPPERCASE in the source Parquet (STATE, CZ_NAME, EVENT_TYPE,
 * MAGNITUDE, DAMAGE_PROPERTY, BEGIN_DATE_TIME); we lowercase them in TS handling.
 *
 * Aggregate shapes:
 *   - StormPerCountyAggregate: per-county counts for the 3 SWFL counties.
 *   - StormCorpusSummary: SWFL-wide rollup + last billion-dollar event.
 */

const SOURCE_ID = "noaa_storm_events_swfl";
const BUCKET = "lake-tier1";
const PARQUET_PATH = "environmental/storm_events_swfl.parquet";
const PARQUET_S3_URL = `s3://${BUCKET}/${PARQUET_PATH}`;
const PARQUET_DASHBOARD_URL = `https://supabase.com/dashboard/project/_/storage/buckets/${BUCKET}?path=${PARQUET_PATH}`;

const FIXTURE_PATH = path.resolve(
  import.meta.dirname,
  "..",
  "__fixtures__",
  "storm-history-swfl.sample.parquet",
);

const SWFL_COUNTIES = ["LEE", "COLLIER", "CHARLOTTE"] as const;
const MAJOR_EVENT_TYPES = new Set([
  "Hurricane",
  "Tornado",
  "Flash Flood",
  "Storm Surge/Tide",
]);
const EXTREME_WIND_MAGNITUDE_KT = 74; // hurricane-force minimum
const MAJOR_STORM_DAMAGE_USD = 1_000_000;
const BILLION_DOLLAR_USD = 1_000_000_000;
const TEN_YEAR_MS = 10 * 365.25 * 24 * 60 * 60 * 1000;

/** Raw selected row shape coming back from DuckDB (lowercased keys). */
interface StormRow {
  event_type: string | null;
  magnitude: number | null;
  damage_property: string | null;
  begin_date_time: string | null;
  cz_name: string | null;
}

/** Per-county aggregate — one fragment per logical county in scope. */
export interface StormPerCountyAggregate {
  kind: "storm-per-county";
  county: string;
  /** Total events for this county over the full vintage (1996-2025). */
  total_storm_count: number;
  /** Events with parseable, non-zero property damage in the trailing 10yr window. */
  property_damage_event_count: number;
  /** Events with MAGNITUDE >= 74 kt in the trailing 10yr window (hurricane-force wind). */
  extreme_wind_event_count: number;
  /** Major storm count (full corpus): damage >= $1M AND event_type in MAJOR_EVENT_TYPES. */
  major_storm_count: number;
}

/** Corpus-level summary — one fragment for the whole SWFL footprint. */
export interface StormCorpusSummary {
  kind: "storm-corpus-summary";
  total_storm_count: number;
  vintage_start_year: number;
  vintage_end_year: number;
  /** ISO date (YYYY-MM-DD) of the most recent event with damage >= $1B. Null if none. */
  last_billion_dollar_event_date: string | null;
  /** Event type of the most recent billion-dollar event. Null if none. */
  last_billion_dollar_event_type: string | null;
  /** Count of rows where damage_property could not be parsed. */
  unparseable_damage_count: number;
  /** Counties with at least one event in scope, alphabetically sorted. */
  counties_covered: string[];
  /** Count of events per major event type across the full corpus. */
  major_event_type_counts: Record<string, number>;
}

/**
 * Parse NOAA damage_property strings like "1.5M", "10K", "2B", "500", "0".
 * Returns null for unparseable, empty, null inputs (caller skips them and
 * increments unparseable_damage_count).
 */
export function parseDamageString(raw: string | null): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([KMB]?)$/i);
  if (!match) return null;
  const base = parseFloat(match[1]);
  if (!Number.isFinite(base)) return null;
  const unit = match[2].toUpperCase();
  const mult =
    unit === "K"
      ? 1_000
      : unit === "M"
        ? 1_000_000
        : unit === "B"
          ? 1_000_000_000
          : 1;
  return base * mult;
}

/** Coerce DuckDB scalar (BigInt | number | string | null) to number | null. */
function toNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toStr(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  return String(v);
}

/**
 * Convert a NOAA BEGIN_DATE_TIME string to ISO date (YYYY-MM-DD).
 * NOAA format examples: "28-SEP-22 16:35:00", "09/28/2022 16:35:00".
 * Returns null if unparseable.
 */
export function parseNoaaDate(raw: string | null): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  // "DD-MON-YY HH:MM:SS" — NOAA's modern-schema default.
  const monthMap: Record<string, string> = {
    JAN: "01",
    FEB: "02",
    MAR: "03",
    APR: "04",
    MAY: "05",
    JUN: "06",
    JUL: "07",
    AUG: "08",
    SEP: "09",
    OCT: "10",
    NOV: "11",
    DEC: "12",
  };
  const m1 = trimmed.match(/^(\d{1,2})-([A-Z]{3})-(\d{2})\b/i);
  if (m1) {
    const day = m1[1].padStart(2, "0");
    const mon = monthMap[m1[2].toUpperCase()];
    if (!mon) return null;
    // 2-digit year — NOAA's 1996-2025 vintage means 96-99 -> 19xx, else 20xx.
    const yy = parseInt(m1[3], 10);
    const year = yy >= 96 ? 1900 + yy : 2000 + yy;
    return `${year}-${mon}-${day}`;
  }

  // "MM/DD/YYYY HH:MM:SS"
  const m2 = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (m2) {
    const mm = m2[1].padStart(2, "0");
    const dd = m2[2].padStart(2, "0");
    return `${m2[3]}-${mm}-${dd}`;
  }

  // ISO-ish fallback: just take the date portion if it starts with YYYY-MM-DD.
  const m3 = trimmed.match(/^(\d{4}-\d{2}-\d{2})\b/);
  if (m3) return m3[1];

  return null;
}

async function queryStormRows(): Promise<StormRow[]> {
  const isFixture = env.source === "fixture";
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();

  let target: string;
  if (isFixture) {
    target = FIXTURE_PATH.replace(/\\/g, "/");
  } else {
    // Require S3 creds before issuing the live query.
    const required = [
      "SUPABASE_S3_ENDPOINT",
      "SUPABASE_S3_ACCESS_KEY_ID",
      "SUPABASE_S3_SECRET_ACCESS_KEY",
    ];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length > 0) {
      throw new Error(
        `storm-history-source: missing required env var(s) for live mode: ${missing.join(", ")}. ` +
          "Set them in .env.local, or run with REFINERY_SOURCE=fixture for offline mode.",
      );
    }
    const endpointRaw = process.env["SUPABASE_S3_ENDPOINT"]!;
    const endpoint = endpointRaw.replace(/^https?:\/\//, "");
    const accessKey = process.env["SUPABASE_S3_ACCESS_KEY_ID"]!;
    const secretKey = process.env["SUPABASE_S3_SECRET_ACCESS_KEY"]!;

    await connection.run("INSTALL httpfs; LOAD httpfs;");
    // DuckDB SET statements accept single-quoted strings; the creds are env-loaded
    // and we never log them. Escape single quotes defensively.
    const esc = (s: string): string => s.replace(/'/g, "''");
    await connection.run(`
      SET s3_endpoint='${esc(endpoint)}';
      SET s3_access_key_id='${esc(accessKey)}';
      SET s3_secret_access_key='${esc(secretKey)}';
      SET s3_region='us-east-1';
      SET s3_url_style='path';
      SET s3_use_ssl=true;
    `);
    target = PARQUET_S3_URL;
  }

  const reader = await connection.runAndReadAll(
    `SELECT
       EVENT_TYPE AS event_type,
       MAGNITUDE AS magnitude,
       DAMAGE_PROPERTY AS damage_property,
       BEGIN_DATE_TIME AS begin_date_time,
       CZ_NAME AS cz_name
     FROM read_parquet('${target}')`,
  );
  const rowObjects = reader.getRowObjects();
  connection.closeSync();

  return rowObjects.map((r) => ({
    event_type: toStr(r["event_type"]),
    magnitude: toNum(r["magnitude"]),
    damage_property: toStr(r["damage_property"]),
    begin_date_time: toStr(r["begin_date_time"]),
    cz_name: toStr(r["cz_name"]),
  }));
}

interface AggregateBundle {
  perCounty: StormPerCountyAggregate[];
  corpus: StormCorpusSummary;
}

export function aggregateStormRows(
  rows: StormRow[],
  now: Date = new Date(),
): AggregateBundle {
  const tenYearsAgo = now.getTime() - TEN_YEAR_MS;

  // Per-county counters.
  const perCountyMap = new Map<
    string,
    {
      total: number;
      damage10yr: number;
      extremeWind10yr: number;
      majorAll: number;
    }
  >();
  for (const c of SWFL_COUNTIES) {
    perCountyMap.set(c, {
      total: 0,
      damage10yr: 0,
      extremeWind10yr: 0,
      majorAll: 0,
    });
  }

  let unparseableDamage = 0;
  let totalAll = 0;
  let earliestYear = Infinity;
  let latestYear = -Infinity;
  let lastBillionDate: string | null = null;
  let lastBillionType: string | null = null;
  const countiesCovered = new Set<string>();
  const majorEventTypeCounts: Record<string, number> = {};

  for (const row of rows) {
    const isoDate = parseNoaaDate(row.begin_date_time);
    if (isoDate) {
      const y = parseInt(isoDate.slice(0, 4), 10);
      if (Number.isFinite(y)) {
        if (y < earliestYear) earliestYear = y;
        if (y > latestYear) latestYear = y;
      }
    }
    const county = row.cz_name?.toUpperCase().trim() ?? null;
    if (county) countiesCovered.add(county);

    const damageRaw = row.damage_property;
    const damage = parseDamageString(damageRaw);
    // Only count unparseable when there was a non-null/non-empty input string.
    if (damageRaw != null && damageRaw.trim() !== "" && damage == null) {
      unparseableDamage += 1;
    }

    totalAll += 1;
    const eventType = row.event_type?.trim() ?? "";
    if (eventType !== "") {
      if (MAJOR_EVENT_TYPES.has(eventType)) {
        majorEventTypeCounts[eventType] =
          (majorEventTypeCounts[eventType] ?? 0) + 1;
      }
    }

    // Last billion-dollar event across the full corpus.
    if (
      damage != null &&
      damage >= BILLION_DOLLAR_USD &&
      isoDate != null &&
      (lastBillionDate == null || isoDate > lastBillionDate)
    ) {
      lastBillionDate = isoDate;
      lastBillionType = eventType !== "" ? eventType : null;
    }

    // Per-county increments.
    if (!county || !perCountyMap.has(county)) continue;
    const bucket = perCountyMap.get(county)!;
    bucket.total += 1;

    // Major storm: damage >= $1M AND major event type, full corpus.
    if (
      damage != null &&
      damage >= MAJOR_STORM_DAMAGE_USD &&
      MAJOR_EVENT_TYPES.has(eventType)
    ) {
      bucket.majorAll += 1;
    }

    // 10-year window checks need a parseable date.
    if (isoDate != null) {
      const ts = Date.parse(`${isoDate}T00:00:00Z`);
      if (Number.isFinite(ts) && ts >= tenYearsAgo) {
        if (damage != null && damage > 0) bucket.damage10yr += 1;
        if (
          row.magnitude != null &&
          row.magnitude >= EXTREME_WIND_MAGNITUDE_KT
        ) {
          bucket.extremeWind10yr += 1;
        }
      }
    }
  }

  const perCounty: StormPerCountyAggregate[] = SWFL_COUNTIES.map((c) => {
    const b = perCountyMap.get(c)!;
    return {
      kind: "storm-per-county",
      county: c,
      total_storm_count: b.total,
      property_damage_event_count: b.damage10yr,
      extreme_wind_event_count: b.extremeWind10yr,
      major_storm_count: b.majorAll,
    };
  });

  const corpus: StormCorpusSummary = {
    kind: "storm-corpus-summary",
    total_storm_count: totalAll,
    vintage_start_year: Number.isFinite(earliestYear) ? earliestYear : 0,
    vintage_end_year: Number.isFinite(latestYear) ? latestYear : 0,
    last_billion_dollar_event_date: lastBillionDate,
    last_billion_dollar_event_type: lastBillionType,
    unparseable_damage_count: unparseableDamage,
    counties_covered: [...countiesCovered].sort(),
    major_event_type_counts: majorEventTypeCounts,
  };

  return { perCounty, corpus };
}

export const stormHistorySource: SourceConnector = {
  source_id: SOURCE_ID,
  trust_tier: 1,
  async fetch(): Promise<RawFragment[]> {
    const rows = await queryStormRows();
    const fetched_at = isoTimestamp();
    const { perCounty, corpus } = aggregateStormRows(rows);

    const fragments: RawFragment[] = [];
    for (const agg of perCounty) {
      fragments.push({
        fragment_id: fragmentId(
          SOURCE_ID,
          `per-county-${agg.county.toLowerCase()}`,
        ),
        source_id: SOURCE_ID,
        source_trust_tier: 1,
        fetched_at,
        raw: {
          county: agg.county,
          total_storm_count: agg.total_storm_count,
        },
        normalized: agg,
      });
    }
    fragments.push({
      fragment_id: fragmentId(SOURCE_ID, "corpus-summary"),
      source_id: SOURCE_ID,
      source_trust_tier: 1,
      fetched_at,
      raw: {
        total_storm_count: corpus.total_storm_count,
        vintage: `${corpus.vintage_start_year}-${corpus.vintage_end_year}`,
      },
      normalized: corpus,
    });
    return fragments;
  },
  citationMeta(verifiedDate, ttlSeconds): Omit<CitationRow, "id"> {
    const liveUrl = `${PARQUET_S3_URL} (browse via ${PARQUET_DASHBOARD_URL})`;
    const fixtureUrl = `fixture://refinery/__fixtures__/storm-history-swfl.sample.parquet`;
    return {
      source:
        env.source === "fixture"
          ? `NOAA Storm Events (fixture; 2022-2024 sample including Hurricane Ian) — ${fixtureUrl}`
          : `NOAA Storm Events Database via data_lake._tier1_inventory[${BUCKET}/${PARQUET_PATH}] — ingested from ${"https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/"}, SWFL counties (LEE+COLLIER+CHARLOTTE), 1996-2025 modern-schema vintage — ${liveUrl}`,
      verified: verifiedDate,
      expires: expiresDate(verifiedDate, ttlSeconds),
    };
  },
};

/**
 * Stable URL string used by the pack's per-metric `source.url`. Keeps the
 * source-of-truth string in this file so a path edit lands one place.
 */
export function stormSourceUrl(): string {
  return env.source === "fixture"
    ? `fixture://refinery/__fixtures__/storm-history-swfl.sample.parquet`
    : PARQUET_S3_URL;
}

/** Exported for the citation in pack metrics. */
export const STORM_HISTORY_CITATION_BASE = `NOAA Storm Events Database via data_lake._tier1_inventory[${BUCKET}/${PARQUET_PATH}]`;
