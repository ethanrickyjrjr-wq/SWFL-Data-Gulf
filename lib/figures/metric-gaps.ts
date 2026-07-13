// lib/figures/metric-gaps.ts
//
// Fixed PUBLIC allowlist for the Find-it button (spec §5). The public can only
// request the metric gaps listed here — never arbitrary lookups. v1: 90-day
// building permits on ZIPs whose city runs its own permitting portal, so they are
// structurally absent from the Lee County Accela feed. The registered follow-up
// `city_permits_ingest_odd` replaces this lane-3 fill with lane-1 ingest.

export interface MetricGapCoverage {
  /** Plain-English issuing source, e.g. "City of Cape Coral permitting". */
  name: string;
  /** Homepage-level URL (data-provenance convention: citation homepage URL). */
  url: string;
}

export interface MetricGap {
  metric_key: string;
  zips: readonly string[];
  label: (zip: string) => string;
  search_query: (zip: string) => string;
  /** Honest coverage line + not-found pointer — names the real issuing source. */
  coverage: MetricGapCoverage;
  /** Extra web-search domains beyond gap-fill's defaults. */
  extra_domains: readonly string[];
}

/** Cape Coral ZIPs absent from the Lee Accela feed (spec, operator-traced 07/03/2026).
 *  33993 added 07/13/2026 — it was missing from the original trace, so it never got the
 *  gap slot and one stray county permit ranked it #23 of 23 (the one-permit crowning). */
export const CAPE_CORAL_ZIPS = ["33904", "33909", "33914", "33990", "33991", "33993"] as const;

export const FIND_METRIC_GAPS: readonly MetricGap[] = [
  {
    metric_key: "permits_90d",
    zips: CAPE_CORAL_ZIPS,
    label: (zip) => `New building permits issued in ZIP ${zip} (Cape Coral), last 90 days`,
    search_query: (zip) =>
      `Cape Coral Florida building permits issued ${zip} recent monthly count report`,
    coverage: { name: "City of Cape Coral permitting", url: "https://www.capecoral.gov/" },
    extra_domains: ["capecoral.gov"],
  },
];

/** The allowlist gate: null unless (metric, zip) is explicitly listed. */
export function findGap(metricKey: string, zip: string): MetricGap | null {
  const gap = FIND_METRIC_GAPS.find((g) => g.metric_key === metricKey);
  if (!gap || !gap.zips.includes(zip)) return null;
  return gap;
}
