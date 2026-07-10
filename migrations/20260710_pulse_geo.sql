-- Phase C (zip-page spec 2026-07-09): pulse rows gain location provenance.
-- zip_code is location-derived ONLY (G1): written by ingest/lib/geo_ladder.py
-- from a resolved lat/lon via Census ZCTA polygons; NULL = native grain
-- (city for city_pulse, corridor for city_pulse_corridors).
ALTER TABLE data_lake.city_pulse
  ADD COLUMN IF NOT EXISTS location_anchor TEXT,
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS zip_code TEXT,
  ADD COLUMN IF NOT EXISTS geo_grain TEXT;
ALTER TABLE data_lake.city_pulse_corridors
  ADD COLUMN IF NOT EXISTS location_anchor TEXT,
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS zip_code TEXT,
  ADD COLUMN IF NOT EXISTS geo_grain TEXT;
DO $$ BEGIN
  ALTER TABLE data_lake.city_pulse
    ADD CONSTRAINT city_pulse_geo_grain_chk
    CHECK (geo_grain IS NULL OR geo_grain IN ('point','neighborhood','city','county'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE data_lake.city_pulse_corridors
    ADD CONSTRAINT city_pulse_corridors_geo_grain_chk
    CHECK (geo_grain IS NULL OR geo_grain IN ('point','neighborhood','city','county'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Nominatim usage policy REQUIRES caching results; this is the permanent cache.
-- One row per (normalized anchor, unit context). provider='miss' rows are
-- negative-cache entries, re-tried by the ladder after 30 days.
CREATE TABLE IF NOT EXISTS data_lake.geo_anchor_cache (
  anchor_norm  TEXT NOT NULL,
  city         TEXT NOT NULL,
  lat          DOUBLE PRECISION,
  lon          DOUBLE PRECISION,
  zip_code     TEXT,
  geo_grain    TEXT,
  provider     TEXT NOT NULL,  -- 'census' | 'nominatim' | 'miss'
  resolved_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (anchor_norm, city)
);
GRANT SELECT ON data_lake.city_pulse, data_lake.city_pulse_corridors,
  data_lake.geo_anchor_cache TO service_role;
NOTIFY pgrst, 'reload schema';
