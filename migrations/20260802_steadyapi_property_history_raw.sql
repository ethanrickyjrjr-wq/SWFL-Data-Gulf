-- Cold landing table for the raw SteadyAPI /property-tax-history response body.
-- Stops the discard at extract_api.py fetch_sold_event's old `return` (line ~586) — every future
-- field the vendor already sends becomes a free SQL query against bytes already paid for, instead
-- of a re-scoped parse. Provenance store (Operation-Dumbo-Drop pattern), NOT a served root; typed
-- consuming tables arrive in Step 3 of docs/superpowers/plans/2026-08-02-steadyapi-raw-landing-playbook.md.
CREATE TABLE IF NOT EXISTS data_lake.steadyapi_property_history_raw (
  property_id  text PRIMARY KEY,
  address_key  text,
  county       text,
  body         jsonb NOT NULL,
  fetched_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON ALL TABLES IN SCHEMA data_lake TO service_role;
NOTIFY pgrst, 'reload schema';
