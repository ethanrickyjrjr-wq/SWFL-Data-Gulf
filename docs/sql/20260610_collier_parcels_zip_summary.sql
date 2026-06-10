-- J6a: per-ZIP parcel stats for properties-collier-value detail_tables.
-- Surfaces the existing phy_zipcd column (G1-compliant physical site ZIP from FDOR
-- cadastral) as ZIP-grain rows. Consumer (collier-parcels-source.mts) filters each
-- row through resolveZip(zip).in_scope before writing to detail_tables.
--
-- Run ONCE after data_lake.collier_parcels is populated:
--   python -m ingest.pipelines.collier_parcels.pipeline
--
-- Apply via psycopg3 (credentials in .dlt/secrets.toml).

CREATE OR REPLACE VIEW data_lake.collier_parcels_zip_summary AS
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
FROM data_lake.collier_parcels
WHERE phy_zipcd IS NOT NULL
GROUP BY phy_zipcd
ORDER BY phy_zipcd;

GRANT SELECT ON data_lake.collier_parcels_zip_summary TO service_role;

NOTIFY pgrst, 'reload schema';
