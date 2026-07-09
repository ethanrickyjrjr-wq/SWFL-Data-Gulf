-- 20260709_email_events_contact_id.sql — per-recipient linkage for blast engagement.
--
-- email_events blast rows (did-tagged) carry no recipient identity: the blast route discards
-- batch response ids and no tag names the contact. Engagement-staggered sending
-- (docs/superpowers/specs/2026-07-09-engagement-staggered-send-design.md) needs
-- opened/clicked/delivered counts per (user_id, contact_id). The webhook writes this from the
-- new `cid` Resend tag; rows older than this migration carry no linkage (no backfill possible —
-- the resend_email_id→contact mapping was never stored).
--
-- Idempotent: safe to re-run.

ALTER TABLE public.email_events
  ADD COLUMN IF NOT EXISTS contact_id uuid;

CREATE INDEX IF NOT EXISTS email_events_user_contact_idx
  ON public.email_events (user_id, contact_id)
  WHERE contact_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
