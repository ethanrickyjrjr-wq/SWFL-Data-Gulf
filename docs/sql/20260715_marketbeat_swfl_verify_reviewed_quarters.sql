-- Migration: flip verified=true for the C&W MarketBeat quarters that passed
-- independent review this session (07/15/2026).
--
-- Two independent reviewers (fresh reads of the source PDFs, no access to the
-- extraction code) spot-checked these rows field-by-field against the PDFs.
-- A real parser bug was found and fixed in the process (extractor.py's
-- "stop at SOUTHWEST FLORIDA TOTAL" check was dead code, letting the loop
-- wander into Key Lease/Sale Transaction tables and overwrite correct rows
-- with garbage via ON CONFLICT) -- these quarters were re-extracted with the
-- fix and re-verified against the reviewers' manually-read figures before
-- this flip.
--
-- Scoped precisely to reviewed quarters only. Every other cw_marketbeat /
-- colliers_industrial / lee_associates row (including 2024-Q1..Q4 industrial,
-- which cannot be re-verified -- their source PDFs are no longer available
-- on the live C&W hub) stays verified=false until it gets its own review.
--
-- Run via: bun scripts/run-migration.ts docs/sql/20260715_marketbeat_swfl_verify_reviewed_quarters.sql

UPDATE data_lake.marketbeat_swfl
SET verified = true
WHERE source_name = 'cw_marketbeat'
  AND (
    (sector = 'industrial' AND quarter IN ('2025-Q1', '2025-Q4', '2026-Q1'))
    OR (sector = 'medical_office' AND quarter IN ('2024-Q3', '2025-Q1', '2025-Q3', '2026-Q1'))
  );

-- Verify
SELECT sector, quarter, verified, COUNT(*) AS n
FROM data_lake.marketbeat_swfl
WHERE source_name = 'cw_marketbeat'
GROUP BY sector, quarter, verified
ORDER BY sector, quarter;
