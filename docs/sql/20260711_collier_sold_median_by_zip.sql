-- Collier homes-only sold median per ZIP, from FDOR recorded-deed sale prices in
-- data_lake.collier_parcels. Mirror of data_lake.leepa_sold_median_by_zip, with ONE
-- structural difference: Collier's FDOR row carries a NATIVE situs ZIP (phy_zipcd), so
-- there is NO centroid->ZCTA crosswalk join (Lee needs one; Collier does not).
--
-- Headline home set: dor_uc IN ('001','004') = single-family + condo (FDOR DOR use
--   codes are 3-char here). Vacant residential ('000','009','099') is excluded — that
--   land tail is the $35k land-blend the active-listing median served; this view is its
--   sold, homes-only answer. (Verified vs the FDOR/Polk-PA use-code reference.)
-- Arm's-length: SALE_PRC1 is the most-recent recorded sale REGARDLESS of qualification,
--   so we drop the nominal-consideration tail with a >$20k price floor (mirrors Lee).
--   NOTE: we deliberately do NOT filter qual_cd1='01' — real market sales are miscoded
--   '99' (e.g. a $494k single-family at 34120), and the price floor already removes the
--   $100/'11' family-transfer tail. The median is robust to a few residual outliers.
-- Recency: 2024+ latest-recorded-sale per parcel (a stock of most-recent prices, NOT a
--   transaction-flow median) — matches the Lee view's recency window.
-- Min-N gate: a ZIP with < 20 qualifying sales reports the COUNTY median flagged
--   county_fallback = true — never a raw sub-20 ZIP median.
CREATE OR REPLACE VIEW data_lake.collier_sold_median_by_zip AS
WITH eligible AS (
  SELECT p.phy_zipcd AS zip_code, p.sale_prc1
  FROM data_lake.collier_parcels p
  WHERE p.dor_uc IN ('001', '004')
    AND p.sale_yr1 >= 2024
    AND p.sale_prc1 > 20000
    AND p.phy_zipcd IS NOT NULL
    AND p.phy_zipcd ~ '^[0-9]{5}$'
),
county AS (
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY sale_prc1) AS county_median,
         count(*)::int AS county_n
  FROM eligible
),
by_zip AS (
  SELECT zip_code,
         count(*)::int AS home_sales_n,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY sale_prc1) AS zip_median
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
