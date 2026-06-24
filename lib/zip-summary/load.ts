import type { ZipQuickSummary, ZipSummaryFigure } from "./types";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

/**
 * Per-ZIP Quick Summary loader — the seam the ZIP report page renders from.
 *
 * Reads `data_lake.census_acs_zcta` (the Census ACS 5-year per-ZCTA demographics
 * ingested by `ingest/pipelines/census_acs/`) for the requested ZIP and maps each
 * non-suppressed covariate to a cited `ZipSummaryFigure`. Every figure carries a real
 * `source_url` (census.gov) and MM/DD/YYYY `as_of` — no-invention / four-lane lane 3.
 *
 * Empty-tolerant by contract (the ODD "empty-tolerant consumer"): no lake creds, no
 * matching ZCTA, or any query error → `{ zip, figures: [] }`, never a fabricated figure.
 * Suppressed cells arrive as NULL from the pipeline and are simply omitted (never zeroed).
 *
 * Current market figures (housing/rents) are NOT duplicated here — they already render
 * in the page's ZIP-Level tables from housing-swfl/rentals-swfl; this summary is the
 * demographic layer. Future crawl4ai current-data lands as additional cited figures.
 */

const CENSUS_SOURCE_URL = "https://data.census.gov/";

interface AcsRow {
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

export async function loadZipQuickSummary(zip: string): Promise<ZipQuickSummary> {
  let supabase: ReturnType<typeof createServiceRoleClient>;
  try {
    supabase = createServiceRoleClient();
  } catch {
    return { zip, figures: [] }; // no lake creds in this env — degrade, never throw
  }

  let row: AcsRow | null = null;
  try {
    const { data, error } = await supabase
      .schema("data_lake")
      .from("census_acs_zcta")
      .select(
        "acs_year, total_population, median_household_income, median_age, owner_occupied_pct, moved_in_past_year_pct, poverty_rate, employment_rate, avg_household_size",
      )
      .eq("geo_id", zip)
      .maybeSingle();
    if (error || !data) return { zip, figures: [] };
    row = data as AcsRow;
  } catch {
    return { zip, figures: [] };
  }

  // ACS 5-year vintage YYYY = the 5-year window (YYYY-4 .. YYYY). As-of = period end.
  const year = row.acs_year ?? 0;
  const sourceLabel = year
    ? `U.S. Census ACS 5-year (${year - 4}–${year})`
    : "U.S. Census ACS 5-year";
  const asOf = year ? `12/31/${year}` : undefined;

  const cite = (key: string, label: string, value: string): ZipSummaryFigure => ({
    key,
    label,
    value,
    source_url: CENSUS_SOURCE_URL,
    source_label: sourceLabel,
    as_of: asOf,
  });

  const figures: ZipSummaryFigure[] = [];
  const n = (v: number | null): v is number => v != null && Number.isFinite(v);

  if (n(row.total_population))
    figures.push(cite("population", "Population", row.total_population.toLocaleString("en-US")));
  if (n(row.median_household_income))
    figures.push(
      cite(
        "median_household_income",
        "Median household income",
        `$${row.median_household_income.toLocaleString("en-US")}`,
      ),
    );
  if (n(row.median_age)) figures.push(cite("median_age", "Median age", `${row.median_age} years`));
  if (n(row.owner_occupied_pct))
    figures.push(cite("owner_occupied", "Owner-occupied homes", `${row.owner_occupied_pct}%`));
  if (n(row.avg_household_size))
    figures.push(cite("household_size", "Average household size", `${row.avg_household_size}`));
  if (n(row.poverty_rate))
    figures.push(cite("poverty_rate", "Poverty rate", `${row.poverty_rate}%`));
  if (n(row.employment_rate))
    figures.push(cite("employment_rate", "Employment rate", `${row.employment_rate}%`));
  if (n(row.moved_in_past_year_pct))
    figures.push(cite("moved_past_year", "Moved in past year", `${row.moved_in_past_year_pct}%`));

  return { zip, figures, as_of: figures.length ? asOf : undefined };
}
