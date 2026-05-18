-- Grant brain-platform's service_role read access to the Tier 2 FDOT AADT table.
-- Apply ONCE after the first dlt run creates data_lake.fdot_aadt_fl
-- (python -m ingest.pipelines.fdot.pipeline).
--
-- Brain-platform's Supabase key is service_role (not anon). Without USAGE on
-- the schema + SELECT on the table, the source connector returns 0 rows
-- silently. See feedback_premise-engine-supabase-roles.md.

GRANT USAGE ON SCHEMA data_lake TO service_role;
GRANT SELECT ON data_lake.fdot_aadt_fl TO service_role;
