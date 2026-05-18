import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { env } from "../config/env.mts";
import { getSupabase } from "./supabase.mts";
import { fragmentId } from "../lib/ids.mts";
import { isoTimestamp, expiresDate } from "../lib/dates.mts";

/**
 * leepa-value source connector — Lee County Property Appraiser parcel value/use/sale snapshot.
 *
 * Reads data_lake.leepa_parcels (Tier 2, populated by the dlt pipeline at
 * ingest/pipelines/leepa/, layers 9/10/12 joined on FOLIOID). All aggregation
 * is pushed to Postgres views so this connector pulls tiny result sets:
 *   - data_lake.leepa_parcels_sales_yearly  → per-year qualified-sale counts
 *   - data_lake.leepa_parcels_summary       → 1-row total_parcels + SOH gap median
 *
 * Trust tier: 2 (county govt published, snapshot updated as-of ingest date).
 *
 * Geography: Lee County only. Collier is a future sibling brain (separate
 * Tier 2 table; not a parameter of this connector).
 *
 * Window: VELOCITY_WINDOW_YEARS back from today's calendar year. The pack
 * decides which years inside the window count as "current" (year-1, the most
 * recent COMPLETE calendar year) vs "baseline" (the 3 prior years). Source
 * stays year-agnostic so reads are reproducible across run dates.
 */

const SOURCE_ID = "leepa_value_lee";
const SCHEMA = "data_lake";
const PARCELS_TABLE = "leepa_parcels";
const SALES_YEARLY_VIEW = "leepa_parcels_sales_yearly";
const SUMMARY_VIEW = "leepa_parcels_summary";

const VELOCITY_WINDOW_YEARS = 8;

const FIXTURE_PATH = path.join(
  process.cwd(),
  "refinery",
  "__fixtures__",
  "properties-lee-value.sample.json",
);

/** A row from data_lake.leepa_parcels (15 columns); only used in fixture mode. */
interface ParcelRow {
  folioid: string;
  just_value: number | null;
  market_value: number | null;
  assessed_value: number | null;
  taxable_value: number | null;
  soh_cap: number | null;
  building_value: number | null;
  land_value: number | null;
  cap_difference: number | null;
  use_code: string | null;
  use_description: string | null;
  last_sale_amount: number | null;
  last_sale_date: string | null;
  last_sale_instrument: string | null;
  last_sale_book_page: string | null;
}

/** One row from the per-year sales view. One fragment emitted per year in window. */
export interface SalesVelocityYearNormalized {
  kind: "leepa-sales-year";
  year: number;
  sales_count: number;
}

/** Snapshot summary fragment — total parcels + SOH gap median + homestead count. */
export interface LeepaSummaryNormalized {
  kind: "leepa-summary";
  total_parcels: number;
  soh_homesteaded_parcels: number;
  soh_gap_median_pct: number | null;
}

interface FixtureShape {
  _meta?: Record<string, unknown>;
  parcels: ParcelRow[];
}

interface PreAggregated {
  yearly: SalesVelocityYearNormalized[];
  summary: LeepaSummaryNormalized;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Aggregate raw parcel rows into the same shape the live views return.
 * Used only in fixture mode; live mode reads the views directly.
 */
export function aggregateFromParcels(parcels: ParcelRow[]): PreAggregated {
  const yearCounts = new Map<number, number>();
  for (const p of parcels) {
    if (!p.last_sale_date) continue;
    const y = parseInt(p.last_sale_date.slice(0, 4), 10);
    if (!Number.isFinite(y)) continue;
    yearCounts.set(y, (yearCounts.get(y) ?? 0) + 1);
  }
  const yearly: SalesVelocityYearNormalized[] = [...yearCounts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, sales_count]) => ({
      kind: "leepa-sales-year",
      year,
      sales_count,
    }));

  const gaps: number[] = [];
  let homesteaded = 0;
  for (const p of parcels) {
    const cap = p.cap_difference ?? 0;
    const just = p.just_value ?? 0;
    const taxable = p.taxable_value ?? 0;
    if (cap > 0 && just > 0) {
      homesteaded += 1;
      gaps.push(((just - taxable) / just) * 100);
    }
  }
  const summary: LeepaSummaryNormalized = {
    kind: "leepa-summary",
    total_parcels: parcels.length,
    soh_homesteaded_parcels: homesteaded,
    soh_gap_median_pct: median(gaps),
  };

  return { yearly, summary };
}

async function loadFixture(): Promise<PreAggregated> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  const data = JSON.parse(raw) as FixtureShape;
  return aggregateFromParcels(data.parcels);
}

/**
 * Throws a helpful error when the live query returns zero rows from EITHER
 * view. The message names both the pipeline command and the grant SQL because
 * in practice the failure mode is one or the other being skipped.
 */
export function assertNonEmpty(agg: PreAggregated): void {
  if (agg.summary.total_parcels > 0) return;
  throw new Error(
    `leepa-value-source: ${SCHEMA}.${SUMMARY_VIEW} reported total_parcels=0. ` +
      "Confirm the dlt pipeline ran (python -m ingest.pipelines.leepa.pipeline) and that " +
      "docs/sql/leepa_parcels_grant.sql was applied (service_role needs SELECT on " +
      "leepa_parcels + the two summary views).",
  );
}

async function fetchLive(): Promise<PreAggregated> {
  const sb = getSupabase().schema(SCHEMA);
  const currentYear = new Date().getUTCFullYear();
  const earliestYear = currentYear - VELOCITY_WINDOW_YEARS;

  const yearlyResp = await sb
    .from(SALES_YEARLY_VIEW)
    .select("sale_year,sales_count")
    .gte("sale_year", earliestYear)
    .lte("sale_year", currentYear)
    .order("sale_year");
  if (yearlyResp.error) {
    throw new Error(
      `leepa-value-source: ${SCHEMA}.${SALES_YEARLY_VIEW} query failed — ${yearlyResp.error.message}`,
    );
  }

  const summaryResp = await sb
    .from(SUMMARY_VIEW)
    .select("total_parcels,soh_homesteaded_parcels,soh_gap_median_pct")
    .single();
  if (summaryResp.error) {
    throw new Error(
      `leepa-value-source: ${SCHEMA}.${SUMMARY_VIEW} query failed — ${summaryResp.error.message}`,
    );
  }

  const yearly: SalesVelocityYearNormalized[] = (
    (yearlyResp.data ?? []) as { sale_year: number; sales_count: number }[]
  ).map((r) => ({
    kind: "leepa-sales-year",
    year: r.sale_year,
    sales_count: r.sales_count,
  }));

  const sRaw = summaryResp.data as {
    total_parcels: number;
    soh_homesteaded_parcels: number;
    soh_gap_median_pct: number | string | null;
  };
  // percentile_cont can come back as a numeric string from PostgREST.
  const gapVal =
    typeof sRaw.soh_gap_median_pct === "string"
      ? parseFloat(sRaw.soh_gap_median_pct)
      : sRaw.soh_gap_median_pct;
  const summary: LeepaSummaryNormalized = {
    kind: "leepa-summary",
    total_parcels: sRaw.total_parcels,
    soh_homesteaded_parcels: sRaw.soh_homesteaded_parcels,
    soh_gap_median_pct: gapVal == null || Number.isNaN(gapVal) ? null : gapVal,
  };

  const agg: PreAggregated = { yearly, summary };
  assertNonEmpty(agg);
  return agg;
}

export const leepaValueSource: SourceConnector = {
  source_id: SOURCE_ID,
  trust_tier: 2,
  async fetch(): Promise<RawFragment[]> {
    const data =
      env.source === "fixture" ? await loadFixture() : await fetchLive();
    const fetched_at = isoTimestamp();
    const fragments: RawFragment[] = [];

    for (const yr of data.yearly) {
      fragments.push({
        fragment_id: fragmentId(SOURCE_ID, `sales-year-${yr.year}`),
        source_id: SOURCE_ID,
        source_trust_tier: 2,
        fetched_at,
        raw: { year: yr.year, sales_count: yr.sales_count },
        normalized: yr,
      });
    }

    fragments.push({
      fragment_id: fragmentId(SOURCE_ID, "summary"),
      source_id: SOURCE_ID,
      source_trust_tier: 2,
      fetched_at,
      raw: {
        total_parcels: data.summary.total_parcels,
        soh_homesteaded_parcels: data.summary.soh_homesteaded_parcels,
      },
      normalized: data.summary,
    });

    return fragments;
  },
  citationMeta(verifiedDate, ttlSeconds): Omit<CitationRow, "id"> {
    const liveUrl =
      env.source === "live" && env.supabaseUrl
        ? `${env.supabaseUrl}/rest/v1/${PARCELS_TABLE}?select=folioid,just_value,taxable_value,cap_difference,last_sale_date,use_code`
        : `fixture://refinery/__fixtures__/properties-lee-value.sample.json`;
    return {
      source:
        env.source === "fixture"
          ? `LeePA parcel snapshot (fixture; ${SCHEMA}.${PARCELS_TABLE} joined from layers 9+10+12, Lee County) — ${liveUrl}`
          : `LeePA parcel snapshot via ${SCHEMA}.${PARCELS_TABLE} (dlt-ingested from gissvr.leepa.org ParcelInfo/MapServer layers 9+10+12, joined on FOLIOID; Lee County, pre-aggregated through ${SALES_YEARLY_VIEW} + ${SUMMARY_VIEW}) — ${liveUrl}`,
      verified: verifiedDate,
      expires: expiresDate(verifiedDate, ttlSeconds),
    };
  },
};
