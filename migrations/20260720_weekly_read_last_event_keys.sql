-- migrations/20260720_weekly_read_last_event_keys.sql
-- Per-subscriber "what the last email showed" — eventKey() strings (gate.ts) of
-- every market event included in the subscriber's most recent send. The next
-- alert/weekly EXCLUDES these, so an email that would only repeat the previous
-- one is skipped instead (07/19: baseline + next-day alert were ~99% identical —
-- the baseline shows all current area events, alerts bypass cadence, and
-- lifecycle bursts re-fire from the same weekly counts).
-- REPLACED on every confirmed live send (never appended); DRY runs never write.
-- Idempotent; run via `bun scripts/run-migration.ts migrations/20260720_weekly_read_last_event_keys.sql`.

alter table public.weekly_read_subscribers
  add column if not exists last_event_keys jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
