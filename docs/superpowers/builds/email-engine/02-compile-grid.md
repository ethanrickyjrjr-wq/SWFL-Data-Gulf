# 02 · compile-grid
**Model:** Opus | **Group:** 1 | **deps:** 01 | **owner:** engine

## Goal
Compile a positioned doc (blocks with `layout`) into email-safe HTML using the Cerberus hybrid/fluid pattern: fluid columns that stack to one column on mobile and survive Outlook (ghost tables).

## Research (verified 06/28/2026; re-confirm specifics at build via crawl4ai, RULE 0.4)
- Cerberus hybrid vs responsive: `cerberusemail.com/hybrid-responsive`. Outlook has no media queries → fluid + MSO ghost tables.
- Units: 12 cols / 600px canvas → column px width = `round((w/12)*600)`. `rowHeight 30` advisory; email height is content-driven.

## Files
- NEW `lib/email/compile-grid.ts` — `compileGrid(doc) -> html` via `@react-email/components` Section/Row/Column.
- EDIT `app/api/email-lab/render/route.ts` — when ANY block has `layout`, use `compileGrid`; else keep `EmailDocRenderer` (free tier unchanged).

## Spec
- Group blocks into rows by `layout.y` (after `react-grid-layout/core` compaction); within a row order by `x`; column width from `w`.
- Each cell = a `Column` at its px width; full-bleed blocks span all 12.
- Mobile: Cerberus fluid (max-width + align) so columns stack ≤600px.
- Outlook: MSO ghost tables around multi-column rows.
- Reuse the existing `BlockRenderer` for each block's inner HTML — do NOT reimplement blocks.

## Acceptance
- A 2-column row renders side-by-side (desktop), stacked (mobile), intact in Outlook (ghost tables present).
- A no-`layout` doc still routes to `EmailDocRenderer` unchanged.
- `bunx next build` green.
