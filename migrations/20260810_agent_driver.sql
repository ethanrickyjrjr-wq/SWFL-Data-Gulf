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
