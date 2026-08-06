import { test, expect } from "bun:test";
import { firstParagraph } from "./area-read";

// Named for the failure mode each targets (RULE 3.5). The bridge's whole risk is
// that baked prose was written against the REPORT's 28-30 facts while an email
// shows ~6 — so report figures could ride into an email that never shows them.

test("lifts the first whole paragraph, verbatim", () => {
  const text =
    "Fort Myers is moving slowly right now, with homes sitting 98 days before they sell. " +
    "That is well off the pace of a year ago.\n\nA second paragraph that should not be lifted.";
  const p = firstParagraph(text);
  expect(p).toContain("98 days");
  expect(p).not.toContain("second paragraph");
  expect(p.endsWith(".")).toBe(true);
});

test("never returns a fragment cut mid-sentence — a cut sentence can invert a claim", () => {
  // No terminal punctuation → not safe to lift.
  const p = firstParagraph(
    "Prices are not falling in Cape Coral and inventory is still climbing which means",
  );
  expect(p).toBe("");
});

test("skips a too-short lead line rather than shipping a stub", () => {
  const text =
    "Fort Myers.\n\nThe real paragraph runs long enough to be worth lifting and it ends properly here.";
  expect(firstParagraph(text)).toContain("real paragraph");
});

test("collapses internal whitespace so lifted prose renders as one clean line", () => {
  const p = firstParagraph(
    "Homes here\n   sit 98 days before they sell, which is slower than last year.",
  );
  expect(p).not.toContain("\n");
  expect(p).toContain("Homes here sit 98 days");
});

test("empty or unusable narration yields no text, never a throw", () => {
  expect(firstParagraph("")).toBe("");
  expect(firstParagraph("\n\n\n")).toBe("");
});

// The guard contract itself — proven at the seam the recipes rely on.
test("the caller's anchoring guard is what decides, not the bridge", async () => {
  const { bakedAreaRead } = await import("./area-read");
  // A malformed area key must never guess an area.
  expect(await bakedAreaRead("not-a-zip", () => true)).toBeNull();
  expect(await bakedAreaRead(null, () => true)).toBeNull();
  expect(await bakedAreaRead(undefined, () => true)).toBeNull();
});

test("a guard that rejects everything yields null — live fallback, never unsourced prose", async () => {
  const { bakedAreaRead } = await import("./area-read");
  // Even if a row exists for this ZIP, a guard returning false must produce null.
  expect(await bakedAreaRead("33901", () => false)).toBeNull();
});
