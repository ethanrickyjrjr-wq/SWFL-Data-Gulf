-- docs/sql/20260711_listing_active_stats_core_counties.sql
-- Scope data_lake.listing_active_stats to the CORE display counties (Lee + Collier) at the source.
--
-- WHY: this view's GROUPING SETS produce a region total (county NULL, zip NULL) and one row per
-- county. With no county filter, the region total was a median BLENDED across every county the
-- ingest touches — which since 07/02/2026 includes Hendry (constants_api.py IN_SCOPE_FIPS). So
-- "SWFL median ask" / "SWFL active listings" on /desk (and every consumer of the ()-grouping row)
-- silently mixed Hendry in, and a "Hendry median ask" county tile appeared on the wire ticker.
--
-- The zip-scope-core effort (07/11/2026) filtered ZIP-grain PACK outputs through isCoreScope, but a
-- ZIP-string predicate can't reach a GROUP BY (county) / GROUP BY () aggregate computed inside this
-- SQL view. This filter is the county/region-grain equivalent: drop non-core counties BEFORE the
-- grouping sets run, so region, county, and ZIP grains are all Lee+Collier only. Mirrors
-- refinery/lib/core-scope.mts CORE_SCOPE_COUNTY_NAMES ({"Lee","Collier"}) / isCoreCounty.
--
-- NOT a reversal of the Hendry INGEST decision (hendry_seed_orphans, 07/02). Hendry rows STAY in
-- data_lake.listing_state (the lake boundary) — this only narrows the DISPLAY rollup. btrim() guards
-- the known stray whitespace-dirty "Lee" county value (a 1-listing duplicate group).
--
-- Same column shape as 20260630_listing_active_stats_api.sql (the only change is the added county
-- predicate in the `active` CTE), so no consumer needs a column change.
--
-- Apply via Bun.SQL (psql not installed): bun scripts/run-migration.ts docs/sql/20260711_listing_active_stats_core_counties.sql

CREATE OR REPLACE VIEW data_lake.listing_active_stats AS
WITH active AS (
  SELECT *
  FROM data_lake.listing_state
  WHERE source_name = 'api_feed'
    AND state = 'active'
    AND sale_or_rent = 'sale'
    AND list_price IS NOT NULL
    AND btrim(county) IN ('Lee', 'Collier')  -- CORE display scope; Hendry stays in the lake, drops from rollups
)
SELECT
  county,
  zip_code,
  count(*)::int                                                          AS listing_count,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY list_price))::bigint AS median_list_price,
  round(avg(days_on_market))::int                                        AS avg_days_on_market,  -- REAL (RentCast); NULL-skipping avg
  round(avg(list_price))::bigint                                         AS avg_list_price,
  max(scraped_at)                                                        AS latest_scraped_at
FROM active
GROUP BY GROUPING SETS ((county, zip_code), (county), ());

GRANT SELECT ON data_lake.listing_active_stats TO service_role;
NOTIFY pgrst, 'reload schema';
