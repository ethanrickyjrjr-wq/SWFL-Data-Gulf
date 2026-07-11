import { describe, expect, test } from "bun:test";
import { normalizeResult } from "./steadyapi";

// SteadyAPI /search returns NO property-type field on any row (verified live 07/07/2026) —
// normalizeResult must never assert a specific type it doesn't hold. See extract_api.py's
// build_type_lookup for the full per-type-sweep design this single-page client doesn't run.
describe("normalizeResult — property type honesty", () => {
  const base = {
    property_id: "123",
    price: { amount: 400000 },
    status: "for_sale",
    permalink: "https://www.realtor.com/x/1403-NE-19th-Ter_Cape-Coral_FL_33909_M1",
    photo_url: "https://ap.rdcpix.com/x.webp",
    location: { lat: 26.6, lon: -81.9, county_fips: "12071" },
  };

  test("no beds + a lot_sqft → Land, never a residential guess", () => {
    const l = normalizeResult({ ...base, description: { lot_sqft: 21780 } }, "Cape Coral", "FL");
    expect(l?.propertyType).toBe("Land");
  });

  test("beds present → honest generic Residential, never the specific 'Single Family'", () => {
    const l = normalizeResult(
      { ...base, description: { beds: 3, sqft: 1800 } },
      "Cape Coral",
      "FL",
    );
    expect(l?.propertyType).toBe("Residential");
    expect(l?.propertyType).not.toBe("Single Family");
  });

  test("no beds and no lot_sqft → Residential (not enough signal to call it land)", () => {
    const l = normalizeResult({ ...base, description: {} }, "Cape Coral", "FL");
    expect(l?.propertyType).toBe("Residential");
  });
});

// lotSize was hardcoded to null even when description.lot_sqft was present — capture it,
// converted sqft->acres to match the Listing.lotSize convention (select.ts sets it from the
// lake's lot_acres column, i.e. acres not sqft).
describe("normalizeResult — lot_sqft capture", () => {
  const base = {
    property_id: "123",
    price: { amount: 400000 },
    status: "for_sale",
    permalink: "https://www.realtor.com/x/1403-NE-19th-Ter_Cape-Coral_FL_33909_M1",
    photo_url: "https://ap.rdcpix.com/x.webp",
    location: { lat: 26.6, lon: -81.9, county_fips: "12071" },
  };

  test("description.lot_sqft present → lotSize converted to acres, not dropped to null", () => {
    const l = normalizeResult({ ...base, description: { lot_sqft: 21780 } }, "Cape Coral", "FL");
    expect(l?.lotSize).toBe(0.5); // 21780 / 43560
  });

  test("no lot_sqft → lotSize stays null (never a fabricated 0)", () => {
    const l = normalizeResult({ ...base, description: { beds: 3 } }, "Cape Coral", "FL");
    expect(l?.lotSize).toBeNull();
  });
});
