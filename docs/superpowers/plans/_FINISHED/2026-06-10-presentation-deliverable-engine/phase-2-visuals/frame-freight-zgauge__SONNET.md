# Phase 2d — Frame: Freight Nowcast z-gauge · SONNET · PARALLEL (after 2a)

> **Contract (inherited):** own ChartSpec registry; per-visual as-of; PROVENANCE never prose-policed;
> NO `git push`. Depends on **Phase 2a**. Independent of the other 4 frames.

## Design source
`SWFL-Visuals-UI-Kit.html` visual **#04 — Freight nowcast** (FDOT z-score gauge, 9 segments, 90-day rolling).

## Data source
`traffic-swfl` brain. Note: FDOT `tfctr` is a **percent already divided by 100 at source** — read the
z-score / index as written, do not re-scale.

## 2-pre data-availability check (DO FIRST — ~30 min)
Confirm `traffic-swfl` emits a z-score / single-metric-vs-baseline shape across segments. If absent,
**park** + note in README.

## Task
1. `components/charts/registry/frames/ZGaugeFrame.tsx` taking `{ spec: ChartSpec }` — a gauge / bullet
   visual for "single metric vs target/baseline" (z-score around 0). Parameterize segment count + range
   via `spec.options` so it's reusable for any z-score/index metric, not just freight.
2. Register with `accepts: ["single-vs-target"]`.
3. Fixture-bind; stamp `spec.asOf`; render the as-of caption.

## Acceptance
- Renders from a fixture spec; gauge reflects the z-value vs baseline; as-of caption present; `tsc`
  clean; data-adapter test.

## Wrap
Commit locally. SESSION_LOG + build-queue. Update README status row 2d. **No push.**
