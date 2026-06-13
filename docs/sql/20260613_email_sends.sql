-- 20260613_email_sends.sql — one row per branded-email broadcast fire.
--
-- The Buyer-Intent Reply Sensor needs a durable record of every send so an
-- inbound reply can be traced back to the agent + the specific issue. Sends go
-- out as Resend Broadcasts to a Segment (no per-recipient token possible), so the
-- reply token encodes AGENT + SEND (schedule + issue), NOT the client — the client
-- is identified on inbound by matching `from` against `email_contacts`.
--
-- `reply_token` is the opaque local-part of r-{token}@reply.swfldatagulf.com.
-- Until now `broadcast_id` was returned by the broadcast route and dropped on the
-- floor (only tallied); this table finally persists it.
--
-- RLS: auth.uid() = user_id (same shape as 20260612_projects.sql). The cron worker
-- writes via service_role; an agent reads only their own sends.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.email_sends (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       uuid NOT NULL,
  schedule_id   bigint,
  audience_slug text,
  broadcast_id  text,
  reply_token   text NOT NULL,
  reply_address text NOT NULL,
  sent_at       timestamptz NOT NULL DEFAULT now()
);

-- One token ↔ one send. UNIQUE INDEX (not ADD CONSTRAINT) so the migration is
-- re-runnable; the inbound webhook looks a token up here on every reply.
CREATE UNIQUE INDEX IF NOT EXISTS email_sends_reply_token_uidx
  ON public.email_sends (reply_token);

CREATE INDEX IF NOT EXISTS email_sends_user_sent_idx
  ON public.email_sends (user_id, sent_at DESC);

ALTER TABLE public.email_sends ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY email_sends_owner_all ON public.email_sends
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

REVOKE ALL ON public.email_sends FROM anon;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.email_sends TO authenticated;
GRANT  ALL ON public.email_sends TO service_role;
