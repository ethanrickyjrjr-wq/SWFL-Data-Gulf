-- migrations/20260716_switch_pass.sql
-- Switch Pass (60-day Starter override on verified competitor migration) +
-- per-user daily build counter (quiet anti-abuse + future AI-allowance dial).
-- Spec: docs/superpowers/specs/2026-07-16-competitor-switch-onboarding-design.md
-- Idempotent. Safe to re-run.
BEGIN;

CREATE TABLE IF NOT EXISTS public.switch_passes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  tier          text NOT NULL DEFAULT 'starter',
  -- The two proof lanes. A plain CSV upload can NOT create a pass (spec §2).
  source_lane   text NOT NULL CHECK (source_lane IN ('oauth_extraction', 'forwarded_email')),
  platform      text NOT NULL,             -- 'mailchimp' | 'followupboss' | detected platform slug
  contacts_imported integer NOT NULL,
  proof         jsonb NOT NULL DEFAULT '{}'::jsonb,  -- message id / connector metadata
  starts_at     timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One ACTIVE pass per user, ever (the offer is once).
CREATE UNIQUE INDEX IF NOT EXISTS switch_passes_one_per_user
  ON public.switch_passes (user_id);

ALTER TABLE public.switch_passes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS switch_passes_owner_read ON public.switch_passes;
CREATE POLICY switch_passes_owner_read ON public.switch_passes
  FOR SELECT USING (auth.uid() = user_id);
-- Writes go through service role only (activation is server-side proof, never client).
GRANT SELECT ON public.switch_passes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.switch_passes TO service_role;

CREATE TABLE IF NOT EXISTS public.build_usage (
  user_id     uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  day         date NOT NULL,
  build_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
ALTER TABLE public.build_usage ENABLE ROW LEVEL SECURITY;
-- No client policies: metering is service-role-only, invisible to users.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.build_usage TO service_role;

CREATE OR REPLACE FUNCTION public.increment_build_count(p_user_id uuid, p_day date, p_n integer)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO public.build_usage (user_id, day, build_count)
  VALUES (p_user_id, p_day, p_n)
  ON CONFLICT (user_id, day) DO UPDATE SET build_count = public.build_usage.build_count + p_n;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
