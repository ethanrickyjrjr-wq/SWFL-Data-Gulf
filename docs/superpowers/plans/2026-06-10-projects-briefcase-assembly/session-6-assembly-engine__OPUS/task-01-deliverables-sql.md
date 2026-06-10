# Task 01 — `deliverables` table (idempotent SQL)

**Files:** Create `docs/sql/20260613_deliverables.sql`. Run it yourself.

**Trust model `[LB-R5]`:** public SELECT by **unguessable slug**, service-role writes (build runs server-side after the cookie client proves project ownership). `items_snapshot` deep-copies so the deliverable is frozen. **Unlike `saved_charts` (public market data), a deliverable carries agent branding + client-specific content** — so the slug must be strong: `id` = a **full-entropy** token (≥122 bits), e.g. `crypto.randomUUID()` (no `.slice`) or `crypto.randomBytes(16).toString("base64url")`. **Do NOT use `randomUUID().slice(0,8)` (32 bits — enumerable).** Public-SELECT is justified as link=capability (share with a non-logged-in client — the core product rail), made safe by the strong slug + `/p/*` rate limiting (task-05) + owner revoke→410 (S7). It is a bounded, deliberate exception — see `../AUDIT.md` R5.

- [ ] **Step 1: Write the migration:**

```sql
-- 20260613_deliverables.sql — assembled deliverable, frozen snapshot. Idempotent.
CREATE TABLE IF NOT EXISTS public.deliverables (
  id              text PRIMARY KEY,          -- unguessable slug
  project_id      text NOT NULL,
  user_id         uuid NOT NULL,
  template        text NOT NULL,
  instruction     text,
  narrative       jsonb NOT NULL,            -- { exec_summary, sections:[{title,intro}], inference_notes:[] }
  items_snapshot  jsonb NOT NULL,            -- deep copy of items + resolved chart blocks at build time
  branding        jsonb,
  status          text NOT NULL DEFAULT 'ready',  -- ready | building | revoked (S7)
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deliverables ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY deliverables_public_select ON public.deliverables FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT ON public.deliverables TO anon, authenticated;
GRANT ALL    ON public.deliverables TO service_role;
```

- [ ] **Step 2: Apply + `NOTIFY pgrst,'reload schema'`; verify** table + policy.
- [ ] **Step 3: Commit.** `git add docs/sql/20260613_deliverables.sql && git commit -m "feat(deliverable): deliverables table (frozen snapshot, public slug select)"`
