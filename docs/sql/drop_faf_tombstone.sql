-- FAF5 tables migrated to Cold Lane (lake-tier1 S3 Parquet).
-- Run in Supabase SQL editor after faf5_to_parquet.py upload completes.
DROP TABLE IF EXISTS data_lake.faf_flows CASCADE;
DROP TABLE IF EXISTS data_lake.faf_zone_lookup CASCADE;
DROP TABLE IF EXISTS data_lake.faf_sctg_lookup CASCADE;

-- REMOVED 2026-06-13: the `DELETE FROM data_lake._tier1_inventory WHERE table_name IS NULL`
-- that used to live here was a live footgun. Its rationale ("dlt cannot add a NOT NULL
-- constraint while null-table_name rows exist") is obsolete and contradicted by current
-- code: upsert_inventory_row (ingest/lib/tier1_inventory.py) is DESIGNED to leave
-- table_name NULL on every Tier-1 pointer row, so the DELETE would truncate the entire
-- live Tier-1 inventory, not stray legacy rows. Never run a global table_name-IS-NULL
-- delete on _tier1_inventory. (faf5 retire plan, ADDED-B.)
