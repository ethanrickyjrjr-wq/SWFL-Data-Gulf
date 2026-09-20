-- data_lake.bls_qcew: drop area_title / own_title / industry_title.
--
-- The BLS QCEW area-slice CSV (https://data.bls.gov/cew/data/api/{year}/{qtr}/area/{fips}.csv,
-- header re-read live 09/20/2026, 42 columns) carries CODES only. The resource declared the
-- three *_title columns anyway, so they sat at 0 non-null of 64 rows from 05/18/2026 on.
-- Nothing reads them (refinery/sources/bls-qcew-source.mts stopped selecting them in the same
-- commit as this file - that commit must be on main BEFORE this runs).
--
-- WHY the _dlt_version / _dlt_pipeline_state deletes: dlt 1.29 builds its merge INSERT from
-- every column in its STORED schema (dlt/destinations/sql_jobs.py gen_merge_sql), and it
-- restores that schema from _dlt_version on a fresh runner. A bare DROP COLUMN leaves the
-- stored schema naming columns the table no longer has, and the next quarterly run dies with
-- `column "area_title" does not exist`. Reproduced 09/20/2026 on duckdb: drop-only FAILS,
-- drop + stored-schema reset loads clean and dlt re-derives the schema from the resource.
-- The pipeline holds no incremental cursor, so its state row carries nothing to lose.
--
-- Idempotent. Refuses to run if any of the three columns holds a single non-null value.
-- Run: bun scripts/run-migration.ts migrations/20260920_bls_qcew_drop_phantom_title_columns.sql

DO $$
DECLARE
  c text;
  n bigint;
BEGIN
  FOREACH c IN ARRAY ARRAY['area_title', 'own_title', 'industry_title'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'data_lake' AND table_name = 'bls_qcew' AND column_name = c) THEN
      EXECUTE format('SELECT count(%I) FROM data_lake.bls_qcew', c) INTO n;
      IF n > 0 THEN
        RAISE EXCEPTION 'data_lake.bls_qcew.% holds % non-null value(s) - not a phantom column, refusing to drop', c, n;
      END IF;
    END IF;
  END LOOP;

  ALTER TABLE data_lake.bls_qcew
    DROP COLUMN IF EXISTS area_title,
    DROP COLUMN IF EXISTS own_title,
    DROP COLUMN IF EXISTS industry_title;

  IF to_regclass('data_lake_staging.bls_qcew') IS NOT NULL THEN
    ALTER TABLE data_lake_staging.bls_qcew
      DROP COLUMN IF EXISTS area_title,
      DROP COLUMN IF EXISTS own_title,
      DROP COLUMN IF EXISTS industry_title;
  END IF;

  DELETE FROM data_lake._dlt_version WHERE schema_name = 'bls_qcew';
  IF to_regclass('data_lake_staging._dlt_version') IS NOT NULL THEN
    DELETE FROM data_lake_staging._dlt_version WHERE schema_name = 'bls_qcew';
  END IF;
  DELETE FROM data_lake._dlt_pipeline_state WHERE pipeline_name = 'bls_qcew';
END $$;

NOTIFY pgrst, 'reload schema';
