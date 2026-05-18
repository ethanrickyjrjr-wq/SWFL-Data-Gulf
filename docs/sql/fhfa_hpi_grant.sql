-- Grant brain-platform's service_role read access to the Tier 2 FHFA HPI table.
-- Apply ONCE after the first dlt run creates data_lake.fhfa_hpi
-- (python -m ingest.pipelines.fhfa.pipeline from brain-platform/ingest/).
--
-- Brain-platform's Supabase key is service_role (not anon). Without USAGE on
-- the schema + SELECT on the table, the fhfa-hpi-source connector returns 0
-- rows silently. See feedback_premise-engine-supabase-roles.md.
--
-- Schema is auto-created by dlt with the 13 columns pinned in
-- ingest/pipelines/fhfa/resources.py:_FHFA_HPI_COLUMNS.
-- Primary key is the surrogate "id" field (pipe-delimited composite key).
-- replace disposition: FHFA publishes a full monthly snapshot so we mirror it.

GRANT USAGE ON SCHEMA data_lake TO service_role;
GRANT SELECT ON data_lake.fhfa_hpi TO service_role;
