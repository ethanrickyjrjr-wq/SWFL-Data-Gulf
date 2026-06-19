-- Qualitative event queue — stores scored real-world events (openings, closings, permits,
-- construction starts) matched to projects by radius and brand significance.
-- Schema is the scaffold: permits_swfl is the first live source; news_crawl, google_places_delta,
-- operator_manual plug in with zero schema change.

-- project_type columns on projects table (optional, AI-inferred over time)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS derived_project_type text;

CREATE TABLE IF NOT EXISTS project_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_name       text NOT NULL,
  entity_brand_key  text,
  event_type        text NOT NULL,
  event_date        date NOT NULL,
  lat               numeric,
  lng               numeric,
  distance_miles    numeric,
  brand_tier        smallint,
  brand_weight      numeric,
  final_score       numeric,
  radius_band       text,
  notify_user       boolean NOT NULL DEFAULT false,
  inject_ai         boolean NOT NULL DEFAULT false,
  ai_summary        text,
  headline          text,
  source            text NOT NULL,
  source_url        text,
  suppressed_reason text,
  notified_at       timestamptz,
  injected_at       timestamptz,
  dismissed_at      timestamptz,
  cooldown_until    timestamptz,
  geocode_source    text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_events_project_id
  ON project_events(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS project_events_notify
  ON project_events(project_id, notify_user, notified_at)
  WHERE notify_user = true AND notified_at IS NULL;

CREATE INDEX IF NOT EXISTS project_events_ai
  ON project_events(project_id, inject_ai, final_score DESC, dismissed_at)
  WHERE inject_ai = true;

CREATE INDEX IF NOT EXISTS project_events_cooldown
  ON project_events(project_id, entity_brand_key, event_type, cooldown_until)
  WHERE cooldown_until IS NOT NULL;
