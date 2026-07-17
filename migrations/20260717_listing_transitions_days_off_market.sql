-- migrations/20260717_listing_transitions_days_off_market.sql
-- Phase-2 (back-on-market read): stamp a relist event with its TRUE off-market duration.
--
-- A `holding → active` transition is a relist. Its `days_in_prev_state` is frozen at 0 (the diff
-- never re-upserts a still-absent holding, so days_in_state never ages), so the raw relist count is
-- contaminated by same-week scan flicker. This column carries `at − holding-entry last_seen` (days),
-- computed in transitions.diff_states, so Phase 3 can surface only relists after a real departure
-- (>= 7 days) and never a scan-gap flicker. NULL for every non-relist transition (and for relists
-- detected before this shipped — forward-only, no backfill: last_seen is overwritten on reappearance).
--
-- Additive + idempotent. Apply via: bun scripts/run-migration.ts migrations/20260717_listing_transitions_days_off_market.sql
ALTER TABLE data_lake.listing_transitions ADD COLUMN IF NOT EXISTS days_off_market integer;

GRANT SELECT, INSERT, UPDATE, DELETE ON data_lake.listing_transitions TO service_role;
NOTIFY pgrst, 'reload schema';
