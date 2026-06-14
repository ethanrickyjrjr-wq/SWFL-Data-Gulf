# Task 06 — Cross-cell selection snapping

**Context (verified):** `use-highlight.ts` has `snapCrossRowSelection`@109 (snaps a multi-row table selection to one row, runs @279 after the range is built) and `extractRowContext`@193-204 (grabs the FIRST cell's label). There is **no** cross-cell snapping: a selection spanning two different `<td>`s in the **same** `<tr>` is not handled. The iteration doc blesses "snap to one or suppress."

**Rule:** different `<td>`s in same `<tr>` → snap to the **dominant cell** (mirror the cross-row 1.5× dominance rule). No dominance + the selection mixes a label cell and a value cell → **suppress** (return null; the iteration doc explicitly allows suppression for ambiguous mixed selections).

**Files:**
- Modify: `lib/highlighter/use-highlight.ts`
- Test: `lib/highlighter/use-highlight.test.ts` (jsdom — mirror the existing cross-row tests' structure)

- [ ] **Step 1: Write failing jsdom tests.** Build a `<table><tr><td>Label</td><td>$30,074</td></tr></table>`; create a Range spanning both cells; assert `snapCrossCellSelection(range)` returns a range confined to the dominant cell when one side dominates ≥1.5×; assert it returns `null` (suppress) for a balanced label+value mix.

```ts
import { describe, it, expect } from "vitest";
import { snapCrossCellSelection } from "./use-highlight"; // export it

// … build DOM via document.createElement, set textContent, create Range …
```

- [ ] **Step 2: Run — expect FAIL** (`snapCrossCellSelection` not exported / not implemented).

- [ ] **Step 3: Implement `snapCrossCellSelection(range: Range): Range | null`.** Find the common `<tr>`; if start and end are in different `<td>`s of that row: measure each cell's selected-text length; if one ≥1.5× the other, return a range clamped to the dominant cell; else return `null`. Export it.

- [ ] **Step 4: Wire it after the cross-row snap** (`use-highlight.ts:279-280`):

```ts
const rowSnapped = snapCrossRowSelection(range);
const cellSnapped = snapCrossCellSelection(rowSnapped ?? range);
if (cellSnapped === null && /* selection was cross-cell ambiguous */) return; // suppress popup
const finalRange = cellSnapped ?? rowSnapped ?? range;
```

Be careful to only suppress when the selection genuinely was cross-cell-ambiguous — a normal single-cell selection must pass through unchanged (return the input range, don't null it).

- [ ] **Step 5: Run — expect PASS.** `bun test lib/highlighter/use-highlight.test.ts`

- [ ] **Step 6: Manual smoke.** On a metrics table: drag across a label+value in one row → snaps to the dominant side or no popup (suppressed); single-cell selection still works.

- [ ] **Step 7: Commit.**

```bash
git add lib/highlighter/use-highlight.ts lib/highlighter/use-highlight.test.ts
git commit -m "feat(highlighter): cross-cell selection snapping + ambiguous-mix suppression"
```

> After this task: run the whole highlighter test set (`bun test lib/highlighter`) green, then ship the session per `../shared/conventions.md`. Build-queue item 1 → `[x]`.
