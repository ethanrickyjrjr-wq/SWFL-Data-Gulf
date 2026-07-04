// lib/zip-report/census-values.ts
//
// The census-value filter for the ZIP ranked-signal pool. Its own module so it
// stays unit-testable in isolation — zip-seed's tests mock `load-ranked-signals`
// process-globally, which would otherwise shadow this pure function.

import type { CensusValue } from "./candidates";

/** The one census key the income-only policy keeps (loadZipQuickSummary emits it
 *  as `median_household_income`; candidates.ts distributes it under the same key). */
export const INCOME_CENSUS_KEY = "median_household_income";

/** Minimal shape of a loadZipQuickSummary figure this filter reads. */
export interface CensusFigureInput {
  key: string;
  label: string;
  value: string;
  source_label: string;
  source_url: string;
}

/**
 * Join summary figures with their numeric lookup into ranked-pool `CensusValue`s.
 * `income-only` keeps ONLY the income figure — but this filters the VALUES, never
 * the distribution: the caller still passes the FULL `censusDistribution` to
 * `buildZipCandidates`, so income's percentile is computed against the whole SWFL
 * set, not a truncated one. (Inverting these — filtering the distribution instead —
 * would silently mis-rank income; that's why this is a named, tested function.)
 * A figure with no numeric value is dropped (never a fabricated number).
 */
export function filterCensusValues(
  figures: CensusFigureInput[],
  numericByKey: Map<string, number>,
  policy: "all" | "income-only",
): CensusValue[] {
  return figures.flatMap((figItem) => {
    if (policy === "income-only" && figItem.key !== INCOME_CENSUS_KEY) return [];
    const value = numericByKey.get(figItem.key);
    if (value === undefined) return [];
    return [
      {
        key: figItem.key,
        label: figItem.label,
        value,
        display: figItem.value,
        sourceLabel: figItem.source_label,
        sourceUrl: figItem.source_url,
      },
    ];
  });
}
