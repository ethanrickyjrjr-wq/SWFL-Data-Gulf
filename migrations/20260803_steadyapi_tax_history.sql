-- SteadyAPI Step 3 family B (08/03/2026): typed per-property tax/assessment/market-value history,
-- parsed from data_lake.steadyapi_property_history_raw's tax_history[] array. Zero paid calls.
-- Design: docs/superpowers/specs/2026-08-03-steadyapi-tax-history-design.md
-- NOT A VALUATION ROOT, EVER — leepa_parcels (Lee) / collier_parcels (Collier, IS the FDOR pull)
-- stay the assessed/market-value authority. This table's jobs: annual tax PAID (no built root
-- today) + a future address-join cross-source contract (deferred, tracked separately).
-- Idempotent (CREATE TABLE IF NOT EXISTS). Run via `new Bun.SQL` (psql NOT installed), sslmode=require.

CREATE TABLE IF NOT EXISTS data_lake.steadyapi_tax_history (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  property_id           text NOT NULL,
  address_key           text,
  county                text,
  tax_year              integer NOT NULL,
  tax_amount            numeric, -- VENDOR-REPORTED annual tax paid, NOT validated against a
                                  -- county tax bill — see design spec's deferred quality contract.
  -- NOT A VALUATION ROOT. leepa_parcels/collier_parcels stay authority for assessed/market value.
  assessment_total       numeric,
  assessment_building    numeric,
  assessment_land        numeric,
  market_value_total     numeric,
  market_value_building  numeric,
  market_value_land      numeric,
  fetched_at             timestamptz NOT NULL, -- carried from the raw table (provenance)
  parsed_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, tax_year)
);

CREATE INDEX IF NOT EXISTS idx_steadyapi_tax_history_property
  ON data_lake.steadyapi_tax_history (property_id);

GRANT SELECT ON ALL TABLES IN SCHEMA data_lake TO service_role;
NOTIFY pgrst, 'reload schema';
