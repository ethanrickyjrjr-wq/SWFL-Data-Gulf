-- docs/sql/20260711_listing_active_stats_homes_only.sql
-- HOTFIX: exclude land parcels (and rental-priced mislabels) from data_lake.listing_active_stats.
--
-- WHY (live, public, ~10x error — audit 2026-07-11 §4a/§4b):
-- This view had NO property_type filter. Land parcels are ~21% of active "sale" rows region-wide
-- (7,285 rows, median $46,490) and locally dominant in Lehigh Acres, so the ZIP/region median asking
-- price was a BLEND of houses and raw lots. Shipping right now on /desk:
--   ZIP 33972 median_list_price = $35,000  (918 land @ $29.5k blended with 385 houses @ $354,999)
--   ZIP 33974 median_list_price = $31,360  (1,323 land @ $25k blended with 590 houses @ $319,999)
-- After this fix (verified via live SELECT 07/11/2026):
--   33972 -> $359,000 (403 homes)   33974 -> $325,000 (655 homes)
--
-- Two predicates added to the `active` CTE:
--   1. property_type <> 'land'  — the material fix. "median asking price counts homes only." Land is a
--      separate asset class with its own median; blending it is the bug. property_type is populated and
--      reliable (no NULLs in the active/sale/core-county set: single_family/condo/townhouse/multi_family/
--      land/other). Land drops from listing_count AND the price aggregates — this view is the residential
--      "median ask / active listings" surface, so count and median stay apples-to-apples (homes).
--   2. list_price >= 20000   — drops the 91 non-land rows priced $600-$9,900 mislabeled sale_or_rent='sale'
--      (audit §4b), incl. the 7-unit 10 Tampa Pl, Marco Island condo cluster ($6-9k, obvious seasonal
--      rentals). No legit for-sale home/condo in Lee/Collier lists under $20k; these are rental mislabels.
--      (Legit cheap land <$20k — 523 real Lehigh/Golden Gate lots — is moot here since all land is excluded.)
--
-- NOT a change to the INGEST boundary: land + the mislabeled rows STAY in data_lake.listing_state (the
-- lake). This only narrows the DISPLAY rollup, exactly like the Hendry core-county filter did (07/11).
-- Same column shape as 20260711_listing_active_stats_core_counties.sql (only the `active` CTE predicate
-- changes), so no consumer needs a column change.
--
-- The go-forward guard for this contamination class (content contracts at load) is Phase 1 of
-- docs/audit/2026-07-11-pipeline-problems/05-BUILD-SCOPE.md; this migration stops the live bleed now.
--
-- Apply via Bun.SQL (psql not installed): bun scripts/run-migration.ts docs/sql/20260711_listing_active_stats_homes_only.sql

CREATE OR REPLACE VIEW data_lake.listing_active_stats AS
WITH active AS (
  SELECT *
  FROM data_lake.listing_state
  WHERE source_name = 'api_feed'
    AND state = 'active'
    AND sale_or_rent = 'sale'
    AND list_price IS NOT NULL
    AND btrim(county) IN ('Lee', 'Collier')  -- CORE display scope; Hendry stays in the lake, drops from rollups
    AND property_type <> 'land'               -- HOMES ONLY: land is a separate asset class (audit §4a)
    AND list_price >= 20000                   -- drop rental-priced sale mislabels (audit §4b)
)
SELECT
  btrim(county)                                                          AS county,
  zip_code,
  count(*)::int                                                          AS listing_count,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY list_price))::bigint AS median_list_price,
  round(avg(days_on_market))::int                                        AS avg_days_on_market,  -- REAL (RentCast); NULL-skipping avg
  round(avg(list_price))::bigint                                         AS avg_list_price,
  max(scraped_at)                                                        AS latest_scraped_at
FROM active
-- Defense-in-depth: btrim in the GROUP too, not only the WHERE. Today's data is clean (county is
-- exactly 'Lee'/'Collier'), so this is a no-op now — but the WHERE already btrims, and a raw-county
-- GROUP would split any future whitespace-dirty value into a phantom region row. Match them.
-- NOTE: the (county, zip_code) set still emits a county+NULL-zip bucket for any listing whose
-- zip_code is NULL (a real listing with an unknown ZIP) — that is NOT the region total and NOT
-- contamination; region/county rollups remain correct.
GROUP BY GROUPING SETS ((btrim(county), zip_code), (btrim(county)), ());

GRANT SELECT ON data_lake.listing_active_stats TO service_role;
NOTIFY pgrst, 'reload schema';
