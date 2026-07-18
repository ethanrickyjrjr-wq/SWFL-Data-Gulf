-- 20260718_drop_dead_usgs_staging.sql
-- Reclaim ~1.55 GB of dead disk from the abandoned USGS Postgres→Parquet
-- migration (2026-05-19). These data_lake_staging tables are orphaned dlt
-- staging corpses: last written 2026-05-19, read by nothing. The live USGS
-- pipeline (usgs-monthly.yml) writes Parquet to Tier-1 storage
-- (usgs_water_swfl.parquet, vintage 2000-2026) — that is the canonical copy.
-- Idempotent. Authorized by operator 2026-07-18 ("get rid of the dead data").
DROP TABLE IF EXISTS data_lake_staging.usgs_daily;
DROP TABLE IF EXISTS data_lake_staging.usgs_sites;
