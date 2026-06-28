# 05 · listing + multi-column blocks
**Model:** Sonnet | **Group:** 1 | **deps:** 01 | **owner:** engine
**Contention:** touches `doc/types.ts` + `doc/schema.ts` — run AFTER 03 or let the main thread own the shared schema hunk.

## Goal
Add the two blocks every reference is built around: a **listing card** and a **multi-column row**.

## Follow BUILDER-GUIDE §7 recipe for EACH new block
`types.ts` props + `schema.ts` zod + `createBlock` default (`default-docs.ts`) + renderer (`lib/email/blocks/`) + inspector section (`BlockInspector.tsx`) + `BLOCK_MENU` entry (`AddBlockPanel.tsx`) + `applyBrand` branch if brand-bearing. **Preserve the `kind` image tag.**

## Listing card — `lib/email/blocks/ListingBlock.tsx`
- Props: `photoUrl, price, beds, baths, sqft, address, linkUrl?, badge?` ("Virtual Tour").
- Photo auto-pulled from a listing URL via `og-image` (engine) or uploaded; preserve `kind`.
- Renders: photo on top → price (bold) → beds/baths/sqft row with small glyphs → address → optional link/badge.

## Multi-column row — `lib/email/blocks/MultiColumnBlock.tsx`
- Props: `columns: Array<{...}>`, 2–3 columns.
- In the email it defers to compile-grid's fluid-column pattern (build 02); in the canvas it lays children side by side.

## Acceptance
- Add a listing card from the menu; renders with photo + specs + price.
- A 2-col row renders side-by-side (desktop), stacks (mobile).
- `bunx next build` green.
