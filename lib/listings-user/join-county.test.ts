// lib/listings-user/join-county.test.ts
// Guard: failure mode 4 — bad address never blocks the row; miss is a null, counted upstream.
import { describe, expect, test } from "bun:test";
import { joinCounty } from "./join-county";
import { normalizeAddressKey } from "./address-key";

const row = (address: string) => ({
  address,
  address_key: normalizeAddressKey(address),
  price: null,
  beds: null,
  baths: null,
  sqft: null,
  status: null,
  url: null,
  attribs: {},
});

describe("joinCounty", () => {
  test("SWFL zip in the address resolves county from the crosswalk", () => {
    const j = joinCounty(row("12 Main St, Fort Myers, FL 33901"));
    expect(j.zip_code).toBe("33901");
    expect(j.county).toBe("Lee");
  });
  test("address with no zip → both null, no throw", () => {
    expect(joinCounty(row("12 Main St, Fort Myers"))).toEqual({ zip_code: null, county: null });
  });
  test("non-SWFL zip → zip captured, county null (honest miss)", () => {
    const j = joinCounty(row("1 Broadway, New York, NY 10004"));
    expect(j.zip_code).toBe("10004");
    expect(j.county).toBeNull();
  });
});
