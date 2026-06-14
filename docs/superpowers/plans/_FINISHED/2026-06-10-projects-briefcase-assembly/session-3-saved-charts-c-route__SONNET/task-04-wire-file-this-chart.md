# Task 04 — Wire S2's "File this chart" to real save

**Context:** Session 2 left a `// TODO(S3): POST /api/charts/save then ctx.fileItem({kind:'chart', chart_id, title})` marker (the button was disabled). Now `POST /api/charts/save` exists — complete the flow.

**Files:** Modify `components/highlighter/HighlightPopup.tsx` (+ `AskAiDock.tsx` if it also renders the chart).

- [ ] **Step 1:** Replace the marker: on "File this chart", `POST /api/charts/save` with `{ block, source_meta:{report_id}, freshness_token }`; on `{id}`, call `ctx.fileItem({ id: crypto.randomUUID(), added_at: new Date().toISOString(), origin:"web", kind:"chart", chart_id:id, title })`; fire `item_add` meter. Enable the button (remove the disabled state).
- [ ] **Step 2:** Error handling — save fails → toast/inline message, do NOT file a dangling ref.
- [ ] **Step 3: Manual smoke** — ask a rent question → inline chart → "File this chart" → briefcase badge increments → the filed item is `{kind:"chart"}` with a real `chart_id` → `/c/<chart_id>` renders it.
- [ ] **Step 4: Commit, then ship the session** per `../shared/conventions.md`. Build-queue: mark `/c/[id]` sub-item progress.

```bash
git add components/highlighter/HighlightPopup.tsx components/highlighter/AskAiDock.tsx
git commit -m "feat(charts): File-this-chart saves to saved_charts then files chart ref"
```
