import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { env } from "../config/env.mts";
import { getSupabase } from "./supabase.mts";
import { fragmentId } from "../lib/ids.mts";
import { isoTimestamp, expiresDate } from "../lib/dates.mts";
import { zipInPrimaryCounty, LEE_FIPS } from "../lib/parcel-zip-scope.mts";

/**
 * lee-parcels source connector — Lee County parcel snapshot from the FDOR
 * Statewide Cadastral (the FL tax roll in GIS form), filtered to CO_NO=46.
 *
 * Sibling to collier-parcels-source.mts. Gives properties-lee-value a
 * cross-check against its existing LeePA-sourced SOH gap (different source,
 * different value methodology) plus something LeePA doesn't carry: a
 * parcel-count breakdown by FDOR's own use-code category (residential vs
 * commercial vs industrial vs agricultural vs institutional vs governmental
 * vs misc). 556k+ parcels is too many to pull per refinery run, so the
 * aggregation lives in data_lake.lee_parcels_summary (1 row) — this connector
 * reads that view directly. Per-ZIP assessed value + SOH gap ride in from
 * data_lake.lee_parcels_zip_summary (Lee-primary ZIPs only — see
 * refinery/lib/parcel-zip-scope.mts) for the lee_parcels_by_zip detail table.
 *
 * Trust tier: 2 (state govt tax roll, annual snapshot).
 */

const SOURCE_ID = "lee_parcels_fdor";
const SCHEMA = "data_lake";
const PARCELS_TABLE = "lee_parcels";
const SUMMARY_VIEW = "lee_parcels_summary";
const ZIP_SUMMARY_VIEW = "lee_parcels_zip_summary";

/** Snapshot summary fragment — total parcels, SOH gap median, use-category breakdown. */
export interface LeeParcelsSummaryNormalized {
  kind: "lee-parcels-summary";
  total_parcels: number;
  soh_homesteaded_parcels: number;
  soh_gap_median_pct: number | null;
  residential_parcels: number;
  commercial_parcels: number;
  industrial_parcels: number;
  agricultural_parcels: number;
  institutional_parcels: number;
  governmental_parcels: number;
  misc_parcels: number;
}

/** Per-ZIP parcel stats row (from lee_parcels_zip_summary view). */
export interface LeeParcelsZipRowNormalized {
  kind: "lee-parcels-zip-row";
  zip: string;
  parcel_count: number;
  homesteaded_count: number;
  median_jv: number | null;
  soh_gap_median_pct: number | null;
}

function coerceNumeric(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isNaN(n) ? null : n;
}

async function fetchLiveSummary(): Promise<LeeParcelsSummaryNormalized> {
  const sb = getSupabase().schema(SCHEMA);
  const resp = await sb
    .from(SUMMARY_VIEW)
    .select(
      "total_parcels,soh_homesteaded_parcels,soh_gap_median_pct,residential_parcels,commercial_parcels,industrial_parcels,agricultural_parcels,institutional_parcels,governmental_parcels,misc_parcels",
    )
    .single();
  if (resp.error) {
    throw new Error(
      `lee-parcels-source: ${SCHEMA}.${SUMMARY_VIEW} query failed — ${resp.error.message}. ` +
        "Confirm python -m ingest.pipelines.lee_parcels.pipeline ran and " +
        "docs/sql/lee_parcels_grant.sql was applied.",
    );
  }
  const r = resp.data as {
    total_parcels: number;
    soh_homesteaded_parcels: number;
    soh_gap_median_pct: number | string | null;
    residential_parcels: number;
    commercial_parcels: number;
    industrial_parcels: number;
    agricultural_parcels: number;
    institutional_parcels: number;
    governmental_parcels: number;
    misc_parcels: number;
  };
  return {
    kind: "lee-parcels-summary",
    total_parcels: r.total_parcels,
    soh_homesteaded_parcels: r.soh_homesteaded_parcels,
    soh_gap_median_pct: coerceNumeric(r.soh_gap_median_pct),
    residential_parcels: r.residential_parcels,
    commercial_parcels: r.commercial_parcels,
    industrial_parcels: r.industrial_parcels,
    agricultural_parcels: r.agricultural_parcels,
    institutional_parcels: r.institutional_parcels,
    governmental_parcels: r.governmental_parcels,
    misc_parcels: r.misc_parcels,
  };
}

async function fetchLiveZipRows(): Promise<LeeParcelsZipRowNormalized[]> {
  const sb = getSupabase().schema(SCHEMA);
  const resp = await sb
    .from(ZIP_SUMMARY_VIEW)
    .select("phy_zipcd,parcel_count,homesteaded_count,median_jv,soh_gap_median_pct");
  if (resp.error) {
    // Non-fatal: zip-grain detail is additive; absence degrades gracefully.
    console.warn(
      `lee-parcels-source: ${ZIP_SUMMARY_VIEW} query failed (${resp.error.message}) — detail_tables will be empty. ` +
        "Run docs/sql/20260719_lee_parcels_zip_summary.sql to create the view.",
    );
    return [];
  }
  const rows = (resp.data ?? []) as {
    phy_zipcd: string;
    parcel_count: number;
    homesteaded_count: number;
    median_jv: number | string | null;
    soh_gap_median_pct: number | string | null;
  }[];
  // Primary-county gate (not just in_scope): a Lee/Collier straddle ZIP must appear
  // in exactly one county's table or zip-report renders two competing candidates —
  // see refinery/lib/parcel-zip-scope.mts. Keeps 34134; drops 34110/34119 (Collier-primary).
  return rows
    .filter((r) => r.phy_zipcd && zipInPrimaryCounty(r.phy_zipcd, LEE_FIPS))
    .map((r) => ({
      kind: "lee-parcels-zip-row" as const,
      zip: r.phy_zipcd,
      parcel_count: r.parcel_count,
      homesteaded_count: r.homesteaded_count,
      median_jv: coerceNumeric(r.median_jv),
      soh_gap_median_pct: coerceNumeric(r.soh_gap_median_pct),
    }));
}

interface FixtureShape {
  _meta?: Record<string, unknown>;
  summary: LeeParcelsSummaryNormalized;
}

async function loadFixture(): Promise<LeeParcelsSummaryNormalized> {
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const fixturePath = path.join(
    process.cwd(),
    "refinery",
    "__fixtures__",
    "properties-lee-parcels.sample.json",
  );
  const raw = await readFile(fixturePath, "utf-8");
  const data = JSON.parse(raw) as FixtureShape;
  return data.summary;
}

export const leeParcelsSource: SourceConnector = {
  source_id: SOURCE_ID,
  trust_tier: 2,
  async fetch(): Promise<RawFragment[]> {
    const fetched_at = isoTimestamp();
    const summary = env.source === "fixture" ? await loadFixture() : await fetchLiveSummary();
    const zipRows: LeeParcelsZipRowNormalized[] =
      env.source === "fixture" ? [] : await fetchLiveZipRows();

    const fragments: RawFragment[] = [
      {
        fragment_id: fragmentId(SOURCE_ID, "parcels-summary"),
        source_id: SOURCE_ID,
        source_trust_tier: 2,
        fetched_at,
        raw: {
          total_parcels: summary.total_parcels,
          commercial_parcels: summary.commercial_parcels,
        },
        normalized: summary,
      },
    ];

    for (const row of zipRows) {
      fragments.push({
        fragment_id: fragmentId(SOURCE_ID, `zip-${row.zip}`),
        source_id: SOURCE_ID,
        source_trust_tier: 2,
        fetched_at,
        raw: { zip: row.zip, parcel_count: row.parcel_count },
        normalized: row,
      });
    }

    return fragments;
  },
  citationMeta(verifiedDate, ttlSeconds): Omit<CitationRow, "id"> {
    const liveUrl =
      env.source === "live" && env.supabaseUrl
        ? `${env.supabaseUrl}/rest/v1/${SUMMARY_VIEW}?select=total_parcels,soh_gap_median_pct,commercial_parcels`
        : `fixture://refinery/__fixtures__/properties-lee-parcels.sample.json`;
    return {
      source:
        env.source === "fixture"
          ? `FDOR Statewide Cadastral — Lee parcels (fixture; ${SCHEMA}.${PARCELS_TABLE}, CO_NO=46) — ${liveUrl}`
          : `FDOR Statewide Cadastral — Lee County parcels via ${SCHEMA}.${PARCELS_TABLE} (ArcGIS FeatureServer, CO_NO=46; SOH gap + use-code category breakdown pre-aggregated through ${SUMMARY_VIEW}) — ${liveUrl}`,
      verified: verifiedDate,
      expires: expiresDate(verifiedDate, ttlSeconds),
    };
  },
};
