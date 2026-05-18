-- Grant brain-platform's service_role read access to the Tier 2 USGS Water
-- Services tables. Apply ONCE after the first dlt run creates the tables
-- (python -m ingest.pipelines.usgs.pipeline from brain-platform/).
--
-- Brain-platform's Supabase key is service_role (not anon). Without USAGE on
-- the schema + SELECT on the tables, the usgs-water-source connector returns
-- 0 rows silently. See memory: feedback_premise-engine-supabase-roles.md.
--
-- Schemas are auto-created by dlt with the columns pinned in
-- ingest/pipelines/usgs/resources.py:_USGS_DAILY_COLUMNS / _USGS_SITES_COLUMNS.
-- Primary keys:
--   data_lake.usgs_daily — composite (site_no, parameter_cd, stat_cd, obs_date)
--   data_lake.usgs_sites — site_no
-- write_disposition="merge" on both.

GRANT USAGE ON SCHEMA data_lake TO service_role;
GRANT SELECT ON data_lake.usgs_daily TO service_role;
GRANT SELECT ON data_lake.usgs_sites TO service_role;
