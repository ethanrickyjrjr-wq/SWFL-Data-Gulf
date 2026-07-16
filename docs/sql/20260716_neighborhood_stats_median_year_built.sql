-- docs/sql/20260716_neighborhood_stats_median_year_built.sql
-- Piece (a) of check ingest_parcel_year_built_join: neighborhood-typical year built,
-- rolled up from data_lake.parcel_subdivision (FDOR ACT_YR_BLT — Lane 1, our own data;
-- zero scraping, zero SteadyAPI budget). Populated by
-- ingest/duckdb_pipelines/neighborhood_stats/pipeline.py on its next run (0 stays NULL:
-- unbuilt parcels are excluded from the median in agg.py via NULLIF).
-- Idempotent. Apply: bun scripts/run-migration.ts docs/sql/20260716_neighborhood_stats_median_year_built.sql

ALTER TABLE data_lake.neighborhood_stats
  ADD COLUMN IF NOT EXISTS median_year_built int;

GRANT SELECT ON data_lake.neighborhood_stats TO service_role;
NOTIFY pgrst, 'reload schema';
