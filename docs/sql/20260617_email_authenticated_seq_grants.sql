-- 20260617_email_authenticated_seq_grants.sql
-- FIX: `nonce_claim_failed` on the in-chat "Send weekly" CONFIRM (Task 5) — and the
-- identical latent 42501 in EVERY authenticated-insert path across the email product.
--
-- ROOT CAUSE (verified live, 2026-06-17): the email migrations granted `authenticated`
-- INSERT on the TABLES but never USAGE on the bigserial backing SEQUENCES. An INSERT
-- evaluates nextval('<t>_id_seq'), which requires USAGE on the sequence — without it
-- the authenticated (cookie/RLS) client throws `42501 permission denied for sequence`.
-- In the confirm path that surfaces as: claimOnce → email_send_ledger insert throws →
-- the route returns `nonce_claim_failed` (500). The CRON path is unaffected because it
-- uses service_role, which holds sequence USAGE by Supabase default — which is exactly
-- why the bug stayed hidden until the first real USER confirm.
--
-- Tables with text ids (projects, deliverables) or IDENTITY ids (email_sends,
-- is_identity=YES) are immune — no separately-grantable sequence. Affected = the
-- bigserial email tables whose table already grants `authenticated` INSERT:
--   email_send_ledger  (claimOnce — the nonce single-use claim)        ← Task 5 confirm
--   email_schedules    (createOrTouchSchedule — the schedule row)      ← Task 5 confirm
--   email_audiences    (contacts upload — audience create)
--   email_contacts     (contacts upload — contact rows)
--   email_sender_config(sender/domain config)
--   email_usage        (per-user send metering)
-- Excluded: email_sends (IDENTITY, already works), email_subscribers (no auth INSERT).
--
-- Run directly (creds .dlt/secrets.toml). Idempotent: GRANT is a no-op if already held.
-- USAGE (not SELECT) is the minimal grant nextval() needs; RLS still governs row access.

GRANT USAGE ON SEQUENCE
  public.email_send_ledger_id_seq,
  public.email_schedules_id_seq,
  public.email_audiences_id_seq,
  public.email_contacts_id_seq,
  public.email_sender_config_id_seq,
  public.email_usage_id_seq
  TO authenticated;

NOTIFY pgrst, 'reload schema';
