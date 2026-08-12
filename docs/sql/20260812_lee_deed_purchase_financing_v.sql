-- Cash-vs-financed classification for Lee County recorded deeds.
-- docs/superpowers/specs/2026-08-12-deed-cash-financed-split-design.md
-- docs/handoff/2026-08-12-deed-cash-financed-split-build-handoff.md
--
-- One row per arm's-length DEED (consideration_usd > $100), classified against
-- same-strap MORTGAGE-family recordings on the SAME record_date (EXISTS, never a
-- join fan-out -- FM-3). windowDays is hardcoded to same-day: measured 08/12/2026
-- the pairing curve is flat out to +/-14 days (adds 0.1% of pairs), so same-day
-- is the correct, simplest choice -- see spec FM-1. Mirrors
-- refinery/lib/deed-financing-classifier.mts, which is what this view's output is
-- tested against (deed-financing-classifier.test.mts).
--
-- Strap-carrying deed rows are deduped to one per (record_date, parcel_strap)
-- before pairing (FM-3). Strap-absent deeds are NEVER deduped against each other
-- (a null strap can't identify a distinct property) and are always
-- 'unclassifiable' (FM-2) -- the source connector applies the 15% suppression
-- floor when it aggregates this view, same as the TS classifier.
--
-- MORTGAGE-family doc_type match uses LIKE 'MORTGAGE%' -- three live variants
-- (MORTGAGE, MORTGAGE WITHOUT INTANGIBLE TAX, MORTGAGE WITHOUT TAX); matching
-- only = 'MORTGAGE' undercounts financing by roughly 18% (handoff step 2 trap).
--
-- Apply via psycopg3 (credentials in .dlt/secrets.toml). Idempotent (CREATE OR
-- REPLACE). Verify row count after: expect ~3,031 financed/no_recorded_financing
-- rows + ~180 unclassifiable rows against the 08/12/2026 snapshot (28,186 total
-- rows, 07/13-08/11/2026); both counts grow as future raw/*.json drops land.

CREATE OR REPLACE VIEW data_lake.lee_deed_purchase_financing_v AS
WITH classifiable AS (
  SELECT DISTINCT ON (record_date, parcel_strap)
    record_date,
    parcel_strap,
    consideration_usd
  FROM data_lake.lee_deed_official_records
  WHERE doc_type = 'DEED'
    AND consideration_usd > 100
    AND parcel_strap IS NOT NULL
  ORDER BY record_date, parcel_strap, internal_doc_id
),
unclassifiable AS (
  SELECT
    record_date,
    parcel_strap,
    consideration_usd
  FROM data_lake.lee_deed_official_records
  WHERE doc_type = 'DEED'
    AND consideration_usd > 100
    AND parcel_strap IS NULL
)
SELECT
  c.record_date,
  c.parcel_strap,
  c.consideration_usd,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM data_lake.lee_deed_official_records m
      WHERE m.doc_type LIKE 'MORTGAGE%'
        AND m.parcel_strap = c.parcel_strap
        AND m.record_date = c.record_date
    ) THEN 'financed'
    ELSE 'no_recorded_financing'
  END AS financing_class
FROM classifiable c
UNION ALL
SELECT
  u.record_date,
  u.parcel_strap,
  u.consideration_usd,
  'unclassifiable' AS financing_class
FROM unclassifiable u;

GRANT SELECT ON data_lake.lee_deed_purchase_financing_v TO service_role;

NOTIFY pgrst, 'reload schema';
