# SWFL Data Gulf — Charts UI Kit

Linked-view corridor explorer. Real SWFL CRE corridor data
(8 corridors, refreshed 2026-05-22). One selection — clicked anywhere —
focuses every panel.

## Files

| File                       | Role                                                                  |
| -------------------------- | --------------------------------------------------------------------- |
| `index.html`               | Mount point — wires React, sets selected/hover state, palette toggle. |
| `data.jsx`                 | The 8 corridors verbatim from the SWFL CRE source + pack medians + flag types + **3 color palettes** (brand / neutral / standard). |
| `CorridorScatter.jsx`      | Cap rate × vacancy bubble chart. Bubble size = abs(absorption). Click to select. |
| `CorridorMap.jsx`          | Real Lee + Collier polygons (US Census TIGER 2010) with corridors at their actual lat/lon. |
| `CorridorDetail.jsx`       | Full profile for selected corridor — character quote, tenant mix, seasonal index, 4 metrics with deltas vs pack median, active flags. |
| `CorridorTable.jsx`        | Sortable audit table — click row to select, click header to sort.     |
| `UpstreamSplit.jsx`        | Active-flags-by-type horizontal split with the corridors carrying each flag named inline. |
| `charts.css`               | All styles.                                                           |
| `swfl-geo.json`            | Real county polygons + city centroids.                                |

## What's interactive

- **One source of truth.** `selectedId` lives in `App`. Every panel reads
  it and calls `onSelect`. Click a bubble → table row highlights → map
  marker pulses → detail panel swaps.
- **Three palettes.** Toggle top-right.
  - **Brand** — SWFL Data Gulf colors (default).
  - **Neutral** — monochrome stone/slate for print reports.
  - **Standard** — matplotlib `tab10` (green / blue / orange / red),
    the colors most chart libraries use, for slot-into-a-report use.
- **Sortable table.** Click any column header. Click again to reverse.
- **Real geography.** Polygons from US Census TIGER 2010 (public
  domain). City positions are real lat/lon projected through the same
  transform.

## What's real

Every number is from the source:
- Cap rates, vacancy, absorption, asking rent — verbatim from the
  SWFL CRE corridor profiles (fact ids f010-f018).
- Pack medians — facts f006-f009.
- Active flags — text + priority verbatim from the source.
- Character quotes — verbatim, in quotes.
- Verdict + magnitude + confidence — from the OUTPUT block.
- Freshness token — `SWFL-7421-v34-20260522`.

## What's stubbed

- **City lon/lat** for corridor markers are approximations from corridor
  names (e.g. "Immokalee Rd North Naples" → ~26.28°N -81.76°W). For
  production, replace with corridor-centerline geometry from the source.
- **No real chart library.** Plain SVG + CSS transitions. Swap to
  Observable Plot or Visx if you need axes / brushing / tooltips.

## Open it

`ui_kits/charts/index.html`.
