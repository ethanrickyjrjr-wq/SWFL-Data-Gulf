-- Migration: add asking_rent_full_service to data_lake.marketbeat_swfl
-- Required before loading C&W Medical Office MarketBeat rows: that report's own
-- footnote reads "*Rental rates reflect full service asking" -- a gross rate, not
-- triple-net. Writing it into asking_rent_nnn / asking_rent_mf / asking_rent_os
-- (all NNN industrial subtypes per the 20260609 migration) would mislabel the
-- source figure. New column keeps the rate basis honest.
--
-- Run via: bun scripts/run-migration.ts docs/sql/20260715_marketbeat_swfl_full_service_rent.sql

ALTER TABLE data_lake.marketbeat_swfl
  ADD COLUMN IF NOT EXISTS asking_rent_full_service NUMERIC;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'data_lake'
  AND table_name   = 'marketbeat_swfl'
  AND column_name  = 'asking_rent_full_service';
