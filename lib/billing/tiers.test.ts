// lib/billing/tiers.test.ts
import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import { BILLING_TIERS, FREE_SENDS_PER_MONTH, ALL_LOOKUP_KEYS } from "./tiers.ts";
import { tierLimit } from "../email/usage.ts";

describe("BILLING_TIERS", () => {
  test("mirrors TIER_LIMITS in lib/email/usage.ts exactly", () => {
    for (const t of BILLING_TIERS) {
      assert.equal(t.sendsPerMonth, tierLimit(t.slug), `sends mismatch for ${t.slug}`);
    }
    assert.equal(FREE_SENDS_PER_MONTH, tierLimit("free"));
  });

  test("spec prices: 29/79/149 monthly, 290/790/1490 annual (2 months free)", () => {
    const bySlug = Object.fromEntries(BILLING_TIERS.map((t) => [t.slug, t]));
    assert.equal(bySlug.starter.priceMonthlyUsd, 29);
    assert.equal(bySlug.starter.priceAnnualUsd, 290);
    assert.equal(bySlug.growth.priceMonthlyUsd, 79);
    assert.equal(bySlug.growth.priceAnnualUsd, 790);
    assert.equal(bySlug.pro.priceMonthlyUsd, 149);
    assert.equal(bySlug.pro.priceAnnualUsd, 1490);
    // annual = 10 months of monthly, for every tier — the "2 months free" invariant
    for (const t of BILLING_TIERS) assert.equal(t.priceAnnualUsd, t.priceMonthlyUsd * 10);
  });

  test("lookup keys are unique and follow swfl_<tier>_<interval>", () => {
    assert.equal(new Set(ALL_LOOKUP_KEYS).size, 6);
    for (const t of BILLING_TIERS) {
      assert.equal(t.lookupKeyMonthly, `swfl_${t.slug}_monthly`);
      assert.equal(t.lookupKeyAnnual, `swfl_${t.slug}_annual`);
    }
  });
});
