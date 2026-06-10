# Task 04 — `/project/[id]` + `/project` list (+ freshness-age badges `[ADDED]`)

**Files:** Create `app/project/[id]/page.tsx`, `app/project/page.tsx`. Reuse `ReportShell` + locked hexes + `Stat`/`ChartBlockView`.

- [ ] **Step 1: `/project` list** — the user's projects (cookie client / RLS), each linking to `/project/[id]`, with a "New project" action.
- [ ] **Step 2: `/project/[id]` item rendering** — render each `ProjectItem` inline by kind:
  - `chart` → join `saved_charts` by `chart_id`, render `ChartBlockView`
  - `metric` → `Stat` (value + source line)
  - `qa` → prose (question + answer)
  - `report` → a card linking `/r/[slug]`
  - `note` → plain text · `source` → a labeled link row · `table_slice` → a small table · `file` → (S8 renders these; until then show a placeholder)
- [ ] **Step 3: Reorder / remove** items (PATCH the `items` array) and a **branding edit form** (agent name/photo/license/brokerage → `projects.branding`).
- [ ] **Step 4: As-of date (SCOPED DOWN — operator 2026-06-10).** For each item carrying a `freshness_token` (format `SWFL-7421-v{n}-{YYYYMMDD}`), show the parsed **as-of date** plainly. Do NOT build a relative-age/"may have updated" badge or a refresh affordance — overkill for v1 (users build over days/weeks). The token stays pinned (moat); live-refresh is a higher-tier future feature. Never silently re-fetch.
- [ ] **Step 5: "Build deliverable" (S6) + "Save as PDF" (S5) buttons** — render them now, wired in their sessions (leave `// TODO(S5)` / `// TODO(S6)` markers).
- [ ] **Step 6: Verify** logged-in render of a seeded project with mixed item kinds; reorder/remove persists; branding saves.
- [ ] **Step 7: Commit.** `git add "app/project/[id]/page.tsx" app/project/page.tsx && git commit -m "feat(projects): project list + detail render (inline items, branding, freshness-age)"`
