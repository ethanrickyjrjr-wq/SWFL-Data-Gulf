-- docs/sql/20260716_market_details_dropped_fields.sql
-- Wire the formerly-dropped market_comparison block + market_temperature extras into
-- data_lake.market_details_swfl (closes check market_aggregates_details_dropped_fields).
-- Same paid SteadyAPI /housing-market-details response — zero extra calls; pure code gap.
-- Comparison columns keep the vendor's verbatim key names (docs.steadyapi.com collection,
-- verified live 07/16/2026). NOTE: the "ratio_of_days_on_market_*" values arrive as signed
-- day DELTAS (e.g. -8) despite the vendor's "ratio_of_" naming — stored as written.
-- Idempotent. Apply: bun scripts/run-migration.ts docs/sql/20260716_market_details_dropped_fields.sql

ALTER TABLE data_lake.market_details_swfl
  ADD COLUMN IF NOT EXISTS national_hotness_score numeric,
  ADD COLUMN IF NOT EXISTS local_temperature      text,
  ADD COLUMN IF NOT EXISTS national_temperature   text,
  ADD COLUMN IF NOT EXISTS hot_market_badge       text,
  ADD COLUMN IF NOT EXISTS hot_market_rank        int,
  ADD COLUMN IF NOT EXISTS ratio_of_days_on_market_vs_typical_property_in_county numeric,
  ADD COLUMN IF NOT EXISTS ratio_of_days_on_market_vs_typical_property_in_us     numeric,
  ADD COLUMN IF NOT EXISTS ratio_of_ldp_views_vs_typical_property_in_county      numeric,
  ADD COLUMN IF NOT EXISTS ratio_of_ldp_views_vs_typical_property_in_us          numeric;

-- Recreate the latest-snapshot view so SELECT * re-expands over the new columns
-- (a Postgres view snapshots * at creation; ALTER TABLE alone does not widen it).
CREATE OR REPLACE VIEW data_lake.market_details_swfl_latest AS
SELECT *
FROM data_lake.market_details_swfl
WHERE captured_date = (SELECT max(captured_date) FROM data_lake.market_details_swfl);

GRANT SELECT ON data_lake.market_details_swfl TO service_role;
GRANT SELECT ON data_lake.market_details_swfl_latest TO service_role;
NOTIFY pgrst, 'reload schema';
