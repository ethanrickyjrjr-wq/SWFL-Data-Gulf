-- 2026-07-21 · project_activity — INSERT policy + authenticated grant
-- Applied to prod via Supabase MCP apply_migration
-- (name: project_activity_insert_policy_and_grant). Mirrored here so prod is
-- not silent-drift vs the repo.
--
-- BUG (email_lab_project_activity_rls_insert_missing): project_activity shipped
-- 2026-06-19 (docs/sql/20260619_project_activity.sql) with an owner SELECT
-- policy but (a) no INSERT policy AND (b) — discovered 2026-07-21 — no table
-- grants to the `authenticated` role at all. Every logActivity() call site
-- passes the cookie (authenticated) client, so every INSERT was rejected by RLS
-- and silently swallowed by logActivity's try/catch. The read path
-- (page.tsx -> readRecentActivity, also the cookie client) was likewise dead:
-- with no SELECT grant the owner SELECT policy could never be reached, so it
-- returned [] every time. The table has therefore held no real row for any
-- project since it shipped.
--
-- POSTURE: project_activity is a user-owned app table (same class as projects,
-- project_feed, contacts, email_*) — cookie-client owner-RLS WITH grants, NOT a
-- service-role/data_lake table. Sibling project_feed carries
-- project_feed_owner_all (USING + WITH CHECK) and grants SELECT/INSERT/UPDATE to
-- authenticated. project_activity was half-built: SELECT policy present, grants
-- and INSERT policy missing. This completes it to its class. It is append-only,
-- so ONLY SELECT + INSERT are granted (no UPDATE/DELETE).
--
-- Verified post-apply as the `authenticated` role (MCP bypasses RLS, so the
-- checks impersonate the role via SET LOCAL role + request.jwt.claims in a
-- begin/rollback):
--   * owner INSERT into an owned project    -> success, row SELECT-able back
--   * owner INSERT into a non-owned project -> ERROR 42501 "new row violates
--     row-level security policy for table project_activity"
--   * owner SELECT on an owned project      -> returns the row (read path live)

GRANT SELECT, INSERT ON public.project_activity TO authenticated;

DROP POLICY IF EXISTS "owner can insert project_activity" ON public.project_activity;
CREATE POLICY "owner can insert project_activity"
  ON public.project_activity FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = project_activity.project_id
        AND projects.user_id = (select auth.uid())
    )
  );
