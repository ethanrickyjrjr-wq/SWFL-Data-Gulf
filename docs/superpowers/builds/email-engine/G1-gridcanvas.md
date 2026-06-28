# G1 · GridCanvas  (OPERATOR)
**Model:** Sonnet | **Group:** 1 | **deps:** 01 | **owner:** OPERATOR

## Goal
The resizable/movable grid canvas — a NEW build from the research (**react-grid-layout v2**), NOT the existing dnd-kit canvas (that stays as the free-tier fallback for no-`layout` docs).

## Install
`bun add react-grid-layout`

## Files
- NEW `components/email-lab/GridCanvas.tsx` — wrap the existing `CanvasBlock` in RGL v2.

## Config (researched 06/28/2026, RGL README v2)
- `gridConfig: { cols: 12, rowHeight: 30, margin: [8,8] }`
- `width = 600` (email standard — pass fixed, or `useContainerWidth`)
- `dragConfig: { enabled: true, handle: '.drag-handle' }`
- `resizeConfig: { enabled: true, handles: ['se','sw','ne','nw'] }`
- `compactor: verticalCompactor`
- `onLayoutChange` → write the layout back into each `block.layout`
- Aspect-lock on photo blocks (`onResize`: `h = round(w * aspectRatio)`)
- The engine emits initial positions; this renders them + lets the user adjust.

## Acceptance
- Drag moves a block; corner-drag resizes; layout flows into `doc...block.layout`; render preview reflects new columns.
- The free-tier stacked canvas still works for no-`layout` docs.
