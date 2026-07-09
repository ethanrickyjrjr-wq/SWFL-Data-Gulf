// lib/charts/hurricane-series.ts
//
// SWFL hurricane category breakdown — real NOAA HURDAT2 best-track data, live
// lake query (not a brain read): brains/hurricane-tracks-fl.md is stale (v1,
// 2026-06-19, pre-dates the 07/07/2026 county-scope correction in CLAUDE.md —
// still carries the old 6-county Charlotte/Glades/Sarasota footprint) and its
// published key_metrics don't expose a per-category histogram anyway (only a
// single cat3+ boolean threshold). This queries s3://lake-tier1/environmental/
// hurdat2_fl.parquet directly, mirroring the exact centroid/distance/window
// logic in refinery/packs/hurricane-tracks-fl.mts (SWFL_COUNTIES, NEAR_MILES,
// RECENT_WINDOW_YEARS_PASS) so the numbers agree with that pack's own
// cat3plus_passes_within_50mi_30yr metric (verified: both read 2).
//
// Query run 07/08/2026 via mcp__lake__query_lake:
//   WITH centroids(name, lat, lon) AS (
//     VALUES ('Collier', 26.11, -81.41), ('Hendry', 26.55, -81.18), ('Lee', 26.55, -81.92)
//   ),
//   near AS (
//     SELECT t.storm_id, t.category_saffir,
//       3958.7613 * 2 * ASIN(SQRT(
//         POWER(SIN(RADIANS(c.lat - t.lat)/2),2)
//         + COS(RADIANS(t.lat))*COS(RADIANS(c.lat))*POWER(SIN(RADIANS(c.lon - t.lon)/2),2)
//       )) AS distance_mi
//     FROM hurdat2_fl t CROSS JOIN centroids c
//     WHERE t.storm_year >= 1996
//   ),
//   within AS (SELECT storm_id, category_saffir FROM near WHERE distance_mi <= 50),
//   per_storm AS (SELECT storm_id, MAX(category_saffir) AS max_cat FROM within GROUP BY storm_id)
//   SELECT COALESCE(max_cat, 0) AS cat_bucket, COUNT(*) AS storm_count
//   FROM per_storm GROUP BY 1 ORDER BY 1
//
// Result: cat 0 (tropical storm/depression strength only) = 11, cat 2 = 2,
// cat 4 = 2 (cat 1/3/5 = 0, real absence — not omitted). 15 distinct storms
// total in the trailing 30-year window (1996-2025).

export interface HurricaneCategoryBucket {
  /** Saffir-Simpson peak category reached during SWFL passage; 0 = tropical storm/depression. */
  category: 0 | 1 | 2 | 3 | 4 | 5;
  label: string;
  /** Distinct storm count in this bucket. */
  count: number;
  /** On-brand severity color, escalating teal (calm) -> deep red (Cat 5). */
  color: string;
}

export const HURRICANE_CATEGORY_BUCKETS: HurricaneCategoryBucket[] = [
  { category: 0, label: "Tropical Storm", count: 11, color: "#14b8a6" },
  { category: 1, label: "Category 1", count: 0, color: "#38bdf8" },
  { category: 2, label: "Category 2", count: 2, color: "#d4b370" },
  { category: 3, label: "Category 3", count: 0, color: "#f59e0b" },
  { category: 4, label: "Category 4", count: 2, color: "#ef4444" },
  { category: 5, label: "Category 5", count: 0, color: "#991b1b" },
];

export const HURRICANE_TOTAL_STORMS_30YR = HURRICANE_CATEGORY_BUCKETS.reduce(
  (sum, b) => sum + b.count,
  0,
);

export const HURRICANE_SERIES_SOURCE = {
  citation:
    "NOAA HURDAT2 (Atlantic best-track) via data_lake._tier1_inventory[environmental/hurdat2_fl.parquet] — SWFL core counties (Lee + Collier + Hendry), storms within 50 statute miles of any county centroid, trailing 30-year window (1996-2025). Methodology mirrors refinery/packs/hurricane-tracks-fl.mts.",
  homepage: "https://www.nhc.noaa.gov/data/hurdat/",
  asOf: "07/08/2026",
};
