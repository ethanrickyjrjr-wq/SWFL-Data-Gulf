-- 20260531_grading_loop.sql
-- Phase 1 of the prediction grading loop — the flywheel's missing edge.
--
-- RUN THIS IN SUPABASE STUDIO. It is NOT auto-run by any Claude session (operator decree).
-- IDEMPOTENT: safe to run more than once (IF NOT EXISTS throughout).
--
-- Schema only. The companion code changes ship separately:
--   * refinery/vocab/brain-vocabulary.json  — per-slug `grade` blocks
--   * refinery/vocab/loader.mts              — resolveGradeConfig(slug)
--   * refinery/lib/metric-observations-log.mts (new) — snapshot hook
--   * refinery/lib/predictions-log.mts       — deriveGradeFields + persist
--   * refinery/grade/grade-predictions.mts (new) — the deterministic grader (Phase 2)
--
-- DESIGN NOTE: the per-slug grading RULE (window_days / epsilon / grade_basis /
-- direction_polarity) lives in the vocabulary and is read LIVE at grade time — it is
-- NOT a column here. This migration stores only durable, queryable, vintage-stamped
-- STATE: the metric time-series, the gradeable fields on each prediction, and the
-- numeric immutable verdict on each outcome.

BEGIN;

-- 1. metric_observations -------------------------------------------------------
-- The clean per-slug time-series the grader diffs the window-end value against.
-- Populated from EACH brain's rebuild (not master-only): if a slug drops out of
-- master's curated key_metrics it must stay gradeable while the leaf still emits it.
--   * observed_at = DATA VINTAGE (the brain's refined_at / source as-of), never now().
--   * (slug, brain_id, observed_at) UNIQUE  -> re-runs are no-ops, AND master's
--     re-surfaced copy of a leaf slug coexists with the leaf's authoritative row;
--     the grader resolves the owning leaf brain at read time.
CREATE TABLE IF NOT EXISTS metric_observations (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug        TEXT        NOT NULL,
  brain_id    TEXT        NOT NULL,
  value       NUMERIC     NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  source_url  TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS metric_observations_uidx
  ON metric_observations (slug, brain_id, observed_at);
CREATE INDEX IF NOT EXISTS metric_observations_slug_time_idx
  ON metric_observations (slug, observed_at DESC);
GRANT SELECT, INSERT ON metric_observations TO service_role;

-- 2. predictions ---------------------------------------------------------------
-- Persist the gradeable structure logPrediction currently THROWS AWAY, plus the
-- fields the grader queues on. window_end_date is computed at capture time as
-- refined_at + resolveGradeConfig(gradeable_slug).window_days and pinned here.
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS conditional_claims  JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS gradeable_slug      TEXT;     -- numeric basis_ref slug, or NULL
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS baseline_value      NUMERIC;  -- slug value at refine time (pinned, immutable)
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS predicted_direction TEXT;     -- bullish | bearish (neutral/mixed -> ungradeable)
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS window_end_date     DATE;     -- concrete grade-ready date, or NULL
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS grade_status        TEXT NOT NULL DEFAULT 'pending';
  -- grade_status in: pending | gradeable | ungradeable | pending_data | graded
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS grade_method        TEXT NOT NULL DEFAULT 'machine';
  -- grade_method in: machine | operator
CREATE INDEX IF NOT EXISTS predictions_grade_queue_idx
  ON predictions (grade_status, window_end_date);

-- 3. outcomes ------------------------------------------------------------------
-- Numeric + vintage-stamped + immutable. Existing actual_value/delta/correction_notes
-- (TEXT) stay for operator-graded prose; the grader writes observed_value::text into
-- actual_value to satisfy its NOT NULL.
--   * grade_config snapshots the EXACT resolved rule (window_days / epsilon /
--     epsilon_mode / grade_basis / direction_polarity) used for THIS verdict, so a
--     later vocab retune can never silently rewrite a banked grade.
--   * partial UNIQUE (one machine grade per prediction) makes the grader idempotent
--     and the verdict immutable — never UPDATE a graded row.
ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS predicted_direction TEXT;
ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS observed_direction  TEXT;
ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS baseline_value      NUMERIC;
ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS observed_value      NUMERIC;
ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS direction_correct   BOOLEAN;
ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS error               NUMERIC;   -- magnitude error (Phase 1.5)
ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS source_url          TEXT;      -- vintage receipt
ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS graded_at           TIMESTAMPTZ;
ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS grade_method        TEXT;      -- machine | operator
ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS grade_config        JSONB;     -- resolved rule snapshot (audit)
CREATE UNIQUE INDEX IF NOT EXISTS outcomes_machine_uidx
  ON outcomes (prediction_id) WHERE grade_method = 'machine';

COMMIT;

-- Verify after running:
--   SELECT to_regclass('public.metric_observations');                                  -- not null
--   SELECT column_name FROM information_schema.columns WHERE table_name='predictions' ORDER BY 1;
--   SELECT column_name FROM information_schema.columns WHERE table_name='outcomes'     ORDER BY 1;
