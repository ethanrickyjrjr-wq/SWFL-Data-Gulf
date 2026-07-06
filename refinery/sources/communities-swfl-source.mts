import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { env } from "../config/env.mts";
import { getSupabase } from "./supabase.mts";
import { fragmentId } from "../lib/ids.mts";
import { isoTimestamp, expiresDate } from "../lib/dates.mts";
import { buildSourceCitationUrl } from "../lib/citation-url.mts";

/**
 * communities-swfl source — SWFL community intelligence over two lake tables:
 *
 *   data_lake.neighborhood_stats  (Tier-1, Phase-1 name-join) — one row per
 *     (county, subdivision_name): home_count, count_by_type, median_just_value.
 *     The universal backbone: EVERY residential parcel in Lee + Collier rolls
 *     up to a neighborhood, gated or not. Schema is CONCRETE (matches
 *     `ingest/duckdb_pipelines/neighborhood_stats/agg.py`).
 *
 *   data_lake.community_profiles  (Tier-2, ~300 marketed communities) — the
 *     golf/fee/amenity scrape (Phase 2) + Mapbox drive-time/nearby enrichment
 *     (Phase 3), merged onto each marketed community's Tier-1 aggregates. The
 *     Phase-1 T5 rollup seeds this table with home_count + gated per community;
 *     Phases 2/3 graft the remaining columns on. Every field carries
 *     source_url + as_of.
 *
 * DEFENSIVE BY DESIGN. This pack is wired into master (a neutral/magnitude-0
 * reporter) BEFORE all of its upstream data has landed — the same
 * empty-tolerant pattern active-listings-swfl shipped under (cron parked). A
 * missing table or column must NEVER throw: both readers try/catch → [] and
 * `select("*")` with null-safe mapping, so Phase-2/3 columns flow through the
 * moment they exist without a code change here. The pack degrades to a "no data
 * yet" neutral brain until the backbone lands, then lights up automatically.
 *
 * The Tier-2 fact-set interface below is the SHARED CONTRACT the Phase-2/3
 * writer targets — column names come straight from the spec's "The fact set"
 * (Tier 2). Keep this interface and the community_profiles migration in sync.
 */

const SOURCE_ID = "communities_swfl";
const SCHEMA = "data_lake";
const COMMUNITY_TABLE = "community_profiles";
const NEIGHBORHOOD_TABLE = "neighborhood_stats";

const FIXTURE_PATH = path.join(
  process.cwd(),
  "refinery",
  "__fixtures__",
  "communities-swfl.sample.json",
);

/** One marketed community (Tier-2). Golf/fee/amenity/Mapbox fields are null
 *  until Phases 2/3 land — the SHARED CONTRACT with the community_profiles
 *  writer. golf_structure ∈ {bundled, equity, optional, none}. */
export interface CommunityProfileRow {
  community_slug: string;
  label: string | null;
  county: string | null;
  home_count: number | null;
  gated: boolean | null;
  // Golf (scrape) — HEADLINE
  golf_structure: string | null;
  golf_holes: number | null;
  // Fees (scrape) — HEADLINE
  hoa_fee_min: number | null;
  hoa_fee_max: number | null;
  cdd_flag: boolean | null;
  // Inside the gates (scrape)
  pool: boolean | null;
  tennis: boolean | null;
  pickleball: boolean | null;
  fitness: boolean | null;
  clubhouse: boolean | null;
  on_site_dining: boolean | null;
  boating: boolean | null;
  // Access — drive-times (Mapbox, minutes)
  drive_min_rsw: number | null;
  drive_min_beach: number | null;
  drive_min_downtown: number | null;
  drive_min_hospital: number | null;
  // Nearby to-do (Mapbox)
  nearby_dining_count: number | null;
  // Provenance
  source_url: string | null;
  as_of: string | null;
}

/** One neighborhood/subdivision aggregate (Tier-1). Concrete schema — mirrors
 *  neighborhood_stats/agg.py. */
export interface NeighborhoodStatRow {
  county: string | null;
  subdivision_name: string | null;
  home_count: number | null;
  count_by_type: Record<string, number> | null;
  median_just_value: number | null;
  source_url: string | null;
  as_of: string | null;
}

export interface CommunitiesSwflSummary {
  kind: "communities-swfl-summary";
  /** Marketed communities (Tier-2) — [] until the scrape lands. */
  communities: CommunityProfileRow[];
  /** Tier-1 universal backbone rollup — null until neighborhood_stats lands. */
  backbone: {
    total_homes: number;
    count_by_type: Record<string, number>;
    subdivision_count: number;
  } | null;
  as_of: string | null;
  community_source_url: string;
  neighborhood_source_url: string;
}

interface FixtureShape {
  __meta?: unknown;
  communities?: CommunityProfileRow[];
  neighborhoods?: NeighborhoodStatRow[];
}

async function loadFixture(): Promise<{
  communities: CommunityProfileRow[];
  neighborhoods: NeighborhoodStatRow[];
}> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  const parsed = JSON.parse(raw) as FixtureShape;
  return {
    communities: parsed.communities ?? [],
    neighborhoods: parsed.neighborhoods ?? [],
  };
}

const num = (v: unknown): number | null =>
  v == null || Number.isNaN(Number(v)) ? null : Number(v);
const bool = (v: unknown): boolean | null => (v == null ? null : Boolean(v));
const str = (v: unknown): string | null => (v == null ? null : String(v));

/** null-safe map of a raw community_profiles row → typed contract row. Unknown
 *  columns are ignored; missing columns become null — so Phase-2/3 additions
 *  flow through without touching this file. */
function mapCommunity(r: Record<string, unknown>): CommunityProfileRow {
  return {
    community_slug: String(r.community_slug ?? r.slug ?? ""),
    label: str(r.label ?? r.community_name ?? r.name),
    county: str(r.county),
    home_count: num(r.home_count),
    gated: bool(r.gated),
    golf_structure: str(r.golf_structure),
    golf_holes: num(r.golf_holes),
    hoa_fee_min: num(r.hoa_fee_min),
    hoa_fee_max: num(r.hoa_fee_max),
    cdd_flag: bool(r.cdd_flag),
    pool: bool(r.pool),
    tennis: bool(r.tennis),
    pickleball: bool(r.pickleball),
    fitness: bool(r.fitness),
    clubhouse: bool(r.clubhouse),
    on_site_dining: bool(r.on_site_dining),
    boating: bool(r.boating),
    drive_min_rsw: num(r.drive_min_rsw),
    drive_min_beach: num(r.drive_min_beach),
    drive_min_downtown: num(r.drive_min_downtown),
    drive_min_hospital: num(r.drive_min_hospital),
    nearby_dining_count: num(r.nearby_dining_count),
    source_url: str(r.source_url),
    as_of: str(r.as_of),
  };
}

function mapNeighborhood(r: Record<string, unknown>): NeighborhoodStatRow {
  let byType: Record<string, number> | null = null;
  const raw = r.count_by_type;
  if (raw && typeof raw === "object") {
    byType = raw as Record<string, number>;
  } else if (typeof raw === "string") {
    try {
      byType = JSON.parse(raw) as Record<string, number>;
    } catch {
      byType = null;
    }
  }
  return {
    county: str(r.county),
    subdivision_name: str(r.subdivision_name),
    home_count: num(r.home_count),
    count_by_type: byType,
    median_just_value: num(r.median_just_value),
    source_url: str(r.source_url),
    as_of: str(r.as_of),
  };
}

/** Read one lake table defensively — a missing table/column, a PostgREST error,
 *  or a thrown client returns [] rather than aborting the leaf (and therefore
 *  master) build. Degrade, never throw. */
async function readTable(table: string): Promise<Record<string, unknown>[]> {
  try {
    const { data, error } = await getSupabase().schema(SCHEMA).from(table).select("*");
    if (error) return [];
    return (data ?? []) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

function summarize(
  communities: CommunityProfileRow[],
  neighborhoods: NeighborhoodStatRow[],
  community_source_url: string,
  neighborhood_source_url: string,
): CommunitiesSwflSummary {
  let backbone: CommunitiesSwflSummary["backbone"] = null;
  if (neighborhoods.length > 0) {
    let total = 0;
    const byType: Record<string, number> = {};
    for (const n of neighborhoods) {
      total += n.home_count ?? 0;
      for (const [t, c] of Object.entries(n.count_by_type ?? {})) {
        byType[t] = (byType[t] ?? 0) + (Number(c) || 0);
      }
    }
    backbone = {
      total_homes: total,
      count_by_type: byType,
      subdivision_count: neighborhoods.length,
    };
  }

  const asOf =
    [...communities.map((c) => c.as_of), ...neighborhoods.map((n) => n.as_of)]
      .filter((v): v is string => v != null)
      .sort()
      .at(-1) ?? null;

  return {
    kind: "communities-swfl-summary",
    communities,
    backbone,
    as_of: asOf,
    community_source_url,
    neighborhood_source_url,
  };
}

export const communitiesSwflSource: SourceConnector = {
  source_id: SOURCE_ID,
  trust_tier: 2,
  async fetch(): Promise<RawFragment[]> {
    const fetched_at = isoTimestamp();

    let communities: CommunityProfileRow[];
    let neighborhoods: NeighborhoodStatRow[];
    if (env.source === "fixture") {
      const fx = await loadFixture();
      communities = fx.communities;
      neighborhoods = fx.neighborhoods;
    } else {
      communities = (await readTable(COMMUNITY_TABLE)).map(mapCommunity);
      neighborhoods = (await readTable(NEIGHBORHOOD_TABLE)).map(mapNeighborhood);
    }

    const community_source_url =
      env.source === "fixture"
        ? "fixture://refinery/__fixtures__/communities-swfl.sample.json"
        : buildSourceCitationUrl(COMMUNITY_TABLE, {
            label: "SWFL marketed communities — golf, fees, amenities, access",
            source: "SWFL Data Gulf community profiles (parcel + named-web + Mapbox)",
            brain: "communities-swfl",
            date_col: "as_of",
          });
    const neighborhood_source_url =
      env.source === "fixture"
        ? "fixture://refinery/__fixtures__/communities-swfl.sample.json"
        : buildSourceCitationUrl(NEIGHBORHOOD_TABLE, {
            label: "SWFL neighborhood/subdivision stats (all homes, Lee + Collier)",
            source: "SWFL Data Gulf parcel name-join (Lee + Collier tax rolls)",
            brain: "communities-swfl",
            date_col: "as_of",
          });

    const summary = summarize(
      communities,
      neighborhoods,
      community_source_url,
      neighborhood_source_url,
    );
    const fragment: RawFragment<CommunitiesSwflSummary> = {
      fragment_id: fragmentId(SOURCE_ID, "summary"),
      source_id: SOURCE_ID,
      source_trust_tier: 2,
      fetched_at,
      raw: {
        community_rows: communities.length,
        neighborhood_rows: neighborhoods.length,
      } as unknown as Record<string, unknown>,
      normalized: summary,
    };
    return [fragment];
  },
  citationMeta(verifiedDate, ttlSeconds): Omit<CitationRow, "id"> {
    return {
      source:
        env.source === "fixture"
          ? `SWFL communities (fixture; ${SCHEMA}.${COMMUNITY_TABLE} + ${NEIGHBORHOOD_TABLE})`
          : "SWFL Data Gulf — community profiles (parcel + named-web + Mapbox)",
      verified: verifiedDate,
      expires: expiresDate(verifiedDate, ttlSeconds),
    };
  },
};
