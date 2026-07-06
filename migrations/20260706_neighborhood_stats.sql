-- data_lake.neighborhood_stats — one row per (county, subdivision_name), the
-- Tier-1 universal aggregate (communities-swfl Phase 1 T4). Written by
-- ingest/duckdb_pipelines/neighborhood_stats/agg.py's aggregate_stats(con);
-- column set matches that function's output dict verbatim. No dlt resource
-- writes this table (a plain Postgres upsert does, per the "skip the DuckDB
-- round-trip" note in SESSION_LOG 2026-07-06) — this migration is authoritative
-- for the table's shape, not schema-inferred later.
--
-- Idempotent; run via:  bun scripts/run-migration.ts migrations/20260706_neighborhood_stats.sql

CREATE TABLE IF NOT EXISTS data_lake.neighborhood_stats (
  county             text NOT NULL,
  subdivision_name   text NOT NULL,
  home_count         integer NOT NULL,
  count_by_type      jsonb NOT NULL DEFAULT '{}'::jsonb,
  median_just_value  double precision,
  source_url         text NOT NULL,
  as_of              date NOT NULL,
  inserted_at        timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (county, subdivision_name)
);

GRANT SELECT ON data_lake.neighborhood_stats TO service_role;

NOTIFY pgrst, 'reload schema';
