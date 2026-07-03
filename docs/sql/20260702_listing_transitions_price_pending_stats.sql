-- docs/sql/20260702_listing_transitions_price_pending_stats.sql
-- Sold-price-pending split for the lifecycle digest (sold-price-pending-backfill build).
-- A sold transition captured with a 0/absent price is a CONFIRMED sale whose closing price
-- hasn't posted to the county record yet (deed lag — or an undisclosed land-trust sale that
-- never will). The digest can then say "9 sales (7 recorded, 2 awaiting county record)"
-- instead of silently counting the $0 rows as if priced.
--
-- Additive-only: same view, two columns APPENDED (CREATE OR REPLACE requires existing column
-- positions to hold, so they land after latest_at). sales_30d/90d stay the TOTAL sold count;
-- the pending columns are the subset with no positive price — consumers subtract for "recorded".
--
-- Apply: bun scripts/run-migration.ts docs/sql/20260702_listing_transitions_price_pending_stats.sql

CREATE OR REPLACE VIEW data_lake.listing_transitions_recent_zip_stats AS
WITH recent AS (
  SELECT t.*, s.zip_code, s.county
  FROM data_lake.listing_transitions t
  JOIN data_lake.listing_state s USING (address_key, sale_or_rent)
  WHERE t.source_name = 'api_feed'
    AND t.seed = false
    AND t.at >= current_date - interval '90 days'
)
SELECT
  county,
  zip_code,
  count(*) FILTER (WHERE at >= current_date - interval '30 days' AND from_state = to_state AND price_delta < 0) AS price_cuts_30d,
  count(*) FILTER (WHERE at >= current_date - interval '30 days' AND from_state = to_state AND price_delta > 0) AS price_raises_30d,
  count(*) FILTER (WHERE at >= current_date - interval '30 days' AND to_state = 'holding')                     AS new_holdings_30d,
  count(*) FILTER (WHERE at >= current_date - interval '30 days' AND to_state = 'sold')                        AS sales_30d,
  count(*) FILTER (WHERE at >= current_date - interval '30 days' AND from_state IS NULL)                       AS new_listings_30d,
  count(*) FILTER (WHERE from_state = to_state AND price_delta < 0) AS price_cuts_90d,
  count(*) FILTER (WHERE from_state = to_state AND price_delta > 0) AS price_raises_90d,
  count(*) FILTER (WHERE to_state = 'holding')                     AS new_holdings_90d,
  count(*) FILTER (WHERE to_state = 'sold')                        AS sales_90d,
  count(*) FILTER (WHERE from_state IS NULL)                       AS new_listings_90d,
  max(at) AS latest_at,
  count(*) FILTER (WHERE at >= current_date - interval '30 days' AND to_state = 'sold'
                     AND (sold_price IS NULL OR sold_price <= 0))  AS sales_price_pending_30d,
  count(*) FILTER (WHERE to_state = 'sold'
                     AND (sold_price IS NULL OR sold_price <= 0))  AS sales_price_pending_90d
FROM recent
GROUP BY GROUPING SETS ((county, zip_code), (county), ());

GRANT SELECT ON data_lake.listing_transitions_recent_zip_stats TO service_role;
NOTIFY pgrst, 'reload schema';
