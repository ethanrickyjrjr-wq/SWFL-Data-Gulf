# Task 04 — Client `onChart` + render `ChartBlockView` compact + HBarChart `compact` prop

**Context (verified):** `lib/highlighter/sse.ts` has `parseSSEFrames()` (text/done/reach/answered/error). `lib/highlighter/converse.ts` exposes handlers `onText/onReach/onFollowups/onAnswered/onError/onDone` — **no `onChart`**. `use-converse.ts` wraps them. `ChartBlockView` (`components/charts/ChartBlockView.tsx`) **exists** — import it. HBarChart has no `compact` prop yet (`[AUDIT-FIX C5]`: it IS already responsive via `clamp()`; just add a density toggle).

**Files:**
- Modify: `lib/highlighter/sse.ts`, `converse.ts`, `use-converse.ts`
- Modify: `components/highlighter/HighlightPopup.tsx`, `AskAiDock.tsx`
- Modify: `components/charts/HBarChart.tsx` (add `compact?: boolean`)

- [ ] **Step 1: Parse the `chart` frame.** In `sse.ts`, extend `parseSSEFrames` to recognize a frame whose JSON has a `chart` key and surface it as a `{ type: "chart", chart }` event. In `converse.ts`, add an `onChart?(chart)` handler and call it. In `use-converse.ts`, expose `chart` state (the last chart received) + reset it on a new ask.

- [ ] **Step 2: Add `compact` to HBarChart.** `compact?: boolean` (default false). When true, tighten the `clamp()` ranges / font sizes for the in-popup width. Keep the existing fluid behavior; `compact` only shrinks the floors. Do not touch the gsap animation (Session 5 handles the print frame).

- [ ] **Step 3: Render in popup + dock.** Above the streamed text, when `chart` is present render `<ChartBlockView block={chart.block} />` (or `<ZHVIAreaChart … />` when `chart.component === "zhvi"`) in a dismissible container with a "File this chart" button. The chart is dismissible (× hides it) — covers the false-positive risk.

- [ ] **Step 4: "File this chart" wiring (pending until S3).** S3 creates `POST /api/charts/save` returning `{id}`. Until S3 ships, the button either (a) is disabled with a "saving lands next session" tooltip, or (b) files a local `{kind:"chart"}` placeholder. Choose (a) to avoid orphan refs. Leave a `// TODO(S3): POST /api/charts/save then ctx.fileItem({kind:'chart', chart_id, title})` marker — S3 task-04 replaces it.

- [ ] **Step 5: Tests + smoke.** Unit-test `parseSSEFrames` recognizes a `chart` frame. Manual: rent question → bar chart renders above prose; ZHVI question → area chart; off-scope → no chart, text only; malformed block → not rendered (lint rejected server-side in Task 02).

- [ ] **Step 6: Commit.**

```bash
git add lib/highlighter/sse.ts lib/highlighter/converse.ts lib/highlighter/use-converse.ts components/highlighter/HighlightPopup.tsx components/highlighter/AskAiDock.tsx components/charts/HBarChart.tsx
git commit -m "feat(charts): client onChart + compact ChartBlockView render in popup/dock"
```
