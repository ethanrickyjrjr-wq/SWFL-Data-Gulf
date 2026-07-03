-- public.sourced_figures — shared lane-3 figure cache (spec 2026-07-03 zip-signal-hero §1).
-- One row per (scope, metric): a number found live with a named web source, cached so the
-- ZIP report page, the site assistant, and the email/social builders all read the SAME
-- figure ("found numbers are platform-wide, never page-local").
-- Idempotent; run via:  bun scripts/run-migration.ts migrations/20260703_sourced_figures.sql

CREATE TABLE IF NOT EXISTS public.sourced_figures (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_kind     text NOT NULL CHECK (scope_kind IN ('zip', 'county')),
  scope_key      text NOT NULL,
  metric_key     text NOT NULL,
  label          text NOT NULL,
  value_num      numeric,
  value_text     text,
  unit           text,
  source_name    text NOT NULL,
  source_url     text NOT NULL,
  cited_text     text NOT NULL DEFAULT '',
  as_of          date,
  fetched_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  requested_from text NOT NULL DEFAULT 'find-button'
);

-- Idempotent upsert target: one row per (scope, metric).
CREATE UNIQUE INDEX IF NOT EXISTS sourced_figures_scope_metric_uq
  ON public.sourced_figures (scope_kind, scope_key, metric_key);

-- Daily-cap count query scans by fetch time.
CREATE INDEX IF NOT EXISTS sourced_figures_fetched_idx
  ON public.sourced_figures (fetched_at DESC);

ALTER TABLE public.sourced_figures ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies on purpose: all reads and writes go through
-- server-side service-role code (RLS enabled + no policy = deny other roles).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sourced_figures TO service_role;

NOTIFY pgrst, 'reload schema';
