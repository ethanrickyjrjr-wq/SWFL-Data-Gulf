-- Grant brain-platform's service_role read access to the Tier 2 Redfin Collier
-- market table. Apply ONCE after the first dlt run creates the table
-- (python -m ingest.pipelines.redfin_collier.pipeline).
--
-- Brain-platform's Supabase key is service_role (not anon). Without USAGE on the
-- schema + SELECT on the table, the source connector returns 0 rows silently.
-- See feedback_premise-engine-supabase-roles.md.
--
-- Unlike leepa, properties-collier-value aggregates in TypeScript over the small
-- "All Residential" row set, so NO Postgres views are needed here — just the
-- schema USAGE + table SELECT grant. Schema is auto-created by dlt with the
-- columns pinned in ingest/pipelines/redfin_collier/resources.py:_TIER2_COLUMNS;
-- the composite PRIMARY KEY (region, period_end, property_type) is declared via
-- the dlt resource hint and enforced at first load.

GRANT USAGE ON SCHEMA data_lake TO service_role;
GRANT SELECT ON data_lake.redfin_collier_market TO service_role;

NOTIFY pgrst, 'reload schema';
