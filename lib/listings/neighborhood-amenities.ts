// lib/listings/neighborhood-amenities.ts
//
// THE LISTING -> COMMUNITY ENTRY POINT. Built 08/04/2026 to close the gap the
// operator caught: the 08/03 ingest landed three populated tables
// (steadyapi_neighborhoods 245 / steadyapi_neighborhood_amenities 16,304 /
// steadyapi_property_neighborhood 19,805, live SQL 08/03/2026) and NOTHING read
// them. community-info.ts could only answer when a human TYPED a community name;
// nothing could take a listing and say which community it sits in.
//
// TWO LANES, in this order:
//   1. The vendor's OWN assignment — steadyapi_property_neighborhood, keyed on
//      property_id. This is what the vendor said, not what we inferred. It wins.
//   2. The boundary polygon — the listing's lat/lon ray-cast against stored
//      GeoJSON boundaries. Covers every listing WITH COORDINATES, including the
//      ~15k of the active book not yet paired and anything outside that book
//      entirely (a pasted link, an agent's own address).
//
// WHAT THIS IS NOT — read before writing any prose off it:
// these amenities are NEARBY BUSINESSES in a vendor-fixed radius (5 miles on the
// probed call), NOT amenities inside the community. The probe doc says so
// verbatim: "In-gate community amenities (bundled golf structure, resident-only
// pool) are NOT here." `community_profiles` is the in-gate root; this is the
// around-the-community root. `neighborhoodAmenitiesSourceLine` carries that
// distinction as an explicit prohibition, and its test enforces the wording —
// because a narrator handed "golf: 3" with no qualifier writes "this community
// features three golf courses", which is a claim we cannot source.
//
// Provenance: _RESEARCH/data-and-ingest/2026-08-03-neighborhood-amenities-full-scope.md
// Root catalog: docs/standards/data-roots.md (community / subdivision grain).

// KNOWN-DEBT(data_lake: the steadyapi_neighborhood* family lives in the data_lake schema,
// which the typed Supabase client intentionally does not cover — see utils/supabase/service-role.ts):
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import { pointInGeometry } from "@/lib/geo/ray-cast";

const SCHEMA = "data_lake";
const NEIGHBORHOODS_TABLE = "steadyapi_neighborhoods";
const AMENITIES_TABLE = "steadyapi_neighborhood_amenities";
const ASSIGNMENTS_TABLE = "steadyapi_property_neighborhood";

/** Half-width of the centroid pre-filter box, in degrees (~27 miles). A macro
 *  neighborhood's centroid is comfortably inside this of any point within it, and
 *  filtering server-side is what keeps us from pulling 245 GeoJSON polygons on
 *  every single build (egress — see the standing egress items in SCRATCHPAD.md).
 *  A row with a NULL centroid can't be pre-filtered and is therefore invisible to
 *  the coordinate lane; the property_id lane still resolves it. */
const CENTROID_BOX_DEG = 0.4;

export interface LocationScore {
  label: string;
  value: number;
  text?: string | null;
}

/** A row of data_lake.steadyapi_neighborhoods, as the untyped client hands it back. */
export interface NeighborhoodRow {
  slug_id: string;
  name: string;
  city?: string | null;
  /** Vendor granularity, e.g. "macro_neighborhood" | "neighborhood". Drives the
   *  overlap tie-break below — a more specific level beats a broader one. */
  level?: string | null;
  boundary?: unknown;
  scores?: unknown;
  search_radius?: number | null;
  source_url?: string | null;
  as_of?: string | null;
}

/** A row of data_lake.steadyapi_neighborhood_amenities (only the fields we read). */
export interface AmenityRow {
  slug_id: string;
  category?: string | null;
  name?: string | null;
  distance_from_property?: number | null;
}

export interface AmenityCategorySummary {
  /** The VENDOR's own category token, humanized only by underscore -> space.
   *  Never reinterpreted ("golf" is not relabeled "golf courses"). */
  category: string;
  count: number;
  /** The closest one, when any row in the category carries a real distance. */
  nearest: { name: string; distanceMiles: number } | null;
}

export interface ResolvedNeighborhood {
  slugId: string;
  name: string;
  city: string | null;
  level: string | null;
  scores: LocationScore[];
  /** The vendor's search radius for the amenity sweep. Never defaulted — a null
   *  here means we do not know the radius and must not state one. */
  searchRadiusMiles: number | null;
  amenities: AmenityCategorySummary[];
  sourceUrl: string;
  asOf: string | null;
}

// ── Matching (pure) ──────────────────────────────────────────────────────────────

/** Vendor levels ordered broad -> specific. Anything unrecognized (including null)
 *  is treated as broad, so an unknown level can never beat a known specific one. */
const LEVEL_SPECIFICITY: Record<string, number> = {
  macro_neighborhood: 0,
  neighborhood: 1,
  subdivision: 2,
};

function specificity(level: string | null | undefined): number {
  return LEVEL_SPECIFICITY[String(level ?? "")] ?? 0;
}

/**
 * The neighborhood whose stored boundary contains this point, or null.
 *
 * AMBIGUITY IS NOT A TIE TO BREAK. Two boundaries of the SAME specificity over one
 * point is an unknown, and returns null — the same rule community-lookup.ts applies
 * to condo towers, and for the same reason: whatever comes back here gets stated as
 * a fact in an email, so a wrong community is worse than an absent one.
 *
 * A genuinely nested pair (a sub-neighborhood inside a macro one) is different: the
 * more specific level is the vendor's own signal, and it wins outright.
 */
export function matchNeighborhoodByPoint(
  lat: number,
  lon: number,
  rows: ReadonlyArray<NeighborhoodRow>,
): NeighborhoodRow | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const hits = rows.filter((r) => pointInGeometry(lon, lat, r.boundary));
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0]!;

  const best = Math.max(...hits.map((h) => specificity(h.level)));
  const finalists = hits.filter((h) => specificity(h.level) === best);
  return finalists.length === 1 ? finalists[0]! : null;
}

/** Categories the operator's coverage decree named — surfaced first when present. */
const PRIORITY_CATEGORIES = ["golf", "countryclubs"];

/** Keep the narrator's fact list bounded; the vendor returned 31 categories on one
 *  probed call and an email body is 50-125 words. */
const MAX_CATEGORIES = 8;

/**
 * Per-category counts with the nearest named example. Pure.
 *
 * A row whose `distance_from_property` is absent still COUNTS (it is a real
 * business) but can never become `nearest` — we do not invent a distance to sort by.
 */
export function summarizeAmenities(rows: ReadonlyArray<AmenityRow>): AmenityCategorySummary[] {
  const byCategory = new Map<string, AmenityRow[]>();
  for (const r of rows) {
    const c = String(r.category ?? "").trim();
    if (!c) continue;
    const list = byCategory.get(c);
    if (list) list.push(r);
    else byCategory.set(c, [r]);
  }

  const summaries: AmenityCategorySummary[] = [];
  for (const [category, list] of byCategory) {
    let nearest: { name: string; distanceMiles: number } | null = null;
    for (const r of list) {
      const d = r.distance_from_property;
      const name = String(r.name ?? "").trim();
      if (!name || typeof d !== "number" || !Number.isFinite(d)) continue;
      if (!nearest || d < nearest.distanceMiles) nearest = { name, distanceMiles: d };
    }
    summaries.push({ category, count: list.length, nearest });
  }

  summaries.sort((a, b) => {
    const pa = PRIORITY_CATEGORIES.indexOf(a.category);
    const pb = PRIORITY_CATEGORIES.indexOf(b.category);
    if (pa !== pb) return (pa === -1 ? Infinity : pa) - (pb === -1 ? Infinity : pb);
    if (b.count !== a.count) return b.count - a.count;
    return a.category.localeCompare(b.category);
  });

  return summaries.slice(0, MAX_CATEGORIES);
}

function toMmDdYyyy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
}

function humanize(category: string): string {
  return category.replace(/_/g, " ");
}

/**
 * The narrator line for what is AROUND a listing — the one authority, mirroring
 * `neighborhoodStatsSourceLine` (tax roll) and `communitySourceLine` (detail page).
 *
 * THE PROHIBITION IS THE POINT. These are nearby businesses in a radius, so the
 * line states that and then forbids the in-gate vocabulary by name. Without it a
 * model handed "golf: 3" writes "this community features three golf courses" —
 * fluent, plausible, and unsourced. The wording is test-enforced
 * (neighborhood-amenities.test.ts); do not soften it.
 *
 * Returns null when absent or when there are no amenities — absence stays SILENT,
 * never "no golf nearby", which is a claim our data cannot support either.
 */
export function neighborhoodAmenitiesSourceLine(
  n: ResolvedNeighborhood | undefined | null,
): string | null {
  if (!n || n.amenities.length === 0) return null;

  const where = n.city ? `${n.name}, ${n.city}` : n.name;
  const asOf = n.asOf ? ` as of ${toMmDdYyyy(n.asOf)}` : "";
  const radius =
    n.searchRadiusMiles != null && Number.isFinite(n.searchRadiusMiles)
      ? `${n.searchRadiusMiles} miles`
      : null;

  const items = n.amenities.map((a) => {
    const label = humanize(a.category);
    if (!a.nearest) return `${label}: ${a.count}`;
    return `${label}: ${a.count} (nearest ${a.nearest.name}, ${a.nearest.distanceMiles} mi)`;
  });

  const scope = radius ? `within ${radius}` : "nearby";
  return (
    `AROUND THIS HOME — the vendor places it in ${where}${asOf}. Counted ${scope} of ` +
    `the property: ${items.join("; ")}. ` +
    `THESE ARE NEARBY BUSINESSES ${scope.toUpperCase()} — NOT amenities inside the ` +
    `community. Never write that the community "has", "includes", "features", or ` +
    `"offers" any of them; never "on-site"; never "resident-only"; never imply a ` +
    `bundled membership, a private course, or a gate. You may say a named business ` +
    `is a stated distance away, nothing more.`
  );
}

// ── Lake-backed deps (empty-tolerant; four-lane / ODD contract) ──────────────────

export interface NeighborhoodDeps {
  loadNeighborhoodsNear: (lat: number, lon: number) => Promise<NeighborhoodRow[]>;
  loadNeighborhoodBySlug: (slug: string) => Promise<NeighborhoodRow | null>;
  loadAmenities: (slugId: string) => Promise<AmenityRow[]>;
  loadAssignment: (propertyId: string) => Promise<string | null>;
}

const NEIGHBORHOOD_COLUMNS =
  "slug_id, name, city, level, boundary, scores, search_radius, source_url, as_of";

async function loadNeighborhoodsNearFromLake(lat: number, lon: number): Promise<NeighborhoodRow[]> {
  const db = createServiceRoleClientUntyped();
  const { data } = await db
    .schema(SCHEMA)
    .from(NEIGHBORHOODS_TABLE)
    .select(NEIGHBORHOOD_COLUMNS)
    .gte("centroid_lat", lat - CENTROID_BOX_DEG)
    .lte("centroid_lat", lat + CENTROID_BOX_DEG)
    .gte("centroid_lon", lon - CENTROID_BOX_DEG)
    .lte("centroid_lon", lon + CENTROID_BOX_DEG);
  return Array.isArray(data) ? (data as NeighborhoodRow[]) : [];
}

async function loadNeighborhoodBySlugFromLake(slug: string): Promise<NeighborhoodRow | null> {
  const db = createServiceRoleClientUntyped();
  const { data } = await db
    .schema(SCHEMA)
    .from(NEIGHBORHOODS_TABLE)
    .select(NEIGHBORHOOD_COLUMNS)
    .eq("slug_id", slug)
    .limit(1);
  return Array.isArray(data) && data.length > 0 ? (data[0] as NeighborhoodRow) : null;
}

async function loadAmenitiesFromLake(slugId: string): Promise<AmenityRow[]> {
  const db = createServiceRoleClientUntyped();
  const { data } = await db
    .schema(SCHEMA)
    .from(AMENITIES_TABLE)
    .select("slug_id, category, name, distance_from_property")
    .eq("slug_id", slugId)
    .limit(2000);
  return Array.isArray(data) ? (data as AmenityRow[]) : [];
}

async function loadAssignmentFromLake(propertyId: string): Promise<string | null> {
  const db = createServiceRoleClientUntyped();
  const { data } = await db
    .schema(SCHEMA)
    .from(ASSIGNMENTS_TABLE)
    .select("slug_id")
    .eq("property_id", propertyId)
    .limit(1);
  if (!Array.isArray(data) || data.length === 0) return null;
  const slug = (data[0] as { slug_id?: unknown }).slug_id;
  return typeof slug === "string" && slug ? slug : null;
}

const LAKE_DEPS: NeighborhoodDeps = {
  loadNeighborhoodsNear: loadNeighborhoodsNearFromLake,
  loadNeighborhoodBySlug: loadNeighborhoodBySlugFromLake,
  loadAmenities: loadAmenitiesFromLake,
  loadAssignment: loadAssignmentFromLake,
};

function parseScores(raw: unknown): LocationScore[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Array<Record<string, unknown>>)
    .map((s) => ({
      label: String(s.label ?? ""),
      value: Number(s.value),
      text: typeof s.text === "string" ? s.text : null,
    }))
    .filter((s) => s.label && Number.isFinite(s.value));
}

export interface NeighborhoodLookupInput {
  /** The vendor's listing id, when the caller has one — the exact lane. */
  propertyId?: string | null;
  lat?: number | null;
  lon?: number | null;
}

/**
 * A listing -> its community + what is around it. Vendor pairing first, boundary
 * polygon second, null third.
 *
 * NEVER THROWS. No creds, no rows, a query error, a malformed boundary -> null, and
 * the caller carries on with an absent fact (four-lane / ODD contract). A build must
 * not fail because an amenity lookup did.
 */
export async function resolveNeighborhoodForListing(
  input: NeighborhoodLookupInput,
  deps: NeighborhoodDeps = LAKE_DEPS,
): Promise<ResolvedNeighborhood | null> {
  try {
    const lat = typeof input.lat === "number" ? input.lat : Number.NaN;
    const lon = typeof input.lon === "number" ? input.lon : Number.NaN;

    let row: NeighborhoodRow | null = null;

    // LANE 1 — what the vendor itself assigned. Not an inference.
    if (input.propertyId) {
      const slug = await deps.loadAssignment(input.propertyId);
      if (slug) row = await deps.loadNeighborhoodBySlug(slug);
    }

    // LANE 2 — our own point-in-boundary read, for everything unpaired.
    if (!row && Number.isFinite(lat) && Number.isFinite(lon)) {
      row = matchNeighborhoodByPoint(lat, lon, await deps.loadNeighborhoodsNear(lat, lon));
    }

    if (!row) return null;

    const amenityRows = await deps.loadAmenities(row.slug_id);
    return {
      slugId: row.slug_id,
      name: row.name,
      city: row.city ?? null,
      level: row.level ?? null,
      scores: parseScores(row.scores),
      searchRadiusMiles:
        typeof row.search_radius === "number" && Number.isFinite(row.search_radius)
          ? row.search_radius
          : null,
      amenities: summarizeAmenities(amenityRows),
      sourceUrl: row.source_url ?? "",
      asOf: row.as_of ?? null,
    };
  } catch {
    return null;
  }
}
