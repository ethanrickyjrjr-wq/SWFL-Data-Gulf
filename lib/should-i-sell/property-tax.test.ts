// lib/should-i-sell/property-tax.test.ts
import { expect, test } from "bun:test";
import { fetchPropertyTaxAnnual } from "./property-tax";

const args = { address: "123 Main St", zip: "33904", countyFips: "12071" };

test("with NO live county source wired → null (never a fabricated tax number)", async () => {
  expect(await fetchPropertyTaxAnnual(args)).toBeNull();
});

test("uses an injected real fetch when one is wired", async () => {
  const r = await fetchPropertyTaxAnnual(args, {
    fetchAnnualTax: async () => ({
      annual: 4200,
      source: { label: "Lee County Tax Collector", url: "https://www.leetc.com" },
      asOf: "07/17/2026",
    }),
  });
  expect(r?.annual).toBe(4200);
  expect(r?.source.label).toContain("Lee County");
});

test("a throwing fetch degrades to null — never invents a number", async () => {
  const r = await fetchPropertyTaxAnnual(args, {
    fetchAnnualTax: async () => {
      throw new Error("endpoint down");
    },
  });
  expect(r).toBeNull();
});
