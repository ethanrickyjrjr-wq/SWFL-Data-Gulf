import type { PackDefinition, PackOutput } from "../types/pack.mts";
import type { RawFragment } from "../types/fragment.mts";
import type {
  BrainOutputProducerResult,
  BrainOutputMetric,
  BrainOutputMetricSource,
  BrainOutputDetailTable,
  BrainOutputDetailRow,
} from "../types/brain-output.mts";
import {
  communitiesSwflSource,
  type CommunitiesSwflSummary,
  type CommunityProfileRow,
} from "../sources/communities-swfl-source.mts";

const SOURCE_ID = "communities_swfl";

/**
 * communities-swfl — SWFL community intelligence (Lee + Collier).
 *
 * Tier-1 Reporter — pure deterministic aggregation, no LLM
 * (skipSynthesisAgent/skipTriageAgent), no upstream brains. Same class as
 * active-listings-swfl: `direction: "neutral"`, `magnitude: 0`, so it cannot
 * skew master's market vote — it rides as cited, route-able context.
 *
 * TWO TIERS from two lake tables (see communities-swfl-source.mts):
 *   Tier 1 — data_lake.neighborhood_stats: EVERY residential parcel rolled up
 *     to its subdivision/neighborhood (home_count, count-by-type, median
 *     just-value). The universal backbone.
 *   Tier 2 — data_lake.community_profiles: the ~300 marketed golf/gated
 *     communities with golf/fee/amenity (scrape) + drive-time/nearby (Mapbox).
 *
 * HEADLINE key_metrics span both tiers (homes catalogued, homes-in-gated-
 * communities — the operator's ask, community count, bundled-golf share, median
 * HOA midpoint). Each emits ONLY when its data is present — an absent upstream
 * suppresses its metric, never fakes one. The ~300-community catalog rides in
 * detail_tables (the LOOKUP surface a downstream Claude answers a specific
 * community from — vocab-exempt keys).
 *
 * Empty-tolerant by construction: wired into master before the Phase-1/2/3 data
 * lands (cron parked), it degrades to a neutral "no data yet" brain and lights
 * up automatically once the backbone tables populate.
 */

let lastSummary: CommunitiesSwflSummary | null = null;
let lastFetchedAt: string | null = null;

const fmtUsd = (n: number): string => `$${Math.round(n).toLocaleString("en-US")}`;
const fmtK = (n: number): string => n.toLocaleString("en-US");
const fmtPct = (n: number): string => `${n.toFixed(1)}%`;

const GOLF_STRUCTURES = new Set(["bundled", "equity", "optional", "none"]);

// L1 — Stage-4 lint scans the serialized OUTPUT JSON line-by-line
// (facts-only-lint bans `your`/second-person imperatives; smoothing-lint bans
// vague quantifiers like "roughly"/"estimated from"). Our catalog cells are
// structured (enums, counts, flags, community proper names) so this is a LATENT
// guard today — but the moment a scraped free-text field feeds a cell, this
// keeps a banned token from aborting the build. Applied to every string cell.
const FACTS_ONLY_STRIP =
  /\byou\s+(?:must|should|shall|will|need to|have to|are|can|may)\b|\byour\b|\bignore\s+(?:all|any|previous|the|everything)\b|\bfrom now on\b/gi;
const SMOOTHING_STRIP =
  /\b(?:approximately|roughly|ballpark|smoothed|interpolated|extrapolated)\b|on the order of|estimated from|rounded to|in the range of/gi;
function sanitizeCatalogString(s: string): string {
  return s.replace(FACTS_ONLY_STRIP, " ").replace(SMOOTHING_STRIP, " ").replace(/\s+/g, " ").trim();
}

function makeSource(citation: string, fetchedAt: string, url: string): BrainOutputMetricSource {
  return { url, fetched_at: fetchedAt, tier: 2, citation };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

function communitiesOutputProducer(_out: PackOutput): BrainOutputProducerResult {
  const summary = lastSummary;
  const fetchedAt = lastFetchedAt ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const noBackbone = !summary || summary.backbone == null;
  const noCommunities = !summary || summary.communities.length === 0;

  if (!summary || (noBackbone && noCommunities)) {
    return {
      conclusion:
        "communities-swfl: no community data yet. Neither data_lake.neighborhood_stats " +
        "(Tier-1 parcel name-join) nor data_lake.community_profiles (Tier-2 marketed " +
        "communities) returned rows. Run the communities-backbone pipeline.",
      key_metrics: [],
      caveats: [
        "data_lake.neighborhood_stats and data_lake.community_profiles both returned 0 rows — the Phase-1/2/3 backbone has not landed.",
      ],
      direction: "neutral",
      magnitude: 0,
      drivers: [],
      overrides: [],
      contradicts: [],
      exogenous_signals: [],
    };
  }

  const asOf = summary.as_of ?? fetchedAt.slice(0, 10);
  const key_metrics: BrainOutputMetric[] = [];

  // --- Tier-1 backbone metrics -------------------------------------------
  const backbone = summary.backbone;
  if (backbone && backbone.total_homes > 0) {
    key_metrics.push({
      metric: "total_homes_catalogued_swfl",
      label: "SWFL homes catalogued to a neighborhood (Lee + Collier)",
      value: backbone.total_homes,
      direction: "stable",
      variable_type: "extensive",
      units: "homes",
      display_format: "count",
      source: makeSource(
        `${fmtK(backbone.total_homes)} residential parcels across ${fmtK(backbone.subdivision_count)} SWFL neighborhoods, each assigned by parcel name-join as of ${asOf}`,
        fetchedAt,
        summary.neighborhood_source_url,
      ),
    });
  }

  // --- Tier-2 marketed-community metrics ---------------------------------
  const communities = summary.communities;
  if (communities.length > 0) {
    key_metrics.push({
      metric: "marketed_communities_count_swfl",
      label: "SWFL marketed golf/gated communities catalogued",
      value: communities.length,
      direction: "stable",
      variable_type: "extensive",
      units: "communities",
      display_format: "count",
      source: makeSource(
        `${fmtK(communities.length)} marketed SWFL communities profiled (golf/fee/amenity) as of ${asOf}`,
        fetchedAt,
        summary.community_source_url,
      ),
    });

    // homes-in-gated-communities — the Tier-1 output the operator asked for.
    // Only emit when at least one community carries a known gated flag AND a
    // home_count, so an all-null seed never fakes a 0.
    const gatedHomes = communities
      .filter((c) => c.gated === true && c.home_count != null)
      .reduce((sum, c) => sum + (c.home_count ?? 0), 0);
    const anyGatedKnown = communities.some((c) => c.gated === true && c.home_count != null);
    if (anyGatedKnown && gatedHomes > 0) {
      key_metrics.push({
        metric: "homes_in_gated_communities_swfl",
        label: "SWFL homes inside gated communities",
        value: gatedHomes,
        direction: "stable",
        variable_type: "extensive",
        units: "homes",
        display_format: "count",
        source: makeSource(
          `${fmtK(gatedHomes)} SWFL homes fall inside a gated marketed community (count of homes whose community carries the gated flag) as of ${asOf}`,
          fetchedAt,
          summary.community_source_url,
        ),
      });
    }

    // bundled-golf share — over communities with a KNOWN golf_structure.
    const knownGolf = communities.filter(
      (c) => c.golf_structure != null && GOLF_STRUCTURES.has(c.golf_structure),
    );
    if (knownGolf.length > 0) {
      const bundled = knownGolf.filter((c) => c.golf_structure === "bundled").length;
      const share = (bundled / knownGolf.length) * 100;
      key_metrics.push({
        metric: "golf_bundled_community_share_swfl",
        label: "SWFL communities where golf is bundled (share of golf communities)",
        value: Number(share.toFixed(1)),
        direction: "stable",
        variable_type: "intensive",
        units: "percent",
        display_format: "percent",
        source: makeSource(
          `${bundled} of ${knownGolf.length} SWFL golf communities bundle golf into membership (${fmtPct(share)}) as of ${asOf}`,
          fetchedAt,
          summary.community_source_url,
        ),
      });
    }

    // median HOA-range midpoint — over communities with both fee bounds.
    const midpoints = communities
      .filter((c) => c.hoa_fee_min != null && c.hoa_fee_max != null)
      .map((c) => (c.hoa_fee_min! + c.hoa_fee_max!) / 2);
    const medHoa = median(midpoints);
    if (medHoa != null) {
      key_metrics.push({
        metric: "median_hoa_fee_midpoint_swfl",
        label: "SWFL marketed-community median HOA fee (range midpoint)",
        value: Math.round(medHoa),
        direction: "stable",
        variable_type: "intensive",
        units: "USD",
        display_format: "currency",
        source: makeSource(
          `median HOA fee across ${midpoints.length} SWFL marketed communities (range midpoint): ${fmtUsd(medHoa)} as of ${asOf}`,
          fetchedAt,
          summary.community_source_url,
        ),
      });
    }
  }

  // --- detail_tables: the marketed-community catalog (lookup surface) -----
  const detail_tables: BrainOutputDetailTable[] = [];
  if (communities.length > 0) {
    const tableSource = makeSource(
      `SWFL marketed communities — golf structure, fees, amenities, home count and drive-times per community, as of ${asOf}`,
      fetchedAt,
      summary.community_source_url,
    );
    detail_tables.push({
      id: "marketed_communities",
      title: "SWFL marketed golf/gated communities",
      grain: "community",
      columns: [
        { id: "county", label: "County" },
        { id: "gated", label: "Gated" },
        { id: "golf_structure", label: "Golf" },
        { id: "golf_holes", label: "Golf holes", display_format: "count", units: "holes" },
        { id: "home_count", label: "Homes", display_format: "count", units: "homes" },
        { id: "hoa_fee_min", label: "HOA fee (low)", display_format: "currency", units: "USD" },
        { id: "hoa_fee_max", label: "HOA fee (high)", display_format: "currency", units: "USD" },
        { id: "cdd_flag", label: "CDD" },
        { id: "pool", label: "Pool" },
        { id: "tennis", label: "Tennis" },
        { id: "pickleball", label: "Pickleball" },
        { id: "fitness", label: "Fitness" },
        { id: "clubhouse", label: "Clubhouse" },
        { id: "on_site_dining", label: "On-site dining" },
        { id: "boating", label: "Boating/marina" },
        { id: "drive_min_rsw", label: "Drive to RSW", display_format: "count", units: "minutes" },
        {
          id: "drive_min_beach",
          label: "Drive to Gulf beach",
          display_format: "count",
          units: "minutes",
        },
        {
          id: "drive_min_downtown",
          label: "Drive downtown",
          display_format: "count",
          units: "minutes",
        },
        {
          id: "drive_min_hospital",
          label: "Drive to hospital",
          display_format: "count",
          units: "minutes",
        },
        {
          id: "nearby_dining_count",
          label: "Nearby dining",
          display_format: "count",
          units: "places",
        },
      ],
      rows: communities.filter((c) => c.community_slug.length > 0).map((c) => rowOfCommunity(c)),
      source: tableSource,
      note: "One row per marketed community. Golf/fee/amenity from named-web sources; drive-times and nearby counts from Mapbox — each cell carries provenance in community_profiles.",
    });
  }

  // --- conclusion --------------------------------------------------------
  const parts: string[] = [];
  if (backbone && backbone.total_homes > 0) {
    parts.push(
      `${fmtK(backbone.total_homes)} SWFL homes catalogued across ${fmtK(backbone.subdivision_count)} neighborhoods (Lee + Collier)`,
    );
  }
  if (communities.length > 0) {
    parts.push(`${fmtK(communities.length)} marketed golf/gated communities profiled`);
  }
  const conclusion =
    (parts.length > 0 ? parts.join("; ") : "SWFL community catalogue") +
    ` (as of ${asOf}). Golf-or-not, fees, amenities, home count and drive-times per community ride in the community catalogue for a specific-community lookup.`;

  return {
    conclusion,
    key_metrics,
    detail_tables,
    caveats: [
      "Neighborhood home counts are authoritative from our parcel name-join (Lee + Collier tax rolls); a built-out single-name community can differ ~7% from a marketed-community source because a marketed community spans several platted subdivisions.",
      "Golf structure, HOA fee ranges and amenities are cited to named real-estate sources (naplesgolfguy / 55places / realtyofnaples); drive-times and nearby counts are computed by Mapbox. Each carries its own source and as-of.",
      "Marketed-community coverage is the ~300 branded golf/gated communities, not every neighborhood — a non-branded neighborhood still resolves to its parcel-derived stats.",
    ],
    direction: "neutral",
    magnitude: 0,
    drivers: [],
    overrides: [],
    contradicts: [],
    exogenous_signals: [],
    grain_boundary: {
      not_available: [
        "Per-home HOA dues or golf membership pricing for a specific address — community-level fee ranges only.",
        "Communities outside Lee + Collier — the other four SWFL counties are not catalogued in v1.",
      ],
      finest_grain: "community-annual",
      routes: [
        "Golf structure, fees, amenities, home count and drive-times are tracked per community — want the full profile for a specific community?",
        "Every home in Lee + Collier rolls up to a neighborhood with real counts and median value — want the stats for a specific neighborhood or address?",
      ],
    },
  };
}

function rowOfCommunity(c: CommunityProfileRow): BrainOutputDetailRow {
  const golf =
    c.golf_structure != null && GOLF_STRUCTURES.has(c.golf_structure)
      ? sanitizeCatalogString(c.golf_structure)
      : null;
  return {
    key: c.community_slug,
    label: sanitizeCatalogString(c.label ?? c.community_slug),
    cells: {
      county: c.county,
      gated: c.gated,
      golf_structure: golf,
      golf_holes: c.golf_holes,
      home_count: c.home_count,
      hoa_fee_min: c.hoa_fee_min,
      hoa_fee_max: c.hoa_fee_max,
      cdd_flag: c.cdd_flag,
      pool: c.pool,
      tennis: c.tennis,
      pickleball: c.pickleball,
      fitness: c.fitness,
      clubhouse: c.clubhouse,
      on_site_dining: c.on_site_dining,
      boating: c.boating,
      drive_min_rsw: c.drive_min_rsw,
      drive_min_beach: c.drive_min_beach,
      drive_min_downtown: c.drive_min_downtown,
      drive_min_hospital: c.drive_min_hospital,
      nearby_dining_count: c.nearby_dining_count,
    },
  };
}

export const COMMUNITIES_SWFL_SCOPE =
  "Southwest Florida community intelligence (Lee + Collier) — every residential parcel " +
  "name-joined to its neighborhood with authoritative home count, count-by-type and median " +
  "just-value (Tier 1), plus the ~300 marketed golf/gated communities profiled with golf " +
  "structure, HOA fee range, amenities (named-web sources) and drive-times/nearby counts " +
  "(Mapbox) as a per-community lookup (Tier 2). Deterministic aggregation, no LLM synthesis; " +
  "neutral reporter (never a market-direction vote).";

export const communitiesSwfl: PackDefinition = {
  id: "communities-swfl",
  brain_id: "communities-swfl",
  public_label: "SWFL Communities",
  domain: "real-estate",
  scope: COMMUNITIES_SWFL_SCOPE,
  ttl_seconds: 180 * 24 * 60 * 60, // ~6 months — golf/fees/amenities rarely move; values refresh on the annual tax roll

  sources: [communitiesSwflSource],
  input_brains: [],

  fitScore: () => 0.8,

  skipSynthesisAgent: true,
  skipTriageAgent: true,

  corpusSummary: (allFragments: RawFragment[]) => {
    const fragment = allFragments.find(
      (f) =>
        f.source_id === SOURCE_ID &&
        (f.normalized as { kind?: string }).kind === "communities-swfl-summary",
    );
    lastSummary = fragment ? (fragment.normalized as CommunitiesSwflSummary) : null;
    lastFetchedAt = fragment?.fetched_at ?? null;

    if (!lastSummary) return [];
    const backbone = lastSummary.backbone;
    return [
      {
        topic: "communities_swfl_snapshot",
        fact: "SWFL community catalogue ",
        value:
          `${backbone ? `${fmtK(backbone.total_homes)} homes in ${fmtK(backbone.subdivision_count)} neighborhoods` : "backbone pending"}; ` +
          `${lastSummary.communities.length} marketed communities profiled.`,
        source_fragment_ids: [],
      },
    ];
  },

  outputProducer: communitiesOutputProducer,

  preferences: [
    "Community-level intelligence: golf-or-not, fees, amenities, home count, and drive-times are the buy/no-buy signals — golf structure and HOA fees are first-class.",
    "Neighborhood home counts and median value are authoritative from our parcel name-join; marketed-community facts are cited to named real-estate sources.",
  ],
  activeProject:
    "communities-swfl: SWFL community intelligence (Lee + Collier) — universal neighborhood backbone (every home name-joined to its subdivision) + ~300 marketed golf/gated communities profiled with golf/fee/amenity + Mapbox access.",
  prompts: {
    triageContext:
      "Fragment is a communities-swfl-summary with a Tier-1 neighborhood backbone rollup and a Tier-2 marketed-community catalog. Decision-relevant by construction; pack is pure deterministic aggregation.",
    synthesisContext:
      "This pack runs no synthesis agent (skipSynthesisAgent). BrainOutput built by communitiesOutputProducer from the neighborhood_stats + community_profiles lake tables.",
  },
};
