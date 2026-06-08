-- 20260607_backtest_grades.sql
-- The Glass — §2 flywheel backtest engine. The retrodicted-grade corpus.
--
-- Companion code: refinery/tools/flywheel-backtest.mts (the as-of grid harness) +
-- refinery/lib/backtest/grid.mts (pure PIT/grade math). This table holds grades
-- the system WOULD have earned on point-in-time-honest history (ALFRED LAUS
-- vintages), so Panes 3/4 of The Glass have a calibration corpus before a single
-- LIVE outcome resolves.
--
-- HARD WALL (flywheel guardrail 2 + The Glass honesty guardrail 2): retrodicted
-- grades live in their OWN table, never in predictions/outcomes. grade_method is
-- CHECK-pinned to 'retrodicted' so a row here can never be mistaken for a live
-- verdict, and §3's Scoreboard reads this table SEPARATELY from outcomes and never
-- blends the two into one figure. A retrodicted % is NEVER a public accuracy claim.
--
-- RUN THIS IN SUPABASE directly (CLAUDE.md RULE 1 — a session runs migrations, the
-- operator does not). IDEMPOTENT: CREATE … IF NOT EXISTS throughout, so re-running
-- is a no-op. Re-running the grid UPSERTs on the natural key.
--
-- ACCESS: GRANT to service_role only — The Glass is an INTERNAL page (ops repo reads
-- with the service-role key on the same project). NOT anon/authenticated: an
-- internal retrodicted number must never widen public exposure (guardrail 3).

BEGIN;

CREATE TABLE IF NOT EXISTS public.backtest_grades (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ── pinned contract (docs/superpowers/specs/2026-06-07-the-glass-build-decomposition.md) ──
  slug                TEXT         NOT NULL CHECK (length(slug) > 0),
  as_of_date          DATE         NOT NULL,
  predicted_direction TEXT         NOT NULL CHECK (predicted_direction IN ('bullish', 'bearish')),
  baseline_value      NUMERIC      NOT NULL,
  window_end_date     DATE         NOT NULL,
  observed_value      NUMERIC      NOT NULL,
  grade               TEXT         NOT NULL CHECK (grade IN ('hit', 'miss', 'partial', 'neutral')),
  magnitude_error     NUMERIC,
  confidence          NUMERIC(4, 3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  grade_method        TEXT         NOT NULL DEFAULT 'retrodicted' CHECK (grade_method = 'retrodicted'),
  -- ── additive audit columns (do not violate the contract; §3 selects by name) ──
  family              TEXT,        -- e.g. 'laus_lee' — the effective-N grouping for skill scoring
  prior_value         NUMERIC,     -- the delta-basis baseline the call was made against
  window_days         INTEGER,     -- echoed from the resolved grade-config
  observed_direction  TEXT         CHECK (observed_direction IS NULL OR observed_direction IN ('bullish', 'bearish', 'neutral')),
  source_tag          TEXT         NOT NULL DEFAULT 'lake_tier1',
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Idempotency: one graded call per (slug, as_of_date, grade_method). The harness
-- upserts on this index, so a re-run refreshes rather than dupes.
CREATE UNIQUE INDEX IF NOT EXISTS backtest_grades_natural_uidx
  ON public.backtest_grades (slug, as_of_date, grade_method);

CREATE INDEX IF NOT EXISTS backtest_grades_slug_idx  ON public.backtest_grades (slug);
CREATE INDEX IF NOT EXISTS backtest_grades_as_of_idx ON public.backtest_grades (as_of_date);

GRANT SELECT, INSERT, UPDATE ON public.backtest_grades TO service_role;

COMMIT;

-- PostgREST exposes the new table to the service-role client only after a schema reload.
NOTIFY pgrst, 'reload schema';

-- Verify after running:
--   SELECT count(*) FROM public.backtest_grades;                       -- 0 before first grid run
--   SELECT slug, count(*) FROM public.backtest_grades GROUP BY slug;   -- per-slug N after a run
