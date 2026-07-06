# Email Lab Grid — content-driven auto-height (GridStack.js migration)

**Status:** design, awaiting plan
**Date:** 07/06/2026
**Owner surface:** `components/email-lab/GridCanvas.tsx`, `components/email-lab/EmailLabGridShell.tsx` (PAID-tier grid canvas only)

## Problem

The paid-tier grid canvas clips block content. `GridCanvas.tsx` renders every block inside a
`react-grid-layout` (RGL) cell whose pixel height is `h × rowHeight`, wrapped in `overflow-hidden`
("KNOWN TENSION" comment, `GridCanvas.tsx` lines 25–28: "email blocks are content-driven height...
Content taller than the cell is clipped"). `h` itself comes from `normalizeAuthorHeights()` in
`EmailLabGridShell.tsx`, which assigns a **static per-block-TYPE row count** from a `DEFAULT_H`
lookup table — never the block's actual rendered content height. A `text` block holding one
sentence and one holding a five-source citation paragraph get the identical box. Confirmed live in
a screenshot: a Sources citation line and several stat tiles cut off mid-sentence/mid-value.

Root cause: height is a guessed constant, not a measured fact, and the box enforces that guess by
clipping anything that disagrees with it.

## Decision

Migrate the paid-tier grid canvas from `react-grid-layout` to **GridStack.js** (MIT, npm
`gridstack@12.6.0`, verified in-session via crawl4ai against `gridstack/gridstack.js` `doc/API.md`
and the official React wrapper README) and adopt its built-in `sizeToContent` feature, rather than
hand-rolling a `ResizeObserver`-based auto-height layer on top of RGL.

Two options were weighed:

- **Hand-rolled auto-height on RGL** — smaller diff, but reinvents (with our own bugs) exactly what
  GridStack already spent ~2 years hardening in its changelog: nested-content edge cases,
  resize-during-animation cleanup, unit conversion (rem/em cell heights), DOM-init timing. Rejected
  as unnecessary reinvention.
- **Native CSS masonry** (`display: grid-lanes` / `grid-template-rows: masonry`) — MDN confirms this
  is explicitly "Experimental" and **not Baseline** ("does not work in some of the most widely-used
  browsers") as of this research. Not viable for production. Rejected.
- **GridStack.js migration (chosen)** — the exact problem ("give this grid item a real height from
  its content, no scrollbar, still draggable/resizable") is a first-party, documented, maintained
  feature (`GridStackOptions.sizeToContent` / `GridStackWidget.sizeToContent` / `resizeToContent()`),
  shipped inside the same package as its official React bindings (`gridstack/dist/react`).

## Scope and blast radius

Verified by reading the render pipeline: `lib/email/compile-grid.ts` and `lib/email/doc/row-grouping.ts`
(the code that turns the editor's grid positions into the actual sent email / PDF layout) read only
`x`, `y`, and `w` from `BlockLayout` — **never `h`**. `h` is purely an editor-canvas display concern.
This means:

- The sent email, the PDF export, and the free-tier stacked canvas (`BlockCanvas`, dnd-kit) are
  **entirely unaffected** by this migration.
- No existing test references `GridCanvas` or `react-grid-layout` directly (confirmed via repo
  search), so there is no test-suite migration debt on the canvas itself — only new tests to add.
- The migration is contained to: `components/email-lab/GridCanvas.tsx`, the layout-assignment code
  in `components/email-lab/EmailLabGridShell.tsx` (`normalizeAuthorHeights`, `DEFAULT_H`, `ensureLayout`,
  `nextBottomY`), and the `package.json` dependency swap (`react-grid-layout` → `gridstack`).

`lib/email/doc/types.ts`'s `BlockLayout` interface (`x,y,w,h,minW,maxW,minH,maxH,static?`) is
**unchanged in shape** — GridStack uses the identical x/y/w/h column-grid coordinate model, so
`compile-grid.ts`/`row-grouping.ts` need zero changes. `static` (today used only to lock the footer
block) maps to GridStack's `noResize: true` + `noMove: true` on that widget.

## Behavior

Confirmed via crawl4ai (`gridstack.js` `doc/API.md`):

- `GridStackOptions.sizeToContent: true` (grid-wide) makes every widget's height auto-compute from
  its actual rendered content: `ceil(getBoundingClientRect().height / getCellHeight())`, re-run
  "whenever the grid or item is resized" (includes width-drag and initial mount/load). This is the
  direct replacement for `DEFAULT_H`/`normalizeAuthorHeights` as the source of truth for `h`.
- Per operator decision, **height is fully automatic** — no per-widget override, no manual
  height-drag. `resizable: { handles: 'e, w' }` restricts the resize UI to the two horizontal edges
  (GridStack's default is `'se'`, a corner handle that drags both axes) so a user can still change a
  block's width preset (⅓/½/⅔/Full) but can never manually set a wrong/stale height again.
- `draggable: { handle: '.drag-handle' }` matches the CSS class our existing chrome already uses for
  the drag affordance (the `⠿` handle) — effectively unchanged from today.
- The footer block keeps its lock via `noResize: true` + `noMove: true` (replaces `layout.static`).
- **Self-heal on open** (operator decision): because `sizeToContent` re-measures on initial mount,
  any previously-saved doc — including ones carrying the old clipped `DEFAULT_H` guesses — gets
  every block's height corrected the moment it loads in the grid editor. No backfill script needed.
- **Non-drag content changes** (typing in the field-editor panel, an AI rewrite) don't fire a native
  DOM resize event, so GridStack's auto-trigger won't see them. A small wiring layer calls GridStack's
  own `grid.resizeToContent(el)` (or per-widget equivalent) after any block-content mutation — using
  their built-in remeasure function, not a hand-rolled pixel→row conversion.

## Undo/history

Auto-height geometry corrections must not pollute undo history — typing one sentence could cross a
line-wrap row boundary several times before the user pauses. These updates patch the current history
frame in place (same principle as the existing "coalesced field edit" pattern in
`EmailLabGridShell.tsx`), never pushing a new undo frame. Only user-intentional actions (width drag,
text edit, add/remove/duplicate a block, an AI edit) push a normal undo frame.

## Migration footprint

- `GridCanvas.tsx`: rewired from `<ReactGridLayout>` onto GridStack's React wrapper
  (`<GridStack options={...} components={{...}}>`, `useGridStack()` for imperative actions). Existing
  per-block chrome (selection ring, "Selected · width" tag, drag handle, hover action pill with
  AI/duplicate/delete/edit-photo buttons) continues to wrap the same `BlockRenderer` output, now as a
  GridStack "component" rather than a raw RGL child.
- `EmailLabGridShell.tsx`: `normalizeAuthorHeights()`, `DEFAULT_H`-as-source-of-truth, `ensureLayout()`,
  and `nextBottomY()` are removed/simplified — GridStack's own auto-placement plus grid-wide
  `sizeToContent: true` replace that bespoke stacking math. This is a net simplification, not just a
  like-for-like swap. `DEFAULT_H` may still seed a placeholder `h` for the very first paint (before
  GridStack's first measure pass lands), avoiding a zero-height flash.
- `package.json`: remove `react-grid-layout`; add `gridstack` (MIT, v12.6.0 current at time of
  research). `react-resizable/css/styles.css` import (RGL's resize-handle styling) is replaced by
  `gridstack/dist/gridstack.css`.

## Testing

- Existing suites that must keep passing unchanged (they don't touch the grid canvas, only the
  compiled output): `lib/email/compile-grid-columns.test.ts`, `lib/email/compile-grid-metric.test.ts`,
  `lib/email/doc/row-grouping.test.ts`, `lib/email/blocks/MetricCardBlock.test.ts`.
- New coverage: the content-mutation → `resizeToContent` wiring (does an edit that lengthens a
  block's text actually grow `h`); the undo-history filter (does an auto-height change avoid pushing
  an undo frame while a manual edit still does); the footer lock (`noResize`/`noMove` still holds).
- Manual verification via dev server: rebuild the doc from the reported screenshot (long Sources
  citation line, a stats row, a signal-block bullet list) and confirm nothing clips, corner-drag no
  longer changes height, and opening an old saved draft self-heals on load.

## Out of scope

- The free-tier stacked canvas (`BlockCanvas`, dnd-kit `useSortable`) — untouched, not part of this
  migration.
- The sent-email renderer (`EmailDocRenderer.tsx`) and PDF export — untouched; they never read `h`.
- Nested/sub-grids, multi-grid drag-between-grids (GridStack features not needed here — this canvas
  is a single flat grid of blocks).
