# Phase 2e — Frame: Seasonal Radial · SONNET · PARALLEL (after 2a)

> **Contract (inherited):** own ChartSpec registry; per-visual as-of; PROVENANCE never prose-policed;
> NO `git push`. Depends on **Phase 2a**. Independent of the other 4 frames.

## Design source
`SWFL-Visuals-UI-Kit.html` visual **#05 — Seasonal radial** (corridor seasonality index 0.10 → 0.88).

## Data source
`cre-swfl` brain (corridor seasonality). Note: cre-swfl can hang at stage 3 without LLM egress when
**rebuilding** — irrelevant here (you read its already-built output), but don't trigger a rebuild.

## 2-pre data-availability check (DO FIRST — ~30 min)
Confirm `cre-swfl` emits a per-corridor seasonality index (cyclical/periodic values). If absent,
**park** + note in README.

## Task
1. `components/charts/registry/frames/SeasonalRadialFrame.tsx` taking `{ spec: ChartSpec }` — a radial /
   polar chart of a cyclical index. Parameterize categories + value range via `spec.options`.
2. Register with `accepts: ["time-series"]` (cyclical/periodic) — or add a `"cyclical"` `DataShape` in
   2a if the mapper needs to distinguish it (coordinate with the 2a/2g owner before adding a shape).
3. Fixture-bind; stamp `spec.asOf`; render the as-of caption.

## Acceptance
- Renders from a fixture spec; radial reflects the index; as-of caption present; `tsc` clean;
  data-adapter test.

## Wrap
Commit locally. SESSION_LOG + build-queue. Update README status row 2e. **No push.**
