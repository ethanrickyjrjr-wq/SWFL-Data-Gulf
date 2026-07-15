// lib/listings/community-lookup.ts
//
// Gap 1 (address -> community identity): resolves a listing's street address to at most one
// data_lake.parcel_subdivision subdivision_name, using addressKey() canonicalized matching.
//
// FAN-OUT RULE, NON-NEGOTIABLE: a condo tower can share one street address across many parcels
// with DIFFERENT legal subdivision names (measured live 07/14/2026: 537 Collier+Lee address
// groups resolve to 2+ distinct subdivision_name; worst case 1085 Bald Eagle Dr / Marco Island,
// 273 parcels, 4 distinct names). More than one distinct (county, subdivision_name) at a matched
// address -> NO match, never a guess. A wrong community fact is worse than an absent one —
// naming a community becomes MANDATORY once attached downstream
// (lib/deliverable/recipes/community-facts.test.ts), so a guess here would ship as a stated
// fact, not a hedge.
//
// Not yet wired into ListingFacts — see docs/handoff/2026-07-14-community-data-into-builder-
// handoff.md Gap 3 for that follow-up.

import { addressKey } from "./address-key";
// KNOWN-DEBT(data_lake: parcel_subdivision + neighborhood_stats live in the data_lake schema,
// which the typed Supabase client intentionally does not cover — see utils/supabase/service-role.ts):
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import { communityForSubdivision, COMMUNITY_ALIASES } from "@/refinery/lib/subdivision-aliases.mts";

// SOURCE-SUPPLY NOTE (07/15/2026): data_lake.parcel_subdivision (queried below) carries MORE
// than county/subdivision_name/zip/phy_addr1 -- the FDOR ingest (ingest/pipelines/
// parcel_subdivision/) also pulls sale_price_1/2 + sale dates + qualification codes,
// living_area_sqft, actual_year_built, effective_year_built, land_value, building_count,
// residential_unit_count, neighborhood_code, market_area, and assessment_year. NONE of that
// rolls into neighborhood_stats or ResolvedCommunityStats today -- home_count/
// median_just_value/count_by_type only. Extending the rollup (e.g. "typical year built" or
// "average living area" per neighborhood) is a one-line SQL change to agg.py's queries, NOT a
// new ingest decision -- check here before reaching for crawl4ai or a new scrape for anything
// that turns out to already be a tax-roll concept. True marketing/amenity concepts (golf,
// gate, pool, HOA fee, clubhouse) are NOT in any government parcel layer and genuinely need
// the named-web-source lane (see the deferred community_profiles scrape, check
// community_profiles_zero_coverage).

const SCHEMA = "data_lake";
const PARCEL_TABLE = "parcel_subdivision";
const NEIGHBORHOOD_TABLE = "neighborhood_stats";

export interface ParcelCandidateRow {
  county: string | null;
  subdivision_name: string | null;
  zip: string | null;
  phy_addr1: string | null;
}

export type CommunityResolution =
  | { matched: true; county: string; subdivisionName: string }
  | {
      matched: false;
      reason: "no_parcel_at_address" | "ambiguous_multiple_subdivisions";
      candidateCount: number;
    };

/** Pure: match an address key against a zip's candidate parcel rows. Groups by (county,
 *  subdivision_name) together — not subdivision_name alone, since a boundary zip could in
 *  principle straddle two counties with an identical raw legal-description string. */
export function matchSubdivision(
  inputKey: string,
  rows: ParcelCandidateRow[],
): CommunityResolution {
  const candidates = rows.filter((r) => {
    if (!r.phy_addr1 || !r.zip || !r.subdivision_name || !r.county) return false;
    return addressKey(r.phy_addr1, r.zip) === inputKey;
  });
  if (candidates.length === 0) {
    return { matched: false, reason: "no_parcel_at_address", candidateCount: 0 };
  }

  const distinct = new Map<string, { county: string; subdivisionName: string }>();
  for (const r of candidates) {
    const county = r.county as string;
    const subdivisionName = r.subdivision_name as string;
    distinct.set(`${county}::${subdivisionName}`, { county, subdivisionName });
  }
  if (distinct.size > 1) {
    return {
      matched: false,
      reason: "ambiguous_multiple_subdivisions",
      candidateCount: distinct.size,
    };
  }
  const only = [...distinct.values()][0];
  return { matched: true, county: only.county, subdivisionName: only.subdivisionName };
}

/** The leading whitespace-delimited token of a street string. FDOR's phy_addr1 and every
 *  listing address we hold both start with the house number, so an anchored `TOKEN + " "`
 *  prefix filter narrows the DB query to genuine candidates without a full-zip scan (a zip
 *  can hold 15k-27k parcels — pulling all of them per single-address lookup doesn't scale
 *  once this runs inside a batch build). */
export function houseNumberToken(street: string): string {
  const trimmed = (street || "").trim().toUpperCase();
  const [first] = trimmed.split(/\s+/);
  return first ?? "";
}

/** Escape a string for a Postgres LIKE/ILIKE pattern — % and _ are wildcards there. A house
 *  number token is normally just digits/letters, but a filter value is never trusted blind. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

async function fetchCandidateRows(street: string, zip5: string): Promise<ParcelCandidateRow[]> {
  const token = houseNumberToken(street);
  if (!token || !zip5) return [];
  try {
    const db = createServiceRoleClientUntyped();
    const { data } = await db
      .schema(SCHEMA)
      .from(PARCEL_TABLE)
      .select("county, subdivision_name, zip, phy_addr1")
      .eq("zip", zip5)
      .ilike("phy_addr1", `${escapeLike(token)} %`);
    return Array.isArray(data) ? (data as ParcelCandidateRow[]) : [];
  } catch {
    return [];
  }
}

/** Resolve a street address to at most one community identity. Empty-tolerant: no creds, no
 *  rows, any query error -> "no_parcel_at_address", never throws (four-lane/ODD contract). */
export async function resolveCommunityForAddress(
  street: string,
  zip: string,
): Promise<CommunityResolution> {
  const zip5 = (zip || "").replace(/[^0-9]/g, "").slice(0, 5);
  if (!street || !zip5) {
    return { matched: false, reason: "no_parcel_at_address", candidateCount: 0 };
  }
  const inputKey = addressKey(street, zip5);
  const rows = await fetchCandidateRows(street, zip5);
  return matchSubdivision(inputKey, rows);
}

export interface CommunityStats {
  homeCount: number | null;
  countByType: Record<string, number> | null;
  medianJustValue: number | null;
  sourceUrl: string;
  asOf: string | null;
}

interface NeighborhoodStatRow {
  home_count: number | null;
  count_by_type: Record<string, number> | string | null;
  median_just_value: number | null;
  source_url: string | null;
  as_of: string | null;
}

/** Roll a raw stemmed subdivision_name up to its marketed-community CANONICAL LABEL when
 *  the alias map resolves it (e.g. "HERITAGE BAY" -> "Heritage Bay"), else return the raw
 *  name unchanged. MUST match the fold `ingest/duckdb_pipelines/neighborhood_stats/agg.py`
 *  applies before grouping (both read the same fixtures/community-aliases.json) -- this is
 *  the join-key lockstep the resolver below depends on: neighborhood_stats stores rows keyed
 *  by this same canonical-or-raw label, so a lookup that skipped this step would silently
 *  miss every row the ingest side folds. */
export function canonicalCommunityKey(rawSubdivisionName: string): string {
  const slug = communityForSubdivision(rawSubdivisionName);
  return slug && COMMUNITY_ALIASES[slug] ? COMMUNITY_ALIASES[slug].label : rawSubdivisionName;
}

/** Single-row lookup on the exact (county, subdivision_name) Gap 1 just resolved — a trivial
 *  exact-key join on data the resolver above already produced, not the "queryable by arbitrary
 *  name" surface Gap 2 (docs/handoff/2026-07-14-community-data-into-builder-handoff.md) covers. */
export async function resolveCommunityStats(
  county: string,
  subdivisionName: string,
): Promise<CommunityStats | null> {
  if (!county || !subdivisionName) return null;
  const key = canonicalCommunityKey(subdivisionName);
  try {
    const db = createServiceRoleClientUntyped();
    const { data } = await db
      .schema(SCHEMA)
      .from(NEIGHBORHOOD_TABLE)
      .select("home_count, count_by_type, median_just_value, source_url, as_of")
      .eq("county", county)
      .eq("subdivision_name", key)
      .limit(1);
    if (!Array.isArray(data) || data.length === 0) return null;
    const row = data[0] as NeighborhoodStatRow;

    let countByType: Record<string, number> | null = null;
    if (row.count_by_type && typeof row.count_by_type === "object") {
      countByType = row.count_by_type;
    } else if (typeof row.count_by_type === "string") {
      try {
        countByType = JSON.parse(row.count_by_type) as Record<string, number>;
      } catch {
        countByType = null;
      }
    }

    return {
      homeCount: row.home_count,
      countByType,
      medianJustValue: row.median_just_value,
      sourceUrl: row.source_url ?? "",
      asOf: row.as_of,
    };
  } catch {
    return null;
  }
}

export type CommunityForListing =
  | ({ matched: true; county: string; subdivisionName: string } & CommunityStats)
  | { matched: false; reason: "no_parcel_at_address" | "ambiguous_multiple_subdivisions" };

/** Convenience: identity + stats in one call. Still not wired into ListingFacts — see
 *  docs/handoff/2026-07-14-community-data-into-builder-handoff.md Gap 3. */
export async function resolveCommunityForListing(
  street: string,
  zip: string,
): Promise<CommunityForListing> {
  const resolution = await resolveCommunityForAddress(street, zip);
  if (!resolution.matched) {
    return { matched: false, reason: resolution.reason };
  }
  const stats = await resolveCommunityStats(resolution.county, resolution.subdivisionName);
  return {
    matched: true,
    county: resolution.county,
    subdivisionName: canonicalCommunityKey(resolution.subdivisionName),
    homeCount: stats?.homeCount ?? null,
    countByType: stats?.countByType ?? null,
    medianJustValue: stats?.medianJustValue ?? null,
    sourceUrl: stats?.sourceUrl ?? "",
    asOf: stats?.asOf ?? null,
  };
}

/** The shape `ListingFacts.communityStats` carries -- a listing's resolved-address
 *  neighborhood stats, ready to cite in a deliverable. */
export type ResolvedCommunityStats = {
  subdivisionName: string;
  homeCount: number | null;
  medianJustValue: number | null;
  countByType: Record<string, number> | null;
  sourceUrl: string;
  asOf: string | null;
};

function toMmDdYyyy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
}

/** THE NEIGHBORHOOD, from our own tax-roll parcel data -- universal (every home in Lee +
 *  Collier), unlike `communitySourceLine`'s opportunistic per-listing vendor scrape. ONE
 *  AUTHORITY -- every recipe that cites the resolved neighborhood stats reads it from here.
 *  `median_just_value` is FDOR ASSESSED value, never a sale or list price -- the wording
 *  below is the only phrasing a narrator may use for that number. Returns null when either
 *  figure is absent -- absence stays SILENT, never "no data for this neighborhood". */
export function neighborhoodStatsSourceLine(
  stats: ResolvedCommunityStats | undefined,
): string | null {
  if (!stats || stats.homeCount == null || stats.medianJustValue == null) return null;
  const homes = stats.homeCount.toLocaleString("en-US");
  const value = `$${Math.round(stats.medianJustValue).toLocaleString("en-US")}`;
  const asOf = stats.asOf ? ` as of ${toMmDdYyyy(stats.asOf)}` : "";
  return (
    `THE NEIGHBORHOOD (${stats.subdivisionName}), from the tax roll${asOf}: ${homes} homes, ` +
    `median ASSESSED value ${value}. This is an assessed value, not a sale or list price -- ` +
    `never call it "median home price" or say homes "sell for" this figure.`
  );
}
