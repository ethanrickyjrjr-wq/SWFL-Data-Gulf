-- Apply ONCE after first dlt run creates data_lake.bls_laus
-- ~144 rows at steady state (3 areas × 4 measures × 12 months/year × 3 years)
GRANT USAGE ON SCHEMA data_lake TO service_role;
GRANT SELECT ON data_lake.bls_laus TO service_role;
