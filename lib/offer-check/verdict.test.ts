// lib/offer-check/verdict.test.ts
import { describe, expect, test } from "bun:test";
import { buildOfferPosition, money, parseOffer, parseSqft } from "./verdict";
import type { RenderComp } from "@/lib/assistant/comp-helper";

function comp(over: Partial<RenderComp>): RenderComp {
  return {
    addressLine: "123 TEST ST",
    city: "Cape Coral",
    beds: 3,
    baths: 2,
    sqft: 1500,
    status: "sold",
    price: 300_000,
    priceKind: "sold",
    priceDate: "2026-05-01",
    soldInDays: 40,
    sourceUrl: null,
    ...over,
  };
}

describe("buildOfferPosition", () => {
  test("splits sold vs estimate and never blends the bands", () => {
    const comps = [
      comp({ price: 280_000 }),
      comp({ price: 320_000 }),
      comp({ price: 500_000, priceKind: "estimate" }),
    ];
    const p = buildOfferPosition(comps, 300_000, null);
    expect(p.sold.length).toBe(2);
    expect(p.estimates.length).toBe(1);
    expect(p.soldBand).toEqual({ min: 280_000, median: 300_000, max: 320_000, count: 2 });
    expect(p.estimateBand?.count).toBe(1);
    // The estimate's 500k must not leak into the sold band.
    expect(p.soldBand?.max).toBe(320_000);
  });

  test("below/above counts are strict (a tie is neither)", () => {
    const comps = [comp({ price: 280_000 }), comp({ price: 300_000 }), comp({ price: 320_000 })];
    const p = buildOfferPosition(comps, 300_000, null);
    expect(p.belowSold).toBe(1);
    expect(p.aboveSold).toBe(1);
  });

  test("psf uses only comps with sqft; offerPsf only with the owner figure", () => {
    const comps = [
      comp({ price: 300_000, sqft: 1500 }), // 200/psf
      comp({ price: 400_000, sqft: null }), // excluded from psf
    ];
    const none = buildOfferPosition(comps, 350_000, null);
    expect(none.soldPsf).toEqual({ min: 200, median: 200, max: 200, count: 1 });
    expect(none.offerPsf).toBeNull();
    const withSqft = buildOfferPosition(comps, 350_000, 1750);
    expect(withSqft.offerPsf).toBe(200);
  });

  test("empty groups are null bands, never zeros", () => {
    const p = buildOfferPosition([comp({ price: null })], 300_000, null);
    expect(p.soldBand).toBeNull();
    expect(p.soldPsf).toBeNull();
    expect(p.estimateBand).toBeNull();
  });

  test("even count uses the midpoint median", () => {
    const comps = [
      comp({ price: 200_000 }),
      comp({ price: 300_000 }),
      comp({ price: 400_000 }),
      comp({ price: 500_000 }),
    ];
    expect(buildOfferPosition(comps, 1, null).soldBand?.median).toBe(350_000);
  });
});

describe("parsers + formatter", () => {
  test("parseOffer strips currency noise and rejects junk", () => {
    expect(parseOffer("$385,000")).toBe(385_000);
    expect(parseOffer("385000")).toBe(385_000);
    expect(parseOffer("nine")).toBeNull();
    expect(parseOffer("12")).toBeNull(); // under sanity floor
    expect(parseOffer(undefined)).toBeNull();
  });
  test("parseSqft sanity band", () => {
    expect(parseSqft("1,828")).toBe(1828);
    expect(parseSqft("50")).toBeNull();
    expect(parseSqft("")).toBeNull();
  });
  test("money rounds and formats", () => {
    expect(money(385000.4)).toBe("$385,000");
  });
});
