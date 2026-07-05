// lib/email/doc/row-grouping.ts — THE row-grouping root.
//
// "Which positioned blocks share a visual row" is answered here and ONLY here.
// Two engines consume it: compile-grid (HTML columns via the Cerberus hybrid
// pattern) and the PDF engine (flex rows). Before extraction this logic lived
// privately in compile-grid, and the PDF simply stacked every block — the
// portrait-beside-letter row compiled as true columns in email HTML but
// stacked in the attached/downloaded PDF. One root, both engines agree.
//
// Band rule (a strict superset of "group by layout.y"): blocks whose vertical
// band (y .. y+h) overlaps the row's running band join it — this also handles
// react-grid-layout vertical compaction, where side-by-side columns of UNEQUAL
// height get different y values. We only read positions; compaction happened
// upstream. Blocks without a `layout` sort AFTER positioned ones, in original
// array order, each as its own full-bleed row.

import { GRID_COLS } from "../grid-schema";
import type { EmailBlock } from "./types";

export interface EffLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A block's effective grid position — no `layout` reads as a full-bleed row at `fallbackY`. */
export function effectiveLayout(block: EmailBlock, fallbackY: number): EffLayout {
  const l = block.layout;
  return {
    x: l?.x ?? 0,
    y: l?.y ?? fallbackY,
    w: l?.w ?? GRID_COLS,
    h: l?.h ?? 1,
  };
}

export interface RowEntry {
  block: EmailBlock;
  eff: EffLayout;
}

/** Group blocks into visual rows (band overlap), each row ordered by x then
 *  original index. */
export function groupRows(blocks: EmailBlock[]): RowEntry[][] {
  const FALLBACK_BASE = 1_000_000;
  const decorated = blocks.map((block, i) => ({
    block,
    i,
    eff: effectiveLayout(block, FALLBACK_BASE + i),
  }));
  decorated.sort((a, b) => a.eff.y - b.eff.y || a.eff.x - b.eff.x || a.i - b.i);

  const rows: (typeof decorated)[] = [];
  let cur: typeof decorated = [];
  let curBottom = Number.NEGATIVE_INFINITY;
  for (const d of decorated) {
    if (cur.length === 0 || d.eff.y < curBottom) {
      cur.push(d);
      curBottom = Math.max(curBottom, d.eff.y + d.eff.h);
    } else {
      rows.push(cur);
      cur = [d];
      curBottom = d.eff.y + d.eff.h;
    }
  }
  if (cur.length) rows.push(cur);

  return rows.map((r) =>
    [...r].sort((a, b) => a.eff.x - b.eff.x || a.i - b.i).map(({ block, eff }) => ({ block, eff })),
  );
}
