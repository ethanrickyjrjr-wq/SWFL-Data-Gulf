# Session 2 — Charts Tier B glue + in-chat charts  ·  **SONNET**  ·  ~2 days

> Read `../shared/conventions.md`, `../AUDIT.md` first. **`[AUDIT-FIX C2]`** is the first task — the source plan misread where rent/vacancy data comes from. **`[AUDIT-FIX C3/C4/C5]`**: `ChartBlockView` already exists (import it), import `ChartBlock` from `refinery/validate/chart-block-lint.mts`, and HBarChart is already responsive (`clamp()` shipped) so you only add a `compact` prop.

**Goal:** Wire the existing `routeChart` intent classifier (which has **no consumer** today) to data sources, emit an inline chart ahead of the streamed text answer in `/api/converse`, and render it compactly in the popup + dock with a "File this chart" button (pending until S3 saves it).

**Architecture:** new `lib/build-chart-for-intent.mts` maps a `ChartIntent` → `{ block: ChartBlock }` | `{ component: "zhvi"; data }` | `null`. `/api/converse` calls `routeChart(question)` before the LLM and emits one SSE `chart` frame ahead of text; failure skips silently (a chart never blocks an answer). The LLM never touches chart numbers. Every block passes `lintChartBlock`.

**Chart sources — fixture-first, as-of date is sufficient (operator decree 2026-06-10):** All Tier-B chart scopes ship from fixture data with an as-of date label — no live-brain precondition, no `freshness_token` required on chart items. Phase 2 ships: `CorridorRentChart` (bar, `corridor-rents.json`), `ZHVIAreaChart` (area, ZHVI fixture), `CorridorMarketScatter` (scatter, rents fixture), and `vacancy` (bar, rents fixture). Task 01 locates all fixture paths; Task 02 wires them **and** repairs ChartBlockView's area + scatter renderers (currently stub to HTML table). `flood-aal` stays on the live env-brain path (unchanged). See task-01.

**`[LB-R4]` Single source of truth for chart NUMBERS:** two chart paths exist — `computeMetricChart` (`refinery/lib/chart-from-metrics.mts`, on-the-fly for `/r/` pages) and the persisted `chart_block` jsonb in `saved_charts` (S3). They MUST NOT diverge: `computeMetricChart` is the **live render only**; the moment a chart is *saved/filed*, its block is **frozen into `saved_charts`** and the `ProjectItem` references that frozen `chart_id` — a filed chart is never recomputed. Live = recompute; filed = frozen snapshot. State this in `buildChartForIntent`'s doc comment so a future dev doesn't wire a filed chart back through `computeMetricChart`.

**Tasks (read in order):**
- [x] `task-01-locate-rent-vacancy-datapath.md` — **`[AUDIT-FIX C2]`** locate all fixture data paths (asking-rent, zhvi, corridor-scatter, vacancy, flood-aal) + confirm ChartBlockView stubs
- [x] `task-02-build-chart-for-intent.md` — `lib/build-chart-for-intent.mts` (all 4 fixture scopes + flood-aal), lint every block; wire area + scatter renderers in `ChartBlockView`
- [x] `task-03-converse-chart-frame.md` — `routeChart` before LLM + SSE `chart` frame
- [x] `task-04-client-onchart.md` — `onChart` in sse/converse/use-converse; render `ChartBlockView` compact; HBarChart `compact` prop
- [x] `task-05-chart-this-chip.md` — "Chart this" chip in `suggestions.ts`

**Files:** new `lib/build-chart-for-intent.mts` · `lib/route-chart.ts` (read) · `app/api/converse/route.ts` · `lib/highlighter/{sse,converse,use-converse}.ts` · `components/highlighter/HighlightPopup.tsx` + `AskAiDock.tsx` · `components/charts/HBarChart.tsx` (add `compact`) · `lib/highlighter/suggestions.ts`

**Depends on:** S0 (metering), S1 (`fileItem` for "File this chart" — the chart_id arrives in S3; until then the button files a pending local block or is disabled).

**Risk:** `routeChart` false positives → the inline chart is **dismissible**, and the answer text is independent; tighten keywords with tests.

**Diff-review gate:** YES — this changes the live `/api/converse` SSE response. **Ask the operator for a diff review before pushing.**
