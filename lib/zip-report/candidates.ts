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

export interface HousingZipRow {
  key: string;
  cells: Record<string, number | string | boolean | null>;
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
  housingRows: HousingZipRow[];
  housingSource?: { label: string; url: string };
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

interface HousingMetricSpec {
  key: string;
  cell: string;
  label: string;
  sub: string;
  display: (v: number) => string;
}

const HOUSING_METRICS: HousingMetricSpec[] = [
  {
    key: "median_sale_price",
    cell: "median_sale_price",
    label: "Median Home Value",
    sub: "90-day median sale price",
    display: fmtUsdShort,
  },
  {
    key: "median_dom",
    cell: "median_dom",
    label: "Days on Market",
    sub: "90-day median",
    display: (v) => `${v} days`,
  },
  {
    key: "avg_sale_to_list_pct",
    cell: "avg_sale_to_list_pct",
    label: "Sale-to-List Ratio",
    sub: "Average, 90-day window",
    display: (v) => `${v}%`,
  },
  {
    key: "months_of_supply",
    cell: "months_of_supply",
    label: "Months of Supply",
    sub: "At the current sales pace",
    display: (v) => `${v} mo`,
  },
  {
    key: "homes_sold",
    cell: "homes_sold",
    label: "Homes Sold",
    sub: "Last 90 days",
    display: (v) => v.toLocaleString("en-US"),
  },
  {
    key: "inventory",
    cell: "inventory",
    label: "Active Inventory",
    sub: "Homes for sale now",
    display: (v) => v.toLocaleString("en-US"),
  },
];

function numCell(row: HousingZipRow | undefined, cell: string): number | null {
  const v = row?.cells[cell];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function buildZipCandidates(input: CandidateInput): {
  candidates: SignalCandidate[];
  gaps: GapSlot[];
} {
  const candidates: SignalCandidate[] = [];
  const gaps: GapSlot[] = [];
  const row = input.housingRows.find((r) => r.key === input.zip);

  // ── Housing — percentile from the all-ZIP detail table the page already loads.
  for (const spec of HOUSING_METRICS) {
    const v = numCell(row, spec.cell);
    if (v == null) continue;
    const dist = input.housingRows
      .map((r) => numCell(r, spec.cell))
      .filter((n): n is number => n != null);
    const pct = percentileOf(dist, v);

    let movementPct: number | null = null;
    let movementText: string | undefined;
    if (spec.key === "median_sale_price") {
      const yoy = numCell(row, "median_sale_price_yoy_pct");
      if (yoy != null && yoy !== 0) {
        movementPct = yoy;
        movementText = `${arrow(yoy)} ${Math.abs(yoy)}% YoY`;
      }
    } else if (spec.key === "median_dom") {
      const days = numCell(row, "median_dom_yoy_days");
      if (days != null && days !== 0) {
        const prior = v - days;
        movementPct = prior > 0 ? Math.round((days / prior) * 100) : null;
        movementText = `${arrow(days)} ${Math.abs(days)} days YoY`;
      }
    }

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
      source: input.housingSource,
    });
  }

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

  return { candidates, gaps };
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
