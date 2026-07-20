-- =====================================================================
-- data_lake.lee_deed_official_records
-- Lee County Clerk of Courts LandMarkWeb official-records feed (DEED docs).
-- Apply: bun scripts/run-migration.ts migrations/20260720_lee_deed_official_records.sql
-- (psql is not installed on this box; run-migration.ts reads .dlt/secrets.toml.)
--
-- Idempotent. Column types match the dlt resource's inferred/hinted output
-- (ingest/pipelines/lee_deed_official_records/resources.py):
--   record_date -> DATE, consideration_usd -> NUMERIC (dlt decimal),
--   grantors/grantees -> JSONB (dlt "json" data_type, single column, no child table).
-- Only the primary key is NOT NULL — dlt's merge staging can carry NULLs in any
-- other column, so no NOT NULL / CHECK on non-PK columns (they would trip the merge).
-- dlt adds its own _dlt_load_id / _dlt_id bookkeeping columns on first load (ALTER).
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS data_lake;

CREATE TABLE IF NOT EXISTS data_lake.lee_deed_official_records (
  -- Stable numeric doc id (README row-position 25) — the merge/dedup key. Chosen
  -- over clerk_file_number because it is stable across years (README).
  internal_doc_id      TEXT PRIMARY KEY,

  status               TEXT,          -- 'V' = verified/active observed
  consideration_raw    TEXT,          -- e.g. '$304,900.00'; many rows '$10.00' (nominal transfer)
  consideration_usd    NUMERIC,       -- parsed from consideration_raw
  grantors             JSONB,         -- list; SOURCE truncates past ~3 parties with a literal '...'
  grantees             JSONB,         -- same truncation behavior — marker preserved, NOT completeness
  record_date          DATE,          -- content date (the real freshness column on graduation)
  doc_type             TEXT,          -- 'DEED' in the current pull
  book_type            TEXT,
  book                 TEXT,
  page                 TEXT,
  clerk_file_number    TEXT,          -- public instrument id, e.g. '2026000187515'
  legal_full           TEXT,          -- plat description + Parcel STRAP
  lot                  TEXT,
  block                TEXT,
  unit                 TEXT,
  subdivision          TEXT,
  phase                TEXT,
  section              TEXT,
  township             TEXT,
  "range"              TEXT,          -- reserved word — quoted
  parcel_strap         TEXT,          -- derived from legal_full — join key into data_lake.lee_parcels

  -- Operation Dumbo Drop provenance (seam 4): every row carries its manual-drop
  -- source so a brain can caveat it, never blend it blind with an auto-feed.
  source_tag           TEXT,          -- 'lee_clerk_landmarkweb_manual'
  source_url           TEXT,          -- live search surface / citation homepage
  record_source_file   TEXT,          -- which raw/<YYYY-MM-DD>.json this row came from
  _ingested_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Velocity queries (count where record_date >= ...) + the lee_parcels join key.
CREATE INDEX IF NOT EXISTS idx_lee_deed_record_date
  ON data_lake.lee_deed_official_records (record_date);
CREATE INDEX IF NOT EXISTS idx_lee_deed_parcel_strap
  ON data_lake.lee_deed_official_records (parcel_strap);

-- Expose to the API role + refresh PostgREST's schema cache (ingest/CLAUDE.md).
GRANT SELECT ON ALL TABLES IN SCHEMA data_lake TO service_role;
NOTIFY pgrst, 'reload schema';
