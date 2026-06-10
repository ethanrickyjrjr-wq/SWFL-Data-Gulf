# Phase 2c — Frame: Flood / Composition · SONNET · PARALLEL (after 2a)

> **Contract (inherited):** own ChartSpec registry; per-visual as-of; `asOf`/`source` PROVENANCE
> (never prose-policed); NO `git push`. Depends on **Phase 2a**. Independent of the other 4 frames.

## Design source
`SWFL-Visuals-UI-Kit.html` visual **#03 — Flood exposure** (Lee SFHA + V/VE composition, 357× multiplier).

## IMPORTANT — build it GENERIC (operator decree)
Port this as a **reusable composition frame** (segments of a whole + a magnitude callout), **NOT a
flood-specific one**. The composition-bar pattern is valuable across domains. Name it
`CompositionFrame`, parameterize the segments + the callout via `spec.options`. Flood is just the first
binding.

## Data source
`env-swfl` brain (flood/SFHA composition). Note env-swfl has **no `detail_tables`** for some cuts — the
2-pre check matters here.

## 2-pre data-availability check (DO FIRST — ~30 min)
Confirm `env-swfl` emits a parts-of-whole shape (segments + total, e.g. SFHA vs V/VE share) in
`BrainOutput`. If absent, **park** and note in README — don't fabricate segments.

## Task
1. `components/charts/registry/frames/CompositionFrame.tsx` taking `{ spec: ChartSpec }` — stacked/
   segmented composition bar + a magnitude callout (the "357×" style emphasis), all from `spec`.
2. Register with `accepts: ["composition"]`.
3. Fixture-bind for now; stamp `spec.asOf`; render the as-of caption.

## Acceptance
- Renders generically from a fixture spec (segments + callout driven by `spec.options`, not hardcoded
  to flood); as-of caption present; `tsc` clean; data-adapter test.

## Wrap
Commit locally. SESSION_LOG + build-queue. Update README status row 2c. **No push.**
