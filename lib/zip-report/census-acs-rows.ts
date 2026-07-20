// lib/zip-report/census-acs-rows.ts
//
// Shared, cached read of data_lake.census_acs_zcta — the ONE fetch both
// loadCensusSignals (candidates.ts, needs every row for the SWFL percentile
// distribution) and loadZipQuickSummary (zip-summary/load.ts, needs one row
// per ZIP) used to query separately. Both ran on every /r/zip-report/[zip]
// view (force-dynamic, never cached) — one of them an unfiltered full-table
// scan — so a single ZIP page view issued two round trips against the same
// ~100-row table. ACS is an annual-vintage source (ingest/cadence_registry.yaml),
// so a short in-memory TTL is a safe, deployment-local cache: worst case is a
// few minutes of staleness against data that itself republishes once a year.

// KNOWN-DEBT(data_lake: census_acs_zcta lives in the data_lake schema (typed public only))
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import { isCoreScope } from "@/refinery/lib/core-scope.mts";

export interface CensusAcsZctaRow {
  geo_id: string;
  acs_year: number | null;
  total_population: number | null;
  median_household_income: number | null;
  median_age: number | null;
  owner_occupied_pct: number | null;
  moved_in_past_year_pct: number | null;
  poverty_rate: number | null;
  employment_rate: number | null;
  avg_household_size: number | null;
}

const CENSUS_ACS_COLUMNS =
  "geo_id, acs_year, total_population, median_household_income, median_age, owner_occupied_pct, moved_in_past_year_pct, poverty_rate, employment_rate, avg_household_size";

const TTL_MS = 10 * 60 * 1000;
let cached: { rows: CensusAcsZctaRow[]; at: number } | null = null;

/** Cached full-table read. Empty-tolerant: no creds / no rows / error → `[]`
 *  (or the last-good cached rows, if a transient error follows a real fetch) —
 *  never a fabricated row. */
export async function loadCensusAcsZctaRows(now = Date.now()): Promise<CensusAcsZctaRow[]> {
  if (cached && now - cached.at < TTL_MS) return cached.rows;

  let db: ReturnType<typeof createServiceRoleClientUntyped>;
  try {
    db = createServiceRoleClientUntyped();
  } catch {
    return cached?.rows ?? [];
  }
  try {
    const { data, error } = await db
      .schema("data_lake")
      .from("census_acs_zcta")
      .select(CENSUS_ACS_COLUMNS);
    if (error || !data) return cached?.rows ?? [];
    // Scope root: the table holds ~100 ZIPs but coverage is Lee + Collier (57).
    // Filter HERE so no consumer can surface an out-of-scope county.
    const rows = (data as unknown as CensusAcsZctaRow[]).filter(
      (r) => typeof r.geo_id === "string" && isCoreScope(r.geo_id),
    );
    cached = { rows, at: now };
    return rows;
  } catch {
    return cached?.rows ?? [];
  }
}

/** Test-only: clear the memo between cases. */
export function __resetCensusAcsZctaCache(): void {
  cached = null;
}
