-- 20260709_email_events_blast_scope.sql — scope email_events to per-tenant blast sends.
--
-- email_events today only carries rid (the platform's own cold-outreach prospecting funnel —
-- campaign_id is a free-text slug, no user_id anywhere in that chain). There is no column that
-- lets a logged-in tenant's own blast sends (app/api/deliverables/[id]/blast/route.ts, tagged via
-- blastTags() as did/tpl/campaign) be scoped to that tenant. This adds the columns the webhook's
-- new `did` branch needs, plus the read policy the deliverability-status route needs (RLS is
-- already enabled on this table but currently has ZERO policies — verified live 2026-07-09 via
-- Bun.SQL introspection — so it's deny-all for every non-service-role client today, and there is
-- no GRANT for `authenticated` either, only service_role).
--
-- Idempotent: safe to re-run.

ALTER TABLE public.email_events
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS did text;

CREATE INDEX IF NOT EXISTS email_events_user_created_idx
  ON public.email_events (user_id, created_at DESC);

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY email_events_owner_select ON public.email_events
    FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

REVOKE ALL ON public.email_events FROM anon;
GRANT  SELECT ON public.email_events TO authenticated;
GRANT  ALL ON public.email_events TO service_role;
