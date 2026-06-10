# Task 03 — `POST /api/projects/import` (anonymous draft → first project)

**Context:** the anonymous briefcase lives in `localStorage swfl_project_draft_v1` (S1) as a `ProjectItem[]` — the SAME shape as `projects.items`, so migration is a straight insert (no transform).

**Files:** Create `app/api/projects/import/route.ts`. Client change in `app/project/[id]/page.tsx` or a post-login hook to POST the draft then clear localStorage.

- [ ] **Step 1:** Route requires a session; body `{ items: ProjectItem[], title? }`; `projectItemsSchema.parse` (422 on bad); insert a new project owned by `user.id`; return `{id}`.
- [ ] **Step 2: Client migration** — after login, if `swfl_project_draft_v1` is non-empty, POST it to `/api/projects/import`, then `localStorage.removeItem("swfl_project_draft_v1")` and redirect to `/project/<id>`. Do this in an event/callback (post-auth), **not** a render-effect that setStates (react-hooks rule).
- [ ] **Step 3: Verify** — file items anonymously → log in → the items appear as a new saved project → localStorage draft cleared.
- [ ] **Step 4: Commit.** `git add app/api/projects/import/route.ts && git commit -m "feat(projects): import anonymous draft to first owned project on login"`
