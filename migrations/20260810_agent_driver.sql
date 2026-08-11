-- Agent Driver Migration: token scope column + test-events table
-- Idempotent: all operations use IF NOT EXISTS

ALTER TABLE public.user_api_tokens ADD COLUMN IF NOT EXISTS scope text;
COMMENT ON COLUMN public.user_api_tokens.scope IS
  'Token scope: agent_feed_read, agent_build, agent_test_inject. NULL = legacy full-access token (existing behavior unchanged).';

CREATE TABLE IF NOT EXISTS public.agent_feed_test_events (
  id bigserial PRIMARY KEY,
  address text NOT NULL,
  address_key text NOT NULL,
  sale_or_rent text NOT NULL DEFAULT 'sale',
  from_state text,
  to_state text NOT NULL,
  price_delta numeric,
  at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE INDEX IF NOT EXISTS agent_feed_test_events_created_by_idx ON public.agent_feed_test_events (created_by);
CREATE INDEX IF NOT EXISTS agent_feed_test_events_address_key_idx ON public.agent_feed_test_events (address_key);

-- F4 fix (hermes-email-driver final review, LOW). The LIVE table already has RLS enabled
-- (applied manually during Task 1); this migration file never carried the statement, so a
-- fresh environment running it from scratch would create the table WITHOUT row-level
-- security, diverging from prod and from repo convention (every public.* table in this
-- feature enables RLS -- see docs/sql/20260613_email_send_ledger.sql,
-- docs/sql/20260613_deliverables.sql). ALTER TABLE ... ENABLE ROW LEVEL SECURITY is
-- idempotent on its own (Postgres no-ops if already enabled), so no IF NOT EXISTS guard is
-- needed or available for it.
ALTER TABLE public.agent_feed_test_events ENABLE ROW LEVEL SECURITY;
