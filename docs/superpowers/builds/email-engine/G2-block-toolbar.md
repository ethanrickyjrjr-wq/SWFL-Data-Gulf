# G2 · block toolbar  (OPERATOR)
**Model:** Sonnet | **Group:** 2 | **deps:** G1 | **owner:** OPERATOR
**Contention:** `CanvasBlock.tsx` — serialize with G1.

## Goal
Per-block toolbar: an **always-visible** drag handle (`.drag-handle`), resize corners, per-block AI button, delete, and "Edit photo" (Photopea) on photo blocks. (Today's handle is `opacity-0` until hover — fix that.)

## Files
- EDIT `components/email-lab/CanvasBlock.tsx`

## Acceptance
- Handle visible at rest (not `opacity-0`); drag, resize, per-block AI, delete, Edit-photo all work.
