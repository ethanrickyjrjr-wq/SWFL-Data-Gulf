# Phase 2g — `pickFramesForData` deterministic mapper · OPUS · parallel-ok with 2b–2f

> ⛔ **SUPERSEDED by `phase-2g-pick-frames-mapper__OPUS-v2.md` — DO NOT BUILD FROM THIS FILE.**
> The shipped picker (`642c17f`) is a **hardcoded priority ladder returning one `FrameCandidate | null`**,
> NOT a registry-`accepts` scan. The "map each shape to a frameId whose `accepts` includes it" design
> below was the v1 build (`7323a8b`) and caused a fixture-bound frame to fire on generic data. Read v2.

> **Contract (inherited):** own ChartSpec registry; per-visual as-of; NO `git push`. Depends only on
> **Phase 2a** (`ChartSpec` + `CHART_REGISTRY`) — may run alongside the frame ports.

## Why
The AI should classify intent + select frames, never compute chart numbers or write chart code. A
deterministic data-shape → frame mapper covers the common cases cheaply; the LLM only escalates on
genuine ambiguity.

## Task
Create `components/charts/registry/pick-frames.ts`:
```ts
export function pickFramesForData(
  detail_tables: BrainOutputDetailTable[] | undefined,
  key_metrics: BrainOutputMetric[],
): { frameId: string; reason: string }[]
```
Map data shape → frame using the dashboard best-practice rules:
- change-over-time (a date/period column) → **area/line** (`zhvi`/area frame)
- ranked discrete categories (one numeric col over a label col, ≥3 rows) → **bar** (`HBarChart`)
- two numeric variables to relate → **scatter** (`CorridorMarketScatter`)
- parts-of-whole (segments summing to a total) → **composition** (flood-composition frame, Phase 2c)
- single metric vs target/benchmark → **single-vs-target** (freight z-gauge, Phase 2d)
- events over time → **timeline** (storm-claims, Phase 2f)

Reuse the existing shape heuristics in `refinery/lib/chart-from-metrics.mts` (`chartFromDetailTable`
already picks the first numeric column over ≥3 rows; generalize that logic, don't duplicate it). Match
each shape to a `frameId` whose `accepts` includes that `DataShape`.

## Acceptance
- Unit tests: feed representative `detail_tables`/`key_metrics` fixtures → assert the expected
  `frameId` set (time-series fixture → area; ranked fixture → bar; two-numeric → scatter; segmented →
  composition). Unknown/empty → `[]` (caller falls back to prose, no crash).
- `tsc --noEmit` clean.

## Wrap
- Commit locally. SESSION_LOG + build-queue. Update README status row 2g. **No push.**
