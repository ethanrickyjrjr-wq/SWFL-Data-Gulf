# 01 · doc-contract
**Model:** Sonnet | **Group:** 0 | **deps:** none | **owner:** engine

## Goal
Add an OPTIONAL grid position to every block. Backward-compatible: a block with no `layout` stacks exactly like the free tier today.

## Files
- NEW `lib/email/grid-schema.ts` — the `BlockLayout` type + small helpers (px width from col span; round-trip with `react-grid-layout/core` later).
- EDIT `lib/email/doc/types.ts` — add `layout?: BlockLayout` to the `EmailBlock` shape.
- EDIT `lib/email/doc/schema.ts` — add optional `layout` to `BlockSchema` (zod), preserving the mint-id `.transform`.

## Spec
- `BlockLayout = { x:number; y:number; w:number; h:number; minW?:number; maxW?:number; minH?:number; maxH?:number; static?:boolean }` (react-grid-layout v2 item shape; `i` is the block `id`).
- `EmailBlock` gains `layout?: BlockLayout` (optional → existing docs validate unchanged).
- `EmailDocSchema` unchanged otherwise (still `min(1).max(20)` blocks).
- Do NOT change `globalStyle`, `props`, or the discriminated union variants.

## Acceptance
- Existing `SEED_DOCS` + a saved free-tier doc parse unchanged (no `layout`).
- A doc WITH `layout` on a block parses and round-trips.
- `bunx next build` green.
