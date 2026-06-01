-- 20260601_city_pulse_corridors.sql — weekly corridor-grain current-events facts (Build #2).
-- Mirrors data_lake.city_pulse (docs/sql/2026-05-30_city_pulse.sql) at corridor grain, with Build #1's
-- story_key (docs/sql/20260531_city_pulse_story_key.sql) folded into the CREATE — this table is greenfield,
-- so it ships keyed from row zero (no ALTER history to replay).
-- One row per distilled fact; TTL + dedup + story-supersession all operate at fact grain (the flywheel).
-- Written by ingest/pipelines/city_pulse_corridors/distill.py (psycopg, non-dlt, SYNCHRONOUS distill).
-- Read by refinery/sources/corridor-pulse-source.mts via getSupabase().schema("data_lake").
-- Plan: C:/Users/ethan/.claude/plans/plan-this-out-what-abstract-starlight.md
-- Idempotent: CREATE TABLE / CREATE INDEX IF NOT EXISTS. Run via psycopg per RULE 1; verify count after.

CREATE TABLE IF NOT EXISTS data_lake.city_pulse_corridors (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  corridor      TEXT        NOT NULL,   -- corridor_profiles.corridor_name (live runtime authority)
  topic         TEXT        NOT NULL,   -- breaking|transactions|development|business|structural
  fact          TEXT        NOT NULL,   -- distilled claim, numbers verbatim
  source_url    TEXT        NOT NULL,   -- backs the metric source receipt
  source_title  TEXT,
  cited_text    TEXT,                   -- <=150-char span from the web_search / Firecrawl citation
  captured_at   TIMESTAMPTZ NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,   -- captured_at + TTL(topic) — drives the flywheel
  dedup_key     TEXT        NOT NULL,   -- sha256(corridor|normalize_url(source_url)) — matches distill.dedup_key()
  story_key     TEXT,                   -- content-aware supersession slug (Build #1 parity)
  superseded_by BIGINT      REFERENCES data_lake.city_pulse_corridors(id),  -- self-FK, NO ACTION
  run_at        TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS city_pulse_corridors_dedup_uidx
  ON data_lake.city_pulse_corridors (dedup_key);

CREATE INDEX IF NOT EXISTS city_pulse_corridors_live_idx
  ON data_lake.city_pulse_corridors (corridor, topic, expires_at);

-- Serves the grounding read (corridor=? AND superseded_by IS NULL AND story_key IS NOT NULL)
-- and the reader filter. Partial: only live, keyed rows. The reconcile head CTE also reads superseded
-- rows, so it will NOT use this partial index — fine at this table's size.
CREATE INDEX IF NOT EXISTS city_pulse_corridors_story_live_idx
  ON data_lake.city_pulse_corridors (corridor, story_key)
  WHERE superseded_by IS NULL AND story_key IS NOT NULL;

GRANT SELECT ON data_lake.city_pulse_corridors TO service_role;  -- brain-platform read key (read-only)
