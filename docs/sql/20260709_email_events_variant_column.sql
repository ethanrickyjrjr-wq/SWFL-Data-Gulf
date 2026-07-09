-- 20260709_email_events_variant_column.sql — did-tag scope + split-test cohort
-- tag for email_events.
--
-- Idempotent: safe to re-run. Additive only.
--
-- `did` was expected to already exist courtesy of a separate, concurrent
-- deliverability-diagnostics-panel build (see plan doc's "Prerequisite"
-- section) — it was absent from this worktree, so this migration adds it
-- here too (ADD COLUMN IF NOT EXISTS — a no-op if that other session's own
-- migration lands first or later). Deliberately does NOT add `user_id`:
-- that column is only needed by that other, unrelated feature and nothing
-- in this plan reads it.
--
-- REQUIRED BEFORE MERGE / BUILD: app/api/webhooks/resend/route.ts already
-- writes did/variant into a TYPED .upsert("email_events", ...) call, but
-- database-generated.types.ts (checked at authoring time) only declares
-- id/resend_email_id/rid/event/created_at on that table's Insert type -- NOT
-- did or variant. Until an operator (a) runs this migration against the live
-- DB and (b) runs `bun run gen:types` to regenerate database-generated.types.ts,
-- the webhook route will fail to typecheck/build ("property does not exist
-- on type") even though `bun test` (no typecheck) passes clean today. Do NOT
-- hand-edit the generated types file -- regenerate it.
ALTER TABLE public.email_events
  ADD COLUMN IF NOT EXISTS did text;

ALTER TABLE public.email_events
  ADD COLUMN IF NOT EXISTS variant text;

CREATE INDEX IF NOT EXISTS email_events_did_variant_idx
  ON public.email_events (did, variant);

NOTIFY pgrst, 'reload schema';
