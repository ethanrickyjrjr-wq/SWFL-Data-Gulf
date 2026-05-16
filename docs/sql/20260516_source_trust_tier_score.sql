-- =====================================================================
-- 20260516 — Mutable trust_tier_score on source_connectors,
--            plus outcomes.attribution for SGD calibration corpus.
--
-- Spec: docs/arsenal-master-stack.md Pillar 1 §5
--   "Today trust tier is a hardcoded TypeScript literal. Move it to a
--    Supabase column so calibration (item #27 below) can update it without
--    code deploys. Per SM-2, also add an `attribution` jsonb column to
--    `outcomes` so the SGD calibration corpus (Tier 4 #27) builds itself
--    from refine #1 onward — no calendar wait, just an outcome-count gate."
--
-- Companion code: refinery/lib/confidence.mts (attributeError + tierToScore),
-- refinery/stages/4-output.mts (auto-caveat below the 0.6 threshold).
--
-- Prerequisite: the `source_connectors` and `outcomes` tables must already
-- exist in the target Supabase project. This migration is purely additive —
-- ALTER TABLE only — to keep paste-and-run risk minimal. If either table is
-- missing, Postgres will surface a clear "relation does not exist" error and
-- the upstream table-creation migration must run first.
--
-- Paste-and-run: this file is meant for the Supabase SQL editor. There is
-- no `supabase/migrations/` infrastructure in this repo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. source_connectors.trust_tier_score
--
-- Default 0.8 mirrors TIER_SCORE[2] in refinery/lib/confidence.mts — the
-- tier most v1 sources sit at. The CHECK matches the [0, 1] domain the
-- attribution engine relies on; the floor inside the TS function still
-- clamps to 0.01 to keep error_contribution finite if a row drifts to 0.
-- ---------------------------------------------------------------------
ALTER TABLE source_connectors
  ADD COLUMN IF NOT EXISTS trust_tier_score NUMERIC(3, 2)
    NOT NULL DEFAULT 0.8
    CHECK (trust_tier_score BETWEEN 0 AND 1);

COMMENT ON COLUMN source_connectors.trust_tier_score IS
  'Mutable trust weight in [0, 1] used by refinery/lib/confidence.mts. '
  'Seed default 0.8 == TIER_SCORE[tier 2]. The Adaptive Trust Tiers SGD '
  'job (Tier 4 #27) updates this column from the outcomes.attribution '
  'corpus once outcome count crosses the calibration gate (SM-2).';

-- Backfill: derive trust_tier_score from the existing tier column if a
-- source_connectors.trust_tier column exists. Skipped silently when the
-- column is absent so this migration stays safe for greenfield schemas.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'source_connectors'
      AND column_name = 'trust_tier'
  ) THEN
    UPDATE source_connectors
       SET trust_tier_score = CASE trust_tier
                                WHEN 1 THEN 1.00
                                WHEN 2 THEN 0.80
                                WHEN 3 THEN 0.60
                                WHEN 4 THEN 0.40
                                ELSE 0.80
                              END
     WHERE trust_tier_score = 0.80;  -- only rows still on the default
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. outcomes.attribution
--
-- Holds the attribution payload Stage 4 emits when an outcome is
-- recorded. Shape mirrors refinery/lib/confidence.mts AttributionEntry[]:
--   [{"source_id": "...", "trust_tier_score": 0.8, "error_contribution": 0.71}, ...]
-- ordered by error_contribution descending. The SGD job reads the full
-- array (not just the weakest) so it can update every contributing
-- source's score in proportion to its responsibility.
-- ---------------------------------------------------------------------
ALTER TABLE outcomes
  ADD COLUMN IF NOT EXISTS attribution JSONB;

COMMENT ON COLUMN outcomes.attribution IS
  'AttributionEntry[] from refinery/lib/confidence.mts attributeError, '
  'sorted by error_contribution desc. Populated from refine #1 onward so '
  'the SGD calibration corpus accumulates without a calendar wait (SM-2).';

-- Optional GIN index — uncomment when the SGD job starts querying by
-- source_id inside the attribution array; until then a sequential scan
-- is cheaper than maintaining the index.
-- CREATE INDEX IF NOT EXISTS outcomes_attribution_gin_idx
--   ON outcomes USING GIN (attribution jsonb_path_ops);
