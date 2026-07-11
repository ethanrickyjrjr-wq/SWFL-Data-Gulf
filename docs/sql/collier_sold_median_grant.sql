-- Run after the collier_parcels re-ingest (centroid source, +sale_prc1) lands AND
-- docs/sql/20260711_collier_sold_median_by_zip.sql is applied, so PostgREST /
-- service_role can read the view. (GRANT ... ON ALL TABLES also covers views.)
GRANT SELECT ON ALL TABLES IN SCHEMA data_lake TO service_role;
NOTIFY pgrst, 'reload schema';
