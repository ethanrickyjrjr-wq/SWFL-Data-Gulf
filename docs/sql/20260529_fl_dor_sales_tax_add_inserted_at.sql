-- Add inserted_at to fl_dor_sales_tax for ops freshness monitoring.
-- Non-dlt pipelines need their own timestamp so the ops ledger can check
-- MAX(inserted_at) instead of _dlt_loads (which only dlt pipelines write to).
--
-- Run once in Supabase before the next pipeline execution.

ALTER TABLE fl_dor_sales_tax
  ADD COLUMN IF NOT EXISTS inserted_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill: stamp all existing rows with the backfill date (2026-05-29).
UPDATE fl_dor_sales_tax
SET inserted_at = '2026-05-29T00:00:00Z'
WHERE inserted_at IS NULL;

ALTER TABLE fl_dor_sales_tax
  ALTER COLUMN inserted_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS fl_dor_sales_tax_inserted_at_idx
  ON fl_dor_sales_tax (inserted_at DESC);
