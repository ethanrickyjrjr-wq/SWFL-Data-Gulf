// lib/concoctions/place-blocks.test.ts — pure canvas placement.
//
// The footer-last half of the 07/16/2026 operator decree: the render engines
// force the footer last (lib/email/doc/row-grouping.ts), and THESE helpers keep
// the canvas telling the same story — new blocks land above the footer, and a
// doc whose footer got buried (canvas add-paths used to stack below the static
// footer) is straightened out on open/commit instead of saved broken.

import { describe, expect, it } from "bun:test";
import type { EmailBlock } from "@/lib/email/doc/types";
import { contentBottomY, insertDatasetBlocks, pushFooterBelowContent } from "./place-blocks";

const blk = (
  id: string,
  type: string,
  layout?: { x: number; y: number; w: number; h: number; static?: boolean },
): EmailBlock => ({ id, type, props: {}, ...(layout ? { layout } : {}) }) as EmailBlock;

describe("contentBottomY", () => {
  it("is the bottom of the CONTENT — the footer does not count", () => {
    const blocks = [
      blk("a", "hero", { x: 0, y: 0, w: 12, h: 6 }),
      blk("f", "footer", { x: 0, y: 6, w: 12, h: 4 }),
    ];
    expect(contentBottomY(blocks)).toBe(6);
  });

  it("no layouts → 0", () => {
    expect(contentBottomY([blk("a", "text")])).toBe(0);
  });
});

describe("pushFooterBelowContent", () => {
  it("pushes a buried footer below the content and re-orders it to the array end", () => {
    // Deliverable 76680c85: footer y=24 h=4, agent-card/button parked at y=28.
    const blocks = [
      blk("text", "text", { x: 0, y: 20, w: 12, h: 4 }),
      blk("f", "footer", { x: 0, y: 24, w: 12, h: 4, static: true }),
      blk("agent", "agent-card", { x: 0, y: 28, w: 7, h: 4 }),
      blk("btn", "button", { x: 7, y: 28, w: 5, h: 3 }),
    ];
    const next = pushFooterBelowContent(blocks);
    expect(next.map((b) => b.id)).toEqual(["text", "agent", "btn", "f"]);
    const footer = next.find((b) => b.id === "f")!;
    expect(footer.layout?.y).toBe(32); // below the agent row's bottom
    expect(footer.layout?.static).toBe(true); // lock survives the push
  });

  it("returns the SAME array when the footer is already below everything", () => {
    const blocks = [
      blk("a", "hero", { x: 0, y: 0, w: 12, h: 6 }),
      blk("f", "footer", { x: 0, y: 6, w: 12, h: 4 }),
    ];
    expect(pushFooterBelowContent(blocks)).toBe(blocks);
  });

  it("leaves a deliberate gap above the footer alone (only violations move it)", () => {
    const blocks = [
      blk("a", "hero", { x: 0, y: 0, w: 12, h: 6 }),
      blk("f", "footer", { x: 0, y: 10, w: 12, h: 4 }),
    ];
    expect(pushFooterBelowContent(blocks)).toBe(blocks);
  });

  it("no footer → unchanged", () => {
    const blocks = [blk("a", "hero", { x: 0, y: 0, w: 12, h: 6 })];
    expect(pushFooterBelowContent(blocks)).toBe(blocks);
  });
});

describe("insertDatasetBlocks (existing root — regression)", () => {
  it("still lands loaded blocks above the footer and pushes it down", () => {
    const existing = [
      blk("a", "hero", { x: 0, y: 0, w: 12, h: 6 }),
      blk("f", "footer", { x: 0, y: 6, w: 12, h: 4 }),
    ];
    const next = insertDatasetBlocks(existing, [blk("d", "table", { x: 0, y: 0, w: 12, h: 5 })]);
    expect(next.map((b) => b.id)).toEqual(["a", "d", "f"]);
    expect(next.find((b) => b.id === "f")!.layout?.y).toBe(11);
  });
});
