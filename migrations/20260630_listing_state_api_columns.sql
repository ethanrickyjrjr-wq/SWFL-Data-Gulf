-- migrations/20260630_listing_state_api_columns.sql
-- Additive API-feed columns on the existing lifecycle state machine (data_lake.listing_state).
-- Capture wide, slice late: each API-only field is a COLUMN, never a separate pipeline/lane.
-- These ride alongside the existing wide columns the Source-B scrape filled; the API feed
-- (RentCast spine + SteadyAPI photos) lands them under a neutral source_name='api_feed'.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS); safe to re-run. psql is NOT installed on this box, so
-- apply via Bun.SQL: `bun scripts/run-migration.ts migrations/20260630_listing_state_api_columns.sql`.

ALTER TABLE data_lake.listing_state ADD COLUMN IF NOT EXISTS photo_url    text;   -- SteadyAPI rdcpix CDN listing photo
ALTER TABLE data_lake.listing_state ADD COLUMN IF NOT EXISTS lat          double precision;
ALTER TABLE data_lake.listing_state ADD COLUMN IF NOT EXISTS lon          double precision;
ALTER TABLE data_lake.listing_state ADD COLUMN IF NOT EXISTS county_fips  text;   -- "12071" Lee / "12021" Collier
ALTER TABLE data_lake.listing_state ADD COLUMN IF NOT EXISTS mls_number   text;   -- RentCast mlsNumber (null on non-MLS, e.g. new construction)
ALTER TABLE data_lake.listing_state ADD COLUMN IF NOT EXISTS mls_name     text;   -- RentCast mlsName / SteadyAPI source_type
ALTER TABLE data_lake.listing_state ADD COLUMN IF NOT EXISTS listing_type text;   -- RentCast listingType: Standard | New Construction | Foreclosure | Short Sale

GRANT SELECT, INSERT, UPDATE, DELETE ON data_lake.listing_state TO service_role;
NOTIFY pgrst, 'reload schema';
