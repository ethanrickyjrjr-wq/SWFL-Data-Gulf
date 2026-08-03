-- Aggregate-at-source view over steadyapi_listing_events (family A) for the active-listings-swfl
-- pack — region + county grain, mirrors listing_active_stats's GROUPING SETS shape (county IS NULL
-- = region row). Only real cuts (price_change < 0) count; a positive/zero price_change is not a cut.
CREATE OR REPLACE VIEW data_lake.listing_recent_price_cuts_stats AS
SELECT
  county,
  count(DISTINCT property_id)                                          AS properties_with_recent_cut,
  count(*)                                                              AS cut_events,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY price_change)             AS median_price_change,
  max(parsed_at)                                                        AS latest_parsed_at
FROM data_lake.steadyapi_listing_events
WHERE event_name = 'Price Changed'
  AND event_date >= (current_date - interval '90 days')
  AND price_change < 0
GROUP BY GROUPING SETS ((county), ());

GRANT SELECT ON data_lake.listing_recent_price_cuts_stats TO service_role;
NOTIFY pgrst, 'reload schema';
