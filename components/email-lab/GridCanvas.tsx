"use client";
// components/email-lab/GridCanvas.tsx (Build G1 + G2 + content auto-height)
//
// The ONE canvas: a true 2D grid on react-grid-layout v2 (npm
// react-grid-layout@2.2.3). Began as the paid-tier SUPERSET sibling of the
// free-tier BlockCanvas (dnd-kit stacked reorder) — same core props (doc /
// selectedId / onSelectBlock / onChangeDoc) — but BlockCanvas was deleted in the
// 2026-07-07 retire-block-shell pass; the grid shell mounts this for every doc.
//
// CONTENT AUTO-HEIGHT (fixes the clip): every block measures its OWN rendered
// content with a ResizeObserver and reports the row-count it needs; its cell grows
// to fit, so content never clips. Height is automatic — the user only sets WIDTH
// (side handles / width presets). This replaces the old fixed h×rowHeight cell that
// clipped taller content (the reported Sources-line / stat-tile cut-off). Auto-height
// corrections route through onChangeDoc with { autoHeightOnly: true } so the shell
// patches them in place (no undo frame).
import { useCallback, useMemo, useRef, useEffect, useState } from "react";
import { applyTextAtPath } from "@/lib/email/doc/edit-path";
import type { EditCommit } from "@/lib/email/blocks/editable-text";
import { LINK_PROP, COLOR_PROP } from "@/lib/email/lab/block-edit-maps";
import { toast } from "sonner";
import ReactGridLayout, {
  verticalCompactor,
  type Layout,
  type LayoutItem,
  type ResizeHandleAxis,
} from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import type {
  BlockLayout,
  BlockType,
  EmailBlock,
  EmailDoc,
  EmailGlobalStyle,
} from "@/lib/email/doc/types";
import {
  GRID_COLS,
  GRID_MARGIN,
  GRID_ROW_HEIGHT,
  GRID_WIDTH,
  widthPresetLabel,
} from "@/lib/email/grid-schema";
import { BlockRenderer } from "@/lib/email/blocks/BlockRenderer";

// Width-only resize: the side handles change the width preset; height is
// content-driven, so there are no corner/vertical handles for a user to fight the
// auto-height with.
const RESIZE_HANDLES: ResizeHandleAxis[] = ["e", "w"];

// Placeholder row-spans for a block that arrives WITHOUT a `layout` — used only for
// the very first paint (avoids a zero-height flash) before the ResizeObserver's
// first measure lands and sets the real content height. Still exported: the shell
// seeds add/duplicate placements with it.
export const DEFAULT_H: Record<BlockType, number> = {
  header: 3,
  hero: 6,
  stats: 4,
  signal: 5,
  text: 5,
  image: 8,
  listing: 9,
  "multi-column": 5,
  list: 5,
  "metric-card": 4,
  "agent-card": 6,
  "agent-hero": 8,
  "social-icons": 2,
  button: 2,
  divider: 1,
  footer: 5,
  sources: 3,
};

/** Content pixel height → grid row count. RGL stacks h rows as
 *  `h*rowHeight + (h-1)*marginY` px, so the smallest h that fits `px` is
 *  `ceil((px + marginY) / (rowHeight + marginY))`. Min 1. */
function neededRows(px: number): number {
  const marginY = GRID_MARGIN[1];
  return Math.max(1, Math.ceil((px + marginY) / (GRID_ROW_HEIGHT + marginY)));
}

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

/** One grid child: our chrome (ring, width tag, drag handle, action pill) around
 *  BlockRenderer, PLUS a ResizeObserver on the natural-height content wrapper that
 *  reports the rows this block needs (grows AND shrinks with content). */
function GridBlock({
  block,
  globalStyle,
  selected,
  onSelect,
  onDuplicate,
  onBlockAi,
  onEditPhoto,
  onRemove,
  onAutoHeight,
  edit,
}: {
  block: EmailBlock;
  globalStyle: EmailGlobalStyle;
  selected: boolean;
  onSelect: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onBlockAi?: (id: string) => void;
  onEditPhoto?: (id: string) => void;
  onRemove: (id: string) => void;
  onAutoHeight: (id: string, rows: number) => void;
  /** Inline-edit commits (EditableText blur, pill popovers) — GridCanvas builds it. */
  edit?: { commit: EditCommit };
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const locked = block.type === "footer" && block.layout?.static;

  // Pill popovers (link / background color) — commit through the same inline-edit
  // path; empty link / "Default" color commit `undefined`, which deletes the key
  // so the component's `??` fallbacks re-apply.
  const [popover, setPopover] = useState<"link" | "color" | null>(null);
  const linkProp = LINK_PROP[block.type];
  const colorProp = COLOR_PROP[block.type];
  const propsRec = block.props as Record<string, unknown>;
  const currentLink = linkProp ? ((propsRec[linkProp] as string | undefined) ?? "") : "";
  const currentColor = colorProp
    ? ((propsRec[colorProp] as string | undefined) ?? "#ffffff")
    : "#ffffff";
  // Derived, not effect-synced (set-state-in-effect is a hard lint error here):
  // deselecting hides the popover; the pill buttons re-select as they open.
  const activePopover = selected ? popover : null;

  // Measure the block's NATURAL content height (the inner wrapper is not stretched,
  // so offsetHeight is the true content height, independent of the current cell) and
  // report the rows it needs. Re-fires on any content/width reflow via the observer.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => onAutoHeight(block.id, neededRows(el.offsetHeight));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [block.id, onAutoHeight]);

  return (
    <div
      onClick={() => onSelect(block.id)}
      className={`group relative h-full w-full cursor-pointer overflow-hidden rounded-[3px] transition-shadow ${
        selected
          ? "ring-2 ring-inset ring-gulf-teal"
          : "ring-1 ring-inset ring-transparent hover:ring-gray-300"
      }`}
    >
      {/* width tag — only on the selected block */}
      {selected && (
        <div className="pointer-events-none absolute -top-0 left-0 z-20 rounded-br-md rounded-tl-[3px] bg-gulf-teal px-2 py-0.5 text-[10px] font-semibold text-[#06222a]">
          ✦ Selected · {widthPresetLabel(block.layout?.w ?? GRID_COLS)} width
        </div>
      )}

      {/* drag handle — always visible, left edge */}
      <div
        role="button"
        aria-label="Drag to move"
        title={locked ? "Locked block" : "Drag to move"}
        onClick={(e) => e.stopPropagation()}
        className={`drag-handle absolute bottom-0 left-0 top-0 z-10 flex cursor-grab select-none items-center px-1 text-base leading-none active:cursor-grabbing ${
          locked ? "cursor-not-allowed text-gray-200" : "text-gray-300 hover:text-gray-600"
        }`}
      >
        ⠿
      </div>

      {/* action pill — visible on hover, pinned when selected */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute right-1 top-1 z-20 flex items-center gap-0.5 rounded-md bg-white/95 px-1 py-0.5 shadow-sm ring-1 ring-gray-200 transition-opacity ${
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <button
          type="button"
          aria-label="AI: edit this block"
          title="Ask AI to edit this block"
          onClick={() => (onBlockAi ? onBlockAi(block.id) : onSelect(block.id))}
          className="px-1 text-sm leading-none text-gulf-teal hover:text-[#17a3b3]"
        >
          ✦
        </button>
        {edit && linkProp && (
          <button
            type="button"
            aria-label="Edit link"
            title="Link"
            onClick={() => {
              onSelect(block.id);
              setPopover((p) => (selected && p === "link" ? null : "link"));
            }}
            className="px-1 text-sm leading-none text-gray-400 hover:text-gulf-teal"
          >
            🔗
          </button>
        )}
        {edit && colorProp && (
          <button
            type="button"
            aria-label="Edit background color"
            title="Background"
            onClick={() => {
              onSelect(block.id);
              setPopover((p) => (selected && p === "color" ? null : "color"));
            }}
            className="px-1 text-sm leading-none text-gray-400 hover:text-gulf-teal"
          >
            ▨
          </button>
        )}
        {(block.type === "image" || block.type === "listing") && onEditPhoto && (
          <button
            type="button"
            aria-label="Change photo"
            title="Change photo"
            onClick={() => onEditPhoto(block.id)}
            className="px-1 text-sm leading-none text-gray-400 hover:text-gray-700"
          >
            ◧
          </button>
        )}
        {onDuplicate && !locked && (
          <button
            type="button"
            aria-label="Duplicate block"
            title="Duplicate"
            onClick={() => onDuplicate(block.id)}
            className="px-1 text-sm leading-none text-gray-400 hover:text-gulf-teal"
          >
            ⧉
          </button>
        )}
        <button
          type="button"
          aria-label="Delete block"
          title={locked ? "Required (unsubscribe)" : "Delete"}
          onClick={() => onRemove(block.id)}
          className={`px-1 text-sm leading-none ${
            locked ? "cursor-not-allowed text-gray-200" : "text-red-400 hover:text-red-600"
          }`}
        >
          ✕
        </button>
      </div>

      {/* anchored pill popover — link / background color */}
      {activePopover && edit && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-1 top-8 z-30 flex items-center gap-1.5 rounded-md bg-white p-2 shadow-md ring-1 ring-gray-200"
        >
          {activePopover === "link" && linkProp && (
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                const v = new FormData(e.currentTarget).get("url");
                const url = typeof v === "string" ? v.trim() : "";
                edit.commit(block.id, linkProp, url === "" ? undefined : url);
                setPopover(null);
              }}
            >
              <input
                name="url"
                type="url"
                defaultValue={currentLink}
                placeholder="https://…"
                className="w-52 rounded border border-gray-300 px-2 py-1 text-xs text-gray-900"
              />
              <button
                type="submit"
                className="rounded bg-gulf-teal px-2 py-1 text-xs font-semibold text-[#06231f]"
              >
                Save
              </button>
            </form>
          )}
          {activePopover === "color" && colorProp && (
            <>
              <input
                type="color"
                defaultValue={/^#[0-9a-fA-F]{6}$/.test(currentColor) ? currentColor : "#ffffff"}
                onBlur={(e) => {
                  edit.commit(block.id, colorProp, e.currentTarget.value);
                  setPopover(null);
                }}
                className="h-7 w-9 cursor-pointer rounded border border-gray-300"
              />
              <button
                type="button"
                onClick={() => {
                  edit.commit(block.id, colorProp, undefined);
                  setPopover(null);
                }}
                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:text-gray-900"
              >
                Default
              </button>
            </>
          )}
        </div>
      )}

      {/* Clicks flow INTO the content now (inline editing); block-select still
          works via bubbling to this wrapper. Anchors are intercepted so a linked
          block never navigates mid-design. The inner div is NOT height-constrained,
          so its offsetHeight is the true content height we measure for auto-height. */}
      <div
        className="h-full"
        onClickCapture={(e) => {
          if ((e.target as HTMLElement).closest("a")) e.preventDefault();
        }}
      >
        <div ref={contentRef}>
          <BlockRenderer block={block} globalStyle={globalStyle} edit={edit} />
        </div>
      </div>
    </div>
  );
}

export function GridCanvas({
  doc,
  selectedId,
  onSelectBlock,
  onChangeDoc,
  onDuplicate,
  onAddBlock,
  onBlockAi,
  onEditPhoto,
}: {
  doc: EmailDoc;
  selectedId: string | null;
  onSelectBlock: (id: string | null) => void;
  /** `autoHeightOnly` marks a content-measured height correction — the shell patches
   *  it in place (no undo frame); user actions omit it and push a normal frame. */
  onChangeDoc: (next: EmailDoc, opts?: { autoHeightOnly?: boolean }) => void;
  /** Duplicate a block (shell mints the id + places the copy on the grid). */
  onDuplicate?: (id: string) => void;
  /** Click the "add here" tile → shell adds a block on the grid. */
  onAddBlock?: () => void;
  /** Per-block AI button → shell selects the block and focuses the AI panel. */
  onBlockAi?: (id: string) => void;
  /** Edit-photo button (image / listing) → shell opens the photos panel. */
  onEditPhoto?: (id: string) => void;
}) {
  // Stable layout identity → RGL doesn't recompact on unrelated re-renders. Also the
  // BASELINE we diff writebacks against.
  const layout = useMemo(() => buildLayout(doc.blocks), [doc.blocks]);

  // Latest doc for the (stable) auto-height callback — the ResizeObserver captures
  // the callback once, so it must read fresh state via a ref rather than a closure.
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  });

  const onAutoHeight = useCallback(
    (id: string, rows: number) => {
      const cur = docRef.current;
      const b = cur.blocks.find((x) => x.id === id);
      if (!b) return;
      const curH = b.layout?.h ?? DEFAULT_H[b.type] ?? 4;
      if (curH === rows) return; // no change → no write (guards the loop)
      const base: BlockLayout = b.layout ?? {
        x: 0,
        y: 0,
        w: GRID_COLS,
        h: rows,
        static: b.type === "footer" ? true : undefined,
      };
      const blocks = cur.blocks.map((x) =>
        x.id === id ? { ...x, layout: { ...base, h: rows } } : x,
      );
      onChangeDoc({ ...cur, blocks }, { autoHeightOnly: true });
    },
    [onChangeDoc],
  );

  // Inline-edit commits (EditableText blur, pill popovers) — one write path
  // through applyTextAtPath into a NORMAL undo frame (unlike autoHeightOnly).
  const handleEditCommit = useCallback<EditCommit>(
    (blockId, path, text) => {
      const cur = docRef.current;
      const blocks = cur.blocks.map((b) => (b.id === blockId ? applyTextAtPath(b, path, text) : b));
      onChangeDoc({ ...cur, blocks });
    },
    [onChangeDoc],
  );
  const edit = useMemo(() => ({ commit: handleEditCommit }), [handleEditCommit]);

  // RGL fires onLayoutChange once on mount (after compaction) and after every
  // drag/resize. Commit ONLY a real geometry change vs the baseline we fed in.
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
                // style/className + ref + handlers + resize handles onto it. All of
                // OUR chrome lives inside GridBlock so RGL never clobbers it.
                <div key={block.id}>
                  <GridBlock
                    block={block}
                    globalStyle={doc.globalStyle}
                    selected={block.id === selectedId}
                    onSelect={onSelectBlock}
                    onDuplicate={onDuplicate}
                    onBlockAi={onBlockAi}
                    onEditPhoto={onEditPhoto}
                    onRemove={remove}
                    onAutoHeight={onAutoHeight}
                    edit={edit}
                  />
                </div>
              ))}
            </ReactGridLayout>
          )}
        </div>

        {/* "click to add here" — adds a block straight onto the grid (the shell
            places it at the bottom; the user then drags/resizes/AI-fills it). */}
        {onAddBlock && (
          <button
            type="button"
            onClick={onAddBlock}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-white/60 py-4 text-sm font-medium text-gray-400 transition-colors hover:border-gulf-teal hover:text-gulf-teal"
          >
            <span className="text-lg leading-none">＋</span>
            Click to add a block — or ask the AI to drop one in
          </button>
        )}
      </div>
    </div>
  );
}
