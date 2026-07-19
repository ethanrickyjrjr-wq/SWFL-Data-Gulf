-- docs/sql/20260719_wins_functions.sql
-- Why Isn't It Selling v1 — read-time aggregates over data_lake.listing_dom.
-- Floored rows are EXCLUDED from every median/percentile denominator that claims
-- "typical" (they are lower bounds; including them understates typical DOM).
-- Apply: bun scripts/run-migration.ts docs/sql/20260719_wins_functions.sql

CREATE OR REPLACE FUNCTION data_lake.zip_band_dom_median(p_zip text)
RETURNS TABLE (band int, price_lo numeric, price_hi numeric, median_dom numeric, sample_size bigint)
LANGUAGE sql STABLE AS $$
  WITH active AS (
    SELECT list_price::numeric AS price, dom_days, dom_is_floor
    FROM data_lake.listing_dom
    WHERE sale_or_rent = 'sale' AND state = 'active' AND zip_code = p_zip
      AND list_price IS NOT NULL AND list_price > 0
  ), banded AS (
    SELECT ntile(5) OVER (ORDER BY price) AS band, price, dom_days, dom_is_floor FROM active
  )
  SELECT band, min(price), max(price),
    percentile_cont(0.5) WITHIN GROUP (ORDER BY dom_days)
      FILTER (WHERE dom_is_floor = false AND dom_days IS NOT NULL),
    count(*) FILTER (WHERE dom_is_floor = false AND dom_days IS NOT NULL)
  FROM banded GROUP BY band ORDER BY band;
$$;

CREATE OR REPLACE FUNCTION data_lake.zip_active_stale_share(p_zip text)
RETURNS TABLE (active_count bigint, exact_count bigint, over_90 bigint, over_180 bigint)
LANGUAGE sql STABLE AS $$
  SELECT count(*),
         count(*) FILTER (WHERE dom_is_floor = false AND dom_days IS NOT NULL),
         count(*) FILTER (WHERE dom_is_floor = false AND dom_days >= 90),
         count(*) FILTER (WHERE dom_is_floor = false AND dom_days >= 180)
  FROM data_lake.listing_dom
  WHERE sale_or_rent = 'sale' AND state = 'active' AND zip_code = p_zip;
$$;

CREATE OR REPLACE FUNCTION data_lake.zip_price_position(p_zip text, p_price numeric, p_ppsf numeric)
RETURNS TABLE (price_pctile numeric, ppsf_pctile numeric, price_n bigint, ppsf_n bigint)
LANGUAGE sql STABLE AS $$
  WITH active AS (
    SELECT list_price::numeric AS price,
           CASE WHEN sqft IS NOT NULL AND sqft > 0
                THEN list_price::numeric / sqft ELSE NULL END AS ppsf
    FROM data_lake.listing_dom
    WHERE sale_or_rent = 'sale' AND state = 'active' AND zip_code = p_zip
      AND list_price IS NOT NULL AND list_price > 0
  )
  SELECT
    CASE WHEN count(*) > 0 AND p_price IS NOT NULL
         THEN round(100.0 * count(*) FILTER (WHERE price <= p_price) / count(*), 0) END,
    CASE WHEN count(ppsf) > 0 AND p_ppsf IS NOT NULL
         THEN round(100.0 * count(*) FILTER (WHERE ppsf IS NOT NULL AND ppsf <= p_ppsf) / count(ppsf), 0) END,
    count(*), count(ppsf)
  FROM active;
$$;

GRANT EXECUTE ON FUNCTION data_lake.zip_band_dom_median(text) TO service_role;
GRANT EXECUTE ON FUNCTION data_lake.zip_active_stale_share(text) TO service_role;
GRANT EXECUTE ON FUNCTION data_lake.zip_price_position(text, numeric, numeric) TO service_role;
NOTIFY pgrst, 'reload schema';
