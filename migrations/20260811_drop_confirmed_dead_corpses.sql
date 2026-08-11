-- Drop confirmed-dead objects found in the 08/11/2026 graphify deep-dive audit, cross-checked
-- against the 07/18/2026 P7-corpse-deletelist.md audit (both independently confirm zero live
-- readers). RESTRICT (default, no CASCADE) on every DROP — a surprise dependent fails loud
-- instead of cascading silently.

-- Analyst-convenience views, self-documented "not the path the brain reads," zero dependents
-- confirmed live 2026-07-18 via pg_depend and re-confirmed by code grep 2026-08-11.
DROP VIEW IF EXISTS data_lake.fema_nfip_claims_swfl;
DROP VIEW IF EXISTS data_lake.fdot_aadt_swfl_yearly;
DROP VIEW IF EXISTS data_lake.usgs_caloosahatchee_stage_latest;

-- Dead duplicate: active_listings_residential fed nothing live. The live path is
-- listing_lifecycle -> data_lake.listing_state -> listing_active_stats (read by
-- active-listings-swfl.mts). Proof: active-listings-residential-source.mts:27 reads
-- VIEW="listing_active_stats", never this table; lib/email/sole-spine.test.ts:8 names it
-- DEAD_VIEW; lib/landing/load-home-map-data.ts:13 calls the scraper table ABANDONED.
-- View dropped before table (view depends on table).
DROP VIEW IF EXISTS data_lake.active_listings_residential_zip_stats;
DROP TABLE IF EXISTS data_lake.active_listings_residential;

NOTIFY pgrst, 'reload schema';
