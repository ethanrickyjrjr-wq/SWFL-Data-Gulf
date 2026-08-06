# SWFL Data Gulf — Web Report UI Kit

Hi-fi recreation of the `/r/{report_id}` web report page from the
SWFL Data Gulf brief. Shows the **master report** in all three tiers.

## Files

| File              | Role                                                                    |
| ----------------- | ----------------------------------------------------------------------- |
| `index.html`      | Mount point — wires React + Babel and the three tier views.             |
| `data.jsx`        | Canonical `MASTER_REPORT` fixture (verbatim from `01-product-brief.md`) + the inline `Icon` component (Lucide subset) + number formatters. |
| `components.jsx`  | `Header`, `TierTabs`, `Verdict`, `Conclusion`, `MetricRow`, `Drivers`, `Caveats`, `Upstream`. |
| `views.jsx`       | `GlanceView` (Tier 1), `ReportView` (Tier 2 — default), `AuditView` (Tier 3). |
| `report.css`      | Page-specific layout — header, sticky chrome, table grid, audit table, motion keyframes. |

## What's interactive

- **Tier tabs** — Glance / Report / Audit. Crossfade by remount + 250ms keyframe.
- **Animations toggle** in the header — flips `localStorage["swfl.animations"]`.
  When off, entry animations are skipped; the page renders instantly.
- **Caveat block** — expand/collapse with chevron glyph.
- **Source link hover** — 1px underline fades in (120ms).

## What's stubbed

- The data is the single canonical master report — no fetch, no other reports.
- Audit table sample sizes are placeholder values per metric.
- Map / chart surfaces from `03-surface-recipes.md` are not in this kit —
  the report kit focuses on the text-and-table chrome. (A future
  `ui_kits/report-with-map/` could layer those in.)
- Hurricane-season probability isn't formatted as a gauge; it's a row.

## Open it

`ui_kits/report/index.html` — the Tier 2 ("Report") view is default.
