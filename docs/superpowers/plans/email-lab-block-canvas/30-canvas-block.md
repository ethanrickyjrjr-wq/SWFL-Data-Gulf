# TASK 30 — CanvasBlock (selection wrapper)   🟢 SONNET

**Wave:** 3 · **Depends on:** 20 · **Parallel-safe with:** 31, 32
**Owns (only edit these):**
- `components/email-lab/CanvasBlock.tsx`  *(`"use client"`)*

## Build
Client wrapper around a pure block: renders `<BlockRenderer block globalStyle />` (Task 20) inside a `<div onClick={onSelect}>` with a selection ring (`ring-2 ring-[#1BB8C9]` when `selected`), a hover trash button (`onDelete`, `stopPropagation`), and a placeholder drag-handle slot (≡) that does nothing yet. Props: `{ block, globalStyle, selected, onSelect, onDelete }`.

**Phases 2–4 ship this WITHOUT `useSortable`** — plain div. Task 50 adds drag here.

## Acceptance
- `bunx next build` green. Click selects (ring shows); trash calls `onDelete` without selecting.

## Isolation
All client-only behavior (hover/selection) lives HERE, not in the pure blocks. One file.
