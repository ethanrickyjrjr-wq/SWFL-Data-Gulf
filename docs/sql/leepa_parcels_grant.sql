-- Grant brain-platform's service_role read access to the Tier 2 LeePA parcels table
-- plus the two pre-aggregation views the properties-lee-value source connector reads.
-- Apply ONCE after the first dlt run creates data_lake.leepa_parcels
-- (python -m ingest.pipelines.leepa.pipeline → ingest_leepa_parcels_value step).
--
-- Brain-platform's Supabase key is service_role (not anon). Without USAGE on
-- the schema + SELECT on the table+views, the source connector returns 0 rows
-- silently. See feedback_premise-engine-supabase-roles.md.
--
-- Schema is auto-created by dlt with the 15 columns pinned in
-- ingest/pipelines/leepa/resources.py:_TIER2_LEEPA_COLUMNS. The PRIMARY KEY on
-- folioid is declared via the dlt resource hint and enforced at first load.

GRANT USAGE ON SCHEMA data_lake TO service_role;
GRANT SELECT ON data_lake.leepa_parcels TO service_role;


-- View: per-calendar-year qualified-sale counts derived from each parcel's
-- LATEST qualified sale (layer 10). Lee has ~400k parcels; pulling raw rows
-- per refinery run is wasteful, so the velocity aggregation lives here.
--
-- Survival bias warning (also surfaced in the brain's caveats): re-sales
-- overwrite older sales for the same parcel, so earlier-year buckets are a
-- floor of true transaction volume, not a faithful count.

CREATE OR REPLACE VIEW data_lake.leepa_parcels_sales_yearly AS
SELECT
  EXTRACT(YEAR FROM last_sale_date)::int AS sale_year,
  COUNT(*)::int                          AS sales_count
FROM data_lake.leepa_parcels
WHERE last_sale_date IS NOT NULL
GROUP BY EXTRACT(YEAR FROM last_sale_date)
ORDER BY sale_year;

GRANT SELECT ON data_lake.leepa_parcels_sales_yearly TO service_role;


-- View: single-row snapshot summary — total parcels, count of actively
-- homesteaded parcels (cap_difference > 0 = SOH cap is currently applying),
-- and the median (just-taxable)/just gap across that homesteaded set.
--
-- The CASE wraps NULL-protection on just_value (can't divide by zero) and
-- restricts the gap calc to the homesteaded population. percentile_cont
-- ignores NULLs by default, so non-homestead parcels drop out of the median.

CREATE OR REPLACE VIEW data_lake.leepa_parcels_summary AS
SELECT
  COUNT(*)::int                                                       AS total_parcels,
  COUNT(*) FILTER (WHERE cap_difference > 0)::int                     AS soh_homesteaded_parcels,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY soh_gap_pct)::numeric   AS soh_gap_median_pct
FROM (
  SELECT
    cap_difference,
    CASE
      WHEN cap_difference > 0 AND just_value > 0
      THEN ((just_value - taxable_value)::numeric / just_value) * 100
    END AS soh_gap_pct
  FROM data_lake.leepa_parcels
) src;

GRANT SELECT ON data_lake.leepa_parcels_summary TO service_role;
