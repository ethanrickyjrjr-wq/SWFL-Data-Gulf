// lib/listings/free-lanes-first.test.ts
//
// OPERATOR DECREE 08/05/2026, verbatim: *"First make sure we are checking all free lanes and
// in-house data before anyone runs fucking apify … we aren't running extra fucking runs for
// shit we already have!!!!!!"*
//
// COUNTED LIVE THE SAME DAY, which is why this suite exists:
//   data_lake.apify_property_records — 383 rows WE ALREADY BOUGHT:
//     property_url 100.0% · style 99.5% · baths_total 98.2% · primary_photo 94.5% ·
//     description 93.5%
//   data_lake.listing_state — the FREE spine, 35,202 rows:
//     photo_url 98.5% · beds 73.7% · sqft 70.6% · baths 31.2%
//
// The comp lane was buying a ~200-record ZIP month while holding rows that answer the same
// question 93–100% of the time. Every test below is one rung of "free first" made enforceable.

import { describe, test, expect } from "bun:test";
import { stillMissingAfterFreeLanes, type FreeLaneCoverage } from "./free-lanes-first";

const need = { photoUrl: true, listingUrl: true, baths: true } as const;

describe("F1 · a house we already hold is NEVER a reason to spend", () => {
  test("every field covered free → nothing missing → no purchase can be justified", () => {
    const cov: FreeLaneCoverage = {
      addressLine: "12554 Kellysands Way",
      photoUrl: "https://ap.rdcpix.com/x.jpg",
      listingUrl: "https://realtor.com/x",
      baths: 3,
    };
    expect(stillMissingAfterFreeLanes([cov], need)).toEqual([]);
  });

  test("THE $1.95 SHAPE: one uncovered field must not re-open the whole set", () => {
    // The re-buy happened because ANY miss re-bought every sale month. What is missing is
    // reported PER HOUSE and PER FIELD so a caller can buy the field, never the area.
    const rows: FreeLaneCoverage[] = [
      { addressLine: "A", photoUrl: "https://x/a.jpg", listingUrl: "https://r/a", baths: 2 },
      { addressLine: "B", photoUrl: "https://x/b.jpg", listingUrl: "https://r/b", baths: null },
    ];
    const missing = stillMissingAfterFreeLanes(rows, need);
    expect(missing).toHaveLength(1);
    expect(missing[0]!.addressLine).toBe("B");
    expect(missing[0]!.fields).toEqual(["baths"]);
  });
});

describe("F2 · only what the caller ASKED for counts as missing", () => {
  test("a field we do not need is never 'missing' — no spend for an unused cell", () => {
    const rows: FreeLaneCoverage[] = [
      { addressLine: "A", photoUrl: "https://x/a.jpg", listingUrl: null, baths: null },
    ];
    expect(stillMissingAfterFreeLanes(rows, { photoUrl: true })).toEqual([]);
  });

  test("baths is the ONE genuinely thin field (31.2% free) and is reported when asked for", () => {
    const rows: FreeLaneCoverage[] = [
      { addressLine: "A", photoUrl: "https://x/a.jpg", listingUrl: "https://r/a", baths: null },
    ];
    expect(stillMissingAfterFreeLanes(rows, { baths: true })[0]!.fields).toEqual(["baths"]);
  });
});

describe("F3 · a ZERO or a blank is an OPEN SLOT, never a covered field", () => {
  // playbook §1.14 — a 0 bath count is the vendor's unfilled field, not a fact about a house.
  test("baths 0 does not count as covered", () => {
    const rows: FreeLaneCoverage[] = [
      { addressLine: "A", photoUrl: null, listingUrl: null, baths: 0 },
    ];
    expect(stillMissingAfterFreeLanes(rows, { baths: true })[0]!.fields).toEqual(["baths"]);
  });

  test("a blank or non-http url does not count as covered", () => {
    const rows: FreeLaneCoverage[] = [
      { addressLine: "A", photoUrl: "  ", listingUrl: "javascript:alert(1)", baths: 3 },
    ];
    expect(stillMissingAfterFreeLanes(rows, need)[0]!.fields).toEqual(["photoUrl", "listingUrl"]);
  });
});
