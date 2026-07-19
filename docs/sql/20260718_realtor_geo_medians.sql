-- 20260718_realtor_geo_medians.sql
--
-- data_lake.realtor_geo_medians — realtor.com city/county/neighborhood median
-- snapshots (monthly, /neighborhood-market-trends off 3 anchor properties; the
-- Redfin-retirement parallel run, operator-commissioned 07/18/2026). Medians are
-- the vendor's own — never recomputed. Append-with-captured_date time series;
-- same-period re-runs MERGE on (slug_id, captured_date). ~10 rows/month.
--
-- Cutover plan: after 2-3 overlap months, compare against Redfin in the
-- realtor_redfin_median_overlap view below; if city/county deltas hold within
-- tolerance (~2% observed 07/18/2026; Naples is definitionally different —
-- broad vs city-proper — and is NOT expected to match), retire the Redfin pull
-- and continue the served series from this table. Decision check:
-- realtor_redfin_overlap_cutover. Idempotent; run directly against prod (RULE 1).

CREATE TABLE IF NOT EXISTS data_lake.realtor_geo_medians (
  geo_type              text NOT NULL,          -- 'city' | 'county' | 'neighborhood'
  name                  text NOT NULL,
  slug_id               text NOT NULL,          -- vendor slug, e.g. 'Cape-Coral_FL'
  state_code            text,
  county                text,
  level                 text,                   -- neighborhood rows only (vendor's level)
  median_listing_price  bigint,
  median_sold_price     bigint,
  median_days_on_market integer,
  median_price_per_sqft integer,
  anchor_label          text,
  anchor_property_id    text,
  captured_date         date NOT NULL,
  source_tag            text NOT NULL DEFAULT 'realtor.com',
  PRIMARY KEY (slug_id, captured_date)
);

-- Overlap read for the cutover decision: latest realtor city/county medians vs the
-- matching Redfin region's latest month. Redfin lags ~6 weeks, so months rarely
-- align exactly — delta_pct is a cross-vendor sanity band, not a same-month diff.
CREATE OR REPLACE VIEW data_lake.realtor_redfin_median_overlap AS
WITH realtor AS (
  SELECT DISTINCT ON (slug_id)
    slug_id, geo_type, name, median_sold_price, captured_date
  FROM data_lake.realtor_geo_medians
  WHERE geo_type IN ('city', 'county') AND median_sold_price IS NOT NULL
  ORDER BY slug_id, captured_date DESC
),
redfin AS (
  SELECT DISTINCT ON (region)
    region, median_sale_price, period_end
  FROM data_lake.redfin_city_swfl
  WHERE property_type = 'All Residential'
    AND region IN ('Cape Coral, FL', 'Fort Myers, FL', 'Naples, FL')
  ORDER BY region, period_end DESC
),
redfin_county AS (
  SELECT 'Lee' AS county, median_sale_price, period_end
  FROM data_lake.redfin_lee_market
  WHERE property_type = 'All Residential'
  ORDER BY period_end DESC LIMIT 1
),
redfin_county2 AS (
  SELECT 'Collier' AS county, median_sale_price, period_end
  FROM data_lake.redfin_collier_market
  WHERE property_type = 'All Residential'
  ORDER BY period_end DESC LIMIT 1
),
redfin_all AS (
  SELECT region AS match_key, median_sale_price, period_end FROM redfin
  UNION ALL
  SELECT county || ' County', median_sale_price, period_end
  FROM (SELECT * FROM redfin_county UNION ALL SELECT * FROM redfin_county2) c
)
SELECT
  r.geo_type,
  r.name,
  r.slug_id,
  r.median_sold_price   AS realtor_median_sold,
  r.captured_date       AS realtor_as_of,
  rf.median_sale_price  AS redfin_median_sale,
  rf.period_end         AS redfin_period_end,
  round((100.0 * (r.median_sold_price - rf.median_sale_price)
        / NULLIF(rf.median_sale_price, 0))::numeric, 1) AS delta_pct
FROM realtor r
LEFT JOIN redfin_all rf
  ON rf.match_key = CASE
       WHEN r.geo_type = 'city'   THEN r.name || ', FL'
       WHEN r.geo_type = 'county' THEN r.name || ' County'
     END;

GRANT SELECT ON data_lake.realtor_geo_medians TO service_role;
GRANT SELECT ON data_lake.realtor_redfin_median_overlap TO service_role;

NOTIFY pgrst, 'reload schema';
