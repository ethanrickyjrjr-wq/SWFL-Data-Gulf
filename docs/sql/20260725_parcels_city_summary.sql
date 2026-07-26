-- CITY-grain parcel stats for Lee + Collier — column-identical mirror of the
-- per-ZIP summaries (20260719_lee_parcels_zip_summary.sql /
-- 20260610_collier_parcels_zip_summary.sql), grouped by FDOR PHY_CITY instead
-- of PHY_ZIPCD. Operator decree 07/25/2026: a city name may only ever label a
-- number computed over ALL of that city's parcels — "Cape Coral" = every Cape
-- Coral parcel, not one ZIP. Medians are recomputed at parcel grain here from
-- the ALREADY-INGESTED parcel tables (no new ingest); NEVER derive a city
-- median by combining ZIP medians.
-- phy_city is the G1-compliant physical site city (FDOR cadastral), already
-- uppercase in the data (live-probed 07/25/2026: CAPE CORAL 137,926 parcels,
-- 138 null/blank rows in Lee; NAPLES 256,178, 582 null/blank in Collier).
--
-- Apply: bun scripts/run-migration.ts docs/sql/20260725_parcels_city_summary.sql

CREATE OR REPLACE VIEW data_lake.lee_parcels_city_summary AS
SELECT
  UPPER(TRIM(phy_city))                                       AS phy_city,
  COUNT(*)::int                                               AS parcel_count,
  COUNT(*) FILTER (WHERE jv_hmstd > 0)::int                  AS homesteaded_count,
  ROUND(percentile_cont(0.5)
    WITHIN GROUP (ORDER BY jv)::numeric, 0)                  AS median_jv,
  ROUND(percentile_cont(0.5)
    WITHIN GROUP (ORDER BY
      CASE
        WHEN jv_hmstd > 0 AND av_hmstd IS NOT NULL
        THEN ((jv_hmstd - av_hmstd)::numeric / jv_hmstd) * 100
      END
    )::numeric, 1)                                            AS soh_gap_median_pct
FROM data_lake.lee_parcels
WHERE phy_city IS NOT NULL AND TRIM(phy_city) <> ''
GROUP BY UPPER(TRIM(phy_city))
ORDER BY UPPER(TRIM(phy_city));

CREATE OR REPLACE VIEW data_lake.collier_parcels_city_summary AS
SELECT
  UPPER(TRIM(phy_city))                                       AS phy_city,
  COUNT(*)::int                                               AS parcel_count,
  COUNT(*) FILTER (WHERE jv_hmstd > 0)::int                  AS homesteaded_count,
  ROUND(percentile_cont(0.5)
    WITHIN GROUP (ORDER BY jv)::numeric, 0)                  AS median_jv,
  ROUND(percentile_cont(0.5)
    WITHIN GROUP (ORDER BY
      CASE
        WHEN jv_hmstd > 0 AND av_hmstd IS NOT NULL
        THEN ((jv_hmstd - av_hmstd)::numeric / jv_hmstd) * 100
      END
    )::numeric, 1)                                            AS soh_gap_median_pct
FROM data_lake.collier_parcels
WHERE phy_city IS NOT NULL AND TRIM(phy_city) <> ''
GROUP BY UPPER(TRIM(phy_city))
ORDER BY UPPER(TRIM(phy_city));

GRANT SELECT ON data_lake.lee_parcels_city_summary TO service_role;
GRANT SELECT ON data_lake.collier_parcels_city_summary TO service_role;

NOTIFY pgrst, 'reload schema';
