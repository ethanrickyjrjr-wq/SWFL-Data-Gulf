-- Lee homes-only sold median per ZIP, from LeePA recorded-deed sale prices
-- already live in data_lake.leepa_parcels, grouped by the centroid->ZCTA
-- crosswalk in data_lake.leepa_parcel_zip.
--
-- Headline home set: use_code IN ('01','04')  = single-family + condo. Vacant
--   residential ('00') is always excluded (that land tail is the $35k land-blend
--   the active-listing median served — this view is its sold, homes-only answer).
-- Arm's-length: LeePA already exposes the last QUALIFIED sale; add a >$20k price
--   floor to drop the nominal-consideration tail.
-- Recency: 2024+ latest-qualified-sale per parcel (a stock of most-recent prices,
--   NOT a transaction-flow median).
-- Min-N gate: a ZIP with < 20 qualifying sales reports the COUNTY median flagged
--   county_fallback = true — never a raw sub-20 ZIP median.
CREATE OR REPLACE VIEW data_lake.leepa_sold_median_by_zip AS
WITH eligible AS (
  SELECT z.zip_code, p.last_sale_amount
  FROM data_lake.leepa_parcels p
  JOIN data_lake.leepa_parcel_zip z ON z.folioid = p.folioid
  WHERE p.use_code IN ('01', '04')
    AND p.last_sale_date >= DATE '2024-01-01'
    AND p.last_sale_amount > 20000
    AND z.zip_code IS NOT NULL
),
county AS (
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY last_sale_amount) AS county_median,
         count(*)::int AS county_n
  FROM eligible
),
by_zip AS (
  SELECT zip_code,
         count(*)::int AS home_sales_n,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY last_sale_amount) AS zip_median
  FROM eligible
  GROUP BY zip_code
)
SELECT b.zip_code,
       b.home_sales_n,
       round(CASE WHEN b.home_sales_n >= 20 THEN b.zip_median ELSE c.county_median END) AS median_sale,
       (b.home_sales_n < 20) AS county_fallback,
       round(c.county_median) AS county_median,
       c.county_n
FROM by_zip b
CROSS JOIN county c
ORDER BY b.zip_code;
