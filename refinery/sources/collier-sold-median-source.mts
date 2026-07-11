import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { env } from "../config/env.mts";
import { getSupabase } from "./supabase.mts";
import { fragmentId } from "../lib/ids.mts";
import { isoTimestamp, expiresDate } from "../lib/dates.mts";

/**
 * collier-sold-median source connector — Collier County homes-only SOLD median per ZIP,
 * from FDOR recorded-deed sale prices in data_lake.collier_parcels, through the
 * data_lake.collier_sold_median_by_zip view.
 *
 * Mirror of leepa-sold-median-source.mts. The one structural difference: Collier's FDOR
 * row carries a NATIVE situs ZIP (phy_zipcd), so there is no centroid->ZCTA crosswalk —
 * the view groups collier_parcels directly. This is the SOLD answer (what deeds closed
 * at), distinct from the active-listing asking median. Homes-only (dor_uc 001/004)
 * excludes the vacant-land tail that produced the $35k-at-33972 land-blend. Sub-20 ZIPs
 * report the county median flagged county_fallback (never a raw thin-sample ZIP median).
 *
 * Trust tier: 2 (county tax roll / recorded deeds).
 */

const SOURCE_ID = "collier_sold_median";
const SCHEMA = "data_lake";
const VIEW = "collier_sold_median_by_zip";

const FIXTURE_PATH = path.join(
  process.cwd(),
  "refinery",
  "__fixtures__",
  "collier-sold-median.sample.json",
);

/** One row of the view (county_median/county_n are constant across rows). */
interface ViewRow {
  zip_code: string;
  home_sales_n: number;
  median_sale: number | string | null;
  county_fallback: boolean;
  county_median: number | string | null;
  county_n: number;
}

/** County rollup fragment — the headline homes-only sold median + sample size. */
export interface CollierSoldMedianSummaryNormalized {
  kind: "collier-sold-median-summary";
  county_median: number;
  county_n: number;
  /** ISO date (YYYY-MM-DD) the Collier data was read; displayed once as MM/DD/YYYY. */
  as_of: string;
}

/** Per-ZIP homes-only sold median row. */
export interface CollierSoldMedianZipRowNormalized {
  kind: "collier-sold-median-zip-row";
  zip: string;
  home_sales_n: number;
  median_sale: number;
  county_fallback: boolean;
}

interface FixtureShape {
  _meta?: Record<string, unknown>;
  rows: ViewRow[];
}

function coerceNumeric(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isNaN(n) ? null : n;
}

async function loadFixtureRows(): Promise<ViewRow[]> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return (JSON.parse(raw) as FixtureShape).rows ?? [];
}

async function fetchLiveRows(): Promise<ViewRow[]> {
  const sb = getSupabase().schema(SCHEMA);
  const resp = await sb
    .from(VIEW)
    .select("zip_code,home_sales_n,median_sale,county_fallback,county_median,county_n");
  if (resp.error) {
    // Empty-tolerant (ODD): the view may not be applied yet (parcel re-ingest +
    // migration are operator-gated). Stage-1 ingest() fetches sources in a bare
    // loop with NO per-source try/catch, so THROWING here would abort the whole
    // properties-collier-value build. Degrade to "no sold median" instead.
    console.warn(
      `collier-sold-median-source: ${SCHEMA}.${VIEW} query failed (${resp.error.message}) — ` +
        "sold-median metric + detail table will be absent this build. Apply " +
        "docs/sql/20260711_collier_sold_median_by_zip.sql (+ its grant) after the collier_parcels re-ingest lands.",
    );
    return [];
  }
  return (resp.data ?? []) as ViewRow[];
}

export const collierSoldMedianSource: SourceConnector = {
  source_id: SOURCE_ID,
  trust_tier: 2,
  async fetch(): Promise<RawFragment[]> {
    const fetched_at = isoTimestamp();
    const rows = env.source === "fixture" ? await loadFixtureRows() : await fetchLiveRows();
    if (rows.length === 0) return [];

    // county_median/county_n are constant across rows (CROSS JOIN); read from row 0.
    const countyMedian = coerceNumeric(rows[0].county_median);
    const summary: CollierSoldMedianSummaryNormalized = {
      kind: "collier-sold-median-summary",
      county_median: countyMedian ?? 0,
      county_n: rows[0].county_n,
      as_of: fetched_at.slice(0, 10),
    };

    const fragments: RawFragment[] = [
      {
        fragment_id: fragmentId(SOURCE_ID, "sold-median-summary"),
        source_id: SOURCE_ID,
        source_trust_tier: 2,
        fetched_at,
        raw: { county_median: summary.county_median, county_n: summary.county_n },
        normalized: summary,
      },
    ];

    for (const r of rows) {
      const median = coerceNumeric(r.median_sale);
      if (median == null) continue; // never emit a ZIP row with no real number
      const zipRow: CollierSoldMedianZipRowNormalized = {
        kind: "collier-sold-median-zip-row",
        zip: r.zip_code,
        home_sales_n: r.home_sales_n,
        median_sale: median,
        county_fallback: r.county_fallback === true,
      };
      fragments.push({
        fragment_id: fragmentId(SOURCE_ID, `zip-${r.zip_code}`),
        source_id: SOURCE_ID,
        source_trust_tier: 2,
        fetched_at,
        raw: { zip: r.zip_code, home_sales_n: r.home_sales_n },
        normalized: zipRow,
      });
    }

    return fragments;
  },
  citationMeta(verifiedDate, ttlSeconds): Omit<CitationRow, "id"> {
    const liveUrl =
      env.source === "live" && env.supabaseUrl
        ? `${env.supabaseUrl}/rest/v1/${VIEW}?select=zip_code,home_sales_n,median_sale,county_fallback`
        : `fixture://refinery/__fixtures__/collier-sold-median.sample.json`;
    return {
      source:
        env.source === "fixture"
          ? `Collier County Property Appraiser (FDOR tax roll, recorded deeds) — homes-only sold median per ZIP (fixture; ${SCHEMA}.${VIEW}) — ${liveUrl}`
          : `Collier County Property Appraiser (FDOR tax roll, recorded deeds) — homes-only sold median per ZIP via ${SCHEMA}.${VIEW} — ${liveUrl}`,
      verified: verifiedDate,
      expires: expiresDate(verifiedDate, ttlSeconds),
    };
  },
};
