-- 20260620_social_user_side_cols.sql
--
-- USER-SIDE seam additions to social_schedules (audit finding, 2026-06-20).
-- The shipped 20260620_social_schema.sql created social_schedules with user_id but
-- omitted two columns the user-side builds (U2/U3/U4) depend on:
--
--   project_id  — project-scope the Social lane exactly like email_schedules.
--                 U4's page.tsx SELECTs `.eq("project_id", id)`; U2/U3 stamp it on insert.
--                 text soft-link to public.projects.id (mirrors email_schedules.project_id, no FK).
--   frozen_post — freeze-on-confirm artifact { caption, media_url, hashtags, freshness_token,
--                 composed_at }. U2 flagged this as a build-01 seam ask that never landed; the
--                 cron worker (build 04) posts it verbatim on first fire, re-composes only when
--                 freshness_token advances.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS. Safe to re-run.
-- Run directly (creds .dlt/secrets.toml) — do NOT hand to the operator (CLAUDE.md RULE 1).

ALTER TABLE public.social_schedules ADD COLUMN IF NOT EXISTS project_id  text;
ALTER TABLE public.social_schedules ADD COLUMN IF NOT EXISTS frozen_post jsonb;

-- Fast project-scoped lookup for the U4 workspace lane.
CREATE INDEX IF NOT EXISTS social_schedules_project_idx
  ON public.social_schedules (project_id)
  WHERE project_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
