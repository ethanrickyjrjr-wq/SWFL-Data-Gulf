-- docs/sql/20260712_listing_active_homes_authority.sql
-- ONE AUTHORITY for "an active, for-sale, clean-priced HOME in core scope".
--
-- WHY: the cleaning predicate (api_feed + active + sale + Lee/Collier + not-land +
-- >=20k, per the 07/11 land-contamination hotfix) lived only inside
-- listing_active_stats' CTE. The daily-price dual-signal build adds a second
-- consumer (the per-city median-asking writer in ingest/pipelines/live_search,
-- fetch_mode: lake). Copying the predicate would recreate the drift class that
-- caused the ZIP-scope bug (one shared concept, two hand-synced copies) — so the
-- predicate is extracted here and BOTH consumers read this view:
--   1. data_lake.listing_active_stats  (region/county/ZIP rollups — the desk)
--   2. the median_asking_price daily_truth writer (per-city median, lake mode)
--
-- Same predicates as 20260711_listing_active_stats_homes_only.sql, verbatim —
-- this migration only MOVES them; listing_active_stats' output is bit-identical.
--
-- Apply via Bun.SQL (psql not installed):
--   bun scripts/run-migration.ts docs/sql/20260712_listing_active_homes_authority.sql

CREATE OR REPLACE VIEW data_lake.listing_active_homes AS
SELECT *
FROM data_lake.listing_state
WHERE source_name = 'api_feed'
  AND state = 'active'
  AND sale_or_rent = 'sale'
  AND list_price IS NOT NULL
  AND btrim(county) IN ('Lee', 'Collier')  -- CORE display scope; Hendry stays in the lake, drops from rollups
  AND property_type <> 'land'               -- HOMES ONLY: land is a separate asset class (audit 07/11 §4a)
  AND list_price >= 20000;                  -- drop rental-priced sale mislabels (audit 07/11 §4b)

CREATE OR REPLACE VIEW data_lake.listing_active_stats AS
SELECT
  btrim(county)                                                          AS county,
  zip_code,
  count(*)::int                                                          AS listing_count,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY list_price))::bigint AS median_list_price,
  round(avg(days_on_market))::int                                        AS avg_days_on_market,  -- REAL (RentCast); NULL-skipping avg
  round(avg(list_price))::bigint                                         AS avg_list_price,
  max(scraped_at)                                                        AS latest_scraped_at
FROM data_lake.listing_active_homes
-- Defense-in-depth btrim in the GROUP too (see 20260711 note); the NULL-zip
-- county bucket remains a real-listings bucket, not contamination.
GROUP BY GROUPING SETS ((btrim(county), zip_code), (btrim(county)), ());

GRANT SELECT ON data_lake.listing_active_homes TO service_role;
GRANT SELECT ON data_lake.listing_active_stats TO service_role;
NOTIFY pgrst, 'reload schema';
