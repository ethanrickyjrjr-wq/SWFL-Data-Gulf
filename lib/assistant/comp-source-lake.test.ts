// lib/assistant/comp-source-lake.test.ts
//
// The LAKE comp feed — our own sold universe (data_lake.lee_comp_sales_v).
// Tests are named for the failure mode they prevent.

import { describe, expect, test } from "bun:test";
import { lakeRowToCandidate, lakeCompFilters, type LeeCompSaleRow } from "./comp-source-lake";

function row(over: Partial<LeeCompSaleRow> = {}): LeeCompSaleRow {
  return {
    parcel_strap: "07-45-24-C1-00500.0080",
    address_line: "123 SE 5TH ST",
    city: "CAPE CORAL",
    zip_code: "33991",
    living_area_sqft: 1950,
    year_built: 2004,
    dor_use_code: "001",
    sale_month: "2026-05-01",
    sale_price: 425000,
    ...over,
  };
}

describe("F8 — the lake's sale date is MONTH grain and must say so", () => {
  test("every lake candidate is tagged month-grain, never day", () => {
    // leepa_parcels.last_sale_date is day-of-month 1 on all 31,632 rows in the last
    // 12 months. Tagging these "day" would let the renderer print a fabricated date.
    const c = lakeRowToCandidate(row());
    expect(c!.dateGrain).toBe("month");
  });
});

describe("F6 — the lake read must be BOUNDED, never a scan", () => {
  test("filters always carry a window, a size band, and a row cap", () => {
    const f = lakeCompFilters(
      { sqft: 1978, beds: null, baths: null, zip: "33991" },
      new Date("2026-07-22T00:00:00Z"),
    );

    expect(f.saleMonthGte).toBe("2026-01-22");
    expect(f.sqftGte).toBeGreaterThan(0);
    expect(f.sqftLte).toBeGreaterThan(f.sqftGte);
    expect(f.limit).toBeGreaterThan(0);
    expect(f.limit).toBeLessThanOrEqual(500);
  });

  test("the size band brackets the subject", () => {
    const f = lakeCompFilters(
      { sqft: 1978, beds: null, baths: null, zip: "33991" },
      new Date("2026-07-22T00:00:00Z"),
    );
    expect(f.sqftGte).toBeLessThan(1978);
    expect(f.sqftLte).toBeGreaterThan(1978);
  });
});

describe("mapping — a row becomes a rankable candidate", () => {
  test("carries address, zip, sq ft and price through", () => {
    const c = lakeRowToCandidate(row())!;
    expect(c.addressLine).toBe("123 SE 5TH ST");
    expect(c.zip).toBe("33991");
    expect(c.sqft).toBe(1950);
    expect(c.price).toBe(425000);
    expect(c.priceDate).toBe("2026-05-01");
  });

  test("beds and baths are NULL — neither source has them", () => {
    const c = lakeRowToCandidate(row())!;
    expect(c.beds).toBeNull();
    expect(c.baths).toBeNull();
  });

  test("a row with no sale date is dropped, not defaulted", () => {
    expect(lakeRowToCandidate(row({ sale_month: null }))).toBeNull();
  });

  test("a row with no living area is dropped — that is land, not a comp", () => {
    expect(lakeRowToCandidate(row({ living_area_sqft: null }))).toBeNull();
    expect(lakeRowToCandidate(row({ living_area_sqft: 0 }))).toBeNull();
  });

  test("a row with no address is dropped — a comp the reader cannot verify is useless", () => {
    expect(lakeRowToCandidate(row({ address_line: null }))).toBeNull();
  });
});
