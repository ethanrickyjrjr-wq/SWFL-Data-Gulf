// lib/brand/weight.test.ts
//
// THE DRIFT TEST FOR THE OTHER SHARED FACT. `lib/email/blocks/scale.ts` and
// `lib/social/design/system.ts` both resolve WEIGHT from here now — this asserts
// they still agree, so a future session cannot quietly re-fork the ladder by
// hand-editing one side back to a literal.
import { describe, expect, it } from "bun:test";
import { WEIGHT } from "./weight";
import { WEIGHT as EMAIL_WEIGHT } from "@/lib/email/blocks/scale";
import { WEIGHT as SOCIAL_WEIGHT } from "@/lib/social/design/system";

describe("WEIGHT — one ladder, two systems", () => {
  it("email and social agree on every shared weight", () => {
    for (const [key, value] of Object.entries(WEIGHT)) {
      expect(EMAIL_WEIGHT[key as keyof typeof EMAIL_WEIGHT]).toBe(value);
      expect(SOCIAL_WEIGHT[key as keyof typeof SOCIAL_WEIGHT]).toBe(value);
    }
  });

  it("email's mono weight has no social equivalent — a canvas has no monospace role", () => {
    expect(EMAIL_WEIGHT.mono).toBe(WEIGHT.emphasis); // "mono" Weight 500, same value
    expect("mono" in SOCIAL_WEIGHT).toBe(false);
  });
});
