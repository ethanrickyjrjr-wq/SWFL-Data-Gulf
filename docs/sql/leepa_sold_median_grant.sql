-- Run after data_lake.leepa_parcel_zip lands + the median view is created, so
-- PostgREST/service_role can read them.
GRANT SELECT ON ALL TABLES IN SCHEMA data_lake TO service_role;
NOTIFY pgrst, 'reload schema';
