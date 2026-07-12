-- /desk price-band affordability histogram — aggregate at source (never haul
-- raw listing rows to count bands). Filter set mirrors listing_active_stats
-- EXACTLY (api_feed · active · sale · Lee/Collier · no land · price ≥ $20k) so
-- the histogram's total reconciles with the desk's "Active listings" KPI.
-- Idempotent: CREATE OR REPLACE VIEW. Region rollup = rows with county IS NULL.

CREATE OR REPLACE VIEW data_lake.listing_price_bands AS
WITH active AS (
  SELECT btrim(county) AS county, list_price, scraped_at
  FROM data_lake.listing_state
  WHERE source_name = 'api_feed'
    AND state = 'active'
    AND sale_or_rent = 'sale'
    AND list_price IS NOT NULL
    AND btrim(county) = ANY (ARRAY['Lee'::text, 'Collier'::text])
    AND property_type <> 'land'
    AND list_price >= 20000
),
banded AS (
  SELECT
    county,
    CASE
      WHEN list_price < 250000 THEN 0
      WHEN list_price < 400000 THEN 1
      WHEN list_price < 600000 THEN 2
      WHEN list_price < 1000000 THEN 3
      WHEN list_price < 2000000 THEN 4
      ELSE 5
    END AS band_order,
    CASE
      WHEN list_price < 250000 THEN 'Under $250K'
      WHEN list_price < 400000 THEN '$250–400K'
      WHEN list_price < 600000 THEN '$400–600K'
      WHEN list_price < 1000000 THEN '$600K–1M'
      WHEN list_price < 2000000 THEN '$1–2M'
      ELSE '$2M+'
    END AS band,
    scraped_at
  FROM active
)
SELECT
  county,
  band_order,
  band,
  count(*)::integer AS listing_count,
  max(scraped_at) AS latest_scraped_at
FROM banded
GROUP BY GROUPING SETS ((county, band_order, band), (band_order, band));

GRANT SELECT ON data_lake.listing_price_bands TO service_role;
