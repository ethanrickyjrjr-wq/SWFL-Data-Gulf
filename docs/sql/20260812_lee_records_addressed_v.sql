-- Lee County recorded documents resolved to a STREET ADDRESS.
-- Evidence: _RESEARCH/data-and-ingest/2026-08-12-deed-parcel-strap-join-fix.md
--
-- WHY THIS EXISTS: docs/standards/data-roots.md (line 86 and T10) recorded the Lee
-- deed->parcel join as BROKEN -- "0 rows on a direct join." That measurement was
-- correct, and it was taken against lee_parcels.state_parcel_id (a state-level id,
-- format Cnn-nnn-nnn-nnnn-n). The right column is lee_parcels.parcel_id, which IS
-- the Lee STRAP with separators removed -- a fact already documented 07/18/2026 in
-- _RESEARCH/audits/2026-07-18-data-consolidation/P1-parcel-consolidation.md line 63
-- ("FDOR keys on parcel_id (STRAP)") and never connected to the deed feed.
--
-- NORMALIZATION: strip '-' and '.', and LPAD the leading section field to 2 digits.
-- Some source rows carry a 1-digit section ("0-44-27-..."), so a bare replace()
-- lands on 16 chars and silently misses. 11,386 of the strap-carrying rows
-- normalize to exactly 17; the rest are malformed at source and are legitimately
-- unjoinable (632 land on 4, 114 on 5, 102 on 19, 64 on 15, 40 on 16).
--
-- NO FAN-OUT: lee_parcels.parcel_id is unique -- 556,083 rows / 556,083 distinct,
-- verified live 08/12/2026. This is an INNER JOIN, so every row here HAS an
-- address by construction; read the base table for un-addressed totals.
--
-- SALE PRICE IS DEED-ONLY, ENFORCED HERE. consideration_usd is non-null on 100% of
-- all 28,186 rows including DEATH CERTIFICATE and MARRIAGE, so the >$100
-- arm's-length floor is meaningless off a DEED. sale_price_usd is therefore NULL
-- unless the row is an arm's-length DEED -- a consumer cannot misuse it.
--
-- DEDUPE WARNING FOR CONSUMERS: two deeds can share one address on one day (real
-- example: 1111 FLORENCE ST E, twice, 08/11/2026, same price). Do NOT treat a row
-- here as a distinct sale without deduping on (record_date, strap17).
--
-- Measured 08/12/2026 against the 28,186-row / 07/13-08/11/2026 snapshot:
--   DEED                    4,999 with strap -> 4,535 addressed (85% of all 5,353 deeds)
--   MORTGAGE                2,005            -> 1,846
--   NOTICE OF COMMENCEMENT  1,542            -> 1,278
--   LIEN                      352            ->   313
--   PROBATE                   714            ->   120
-- Counts grow as future manual raw/*.json captures land (FETCH is Akamai-blocked).
--
-- PARTY LISTS ARE ELIDED AT SOURCE. grantors/grantees below are NOT complete party
-- lists. The Lee Clerk grid caps each list at TWO real names; measured 08/27/2026
-- across all 22 committed raw pulls, 4,529 of 28,186 rows (16.07%) are elided on at
-- least one side, and 25.97% of DEED rows are. The two completeness flags added at
-- the END of the select list (grantors_complete / grantees_complete) are the ONLY
-- safe way to read those arrays: treat an array as a whole party list only when its
-- flag is TRUE. NULL means the row predates the 08/27/2026 normalizer fix and its
-- completeness is unknown (its array may still hold the literal "..." marker).
-- Base-table columns + measurement: migrations/20260827_lee_deed_party_list_completeness.sql
--
-- ⚠️  THE TWO NEW COLUMNS ARE NOT YET LIVE (08/27/2026). This file was updated in the
--     same pass as that migration and NEITHER was run. CREATE OR REPLACE VIEW can only
--     APPEND columns, which is why the flags sit last rather than beside the arrays
--     they qualify. Apply the base-table migration FIRST — this view cannot select
--     columns the table does not have yet.
--
-- Apply: bun scripts/apply-lee-records-addressed-view.mts  (idempotent).

CREATE OR REPLACE VIEW data_lake.lee_records_addressed_v AS
WITH normalized AS (
  SELECT
    internal_doc_id,
    clerk_file_number,
    record_date,
    doc_type,
    consideration_usd,
    grantors,
    grantees,
    grantors_complete,
    grantees_complete,
    legal_full,
    parcel_strap,
    lpad(split_part(parcel_strap, '-', 1), 2, '0')
      || replace(replace(substr(parcel_strap, strpos(parcel_strap, '-') + 1), '-', ''), '.', '')
      AS strap17
  FROM data_lake.lee_deed_official_records
  WHERE parcel_strap IS NOT NULL
)
SELECT
  n.internal_doc_id,
  n.clerk_file_number,
  n.record_date,
  n.doc_type,
  n.strap17,
  -- DEED-only, arm's-length-only. NULL everywhere else, by design (see header).
  CASE WHEN n.doc_type = 'DEED' AND n.consideration_usd > 100
       THEN n.consideration_usd END                       AS sale_price_usd,
  p.phy_addr1                                             AS address_line1,
  p.phy_addr2                                             AS address_line2,
  p.phy_city                                              AS city,
  p.phy_zipcd                                             AS zip_code,
  p.dor_uc                                                AS use_code,
  p.jv                                                    AS just_value,
  n.grantors,
  n.grantees,
  n.legal_full,
  n.parcel_strap                                          AS parcel_strap_raw,
  -- Appended, not inlined next to the arrays: CREATE OR REPLACE VIEW cannot rename or
  -- reorder existing view columns, only add at the end.
  n.grantors_complete,
  n.grantees_complete
FROM normalized n
JOIN data_lake.lee_parcels p ON p.parcel_id = n.strap17
WHERE p.phy_addr1 IS NOT NULL;

GRANT SELECT ON data_lake.lee_records_addressed_v TO service_role;
GRANT SELECT ON data_lake.lee_records_addressed_v TO anon;
