# Email Lab Grid — GridStack.js Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 8 tasks, 13 files, 2 conflict groups, keywords: migration, refactor, schema

**Goal:** Replace the paid-tier grid canvas's clipping fixed-height cells (`react-grid-layout@2.2.3`) with GridStack.js content-driven auto-height, so a block's box always fits its rendered content — while the sent email, PDF, and free tier stay byte-identical.

**Architecture:** `GridCanvas.tsx` is rewired from `<ReactGridLayout>` onto the GridStack React wrapper (`gridstack/dist/react`) in component mode, with grid-wide `sizeToContent: true` replacing the static `DEFAULT_H` height guesses. Height becomes fully automatic (no manual height drag; resize handles restricted to east/west for width only). `EmailLabGridShell.tsx`'s bespoke stacking math (`normalizeAuthorHeights`, `nextBottomY`, `ensureLayout` for height) is simplified because GridStack owns placement + measurement. The output pipeline (`compile-grid.ts` for Outlook, `email-doc-pdf.tsx` for PDF) is UNCHANGED in code — but both consume `row-grouping.ts`, which reads `h`, so a grouping-stability test net is landed FIRST as the PDF/Outlook safety guard.

**Tech Stack:** Next.js App Router (client component), React 19, TypeScript, `gridstack@12.6.0` (MIT), `@react-email/render` + `@react-pdf/renderer` (output engines, untouched), `bun:test`.

**Source spec:** `docs/superpowers/specs/2026-07-06-email-grid-autoheight-gridstack-design.md`
**PDF/Outlook safety plan (companion):** `docs/superpowers/plans/2026-07-06-email-grid-gridstack-pdf-outlook-safety.md`

## Global Constraints

- **Package:** `gridstack@12.6.0` (MIT, npm; verified in-session via crawl4ai against `doc/API.md` +
  `react/README.md` — latest is 12.6.0, no peer deps). Remove `react-grid-layout` (`^2.2.3`) AND its
  `react-resizable/css/styles.css` import entirely.
- **Pre-push Gate 1 (lockfile):** any `package.json` change ships `bun install` + `git add bun.lock` in the SAME push.
- **Verify with `bunx next build`, never bare `npx tsc`** (local tsc ≠ Vercel; per feedback memory).
- **`BlockLayout` shape is UNCHANGED** (`{x,y,w,h,minW,maxW,minH,maxH,static?}` in `lib/email/doc/types.ts`).
  GridStack uses the identical x/y/w/h column-grid model — `compile-grid.ts` / `row-grouping.ts` /
  `email-doc-pdf.tsx` need ZERO code changes.
- **`h` reaches the output ONLY through grouping, never sizing** — the migration changes `h` VALUES, and
  the only downstream consumer of those values is `row-grouping.ts` (band-overlap). That is the entire
  blast radius. Task 1 locks it before anything else moves.
- **Grid geometry (verbatim, from `react/README.md` example + our `grid-schema.ts`):** `column: 12`,
  `margin: 8`, `cellHeight: 50` (GridStack's `'auto'` square at 600px/12col = 50px; set EXPLICITLY so
  the scale is stable and independent of column-mode). Canvas width stays 600px.
- **Height is fully automatic** (operator decision): no per-widget manual height drag. Resize UI is
  width-only via `resizable: { handles: 'e,w' }` (GridStack default is the `'se'` corner, which drags
  both axes — must override). Drag-move via `draggable: { handle: '.drag-handle' }` (our existing `⠿`).
- **Footer stays locked** via `noResize: true` + `noMove: true` on that widget (replaces `layout.static`).
- **Undo discipline:** auto-height geometry corrections PATCH the current history frame in place (never
  push an undo frame); only user-intentional actions (width drag, move, add/remove/duplicate, AI edit,
  text edit) push a frame.
- **CSS import swap:** `react-grid-layout/css/styles.css` + `react-resizable/css/styles.css` →
  `gridstack/dist/gridstack.css`.
- **No new copy/jargon in the UI** — the width tag ("✦ Selected · ⅔ width") and existing chrome carry over verbatim.

---

## File Structure

- `package.json` — dependency swap (remove `react-grid-layout`, add `gridstack`). `bun.lock` regenerated.
- `lib/email/grid-schema.ts` — add `GRID_CELL_HEIGHT = 50` constant + a `gridStackOptions()` helper that
  builds the grid-wide `GridStackOptions` (the one place the sizeToContent/resize/drag/cellHeight config lives).
- `lib/email/doc/row-grouping.test.ts` — EXTEND with the grouping-stability guard (Task 1). No source change to `row-grouping.ts`.
- `components/email-lab/GridCanvas.tsx` — REWRITE onto `<GridStack>` component mode. This is the bulk.
  Keep per-block chrome (ring, "Selected · width" tag, `.drag-handle`, action pill) around `BlockRenderer`.
- `components/email-lab/EmailLabGridShell.tsx` — simplify layout math; add `patchPresent` (auto-height,
  no undo frame); keep `nextBottomY`/`ensureLayout` for placement seeds of add/duplicate; retire
  `normalizeAuthorHeights` as a height source (GridStack measures instead).
- `lib/email/doc/history.ts` — add `patchPresent(h, next)` pure helper (present-only patch, no past/future change).
- `lib/pdf/__tests__/email-doc-pdf.test.ts` + `lib/email/compile-grid-columns.test.ts` — EXTEND with a
  golden render of the reported-screenshot doc (Task 6). No source change to the engines.

**Testable vs build-verified boundary (honesty):** the pure-function output path (grouping, `compileGrid`
HTML, `EmailDocPdf` document) is unit-tested with `bun:test`. The canvas itself (GridStack is a
DOM-mutating library) is verified by `bunx next build` (types) + the spec's manual dev-server checklist —
NOT faked as a unit test. Tasks are labelled accordingly.

---

### Task 1: Grouping-stability guard (PDF + Outlook safety net) — land FIRST

**Why first:** the migration changes `h` values; `row-grouping.ts` reads `h` and is the shared root for
BOTH the Outlook compiler and the PDF engine. These are characterization tests that PASS against today's
code, so they become a regression net that fails loudly if the new `h` values ever change output grouping.

**Files:**
- Modify: `lib/email/doc/row-grouping.test.ts` (extend the existing `describe("groupRows")`)
- Read-only reference: `lib/email/doc/row-grouping.ts`

**Interfaces:**
- Consumes: `groupRows(blocks: EmailBlock[]): RowEntry[][]` where `RowEntry = { block, eff:{x,y,w,h} }`
  (existing export). Test helper `blk(id, layout?)` already defined at the top of the test file.

- [ ] **Step 1: Write the failing tests** (append inside the existing `describe("groupRows", …)` block, before its closing `})`):

```ts
  // ── PDF/Outlook safety: h feeds grouping; these lock the COMMON email shapes so
  // GridStack's content-measured h can never silently re-group the sent output. ──

  it("full-width stack: each block is its own row regardless of h magnitude", () => {
    // The dominant real-email shape. Content-driven h (large, varied) must NOT
    // merge stacked full-width blocks into one row.
    const rows = groupRows([
      blk("hero", { x: 0, y: 0, w: 12, h: 6 }),
      blk("stats", { x: 0, y: 6, w: 12, h: 4 }),
      blk("sources", { x: 0, y: 10, w: 12, h: 18 }), // a tall citation block
      blk("footer", { x: 0, y: 28, w: 12, h: 5 }),
    ]);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r[0].block.id)).toEqual(["hero", "stats", "sources", "footer"]);
  });

  it("equal-y 2-column row stays one row of two even with very unequal content h", () => {
    // A ⅓ | ⅔ row where the right column is much taller (content-driven). Same y →
    // must group as ONE row of two (renders as columns in Outlook + PDF).
    const rows = groupRows([
      blk("short", { x: 0, y: 0, w: 4, h: 3 }),
      blk("tall", { x: 4, y: 0, w: 8, h: 14 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].map((d) => d.block.id)).toEqual(["short", "tall"]);
  });

  it("KNOWN LIMITATION (locked): 2×2 masonry with a tall right column swallows the below-left block", () => {
    // Two stacked half-width blocks on the left, one tall half-width on the right.
    // A linear email/PDF cannot represent true 2D masonry; the band rule projects
    // this into a single 3-cell row. This is PRE-EXISTING behavior (identical under
    // react-grid-layout's DEFAULT_H). Locked here so a future grouping change is a
    // DELIBERATE, reviewed decision — not an accident of the GridStack h values.
    const rows = groupRows([
      blk("lt", { x: 0, y: 0, w: 6, h: 2 }),
      blk("rt", { x: 6, y: 0, w: 6, h: 7 }),
      blk("lb", { x: 0, y: 2, w: 6, h: 3 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].map((d) => d.block.id)).toEqual(["lt", "lb", "rt"]);
    // NOTE: if the migration's grouping-stability manual check shows this shape in a
    // real doc, the fix (per the safety plan) is to key band math on y-top proximity
    // or clamp band-h — a separate, reviewed change, NOT part of this migration.
  });
```

- [ ] **Step 2: Run the tests** — the first two must PASS (they characterize correct current behavior); the third documents current behavior and must also PASS.

Run: `bun test lib/email/doc/row-grouping.test.ts`
Expected: PASS (all, including the 3 pre-existing cases). If the "full-width stack" or "equal-y 2-column" case FAILS, STOP — the current grouping is already wrong and must be fixed before migrating (escalate; do not proceed).

- [ ] **Step 3: Commit**

```bash
git add lib/email/doc/row-grouping.test.ts
git commit -F - <<'EOF'
test(email): lock grouping stability for PDF/Outlook before GridStack migration

row-grouping.ts reads h and is the shared root for the Outlook compiler and PDF
engine. Characterization tests lock the common email shapes (full-width stack,
equal-y 2-col) and document the pre-existing 2x2 masonry projection, so the
migration's content-measured h can never silently re-group the sent output.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: Grid config root — `GRID_CELL_HEIGHT` + `gridStackOptions()` helper

**Files:**
- 🔴 Modify: `lib/email/grid-schema.ts` (add constant + helper alongside the existing exports)
- Test: `lib/email/grid-schema.test.ts` (create if absent; else extend)

**Interfaces:**
- Produces:
  - `export const GRID_CELL_HEIGHT = 50;`
  - `export function gridStackOptions(): GridStackOptions` — the ONE place the grid-wide GridStack config
    is built (column/cellHeight/margin/sizeToContent/resizable/draggable/float). `GridCanvas` consumes it.
- Consumes: existing `GRID_COLS = 12`, `GRID_MARGIN = [8,8]`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/email/grid-schema.test.ts
import { describe, expect, it } from "bun:test";
import { GRID_CELL_HEIGHT, gridStackOptions, GRID_COLS } from "./grid-schema";

describe("gridStackOptions", () => {
  it("pins the verified GridStack geometry + fully-automatic height", () => {
    const o = gridStackOptions();
    expect(o.column).toBe(GRID_COLS);          // 12
    expect(o.cellHeight).toBe(GRID_CELL_HEIGHT); // 50 (explicit, not 'auto')
    expect(o.margin).toBe(8);
    expect(o.sizeToContent).toBe(true);        // content-driven h, grid-wide
    expect(o.float).toBe(false);               // compact-up (GridStack default, pinned)
    expect(o.resizable).toEqual({ handles: "e,w" }); // width-only; never a height drag
    expect(o.draggable).toEqual({ handle: ".drag-handle" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/email/grid-schema.test.ts`
Expected: FAIL — `gridStackOptions` / `GRID_CELL_HEIGHT` not exported.

- [ ] **Step 3: Add the constant + helper to `lib/email/grid-schema.ts`**

Add the import at the top (after the existing `import type` line):

```ts
import type { GridStackOptions } from "gridstack";
```

Append at the end of the file:

```ts
/** GridStack cell height in px. GridStack's default `cellHeight: 'auto'` makes
 *  square cells (width/column = 600/12 = 50) that shift with column mode; we pin
 *  it EXPLICITLY so the content-measured `h` scale is stable. Verified in-session
 *  via crawl4ai against gridstack@12.6.0 `doc/API.md` (`cellHeight` default 'auto')
 *  and `react/README.md` (examples use `cellHeight: 50`). */
export const GRID_CELL_HEIGHT = 50;

/** The ONE grid-wide GridStack config. Height is fully automatic (`sizeToContent`);
 *  the resize UI is width-only (`handles: 'e,w'` — GridStack's default `'se'` corner
 *  would let a user drag a wrong height); drag-move uses our existing `.drag-handle`.
 *  `float:false` = compact-up (pinned; matches the row-grouping band assumptions). */
export function gridStackOptions(): GridStackOptions {
  return {
    column: GRID_COLS,
    cellHeight: GRID_CELL_HEIGHT,
    margin: GRID_MARGIN[0], // 8 — uniform gutter
    sizeToContent: true,
    float: false,
    resizable: { handles: "e,w" },
    draggable: { handle: ".drag-handle" },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/email/grid-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/email/grid-schema.ts lib/email/grid-schema.test.ts
git commit -F - <<'EOF'
feat(email): pin GridStack grid config (cellHeight 50, sizeToContent, width-only resize)

One root for the grid-wide GridStack options; cellHeight pinned explicitly to 50
(GridStack's 'auto' square at 600/12) so content-measured h stays on a stable scale.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: History helper — `patchPresent` (auto-height, no undo frame)

**Files:**
- 🟡 Modify: `lib/email/doc/history.ts` (add one pure function beside `pushDoc`)
- Test: `lib/email/doc/history.test.ts` (create if absent; else extend)

**Interfaces:**
- Produces: `export function patchPresent(h: DocHistory, next: EmailDoc): DocHistory` — replaces `present`
  only; `past` and `future` are untouched (so an auto-height correction is invisible to undo/redo).
- Consumes: existing `DocHistory`, `pushDoc`, `initHistory`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/email/doc/history.test.ts
import { describe, expect, it } from "bun:test";
import { initHistory, pushDoc, patchPresent, undo } from "./history";
import type { EmailDoc } from "./types";

const doc = (tag: string): EmailDoc =>
  ({ blocks: [{ id: tag, type: "text", props: { body: tag } }], globalStyle: {} }) as unknown as EmailDoc;

describe("patchPresent", () => {
  it("replaces present without touching past/future (no new undo frame)", () => {
    const h0 = pushDoc(initHistory(doc("a")), doc("b")); // past:[a] present:b
    const h1 = patchPresent(h0, doc("b-autoheight"));
    expect(h1.present.blocks[0].id).toBe("b-autoheight");
    expect(h1.past).toEqual(h0.past);     // unchanged
    expect(h1.future).toEqual(h0.future); // unchanged
    // undo still lands on 'a', NOT on the pre-patch 'b'
    expect(undo(h1).present.blocks[0].id).toBe("a");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/email/doc/history.test.ts`
Expected: FAIL — `patchPresent` not exported.

- [ ] **Step 3: Add the function to `lib/email/doc/history.ts`** (after `pushDoc`):

```ts
/** Replace the current present WITHOUT pushing an undo frame — for geometry
 *  corrections (GridStack auto-height) that must not pollute undo history. */
export function patchPresent(h: DocHistory, next: EmailDoc): DocHistory {
  return { past: h.past, present: next, future: h.future };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/email/doc/history.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/email/doc/history.ts lib/email/doc/history.test.ts
git commit -F - <<'EOF'
feat(email): patchPresent — present-only history patch for GridStack auto-height

Auto-height geometry corrections must not push undo frames; patchPresent replaces
present while leaving past/future intact.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: Dependency swap — `react-grid-layout` → `gridstack`

**Files:**
- Modify: `package.json` (line ~74: remove `"react-grid-layout": "^2.2.3"`; add `"gridstack": "12.6.0"`)
- Regenerate: `bun.lock`

**Interfaces:** none (build wiring). Note: `react-resizable` may be a transitive dep of the old package;
after removal, confirm nothing else imports `react-resizable`.

- [ ] **Step 1: Confirm no other importers of the old packages**

Run: `git grep -n "react-grid-layout\|react-resizable" -- '*.ts' '*.tsx'`
Expected: matches ONLY in `components/email-lab/GridCanvas.tsx` (rewritten in Task 5). If anything else
imports them, STOP and report — this plan assumes GridCanvas is the sole consumer (confirmed at plan time).

- [ ] **Step 2: Edit `package.json`** — remove the `react-grid-layout` line, add `gridstack`:

```jsonc
    "gridstack": "12.6.0",
```

(Pin exact, no caret — a layout engine's minor bumps can shift drag/resize behavior; upgrade deliberately.)

- [ ] **Step 3: Install + verify the lockfile updated**

Run: `bun install`
Then: `git status --short bun.lock`
Expected: `bun.lock` shows as modified (Gate 1 requires it staged in the same push).

- [ ] **Step 4: Verify the package resolves**

Run: `bun -e "import('gridstack').then(m => console.log(typeof m.GridStack))"`
Expected: prints `function`.
Run: `test -f node_modules/gridstack/dist/react/index.js && echo REACT_WRAPPER_OK || echo MISSING`
Expected: `REACT_WRAPPER_OK` (the React wrapper ships in-package at `gridstack/dist/react`).

- [ ] **Step 5: Commit** (do NOT push yet — GridCanvas still imports the removed package; Task 5 restores a green build)

```bash
git add package.json bun.lock
git commit -F - <<'EOF'
build(email): swap react-grid-layout -> gridstack@12.6.0

Removes react-grid-layout (fixed-height clipping canvas); adds GridStack for
content-driven auto-height. GridCanvas rewire follows in the next task.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: Rewrite `GridCanvas.tsx` onto the GridStack React wrapper

**This is the bulk. Build-verified (not unit-tested) — GridStack mutates the DOM.**

**Files:**
- Rewrite: `components/email-lab/GridCanvas.tsx`
- 🔴 Read-only reference: `lib/email/grid-schema.ts` (`gridStackOptions`, `GRID_COLS`, `GRID_CELL_HEIGHT`, `widthPresetLabel`),
  `lib/email/blocks/BlockRenderer.tsx`, `lib/email/doc/types.ts` (`BlockLayout`, `EmailBlock`, `EmailDoc`).

**Interfaces:**
- Consumes: `gridStackOptions()` (Task 2); the same component props as today — `{ doc, selectedId,
  onSelectBlock, onChangeDoc, onDuplicate, onAddBlock, onBlockAi, onEditPhoto }`.
- Produces (UNCHANGED public contract): `export function GridCanvas(props)`. Also KEEP
  `export const DEFAULT_H` (the shell still imports it as a placeholder seed — do NOT delete it here).
- New callback split so the shell can route history correctly:
  - `onChangeDoc(next, opts?: { autoHeightOnly?: boolean })` — extend the signature. When
    `autoHeightOnly` is true, the shell PATCHES present (no undo frame); otherwise it commits.

**Design notes (from the verified React wrapper API):**
- Import: `import { GridStack, useGridStack } from "gridstack/dist/react";` and
  `import type { GridStackNode, GridStackWidget } from "gridstack";` plus `import "gridstack/dist/gridstack.css";`.
- **Component mode:** each block becomes a widget `{ id, x, y, w, h, component: "BlockWidget", props: { blockId },
  noResize?, noMove? }`; footer gets `noResize: true, noMove: true`. Pass `components={{ BlockWidget }}`.
- `BlockWidget` renders OUR chrome (ring, "Selected · width" tag, `.drag-handle`, action pill) around
  `<BlockRenderer>` — identical markup to today, just relocated into the widget component. It reads the
  live block + selection from React context/props threaded down (see Step 3).
> **Wrapper model — VERIFIED in-session (crawl4ai, RULE 0.4) against the installed wrapper source
> (`react/projects/lib/src/gridstack.tsx` + `DESIGN-DECISIONS.md`, gridstack@12.6.0). Do NOT assume the
> declarative-children shortcut — the wrapper is init-once + imperative:**
> - `<GridStack>` calls `GridStack.init(options)` ONCE on mount, then `updateOptions(options)` on
>   options-signature change. `DESIGN-DECISIONS.md` explicitly warns: do **not** drive *which widgets
>   exist* from React JSX — "that fights GridStack's ownership of add/remove." So `options.children`
>   SEEDS the initial widgets; runtime add/remove/duplicate/AI-rebuild is **imperative**.
> - `<GridStack>` exposes event callbacks as **direct props** — `onChange(e, nodes)`, `onDragStart`,
>   `onDragStop`, `onResizeStart`, `onResizeStop`, `onAdded`, `onRemoved`. Use the `onChange` PROP; do
>   NOT hand-wire `grid.on(...)` in a child.
> - `useGridStack()` (inside `<GridStack>`) returns `{ grid, addWidget, removeWidget, removeAll, save }`.
>   `grid` also exposes `load()`, `update(el, opts)`, `resizeToContent(el)`, `refreshDragHandles(el)`.
> - Widgets render via `createPortal` into `.grid-stack-item-content` **from within the `<GridStack>`
>   render subtree**, so React context provided ABOVE `<GridStack>` (our `CanvasContext`) DOES reach
>   `BlockWidget`, and a `useContext` consumer re-renders on context change even though the widget
>   element is memoized. Live block content flows through context — not through the serializable `props`.

- **Change routing — deterministic, no interaction flag (advisor-hardened):** pass `onChange={handleChange}`
  as a `<GridStack>` prop. `handleChange(_e, nodes)` diffs each node's `{x,y,w,h}` vs the block's current
  `layout`. Since resize is width-only and there is NO manual height drag, **every user action changes
  x/y/w; an auto-height remeasure changes ONLY h.** So:
  `autoHeightOnly = changedNodes.every(n => n.x===base.x && n.y===base.y && n.w===base.w && n.h!==base.h)`.
  This is order-independent (no reliance on a `dragstop`-before-`change` race). `autoHeightOnly` → the
  shell calls `patchPresentDoc` (no undo frame); otherwise `commit` (undo frame). Erring toward `commit`
  is safe — worst case is one extra undo frame, never a lost user action.
- **Which-widgets-exist reconcile (imperative):** a `GridReconciler` child (uses `useGridStack()`) runs an
  effect keyed on `doc.blocks` that syncs the grid to the doc: for each doc block absent from the grid →
  `addWidget(toWidget(b))`; for each grid node absent from the doc → `removeWidget(el)`; for an existing
  block whose doc `layout.{x,y,w}` drifted from the node (e.g. the width-preset button or an AI edit
  changed it OUTSIDE the grid) → `grid.update(el, { x, y, w })` (never `h` — height is auto). A whole-doc
  swap (AI "Build with AI" replaces most ids) → `grid.removeAll()` then `grid.load(toWidgets(doc.blocks))`.
  **Loop guard:** the effect only writes to the grid when the node differs from the doc, and `handleChange`
  only writes to the doc when the node differs from the block — the two converge and stop (standard
  controlled-component reconciliation).
- **Drag handle attachment:** the wrapper does NOT auto-call `refreshDragHandles` (confirmed — absent from
  the wrapper source). Because our `.drag-handle` lives INSIDE `BlockWidget`, add a `useEffect` (on mount /
  grid ready) calling `grid.refreshDragHandles(itemEl)` so GridStack attaches drag listeners to it
  (`itemEl = ref.closest('.grid-stack-item')`). Without this, drag-move silently breaks.
- **Content remeasure:** `BlockWidget` runs a `useEffect` keyed on the block's rendered content (e.g.
  `JSON.stringify(block.props)`), calling `grid.resizeToContent(itemEl)`. This covers field-editor / AI-fill
  mutations that fire no native DOM resize event (per API.md: sizeToContent auto-runs on grid/item RESIZE,
  not on content change).
- **Self-heal on open:** grid-wide `sizeToContent:true` remeasures every widget on mount, so an old saved
  doc's stale `h` is corrected on load. That first-mount `change` is h-only → `autoHeightOnly:true` →
  patches present, never dirties the freshly loaded doc into a spurious undo frame.

- [ ] **Step 1: Replace the imports + module header** (top of `GridCanvas.tsx`)

Remove lines importing `ReactGridLayout`, `verticalCompactor`, `Layout`, `LayoutItem`,
`ResizeHandleAxis`, and both RGL/react-resizable CSS imports. Replace with:

```tsx
"use client";
// components/email-lab/GridCanvas.tsx — PAID-tier content-auto-height grid canvas.
//
// Built on GridStack.js (gridstack@12.6.0, MIT) in React component mode. Height is
// FULLY AUTOMATIC via grid-wide `sizeToContent:true` (ceil(contentPx / cellHeight));
// there is no manual height drag — resize handles are width-only ('e,w'). A block's
// box therefore always fits its rendered content (the old RGL `overflow-hidden`
// clipping is gone). Config lives in one root: `gridStackOptions()` (grid-schema).
//
// h reaches the sent email / PDF ONLY through row-grouping (band overlap); it is
// never a sizing input downstream. See the grouping-stability test + the migration
// plan for the PDF/Outlook safety reasoning.
import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { GridStack, useGridStack } from "gridstack/dist/react";
import "gridstack/dist/gridstack.css";
import type { GridStackNode, GridStackWidget } from "gridstack";
import type { BlockLayout, BlockType, EmailBlock, EmailDoc } from "@/lib/email/doc/types";
import { GRID_COLS, gridStackOptions, widthPresetLabel } from "@/lib/email/grid-schema";
import { BlockRenderer } from "@/lib/email/blocks/BlockRenderer";
```

- [ ] **Step 2: Keep `DEFAULT_H` unchanged** (the shell imports it as a pre-measure placeholder). Leave
  the `export const DEFAULT_H: Record<BlockType, number> = { … }` block exactly as-is.

- [ ] **Step 3: Build the widget list + a React context to thread block/selection into `BlockWidget`**

Replace `buildLayout` with a `toWidgets` mapper and add a small context (GridStack renders widgets via
portals, so the widget component can't receive React props directly through the options object — it
receives only serializable `props`; the live block + handlers come via context):

```tsx
interface CanvasCtx {
  doc: EmailDoc;
  selectedId: string | null;
  onSelectBlock: (id: string | null) => void;
  onDuplicate?: (id: string) => void;
  onBlockAi?: (id: string) => void;
  onEditPhoto?: (id: string) => void;
  remove: (id: string) => void;
}
const CanvasContext = createContext<CanvasCtx | null>(null); // add `createContext` to the react import

/** Doc blocks → GridStack widgets. Positioned blocks pass through; a block without
 *  a layout stacks full-width at the bottom (footer locked via noMove/noResize). */
function toWidgets(blocks: EmailBlock[]): GridStackWidget[] {
  let cursorY = 0;
  return blocks.map((b) => {
    const isFooter = b.type === "footer";
    if (b.layout) {
      const { x, y, w, h } = b.layout;
      return {
        id: b.id, x, y, w, h,
        component: "BlockWidget", props: { blockId: b.id },
        ...(isFooter ? { noResize: true, noMove: true } : {}),
      };
    }
    const h = DEFAULT_H[b.type] ?? 4; // placeholder; sizeToContent corrects on mount
    const widget: GridStackWidget = {
      id: b.id, x: 0, y: cursorY, w: GRID_COLS, h,
      component: "BlockWidget", props: { blockId: b.id },
      ...(isFooter ? { noResize: true, noMove: true } : {}),
    };
    cursorY += h;
    return widget;
  });
}
```

- [ ] **Step 4: Write `BlockWidget`** — OUR chrome around `BlockRenderer`, with the content-remeasure effect.
  Port the exact JSX from today's inner block markup (the ring wrapper, the "✦ Selected · width" tag, the
  `.drag-handle` div, the action pill with AI/photo/duplicate/delete buttons, the `pointer-events-none`
  BlockRenderer wrapper). It reads live state from `CanvasContext` and the widget `props.blockId`:

```tsx
function BlockWidget({ blockId }: { blockId: string }) {
  const ctx = useContext(CanvasContext);           // add `useContext` to the react import
  const { grid } = useGridStack();
  const ref = useRef<HTMLDivElement>(null);
  const block = ctx?.doc.blocks.find((b) => b.id === blockId);

  // Attach GridStack drag listeners to our INSIDE-content `.drag-handle` — the
  // wrapper does not auto-refresh handles for portal content (verified: absent
  // from wrapper source), so without this the ⠿ handle won't drag.
  useEffect(() => {
    const el = ref.current?.closest(".grid-stack-item") as HTMLElement | null;
    if (el && grid) grid.refreshDragHandles(el);
  }, [grid]);

  // Remeasure this widget when its CONTENT changes (field edit / AI fill) — these
  // fire no native resize, so sizeToContent's auto-trigger won't see them.
  const contentKey = block ? JSON.stringify(block.props) : "";
  useEffect(() => {
    const el = ref.current?.closest(".grid-stack-item") as HTMLElement | null;
    if (el && grid) grid.resizeToContent(el);
  }, [contentKey, grid]);

  if (!ctx || !block) return null;
  const selected = block.id === ctx.selectedId;
  const locked = block.type === "footer" && block.layout?.static;

  return (
    <div
      ref={ref}
      onClick={() => ctx.onSelectBlock(block.id)}
      className={`group relative h-full w-full cursor-pointer overflow-hidden rounded-[3px] transition-shadow ${
        selected ? "ring-2 ring-inset ring-gulf-teal" : "ring-1 ring-inset ring-transparent hover:ring-gray-300"
      }`}
    >
      {/* PORT VERBATIM from the current GridCanvas inner block: the "✦ Selected · width"
          tag, the `.drag-handle` ⠿ div, and the action pill (AI ✦ / photo ◧ / duplicate
          ⧉ / delete ✕) — same classes, same handlers, wired to ctx.* instead of props. */}
      <div className="pointer-events-none h-full">
        <BlockRenderer block={block} globalStyle={ctx.doc.globalStyle} />
      </div>
    </div>
  );
}
```

> Implementation note: copy the three chrome sub-blocks (width tag, drag handle, action pill) from the
> current file's lines ~209–284 verbatim, swapping `onSelectBlock`→`ctx.onSelectBlock`,
> `onDuplicate`→`ctx.onDuplicate`, `onBlockAi`→`ctx.onBlockAi`, `onEditPhoto`→`ctx.onEditPhoto`,
> `remove`→`ctx.remove`, `widthPresetLabel(block.layout?.w ?? GRID_COLS)` unchanged.

- [ ] **Step 5: Add the `toWidget` helper + the imperative `GridReconciler`**

Refactor `toWidgets` to build on a single-block `toWidget` (reused by the reconciler):

```tsx
/** One block → one GridStack widget (footer locked). h is a placeholder before
 *  sizeToContent measures. */
function toWidget(b: EmailBlock, seedY: number): GridStackWidget {
  const isFooter = b.type === "footer";
  const lock = isFooter ? { noResize: true, noMove: true } : {};
  if (b.layout) {
    const { x, y, w, h } = b.layout;
    return { id: b.id, x, y, w, h, component: "BlockWidget", props: { blockId: b.id }, ...lock };
  }
  return {
    id: b.id, x: 0, y: seedY, w: GRID_COLS, h: DEFAULT_H[b.type] ?? 4,
    component: "BlockWidget", props: { blockId: b.id }, ...lock,
  };
}
function toWidgets(blocks: EmailBlock[]): GridStackWidget[] {
  let cursorY = 0;
  return blocks.map((b) => {
    const w = toWidget(b, cursorY);
    if (!b.layout) cursorY += w.h ?? 4;
    return w;
  });
}

/** Lives inside <GridStack>; keeps WHICH widgets exist (and their doc-driven x/y/w)
 *  in sync with doc.blocks imperatively — the wrapper-sanctioned path (DESIGN-DECISIONS:
 *  React must NOT own add/remove via JSX). Loop-safe: writes to the grid only on a
 *  real diff; handleChange writes to the doc only on a real diff → they converge. */
function GridReconciler({ doc }: { doc: EmailDoc }) {
  const { grid, addWidget, removeWidget } = useGridStack();
  useEffect(() => {
    if (!grid) return;
    const nodes = grid.engine.nodes;
    const docIds = new Set(doc.blocks.map((b) => b.id));
    // Remove grid widgets no longer in the doc.
    for (const n of [...nodes]) {
      if (n.id && !docIds.has(n.id) && n.el) removeWidget(n.el, true, false);
    }
    // Whole-doc swap (AI build): if almost nothing overlaps, reload wholesale.
    const overlap = doc.blocks.filter((b) => nodes.some((n) => n.id === b.id)).length;
    if (nodes.length > 0 && overlap === 0) {
      grid.removeAll(true);
      grid.load(toWidgets(doc.blocks));
      return;
    }
    let seedY = 0;
    for (const b of doc.blocks) {
      const node = nodes.find((n) => n.id === b.id);
      if (!node) {
        addWidget(toWidget(b, seedY)); // new block → add
      } else if (b.layout) {
        // Doc-driven geometry drift (width-preset button, AI edit) → push x/y/w
        // (never h — height is auto). Only when it actually differs, to avoid loops.
        const { x, y, w } = b.layout;
        if (node.x !== x || node.y !== y || node.w !== w) grid.update(node.el!, { x, y, w });
      }
      seedY += b.layout?.h ?? DEFAULT_H[b.type] ?? 4;
    }
  }, [doc.blocks, grid, addWidget, removeWidget]);
  return null;
}
```

- [ ] **Step 6: Write the `GridCanvas` body** — extend `onChangeDoc` to `(next, opts?: { autoHeightOnly?: boolean })`,
  keep `remove` (footer-guard toast) but call `onChangeDoc(next)` (delete = user action → undo frame),
  add the deterministic `handleChange`, seed `options` ONCE (stable — the reconciler owns runtime changes):

```tsx
  // Seeded ONCE — a stable options object so the wrapper never tears down/recreates
  // the grid. Runtime widget changes go through GridReconciler, not new options.
  const seededOptions = useMemo(
    () => ({ ...gridStackOptions(), children: toWidgets(doc.blocks) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed from the initial doc only
    [],
  );

  const docRef = useRef(doc);
  docRef.current = doc;

  /** GridStack `onChange` PROP handler. h-only diff → auto-height (no undo frame);
   *  any x/y/w change → user action (commit). Deterministic, order-independent. */
  function handleChange(_e: Event, nodes: GridStackNode[]) {
    const cur = docRef.current;
    let changed = false;
    let autoHeightOnly = true;
    const blocks = cur.blocks.map((b) => {
      const n = nodes.find((nn) => nn.id === b.id);
      if (!n) return b;
      const base = b.layout;
      const nx = n.x ?? 0, ny = n.y ?? 0, nw = n.w ?? GRID_COLS, nh = n.h ?? 1;
      if (base && nx === base.x && ny === base.y && nw === base.w && nh === base.h) return b;
      changed = true;
      if (!base || nx !== base.x || ny !== base.y || nw !== base.w) autoHeightOnly = false;
      return { ...b, layout: { ...(base ?? {}), x: nx, y: ny, w: nw, h: nh } as BlockLayout };
    });
    if (changed) onChangeDoc({ ...cur, blocks }, { autoHeightOnly });
  }

  const ctx: CanvasCtx = { doc, selectedId, onSelectBlock, onDuplicate, onBlockAi, onEditPhoto, remove };
```

Then the grid slot (outer chrome UNCHANGED — keep the `h-full overflow-y-auto` wrapper, the `w-[600px]`
card, the empty state, and the "click to add here" button exactly as today, lines ~171–312). Replace only
the `<ReactGridLayout>…</ReactGridLayout>` element with:

```tsx
          <CanvasContext.Provider value={ctx}>
            <GridStack options={seededOptions} components={{ BlockWidget }} onChange={handleChange as never}>
              <GridReconciler doc={doc} />
            </GridStack>
          </CanvasContext.Provider>
```

> `onChange` is a first-class `<GridStack>` prop (verified in the wrapper source) — do NOT hand-wire
> `grid.on("change")`. `GridReconciler` is the ONLY imperative widget owner.

- [ ] **Step 7: Typecheck + build**

Run: `bunx next build`
Expected: build succeeds with no type errors in `GridCanvas.tsx` / `EmailLabGridShell.tsx`. (This is the
verification bar for the canvas — GridStack DOM behavior is checked manually in Task 8.)

- [ ] **Step 8: Commit**

```bash
git add components/email-lab/GridCanvas.tsx
git commit -F - <<'EOF'
feat(email): rewrite GridCanvas onto GridStack (content auto-height, width-only resize)

Replaces react-grid-layout's fixed-height clipping cells with GridStack component
mode + grid-wide sizeToContent. Height is fully automatic; resize is width-only;
footer locked via noMove/noResize; content edits remeasure via resizeToContent;
auto-height changes route to autoHeightOnly (no undo frame).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: Simplify `EmailLabGridShell.tsx` layout math + route auto-height history

**Files:**
- Modify: `components/email-lab/EmailLabGridShell.tsx`
- 🟡 Read-only reference: `lib/email/doc/history.ts` (`patchPresent`), `components/email-lab/GridCanvas.tsx` (`DEFAULT_H`)

**Interfaces:**
- Consumes: `patchPresent` (Task 3), the extended `onChangeDoc(next, opts?)` from `GridCanvas` (Task 5).
- The shell's `commit` / `liveEdit` stay; add `patchPresentDoc`.

- [ ] **Step 1: Import `patchPresent`** — add to the existing history import block (lines ~28–37):

```ts
  patchPresent,
```

- [ ] **Step 2: Add a `patchPresentDoc` helper** beside `commit`/`liveEdit` (after line ~356):

```ts
  /** Auto-height geometry correction from GridStack — replace present in place, no
   *  undo frame (spec: auto-height must not pollute undo history). */
  function patchPresentDoc(next: EmailDoc) {
    setHistory((h) => patchPresent(h, next));
    onDocChange?.(next);
  }
```

- [ ] **Step 3: Route `GridCanvas`'s `onChangeDoc`** where the shell renders `<GridCanvas … onChangeDoc={…}>`

Find the `<GridCanvas` render (search `onChangeDoc={`) and change the handler to honor `autoHeightOnly`:

```tsx
        onChangeDoc={(next, opts) => (opts?.autoHeightOnly ? patchPresentDoc(next) : commit(next))}
```

- [ ] **Step 4: Retire `normalizeAuthorHeights` as a height source**

The author engine emits `{x,y,w}` with advisory `h=1`; GridStack now measures real height on mount, so
the row-restacking in `normalizeAuthorHeights` is dead weight. Replace both call sites
(`runAuthor` ~line 386, the autoGenerate effect ~line 425) — drop the wrapper, keep `applyBrand`:

```ts
          const normalized = applyBrand(parsed.data, brandTokens);
          commit(normalized);
```
```ts
            commit(applyBrand(parsed.data, brandTokens));
```

Then DELETE the `normalizeAuthorHeights` function (lines ~156–181). Keep `nextBottomY` and `ensureLayout`
— they still seed placement `y` (and a placeholder `h`) for add/duplicate before GridStack remeasures.

> Note: a fresh author doc lands with `h=1` on every block; GridStack's mount-time `sizeToContent`
> corrects each to real content height and writes it back via the `autoHeightOnly` change → `patchPresentDoc`.
> This is the self-heal path; verify it in Task 7 (open a freshly-built email, confirm no clipping and no
> spurious "unsaved" undo frame).

- [ ] **Step 5: Typecheck + build**

Run: `bunx next build`
Expected: succeeds; no reference to `normalizeAuthorHeights` remains.
Run: `git grep -n "normalizeAuthorHeights"`
Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add components/email-lab/EmailLabGridShell.tsx
git commit -F - <<'EOF'
feat(email): route GridStack auto-height to patchPresent; retire normalizeAuthorHeights

GridStack measures real content height on mount, so the static row-restacking is
gone. Auto-height changes patch present (no undo frame); user actions still commit.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7: Golden output render — reported-screenshot doc through Outlook + PDF engines

**The PDF/Outlook proof. Pure-function unit tests — no canvas involved.**

**Files:**
- Create: `lib/email/__tests__/grid-migration-golden.test.ts`
- Read-only reference: `lib/email/compile-grid.ts` (`compileGrid`), `lib/pdf/email-doc-pdf.tsx` (`EmailDocPdf`),
  `lib/email/doc/types.ts`.

**Interfaces:**
- Consumes: `compileGrid(doc): Promise<string>` (HTML), `EmailDocPdf({ doc })` (React element).

- [ ] **Step 1: Write the test** — reconstruct the reported clipping doc (long Sources citation text block,
  a stats row, a signal bullet block) as full-width stacked blocks with content-driven `h` values (as
  GridStack would persist them post-measure), and assert the OUTPUT groups them correctly:

```ts
// lib/email/__tests__/grid-migration-golden.test.ts
import { describe, expect, it } from "bun:test";
import { compileGrid } from "@/lib/email/compile-grid";
import type { EmailDoc } from "@/lib/email/doc/types";

const doc: EmailDoc = {
  globalStyle: {
    primaryColor: "#0b3c49", accentColor: "#17a3b3", textColor: "#111827",
    backdropColor: "#f3f4f6", fontFamily: "MODERN_SANS",
  },
  blocks: [
    { id: "hero", type: "hero", props: { value: "Lehigh Acres", label: "Market snapshot" },
      layout: { x: 0, y: 0, w: 12, h: 6 } },
    { id: "stats", type: "stats", props: { stats: [
      { value: "$389K", label: "Median" }, { value: "72", label: "DOM" }, { value: "1.2mo", label: "Supply" },
    ] }, layout: { x: 0, y: 6, w: 12, h: 5 } },
    { id: "sources", type: "text", props: {
      body: "Sources: SWFL Data Gulf lake as of 07/06/2026; a five-line citation paragraph that clipped mid-sentence in the old fixed-cell canvas and must now flow to full height in the sent output.",
    }, layout: { x: 0, y: 11, w: 12, h: 22 } }, // content-measured tall h
  ],
} as unknown as EmailDoc;

describe("GridStack migration — sent output stays correct with content-measured h", () => {
  it("full-width stack compiles to Outlook HTML with NO spurious ghost-table columns", async () => {
    const html = await compileGrid(doc);
    // Every block is its own full-bleed row → no multi-column ghost table is emitted.
    expect(html).not.toContain("<!--[if mso]><table"); // ghost table only for real multi-col rows
    // The full citation text survived (not clipped/truncated at the source).
    expect(html).toContain("must now flow to full height");
  });
});
```

- [ ] **Step 2: Run + verify pass**

Run: `bun test lib/email/__tests__/grid-migration-golden.test.ts`
Expected: PASS. (Confirms content-tall `h` does NOT turn a full-width stack into columns, and the text
is present in full — the Outlook path is unaffected by the new `h` values.)

- [ ] **Step 3: Add the PDF assertion** (append to the same `describe`) — assert the PDF document builds
  and includes every block (mirrors the existing 10-type fidelity guard; here we prove grouping doesn't drop one):

```ts
  it("builds the PDF document tree from the same doc with all blocks present", async () => {
    const { renderToString } = await import("@react-pdf/renderer");
    const { EmailDocPdf } = await import("@/lib/pdf/email-doc-pdf");
    const xml = await renderToString(EmailDocPdf({ doc }));
    expect(xml.length).toBeGreaterThan(0);
    expect(xml).toContain("Lehigh Acres"); // hero present
    expect(xml).toContain("Median");        // stats present
  });
```

> If `@react-pdf/renderer`'s `renderToString` is unavailable in the bun test env (native font/stream deps),
> fall back to asserting `EmailDocPdf({ doc })` returns a truthy React element and that `groupRows(doc.blocks)`
> yields 3 single-block rows — documenting the substitution in a comment. Do NOT skip silently.

- [ ] **Step 4: Run full suite for the output path**

Run: `bun test lib/email/doc/row-grouping.test.ts lib/email/compile-grid-columns.test.ts lib/email/__tests__/grid-migration-golden.test.ts lib/pdf/__tests__/email-doc-pdf.test.ts`
Expected: PASS (all). These are the engines the spec's Testing section names as "must keep passing."

- [ ] **Step 5: Commit**

```bash
git add lib/email/__tests__/grid-migration-golden.test.ts
git commit -F - <<'EOF'
test(email): golden output — reported clip doc compiles clean to Outlook + PDF

Proves content-measured h (the migration's change) leaves the full-width stacked
output correct: no spurious ghost-table columns, full citation text, all blocks in
the PDF. The PDF/Outlook safety deliverable.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 8: Manual dev-server verification + SESSION_LOG + push

**Files:**
- Modify: `SESSION_LOG.md` (new top entry before push — RULE 0)
- No source change.

- [ ] **Step 1: Run the app**

Run: `bun run dev` (or the project's dev script) and open the paid-tier email lab grid.
> Per the stale-dev-server memory: if new Tailwind variants look wrong, verify via `bunx next build` +
> `bun run start` instead of a long-lived `next dev`.

- [ ] **Step 2: Reproduce the reported doc** — build an email (AI "Build with AI", or add blocks) that
  contains: a long Sources citation text block, a stats row, and a signal bullet list. Confirm:
  - [ ] No block clips — the Sources line and every stat tile render in full (the reported bug is gone).
  - [ ] Corner-drag no longer changes height; only the east/west edges resize (width), snapping presets.
  - [ ] The footer/unsubscribe block cannot be moved or resized (locked).
  - [ ] Typing a long paragraph into a text block via the inspector grows its box (no scrollbar, no clip).
  - [ ] Undo after typing steps back one meaningful edit — auto-height reflows did NOT create extra undo frames.

- [ ] **Step 3: Self-heal on open** — save the doc, reload the page, reopen it in the grid editor. Confirm
  every block loads at correct content height (old stale `h` corrected on mount) and the doc is not marked
  dirty by the mount remeasure alone.

- [ ] **Step 4: Cross-engine parity** — from that doc, download the PDF and send/preview the email. Confirm
  a real 2-column row (if present) columns in BOTH; a full-width stack stacks in BOTH; nothing clips in the PDF.

- [ ] **Step 5: Write the SESSION_LOG entry** (top of file, append-only) summarizing the migration, the
  verified vendor facts (gridstack@12.6.0, cellHeight default 'auto' pinned to 50, float false,
  sizeToContent), and the PDF/Outlook grouping-safety tests.

- [ ] **Step 6: Full gate + push** (operator-approved; docs+feature — RULE 1 says ASK before pushing
  `/api`/MCP surface, but this is the email-lab canvas + tests, revertable; still STOP and get the
  explicit "push" per the no-autonomous-push memory)

Run: `bun test lib/email lib/pdf` (green), then `bunx next build` (green).
Then: present the commit list and ASK for push approval; on approval:
`OPERATOR_APPROVED_PUSH=1 node scripts/safe-push.mjs`

---

## Self-Review

**1. Spec coverage** (against `2026-07-06-email-grid-autoheight-gridstack-design.md`):
- Migrate RGL → GridStack `sizeToContent` → Task 4 (dep) + Task 5 (canvas). ✓
- `resizable: {handles:'e,w'}` width-only, no manual height → Task 2 (config) + Task 5. ✓
- `draggable: {handle:'.drag-handle'}` → Task 2 + Task 5. ✓
- Footer lock via `noResize`+`noMove` → Task 5 `toWidgets`. ✓
- Self-heal on open → Task 5 (mount remeasure) + Task 6 (author path) + Task 8 Step 3. ✓
- Non-drag content mutation → `resizeToContent` → Task 5 `BlockWidget` effect. ✓
- Undo/history: auto-height patches present, user actions push frame → Task 3 + Task 5 change-routing + Task 6. ✓
- `normalizeAuthorHeights`/`DEFAULT_H`-as-source simplified → Task 6 (retire) ; `DEFAULT_H` kept as seed → Task 5 Step 2. ✓
- `package.json` swap + CSS swap → Task 4 + Task 5 Step 1. ✓
- Existing suites keep passing → Task 7 Step 4. ✓
- New coverage (content-mutation grow, undo filter, footer lock) → Task 3 test, Task 7, Task 8 manual. ✓
- **Added beyond spec (the operator's PDF/Outlook ask + the spec's factual correction):** grouping-stability
  guard (Task 1) + golden output render (Task 7) + pinned cellHeight/float (Task 2). ✓

**2. Placeholder scan:** every code step carries real code; the two "port verbatim" notes point at exact
current line ranges (GridCanvas ~209–284, ~171–312) rather than restating unchanged chrome — acceptable
because it is a mechanical copy of existing, in-repo markup, with the exact prop→ctx swaps listed.

**3. Type consistency:** `gridStackOptions(): GridStackOptions` (Task 2) consumed in Task 5 `useMemo`;
`patchPresent(h, next)` (Task 3) consumed in Task 6 `patchPresentDoc`; `onChangeDoc(next, opts?)` extended
signature defined in Task 5 Interfaces and consumed in Task 6 Step 3; `DEFAULT_H` kept exported (Task 5
Step 2) and imported by the shell (unchanged). `GridStackWidget`/`GridStackNode` types imported from
`gridstack` in Task 5. Consistent.

**Open risk carried into execution (flagged, not blocking):** the 2×2 masonry projection (Task 1 case 3)
is a pre-existing lossy behavior locked, not fixed. If Task 8 Step 4 surfaces it in a real user layout,
the fix is a separate reviewed change (key band math on y-top proximity), per the safety plan — do not
fold it into this migration.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 2, Task 5 | `lib/email/grid-schema.ts` |
| 🟡 | Task 3, Task 6 | `lib/email/doc/history.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
