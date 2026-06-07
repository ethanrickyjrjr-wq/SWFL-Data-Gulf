-- docs/sql/20260607_usage_events.sql  (idempotent)
CREATE TABLE IF NOT EXISTS public.usage_events (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id    text NOT NULL,        -- signed-cookie anonymous id (no PII)
  iso_week     text NOT NULL,        -- e.g. "2026-W23"
  report_id    text,
  reach        text[],
  ip_hash      text,                 -- secondary signal, hashed
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_events_client_week_idx ON public.usage_events (client_id, iso_week);
GRANT INSERT, SELECT ON public.usage_events TO service_role;
