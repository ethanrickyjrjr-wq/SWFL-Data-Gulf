-- docs/sql/20260718_zip_active_dom_median.sql
-- Live per-ZIP median dom_days over ACTIVE for-sale listings, floored rows EXCLUDED
-- (floored dom_days are lower bounds and concentrate in the high-DOM tail — including
-- them understates "typical" and overstates a leverage gap). Read-time; nothing stored.
-- Apply: bun scripts/run-migration.ts docs/sql/20260718_zip_active_dom_median.sql
CREATE OR REPLACE FUNCTION data_lake.zip_active_dom_median(p_zip text)
RETURNS TABLE (median_dom numeric, sample_size bigint)
LANGUAGE sql STABLE AS $$
  SELECT
    percentile_cont(0.5) WITHIN GROUP (ORDER BY dom_days) AS median_dom,
    count(*) AS sample_size
  FROM data_lake.listing_dom
  WHERE sale_or_rent = 'sale'
    AND state = 'active'
    AND zip_code = p_zip
    AND dom_days IS NOT NULL
    AND dom_is_floor = false;
$$;
GRANT EXECUTE ON FUNCTION data_lake.zip_active_dom_median(text) TO service_role;
NOTIFY pgrst, 'reload schema';
