# 03 · author-engine
**Model:** Opus | **Group:** 1 | **deps:** 01 | **owner:** engine
**Contention:** touches `doc/schema.ts` — serialize with 05.

## Goal
Grow `build-doc.ts` from word-patcher → document AUTHOR. The model returns a full doc (blocks + content + grid `layout`) assembled from a bounded real-data MENU. It NEVER writes a number (selects from the menu) and NEVER writes brand (`applyBrand` overlays). Keeps the no-invention moat and every existing path.

## Files
- EDIT `lib/email/build-doc.ts` — add an `author` path beside `buildContentDoc`: resolve menu (`fetchLakeContext` + `buildChartForQuestion` + `og-image`), call the model with menu + block vocabulary + grid dims, get a full doc, gate it.
- EDIT `lib/email/doc/schema.ts` — add `AuthorDocSchema` (content + `layout`; NO brand/style fields), beside `ContentPatchSchema`.
- EDIT `app/api/email-lab/ai/route.ts` — route `mode:"author"` (or `build:true`) to the author path; keep patch + per-block paths unchanged.

## Spec
- Model selects data points by id from the menu (mirror `lib/assistant/compose-chart.ts`) — never emits raw numbers.
- Model emits block list + per-block `layout {x,y,w,h}`; positions snapped/compacted via `react-grid-layout/core` (`verticalCompactor`) server-side.
- Gate: `EmailDocSchema` + no-invention lint (the `gateNarrative` philosophy, `lib/deliverable/build.ts`). Reject→repair.
- Brand: author never writes `globalStyle` or brand props; `EmailLabShell`'s `applyBrand` overlays after (free-tier behavior preserved).
- Template-fill: given `templateId`, start from the pre-positioned template doc (build 06) and fill slots.

## Acceptance
- "luxury report for 34102 with my Alico listing" → a positioned doc (hero photo + headline + stats + chart + listing card).
- Every number traces to the menu (no-invention lint passes).
- Brand still applied via `applyBrand`; existing content-patch + per-block fill still work.
- `bunx next build` green.
