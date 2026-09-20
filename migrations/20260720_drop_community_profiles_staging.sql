-- One-off cleanup, 07/20/2026. The first (failed) community_profiles dlt load
-- created data_lake_staging.community_profiles with amenities_as_of/golf_as_of/
-- fees_as_of/home_count_as_of inferred as varchar (source data was an ISO
-- string at the time). dlt reuses an existing staging table rather than
-- recreating it, so every retry hit the same "date vs varchar" INSERT...SELECT
-- error even after the source data was fixed to real datetime.date objects.
-- Staging tables are disposable by definition (dlt recreates them from the
-- resource's current schema on the next load) — this does not touch
-- data_lake.community_profiles (the real table) or any other pipeline's
-- staging table.
-- CORRECTION 09/20/2026: "dlt recreates them on the next load" is only true when the
-- schema HASH changed (it had here: varchar -> date). With an unchanged hash already
-- stored in data_lake_staging._dlt_version, dlt skips DDL and then TRUNCATEs a table
-- that is not there — that was the fl_dbpr_applicants failure (08/05 + 09/05/2026,
-- docs/sql/20260920_dbpr_staging_repair.sql). Do not drop a staging table on this
-- reasoning without checking the stored hash first.
-- Run via: bun scripts/run-migration.ts migrations/20260720_drop_community_profiles_staging.sql

DROP TABLE IF EXISTS data_lake_staging.community_profiles;
