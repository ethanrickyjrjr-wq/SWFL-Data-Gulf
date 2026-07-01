-- Idempotent: api_usage_log table for live Anthropic spend tracking (/spend)
CREATE TABLE IF NOT EXISTS public.api_usage_log (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  model                 text NOT NULL,
  call_type             text NOT NULL DEFAULT 'other',
  pack_id               text,
  input_tokens          int  NOT NULL DEFAULT 0,
  output_tokens         int  NOT NULL DEFAULT 0,
  cache_read_tokens     int  NOT NULL DEFAULT 0,
  cache_creation_tokens int  NOT NULL DEFAULT 0,
  cost_usd              numeric(10,6) NOT NULL,
  env                   text NOT NULL DEFAULT 'production'
);

CREATE INDEX IF NOT EXISTS api_usage_log_created_at_idx
  ON public.api_usage_log (created_at DESC);

CREATE INDEX IF NOT EXISTS api_usage_log_call_type_idx
  ON public.api_usage_log (call_type, created_at DESC);

-- RLS: enabled for defense in depth; service_role bypasses it by default.
-- No row policy needed -- only the service-role client (this codebase's only
-- writer/reader of this table) ever touches it. Matches 20260628_email_events.sql.
ALTER TABLE public.api_usage_log ENABLE ROW LEVEL SECURITY;

GRANT INSERT, SELECT ON public.api_usage_log TO service_role;
NOTIFY pgrst, 'reload schema';
