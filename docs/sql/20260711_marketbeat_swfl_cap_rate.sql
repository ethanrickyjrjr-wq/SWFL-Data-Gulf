-- Migration: add cap_rate to data_lake.marketbeat_swfl
-- Fixes check lee_associates_cap_rate_discarded: extract.py already parses "Cap Rate"
-- from the Lee & Associates Fort Myers PDFs (_INDICATOR_NAMES maps it to records[idx]['cap_rate'],
-- percent-token parsed same as vacancy_rate), but the column didn't exist and the INSERT never
-- referenced it -- silently discarded, zero extra parse cost to keep.
--
-- Run via: node -e Bun.SQL migration (psql is NOT installed) -- see ingest/CLAUDE.md.

ALTER TABLE data_lake.marketbeat_swfl
  ADD COLUMN IF NOT EXISTS cap_rate DOUBLE PRECISION;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'data_lake'
  AND table_name   = 'marketbeat_swfl'
  AND column_name  = 'cap_rate';
