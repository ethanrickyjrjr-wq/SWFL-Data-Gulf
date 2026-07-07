import { describe, test, expect } from "bun:test";
import {
  computeWatchDelta,
  pricePerSqft,
  priceCutExceedsThreshold,
  describeWatchEvent,
  type SubjectSpec,
  type CompSpec,
} from "./watch-delta";

describe("pricePerSqft", () => {
  test("computes $/sqft from two held numbers", () => {
    expect(pricePerSqft(500_000, 2_000)).toBe(250);
  });
  test("null when price missing — never invents", () => {
    expect(pricePerSqft(null, 2_000)).toBeNull();
  });
  test("null when sqft missing or non-positive (no divide-by-zero guess)", () => {
    expect(pricePerSqft(500_000, null)).toBeNull();
    expect(pricePerSqft(500_000, 0)).toBeNull();
    expect(pricePerSqft(500_000, -10)).toBeNull();
  });
});

describe("computeWatchDelta — the operator's motivating example", () => {
  // Tracked: 3bd, $25/sqft. Comp: 4bd, cut to $22/sqft. A real computed delta, not a platitude.
  const subject: SubjectSpec = { beds: 3, baths: 2, sqft: 2_000, price: 50_000 }; // $25/sqft
  const comp: CompSpec = { beds: 4, baths: 2, sqft: 2_000, price: 44_000 }; // $22/sqft

  test("$/sqft delta is the comp minus subject", () => {
    const d = computeWatchDelta(subject, comp);
    expect(d.subject_ppsf).toBe(25);
    expect(d.comp_ppsf).toBe(22);
    expect(d.ppsf_delta).toBe(-3); // comp is $3/sqft cheaper
  });

  test("beds/baths deltas are direct subtractions", () => {
    const d = computeWatchDelta(subject, comp);
    expect(d.beds_delta).toBe(1); // comp has one more bedroom
    expect(d.baths_delta).toBe(0);
    expect(d.price_delta).toBe(-6_000);
  });
});

describe("computeWatchDelta — missing inputs propagate as null, never 0", () => {
  test("no subject sqft → no $/sqft delta, but beds/price deltas still compute", () => {
    const subject: SubjectSpec = { beds: 3, baths: 2, sqft: null, price: 50_000 };
    const comp: CompSpec = { beds: 4, baths: 2, sqft: 2_000, price: 44_000 };
    const d = computeWatchDelta(subject, comp);
    expect(d.subject_ppsf).toBeNull();
    expect(d.ppsf_delta).toBeNull();
    expect(d.comp_ppsf).toBe(22);
    expect(d.beds_delta).toBe(1);
    expect(d.price_delta).toBe(-6_000);
  });

  test("no comp beds → beds_delta null (not treated as 0)", () => {
    const subject: SubjectSpec = { beds: 3, baths: 2, sqft: 2_000, price: 50_000 };
    const comp: CompSpec = { beds: null, baths: 2, sqft: 2_000, price: 44_000 };
    expect(computeWatchDelta(subject, comp).beds_delta).toBeNull();
  });
});

describe("priceCutExceedsThreshold", () => {
  // transitions record `price` (post-cut) + `price_delta` (vs prior). prior = price - price_delta.
  test("a 2.5% cut clears a 2% threshold", () => {
    // prior 500k → now 487.5k, delta -12.5k = 2.5%
    expect(priceCutExceedsThreshold(487_500, -12_500, 2)).toBe(true);
  });
  test("a 1% cut does NOT clear a 2% threshold", () => {
    // prior 500k → now 495k, delta -5k = 1%
    expect(priceCutExceedsThreshold(495_000, -5_000, 2)).toBe(false);
  });
  test("a price RAISE (delta >= 0) is never a cut", () => {
    expect(priceCutExceedsThreshold(510_000, 10_000, 2)).toBe(false);
    expect(priceCutExceedsThreshold(500_000, 0, 2)).toBe(false);
  });
  test("missing inputs fail closed", () => {
    expect(priceCutExceedsThreshold(null, -12_500, 2)).toBe(false);
    expect(priceCutExceedsThreshold(487_500, null, 2)).toBe(false);
  });
  test("non-positive prior price (corrupt data) can't yield an honest percent → false", () => {
    // current -50, delta -10 → prior -40 (nonsensical) → fail closed, no invented percent
    expect(priceCutExceedsThreshold(-50, -10, 2)).toBe(false);
  });
});

describe("describeWatchEvent — raw facts, no commentary, null-safe", () => {
  const subject: SubjectSpec = { beds: 3, baths: 2, sqft: 2_000, price: 500_000 }; // $250/sqft
  const comp: CompSpec = { beds: 4, baths: 2, sqft: 2_000, price: 440_000 }; // $220/sqft
  const delta = computeWatchDelta(subject, comp);

  test("new listing line carries specs, $/sqft, and the vs-yours delta", () => {
    const line = describeWatchEvent({
      event_type: "nearby_new_listing",
      distance_miles: 0.34,
      comp,
      delta,
    });
    expect(line).toContain("New listing 0.3 mi away");
    expect(line).toContain("4 bd / 2 ba / 2,000 sqft");
    expect(line).toContain("$440,000");
    expect(line).toContain("$220/sqft");
    expect(line).toContain("+1 bd");
    expect(line).toContain("−30/sqft"); // comp is $30/sqft cheaper
    // Governing constraint: no analysis words leaked in.
    expect(line.toLowerCase()).not.toContain("premium");
    expect(line.toLowerCase()).not.toContain("great");
  });

  test("sale line anchors to the close date (MM/DD/YYYY), never 'just sold'", () => {
    const line = describeWatchEvent({
      event_type: "nearby_sale",
      distance_miles: 0.5,
      comp,
      delta,
      sold_date: "2026-05-14",
      sold_price: 435_000,
    });
    expect(line).toContain("sold on 05/14/2026");
    expect(line).toContain("$435,000");
    expect(line.toLowerCase()).not.toContain("just sold");
  });

  test("price cut line shows the cut amount and post-cut price", () => {
    const line = describeWatchEvent({
      event_type: "nearby_price_cut",
      distance_miles: 0.2,
      comp,
      delta,
      price_cut_amount: -15_000,
    });
    expect(line).toContain("Price cut 0.2 mi away");
    expect(line).toContain("$15,000");
    expect(line).toContain("now $440,000");
  });

  test("absent comp specs are omitted, never fabricated", () => {
    const bare: CompSpec = { beds: null, baths: null, sqft: null, price: null };
    const line = describeWatchEvent({
      event_type: "nearby_new_listing",
      distance_miles: 1,
      comp: bare,
      delta: computeWatchDelta(subject, bare),
    });
    expect(line).toBe("New listing 1.0 mi away");
    expect(line).not.toContain("bd");
    expect(line).not.toContain("$");
  });
});
