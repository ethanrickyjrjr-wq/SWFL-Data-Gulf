-- migrations/20260717_switch_forward_confirm.sql
-- SECURITY FIX (post-launch review, 07/17/2026): the forward lane's `From`
-- address is attacker-claimable -- matching it to an account and WRITING
-- (contacts / agent_profile_facts / switch_passes) directly from the webhook
-- enabled forged-From injection onto a real account, plus backscatter risk.
-- STASH-THEN-CONFIRM: the webhook now only stashes what it parsed into this
-- table (status 'pending'); nothing is written to contacts/facts/passes
-- until an AUTHENTICATED session applies it via POST /api/switch/apply-forward.
-- Sibling to migrations/20260716_switch_forwards.sql (Task 10, already live).
-- Spec: docs/superpowers/specs/2026-07-16-competitor-switch-onboarding-design.md
-- Idempotent. Safe to re-run.
BEGIN;

ALTER TABLE public.switch_forwards
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'campaign'
    CHECK (kind IN ('contact_export', 'campaign')),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'applied', 'dismissed')),
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Redelivery dedup -- Resend's webhook signer (Svix) is at-least-once, so the
-- same email.received event can arrive more than once. A second stash for
-- the same message_id hits this constraint (23505 in the app) and is
-- skipped, not retried as a fresh row.
CREATE UNIQUE INDEX IF NOT EXISTS switch_forwards_message_id_key
  ON public.switch_forwards (message_id);

-- Owner-read: the UI (Task 12, /contacts/upload) lists an agent's own
-- pending rows so they can review + Apply. Writes stay service-role-only
-- (no INSERT/UPDATE/DELETE grant to authenticated) -- applying a pending row
-- goes through app/api/switch/apply-forward, which authenticates the caller
-- first and then uses the service-role client for the actual write.
DROP POLICY IF EXISTS switch_forwards_owner_read ON public.switch_forwards;
CREATE POLICY switch_forwards_owner_read ON public.switch_forwards
  FOR SELECT USING (auth.uid() = user_id);

GRANT SELECT ON public.switch_forwards TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
