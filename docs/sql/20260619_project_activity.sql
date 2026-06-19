-- project_activity: append-only log of everything significant that happens to a project.
-- User actions, system events, external signals — all write here. The AI reads from one
-- place. One briefing. One source of truth.
-- Phase 0 of significance-weighted-project-ai-context spec (2026-06-18).

CREATE TABLE IF NOT EXISTS project_activity (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  actor         text NOT NULL CHECK (actor IN ('user', 'system', 'ai', 'external')),
  summary       text NOT NULL,
  detail        jsonb,
  significance  smallint NOT NULL DEFAULT 5 CHECK (significance BETWEEN 1 AND 10),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Primary read pattern: newest significant rows for a project (AI context fetch).
CREATE INDEX IF NOT EXISTS project_activity_project_sig
  ON project_activity(project_id, significance DESC, created_at DESC);

-- RLS: a user can only read activity for their own projects.
ALTER TABLE project_activity ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "owner can read project_activity"
    ON project_activity FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = project_activity.project_id
          AND projects.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Service role bypasses RLS (used by server-side logActivity helper).
-- No write policy needed for users — all writes are server-side via service role.
