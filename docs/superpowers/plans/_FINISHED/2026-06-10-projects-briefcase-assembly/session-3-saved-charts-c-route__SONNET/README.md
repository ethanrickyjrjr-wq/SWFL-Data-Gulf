# Session 3 — `saved_charts` table + `/c/[id]` page  ·  **SONNET**  ·  ~1 day

> Read `../shared/conventions.md`, `../AUDIT.md`. This is boards-spec part 1 **as written** (names unchanged: `saved_charts`, `/c/[id]`, `/api/charts/save`). Verified net-new: no `saved_charts` table and no `/c/` route exist today.

**Goal:** Persist a linted `ChartBlock` to a public, shareable `saved_charts` row; render it at `/c/[id]`; wire Session 2's "File this chart" to actually save then file `{kind:"chart", chart_id}`.

**Architecture:** `id` is a short server-generated slug (`crypto.randomUUID().slice(0,8)`). Public SELECT (unguessable id, same trust model the boards spec set — acceptable here because saved charts are public *market* data, not client-specific; contrast deliverables in S6 which need ≥122-bit slugs per `[LB-R5]`), service-role writes (copy the waitlist GRANT pattern). Lint on save → 422 on structural fail (never persist a malformed block).

**`[LB-R4]` Authoritative numbers:** the `chart_block` jsonb stored here is the **frozen single source of truth** for a saved chart's numbers. `computeMetricChart` (`refinery/lib/chart-from-metrics.mts`) is the live `/r/` render and is NEVER the source for a saved/filed chart — once saved, the block is frozen and the `ProjectItem`'s `chart_id` always reads it back from `saved_charts`. The two paths cannot diverge because a filed chart is never recomputed.

**Tasks (in order):**
- [x] `task-01-saved-charts-sql.md` — idempotent SQL + RLS public-select + service-role grant
- [x] `task-02-charts-save-route.md` — `POST /api/charts/save` (lint → 422 / insert → `{id}` + meter `chart_save`)
- [x] `task-03-c-id-page.md` — `app/c/[id]/page.tsx` renders `ChartBlockView` + provenance + token + "Add to project"
- [x] `task-04-wire-file-this-chart.md` — replace S2's `TODO(S3)` marker; save then `ctx.fileItem({kind:'chart'})`

**Files:** new `docs/sql/20260611_saved_charts.sql` · `app/api/charts/save/route.ts` · `app/c/[id]/page.tsx` · `components/highlighter/HighlightPopup.tsx` (+dock) — replace the S2 TODO.

**Depends on:** S2 (the inline chart block + "File this chart" button).

**Risk:** public-read abuse → unguessable ids + the existing IP rate-limiter; meter `chart_save`.

**Diff-review gate:** none beyond the standard (new public read route — note it to the operator). Standard ship checklist.
