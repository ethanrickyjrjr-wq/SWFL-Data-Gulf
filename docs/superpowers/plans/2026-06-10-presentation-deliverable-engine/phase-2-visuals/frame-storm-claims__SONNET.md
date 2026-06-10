# Phase 2f — Frame: Storm Claims Timeline · SONNET · PARALLEL (after 2a)

> **Contract (inherited):** own ChartSpec registry; per-visual as-of; PROVENANCE never prose-policed;
> NO `git push`. Depends on **Phase 2a**. Independent of the other 4 frames.

## Design source
`SWFL-Visuals-UI-Kit.html` visual **#06 — Storm claims timeline** (NFIP paid claims per named storm).

## Data source
`env-swfl` brain (NFIP paid claims by storm/event).

## 2-pre data-availability check (DO FIRST — ~30 min)
Confirm `env-swfl` emits per-storm paid-claim events (event label + date + amount). If absent, **park**
+ note in README.

## Task
1. `components/charts/registry/frames/TimelineFrame.tsx` taking `{ spec: ChartSpec }` — events over
   time (named markers + magnitude). Parameterize via `spec.options` so it's a reusable event-timeline,
   not storm-specific.
2. Register with `accepts: ["timeline"]`.
3. Fixture-bind; stamp `spec.asOf`; render the as-of caption.

## Acceptance
- Renders from a fixture spec; events placed in time with magnitude; as-of caption present; `tsc`
  clean; data-adapter test.

## Wrap
Commit locally. SESSION_LOG + build-queue. Update README status row 2f. **No push.**
