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

-- 08/30/2026 (found by the first GHA run of lee-planned-developments-quarterly, run 33286533675):
-- dlt's MERGE loads through data_lake_staging.parcel_community_pd, which was created on the
-- first run while the column was still text, and dlt never retypes an existing staging
-- column. The merge then fails with "column assigned_at is of type timestamp with time zone
-- but expression is of type character varying" and NO rows move. Retype the staging twin too.
-- Guarded: the staging table may not exist yet on a fresh destination.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'data_lake_staging' AND table_name = 'parcel_community_pd'
      AND column_name = 'assigned_at' AND data_type <> 'timestamp with time zone'
  ) THEN
    ALTER TABLE data_lake_staging.parcel_community_pd
      ALTER COLUMN assigned_at TYPE timestamptz USING assigned_at::timestamptz;
  END IF;
END $$;
