# Phase 0 — VERIFY THE BASE CASE (render-only) · OPUS · SERIAL, FIRST

> **Contract (inherited from README):** Engine = own ChartSpec registry (not Vega-Lite). NO `git push`
> — Ricky pushes. This phase writes NO product code — it is a smoke test.

## Why
Before scaling the chart system into a deliverable engine, prove the **server-rendered** chart path
actually renders in a browser. SESSION_LOG flags the in-chat S2 charts as "code-complete but NOT
browser-tested" — we will not build a presentation engine on an unverified renderer.

## Task
1. Start the app (`bun dev` / the project's dev command). Confirm it boots.
2. Open 2–3 report pages `/r/[slug]` (e.g. `/r/housing-swfl`, `/r/macro-swfl`). Confirm the
   at-a-glance chart renders — a real bar chart, not a blank area or the error boundary swallowing it
   (`components/charts/ReportChart.tsx` has a boundary that renders `null` on failure — watch for a
   silently missing chart).
3. Open `/r/cre-swfl`. Confirm `CREMarketBeatChart` renders and its sector/metric tabs work.
4. Capture screenshots of each.

## Scope guard (FLAG-2)
- These `/r/` charts are **fixture-backed by operator decision**. A green Phase 0 proves **RENDER
  ONLY** — it is **NOT** proof of live-data binding. Live binding is **Phase 3's** exit criteria.
  State this in your report; do not claim "charts work with live data."
- The **inline-chat SSE chart** (`lib/build-chart-for-intent.mts` → `/api/converse`) is **out of scope**
  here — it is off the revenue critical path.

## Exit criteria
- Screenshots of real charts rendering on `/r/[slug]` and `/r/cre-swfl`.
- A short written verdict: which pages render, which don't.
- **If a chart is broken:** that fix becomes the new Phase 1 (do it before the as-of keystone). Report
  the failure mode (console error, empty `computeMetricChart`, boundary catch) — don't paper over it.

## Recommendation to surface
If the inline-chat charts are found broken, recommend **flag-gating or deleting** that router rather
than fixing it — it's off the paid path and carrying it is pure maintenance tax.

## Wrap
- No code change → likely no commit. If you flag-gate a broken inline router, commit locally only.
- Update README status board row 0. **No push.**
