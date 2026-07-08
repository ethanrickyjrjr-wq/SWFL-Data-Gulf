import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { env } from "../config/env.mts";
import { fragmentId } from "../lib/ids.mts";
import { isoTimestamp, expiresDate } from "../lib/dates.mts";

/**
 * env-swfl source connector — Southwest Florida flood hazard exposure pulled
 * directly from the FEMA National Flood Hazard Layer (NFHL) ArcGIS REST service.
 *
 * THIS IS THE ONLY FILE THAT KNOWS THE FEMA NFHL ENDPOINT SHAPE.
 * Endpoint verified 2026-05-16 (see docs/env-swfl-spike-findings.md). Public,
 * no auth, no token. Per-county area-weighted aggregation via the layer's
 * groupByFieldsForStatistics + sum(Shape__Area) — one stats call per county.
 *
 * Trust tier: 1 (FEMA is the federal authoritative source for flood mapping —
 * same tier weight as FRED and Florida DOR).
 *
 * Unit note: the FEMA NFHL geometry is stored in geographic coordinates
 * (WGS84 / EPSG:4269). The `Shape__Area` aggregate is therefore in square
 * decimal degrees — a NON-projected, non-physical unit. We only emit RATIOS
 * downstream (SFHA % of total county area), which are accurate; absolute area
 * values are not propagated. Surfacing this honestly is a caveat the pack
 * emits, not a number we re-project.
 *
 * Caching: v1 hits FEMA on every build (6 stats calls per render, each
 * ~200ms). The cache-invalidation story via Layer 1 (LOMRs / EFF_DATE) is
 * documented in the spike findings and reserved for v2 — premature without
 * an observed hot-path issue.
 *
 * SWFL scope: the six counties in the Brains v1 footprint. Bboxes are
 * approximate (county-boundary derived); FEMA bbox-intersect queries return
 * any polygon TOUCHING the bbox, so edges may include a small spillover from
 * neighboring counties. The `dfirm_ids` field on each fragment is the
 * authoritative county affiliation (FIPS-encoded in the panel id).
 */

const SOURCE_ID = "fema_nfhl";
const FEMA_BASE_URL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer";
const FLOOD_HAZARD_ZONES_LAYER = 28;

/**
 * FEMA flood zones classified as Special Flood Hazard Area per 44 CFR §59.1.
 * Excludes: X (minimal), D (undetermined), OPEN WATER, plus the 0.2% annual
 * chance "shaded X" sub-type which is not SFHA despite its ZONE_SUBTY label.
 */
const SFHA_ZONES = new Set([
  "A",
  "AE",
  "AH",
  "AO",
  "AR",
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "A6",
  "A7",
  "A8",
  "A9",
  "A99",
  "V",
  "VE",
  "V1",
  "V2",
  "V3",
  "V4",
  "V5",
  "V6",
  "V7",
  "V8",
  "V9",
  "A30",
  "V30",
]);

/** Coastal high-hazard SFHA subset — V-family FEMA flood zones (wave action per 44 CFR §59.1). Flags each fragment's is_ve_zone, which aggregates into swfl_ve_area_sq_deg. */
const VE_ZONES = new Set(["V", "VE", "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8", "V9", "V30"]);

interface CountyDef {
  fips: string;
  name: string;
  /** [west_lon, south_lat, east_lon, north_lat] in WGS84 decimal degrees. */
  bbox: [number, number, number, number];
}

/**
 * SWFL county bboxes. Conservative envelopes — FEMA's spatial-intersect query
 * returns polygons touching the bbox, so over-inclusion at edges is fine; the
 * DFIRM_ID field on returned polygons is the source of truth for county
 * affiliation when fine-grained attribution is needed.
 */
const SWFL_COUNTIES: CountyDef[] = [
  { fips: "12071", name: "Lee", bbox: [-82.32, 26.32, -81.57, 26.91] },
  { fips: "12021", name: "Collier", bbox: [-81.91, 25.79, -80.85, 26.5] },
  { fips: "12051", name: "Hendry", bbox: [-81.58, 26.32, -80.86, 26.9] },
  // Charlotte / Glades / Sarasota removed — NOT real coverage (CLAUDE.md SCOPE lock
  // 07/07/2026). They leaked in via the 05/2026 broad-ingest push; core = Lee+Collier,
  // Hendry minor. Each county here fires one live FEMA fetch, so this list IS the scope.
];

/** The count of in-scope SWFL core counties — the expected full-coverage set.
 *  Downstream caveats reference this instead of a hardcoded number so the scope
 *  can only be changed in one place (here). */
export const SWFL_COUNTY_COUNT = SWFL_COUNTIES.length;

const FIXTURE_PATH = path.join(process.cwd(), "refinery", "__fixtures__", "env-swfl.sample.json");

/**
 * Normalized shape: one fragment per (county, FLD_ZONE) pair. Aggregates the
 * polygon count and Shape__Area sum for that zone within the county bbox.
 */
export interface EnvSwflNormalized {
  kind: "env-zone-aggregate";
  county_fips: string;
  county_name: string;
  /** FEMA flood-zone code — "AE", "VE", "X", "A", "AH", "AO", "D", "OPEN WATER", etc. */
  fld_zone: string;
  /** True when fld_zone is a Special Flood Hazard Area per FEMA 44 CFR §59.1. */
  is_sfha: boolean;
  /** True when fld_zone is a coastal high-hazard zone (V/VE family). */
  is_ve_zone: boolean;
  /** Number of distinct polygons of this zone returned for the county bbox. */
  polygon_count: number;
  /**
   * Sum of Shape__Area for polygons of this zone in the county bbox. Units are
   * SQUARE DECIMAL DEGREES (WGS84, not projected). Only meaningful as a ratio
   * against the same-county area sums; never propagate as an absolute area.
   */
  area_sq_deg: number;
  /**
   * The bbox used to fetch this aggregate — kept so per-metric provenance can
   * cite the exact query that produced the value.
   */
  bbox: [number, number, number, number];
  /** ISO timestamp of the live FEMA call that produced this aggregate. */
  fetched_at: string;
}

interface FemaStatsFeature {
  attributes: {
    FLD_ZONE?: string | null;
    polygon_count?: number | null;
    area_total?: number | null;
  };
}

interface FemaStatsResponse {
  features?: FemaStatsFeature[];
  error?: { code?: number; message?: string };
}

/** Build the area-weighted stats query URL for one county bbox. */
export function buildFemaStatsUrl(bbox: [number, number, number, number]): string {
  const outStats = encodeURIComponent(
    JSON.stringify([
      {
        statisticType: "count",
        onStatisticField: "OBJECTID",
        outStatisticFieldName: "polygon_count",
      },
      {
        statisticType: "sum",
        onStatisticField: "Shape__Area",
        outStatisticFieldName: "area_total",
      },
    ]),
  );
  const geom = bbox.join(",");
  return (
    `${FEMA_BASE_URL}/${FLOOD_HAZARD_ZONES_LAYER}/query` +
    `?where=1%3D1` +
    `&geometry=${encodeURIComponent(geom)}` +
    `&geometryType=esriGeometryEnvelope` +
    `&inSR=4326` +
    `&spatialRel=esriSpatialRelIntersects` +
    `&groupByFieldsForStatistics=FLD_ZONE` +
    `&outStatistics=${outStats}` +
    `&f=json`
  );
}

async function fetchCountyStats(
  county: CountyDef,
  fetchedAt: string,
): Promise<EnvSwflNormalized[]> {
  const url = buildFemaStatsUrl(county.bbox);
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "brain-platform-env-swfl/1.0",
    },
  });
  if (!res.ok) {
    throw new Error(
      `env-swfl-source: FEMA NFHL HTTP ${res.status} for county ${county.name} (${county.fips}) — ${res.statusText}`,
    );
  }
  const json = (await res.json()) as FemaStatsResponse;
  if (json.error) {
    throw new Error(
      `env-swfl-source: FEMA NFHL API error for county ${county.name} (${county.fips}) — ${json.error.message ?? "unknown"} (code ${json.error.code ?? "?"})`,
    );
  }
  const features = json.features ?? [];
  if (features.length === 0) {
    // Empty bbox would be surprising for SWFL — surface it as an error rather
    // than silently produce zero fragments.
    throw new Error(
      `env-swfl-source: FEMA NFHL returned 0 zone aggregates for county ${county.name} (${county.fips}) — bbox may be wrong or service may have changed shape.`,
    );
  }
  return features
    .map((f) => {
      const fld = (f.attributes?.FLD_ZONE ?? "").trim();
      if (fld === "") return null;
      return {
        kind: "env-zone-aggregate" as const,
        county_fips: county.fips,
        county_name: county.name,
        fld_zone: fld,
        is_sfha: SFHA_ZONES.has(fld),
        is_ve_zone: VE_ZONES.has(fld),
        polygon_count: Number(f.attributes?.polygon_count ?? 0),
        area_sq_deg: Number(f.attributes?.area_total ?? 0),
        bbox: county.bbox,
        fetched_at: fetchedAt,
      };
    })
    .filter((n): n is EnvSwflNormalized => n !== null);
}

interface FixtureCountyBlock {
  fips: string;
  name: string;
  bbox: [number, number, number, number];
  features: Array<{
    FLD_ZONE: string;
    polygon_count: number;
    area_total: number;
  }>;
}

interface FixtureFile {
  fetched_at?: string;
  counties: FixtureCountyBlock[];
}

async function loadFixture(): Promise<EnvSwflNormalized[]> {
  const data = JSON.parse(await readFile(FIXTURE_PATH, "utf-8")) as FixtureFile;
  const fetched_at = data.fetched_at ?? isoTimestamp();
  return data.counties.flatMap((county) =>
    county.features.map((feat) => ({
      kind: "env-zone-aggregate" as const,
      county_fips: county.fips,
      county_name: county.name,
      fld_zone: feat.FLD_ZONE,
      is_sfha: SFHA_ZONES.has(feat.FLD_ZONE),
      is_ve_zone: VE_ZONES.has(feat.FLD_ZONE),
      polygon_count: feat.polygon_count,
      area_sq_deg: feat.area_total,
      bbox: county.bbox,
      fetched_at,
    })),
  );
}

export const envSwflSource: SourceConnector = {
  source_id: SOURCE_ID,
  trust_tier: 1, // FEMA NFHL — federal authoritative
  async fetch(): Promise<RawFragment[]> {
    const fetched_at = isoTimestamp();
    const normalized =
      env.source === "fixture"
        ? await loadFixture()
        : (await Promise.all(SWFL_COUNTIES.map((c) => fetchCountyStats(c, fetched_at)))).flat();
    return normalized.map((n): RawFragment<EnvSwflNormalized> => ({
      fragment_id: fragmentId(SOURCE_ID, `${n.county_fips}:${n.fld_zone}`),
      source_id: SOURCE_ID,
      source_trust_tier: 1,
      fetched_at: n.fetched_at,
      raw: {
        county_fips: n.county_fips,
        county_name: n.county_name,
        FLD_ZONE: n.fld_zone,
        polygon_count: n.polygon_count,
        area_total: n.area_sq_deg,
        bbox: n.bbox,
      },
      normalized: n,
    }));
  },
  citationMeta(verifiedDate, ttlSeconds): Omit<CitationRow, "id"> {
    return {
      source:
        env.source === "fixture"
          ? "FEMA NFHL — Flood Hazard Zones (Layer 28, fixture; SWFL core-county aggregate)"
          : "FEMA NFHL — Flood Hazard Zones (ArcGIS REST Layer 28 / S_FLD_HAZ_AR; SWFL core-county area-weighted aggregate)",
      verified: verifiedDate,
      expires: expiresDate(verifiedDate, ttlSeconds),
    };
  },
};
