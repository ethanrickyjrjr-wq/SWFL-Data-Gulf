-- Collier County building permits — Tier 2 working cache.
-- Brain-first gate: permits-swfl brain will UNION this with lee_building_permits (follow-up PR).
-- Issued-only series. Applied series would require (permit_number, series) composite PK.
--
-- Paste into Supabase SQL editor after approval. Then verify:
--   SELECT count(*) FROM data_lake.collier_building_permits;
--   SELECT DISTINCT schema_name FROM data_lake._dlt_loads WHERE schema_name = 'collier_permits';

CREATE TABLE IF NOT EXISTS data_lake.collier_building_permits (
  permit_number         text PRIMARY KEY,
  declared_value        numeric,
  building_type         text,
  permit_class          text,
  permit_type_desc      text,
  permit_status         text,
  site_address          text,
  property_id           text,
  date_issued           date,
  date_applied          date,
  total_sf              integer,
  total_units           integer,
  const_type            text,
  owner_name            text,
  owner_city            text,
  owner_state           text,
  owner_zip             text,
  contractor_type       text,
  license_number        text,
  contractor_name       text,
  contractor_city       text,
  contractor_state      text,
  contractor_zip        text,
  -- geocoded + corridor columns
  lat                   double precision,
  lon                   double precision,
  corridor              text,
  -- classification + provenance
  bucket                text CHECK (bucket IN (
                          'commercial_new', 'commercial_alteration',
                          'residential', 'demolition', 'other'
                        )),
  source_file           text NOT NULL,
  _ingest_metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  _loaded_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collier_permits_date_issued
  ON data_lake.collier_building_permits (date_issued);
CREATE INDEX IF NOT EXISTS idx_collier_permits_corridor
  ON data_lake.collier_building_permits (corridor);
CREATE INDEX IF NOT EXISTS idx_collier_permits_bucket
  ON data_lake.collier_building_permits (bucket);
CREATE INDEX IF NOT EXISTS idx_collier_permits_const_type
  ON data_lake.collier_building_permits (const_type);

GRANT SELECT ON data_lake.collier_building_permits TO service_role;
