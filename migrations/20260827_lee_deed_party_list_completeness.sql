-- =====================================================================
-- data_lake.lee_deed_official_records — party-list completeness flags
--
-- ⚠️  WRITTEN, NOT RUN (08/27/2026). Nothing in this file has been applied.
--     Apply: bun scripts/run-migration.ts migrations/20260827_lee_deed_party_list_completeness.sql
--     (psql is not installed on this box; run-migration.ts reads .dlt/secrets.toml.)
--     APPLY THIS TOGETHER WITH docs/sql/20260812_lee_records_addressed_v.sql — the view
--     was updated in the same pass to carry these columns through, and applying one
--     without the other leaves the addressed view exposing a short party list with no
--     completeness signal at all (strictly worse than the marker it replaces).
--
-- WHY
-- The Lee Clerk LandMarkWeb grid caps a party list at TWO real names and appends a
-- literal "..." when the instrument has more. Stored verbatim (the shape every row
-- currently in this table carries), that reads downstream as a COMPLETE two-party list
-- plus a party literally named "..." — a wrong fact, not a missing one.
--
-- MEASURED 08/27/2026 over all 22 committed raw/*.json (28,186 rows, 07/13–08/11/2026):
--   4,529 rows (16.07%) elided on at least one side
--     · grantors 3,190 (11.32%)  · grantees 1,563 (5.55%)  · both sides 224
--   1,390 of the 5,353 DEED rows (25.97%) — DEED is the slice the consuming pack serves
--   4,753 elided lists, ALL of them exactly length 3 with the marker LAST. The source
--   never emits three real names, so a THREE-party deed already loses a party. (The
--   pipeline README said "more than ~3 parties"; that was wrong and is corrected there.)
--   BOTH capture methods elide identically — XHR-capture 28.27% of DEED rows vs
--   xlsx-Export 25.88% of DEED rows. Preferring the export path does NOT fix this.
--
-- SHAPE + POLARITY (deliberate, do not flip)
--   `_complete` and NOT `_truncated`: a consumer reading NULL or a missing column gets
--   a falsy value, which under `_complete` means "not known to be complete" and keeps
--   the consumer conservative. Under `_truncated`, NULL would read as "not truncated"
--   = complete, which is the exact wrong fact this migration exists to stop.
--
--   Per-side and NOT one `parties_truncated`: the two sides are elided independently
--   (3,190 vs 1,563, only 224 overlapping), so one flag loses which side is short.
--
--   NO DEFAULT. The 28,186 rows already in this table were loaded under the old
--   normalizer and keep the old shape ("..." still inside the JSONB array) until the
--   LOAD pipeline re-runs. NULL on those rows is the honest value: unknown. A
--   DEFAULT true would fabricate completeness for every one of them; DEFAULT false
--   would fabricate the opposite. Neither is a measurement.
--
-- AFTER APPLYING: re-run the LOAD pipeline to backfill the flags —
--   python -m ingest.pipelines.lee_deed_official_records.pipeline
-- It merges on internal_doc_id over the committed raw/*.json, so every existing row is
-- rewritten with the marker stripped and the flags set. Until that run, the columns are
-- NULL everywhere and the arrays still carry "...". Idempotent, no new fetch required
-- (the FETCH is Akamai-blocked and manual — see the pipeline README).
-- =====================================================================

ALTER TABLE data_lake.lee_deed_official_records
  ADD COLUMN IF NOT EXISTS grantors_complete BOOLEAN,
  ADD COLUMN IF NOT EXISTS grantees_complete BOOLEAN;

COMMENT ON COLUMN data_lake.lee_deed_official_records.grantors_complete IS
  'FALSE = the SOURCE elided this grantor list (capped at 2 names); the array holds '
  'fewer parties than the instrument has. TRUE = the source gave the list in full. '
  'NULL = loaded before 08/27/2026 — completeness unknown, array may still contain the '
  'literal "..." marker. Never read the array as a complete party list unless TRUE.';

COMMENT ON COLUMN data_lake.lee_deed_official_records.grantees_complete IS
  'FALSE = the SOURCE elided this grantee list (capped at 2 names); the array holds '
  'fewer parties than the instrument has. TRUE = the source gave the list in full. '
  'NULL = loaded before 08/27/2026 — completeness unknown, array may still contain the '
  'literal "..." marker. Never read the array as a complete party list unless TRUE.';

-- Expose to the API role + refresh PostgREST's schema cache (ingest/CLAUDE.md).
GRANT SELECT ON ALL TABLES IN SCHEMA data_lake TO service_role;
NOTIFY pgrst, 'reload schema';
