# Task 01 — `saved_charts` table (idempotent SQL)

**Files:** Create `docs/sql/20260611_saved_charts.sql`. Run it yourself (creds in `.dlt/secrets.toml`).

- [ ] **Step 1: Write the migration** (per boards spec §1; RLS ON, public SELECT, service-role write — mirror the existing waitlist/usage_events grant pattern):

```sql
-- 20260611_saved_charts.sql — anonymous, shareable saved chart. Idempotent.
CREATE TABLE IF NOT EXISTS public.saved_charts (
  id              text PRIMARY KEY,
  chart_block     jsonb NOT NULL,
  source_meta     jsonb,
  freshness_token text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_charts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY saved_charts_public_select ON public.saved_charts FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- writes go through service_role only (no anon/authenticated INSERT policy)
GRANT SELECT ON public.saved_charts TO anon, authenticated;
GRANT ALL    ON public.saved_charts TO service_role;
```

- [ ] **Step 2: Apply + reload PostgREST schema** (per `feedback_dlt-postgrest-grant`):

```bash
python -c "import psycopg, ...; conn.execute(open('docs/sql/20260611_saved_charts.sql').read()); conn.execute(\"NOTIFY pgrst,'reload schema'\"); conn.commit(); print('ok')"
```

- [ ] **Step 3: Verify** the table + policy exist (query `pg_policies` for `saved_charts_public_select`).

- [ ] **Step 4: Commit.** `git add docs/sql/20260611_saved_charts.sql && git commit -m "feat(charts): saved_charts table (public select, service-role write)"`
