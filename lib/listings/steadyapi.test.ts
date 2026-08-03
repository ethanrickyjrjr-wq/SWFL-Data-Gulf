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

// Caught live 08/03/2026: a consumer rendered "Sage, Cape Coral" as if "Sage" were a
// place — it is the MODEL/PLAN NAME of a new-construction spec home. A resale permalink
// slug's first segment is a real street address (starts with a house number); a
// builder-listing permalink's first segment is the model name instead. Real URLs
// observed live: realtor.com/realestateandhomes-detail/Sage_Cape-Coral-Spot-Tradition_
// Call-for-more-information_CAPE-CORAL_FL_33914_P417000603379 and .../Venice_Cape-Coral_
// 1524-SW-43rd-Ln_Cape-Coral_FL_33914_P417000619533.
describe("normalizeResult — never claims a model name as a street address", () => {
  const base = {
    property_id: "123",
    price: { amount: 400000 },
    status: "for_sale",
    photo_url: "https://ap.rdcpix.com/x.webp",
    location: { lat: 26.6, lon: -81.9, county_fips: "12071" },
  };

  test("a resale slug (house-number first) → addressLine1 is the real street address", () => {
    const l = normalizeResult(
      { ...base, permalink: "https://www.realtor.com/x/1403-NE-19th-Ter_Cape-Coral_FL_33909_M1" },
      "Cape Coral",
      "FL",
    );
    expect(l?.addressLine1).toBe("1403 NE 19th Ter");
  });

  test("a new-construction slug (model name first, no house number) → addressLine1 is EMPTY, never the model name", () => {
    const l = normalizeResult(
      {
        ...base,
        permalink:
          "https://www.realtor.com/realestateandhomes-detail/Sage_Cape-Coral-Spot-Tradition_" +
          "Call-for-more-information_CAPE-CORAL_FL_33914_P417000603379",
      },
      "Cape Coral",
      "FL",
    );
    expect(l?.addressLine1).toBe("");
    expect(l?.addressLine1).not.toContain("Sage");
    // formattedAddress still degrades gracefully — no dangling comma from the empty part.
    expect(l?.formattedAddress).not.toMatch(/^,/);
    expect(l?.formattedAddress).not.toContain("Sage");
  });

  test("another real builder slug (Venice) → same honest empty address, not the model name", () => {
    const l = normalizeResult(
      {
        ...base,
        permalink:
          "https://www.realtor.com/realestateandhomes-detail/Venice_Cape-Coral_1524-SW-43rd-Ln_" +
          "Cape-Coral_FL_33914_P417000619533",
      },
      "Cape Coral",
      "FL",
    );
    expect(l?.addressLine1).toBe("");
    expect(l?.addressLine1).not.toContain("Venice");
  });
});
