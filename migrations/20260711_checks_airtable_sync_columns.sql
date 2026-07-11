-- migrations/20260711_checks_airtable_sync_columns.sql
-- Tracking columns for the read-only Airtable mirror of the checks ledger.
-- Spec: docs/superpowers/specs/2026-07-11-checks-airtable-mirror-design.md
-- Check: checks_airtable_mirror_live_verify
--
-- airtable_record_id lets the sync delete a closed check without a lookup
-- call (Airtable's delete endpoint takes its own record id, not our
-- check_key). airtable_synced_at lets the sync find "dirty" open rows
-- (never synced, or touched since last sync) without resyncing every open
-- row on every run.
--
-- Idempotent; run via:
--   bun scripts/run-migration.ts migrations/20260711_checks_airtable_sync_columns.sql

alter table public.checks
  add column if not exists airtable_record_id text,
  add column if not exists airtable_synced_at timestamptz;
