// lib/concoctions/place-blocks.ts — pure canvas placement for freshly
// materialized dataset blocks. Shared by the lab browser (client) and the
// author-path seeder (server).
import type { EmailBlock } from "@/lib/email/doc/types";

function bottomY(blocks: EmailBlock[]): number {
  return blocks.reduce((max, b) => {
    const l = b.layout;
    return l ? Math.max(max, l.y + l.h) : max;
  }, 0);
}

/** The bottom of the CONTENT — footers excluded. This is where a NEW block goes
 *  (the footer closes the email; nothing is ever placed under it). The lab shell
 *  had its own bottom-of-everything copy that INCLUDED the static footer, which
 *  is exactly how add-block/duplicate/photo-add parked blocks beneath the
 *  unsubscribe line (deliverable 76680c85, 07/16/2026). */
export function contentBottomY(blocks: EmailBlock[]): number {
  return bottomY(blocks.filter((b) => b.type !== "footer"));
}

/**
 * FOOTER LAST, on the canvas too. If any content block's band reaches past a
 * footer's top edge, that footer is moved to the bottom of the content and to
 * the END of the array. A doc already in shape is returned UNTOUCHED (same
 * reference), so callers can run this on every commit for free. A deliberate
 * gap above the footer is respected — only violations move it.
 *
 * The render engines enforce the same invariant independently
 * (lib/email/doc/row-grouping.ts); this keeps the editing canvas honest so the
 * preview and the sent email tell one story.
 */
export function pushFooterBelowContent(blocks: EmailBlock[]): EmailBlock[] {
  const footers = blocks.filter((b) => b.type === "footer" && b.layout);
  if (footers.length === 0) return blocks;
  const body = blocks.filter((b) => !footers.includes(b));
  const bottom = bottomY(body);
  if (footers.every((f) => f.layout!.y >= bottom)) return blocks;
  let y = bottom;
  const pushed = footers.map((f) => {
    const moved = { ...f, layout: { ...f.layout!, y } } as EmailBlock;
    y += f.layout!.h;
    return moved;
  });
  return [...body, ...pushed];
}

/**
 * Insert dataset blocks into a doc ABOVE ITS FOOTER, and return the whole block
 * list. This is the one place that answers "where does loaded data go" — the lab
 * shell and the author-path seeder both call it.
 *
 * The 07/13/2026 live-verify caught the bug this exists to prevent: both callers
 * appended blindly, and because the footer is just another block (and the lowest
 * one on the grid), the loaded data landed BELOW the unsubscribe line — in the
 * array and in the y-coordinates. Fixing only the array order would still have
 * rendered it underneath. So the body is stacked on, the data goes below the
 * body, and the footer is pushed down past it.
 */
export function insertDatasetBlocks(existing: EmailBlock[], loaded: EmailBlock[]): EmailBlock[] {
  const footers = existing.filter((b) => b.type === "footer");
  if (footers.length === 0) return [...existing, ...placeLoadedBlocks(existing, loaded)];
  const body = existing.filter((b) => b.type !== "footer");
  const placed = placeLoadedBlocks(body, loaded);
  const shift = bottomY(placed) - bottomY(body); // exact height of the new stack
  const pushed = footers.map((b) =>
    b.layout ? { ...b, layout: { ...b.layout, y: b.layout.y + shift } } : b,
  );
  return [...body, ...placed, ...pushed];
}

/** Place freshly-loaded dataset blocks under the existing canvas content:
 *  relative layout preserved, everything shifted below the current bottom, and
 *  ids re-minted deterministically when they collide with blocks already on
 *  the canvas (loading the same dataset twice must not fork React keys).
 *  Footer-awareness lives in insertDatasetBlocks above — this stacks below
 *  whatever it is handed. */
export function placeLoadedBlocks(existing: EmailBlock[], loaded: EmailBlock[]): EmailBlock[] {
  const base = bottomY(existing);
  const taken = new Set(existing.map((b) => b.id));
  return loaded.map((b) => {
    let id = b.id;
    let k = 2;
    while (taken.has(id)) id = `${b.id}-${k++}`;
    taken.add(id);
    const layout = b.layout
      ? { ...b.layout, y: b.layout.y + base }
      : { x: 0, y: base, w: 12, h: 4 };
    return { ...b, id, layout } as EmailBlock;
  });
}
