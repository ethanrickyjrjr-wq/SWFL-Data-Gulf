// lib/listings-user/address-key.test.ts
// Guard: duplicate imports (failure mode 9) — same house, different formatting, ONE key.
import { describe, expect, test } from "bun:test";
import { normalizeAddressKey } from "./address-key";

describe("normalizeAddressKey", () => {
  test("case, punctuation, and whitespace collapse to one key", () => {
    expect(normalizeAddressKey("16447 Rainbow Meadows Court, Punta Gorda, FL 33955")).toBe(
      normalizeAddressKey("16447 rainbow meadows ct   punta gorda fl 33955"),
    );
  });
  test("common suffixes abbreviate", () => {
    expect(normalizeAddressKey("12 Main Street")).toBe("12 main st");
    expect(normalizeAddressKey("12 Ocean Drive")).toBe("12 ocean dr");
    expect(normalizeAddressKey("12 Palm Avenue")).toBe("12 palm ave");
    expect(normalizeAddressKey("12 Gulf Boulevard")).toBe("12 gulf blvd");
    expect(normalizeAddressKey("12 Bay Lane")).toBe("12 bay ln");
    expect(normalizeAddressKey("12 Park Place")).toBe("12 park pl");
    expect(normalizeAddressKey("12 River Road")).toBe("12 river rd");
    expect(normalizeAddressKey("12 Isle Circle")).toBe("12 isle cir");
    expect(normalizeAddressKey("12 Sunset Terrace")).toBe("12 sunset ter");
  });
  test("empty/whitespace input returns empty string", () => {
    expect(normalizeAddressKey("   ")).toBe("");
  });
});
