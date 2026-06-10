# Phase 2b — Frame: Franchise Survival · SONNET · PARALLEL (after 2a)

> **Contract (inherited from README):** own ChartSpec registry; per-visual as-of on every frame;
> `asOf`/`source` are PROVENANCE (never prose-policed); NO `git push` — Ricky pushes. Depends on
> **Phase 2a** (`ChartSpec` + `CHART_REGISTRY` + `FrameRenderer`). Independent of the other 4 frames.

## Design source
`SWFL-Visuals-UI-Kit.html` visual **#02 — Franchise survival** (14 brands, 169 SBA loans, ranked bars).
Open it alongside while porting; match its look (it's the brand design).

## Data source
`franchise-outcomes` brain. Survival rates are **stated over resolved loans** — read them as written,
never recompute from raw counts (data-protocol rule 4).

## 2-pre data-availability check (DO FIRST — ~30 min)
Confirm `franchise-outcomes` actually emits ranked per-brand survival in its `BrainOutput`
(`detail_tables` or `key_metrics`). If the shape isn't there, **park this frame** (note it in the README
status row) — do not build a decorative chart with no data behind it.

## Task
1. Build `components/charts/registry/frames/FranchiseSurvivalFrame.tsx` — a ranked horizontal-bar
   component taking `{ spec: ChartSpec }`. Reuse `HBarChart` if it fits; only fork if the survival
   framing (per-brand, survival %, loan count tooltip) needs more.
2. Register it in `CHART_REGISTRY` with `accepts: ["ranked-categories"]`.
3. Bind from a fixture for now (Phase 3 wires live). Stamp `spec.asOf` from the brain freshness; render
   the bottom as-of caption (inherited from Phase 1 render pattern).

## Acceptance
- Renders from a fixture spec via `FrameRenderer`; bars ranked; as-of caption present; `tsc` clean.
- A render test (pure-function or fixture) — repo has no DOM test env, so test the data-adapter
  function, not the React tree (mirror the S1/S2 testing deviation).

## Wrap
Commit locally. SESSION_LOG + build-queue. Update README status row 2b. **No push.**
