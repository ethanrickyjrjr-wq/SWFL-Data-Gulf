-- Migration: add ytd_absorption_sqft, asking_rent_mf, asking_rent_os to data_lake.marketbeat_swfl
-- Required before first load from ingest/pipelines/marketbeat_pdf/pipeline.py
-- Run via: python -c "import psycopg; ..."  using creds from .dlt/secrets.toml
--
-- C&W MarketBeat reports MF (Manufacturing), OS (Office/Showroom), W/D (Warehouse/Distribution)
-- rent separately. asking_rent_nnn maps to W/D (the dominant industrial subtype).
-- Colliers reports a single asking_rent_nnn value per sector.

ALTER TABLE data_lake.marketbeat_swfl
  ADD COLUMN IF NOT EXISTS ytd_absorption_sqft INTEGER,
  ADD COLUMN IF NOT EXISTS asking_rent_mf       NUMERIC,
  ADD COLUMN IF NOT EXISTS asking_rent_os       NUMERIC;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'data_lake'
  AND table_name   = 'marketbeat_swfl'
  AND column_name IN ('ytd_absorption_sqft', 'asking_rent_mf', 'asking_rent_os')
ORDER BY column_name;
