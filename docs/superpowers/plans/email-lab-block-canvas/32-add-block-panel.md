# TASK 32 — Add Block palette   🟢 SONNET

**Wave:** 1 (needs only 00) · **Depends on:** 00 · **Parallel-safe with:** 10, 11, 12, 31
**Owns (only edit these):**
- `components/email-lab/AddBlockPanel.tsx`  *(`"use client"`)*

## Build
A mini palette of the 10 block types (icon + label each). `onAdd(type)` → caller inserts a new block with **default props** (from a per-type default map; mirror `default-docs.ts` block defaults — Task 00). Used by the `[+]` affordance between blocks and at the bottom of the canvas.

## Acceptance
- `bunx next build` green. Clicking a type calls `onAdd(type)`; new block has valid default props that pass `EmailDocSchema`.

## Isolation
Needs only Task 00. One file. Insertion into the doc array is the canvas's job (Task 33) — this panel only emits the chosen type.
