-- docs/sql/20260712_grant_redfin_city_swfl.sql
-- PostgREST access for the FL-wide Redfin city sold table (first landed 07/12/2026,
-- 389,986 rows / 896 regions). Required for the desk sold-anchor loader
-- (lib/desk/loaders.ts loadSoldSeries) and the gallery price-trend sold lane —
-- service_role needs an explicit per-table GRANT (dlt-created tables get none).
-- Idempotent. Apply: bun scripts/run-migration.ts docs/sql/20260712_grant_redfin_city_swfl.sql

GRANT SELECT ON data_lake.redfin_city_swfl TO service_role;
NOTIFY pgrst, 'reload schema';
