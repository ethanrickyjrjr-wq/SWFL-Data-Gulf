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

  // ── Footer-last invariant (operator decree 07/16/2026): the CAN-SPAM footer
  // closes the email, in every engine, no matter what positions the doc carries.
  // The live failure: canvas add-paths stacked blocks BELOW the static footer and
  // upsertChartBlock dropped a chart's layout — both rendered under the footer. ──

  it("footer renders last even when other blocks were positioned below it", () => {
    // Mirrors deliverable 76680c85: footer y=24 h=4, agent-card/button parked at y=28.
    const footer = {
      id: "f",
      type: "footer",
      props: {},
      layout: { x: 0, y: 24, w: 12, h: 4, static: true },
    } as unknown as EmailBlock;
    const rows = groupRows([
      blk("text", { x: 0, y: 20, w: 12, h: 2 }),
      footer,
      blk("agent", { x: 0, y: 28, w: 7, h: 4 }),
      blk("btn", { x: 7, y: 28, w: 5, h: 3 }),
    ]);
    expect(rows.map((r) => r.map((d) => d.block.id))).toEqual([["text"], ["agent", "btn"], ["f"]]);
  });

  it("footer stays its own row — it never band-merges with the row it now follows", () => {
    // After the re-order the footer's stored y (24) overlaps the agent row's band
    // (28..32); banding must not swallow it into that row.
    const footer = {
      id: "f",
      type: "footer",
      props: {},
      layout: { x: 0, y: 24, w: 12, h: 4 },
    } as unknown as EmailBlock;
    const rows = groupRows([footer, blk("agent", { x: 0, y: 28, w: 12, h: 8 })]);
    expect(rows).toHaveLength(2);
    expect(rows[1].map((d) => d.block.id)).toEqual(["f"]);
  });

  it("a no-layout block sinks to the bottom of CONTENT — above the footer, never below", () => {
    // The upsertChartBlock failure shape: chart replaced its slot but lost layout.
    const footer = {
      id: "f",
      type: "footer",
      props: {},
      layout: { x: 0, y: 6, w: 12, h: 4 },
    } as unknown as EmailBlock;
    const rows = groupRows([blk("hero", { x: 0, y: 0, w: 12, h: 6 }), footer, blk("chart")]);
    expect(rows.map((r) => r[0].block.id)).toEqual(["hero", "chart", "f"]);
    expect(rows[1][0].eff.w).toBe(12);
  });

  it("a footer with NO layout still lands last, not banded into the fallback tail", () => {
    const footer = { id: "f", type: "footer", props: {} } as unknown as EmailBlock;
    const rows = groupRows([blk("hero", { x: 0, y: 0, w: 12, h: 6 }), footer, blk("late")]);
    expect(rows.map((r) => r[0].block.id)).toEqual(["hero", "late", "f"]);
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
});
