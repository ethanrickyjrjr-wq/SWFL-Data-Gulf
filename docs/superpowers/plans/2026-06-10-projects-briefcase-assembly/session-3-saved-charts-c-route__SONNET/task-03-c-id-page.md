# Task 03 — `app/c/[id]/page.tsx`

**Files:** Create `app/c/[id]/page.tsx`.

**Contract:** server component; reads `saved_charts` by id (anon/public client is fine — public SELECT policy); 404 if missing; renders `<ChartBlockView block={row.chart_block} />` inside a minimal `ReportShell` with the provenance line + freshness token + an "Add to project" button (files `{kind:"chart", chart_id:id, title}` into the draft via the highlighter context, or prompts login to add to a saved project).

- [ ] **Step 1:** Fetch the row server-side; 404 via `notFound()` when absent.
- [ ] **Step 2:** Render `ChartBlockView` (exists), provenance from `source_meta`, and `freshness_token` verbatim (data-protocol-v3 rule 2 — quote it). Reuse `ReportShell`/`Stat` from the report shell.
- [ ] **Step 3: "Add to project"** — client island that calls `ctx.fileItem({kind:"chart", chart_id:id, title})`. (On `/c/[id]` there may be no `HighlighterProvider`; if so, the button writes directly to the `swfl_project_draft_v1` localStorage key via the same helper S1 exposes, or links to `/project/draft`.)
- [ ] **Step 4: Verify** `/c/<id>` renders the chart logged-out; provenance + token visible.
- [ ] **Step 5: Commit.** `git add app/c/[id]/page.tsx && git commit -m "feat(charts): /c/[id] public saved-chart page with provenance + token"`
