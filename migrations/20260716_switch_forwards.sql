-- migrations/20260716_switch_forwards.sql
-- Switch forward-lane stash: campaign-forward raw material for Tasks 11-12
-- (Brandfetch brand-kit extraction off sender_domain, "wow" campaign rebuild
-- off html). Sibling to migrations/20260716_switch_pass.sql (Task 1) --
-- that file is ALREADY APPLIED LIVE, so this table ships as its own
-- migration rather than an edit to an applied file (Task 10 deviation,
-- operator-decided).
-- Spec: docs/superpowers/specs/2026-07-16-competitor-switch-onboarding-design.md
-- Plan: docs/superpowers/plans/2026-07-16-competitor-switch-onboarding-p1.md (Task 10)
-- Idempotent. Safe to re-run.
BEGIN;

CREATE TABLE IF NOT EXISTS public.switch_forwards (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  message_id    text NOT NULL,
  platform      text,             -- detected platform slug, or NULL when unknown
  sender_domain text,
  html          text,             -- the forwarded campaign HTML, for Task 12's rebuild
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS switch_forwards_user_id ON public.switch_forwards (user_id);

-- Service-role-only stash: this is internal pipeline material for Tasks
-- 11-12 (brand extraction, campaign rebuild), never read or written by a
-- client directly. RLS enabled with NO policies -- authenticated/anon get
-- nothing; only the service-role key (which bypasses RLS) can touch it.
ALTER TABLE public.switch_forwards ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.switch_forwards TO service_role;

COMMENT ON TABLE public.switch_forwards IS
  'Stash of forwarded competitor-campaign emails (Task 10 webhook branch) awaiting Task 11 (Brandfetch brand-kit off sender_domain) and Task 12 (wow rebuild off html). Service-role-only.';

NOTIFY pgrst, 'reload schema';
COMMIT;
