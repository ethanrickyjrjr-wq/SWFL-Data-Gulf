-- 20260613_email_send_ledger.sql — idempotency ledger for the multi-tenant email
-- product. ONE row per caller-supplied idempotency_key; the UNIQUE index IS the
-- atomic at-most-once guarantee. Claims go through INSERT ... ON CONFLICT DO NOTHING
-- (lib/email/idempotency.ts → Supabase upsert ignoreDuplicates), so there is NO
-- application-level SELECT-then-INSERT and concurrent cron workers can't both win
-- (the DB serializes on the unique index — exactly one INSERT returns a row).
--
-- Keys (constructed to be globally unique, so one global UNIQUE is correct):
--   cron digest      'digest:<scheduleId>:<YYYY-MM-DD>'   occurrence dedupe; backstops
--                                                          the reaper/crash-replay window
--                                                          on top of the claim RPC.
--   command confirm  'nonce:<nid>'                        single-use proposal nonce.
--   (reserved) welcome->delta activation + reply sensor:
--                    'activation:<recipient>:<step>'       per-recipient-per-step.
--
-- Idempotent + auth.uid()=user_id RLS + service_role ALL, matching 20260612_email_product.sql.
-- Run directly (creds .dlt/secrets.toml) — do NOT hand to the operator (CLAUDE.md RULE 1).

CREATE TABLE IF NOT EXISTS public.email_send_ledger (
  id               bigserial PRIMARY KEY,
  user_id          uuid NOT NULL,
  idempotency_key  text NOT NULL,
  kind             text NOT NULL,                 -- digest | nonce | activation | ...
  schedule_id      bigint,                         -- soft-link to email_schedules.id
  recipient        text,                           -- per-recipient sends (activation/reply)
  sequence_step    text,                           -- activation-sequence step label
  broadcast_id     text,                           -- Resend broadcast id when known
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- THE at-most-once guarantee: a globally-unique key.
CREATE UNIQUE INDEX IF NOT EXISTS email_send_ledger_key_uidx
  ON public.email_send_ledger (idempotency_key);

ALTER TABLE public.email_send_ledger ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY email_send_ledger_owner_all ON public.email_send_ledger
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

REVOKE ALL ON public.email_send_ledger FROM anon;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.email_send_ledger TO authenticated;
GRANT  ALL ON public.email_send_ledger TO service_role;

NOTIFY pgrst, 'reload schema';
