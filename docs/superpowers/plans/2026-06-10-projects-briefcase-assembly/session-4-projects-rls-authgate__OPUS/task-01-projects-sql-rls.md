# Task 01 — `public.projects` + the first `auth.uid()` RLS policy

**Files:** Create `docs/sql/20260612_projects.sql`. Run it yourself. **This is the first row-level-security policy in the repo** (audit confirmed zero `auth.uid()` policies exist) — get it exactly right.

- [ ] **Step 1: Write the migration** (idempotent; `duplicate_object` guards; both `USING` and `WITH CHECK`):

```sql
-- 20260612_projects.sql — per-user projects with RLS. Idempotent.
CREATE TABLE IF NOT EXISTS public.projects (
  id          text PRIMARY KEY,
  user_id     uuid NOT NULL,
  title       text,
  items       jsonb NOT NULL DEFAULT '[]'::jsonb,
  branding    jsonb,
  mcp_key     text UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY projects_owner_all ON public.projects
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

REVOKE ALL ON public.projects FROM anon;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT  ALL ON public.projects TO service_role;  -- MCP/build lane only (S6/S9), never the cookie API
```

- [ ] **Step 2: Apply + reload schema** (`NOTIFY pgrst,'reload schema'`).

- [ ] **Step 3: Verify the policy is FOR ALL with both clauses:**

```bash
python -c "import psycopg, ...; print(conn.execute(\"select polname, polcmd, pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid) from pg_policy where polrelid='public.projects'::regclass\").fetchall())"
```

Expect `projects_owner_all`, cmd `*` (ALL), both quals = `(auth.uid() = user_id)`.

- [ ] **Step 4: Commit.** `git add docs/sql/20260612_projects.sql && git commit -m "feat(projects): projects table + FIRST auth.uid() RLS policy"`

> The runtime proof that RLS actually denies cross-user reads is Task 06 (two real accounts) — do NOT close `projects_rls_live_verify` on this SQL alone (`feedback_checks-prod-evidence-not-dev-attestation`).
