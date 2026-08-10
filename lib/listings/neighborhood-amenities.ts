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

/** Half-width of the centroid pre-filter box, in degrees. Server-side filtering is
 *  what keeps us from pulling every stored GeoJSON polygon on every build (egress —
 *  see the standing egress items in SCRATCHPAD.md).
 *
 *  MEASURED, not guessed (live SQL 08/04/2026, all 429 stored neighborhoods): the
 *  largest centroid-to-boundary-vertex distance is 0.0789 deg, so 0.4 carries ~5x
 *  margin — no real neighborhood can be filtered out by this box. Re-measure if the
 *  vendor ever stores something county-sized:
 *    SELECT max(GREATEST(abs(centroid_lat-(pt->>1)::numeric), abs(centroid_lon-(pt->>0)::numeric)))
 *  Also measured: 0 of 429 rows have a NULL centroid, so the coordinate lane loses
 *  nothing today. A NULL-centroid row would be invisible to it (the property_id lane
 *  still resolves that one). */
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
 *  is treated as broad, so an unknown level can never beat a known specific one.
 *
 *  MEASURED, NOT ASSUMED (live census of all 429 stored areas, 08/04/2026):
 *    neighborhood 78 · macro_neighborhood 7 · residential_neighborhood 341 · sub_neighborhood 3
 *  Those four are the complete set the vendor actually emits. This table first
 *  shipped with "subdivision", a level the vendor NEVER returns, and without
 *  `residential_neighborhood`/`sub_neighborhood` — the two that carry the real
 *  community names. Both unmapped levels fell to 0, so the bare `neighborhood`
 *  level (specificity 1) outranked them; but in this vendor's data `neighborhood`
 *  is a ROAD-CORRIDOR sector ("Jacaranda", "West End", "Eisenhower") while
 *  `residential_neighborhood` is the community a buyer would name ("Bella Vida",
 *  "Sanibel Bayous"). Over 6,000 real listing coordinates, 40 of the 102
 *  multi-boundary hits therefore resolved to the corridor instead of the
 *  community — an actively WRONG stated fact, not a silent null. Re-measure
 *  before adding a level:
 *    SELECT level, count(*) FROM data_lake.steadyapi_neighborhoods GROUP BY 1; */
const LEVEL_SPECIFICITY: Record<string, number> = {
  macro_neighborhood: 0,
  neighborhood: 1,
  sub_neighborhood: 2,
  residential_neighborhood: 3,
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
/**
 * A DISTANCE THE WAY A PERSON SAYS IT — quarters and halves, never two decimals.
 *
 * Operator decree 08/10/2026, off "a grocery store 0.57 miles away" in the New Listing
 * showcase: "NEED TO MAKE SURE THESE ARE 1/2 MILE OR QUARTER MILE. WE AREN'T BEING EXACT
 * HERE." Same lesson the open-house invite learned on 08/06/2026 ("No one says a fucking
 * golf course .57 miles away") — applied HERE, at the one source line every address-spine
 * email reads, so no recipe can print a decimal distance again. Playbook §1.9 carries the
 * universal rule; this function is its root. "About" keeps it a characterization; the
 * bands only ever COARSEN what we measured, never sharpen it.
 */
export function humanDistance(mi: number): string {
  if (!Number.isFinite(mi) || mi < 0) return "nearby";
  if (mi < 0.375) return "about a quarter mile";
  if (mi < 0.625) return "about half a mile";
  if (mi < 0.875) return "about three-quarters of a mile";
  if (mi < 1.25) return "about a mile";
  if (mi < 1.75) return "about a mile and a half";
  return `about ${Math.round(mi)} miles`;
}

export function neighborhoodAmenitiesSourceLine(
  n: ResolvedNeighborhood | undefined | null,
): string | null {
  if (!n || n.amenities.length === 0) return null;

  const asOf = n.asOf ? ` as of ${toMmDdYyyy(n.asOf)}` : "";
  const radius =
    n.searchRadiusMiles != null && Number.isFinite(n.searchRadiusMiles)
      ? `${n.searchRadiusMiles} miles`
      : null;

  // NO BUSINESS NAMES. shared.ts's authorListingNarrative makes every fact line a
  // SETTLED claim, and auditClaims derives allowedFeatures from that settled text
  // (claims.ts, "unsourced-feature"). A name here would license its own words as
  // sourced HOUSE features: "Gulf Harbour Marina" makes "gulf" sourced, "Bay Colony
  // Golf Club" makes "bay" sourced — and the model may then put the house on the gulf.
  // Identical shape to the BRAND_NAME hole where "SWFL Data Gulf" licensed a false
  // "gulf view", but across 29k+ business rows instead of one string. The name was
  // never load-bearing for an email; the category, the count, and the distance are.
  // Test-enforced ("emits NO business names"). Do not add the name back.
  const items = n.amenities.map((a) => {
    const label = humanize(a.category);
    if (!a.nearest) return `${label}: ${a.count}`;
    return `${label}: ${a.count} (nearest ${humanDistance(a.nearest.distanceMiles)})`;
  });

  const scope = radius ? `within ${radius}` : "nearby";

  // THE AREA NAME IS ONLY SPOKEN AT COMMUNITY GRAIN. Measured live 08/04/2026 across
  // all 21,008 rows of the pairing edge: 18,013 (86%) sit at `neighborhood` or
  // `macro_neighborhood`, and at those levels this vendor's area names are ROADS AND
  // CITY SECTORS — Lehigh Acres boulevards (Eisenhower 2,074 listings, Joel 1,182,
  // Richmond 1,048, Harris 795), Cape Coral parkways (Burnt Store 1,493, Mariner
  // 1,335, Diplomat 1,204, Pelican 1,124, Hancock 981). Naming one would tell a buyer
  // the home is in a neighborhood called "Eisenhower", which is a street. The value is
  // vendor-sourced so no no-invention lint would ever catch it; this is the only guard.
  // Only 2,995 edges (14%) sit at `residential_neighborhood`/`sub_neighborhood`, where
  // the name IS what a buyer would say (Bella Vida, Sanibel Bayous, Magnolia Landing).
  // An unrecognized level withholds the name, same broad-by-default posture as
  // LEVEL_SPECIFICITY. The COUNTS are unaffected either way — they are measured from
  // the property, not from the area — so the placement clause drops and the sourced
  // facts stay. Test-enforced; re-measure the grain split before loosening this.
  const COMMUNITY_GRAIN = new Set(["residential_neighborhood", "sub_neighborhood"]);
  const placement = COMMUNITY_GRAIN.has(String(n.level ?? ""))
    ? ` the vendor places it in ${n.city ? `${n.name}, ${n.city}` : n.name}${asOf}, and`
    : "";

  return (
    `AROUND THIS HOME —${placement} counted ${scope} of ` +
    `the property${asOf && !placement ? ` (${asOf.trim()})` : ""}: ${items.join("; ")}. ` +
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
