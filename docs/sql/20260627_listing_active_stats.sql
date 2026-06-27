-- data_lake.listing_active_stats — aggregate-at-source view over the lifecycle state machine, for
-- the active-listings brain (2A fold-in: the brain reads the active subset of listing_state instead
-- of the capped Source-A table). Same column shape as the old active_listings_residential_zip_stats
-- so the consuming connector swaps with a one-line view-name change.
--
-- Pushes COUNT + per-grain median (percentile_cont) + avg DOM into SQL at THREE grains via GROUPING
-- SETS (region / county / ZIP), so the pack reads ~tens of rows, never the ~19k listings.
--   county NULL,     zip_code NULL     -> region grain (headline key_metrics)
--   county NOT NULL, zip_code NULL     -> county grain
--   county NOT NULL, zip_code NOT NULL -> ZIP grain    (detail_tables)
--
-- Why this is simpler than the old view: listing_state is MERGE-on-(source,address,sale_or_rent) and
-- a delisted listing MOVES to state='holding' (never lingers as a stale 'active' row). So filtering
-- state='active' already means "currently on the market" — no per-county latest-batch window needed
-- (that window only existed to fight stale-row accumulation in the old append-style table).
--
-- DAYS ON MARKET IS LEFT OPEN (null) on purpose — operator decree 2026-06-27. Source B's cards carry
-- no market days-on-market, and our days_in_state tick is NOT true DOM for the existing inventory: we
-- can't see how long a listing sat before our first scan, so the tick undercounts DOM for the bulk
-- (>half) of seed listings. Rather than fake it (0/tick masquerading as DOM) or hide the column, we
-- keep the column present and empty until a real DOM source lands — the per-listing detail-page list
-- date, or the incumbent feed's MLS DOM. The days_in_state tick keeps accumulating in listing_state
-- for that future lane (and for net-new listings caught day-one, where tick == true DOM).

CREATE OR REPLACE VIEW data_lake.listing_active_stats AS
WITH active AS (
  SELECT *
  FROM data_lake.listing_state
  WHERE source_name = 'lifecycle_seed'
    AND state = 'active'
    AND sale_or_rent = 'sale'
    AND list_price IS NOT NULL
)
SELECT
  county,
  zip_code,
  count(*)::int                                                          AS listing_count,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY list_price))::bigint AS median_list_price,
  NULL::int                                                              AS avg_days_on_market,  -- OPEN: real DOM not yet sourced (see header)
  round(avg(list_price))::bigint                                         AS avg_list_price,
  max(scraped_at)                                                        AS latest_scraped_at
FROM active
GROUP BY GROUPING SETS ((county, zip_code), (county), ());

GRANT SELECT ON data_lake.listing_active_stats TO service_role;
NOTIFY pgrst, 'reload schema';
