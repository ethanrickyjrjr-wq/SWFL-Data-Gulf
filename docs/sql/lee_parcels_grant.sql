-- Grant service_role read access to the Tier 2 Lee parcels table + the summary
-- view the properties-lee-value parcel-category source reads.
-- Apply ONCE after the first dlt run creates data_lake.lee_parcels
-- (python -m ingest.pipelines.lee_parcels.pipeline).
--
-- Sibling to docs/sql/collier_parcels_grant.sql — same shape, CO_NO=46 (Lee)
-- instead of CO_NO=21 (Collier). service_role (not anon) needs USAGE on the
-- schema + SELECT on the table+view, or the source connector returns 0 rows
-- silently (see feedback_premise-engine-supabase-roles.md).

GRANT USAGE ON SCHEMA data_lake TO service_role;
GRANT SELECT ON data_lake.lee_parcels TO service_role;


-- View: single-row Lee parcel snapshot — total parcels, SOH gap median (a
-- cross-check against properties-lee-value's existing LeePA-sourced SOH gap,
-- since this is a different source with a different value methodology), and a
-- parcel-count breakdown by FDOR's own DOR_UC use-code category (verbatim from
-- the 2025 NAL Data File User's Guide's "Use Code" table, p.5-10):
--   residential   000-002, 004-009
--   commercial    003, 010-039   (003 = multi-family 10+ units — FDOR classes
--                                 this as commercial, not residential)
--   industrial    040-049
--   agricultural  050-069
--   institutional 070-079
--   governmental  080-089
--   miscellaneous 090-099
--
-- SOH gap = (just value of the homestead portion - assessed value of the
-- homestead portion) / just value, i.e. the accumulated Save-Our-Homes cap
-- benefit — same formula as collier_parcels_summary.

CREATE OR REPLACE VIEW data_lake.lee_parcels_summary AS
SELECT
  COUNT(*)::int                                                     AS total_parcels,
  COUNT(*) FILTER (WHERE jv_hmstd > 0)::int                         AS soh_homesteaded_parcels,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY soh_gap_pct)::numeric AS soh_gap_median_pct,
  COUNT(*) FILTER (
    WHERE dor_uc IN ('000','001','002','004','005','006','007','008','009')
  )::int                                                            AS residential_parcels,
  COUNT(*) FILTER (
    WHERE dor_uc = '003' OR (dor_uc BETWEEN '010' AND '039')
  )::int                                                            AS commercial_parcels,
  COUNT(*) FILTER (WHERE dor_uc BETWEEN '040' AND '049')::int       AS industrial_parcels,
  COUNT(*) FILTER (WHERE dor_uc BETWEEN '050' AND '069')::int       AS agricultural_parcels,
  COUNT(*) FILTER (WHERE dor_uc BETWEEN '070' AND '079')::int       AS institutional_parcels,
  COUNT(*) FILTER (WHERE dor_uc BETWEEN '080' AND '089')::int       AS governmental_parcels,
  COUNT(*) FILTER (WHERE dor_uc BETWEEN '090' AND '099')::int       AS misc_parcels
FROM (
  SELECT
    dor_uc,
    jv_hmstd,
    CASE
      WHEN jv_hmstd > 0 AND av_hmstd IS NOT NULL
      THEN ((jv_hmstd - av_hmstd)::numeric / jv_hmstd) * 100
    END AS soh_gap_pct
  FROM data_lake.lee_parcels
) src;

GRANT SELECT ON data_lake.lee_parcels_summary TO service_role;

NOTIFY pgrst, 'reload schema';
