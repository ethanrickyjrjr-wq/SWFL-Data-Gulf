-- Chapter 119 records-request outbound engine — tracker table.
-- Operational metadata (public.*), NOT data_lake.* — brain-first gate does not apply.
-- Modeled on public.checks (lifecycle state + stable key + staleness surfacing).
CREATE TABLE IF NOT EXISTS public.records_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key       text UNIQUE NOT NULL,
  target_agency     text NOT NULL,
  dataset           text NOT NULL,
  statute_basis     text NOT NULL DEFAULT 'Fla. Stat. ch. 119',
  contact_email     text,
  portal_url        text,
  state             text NOT NULL DEFAULT 'drafted'
                      CHECK (state IN ('drafted','filed','acknowledged','cost_quoted',
                                       'cost_approved','fulfilled','landed','denied','withdrawn')),
  follow_up_days    integer NOT NULL DEFAULT 14,
  cost_quoted_usd   numeric,
  cost_approved_usd numeric,
  request_body      text,
  received_ref      text,
  landed_target     text,
  notes             text,
  source_tag        text NOT NULL DEFAULT 'records_request',
  filed_at          timestamptz,
  last_contact_at   timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS records_requests_state_idx ON public.records_requests (state);

GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;
NOTIFY pgrst, 'reload schema';
