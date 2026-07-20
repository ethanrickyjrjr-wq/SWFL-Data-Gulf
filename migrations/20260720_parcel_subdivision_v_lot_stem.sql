-- parcel_subdivision_v — add the GUARDED lot-strip to the legal-description stem.
-- Fixes check `neighborhood_stats_per_lot_subdivision_fragments`: the stem removed
-- UNIT/PHASE/TRACT/BLOCK/… but NOT `LOT`, so the lot number rode along in the name and every
-- lot became its own one-home "community" ("MAGNOLIA AT VERANDAH LOT 88", "LOT 76", "LOT 101").
--
-- Supersedes the subdivision_name expression in 20260719_parcel_subdivision_v.sql. Every other
-- column, the homes-only dor_uc filter, and the COALESCE-to-'' unknown-name convention are
-- BYTE-IDENTICAL to that file — this migration changes exactly one expression.
--
-- THE GUARD IS THE POINT — '^(.+?)\s*\yLOT\y.*$' -> '\1', NOT a naive '\yLOT\y.*$' -> ''.
-- The `(.+?)` REQUIRES real content before LOT, so a name that STARTS with the lot number is
-- left untouched instead of being erased. Measured on the live two-county source 07/20/2026:
--   * naive strip-to-end would have destroyed 56 names, incl. "LOT 8 SOUTHWIND EST",
--     "LOT 30 SPYGLASS ISLAND", "LOT 88 IMPERIAL GATES UNRC" — real communities whose name
--     sits AFTER the lot number. Those 56 are STILL fragments; tracked separately, not erased.
--   * with the guard: 0 names destroyed (`old_stem <> '' AND new_stem = ''` returns zero rows).
-- Verified deltas on data_lake.lee_parcels + collier_parcels (homes-only), 07/20/2026:
--   groups 31,062 -> 20,370 (-10,692 fake communities) · 12,127 parcels re-stemmed ·
--   11,198 fragment names folded into 646 real communities.
--
-- Runs BEFORE punctuation removal, so "VERANDAH, LOT 88" folds too (the ',' is consumed by
-- the `(.+?)` capture and cleaned by the existing punctuation pass).
--
-- LOCKSTEP: refinery/lib/subdivision-aliases.mts `normalizeSubdivisionName` carries the
-- identical rule in JS (`\b` for `\y`). The two MUST move together — the alias fold matches on
-- the stemmed name, so a stem that differs between the SQL and TS sides silently misses rows.
--
-- Idempotent: CREATE OR REPLACE VIEW. Reversible by re-running 20260719_parcel_subdivision_v.sql.

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
       COALESCE(trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(upper(legal_description),
         '\y(UNIT|PHASE|TRACT|BLOCK|BLK|REPLAT|AMENDED|ADDITION|ADD|SECTION|SEC)\y.*$',''),
         '^(.+?)\s*\yLOT\y.*$','\1'),
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
