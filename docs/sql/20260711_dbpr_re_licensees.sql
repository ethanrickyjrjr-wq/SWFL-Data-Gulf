-- docs/sql/20260711_dbpr_re_licensees.sql
-- public.dbpr_re_licensees — DBPR weekly RE_rgn7.csv extract, Lee+Collier individual agents.
-- Written by ingest/pipelines/dbpr_re_licensees/pipeline.py (psycopg3, non-dlt — mirrors
-- public.dbpr_public_notices). Source: https://www2.myfloridalicense.com/sto/file_download/
-- extracts/RE_rgn7.csv — weekly refresh. Column layout: docs/superpowers/specs/
-- 2026-07-11-new-agent-radar-design.md (23 cols, re-verified live 07/11/2026 from a
-- byte-range probe: 307/307 sample rows were 23 columns, positional map confirmed field-for-field).
--
-- email: ALWAYS NULL from this pipeline. Populated later by a separate Chapter 119
-- records-request lane (tracked outside this build). The upsert in pipeline.py uses
-- COALESCE(EXCLUDED.email, existing) so this pipeline's weekly re-run never clobbers a
-- populated email back to NULL.
--
-- "New agent" access is the public.new_re_agents view below, keyed on original_license_date
-- (NOT first_seen_at) so the very first run does not falsely flag the whole ~30k backlog
-- as "new" — only genuinely recently-issued licenses qualify, cold-start safe.

CREATE TABLE IF NOT EXISTS public.dbpr_re_licensees (
  license_number             text primary key,
  alternate_license_number   text,
  licensee_name               text not null,   -- raw "LAST, FIRST MIDDLE"
  first_name                  text,
  middle                       text,
  last_name                    text,
  dba_name                     text,
  rank                         text,            -- e.g. "SL Sales Associate"
  license_type                 text,            -- e.g. "2501 Real Estate Broker or Sales"
  address1                     text,
  address2                     text,
  address3                     text,
  city                         text,
  state                        text,
  zip                          text,
  county_code                  text,            -- DBPR 2-digit, e.g. "46" (Lee), "21" (Collier)
  county_name                  text not null,   -- "Lee" | "Collier"
  primary_status                text,
  secondary_status              text,
  original_license_date         date,           -- "new agent" signal — first issued
  status_effective_date         date,
  license_expiration_date       date,
  employer_name                 text,
  employer_license_number       text,
  email                         text,           -- ALWAYS NULL here; see header note
  email_source                  text,           -- provenance once the email lane lands
  source_tag                    text not null default 'dbpr_re_rgn7',
  source_url                    text,
  as_of_date                    date,           -- file fetch date
  first_seen_at                 timestamptz not null default now(),
  last_seen_at                  timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS dbpr_re_licensees_county_idx ON public.dbpr_re_licensees (county_name);
CREATE INDEX IF NOT EXISTS dbpr_re_licensees_orig_date_idx ON public.dbpr_re_licensees (original_license_date);
CREATE INDEX IF NOT EXISTS dbpr_re_licensees_last_seen_idx ON public.dbpr_re_licensees (last_seen_at);

CREATE OR REPLACE VIEW public.new_re_agents AS
SELECT *
FROM public.dbpr_re_licensees
WHERE original_license_date >= (current_date - interval '90 days')
ORDER BY original_license_date DESC;

COMMENT ON VIEW public.new_re_agents IS
  'Lee/Collier RE licensees issued in the last 90 days. Outreach reads the 7-day slice off the same shape: WHERE original_license_date >= current_date - interval ''7 days''.';

GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;
NOTIFY pgrst, 'reload schema';
