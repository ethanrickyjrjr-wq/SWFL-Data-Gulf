-- 2026-05-15 — Add cap_rate / vacancy_rate metrics to corridor_profiles.
--
-- Per-corridor direction fields (cap_rate_direction, vacancy_rate_direction)
-- match the existing `evolution_direction` editorial pattern: you set them by
-- hand when entering data, rather than relying on a period-over-period diff
-- that doesn't yet have multi-period history to compare against.
--
-- All columns are nullable — the cre-swfl producer treats missing metrics as
-- "corridor not in the direction vote" and emits a caveat, rather than crashing.
--
-- Direction values must match BrainOutputMetric.direction:
--   'rising' | 'falling' | 'stable'

ALTER TABLE corridor_profiles
  ADD COLUMN IF NOT EXISTS cap_rate_pct           numeric,
  ADD COLUMN IF NOT EXISTS cap_rate_direction     text,
  ADD COLUMN IF NOT EXISTS vacancy_rate_pct       numeric,
  ADD COLUMN IF NOT EXISTS vacancy_rate_direction text,
  ADD COLUMN IF NOT EXISTS metrics_period         text,           -- e.g. "2026-Q1"
  ADD COLUMN IF NOT EXISTS metrics_verified_date  date;

-- Direction enum constraints — match BrainOutputMetric.direction exactly.
-- Nullable values pass the check automatically (NULL satisfies any CHECK).
ALTER TABLE corridor_profiles
  ADD CONSTRAINT corridor_profiles_cap_rate_direction_chk
    CHECK (cap_rate_direction IS NULL
           OR cap_rate_direction IN ('rising','falling','stable')),
  ADD CONSTRAINT corridor_profiles_vacancy_rate_direction_chk
    CHECK (vacancy_rate_direction IS NULL
           OR vacancy_rate_direction IN ('rising','falling','stable'));

-- Sanity range: cap rates 0-30%, vacancy 0-100% (paranoid bounds, not realistic
-- targets). Catches accidental entries in basis points (e.g. 650 instead of 6.5).
ALTER TABLE corridor_profiles
  ADD CONSTRAINT corridor_profiles_cap_rate_pct_chk
    CHECK (cap_rate_pct IS NULL OR (cap_rate_pct >= 0 AND cap_rate_pct <= 30)),
  ADD CONSTRAINT corridor_profiles_vacancy_rate_pct_chk
    CHECK (vacancy_rate_pct IS NULL OR (vacancy_rate_pct >= 0 AND vacancy_rate_pct <= 100));

-- Backfill confirmation:
-- After running, you should be able to:
--   SELECT corridor_name, cap_rate_pct, cap_rate_direction,
--          vacancy_rate_pct, vacancy_rate_direction
--   FROM corridor_profiles
--   ORDER BY corridor_name;
-- Rows with NULL metrics will be flagged by the cre-swfl producer's caveats.
