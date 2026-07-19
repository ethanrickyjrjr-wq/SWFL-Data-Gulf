-- 20260718_redfin_metro_sold_pivoted.sql
--
-- Root view: 3-metro monthly MEDIAN SALE PRICE (Redfin, All Residential) in the
-- exact column shape of data_lake.zhvi_pivoted (month, cape_coral, fort_myers,
-- naples) so loadMetros/loadMetroTrend swap by view name alone. This replaces the
-- ZHVI index on the user-facing metro value charts (operator decision 07/18/2026:
-- serve a true median, retire the index from user surfaces; ZHVI remains internal
-- for the investor yield calc).
--
-- Boundary note: Redfin's "Naples, FL" is city-proper (~$1.2M), NOT the broad
-- mailing-address Naples (~$619k realtor city sweep) — the chart series labels the
-- line "Naples (city)". Cape Coral / Fort Myers boundaries agree with realtor
-- within ~2% (live cross-check 07/18/2026).
--
-- AVG is the pivot mechanism only: (region, period_end, property_type) is unique
-- in data_lake.redfin_city_swfl (verified 421 = 421 distinct, 07/18/2026), so no
-- blending occurs. If the ingest ever lands revisions as extra rows, revisit with
-- DISTINCT ON (_dlt_load_id DESC).
--
-- Idempotent. Run directly against prod (RULE 1), then NOTIFY pgrst.

CREATE OR REPLACE VIEW data_lake.redfin_metro_sold_pivoted AS
SELECT
  to_char(period_end, 'YYYY-MM')                                   AS month,
  AVG(median_sale_price) FILTER (WHERE region = 'Cape Coral, FL')  AS cape_coral,
  AVG(median_sale_price) FILTER (WHERE region = 'Fort Myers, FL')  AS fort_myers,
  AVG(median_sale_price) FILTER (WHERE region = 'Naples, FL')      AS naples
FROM data_lake.redfin_city_swfl
WHERE region IN ('Cape Coral, FL', 'Fort Myers, FL', 'Naples, FL')
  AND property_type = 'All Residential'
GROUP BY to_char(period_end, 'YYYY-MM')
ORDER BY month;

GRANT SELECT ON data_lake.redfin_metro_sold_pivoted TO service_role;

NOTIFY pgrst, 'reload schema';
