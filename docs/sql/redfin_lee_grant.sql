-- Grant brain-platform's service_role read access to the Tier 2 Redfin Lee
-- market table. Apply ONCE after the first dlt run creates the table
-- (python -m ingest.pipelines.redfin_lee.pipeline).
--
-- Brain-platform's Supabase key is service_role (not anon). Without USAGE on the
-- schema + SELECT on the table, the source connector returns 0 rows silently.
-- The NOTIFY pgrst reload is required — without it PostgREST does not expose
-- the new table even after the grants are applied.
--
-- Unlike leepa, properties-lee-value aggregates market data in TypeScript over
-- the small "All Residential" row set, so NO Postgres views are needed here —
-- just the schema USAGE + table SELECT grant. Schema is auto-created by dlt with
-- the columns pinned in ingest/pipelines/redfin_lee/resources.py:_TIER2_COLUMNS;
-- the composite PRIMARY KEY (region, period_end, property_type) is declared via
-- the dlt resource hint and enforced at first load.

GRANT USAGE ON SCHEMA data_lake TO service_role;
GRANT SELECT ON data_lake.redfin_lee_market TO service_role;

NOTIFY pgrst, 'reload schema';
