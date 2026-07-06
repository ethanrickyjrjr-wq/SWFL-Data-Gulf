// KNOWN-DEBT: untyped service-role client — `community_profiles` and
// `neighborhood_stats` are not in the generated Database types yet (the tables
// don't exist until Sonnet's Phase-1/2/3 ingest lands). Same allowlisted
// exception as lib/email/market-context.ts; swap to the typed client once the
// tables are migrated and types regenerated. Registered in
// verification/supabase-untyped-allowlist.json.
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";

/**
 * Data access for the communities-swfl drill pages. Reads the two lake tables
 * DIRECTLY via the untyped service-role client (the cre-swfl/corridors.ts
 * pattern) — `community_profiles` and `neighborhood_stats` are not in the
 * generated Database types yet, so the untyped client is the allowlisted
 * exception (same as lib/email/market-context.ts), not a hatch abuse.
 *
 * Every fetch is DEFENSIVE: a missing table/column or PostgREST error returns
 * [] so a page renders "coming soon" rather than 500-ing before the Phase-1/2/3
 * backbone lands. The set of communities that have a live page is exactly the
 * set of `community_profiles` rows — the index can never link a 404.
 */

const num = (v: unknown): number | null =>
  v == null || Number.isNaN(Number(v)) ? null : Number(v);
const bool = (v: unknown): boolean | null => (v == null ? null : Boolean(v));
const str = (v: unknown): string | null => (v == null ? null : String(v));

export interface CommunityProfile {
  slug: string;
  label: string | null;
  county: string | null;
  home_count: number | null;
  gated: boolean | null;
  golf_structure: string | null;
  golf_holes: number | null;
  hoa_fee_min: number | null;
  hoa_fee_max: number | null;
  cdd_flag: boolean | null;
  pool: boolean | null;
  tennis: boolean | null;
  pickleball: boolean | null;
  fitness: boolean | null;
  clubhouse: boolean | null;
  on_site_dining: boolean | null;
  boating: boolean | null;
  drive_min_rsw: number | null;
  drive_min_beach: number | null;
  drive_min_downtown: number | null;
  drive_min_hospital: number | null;
  nearby_dining_count: number | null;
  source_url: string | null;
  as_of: string | null;
}

export interface NeighborhoodStat {
  slug: string;
  subdivision_name: string | null;
  county: string | null;
  home_count: number | null;
  count_by_type: Record<string, number> | null;
  median_just_value: number | null;
  source_url: string | null;
  as_of: string | null;
}

/** URL-safe slug from a raw name (kebab-case). Matches the route param. */
export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mapProfile(r: Record<string, unknown>): CommunityProfile {
  return {
    slug: String(r.community_slug ?? r.slug ?? ""),
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

function mapNeighborhood(r: Record<string, unknown>): NeighborhoodStat {
  let byType: Record<string, number> | null = null;
  const raw = r.count_by_type;
  if (raw && typeof raw === "object") byType = raw as Record<string, number>;
  else if (typeof raw === "string") {
    try {
      byType = JSON.parse(raw) as Record<string, number>;
    } catch {
      byType = null;
    }
  }
  const name = str(r.subdivision_name);
  return {
    slug: name ? nameToSlug(name) : "",
    subdivision_name: name,
    county: str(r.county),
    home_count: num(r.home_count),
    count_by_type: byType,
    median_just_value: num(r.median_just_value),
    source_url: str(r.source_url),
    as_of: str(r.as_of),
  };
}

export async function fetchCommunityProfiles(): Promise<CommunityProfile[]> {
  try {
    const db = createServiceRoleClientUntyped();
    const { data, error } = await db.schema("data_lake").from("community_profiles").select("*");
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map(mapProfile).filter((c) => c.slug.length > 0);
  } catch {
    return [];
  }
}

export async function fetchCommunityBySlug(slug: string): Promise<CommunityProfile | null> {
  const all = await fetchCommunityProfiles();
  return all.find((c) => c.slug === slug) ?? null;
}

export async function fetchNeighborhoodStats(): Promise<NeighborhoodStat[]> {
  try {
    const db = createServiceRoleClientUntyped();
    const { data, error } = await db.schema("data_lake").from("neighborhood_stats").select("*");
    if (error || !data) return [];
    return (data as Record<string, unknown>[])
      .map(mapNeighborhood)
      .filter((n) => n.slug.length > 0);
  } catch {
    return [];
  }
}

export async function fetchNeighborhoodBySlug(slug: string): Promise<NeighborhoodStat | null> {
  const all = await fetchNeighborhoodStats();
  return all.find((n) => n.slug === slug) ?? null;
}
