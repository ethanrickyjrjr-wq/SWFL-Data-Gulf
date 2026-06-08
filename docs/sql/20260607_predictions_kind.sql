-- 20260607_predictions_kind.sql
-- The Glass §6-A — per-slug leaf prediction logging (the gradeable-yield multiplier).
--
-- Adds a discriminator so the predictions ledger can hold BOTH master's synthesized
-- top-line call ('synthesis') AND per-slug directional sub-calls from any brain
-- ('slug'). Internal-ledger-only — changes no customer-facing answer; The Glass
-- Pane 2 groups slug sub-calls under the master headline, and grade_accuracy_by_slug
-- already dedups by (slug, baseline, window_end).
--
-- RUN DIRECTLY (CLAUDE.md RULE 1). IDEMPOTENT: ADD COLUMN / CREATE INDEX IF NOT
-- EXISTS. Default 'synthesis' leaves every existing row unchanged.

BEGIN;

ALTER TABLE predictions
  ADD COLUMN IF NOT EXISTS prediction_kind TEXT NOT NULL DEFAULT 'synthesis';

-- Enforce the two-value domain (idempotent: drop-if-exists then add).
ALTER TABLE predictions DROP CONSTRAINT IF EXISTS predictions_prediction_kind_chk;
ALTER TABLE predictions
  ADD CONSTRAINT predictions_prediction_kind_chk
  CHECK (prediction_kind IN ('synthesis', 'slug'));

-- Cadence guard read path: "is there an OPEN slug prediction for (brain, slug)
-- whose window hasn't closed?" — the non-overlap discipline that stops a persistent
-- z-score from being re-logged every night and inflating skill by autocorrelation.
CREATE INDEX IF NOT EXISTS predictions_brain_slug_window_idx
  ON predictions (brain_id, gradeable_slug, window_end_date);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verify:
--   SELECT prediction_kind, count(*) FROM predictions GROUP BY prediction_kind;  -- all 'synthesis' pre-A3
