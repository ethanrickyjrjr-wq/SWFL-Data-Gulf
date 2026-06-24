# TASK 31 — Block Inspector (properties panel)   🟢 SONNET

**Wave:** 1 (needs only 00) · **Depends on:** 00 · **Parallel-safe with:** 10, 11, 12, 32
**Owns (only edit these):**
- `components/email-lab/BlockInspector.tsx`  *(`"use client"`)*

## Build
Left-panel form for the **selected** block. Given `{ block, onChange }`, render an editable field per prop of `block.type` (text inputs, textareas, color pickers) — same field styling as the current `FINE_TUNE_GROUPS` in `EmailLabClient.tsx`. Every change → `onChange(updatedBlock)` (live). A "Done"/Escape affordance to deselect (handled by parent). **This is a properties panel, not in-canvas editing** (spec renamed "inline editing" → Block Inspector).

Drive the field list from the per-block prop types in `lib/email/doc/types.ts` (Task 00) so it stays in sync.

## Acceptance
- `bunx next build` green. Selecting each block type shows the right fields; editing a field emits the updated block.

## Isolation
Pure form over types — needs only Task 00. One file. Doesn't import blocks or canvas.
