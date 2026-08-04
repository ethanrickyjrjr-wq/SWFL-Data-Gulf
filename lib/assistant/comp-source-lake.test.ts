// lib/assistant/comp-source-lake.test.ts
//
// The LAKE comp feed — our own sold universe (data_lake.lee_comp_sales_v).
// Tests are named for the failure mode they prevent.

import { describe, expect, test } from "bun:test";
import {
  lakeRowToCandidate,
  lakeCompFilters,
  LEE_COMP_COLUMNS,
  type LeeCompSaleRow,
} from "./comp-source-lake";

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
    beds: null,
    baths: null,
    pool: null,
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

  test("carries beds and baths through from the LeePA layer-23 join", () => {
    // Live-verified fixture 08/02/2026: folioid 10109534 = 3 bed / 3.0 bath
    // (data_lake.leepa_comparable_sales, joined on folioid at 99.6%).
    const c = lakeRowToCandidate(row({ beds: 3, baths: 3 }))!;
    expect(c.beds).toBe(3);
    expect(c.baths).toBe(3);
  });

  test("commercial bath counts never survive to a candidate (sanity ceiling)", () => {
    // The real contamination that opened check comps_commercial_contamination:
    // layer-23 rows carrying 800/800, 56/516, 412/512 "bedrooms/bathrooms" —
    // building totals for commercial parcels, not home features. The view's
    // BETWEEN 1 AND 10 ceiling drops them in SQL; this is the belt-and-suspenders
    // twin so a future view regression cannot push an insane count into scoring.
    const c = lakeRowToCandidate(row({ beds: 56, baths: 516 }))!;
    expect(c.beds).toBeNull();
    expect(c.baths).toBeNull();
  });

  test("a zero bath count is treated as absent, never scored as zero", () => {
    const c = lakeRowToCandidate(row({ beds: 0, baths: 0 }))!;
    expect(c.beds).toBeNull();
    expect(c.baths).toBeNull();
  });

  test("beds and baths stay null when the layer-23 join found no row", () => {
    const c = lakeRowToCandidate(row({ beds: null, baths: null }))!;
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

describe("POOL — held free in the lake since 07/22/2026, unwired until 08/04", () => {
  // Operator, 08/04/2026: "WE WANT SIMILAR SQ FT, STYLE, BEDS AND BATHS SAME OR CLOSE
  // AND POOL OR NO POOL. WE ARE FUCKING COMPARING!!!"
  //
  // data_lake.leepa_comparable_sales carries `pool` on 108,848 of 108,848 rows
  // (PostgREST count=exact, 08/04/2026) as the literal strings 'Pool' / 'No Pool'.
  // The view already lateral-joins that exact row for beds/baths.

  test("'Pool' becomes true and 'No Pool' becomes FALSE, never null", () => {
    // The whole point: "no pool" is a MEASURED FACT about the home, not missing data.
    // Collapsing it to null would make a pool-less comp indistinguishable from a comp
    // we know nothing about, and the ranker would stop penalising the mismatch.
    expect(lakeRowToCandidate(row({ pool: "Pool" }))!.pool).toBe(true);
    expect(lakeRowToCandidate(row({ pool: "No Pool" }))!.pool).toBe(false);
  });

  test("an absent or unrecognised pool value stays NULL — never guessed as false", () => {
    expect(lakeRowToCandidate(row({ pool: null }))!.pool).toBeNull();
    expect(lakeRowToCandidate(row({ pool: "" }))!.pool).toBeNull();
    expect(lakeRowToCandidate(row({ pool: "Screened Lanai" }))!.pool).toBeNull();
  });

  test("casing and padding from the source do not change the answer", () => {
    expect(lakeRowToCandidate(row({ pool: "  POOL " }))!.pool).toBe(true);
    expect(lakeRowToCandidate(row({ pool: "no pool" }))!.pool).toBe(false);
  });

  test("the SELECT actually asks for pool — an unwired column is the whole defect", () => {
    // This is the test that would have caught 08/02: the lateral join was open and
    // beds/baths were taken from it while pool sat one line away, unselected.
    expect(LEE_COMP_COLUMNS).toContain("pool");
  });
});
