-- docs/sql/20260719_report_watches.sql
-- Watch store for the Why Isn't It Selling report. RLS deny-all: RLS enabled with
-- ZERO policies — only service_role (bypasses RLS) touches it. Sending is DARK in
-- v1; rows accumulate unconfirmed until wins_watch_email_live closes.
-- Apply: bun scripts/run-migration.ts docs/sql/20260719_report_watches.sql
CREATE TABLE IF NOT EXISTS public.report_watches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  address_key text NOT NULL,
  zip text NOT NULL,
  query_text text NOT NULL,
  confirm_token uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  last_sent_at timestamptz,
  agent_optin_at timestamptz,
  consent_text text,
  UNIQUE (email, address_key)
);
ALTER TABLE public.report_watches ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.report_watches TO service_role;
NOTIFY pgrst, 'reload schema';
