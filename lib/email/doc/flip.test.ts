// lib/email/doc/flip.test.ts — flip-to-correct (M2), pure & deterministic.
import { describe, expect, test } from "bun:test";
import { flipAlign, flipBlockSide } from "./flip";
import type { EmailBlock } from "./types";

const block = (type: string, props: Record<string, unknown>): EmailBlock =>
  ({ id: "b", type, props }) as EmailBlock;

describe("flipAlign", () => {
  test("swaps left↔right, leaves center/undefined", () => {
    expect(flipAlign("left")).toBe("right");
    expect(flipAlign("right")).toBe("left");
    expect(flipAlign("center")).toBe("center");
    expect(flipAlign(undefined)).toBeUndefined();
  });
});

describe("flipBlockSide", () => {
  test("flips a text block's align", () => {
    const out = flipBlockSide(block("text", { align: "left", body: "hi" }));
    expect((out.props as { align?: string }).align).toBe("right");
  });

  test("flips an image block's overlayAlign", () => {
    const out = flipBlockSide(block("image", { overlayAlign: "right", url: "x" }));
    expect((out.props as { overlayAlign?: string }).overlayAlign).toBe("left");
  });

  test("returns the SAME reference when nothing side-dependent changes", () => {
    const centered = block("text", { align: "center" });
    expect(flipBlockSide(centered)).toBe(centered);
    const neutral = block("hero", { value: "$1" });
    expect(flipBlockSide(neutral)).toBe(neutral);
  });
});
