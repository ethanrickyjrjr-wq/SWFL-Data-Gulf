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

/** Place freshly-loaded dataset blocks under the existing canvas content:
 *  relative layout preserved, everything shifted below the current bottom, and
 *  ids re-minted deterministically when they collide with blocks already on
 *  the canvas (loading the same dataset twice must not fork React keys). */
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
