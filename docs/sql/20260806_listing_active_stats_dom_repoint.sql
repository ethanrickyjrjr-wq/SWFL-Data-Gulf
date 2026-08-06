-- docs/sql/20260806_listing_active_stats_dom_repoint.sql
-- Repoints listing_active_stats.avg_days_on_market off the dead RentCast
-- `days_on_market` column (NULL on every api_feed row — checks-ledger key
-- listing_active_stats_dom_repoint) onto the real per-listing DOM authority,
-- data_lake.listing_dom (docs/sql/20260717_listing_dom.sql). Floored rows
-- (dom_is_floor = true, a censored lower bound, not a real DOM) are excluded
-- from the average — same honesty rule zip_active_dom_median already applies
-- (docs/sql/20260718_zip_active_dom_median.sql).
--
-- Same base rows as before (LEFT JOIN off listing_active_homes, so a listing
-- with no listing_dom match — shouldn't happen, both are api_feed subsets of
-- listing_state — still counts toward listing_count/median_list_price, just
-- contributes nothing to avg_days_on_market).
--
-- Apply via Bun.SQL (psql not installed):
--   bun scripts/run-migration.ts docs/sql/20260806_listing_active_stats_dom_repoint.sql

CREATE OR REPLACE VIEW data_lake.listing_active_stats AS
SELECT
  btrim(h.county)                                                          AS county,
  h.zip_code,
  count(*)::int                                                            AS listing_count,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY h.list_price))::bigint AS median_list_price,
  round(avg(d.dom_days) FILTER (WHERE d.dom_is_floor = false))::int        AS avg_days_on_market,
  round(avg(h.list_price))::bigint                                        AS avg_list_price,
  max(h.scraped_at)                                                       AS latest_scraped_at
FROM data_lake.listing_active_homes h
LEFT JOIN data_lake.listing_dom d USING (address_key, sale_or_rent)
GROUP BY GROUPING SETS ((btrim(h.county), h.zip_code), (btrim(h.county)), ());

GRANT SELECT ON data_lake.listing_active_stats TO service_role;
NOTIFY pgrst, 'reload schema';
