-- Aggregate view: FDIC Summary of Deposits rolled up to county x year.
-- Source rows: data_lake.fdic_sod (one row per branch per year, filtered on STCNTYBR = branch county).
-- deposits_thousands_usd is SUM(depsumbr) — the vendor reports branch deposits in $000s, as of June 30
-- of `year`. Math lives here, not in the connector (aggregate at source, ingest/CLAUDE.md).
CREATE OR REPLACE VIEW data_lake.fdic_sod_county_year_v AS
SELECT
  s.stcntybr::text                 AS county_fips,
  s.year::int                      AS year,
  COUNT(*)::int                    AS branches,
  COUNT(DISTINCT s.cert)::int      AS banks,
  SUM(s.depsumbr)::bigint          AS deposits_thousands_usd
FROM data_lake.fdic_sod s
GROUP BY s.stcntybr, s.year
ORDER BY county_fips, year;

GRANT SELECT ON data_lake.fdic_sod_county_year_v TO service_role;
NOTIFY pgrst, 'reload schema';
