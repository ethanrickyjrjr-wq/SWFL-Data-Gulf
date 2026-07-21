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
-- Run via: bun scripts/run-migration.ts migrations/20260720_drop_community_profiles_staging.sql

DROP TABLE IF EXISTS data_lake_staging.community_profiles;
