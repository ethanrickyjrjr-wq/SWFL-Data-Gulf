# Phase 1 — KEYSTONE: self-anchoring charts (`asOf` on `ChartBlock`) · OPUS · SERIAL, EXCLUSIVE

> **Contract (inherited):** own ChartSpec registry; per-visual as-of; `asOf`/`source` are PROVENANCE
> (never prose-policed); NO `git push` — Ricky pushes. **This phase lifts the shared `ChartBlock`
> type — run it EXCLUSIVE: no other session may edit chart producers concurrently (atomic type-lift,
> BrainFactory rule 3).**

## Why
Today `ChartBlock` has no date field — the rent chart smuggles the as-of into its title string; others
show bare numbers. Without a real `asOf` field, no chart (chat- or `/r/`-built) can travel honestly
into a project file. This single field is the keystone the whole deliverable engine stands on.

## Files (re-grep line numbers first — hints only)
- `refinery/validate/chart-block-lint.mts` — `ChartBlock` interface (~`:52`), `lintChartBlock` (~`:94`).
- `refinery/lib/chart-from-metrics.mts` — `computeMetricChart` (producer for `/r/` charts; ~`:29` imports `type ChartBlock`).
- `lib/build-chart-for-intent.mts` — the 4 chat builders (`buildRentChart` etc.).
- `components/charts/ChartBlockView.tsx`, `HBarChart.tsx` — render the caption.

## Task (all in ONE atomic change — no window where a producer omits the field)
1. **Type:** add to `ChartBlock`:
   ```ts
   asOf: string;                                   // ISO date, e.g. "2026-06-10"
   source?: { citation: string; url?: string };    // optional provenance for the caption
   ```
2. **Backfill every producer in the same change:**
   - `computeMetricChart`: set `asOf` from the source table's freshness (the detail_table / key_metric
     source's `fetched_at` or the brain `freshness`/`refinedAt`). Pick the **newest** contributing
     source's date for a single-vintage block.
   - The 4 chat builders in `build-chart-for-intent.mts`: set `asOf` and **stop putting the date in the
     title string** (e.g. `"… — Jun 2026"` comes out of the title, into `asOf`).
3. **Lint (STRUCTURAL-ONLY):** extend `lintChartBlock` to require `asOf` present + ISO-date shape for
   **deliverable-bound** blocks. Keep it **warn-only** for legacy `/r/` blocks (back-compat) so the
   nightly render doesn't start failing. **FLAG-3 — do NOT** run `asOf`/`source.citation` through
   facts-only-lint, smoothing-lint, or `sanitizeProse` content policing. The check is presence/format
   only; the citation string is provenance, exempt by the permanent linter rule.
4. **Render:** add a small bottom caption in the chart components — monospace, dimmed (~11px), **NOT in
   the title** — showing `as of {asOf}` (+ short source label if present). Per
   `docs/superpowers/specs/2026-06-10-chart-as-of-anchoring.md`: uniform-vintage = one caption; the
   field is never stripped, the template decides loudness.

## Acceptance
- `bun test refinery/validate/chart-block-lint.test.mts` green incl. new `asOf` structural cases
  (missing → error for deliverable blocks; malformed date → error; present ISO → ok; citation text with
  jargon → NOT flagged).
- `/r/` charts and chat charts visually show the bottom-caption date; titles no longer carry the date.
- `tsc --noEmit` clean across producers (type-lift compiles everywhere).

## Wrap
- Commit locally. SESSION_LOG entry + build-queue. Update README status row 1. **No push.**
