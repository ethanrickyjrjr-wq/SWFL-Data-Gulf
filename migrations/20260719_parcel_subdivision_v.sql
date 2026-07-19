-- parcel_subdivision_v — the two-county homes-only VIEW that retires data_lake.parcel_subdivision.
-- Design: docs/handoff/2026-07-18-parcel-consolidation.md §4c (operator-greenlit dedup; the ONLY
-- greenlit parcel deletion — leepa_parcels is KEEP BOTH, never dropped).
--
-- Exposes parcel_subdivision's EXACT column names/types so every reader repoint is a table-name
-- swap. subdivision_name is the validated \y-stem of legal_description (matched the retired
-- table 100.00% for both counties: Collier 220,399/220,399 joined, Lee 383,487/383,487 joined,
-- plus a 20k/county pre-create sample re-verify on 07/19 — name/zip/property_type all 100%).
-- COALESCE to '' preserves the retired table's unknown-name convention (0 true NULLs, '' for
-- no-name) — neighborhood_stats.subdivision_name is NOT NULL, so a NULL-name group aborts the
-- rollup (hit live 07/19 on the 476 Collier parcels whose legal_description the fresher FDOR
-- vintage dropped; they now fold into the '' group like every other unknown).
-- Homes-only filter = dor_uc IN ('001','002','004','005','007','008'), same as the retired
-- pipeline's DOR_HOME_TYPE.
--
-- Idempotent: CREATE OR REPLACE VIEW.

CREATE OR REPLACE VIEW data_lake.parcel_subdivision_v AS
WITH src AS (
  SELECT parcel_id, 'lee'::text AS county, dor_uc, jv, phy_zipcd, legal_description, phy_addr1,
         sale_prc1, sale_yr1, sale_mo1, qual_cd1, vi_cd1, sale_prc2, sale_yr2, sale_mo2, qual_cd2, vi_cd2,
         living_area_sqft, actual_year_built, effective_year_built, land_value, building_count,
         residential_unit_count, neighborhood_code, market_area, assessment_year
  FROM data_lake.lee_parcels
  UNION ALL
  SELECT parcel_id, 'collier'::text AS county, dor_uc, jv, phy_zipcd, legal_description, phy_addr1,
         sale_prc1, sale_yr1, sale_mo1, qual_cd1, vi_cd1, sale_prc2, sale_yr2, sale_mo2, qual_cd2, vi_cd2,
         living_area_sqft, actual_year_built, effective_year_built, land_value, building_count,
         residential_unit_count, neighborhood_code, market_area, assessment_year
  FROM data_lake.collier_parcels
)
SELECT parcel_id, county,
       CASE dor_uc WHEN '001' THEN 'single-family' WHEN '002' THEN 'mobile' WHEN '004' THEN 'condominium'
                   WHEN '005' THEN 'cooperative' WHEN '007' THEN 'misc-residential'
                   WHEN '008' THEN 'duplex-small-multifamily' END AS property_type,
       jv AS just_value,
       phy_zipcd AS zip,
       COALESCE(trim(regexp_replace(regexp_replace(regexp_replace(upper(legal_description),
         '\y(UNIT|PHASE|TRACT|BLOCK|BLK|REPLAT|AMENDED|ADDITION|ADD|SECTION|SEC)\y.*$',''),
         '[^A-Z0-9 ]',' ','g'), '\s+',' ','g')), '') AS subdivision_name,
       phy_addr1,
       sale_prc1 AS sale_price_1, sale_yr1 AS sale_year_1, sale_mo1 AS sale_month_1,
       qual_cd1 AS qual_cd_1, vi_cd1 AS vi_cd_1,
       sale_prc2 AS sale_price_2, sale_yr2 AS sale_year_2, sale_mo2 AS sale_month_2,
       qual_cd2 AS qual_cd_2, vi_cd2 AS vi_cd_2,
       living_area_sqft, actual_year_built, effective_year_built, land_value, building_count,
       residential_unit_count, neighborhood_code, market_area, assessment_year
FROM src
WHERE dor_uc IN ('001','002','004','005','007','008');

GRANT SELECT ON data_lake.parcel_subdivision_v TO service_role;
NOTIFY pgrst, 'reload schema';
