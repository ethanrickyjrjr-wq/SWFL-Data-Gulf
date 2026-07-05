// lib/email/doc/row-grouping.test.ts — the ONE row-grouping root (compile-grid
// + the PDF engine both consume it; a drifted copy is how side-by-side rows
// stack in one engine and column in another).
import { describe, expect, it } from "bun:test";
import { groupRows } from "./row-grouping";
import type { EmailBlock } from "./types";

const blk = (id: string, layout?: { x: number; y: number; w: number; h: number }): EmailBlock =>
  ({ id, type: "text", props: { body: id }, ...(layout ? { layout } : {}) }) as EmailBlock;

describe("groupRows", () => {
  it("5+7 on one y-band is one row of two, ordered by x", () => {
    const rows = groupRows([
      blk("b", { x: 5, y: 0, w: 7, h: 6 }),
      blk("a", { x: 0, y: 0, w: 5, h: 6 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].map((d) => d.block.id)).toEqual(["a", "b"]);
    expect(rows[0].map((d) => d.eff.w)).toEqual([5, 7]);
  });

  it("6+6 with unequal heights (RGL vertical compaction) still shares a row", () => {
    const rows = groupRows([
      blk("a", { x: 0, y: 0, w: 6, h: 6 }),
      blk("b", { x: 6, y: 2, w: 6, h: 3 }),
    ]);
    expect(rows).toHaveLength(1);
  });

  it("a block at/below the band bottom opens a new row; no-layout blocks trail full-bleed", () => {
    const rows = groupRows([
      blk("a", { x: 0, y: 0, w: 6, h: 2 }),
      blk("c", { x: 0, y: 2, w: 12, h: 2 }),
      blk("z"),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[2][0].eff.w).toBe(12);
  });
});
