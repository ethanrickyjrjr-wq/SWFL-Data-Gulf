-- Sold-median recency window — fixes a stale-blend defect in BOTH sold-median views.
--
-- WHY (probed 07/14/2026, verified against 4 independent sources):
--   Both views selected "2024+ latest-sale-per-parcel" — a STOCK of most-recent prices
--   spanning 2.5 years, not a transaction-flow median. In a market that has fallen
--   (Lee 33904: ZHVI -7.3% YoY, Redfin -10.2% YoY), blending 2024 into 2026 pushes the
--   median HIGH:
--     Lee 33904 — 2024: $380,000 | 2025: $350,000 | 2026: $340,000
--                 old blended view: $362,250  (+6.6% vs the true trailing-12mo $340,000)
--   The old number would have made our CORRECT value figure ($339,699 ZHVI) look wrong.
--
--   The true 33904 sold median is confirmed by four independent sources at ~$337k-$340k:
--     LeePA recorded deeds (trailing 90d) .... $337,450
--     Redfin MLS (3mo ending May 2026) ....... $337,000
--     Zillow ZHVI (05/31/2026) ............... $339,699
--     realtor.com (data_lake.market_details_swfl) $340,000
--   The new rolling-12-month window returns $340,000 for 33904. County-level sanity:
--   new Lee county median $355,299 vs Redfin's $360,000 (1.3% apart); the old blend said
--   $370,000 (2.8% high).
--
-- WHAT CHANGED:
--   1. Recency: "2024+ stock" -> ROLLING 12 MONTHS, anchored on max(sale date) IN THE DATA
--      (never current_date — both counties post late; see data_through below).
--   2. New column `data_through` = the anchor date. Both parcel feeds lag, and by very
--      different amounts, so the as-of MUST travel with the number:
--        Lee    (LeePA)      ~6 weeks behind — data_through 2026-06-01
--        Collier(FDOR NAL)  ~12 MONTHS behind — data_through 2025-06-01, zero 2026 sales.
--      Collier's lag is structural (FDOR ships an annual roll), NOT an ingest bug. Its
--      sold median can never be a "current" number and must never be labelled as one.
--      For a CURRENT Collier sold median, use data_lake.market_details_swfl (realtor.com,
--      per-ZIP median_sold_price, both counties) — already ingested, not yet wired.
--
-- UNCHANGED: homes-only use codes, >$20k nominal-consideration floor, min-N=20 gate with
--   county_fallback. Under the tighter window 35 of 38 Lee ZIPs still clear min-N.
--
-- Column list is additive only (data_through appended), so the refinery source connectors
-- — which select explicit columns — are unaffected. No pack contract change.
--
-- Apply via Bun.SQL (psql not installed):
--   bun scripts/run-migration.ts docs/sql/20260714_sold_median_recency_window.sql

-- ---------------------------------------------------------------- Lee (LeePA)
CREATE OR REPLACE VIEW data_lake.leepa_sold_median_by_zip AS
WITH anchor AS (
  SELECT max(last_sale_date) AS data_through
  FROM data_lake.leepa_parcels
  WHERE use_code IN ('01', '04')
    AND last_sale_amount > 20000
),
eligible AS (
  SELECT p.zip_code, p.last_sale_amount
  FROM data_lake.leepa_parcels p
  CROSS JOIN anchor a
  WHERE p.use_code IN ('01', '04')
    AND p.last_sale_amount > 20000
    AND p.zip_code IS NOT NULL
    AND p.last_sale_date > (a.data_through - INTERVAL '12 months')
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
       c.county_n,
       a.data_through
FROM by_zip b
CROSS JOIN county c
CROSS JOIN anchor a
ORDER BY b.zip_code;

-- ------------------------------------------------------------ Collier (FDOR NAL)
-- sale_yr1/sale_mo1 are bigints; FDOR carries no day, so month-grain is the true grain.
CREATE OR REPLACE VIEW data_lake.collier_sold_median_by_zip AS
WITH dated AS (
  SELECT p.phy_zipcd AS zip_code,
         p.sale_prc1,
         make_date(p.sale_yr1::int, p.sale_mo1::int, 1) AS sale_date
  FROM data_lake.collier_parcels p
  WHERE p.dor_uc IN ('001', '004')
    AND p.sale_prc1 > 20000
    AND p.phy_zipcd IS NOT NULL
    AND p.phy_zipcd ~ '^[0-9]{5}$'
    AND p.sale_yr1 BETWEEN 1980 AND 2100
    AND p.sale_mo1 BETWEEN 1 AND 12
),
anchor AS (
  SELECT max(sale_date) AS data_through FROM dated
),
eligible AS (
  SELECT d.zip_code, d.sale_prc1
  FROM dated d
  CROSS JOIN anchor a
  WHERE d.sale_date > (a.data_through - INTERVAL '12 months')
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
       c.county_n,
       a.data_through
FROM by_zip b
CROSS JOIN county c
CROSS JOIN anchor a
ORDER BY b.zip_code;

GRANT SELECT ON data_lake.leepa_sold_median_by_zip TO service_role;
GRANT SELECT ON data_lake.collier_sold_median_by_zip TO service_role;
NOTIFY pgrst, 'reload schema';
