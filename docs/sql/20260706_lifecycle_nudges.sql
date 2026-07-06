-- docs/sql/20260706_lifecycle_nudges.sql
-- Lifecycle nudges (spec 2026-07-06-platform-arc-auto-advance-nudges-design.md).
-- Idempotent. Written by scripts/project-feed/lifecycle-nudges.mts (daily cron); read + dismissed
-- by the UI (ArcStrip). Nudge-only — never marks step state, never schedules, never sends.

ALTER TABLE public.email_sequences
  ADD COLUMN IF NOT EXISTS address_key text;

CREATE TABLE IF NOT EXISTS public.lifecycle_nudges (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  project_id    text NOT NULL,                       -- soft-link to public.projects.id (no FK)
  sequence_id   uuid NOT NULL,                        -- soft-link to public.email_sequences.id (no FK)
  step_key      text NOT NULL,
  event_kind    text NOT NULL,                        -- appeared | departed_holding | resolved_sold | time_elapsed
  from_state    text,
  to_state      text,
  at            date NOT NULL,
  price         integer,
  price_delta   integer,
  dedup_key     text NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  dismissed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS lifecycle_nudges_project_idx ON public.lifecycle_nudges (project_id);
CREATE INDEX IF NOT EXISTS lifecycle_nudges_sequence_idx ON public.lifecycle_nudges (sequence_id);

ALTER TABLE public.lifecycle_nudges ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY lifecycle_nudges_owner_all ON public.lifecycle_nudges
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

REVOKE ALL ON public.lifecycle_nudges FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lifecycle_nudges TO authenticated;
GRANT ALL ON public.lifecycle_nudges TO service_role;

NOTIFY pgrst, 'reload schema';
