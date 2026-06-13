-- 20260613_email_schedule_scope.sql — add geographic-scope + topic columns to
-- public.email_schedules so a scheduled digest can be narrowed to a ZIP/place/county
-- and/or a single topic, instead of only the global SWFL digest.
--
-- Additive + idempotent: three nullable columns via ADD COLUMN IF NOT EXISTS. Safe to
-- re-run. No data migration, no backfill — existing rows keep scope_kind/scope_value/topic
-- = NULL and continue to mean "global SWFL digest" (the documented DEFAULT below).
--
-- Run directly (creds in .dlt/secrets.toml) — do NOT hand to the operator (CLAUDE.md RULE 1).

-- SCOPE CONTRACT (parser <-> future buildContent consumer):
-- scope_kind in {NULL,'zip','place','county'} = geographic grain the user named.
-- scope_value = value AS THE USER SAID IT, normalized lowercase+trimmed ('cape coral','33904','lee').
--   For 'place', ZIP expansion is DEFERRED to build-time (a place may span many ZIPs; collapsing
--   to one ZIP here is a lossy, unrecoverable transform).
-- topic = free-text lowercase+trimmed ('flood','permits','prices'...). NO enum: the consumer
--   (buildContent) owns topic->brain-slug mapping; closing the enum forces an ALTER TABLE per new brain.
-- DEFAULT = scope_kind IS NULL AND topic IS NULL -> today global SWFL digest, unchanged. This NULL+NULL
--   state is the explicit documented default; there is deliberately NO 'general' magic value to mis-route.
-- Canonical form (lowercase+trimmed) IS the contract; the build-time ZIP expander must match it exactly.

ALTER TABLE public.email_schedules
  ADD COLUMN IF NOT EXISTS scope_kind  text,
  ADD COLUMN IF NOT EXISTS scope_value text,
  ADD COLUMN IF NOT EXISTS topic       text;

-- Re-emit the existing grants verbatim (idempotent insurance; dlt does NOT auto-grant
-- PostgREST roles, operator RUNBOOK decree — even though table-level grants cover future
-- columns in Postgres, we re-emit).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_schedules TO authenticated;
GRANT ALL ON public.email_schedules TO service_role;

NOTIFY pgrst, 'reload schema';
