-- 20260613_buyer_intent_events.sql — the warm-lead signal log.
--
-- When a client replies to a branded market-data email, that reply IS buyer
-- intent. Each inbound reply (whether or not we auto-answered) lands here as one
-- event: who replied, what they asked (parsed), the raw reply, and whether the
-- grounded auto-reply fired. The agent reads this feed at /alerts and gets an
-- email alert per event.
--
-- The same table backs the Unit-4 auto-reply rate limits (no separate table):
--   * throttle  — auto-replies to one sender in the last 10 min
--   * thread cap — auto-replies in one (reply_token, contact_email) thread
--   * breaker   — auto-replies for one agent today
-- all derived by counting rows WHERE answer_sent = true.
--
-- RLS: auth.uid() = user_id (same shape as 20260612_projects.sql). The inbound
-- webhook writes via service_role; an agent reads only their own events.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.buyer_intent_events (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       uuid NOT NULL,
  reply_token   text,
  schedule_id   bigint,
  contact_email text NOT NULL,
  contact_name  text,
  contact_tags  text[] NOT NULL DEFAULT '{}',
  parsed_zip    text,
  parsed_place  text,
  parsed_topic  text,
  raw_reply     text,
  answer_sent   boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  read_at       timestamptz
);

CREATE INDEX IF NOT EXISTS buyer_intent_events_user_created_idx
  ON public.buyer_intent_events (user_id, created_at DESC);

-- Supports the rate-limit counts (sender throttle + thread cap), which filter on
-- answer_sent and a recent created_at window.
CREATE INDEX IF NOT EXISTS buyer_intent_events_sender_idx
  ON public.buyer_intent_events (contact_email, created_at DESC);

ALTER TABLE public.buyer_intent_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY buyer_intent_events_owner_all ON public.buyer_intent_events
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

REVOKE ALL ON public.buyer_intent_events FROM anon;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.buyer_intent_events TO authenticated;
GRANT  ALL ON public.buyer_intent_events TO service_role;
