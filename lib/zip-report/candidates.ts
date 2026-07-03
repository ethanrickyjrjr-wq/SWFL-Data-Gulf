// lib/zip-report/candidates.ts
//
// Builds the ZIP page's SignalCandidate pool (spec §2, pool v1) from data the page
// already loads: housing_by_zip (all-ZIP distribution held in the brain),
// flood_by_zip (all-ZIP detail table, key_metrics fallback), permits_by_zip, and
// census ACS covariates + their SWFL distribution. Pure math over held values —
// percentiles/ranks are computed from held distributions, movement restates held
// deltas. No invented numbers; an absent metric simply doesn't compete.
import { percentileOf, type SignalCandidate } from "./signal-rank";
import { findGap, type MetricGapCoverage } from "@/lib/figures/metric-gaps";
// KNOWN-DEBT(data_lake: census_acs_zcta lives in the data_lake schema (typed public only))
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import { resolveZip } from "@/refinery/lib/zip-resolver.mts";

/** Denominator for the flood key_metrics fallback (matches the page's historical constant). */
export const TOTAL_SWFL_ZIPS = 57;

export interface GapSlot {
  metric_key: string;
  label: string;
  coverage: MetricGapCoverage;
}

export interface FloodZipRow {
  zip: string;
  aal: number;
  /** Held SWFL percentile rank (from the brain), when present. */
  pctRank: number | null;
}

export interface CensusValue {
  key: string;
  label: string;
  value: number;
  display: string;
  sourceLabel: string;
  sourceUrl: string;
}

export interface CandidateInput {
  zip: string;
  /** packId:tableId -> table data, for every pack the registry references. */
  registryTables: Map<string, RegistryTableData>;
  floodRows: FloodZipRow[];
  floodForZip: FloodZipRow | null;
  floodSource?: { label: string; url: string };
  permitsCounts: Map<string, number>;
  permitsSource?: { label: string; url: string };
  censusValues: CensusValue[];
  censusDistribution: Map<string, number[]>;
}

const fmtUsdShort = (v: number): string => {
  if (v >= 1_000_000) return "$" + (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return "$" + Math.round(v / 1_000) + "K";
  return "$" + v.toLocaleString("en-US");
};

const arrow = (n: number) => (n > 0 ? "↑" : "↓");

// ---------------------------------------------------------------------------
// Concept-deduped registry (spec 2026-07-03 zip-hero-pool-all-brains). Widens
// the pool from 4 sources to 13 zip-grain packs while keeping "concept" — not
// column — as the unit that competes, so overlapping measurements of the same
// real-world thing (home value, days-on-market, ...) never occupy two ranked
// slots. A pack's headline metric is either the concept's PRIMARY (competes)
// or DEMOTED (cited in the rail under whichever pack won that concept).
// ---------------------------------------------------------------------------

export interface ZipDetailRow {
  key: string;
  cells: Record<string, number | string | boolean | null>;
}

export interface RegistryTableData {
  rows: ZipDetailRow[];
  source?: { label: string; url: string };
}

export interface DemotedFigure {
  concept: string;
  label: string;
  display: string;
  sourceLabel: string;
  sourceUrl: string;
}

export interface ZipMetricSource {
  /** Dedup key — "home_value", "days_on_market", ... Two entries sharing a concept
   * compete for the SAME slot; only one (the `role: "primary"`) wins it. */
  concept: string;
  packId: string;
  tableId: string;
  cell: string;
  role: "primary" | "demoted";
  /** Shared by BOTH sides of an approved macro/micro pair — footnote linkage only,
   * never scoring. The two entries sharing a pairId have DIFFERENT concepts (they
   * both compete independently) but are cross-referenced when both are held. */
  pairId?: string;
  key: string;
  label: string;
  sub: string;
  display: (v: number) => string;
  /** A column already holding a signed YoY %, restated verbatim as the movement text. */
  movementCell?: string;
  /** Escape hatch for movement that isn't a plain YoY-%-column (e.g. DOM's day-delta). */
  computeMovement?: (
    row: ZipDetailRow,
    v: number,
  ) => { movementPct: number | null; movementText?: string };
}

// Reuses the existing module-private `fmtUsdShort`/`arrow` helpers already defined
// earlier in this file (used today by the flood block) — not redefined here.
const fmtUsdPerMonth = (v: number): string => `${fmtUsdShort(v)}/mo`;
const fmtPct = (v: number): string => `${v}%`;
const fmtCount = (v: number): string => v.toLocaleString("en-US");
const fmtRatio = (v: number): string => `${v.toFixed(2)}x`;
const fmtScore = (v: number): string => v.toFixed(0);
const domMovement = (row: ZipDetailRow, v: number) => {
  const days = row.cells["median_dom_yoy_days"];
  if (typeof days !== "number" || !Number.isFinite(days) || days === 0)
    return { movementPct: null };
  const prior = v - days;
  const movementPct = prior > 0 ? Math.round((days / prior) * 100) : null;
  return { movementPct, movementText: `${arrow(days)} ${Math.abs(days)} days YoY` };
};
const priceMovement = (row: ZipDetailRow, _v: number) => {
  const yoy = row.cells["median_sale_price_yoy_pct"];
  if (typeof yoy !== "number" || !Number.isFinite(yoy) || yoy === 0) return { movementPct: null };
  return { movementPct: yoy, movementText: `${arrow(yoy)} ${Math.abs(yoy)}% YoY` };
};

export const ZIP_METRIC_SOURCES: ZipMetricSource[] = [
  // ── Housing (housing-swfl, housing_by_zip) — carried over from pool v1 ──
  // pairId "home_value" links this to home_value_zhvi below — the footnote
  // cross-reference test requires BOTH sides of a pair to carry the same pairId.
  {
    concept: "home_value",
    packId: "housing-swfl",
    tableId: "housing_by_zip",
    cell: "median_sale_price",
    role: "primary",
    pairId: "home_value",
    key: "median_sale_price",
    label: "Median Home Value",
    sub: "90-day median sale price",
    display: fmtUsdShort,
    computeMovement: priceMovement,
  },
  {
    concept: "days_on_market",
    packId: "housing-swfl",
    tableId: "housing_by_zip",
    cell: "median_dom",
    role: "primary",
    key: "median_dom",
    label: "Days on Market",
    sub: "90-day median",
    display: (v) => `${v} days`,
    computeMovement: domMovement,
  },
  {
    concept: "sale_to_list_ratio",
    packId: "housing-swfl",
    tableId: "housing_by_zip",
    cell: "avg_sale_to_list_pct",
    role: "primary",
    key: "avg_sale_to_list_pct",
    label: "Sale-to-List Ratio",
    sub: "Average, 90-day window",
    display: fmtPct,
  },
  {
    concept: "months_of_supply",
    packId: "housing-swfl",
    tableId: "housing_by_zip",
    cell: "months_of_supply",
    role: "primary",
    key: "months_of_supply",
    label: "Months of Supply",
    sub: "At the current sales pace",
    display: (v) => `${v} mo`,
  },
  {
    concept: "homes_sold",
    packId: "housing-swfl",
    tableId: "housing_by_zip",
    cell: "homes_sold",
    role: "primary",
    key: "homes_sold",
    label: "Homes Sold",
    sub: "Last 90 days",
    display: fmtCount,
  },
  {
    concept: "active_inventory",
    packId: "housing-swfl",
    tableId: "housing_by_zip",
    cell: "inventory",
    role: "primary",
    key: "inventory",
    label: "Active Inventory",
    sub: "Homes for sale now",
    display: fmtCount,
  },

  // ── Home value macro index — pairId "home_value" with housing-swfl above ──
  {
    concept: "home_value_zhvi",
    packId: "home-values-swfl",
    tableId: "home_values_by_zip",
    cell: "home_value_zhvi",
    role: "primary",
    pairId: "home_value",
    key: "home_value_zhvi",
    label: "Zillow Home Value Index",
    sub: "Monthly index — macro trend",
    display: fmtUsdShort,
    movementCell: "value_yoy_pct",
  },

  // ── Rent pair ──
  {
    concept: "rent_level",
    packId: "rentals-swfl",
    tableId: "rentals_by_zip",
    cell: "rent_index_latest",
    role: "primary",
    pairId: "rent_level",
    key: "rent_index_latest",
    label: "Zillow Rent Index (ZORI)",
    sub: "Monthly index — macro trend",
    display: fmtUsdPerMonth,
    movementCell: "rent_yoy_pct",
  },
  {
    concept: "asking_rent_median",
    packId: "market-temperature-swfl",
    tableId: "market_temperature_by_zip",
    cell: "median_rent_price",
    role: "primary",
    pairId: "rent_level",
    key: "median_rent_price",
    label: "Median Asking Rent",
    sub: "Current realtor.com listing median — micro snapshot",
    display: fmtUsdPerMonth,
  },

  // ── Rental inventory (distinct from the ZORI index and the median above) ──
  {
    concept: "rental_inventory",
    packId: "active-rentals-swfl",
    tableId: "active_rentals_by_zip",
    cell: "rental_listing_count",
    role: "primary",
    key: "rental_listing_count",
    label: "Active Rental Listings",
    sub: "For-rent inventory, live count",
    display: fmtCount,
  },

  // ── Commercial permits (distinct concept from residential permits_90d) ──
  {
    concept: "permits_commercial",
    packId: "permits-commercial-swfl",
    tableId: "commercial_permits_by_zip",
    cell: "count",
    role: "primary",
    key: "commercial_permits",
    label: "Commercial Permits",
    sub: "Issued, current year",
    display: fmtCount,
  },

  // ── Collier-only: assessed value + Save-Our-Homes gap ──
  {
    concept: "assessed_value",
    packId: "properties-collier-value",
    tableId: "collier_parcels_by_zip",
    cell: "median_jv",
    role: "primary",
    key: "assessed_value",
    label: "Tax-Assessed Value",
    sub: "Collier County median just value",
    display: fmtUsdShort,
  },
  {
    concept: "soh_gap",
    packId: "properties-collier-value",
    tableId: "collier_parcels_by_zip",
    cell: "soh_gap_median_pct",
    role: "primary",
    key: "soh_gap",
    label: "Save-Our-Homes Gap",
    sub: "Collier County — % of value shielded from tax by the cap",
    display: fmtPct,
  },

  // ── Tier spread ──
  {
    concept: "tier_spread",
    packId: "tier-divergence-swfl",
    tableId: "tier_divergence_by_zip",
    cell: "spread_ratio",
    role: "primary",
    key: "tier_spread",
    label: "Luxury/Starter Spread",
    sub: "Top-tier ÷ bottom-tier home value",
    display: fmtRatio,
    movementCell: "spread_yoy_pct",
  },

  // ── market-temperature-swfl's two net-new concepts ──
  {
    concept: "price_per_sqft",
    packId: "market-temperature-swfl",
    tableId: "market_temperature_by_zip",
    cell: "median_price_per_sqft",
    role: "primary",
    key: "price_per_sqft",
    label: "Price per Square Foot",
    sub: "realtor.com monthly ZIP aggregate",
    display: (v) => `$${v}/sqft`,
  },
  {
    concept: "sold_to_rent_ratio",
    packId: "market-temperature-swfl",
    tableId: "market_temperature_by_zip",
    cell: "sold_to_rent_ratio",
    role: "primary",
    key: "sold_to_rent_ratio",
    label: "Sold-to-Rent Ratio",
    sub: "realtor.com monthly ZIP aggregate",
    display: (v) => v.toFixed(1),
  },

  // ── listing-momentum-swfl's two headline shares ──
  {
    concept: "price_reduced_share",
    packId: "listing-momentum-swfl",
    tableId: "listing_momentum_by_zip",
    cell: "price_reduced_share",
    role: "primary",
    key: "price_reduced_share",
    label: "Price-Cut Share",
    sub: "Active listings with a price reduction",
    display: fmtPct,
  },
  {
    concept: "new_listing_share",
    packId: "listing-momentum-swfl",
    tableId: "listing_momentum_by_zip",
    cell: "new_listing_share",
    role: "primary",
    key: "new_listing_share",
    label: "New-Listing Share",
    sub: "Active listings newly on market",
    display: fmtPct,
  },

  // ── seller-stress-swfl's one promoted magnitude ──
  {
    concept: "price_cut_depth",
    packId: "seller-stress-swfl",
    tableId: "seller_stress_by_zip",
    cell: "avg_price_drop_pct",
    role: "primary",
    key: "price_cut_depth",
    label: "Avg Price-Cut Depth",
    sub: "Among listings that cut price",
    display: fmtPct,
  },

  // ── market-heat-swfl's pending ratio + the one winning composite ──
  {
    concept: "pending_ratio",
    packId: "market-heat-swfl",
    tableId: "market_heat_by_zip",
    cell: "pending_ratio",
    role: "primary",
    key: "pending_ratio",
    label: "Pending Ratio",
    sub: "Pending sales vs. active inventory",
    display: (v) => v.toFixed(2),
    movementCell: "pending_ratio_yy",
  },
  {
    concept: "market_sentiment",
    packId: "market-heat-swfl",
    tableId: "market_heat_by_zip",
    cell: "market_heat_score",
    role: "primary",
    key: "market_heat_score",
    label: "Market Heat Score",
    sub: "0-100 relative heat, realtor.com list-side signals",
    display: fmtScore,
  },

  // ── Demoted — same concept as a winner above, cited in the rail only ──
  {
    concept: "home_value",
    packId: "active-listings-swfl",
    tableId: "active_listings_by_zip",
    cell: "median_list_price",
    role: "demoted",
    key: "median_list_price",
    label: "List-side asking median",
    sub: "",
    display: fmtUsdShort,
  },
  {
    concept: "days_on_market",
    packId: "active-listings-swfl",
    tableId: "active_listings_by_zip",
    cell: "avg_days_on_market",
    role: "demoted",
    key: "active_listings_avg_dom",
    label: "Active-listing average DOM",
    sub: "",
    display: (v) => `${v} days`,
  },
  {
    concept: "active_inventory",
    packId: "active-listings-swfl",
    tableId: "active_listings_by_zip",
    cell: "listing_count",
    role: "demoted",
    key: "active_listings_count",
    label: "realtor.com active listing count",
    sub: "",
    display: fmtCount,
  },
  {
    concept: "days_on_market",
    packId: "market-heat-swfl",
    tableId: "market_heat_by_zip",
    cell: "median_dom",
    role: "demoted",
    key: "market_heat_median_dom",
    label: "realtor.com median DOM",
    sub: "",
    display: (v) => `${v} days`,
  },
  {
    concept: "active_inventory",
    packId: "market-heat-swfl",
    tableId: "market_heat_by_zip",
    cell: "active_listing_count",
    role: "demoted",
    key: "market_heat_active_count",
    label: "realtor.com active listing count",
    sub: "",
    display: fmtCount,
  },
  {
    concept: "new_listing_share",
    packId: "market-heat-swfl",
    tableId: "market_heat_by_zip",
    cell: "new_listing_count",
    role: "demoted",
    key: "market_heat_new_listing_count",
    label: "realtor.com new-listing count",
    sub: "",
    display: fmtCount,
  },
  {
    concept: "price_reduced_share",
    packId: "market-heat-swfl",
    tableId: "market_heat_by_zip",
    cell: "price_reduced_share",
    role: "demoted",
    key: "market_heat_price_reduced_share",
    label: "realtor.com price-cut share",
    sub: "",
    display: fmtPct,
  },
  {
    concept: "market_sentiment",
    packId: "market-heat-swfl",
    tableId: "market_heat_by_zip",
    cell: "hotness_score",
    role: "demoted",
    key: "hotness_score",
    label: "realtor.com relative hotness score",
    sub: "",
    display: fmtScore,
  },
  {
    concept: "home_value",
    packId: "market-temperature-swfl",
    tableId: "market_temperature_by_zip",
    cell: "median_sold_price",
    role: "demoted",
    key: "market_temp_median_sold_price",
    label: "realtor.com median sold price",
    sub: "",
    display: fmtUsdShort,
  },
  {
    concept: "home_value",
    packId: "market-temperature-swfl",
    tableId: "market_temperature_by_zip",
    cell: "median_listing_price",
    role: "demoted",
    key: "market_temp_median_listing_price",
    label: "realtor.com median listing price",
    sub: "",
    display: fmtUsdShort,
  },
  {
    concept: "days_on_market",
    packId: "market-temperature-swfl",
    tableId: "market_temperature_by_zip",
    cell: "median_days_on_market",
    role: "demoted",
    key: "market_temp_median_dom",
    label: "realtor.com median days on market",
    sub: "",
    display: (v) => `${v} days`,
  },
  {
    concept: "sale_to_list_ratio",
    packId: "market-temperature-swfl",
    tableId: "market_temperature_by_zip",
    cell: "list_to_sold_ratio_pct",
    role: "demoted",
    key: "market_temp_list_to_sold_ratio",
    label: "realtor.com list-to-sold ratio",
    sub: "",
    display: fmtPct,
  },
  {
    concept: "market_sentiment",
    packId: "market-temperature-swfl",
    tableId: "market_temperature_by_zip",
    cell: "local_hotness_score",
    role: "demoted",
    key: "local_hotness_score",
    label: "realtor.com local hotness score",
    sub: "",
    display: fmtScore,
  },
  {
    concept: "active_inventory",
    packId: "listing-momentum-swfl",
    tableId: "listing_momentum_by_zip",
    cell: "active_listing_count",
    role: "demoted",
    key: "listing_momentum_active_count",
    label: "realtor.com active listing count",
    sub: "",
    display: fmtCount,
  },
  {
    concept: "market_sentiment",
    packId: "seller-stress-swfl",
    tableId: "seller_stress_by_zip",
    cell: "seller_stress_score",
    role: "demoted",
    key: "seller_stress_score",
    label: "Seller stress score (vs. 2019–2021 baseline)",
    sub: "",
    display: fmtScore,
  },
  {
    concept: "market_sentiment",
    packId: "seller-stress-swfl",
    tableId: "seller_stress_by_zip",
    cell: "share_delisted_pct",
    role: "demoted",
    key: "share_delisted_pct",
    label: "Share of listings delisted",
    sub: "",
    display: fmtPct,
  },
];

/** Concept → the two pairId-sharing entries that get a cross-reference footnote. */
function pairedEntries(): Map<string, [ZipMetricSource, ZipMetricSource]> {
  const byPair = new Map<string, ZipMetricSource[]>();
  for (const s of ZIP_METRIC_SOURCES) {
    if (!s.pairId) continue;
    const list = byPair.get(s.pairId) ?? [];
    list.push(s);
    byPair.set(s.pairId, list);
  }
  const out = new Map<string, [ZipMetricSource, ZipMetricSource]>();
  for (const [pairId, members] of byPair) {
    if (members.length === 2) out.set(pairId, [members[0], members[1]]);
  }
  return out;
}

/**
 * Concept-deduped candidate builder (spec 2026-07-03 zip-hero-pool-all-brains).
 * Pure — reads only the passed table map, no I/O. `tables` is keyed
 * `${packId}:${tableId}`; a missing key means that pack didn't load or hold a
 * table for this ZIP window, and every registry entry referencing it silently
 * produces nothing (empty-tolerant, never throws, never invents).
 */
export function buildRegistryCandidates(
  zip: string,
  tables: Map<string, RegistryTableData>,
): { candidates: SignalCandidate[]; railContext: Map<string, DemotedFigure[]> } {
  const candidates: SignalCandidate[] = [];
  const railContext = new Map<string, DemotedFigure[]>();
  const rawValueByKey = new Map<string, number>();

  for (const spec of ZIP_METRIC_SOURCES) {
    const data = tables.get(`${spec.packId}:${spec.tableId}`);
    if (!data) continue;
    const row = data.rows.find((r) => r.key === zip);
    const raw = row?.cells[spec.cell];
    const v = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    if (v == null) continue;

    if (spec.role === "demoted") {
      const list = railContext.get(spec.concept) ?? [];
      list.push({
        concept: spec.concept,
        label: spec.label,
        display: spec.display(v),
        sourceLabel: data.source?.label ?? spec.packId,
        sourceUrl: data.source?.url ?? "",
      });
      railContext.set(spec.concept, list);
      continue;
    }

    const dist = data.rows
      .map((r) => r.cells[spec.cell])
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
    const pct = percentileOf(dist, v);

    let movementPct: number | null = null;
    let movementText: string | undefined;
    if (spec.computeMovement && row) {
      const m = spec.computeMovement(row, v);
      movementPct = m.movementPct;
      movementText = m.movementText;
    } else if (spec.movementCell && row) {
      const mv = row.cells[spec.movementCell];
      if (typeof mv === "number" && Number.isFinite(mv) && mv !== 0) {
        movementPct = mv;
        movementText = `${arrow(mv)} ${Math.abs(mv)}% YoY`;
      }
    }

    rawValueByKey.set(spec.key, v);
    candidates.push({
      key: spec.key,
      label: spec.label,
      display: spec.display(v),
      sub: spec.sub,
      percentile: pct?.percentile ?? null,
      rankPos: pct?.rankPos,
      rankOf: pct?.rankOf,
      movementPct,
      movementText,
      covered: true,
      source: data.source,
    });
  }

  for (const [a, b] of pairedEntries().values()) {
    const ca = candidates.find((c) => c.key === a.key);
    const cb = candidates.find((c) => c.key === b.key);
    if (!ca || !cb) continue; // one or both sides not held for this ZIP — no footnote, both still stand alone
    const va = rawValueByKey.get(a.key)!;
    const vb = rawValueByKey.get(b.key)!;
    if (vb === 0) continue;
    const deltaPct = Math.round((Math.abs(va - vb) / vb) * 100);
    const footnote = `${a.label} tracks within ${deltaPct}% of ${b.label}`;
    ca.footnote = footnote;
    cb.footnote = footnote;
  }

  return { candidates, railContext };
}

export function buildZipCandidates(input: CandidateInput): {
  candidates: SignalCandidate[];
  gaps: GapSlot[];
  railContext: Map<string, DemotedFigure[]>;
} {
  const registryResult = buildRegistryCandidates(input.zip, input.registryTables);
  const candidates: SignalCandidate[] = [...registryResult.candidates];
  const gaps: GapSlot[] = [];

  // ── Flood — all-ZIP detail table preferred; key_metrics fallback keeps today's page working.
  if (input.floodForZip) {
    const f = input.floodForZip;
    let percentile: number | null = null;
    let rankPos: number | undefined;
    let rankOf: number | undefined;
    if (input.floodRows.length > 1) {
      const pct = percentileOf(
        input.floodRows.map((r) => r.aal),
        f.aal,
      );
      percentile = pct?.percentile ?? null;
      rankPos = pct?.rankPos;
      rankOf = pct?.rankOf;
    } else if (f.pctRank != null) {
      percentile = Math.round(f.pctRank);
      rankOf = TOTAL_SWFL_ZIPS;
      rankPos = Math.max(1, Math.round((1 - percentile / 100) * TOTAL_SWFL_ZIPS) + 1);
    }
    candidates.push({
      key: "flood_aal",
      label: "Annual Flood Loss",
      display: fmtUsdShort(f.aal),
      sub: "Flood insurance avg/home per year",
      percentile,
      rankPos,
      rankOf,
      movementPct: null,
      covered: true,
      source: input.floodSource,
    });
  }

  // ── Permits — competes only where the Lee Accela feed covers (count > 0).
  const permitCount = input.permitsCounts.get(input.zip) ?? 0;
  if (permitCount > 0) {
    const dist = [...input.permitsCounts.values()].filter((n) => n > 0);
    const pct = percentileOf(dist, permitCount);
    candidates.push({
      key: "permits_90d",
      label: "New Permits (90 Days)",
      display: permitCount.toLocaleString("en-US"),
      sub: "Lee County building permits",
      percentile: pct?.percentile ?? null,
      rankPos: pct?.rankPos,
      rankOf: pct?.rankOf,
      movementPct: null,
      covered: true,
      source: input.permitsSource,
    });
  } else {
    // Structurally-absent source → Find-it slot (never an em-dash, never a fake zero).
    const gap = findGap("permits_90d", input.zip);
    if (gap) {
      gaps.push({
        metric_key: "permits_90d",
        label: "New Permits (90 Days)",
        coverage: gap.coverage,
      });
    }
  }

  // ── Census — joins the same ranked pool; percentile from the SWFL ACS distribution.
  for (const cv of input.censusValues) {
    const dist = input.censusDistribution.get(cv.key) ?? [];
    const pct = dist.length > 1 ? percentileOf(dist, cv.value) : null;
    candidates.push({
      key: cv.key,
      label: cv.label,
      display: cv.display,
      sub: cv.sourceLabel,
      percentile: pct?.percentile ?? null,
      rankPos: pct?.rankPos,
      rankOf: pct?.rankOf,
      movementPct: null,
      covered: true,
      source: { label: cv.sourceLabel, url: cv.sourceUrl },
    });
  }

  return { candidates, gaps, railContext: registryResult.railContext };
}

// ---------------------------------------------------------------------------
// Census signals loader — numeric per-ZIP values + the SWFL distribution, one
// query. Empty-tolerant: no creds / no rows / error → empty maps, never throws.
// ---------------------------------------------------------------------------

/** ACS column → the figure key loadZipQuickSummary already uses (render-once join). */
const CENSUS_KEY_BY_COLUMN: Record<string, string> = {
  total_population: "population",
  median_household_income: "median_household_income",
  median_age: "median_age",
  owner_occupied_pct: "owner_occupied",
  avg_household_size: "household_size",
  poverty_rate: "poverty_rate",
  employment_rate: "employment_rate",
  moved_in_past_year_pct: "moved_past_year",
};

export async function loadCensusSignals(zip: string): Promise<{
  numericByKey: Map<string, number>;
  distribution: Map<string, number[]>;
}> {
  const empty = {
    numericByKey: new Map<string, number>(),
    distribution: new Map<string, number[]>(),
  };
  let db: ReturnType<typeof createServiceRoleClientUntyped>;
  try {
    db = createServiceRoleClientUntyped();
  } catch {
    return empty;
  }
  try {
    const { data, error } = await db
      .schema("data_lake")
      .from("census_acs_zcta")
      .select(
        "geo_id, total_population, median_household_income, median_age, owner_occupied_pct, avg_household_size, poverty_rate, employment_rate, moved_in_past_year_pct",
      );
    if (error || !data) return empty;
    const numericByKey = new Map<string, number>();
    const distribution = new Map<string, number[]>();
    for (const raw of data as unknown as Record<string, unknown>[]) {
      const geoId = typeof raw.geo_id === "string" ? raw.geo_id : "";
      if (!/^\d{5}$/.test(geoId) || !resolveZip(geoId).in_scope) continue;
      for (const [col, key] of Object.entries(CENSUS_KEY_BY_COLUMN)) {
        const n = Number(raw[col]);
        if (!Number.isFinite(n) || raw[col] == null) continue;
        const arr = distribution.get(key) ?? [];
        arr.push(n);
        distribution.set(key, arr);
        if (geoId === zip) numericByKey.set(key, n);
      }
    }
    return { numericByKey, distribution };
  } catch {
    return empty;
  }
}
