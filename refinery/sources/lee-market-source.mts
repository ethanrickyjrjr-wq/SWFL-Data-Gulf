import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { env } from "../config/env.mts";
import { getSupabase } from "./supabase.mts";
import { fragmentId } from "../lib/ids.mts";
import { isoTimestamp, expiresDate } from "../lib/dates.mts";

/**
 * lee-market source connector — Lee County (FL) real-estate market read
 * from the Redfin Data Center county market tracker.
 *
 * Reads data_lake.redfin_lee_market (Tier 2, populated by the dlt pipeline
 * at ingest/pipelines/redfin_lee/ — a streaming filter of Redfin's FREE
 * public county-tracker TSV down to "Lee County, FL"). The table is small
 * (~600+ headline rows), so this connector aggregates in TS rather than via a
 * Postgres view: monthly HOMES_SOLD summed to calendar-year totals (so the pack
 * can reuse properties-lee-value's exact yearly z-score math) plus a latest-
 * period level snapshot (price YoY + months of supply).
 *
 * Trust tier: 2 (commercial market aggregator, published monthly).
 *
 * Geography: Lee County only. Collier is a separate brain (properties-collier-value).
 *
 * NOTE — market-grain, not parcel-grain: Redfin carries no assessed/taxable
 * value, so there is no Save-Our-Homes gap here (that is tax-roll-only and lives
 * in the LeePA parcel source). This source leads with transaction velocity + price.
 *
 * Fragment kinds emitted:
 *   "lee-sales-year"  — one per calendar year (homes_sold summed from monthly rows)
 *   "lee-summary"     — single latest-period snapshot (price YoY + months of supply)
 *
 * IMPORTANT: These kinds use strict === matching in the pack. "lee-" must never
 * cross-match with "leepa-" (the parcel-grain LeePA kinds). Do not use startsWith.
 */

const SOURCE_ID = "redfin_lee_market";
const SCHEMA = "data_lake";
const TABLE = "redfin_lee_market";
const HEADLINE_PROPERTY_TYPE = "All Residential";

const FIXTURE_PATH = path.join(
  process.cwd(),
  "refinery",
  "__fixtures__",
  "properties-lee-market.sample.json",
);

/** A row from data_lake.redfin_lee_market (the columns the brain reads). */
interface MarketRow {
  region: string;
  period_end: string; // YYYY-MM-DD
  property_type: string;
  homes_sold: number | null;
  median_sale_price: number | null;
  median_sale_price_yoy: number | null; // fraction (0.0378 = 3.78%)
  months_of_supply: number | null;
}

/** Per-calendar-year homes-sold total. One fragment per year present. */
export interface LeeSalesYearNormalized {
  kind: "lee-sales-year";
  year: number;
  homes_sold: number;
}

/** Latest-period level snapshot — price direction + supply. */
export interface LeeSummaryNormalized {
  kind: "lee-summary";
  latest_period: string | null;
  median_sale_price_yoy_pct: number | null; // percent (already ×100)
  months_of_supply: number | null;
}

interface FixtureShape {
  _meta?: Record<string, unknown>;
  rows: MarketRow[];
}

interface PreAggregated {
  yearly: LeeSalesYearNormalized[];
  summary: LeeSummaryNormalized;
}

/**
 * Aggregate raw market rows into the shape the pack consumes. Filters to the
 * headline "All Residential" property type, sums HOMES_SOLD by calendar year,
 * and takes the most recent period for the price/supply level snapshot.
 * Used in BOTH fixture and live mode (the live table is small).
 */
export function aggregateFromRows(rows: MarketRow[]): PreAggregated {
  const headline = rows.filter((r) => r.property_type === HEADLINE_PROPERTY_TYPE);

  const byYear = new Map<number, number>();
  for (const r of headline) {
    if (r.homes_sold == null || !r.period_end) continue;
    const y = parseInt(r.period_end.slice(0, 4), 10);
    if (!Number.isFinite(y)) continue;
    byYear.set(y, (byYear.get(y) ?? 0) + r.homes_sold);
  }
  const yearly: LeeSalesYearNormalized[] = [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, homes_sold]) => ({
      kind: "lee-sales-year",
      year,
      homes_sold,
    }));

  let latest: MarketRow | null = null;
  for (const r of headline) {
    if (!r.period_end) continue;
    if (!latest || r.period_end > latest.period_end) latest = r;
  }
  const yoyPct =
    latest?.median_sale_price_yoy != null
      ? Math.round(latest.median_sale_price_yoy * 1000) / 10
      : null;
  const summary: LeeSummaryNormalized = {
    kind: "lee-summary",
    latest_period: latest?.period_end ?? null,
    median_sale_price_yoy_pct: yoyPct,
    months_of_supply: latest?.months_of_supply ?? null,
  };

  return { yearly, summary };
}

function assertNonEmpty(agg: PreAggregated): void {
  if (agg.yearly.length === 0 && agg.summary.latest_period == null) {
    throw new Error(
      `lee-market-source: aggregateFromRows returned empty result — ` +
        `no "All Residential" rows found in ${SCHEMA}.${TABLE}. ` +
        `Confirm the pipeline ran (python -m ingest.pipelines.redfin_lee.pipeline) ` +
        `and docs/sql/redfin_lee_grant.sql was applied.`,
    );
  }
}

async function loadFixture(): Promise<PreAggregated> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  const data = JSON.parse(raw) as FixtureShape;
  return aggregateFromRows(data.rows);
}

async function fetchLive(): Promise<PreAggregated> {
  const sb = getSupabase().schema(SCHEMA);
  const resp = await sb
    .from(TABLE)
    .select(
      "region,period_end,property_type,homes_sold,median_sale_price,median_sale_price_yoy,months_of_supply",
    )
    .eq("property_type", HEADLINE_PROPERTY_TYPE)
    .order("period_end");
  if (resp.error) {
    throw new Error(`lee-market-source: ${SCHEMA}.${TABLE} query failed — ${resp.error.message}`);
  }
  const rows = (resp.data ?? []) as MarketRow[];
  const agg = aggregateFromRows(rows);
  assertNonEmpty(agg);
  return agg;
}

export const leeMarketSource: SourceConnector = {
  source_id: SOURCE_ID,
  trust_tier: 2,
  async fetch(): Promise<RawFragment[]> {
    const data = env.source === "fixture" ? await loadFixture() : await fetchLive();
    const fetched_at = isoTimestamp();
    const fragments: RawFragment[] = [];

    for (const yr of data.yearly) {
      fragments.push({
        fragment_id: fragmentId(SOURCE_ID, `sales-year-${yr.year}`),
        source_id: SOURCE_ID,
        source_trust_tier: 2,
        fetched_at,
        raw: { year: yr.year, homes_sold: yr.homes_sold },
        normalized: yr,
      });
    }

    fragments.push({
      fragment_id: fragmentId(SOURCE_ID, "summary"),
      source_id: SOURCE_ID,
      source_trust_tier: 2,
      fetched_at,
      raw: {
        latest_period: data.summary.latest_period,
        median_sale_price_yoy_pct: data.summary.median_sale_price_yoy_pct,
        months_of_supply: data.summary.months_of_supply,
      },
      normalized: data.summary,
    });

    return fragments;
  },
  citationMeta(verifiedDate, ttlSeconds): Omit<CitationRow, "id"> {
    const liveUrl =
      env.source === "live" && env.supabaseUrl
        ? `${env.supabaseUrl}/rest/v1/${TABLE}?select=region,period_end,property_type,homes_sold,median_sale_price_yoy,months_of_supply&property_type=eq.All%20Residential`
        : `fixture://refinery/__fixtures__/properties-lee-market.sample.json`;
    return {
      source:
        env.source === "fixture"
          ? `Redfin Lee County market tracker (fixture; ${SCHEMA}.${TABLE}, Lee County FL) — ${liveUrl}`
          : `Redfin Data Center county market tracker via ${SCHEMA}.${TABLE} (free public TSV, filtered to "Lee County, FL"; monthly HOMES_SOLD summed to calendar-year velocity) — ${liveUrl}`,
      verified: verifiedDate,
      expires: expiresDate(verifiedDate, ttlSeconds),
    };
  },
};
