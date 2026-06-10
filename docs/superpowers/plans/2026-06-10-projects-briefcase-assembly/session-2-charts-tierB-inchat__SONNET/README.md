# Session 2 — Charts Tier B glue + in-chat charts  ·  **SONNET**  ·  ~2 days

> Read `../shared/conventions.md`, `../AUDIT.md` first. **`[AUDIT-FIX C2]`** is the first task — the source plan misread where rent/vacancy data comes from. **`[AUDIT-FIX C3/C4/C5]`**: `ChartBlockView` already exists (import it), import `ChartBlock` from `refinery/validate/chart-block-lint.mts`, and HBarChart is already responsive (`clamp()` shipped) so you only add a `compact` prop.

**Goal:** Wire the existing `routeChart` intent classifier (which has **no consumer** today) to data sources, emit an inline chart ahead of the streamed text answer in `/api/converse`, and render it compactly in the popup + dock with a "File this chart" button (pending until S3 saves it).

**Architecture:** new `lib/build-chart-for-intent.mts` maps a `ChartIntent` → `{ block: ChartBlock }` | `{ component: "zhvi"; data }` | `null`. `/api/converse` calls `routeChart(question)` before the LLM and emits one SSE `chart` frame ahead of text; failure skips silently (a chart never blocks an answer). The LLM never touches chart numbers. Every block passes `lintChartBlock`.

**`[LB-R1]` Live-source-only:** rent → the live `rentals-swfl`/ZORI brain (NOT the `corridor-rents.json` fixture — a fixture chart cannot honestly carry a `freshness_token`); vacancy → DEFERRED (no live residential source). See task-01.

**`[LB-R4]` Single source of truth for chart NUMBERS:** two chart paths exist — `computeMetricChart` (`refinery/lib/chart-from-metrics.mts`, on-the-fly for `/r/` pages) and the persisted `chart_block` jsonb in `saved_charts` (S3). They MUST NOT diverge: `computeMetricChart` is the **live render only**; the moment a chart is *saved/filed*, its block is **frozen into `saved_charts`** and the `ProjectItem` references that frozen `chart_id` — a filed chart is never recomputed. Live = recompute; filed = frozen snapshot. State this in `buildChartForIntent`'s doc comment so a future dev doesn't wire a filed chart back through `computeMetricChart`.

**Tasks (read in order):**
- [ ] `task-01-locate-rent-vacancy-datapath.md` — **`[AUDIT-FIX C2]`** find the REAL rent/vacancy source (it's a fixture, not a `corridor_profiles` column)
- [ ] `task-02-build-chart-for-intent.md` — `lib/build-chart-for-intent.mts`, lint every block
- [ ] `task-03-converse-chart-frame.md` — `routeChart` before LLM + SSE `chart` frame
- [ ] `task-04-client-onchart.md` — `onChart` in sse/converse/use-converse; render `ChartBlockView` compact; HBarChart `compact` prop
- [ ] `task-05-chart-this-chip.md` — "Chart this" chip in `suggestions.ts`

**Files:** new `lib/build-chart-for-intent.mts` · `lib/route-chart.ts` (read) · `app/api/converse/route.ts` · `lib/highlighter/{sse,converse,use-converse}.ts` · `components/highlighter/HighlightPopup.tsx` + `AskAiDock.tsx` · `components/charts/HBarChart.tsx` (add `compact`) · `lib/highlighter/suggestions.ts`

**Depends on:** S0 (metering), S1 (`fileItem` for "File this chart" — the chart_id arrives in S3; until then the button files a pending local block or is disabled).

**Risk:** `routeChart` false positives → the inline chart is **dismissible**, and the answer text is independent; tighten keywords with tests.

**Diff-review gate:** YES — this changes the live `/api/converse` SSE response. **Ask the operator for a diff review before pushing.**
