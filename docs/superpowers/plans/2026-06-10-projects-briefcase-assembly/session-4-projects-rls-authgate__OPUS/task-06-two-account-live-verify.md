# Task 06 — Two-account live RLS verify + close `projects_rls_live_verify`

**Why:** the RLS policy is only *proven* by a real cross-user denial in prod. This is the first RLS in the codebase — verify it for real (`feedback_checks-prod-evidence-not-dev-attestation`).

- [ ] **Step 1: Ship** the session (after the operator's diff-review OK on middleware/login-form), per `../shared/conventions.md`.
- [ ] **Step 2: Account A** — magic-link login, create a project, note its `id`. Confirm `/project/<id>` renders for A.
- [ ] **Step 3: Account B** (second email) — log in, then GET `/api/projects/<A's id>` and visit `/project/<A's id>`. **Expected: 404 / empty (RLS denies).** If B can read A's project, RLS is broken — STOP, fix, do not close.
- [ ] **Step 4: Anon** — hit `/project/<A's id>` logged-out → redirected to `/login?next=…`. `/project/draft` → public.
- [ ] **Step 5: Import** — anonymous draft (file items logged-out) → log in as A → draft becomes a project, localStorage cleared. Confirm `project_create`/`item_add` meter rows landed.
- [ ] **Step 6: Close** with evidence:

```bash
node scripts/check.mjs close projects_rls_live_verify "prod: acct B cross-read of acct A project DENIED (404); anon gated; draft import works; meter rows present"
```

Build-queue: `/project` + RLS sub-item → `[x]`.
