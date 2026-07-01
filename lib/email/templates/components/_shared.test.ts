import { test, expect } from "bun:test";
import { readableText } from "./_shared";

// readableText now delegates to the real WCAG-2 readableLabel (was rec601 luma).
// The two extremes agree between rec601 and WCAG — these lock the contract.
test("readableText: white bg → dark #111827, black bg → white", () => {
  expect(readableText("#ffffff")).toBe("#111827");
  expect(readableText("#000000")).toBe("#ffffff");
});

// Documents the intentional behavior change: on a medium cyan where rec601 luma
// said "white" but real WCAG contrast favors dark ink, WCAG now wins (more legible).
test("readableText: medium cyan #1bb8c9 → dark ink (WCAG fixes the rec601 miss)", () => {
  expect(readableText("#1bb8c9")).toBe("#111827");
});

// Non-hex input still resolves to white (readableLabel: white beats dark on L=0).
test("readableText: non-hex bg → white", () => {
  expect(readableText("rgb(10,10,10)")).toBe("#ffffff");
});
