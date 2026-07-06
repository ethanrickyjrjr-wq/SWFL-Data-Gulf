-- Lifecycle sequences (spec 2026-07-05-lifecycle-sequences-design.md).
-- Idempotent. The cron worker NEVER reads these tables — UI + milestone API only.

CREATE TABLE IF NOT EXISTS public.email_sequence_setups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  name        text NOT NULL,
  is_default  boolean NOT NULL DEFAULT false,
  steps       jsonb NOT NULL DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- At most ONE default setup per user (it auto-applies to new listing projects).
CREATE UNIQUE INDEX IF NOT EXISTS email_sequence_setups_one_default
  ON public.email_sequence_setups (user_id) WHERE is_default;

CREATE TABLE IF NOT EXISTS public.email_sequences (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  project_id  text NOT NULL,                       -- soft-link to public.projects.id (no FK)
  setup_name  text,                                -- provenance label only, never a FK
  status      text NOT NULL DEFAULT 'armed',       -- armed | completed | stopped
  audience_slug text,
  send_hour_et  smallint,
  steps       jsonb NOT NULL DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- One live arc per listing project.
CREATE UNIQUE INDEX IF NOT EXISTS email_sequences_one_armed
  ON public.email_sequences (project_id) WHERE status = 'armed';

ALTER TABLE public.email_sequence_setups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sequences       ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY email_sequence_setups_owner_all ON public.email_sequence_setups
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY email_sequences_owner_all ON public.email_sequences
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

REVOKE ALL ON public.email_sequence_setups FROM anon;
REVOKE ALL ON public.email_sequences       FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_sequence_setups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_sequences       TO authenticated;
GRANT ALL ON public.email_sequence_setups TO service_role;
GRANT ALL ON public.email_sequences       TO service_role;

NOTIFY pgrst, 'reload schema';
