// lib/email/postal-address.test.ts
//
// CAN-SPAM postal line resolution for the injected blast footer: the
// deliverable's own branding.business_address wins (it's what the doc was
// built with), else the account-level profile address, else null (the route
// 422s — the floor is never met by an invented or hardcoded address).
// Spec: docs/superpowers/specs/2026-07-12-send-safety-floor-design.md

import { describe, expect, it } from "bun:test";
import { resolvePostalAddress } from "./postal-address";

describe("resolvePostalAddress", () => {
  it("deliverable branding.business_address wins over the profile", () => {
    expect(
      resolvePostalAddress(
        { business_address: "100 Main St, Fort Myers, FL 33901" },
        "200 Oak Ave",
      ),
    ).toBe("100 Main St, Fort Myers, FL 33901");
  });

  it("falls back to the account-level profile address", () => {
    expect(resolvePostalAddress({ name: "Acme" }, "200 Oak Ave, Naples, FL 34102")).toBe(
      "200 Oak Ave, Naples, FL 34102",
    );
    expect(resolvePostalAddress(null, "200 Oak Ave, Naples, FL 34102")).toBe(
      "200 Oak Ave, Naples, FL 34102",
    );
  });

  it("whitespace-only branding address falls through; values are trimmed", () => {
    expect(resolvePostalAddress({ business_address: "   " }, "  200 Oak Ave  ")).toBe(
      "200 Oak Ave",
    );
    expect(resolvePostalAddress({ business_address: "  100 Main St " }, null)).toBe("100 Main St");
  });

  it("nothing anywhere → null (route must 422, never invent)", () => {
    expect(resolvePostalAddress(null, null)).toBeNull();
    expect(resolvePostalAddress({}, undefined)).toBeNull();
    expect(resolvePostalAddress("not-an-object", "")).toBeNull();
  });

  it("non-string business_address is ignored, not coerced", () => {
    expect(resolvePostalAddress({ business_address: 42 }, null)).toBeNull();
  });
});
