-- assigned_at: text → timestamptz, so the freshness probe's MAX() returns a real
-- timestamp (_to_date in ingest/scripts/check_freshness.py rejects str — measured
-- 08/28/2026 while proving second-order finding 7's fix). The dlt column hint in
-- spatial_join.py now declares "timestamp" to match; this migration converts the
-- first run's text column in place. The dependent summary view must drop first
-- (Postgres blocks ALTER COLUMN TYPE under a dependent view) and is recreated
-- identically by 20260828_parcel_community_pd_summary_v.sql, which the runner
-- re-applies after this.
--
-- Idempotent: the ALTER is a no-op cast when the column is already timestamptz.

DROP VIEW IF EXISTS data_lake.parcel_community_pd_summary_v;

ALTER TABLE data_lake.parcel_community_pd
  ALTER COLUMN assigned_at TYPE timestamptz USING assigned_at::timestamptz;
