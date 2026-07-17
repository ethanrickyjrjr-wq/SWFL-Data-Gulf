// lib/should-i-sell/derive-v0.test.ts
import { expect, test } from "bun:test";
import { deriveV0FromComps } from "./derive-v0";
import type { CompResult, RenderComp } from "@/lib/assistant/comp-helper";

function comp(price: number | null): RenderComp {
  return {
    addressLine: "1 Test St",
    city: "Cape Coral",
    beds: 3,
    baths: 2,
    sqft: 1800,
    status: "sold",
    price,
    priceKind: "sold",
    priceDate: "2026-05-01",
    soldInDays: null,
    sourceUrl: null,
  };
}

function result(prices: (number | null)[]): CompResult {
  return { comps: prices.map(comp), asOf: "07/17/2026", needs: [] };
}

test("median of priced comps → the V0 estimate, with basis count + as-of", () => {
  const v0 = deriveV0FromComps(result([400_000, 500_000, 600_000]));
  expect(v0).not.toBeNull();
  expect(v0!.value).toBe(500_000);
  expect(v0!.basisCount).toBe(3);
  expect(v0!.asOf).toBe("07/17/2026");
});

test("even count → average of the two middle priced comps", () => {
  const v0 = deriveV0FromComps(result([400_000, 500_000]));
  expect(v0!.value).toBe(450_000);
  expect(v0!.basisCount).toBe(2);
});

test("null / non-positive prices are ignored when forming the estimate", () => {
  const v0 = deriveV0FromComps(result([null, 0, 500_000, 700_000]));
  expect(v0!.value).toBe(600_000); // median of [500k, 700k]
  expect(v0!.basisCount).toBe(2);
});

test("fewer than 2 priced comps → null (never a one-comp guess)", () => {
  expect(deriveV0FromComps(result([500_000]))).toBeNull();
  expect(deriveV0FromComps(result([null, null]))).toBeNull();
  expect(deriveV0FromComps(result([]))).toBeNull();
});
