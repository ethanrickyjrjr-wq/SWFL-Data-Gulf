# Session 4 — `public.projects` + first RLS + first gated route  ·  **OPUS**  ·  ~2–2.5 days

> Read `../shared/conventions.md`, `../shared/data-model.md`, `../AUDIT.md`. **Why Opus:** this writes the codebase's **first `auth.uid() = user_id` RLS policy** and its **first gated route**. The named top risk: a middleware regression locks public pages. Cross-user leakage is the moat-breaker. Both demand the careful tier.

**Goal:** Persist projects per-user with RLS, expose CRUD via cookie-scoped API routes (RLS applies — never service-role here), migrate the anonymous localStorage draft on login, render `/project/[id]` (+ list), gate `/project/*` behind auth (but `/project/draft` stays public).

**Architecture:** `projects(id, user_id, title, items jsonb, branding jsonb, mcp_key text UNIQUE, created_at, updated_at)`; RLS `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`; `GRANT … TO authenticated`, `REVOKE ALL FROM anon`. API routes use the **cookie client** (`utils/supabase/server.ts`) so RLS enforces ownership. A service-role lane exists only for MCP/build (later sessions). `middleware.ts` gates only the `/project` prefix via Supabase `getUser()`.

**Tasks (in order):**
- [ ] `task-01-projects-sql-rls.md` — table + the first `auth.uid()` policy (idempotent, `duplicate_object` guard)
- [ ] `task-02-projects-api-routes.md` — `/api/projects` (POST), `/api/projects/[id]` (GET/PATCH/DELETE), cookie client, zod-validate items
- [ ] `task-03-import-draft-migration.md` — `/api/projects/import` (localStorage draft → first project row)
- [ ] `task-04-project-pages.md` — `/project/[id]` (+ `/project` list) inline item render + branding edit + freshness-age badges `[ADDED]`
- [ ] `task-05-middleware-gate-and-next-fix.md` — gate `/project/*`; **`[AUDIT-FIX C1]`** thread `next` through login-form
- [ ] `task-06-two-account-live-verify.md` — two magic-link accounts, cross-read DENIED; close `projects_rls_live_verify`

**Files:** new `docs/sql/20260612_projects.sql` · `app/api/projects/route.ts` · `app/api/projects/[id]/route.ts` · `app/api/projects/import/route.ts` · `app/project/[id]/page.tsx` · `app/project/page.tsx` · `middleware.ts` · `app/login/login-form.tsx`

**Depends on:** S1 (`ProjectItem` + localStorage draft), S3 (chart ref render).

**Vendor-First (WebFetch in-session):** Supabase SSR middleware-auth pattern + `@supabase/ssr` ~0.10.x `getUser()` API. Wrong call = locked public pages.

**Risk:** middleware regression → **gate ONLY the `/project` prefix**, add a route test, AND the two-account live deny test before closing the check.

**Diff-review gate:** YES — touches `middleware.ts` (could change every page's auth behavior). Show the operator the middleware + login-form diff before pushing.
