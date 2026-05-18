-- =====================================================================
-- data_lake.fdot_freight_nowcast_shock_log
-- =====================================================================
-- Append-only shock state log for the `logistics-swfl-nowcast` brain.
--
-- PRECEDENT: this is the FIRST mutable analytical table under data_lake.*.
-- The 5-rule Data Tier Policy (CLAUDE.md §"Data Tier Policy") treats Tier 2
-- (`data_lake.*`) as a working cache for brain-validated baselines. Most
-- Tier 2 tables are replace-load caches (FAF5, FHFA HPI, FDOT AADT). This
-- table breaks that pattern intentionally:
--
--   1. Append-only — every refinery run for `logistics-swfl-nowcast` adds
--      ONE row carrying (refined_at, deviation_z, shock_state,
--      baseline_validity_flag, consecutive_breach_days). No updates, no
--      deletes. The brain reads the last N rows to compute consecutive-day
--      counters.
--   2. Brain-first ingest gate is honored — the consuming brain ships in
--      the same PR (Lane 2D). No row will ever land here without a refinery
--      run, and refinery runs don't happen without a deployable pack.
--   3. Cost is negligible — one INSERT per run × 1 daily run = ~365
--      rows/year. Index on (refined_at DESC) keeps the LAST-90 read O(log n).
--
-- The alternative (stage-file mutable state at
-- `refinery/stages/_state/logistics-swfl-nowcast.consecutive.json`) was
-- rejected: filesystem mutable state has no precedent in the refinery, would
-- not survive container restarts, and would not be visible from any other
-- Vercel function. Tier 2 is the right home.
--
-- READER: refinery/sources/fdot-freight-source.mts (live mode, last 90 rows)
-- WRITER: refinery/packs/logistics-swfl-nowcast.mts (one INSERT per refinery
--         run, fires from the outputProducer's stateful counter computation).
--
-- TIER: 2 (Postgres data_lake). service_role needs SELECT + INSERT (the
-- refinery never UPDATEs or DELETEs against this table).
-- =====================================================================


-- ---------------------------------------------------------------------
-- Schema + grants. service_role is brain-platform's Supabase key role.
-- ---------------------------------------------------------------------
GRANT USAGE ON SCHEMA data_lake TO service_role;


-- ---------------------------------------------------------------------
-- data_lake.fdot_freight_nowcast_shock_log
-- ---------------------------------------------------------------------
-- One row per refinery run for `logistics-swfl-nowcast`. The brain reads the
-- last ~90 rows to compute the consecutive-day breach counter (3d = anomaly,
-- 30d = structural_break candidate, 90d = baseline_validity_flag flips to
-- stale-structural).
--
-- Columns:
--   refined_at                  ISO 8601 timestamp the brain was refined (mirror
--                               of BrainOutput.refined_at; primary sort key).
--   deviation_z                 Path B: (current_activity - rolling_mean) /
--                               rolling_stddev, where rolling_* come from the
--                               last ROLLING_WINDOW_DAYS rows of this same table.
--                               NULL on cold-start runs (history_days_observed
--                               below COLD_START_THRESHOLD_DAYS).
--   shock_state                 "normal" | "anomaly" | "structural_break" |
--                               "insufficient_history". Categorical metric the
--                               brain emits in OUTPUT.
--   baseline_validity_flag      "valid" | "stale-structural". Once "stale-structural"
--                               fires it stays sticky for the duration of the chain
--                               — downstream consumers read the most recent row to
--                               see the current flag state.
--   consecutive_breach_days     Integer count of consecutive prior refines (incl.
--                               this one) where |deviation_z| > 3 AND z sign matched
--                               the previous run. Reset to 0 on |z| <= 3, sign flip,
--                               or cold-start (z suppressed).
--   current_activity_tons_year  Annualized freight ACTIVITY proxy this run
--                               computed (Σ AADT × tfctr × payload × 365 — no
--                               segment-length factor under Path B). NULL on
--                               cold-start runs. THIS is the column the brain
--                               re-reads to recompute the rolling mean/stddev.
--   faf5_inbound_flow_tons_year FAF5-derived inbound freight FLOW (context only).
--                               NOT used in the deviation math (Path B). NULL when
--                               the upstream logistics-swfl brain is unavailable.
--
-- Path B (2026-05-18) migration: v1 columns `current_tons_year` and
-- `baseline_tons_year` are renamed to `current_activity_tons_year` and
-- `faf5_inbound_flow_tons_year` respectively. The semantic shift is documented
-- in refinery/packs/logistics-swfl-nowcast.mts header. If applying this DDL to
-- an existing v1 table, drop and recreate (the table has no historic readers
-- — the writer ships in the same PR as Path B).
--
-- No PK is declared — refined_at is monotonic per-run and serves as the natural
-- ordering. Two refinery runs in the same millisecond would collide (vanishingly
-- rare), but if they ever do, both rows are kept (append-only, no conflict
-- resolution needed for this brain's read pattern).

CREATE TABLE IF NOT EXISTS data_lake.fdot_freight_nowcast_shock_log (
  refined_at                  TIMESTAMPTZ NOT NULL,
  deviation_z                 DOUBLE PRECISION,
  shock_state                 TEXT NOT NULL CHECK (shock_state IN ('normal','anomaly','structural_break','insufficient_history')),
  baseline_validity_flag      TEXT NOT NULL CHECK (baseline_validity_flag IN ('valid','stale-structural')),
  consecutive_breach_days     INTEGER NOT NULL DEFAULT 0,
  current_activity_tons_year  DOUBLE PRECISION,
  faf5_inbound_flow_tons_year DOUBLE PRECISION
);

-- Index supports the brain's primary read: LAST 90 rows ORDER BY refined_at DESC.
CREATE INDEX IF NOT EXISTS fdot_freight_nowcast_shock_log_refined_at_idx
  ON data_lake.fdot_freight_nowcast_shock_log (refined_at DESC);

GRANT SELECT ON data_lake.fdot_freight_nowcast_shock_log TO service_role;
GRANT INSERT ON data_lake.fdot_freight_nowcast_shock_log TO service_role;
