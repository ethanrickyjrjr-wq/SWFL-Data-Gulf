-- Per-ZIP parcel stats for properties-lee-value detail_tables — column-identical
-- mirror of collier_parcels_zip_summary (docs/sql/20260610_collier_parcels_zip_summary.sql)
-- over data_lake.lee_parcels (FDOR Statewide Cadastral, CO_NO=46, landed 07/18/2026).
-- Surfaces the existing phy_zipcd column (G1-compliant physical site ZIP from FDOR
-- cadastral) as ZIP-grain rows. Consumer (lee-parcels-source.mts) filters each row
-- through zipInPrimaryCounty(zip, LEE_FIPS) before writing to detail_tables — the
-- view stays county-pure; Lee/Collier straddle-ZIP assignment (34110/34119/34134)
-- lives in the crosswalk authority, not in SQL.
--
-- Apply: bun scripts/run-migration.ts docs/sql/20260719_lee_parcels_zip_summary.sql

CREATE OR REPLACE VIEW data_lake.lee_parcels_zip_summary AS
SELECT
  phy_zipcd,
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
WHERE phy_zipcd IS NOT NULL
GROUP BY phy_zipcd
ORDER BY phy_zipcd;

GRANT SELECT ON data_lake.lee_parcels_zip_summary TO service_role;

NOTIFY pgrst, 'reload schema';
