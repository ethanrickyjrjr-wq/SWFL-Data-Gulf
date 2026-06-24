# TASK 50 — Drag-to-reorder (dnd-kit)   🟢 SONNET

**Wave:** 5 · **Depends on:** 40 (shipped + prod-verified) · **Parallel-safe with:** NOTHING — re-opens files 30 & 33 own
**Owns (only edit these):**
- `components/email-lab/CanvasBlock.tsx`  *(add `useSortable`)*
- `components/email-lab/BlockCanvas.tsx`  *(add Dnd/Sortable context)*
- `package.json` + `bun.lock`

## Build
Install `@dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`. Spec → *dnd-kit integration* (corrected code). Key, vendor-verified points:
- `const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))` — **`useSensors` wraps `useSensor`; the distance makes a click select, not drag.** (`sensors={sensors}` — not `[sensor]`.)
- `SortableContext` items = `blocks.map(b => b.id)`, `verticalListSortingStrategy`; `onDragEnd` → `arrayMove` → `onChange` (push through history).
- `CanvasBlock` gains `useSortable({ id })`, `CSS.Transform.toString(transform)`, drag handle via `{...attributes} {...listeners}`.

## Gate (REQUIRED)
- `package.json` change → `bun install` + `git add bun.lock` in the **same** commit (pre-push Gate 1).
- Verify reorder under **React 19 StrictMode** at runtime. If broken → fall back to `@hello-pangea/dnd@18.0.1` (peer-deps R19 explicitly) — contained to these two files.

## Acceptance
- `bunx next build` green; drag reorders; **click still selects** (distance works); no StrictMode console errors; reorder is undoable.

## Isolation
By Wave 5 nothing else is in flight. NEVER run concurrently with Wave 3–4 (shared files).
