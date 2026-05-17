import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { env } from "../config/env.mts";
import { getSupabase } from "./supabase.mts";
import { fragmentId } from "../lib/ids.mts";
import { isoTimestamp, expiresDate } from "../lib/dates.mts";

/**
 * faf5 source connector — Federal Highway Administration FAF5 freight flows
 * for the SWFL zone (Remainder of Florida, dms_dest=129), inbound domestic
 * only (trade_type=1).
 *
 * Reads three tables from the data_lake schema in Brains Supabase, all
 * populated by the Python dlt pipeline at `ingest/pipelines/faf5/`:
 *   - data_lake.faf_flows         — freight flow rows (origin × dest × commodity)
 *   - data_lake.faf_zone_lookup   — FAF zone_id → name
 *   - data_lake.faf_sctg_lookup   — SCTG code → commodity name
 *
 * The zone + SCTG lookups are joined in TS rather than in SQL because (a) both
 * lookup tables are tiny (~50 + ~42 rows) and (b) supabase-js doesn't expose
 * cross-schema joins ergonomically. The TS join is one map lookup per flow row.
 *
 * Trust tier: 1 (FAF5 is published by ORNL for FHWA — federal authoritative).
 *
 * Filter: dms_dest=129 (Remainder of Florida) AND trade_type=1 (domestic).
 * This is the "Ingest Broad, Filter Local" rule applied in the brain layer —
 * the dlt pipeline ingests ALL FL-zone rows, this brain narrows to SWFL
 * inbound. Outbound (dms_orig=129), imports, and exports are intentionally
 * excluded — separate brains will own those scopes if/when they're built.
 *
 * Year scope: LATEST_HISTORICAL_FAF_YEAR (2024) — the most recent observed
 * year in FAF5.7.1. Forecast years are deliberately NOT consumed by this
 * brain. Update both the constant below AND the column name in the SELECT
 * when ORNL publishes the next vintage.
 */

const SOURCE_ID = "faf5_flows_swfl";
const SCHEMA = "data_lake";
const FLOWS_TABLE = "faf_flows";
const ZONE_LOOKUP_TABLE = "faf_zone_lookup";
const SCTG_LOOKUP_TABLE = "faf_sctg_lookup";

const SWFL_DEST_ZONE = 129;
const DOMESTIC_TRADE_TYPE = 1;
/** Latest historical year in FAF5.7.1 — bump when ORNL publishes the next vintage. */
export const LATEST_HISTORICAL_FAF_YEAR = 2024;

const TONS_COL = `tons_${LATEST_HISTORICAL_FAF_YEAR}` as const;
const VALUE_COL = `value_${LATEST_HISTORICAL_FAF_YEAR}` as const;

const FIXTURE_PATH = path.join(
  process.cwd(),
  "refinery",
  "__fixtures__",
  "logistics-swfl.sample.json",
);

/** One inbound flow → one normalized fragment for the pack. */
export interface FafFlowNormalized {
  kind: "faf5-flow";
  origin_zone_id: number;
  origin_zone_name: string;
  origin_state_abbr: string;
  sctg_code: number;
  commodity_name: string;
  /** Tons in thousand-tons, for LATEST_HISTORICAL_FAF_YEAR. */
  tons_thousand: number;
  /** Value in millions of USD, for LATEST_HISTORICAL_FAF_YEAR. */
  value_musd: number;
  /** Stamped here so the pack's outputProducer can rebuild the receipt URL. */
  year: number;
}

interface ZoneLookupRow {
  zone_id: number;
  zone_name: string;
  state_abbr: string;
}

interface SctgLookupRow {
  sctg_code: number;
  commodity_name: string;
}

interface FlowRow {
  dms_orig: number;
  dms_dest: number;
  sctg2: number;
  trade_type: number;
  // Index signature for tons_YYYY / value_YYYY columns (only the latest is read).
  [k: string]: unknown;
}

interface FixtureShape {
  flows: FlowRow[];
  zone_lookup: ZoneLookupRow[];
  sctg_lookup: SctgLookupRow[];
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function loadFixture(): Promise<FixtureShape> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw) as FixtureShape;
}

async function fetchLive(): Promise<FixtureShape> {
  const sb = getSupabase().schema(SCHEMA);
  const [flowsResp, zoneResp, sctgResp] = await Promise.all([
    sb
      .from(FLOWS_TABLE)
      .select(`dms_orig,dms_dest,sctg2,trade_type,${TONS_COL},${VALUE_COL}`)
      .eq("dms_dest", SWFL_DEST_ZONE)
      .eq("trade_type", DOMESTIC_TRADE_TYPE),
    sb.from(ZONE_LOOKUP_TABLE).select("zone_id,zone_name,state_abbr"),
    sb.from(SCTG_LOOKUP_TABLE).select("sctg_code,commodity_name"),
  ]);

  if (flowsResp.error) {
    throw new Error(
      `faf5-source: ${SCHEMA}.${FLOWS_TABLE} query failed — ${flowsResp.error.message}`,
    );
  }
  if (zoneResp.error) {
    throw new Error(
      `faf5-source: ${SCHEMA}.${ZONE_LOOKUP_TABLE} query failed — ${zoneResp.error.message}`,
    );
  }
  if (sctgResp.error) {
    throw new Error(
      `faf5-source: ${SCHEMA}.${SCTG_LOOKUP_TABLE} query failed — ${sctgResp.error.message}`,
    );
  }
  const flows = (flowsResp.data ?? []) as FlowRow[];
  if (flows.length === 0) {
    throw new Error(
      `faf5-source: ${SCHEMA}.${FLOWS_TABLE} returned 0 rows for dms_dest=${SWFL_DEST_ZONE} trade_type=${DOMESTIC_TRADE_TYPE}. ` +
        "Confirm the dlt pipeline ran successfully and that GRANT SELECT TO service_role is in place on all three FAF5 tables.",
    );
  }
  return {
    flows,
    zone_lookup: (zoneResp.data ?? []) as ZoneLookupRow[],
    sctg_lookup: (sctgResp.data ?? []) as SctgLookupRow[],
  };
}

function normalize(
  row: FlowRow,
  zoneById: Map<number, ZoneLookupRow>,
  sctgByCode: Map<number, SctgLookupRow>,
): FafFlowNormalized | null {
  const origin = zoneById.get(row.dms_orig);
  const sctg = sctgByCode.get(row.sctg2);
  if (!origin || !sctg) return null;
  const tons = toNum(row[TONS_COL]);
  const value = toNum(row[VALUE_COL]);
  if (tons === 0 && value === 0) return null;
  return {
    kind: "faf5-flow",
    origin_zone_id: row.dms_orig,
    origin_zone_name: origin.zone_name,
    origin_state_abbr: origin.state_abbr,
    sctg_code: row.sctg2,
    commodity_name: sctg.commodity_name,
    tons_thousand: tons,
    value_musd: value,
    year: LATEST_HISTORICAL_FAF_YEAR,
  };
}

export const faf5Source: SourceConnector = {
  source_id: SOURCE_ID,
  trust_tier: 1,
  async fetch(): Promise<RawFragment[]> {
    const data =
      env.source === "fixture" ? await loadFixture() : await fetchLive();
    const zoneById = new Map(data.zone_lookup.map((z) => [z.zone_id, z]));
    const sctgByCode = new Map(data.sctg_lookup.map((s) => [s.sctg_code, s]));
    const fetched_at = isoTimestamp();
    return data.flows
      .map((row): RawFragment<FafFlowNormalized> | null => {
        const normalized = normalize(row, zoneById, sctgByCode);
        if (!normalized) return null;
        return {
          fragment_id: fragmentId(
            SOURCE_ID,
            `${normalized.origin_zone_id}-${normalized.sctg_code}-${normalized.year}`,
          ),
          source_id: SOURCE_ID,
          source_trust_tier: 1,
          fetched_at,
          raw: row,
          normalized,
        };
      })
      .filter((f): f is RawFragment<FafFlowNormalized> => f !== null);
  },
  citationMeta(verifiedDate, ttlSeconds): Omit<CitationRow, "id"> {
    const liveUrl =
      env.source === "live" && env.supabaseUrl
        ? `${env.supabaseUrl}/rest/v1/${FLOWS_TABLE}?select=dms_orig,dms_dest,sctg2,trade_type,${TONS_COL},${VALUE_COL}&dms_dest=eq.${SWFL_DEST_ZONE}&trade_type=eq.${DOMESTIC_TRADE_TYPE}`
        : `fixture://refinery/__fixtures__/logistics-swfl.sample.json`;
    return {
      source:
        env.source === "fixture"
          ? `FAF5 freight flows (fixture; ${SCHEMA}.${FLOWS_TABLE} + zone/sctg lookups, dms_dest=${SWFL_DEST_ZONE} trade_type=${DOMESTIC_TRADE_TYPE}, year ${LATEST_HISTORICAL_FAF_YEAR}) — ${liveUrl}`
          : `FAF5 freight flows via ${SCHEMA}.${FLOWS_TABLE} (dlt-ingested from ORNL FAF5.7.1; dms_dest=${SWFL_DEST_ZONE} trade_type=${DOMESTIC_TRADE_TYPE}, year ${LATEST_HISTORICAL_FAF_YEAR}) — ${liveUrl}`,
      verified: verifiedDate,
      expires: expiresDate(verifiedDate, ttlSeconds),
    };
  },
};
