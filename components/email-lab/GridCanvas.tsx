"use client";
// components/email-lab/GridCanvas.tsx (Build G1 — operator track)
//
// The PAID-tier resizable/movable canvas: a true 2D grid built on
// react-grid-layout v2 (verified in-session via crawl4ai 06/28/2026 — npm
// react-grid-layout@2.2.3, README v2 + dist .d.ts). It is the SUPERSET sibling
// of the free-tier `BlockCanvas` (dnd-kit stacked reorder): same props contract
// (`doc / selectedId / onSelectBlock / onChangeDoc`) so the shell (Build G4) can
// pick GridCanvas for grid docs and keep BlockCanvas for no-`layout` docs —
// nothing downgraded.
//
// Scope of G1 (acceptance): drag moves a block, corner-drag resizes, the new
// position flows back into `block.layout`, the preview reflects the new columns;
// the free-tier stacked canvas still works (untouched). DELIBERATELY DEFERRED:
//   • per-block AI / visible toolbar / "Edit photo"  → G2 (block-toolbar)
//   • adding blocks on the grid                       → G2 / G4
//   • aspect-lock on photo resize                     → needs image natural size
//     (Config note in the spec, not in G1 acceptance) → G2 / G3 photo work
//
// NOTE — "wrap the existing CanvasBlock" (spec) is reinterpreted: `CanvasBlock`
// is hard-wired to dnd-kit `useSortable`, which only works inside a DndContext;
// nesting it under RGL would pit two drag systems against each other. So this
// renders the SAME pure block (`BlockRenderer`) with its own ring/handle/delete
// chrome, RGL-driven. G2 unifies the cell chrome (CanvasBlock ⇄ grid cell).
//
// KNOWN TENSION (surfaced, not solved in G1): RGL cells are a fixed
// height = h × rowHeight, but email blocks are content-driven height. Content
// taller than the cell is clipped (`overflow-hidden` keeps the box truthful so
// the user resizes to fit). Height auto-sync is out of scope for G1.
import { useMemo } from "react";
import { toast } from "sonner";
import ReactGridLayout, {
  verticalCompactor,
  type Layout,
  type LayoutItem,
  type ResizeHandleAxis,
} from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import type { BlockLayout, BlockType, EmailBlock, EmailDoc } from "@/lib/email/doc/types";
import { GRID_COLS, GRID_MARGIN, GRID_ROW_HEIGHT, GRID_WIDTH } from "@/lib/email/grid-schema";
import { BlockRenderer } from "@/lib/email/blocks/BlockRenderer";

// Corner handles only (spec). ResizeHandleAxis ⊂ {s,w,e,n,sw,nw,se,ne}.
const RESIZE_HANDLES: ResizeHandleAxis[] = ["se", "sw", "ne", "nw"];

// Default row-spans (× rowHeight 30) for a block that arrives WITHOUT a `layout`
// — only used to render it on the grid; never auto-committed to the doc (below).
// Stacked compactly so RGL's mount-time vertical compaction is a no-op.
const DEFAULT_H: Record<BlockType, number> = {
  header: 3,
  hero: 6,
  stats: 4,
  signal: 5,
  text: 5,
  image: 8,
  "agent-card": 6,
  "agent-hero": 8,
  "social-icons": 2,
  button: 2,
  divider: 1,
  footer: 5,
};

/** Doc blocks → RGL layout. Blocks with `layout` pass through (constraints kept);
 *  blocks without get a full-width, vertically-stacked default (footer locked). */
function buildLayout(blocks: EmailBlock[]): LayoutItem[] {
  let cursorY = 0;
  return blocks.map((b) => {
    if (b.layout) {
      const { x, y, w, h, minW, maxW, minH, maxH, static: isStatic } = b.layout;
      return { i: b.id, x, y, w, h, minW, maxW, minH, maxH, static: isStatic };
    }
    const h = DEFAULT_H[b.type] ?? 4;
    const item: LayoutItem = {
      i: b.id,
      x: 0,
      y: cursorY,
      w: GRID_COLS,
      h,
      static: b.type === "footer",
    };
    cursorY += h;
    return item;
  });
}

export function GridCanvas({
  doc,
  selectedId,
  onSelectBlock,
  onChangeDoc,
}: {
  doc: EmailDoc;
  selectedId: string | null;
  onSelectBlock: (id: string | null) => void;
  onChangeDoc: (next: EmailDoc) => void;
}) {
  // Stable layout identity → RGL doesn't recompact on unrelated re-renders
  // (e.g. a selection change). Also the BASELINE we diff writebacks against.
  const layout = useMemo(() => buildLayout(doc.blocks), [doc.blocks]);

  // RGL fires onLayoutChange once on mount (after compaction) and after every
  // drag/resize. Commit ONLY a real geometry change vs the baseline we fed in —
  // otherwise mount → writeback → recompact loops (and dirties a freshly loaded
  // doc / adds a bogus history entry). Synthesized defaults are compact already,
  // so the mount pass is a no-op and is never committed.
  function handleLayoutChange(next: Layout) {
    const baseline = new Map(layout.map((it) => [it.i, it]));
    let changed = false;
    const blocks = doc.blocks.map((b) => {
      const item = next.find((it) => it.i === b.id);
      const base = baseline.get(b.id);
      if (!item || !base) return b;
      if (item.x === base.x && item.y === base.y && item.w === base.w && item.h === base.h) {
        return b;
      }
      changed = true;
      // Take ONLY geometry from RGL; preserve constraints from the existing
      // layout (RGL's echo of minW/static is not authoritative for us).
      const nextLayout: BlockLayout = {
        ...(b.layout ?? {}),
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
      };
      return { ...b, layout: nextLayout };
    });
    if (changed) onChangeDoc({ ...doc, blocks });
  }

  function remove(id: string) {
    if (doc.blocks.length <= 1) return;
    const target = doc.blocks.find((b) => b.id === id);
    if (target?.type === "footer") {
      const footerCount = doc.blocks.filter((b) => b.type === "footer").length;
      if (footerCount <= 1) {
        toast.error(
          "Unsubscribe link is required in all emails — move it anywhere, but it can't be removed.",
        );
        return;
      }
    }
    onChangeDoc({ ...doc, blocks: doc.blocks.filter((b) => b.id !== id) });
    if (selectedId === id) onSelectBlock(null);
  }

  return (
    <div
      className="h-full overflow-y-auto bg-gray-100 px-4 py-8"
      onClick={() => onSelectBlock(null)}
    >
      <div className="mx-auto w-[600px] max-w-full" onClick={(e) => e.stopPropagation()}>
        <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-200">
          {doc.blocks.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-gray-400">
              Your email is empty — add a block to start.
            </div>
          ) : (
            <ReactGridLayout
              layout={layout}
              width={GRID_WIDTH}
              gridConfig={{ cols: GRID_COLS, rowHeight: GRID_ROW_HEIGHT, margin: GRID_MARGIN }}
              dragConfig={{ enabled: true, handle: ".drag-handle" }}
              resizeConfig={{ enabled: true, handles: RESIZE_HANDLES }}
              compactor={verticalCompactor}
              onLayoutChange={handleLayoutChange}
            >
              {doc.blocks.map((block) => (
                // Direct child stays a plain div — RGL injects positioning
                // style/className + ref + mouse/touch handlers + resize handles
                // onto it. All of OUR chrome lives on the inner div so RGL never
                // clobbers it.
                <div key={block.id}>
                  <div
                    onClick={() => onSelectBlock(block.id)}
                    className={`group relative h-full w-full cursor-pointer overflow-hidden transition-shadow ${
                      block.id === selectedId
                        ? "ring-2 ring-inset ring-gulf-teal"
                        : "ring-1 ring-inset ring-transparent hover:ring-gray-300"
                    }`}
                  >
                    {/* drag handle — RGL's dragConfig.handle selector targets this */}
                    <div
                      role="button"
                      aria-label="Drag to move"
                      onClick={(e) => e.stopPropagation()}
                      className="drag-handle absolute left-1 top-1 z-10 cursor-grab select-none px-1 text-base leading-none text-gray-300 opacity-0 hover:text-gray-500 group-hover:opacity-100 active:cursor-grabbing"
                    >
                      ⠿
                    </div>
                    <button
                      type="button"
                      aria-label="Delete block"
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(block.id);
                      }}
                      className="absolute right-1 top-1 z-10 rounded bg-white/90 px-1.5 py-0.5 text-sm leading-none text-red-500 opacity-0 shadow-sm hover:bg-white group-hover:opacity-100"
                    >
                      ✕
                    </button>
                    {/* pointer-events off so the wrapper owns the click/select */}
                    <div className="pointer-events-none h-full">
                      <BlockRenderer block={block} globalStyle={doc.globalStyle} />
                    </div>
                  </div>
                </div>
              ))}
            </ReactGridLayout>
          )}
        </div>
      </div>
    </div>
  );
}
