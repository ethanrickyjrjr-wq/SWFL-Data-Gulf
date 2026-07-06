import { describe, expect, test } from "bun:test";
import { isSequenceOnceRow, onceClaimKey } from "@/lib/email/sequence/once";

describe("once helpers", () => {
  test("identifies a sequence one-shot row", () => {
    expect(
      isSequenceOnceRow({ cadence: "once", template_id: "block-canvas", deliverable_id: "d-1" }),
    ).toBe(true);
    expect(
      isSequenceOnceRow({ cadence: "weekly", template_id: "block-canvas", deliverable_id: "d-1" }),
    ).toBe(false);
    expect(
      isSequenceOnceRow({ cadence: "once", template_id: "report", deliverable_id: null }),
    ).toBe(false);
  });
  test("claim key is stable and date-free", () => {
    expect(onceClaimKey({ id: 42 })).toBe("once:42");
  });
});
