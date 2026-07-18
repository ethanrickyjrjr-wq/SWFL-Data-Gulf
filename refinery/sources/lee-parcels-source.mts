import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { env } from "../config/env.mts";
import { getSupabase } from "./supabase.mts";
import { fragmentId } from "../lib/ids.mts";
import { isoTimestamp, expiresDate } from "../lib/dates.mts";

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
 * reads that view directly.
 *
 * Trust tier: 2 (state govt tax roll, annual snapshot).
 */

const SOURCE_ID = "lee_parcels_fdor";
const SCHEMA = "data_lake";
const PARCELS_TABLE = "lee_parcels";
const SUMMARY_VIEW = "lee_parcels_summary";

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

    return [
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
