# TASK 33 — BlockCanvas (orchestrator)   🔵 OPUS

**Wave:** 3 · **Depends on:** 30, 31, 32, 11 · **Parallel-safe with:** nothing in Wave 3 (it's the join)
**Owns (only edit these):**
- `components/email-lab/BlockCanvas.tsx`  *(`"use client"`)*

## Build
The stateful heart. Given `{ doc, onChange, selectedId, onSelect }`, render the 600px column: `doc.blocks.map(CanvasBlock)` (Task 30) + `[+]` → `AddBlockPanel` (Task 32). Owns:
- selection routing (click block → parent shows `BlockInspector` Task 31)
- add / delete / field-edit mutations on `doc.blocks`, each pushed through `history.ts` (Task 11) with **keystroke coalescing** (push on blur / 500 ms idle)
- ⌘Z / ⌘⇧Z wiring

**No dnd yet** — Task 50 adds `DndContext`/`SortableContext` here. Leave the block order driven by the array.

## Acceptance
- `bunx next build` green. Add → edit → delete → ⌘Z restores; selection ring + inspector switch work; 50-frame history cap holds.

## Isolation
The Wave-3 join point — build after 30/31/32 land. One file. Don't modify the clients yet (Task 40).
