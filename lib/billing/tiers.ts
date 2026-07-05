// lib/billing/tiers.ts
/**
 * THE one price root (commercial spine D1, approved 07/02/2026).
 * /billing renders from this; the homepage pricing strip imports the SAME
 * file. No price literal may appear anywhere else. sendsPerMonth mirrors
 * TIER_LIMITS in lib/email/usage.ts — tiers.test.ts enforces the mirror.
 */
export type PaidTierSlug = "starter" | "growth" | "pro";

export interface BillingTier {
  slug: PaidTierSlug;
  name: string;
  sendsPerMonth: number;
  priceMonthlyUsd: number;
  priceAnnualUsd: number;
  lookupKeyMonthly: string;
  lookupKeyAnnual: string;
}

export const FREE_SENDS_PER_MONTH = 50;

export const BILLING_TIERS: readonly BillingTier[] = [
  {
    slug: "starter",
    name: "Starter",
    sendsPerMonth: 500,
    // $9.99 — operator repricing 07/05/2026 (was $29/$290 from the 07/02 spec).
    // Stripe Price objects must carry the same amounts: lookup keys were moved
    // to new 999¢/9990¢ prices in the same change (prices are immutable — the
    // key transfers, the old price stays for existing subscribers).
    priceMonthlyUsd: 9.99,
    priceAnnualUsd: 99.9,
    lookupKeyMonthly: "swfl_starter_monthly",
    lookupKeyAnnual: "swfl_starter_annual",
  },
  {
    slug: "growth",
    name: "Growth",
    sendsPerMonth: 2000,
    priceMonthlyUsd: 79,
    priceAnnualUsd: 790,
    lookupKeyMonthly: "swfl_growth_monthly",
    lookupKeyAnnual: "swfl_growth_annual",
  },
  {
    slug: "pro",
    name: "Pro",
    sendsPerMonth: 10000,
    priceMonthlyUsd: 149,
    priceAnnualUsd: 1490,
    lookupKeyMonthly: "swfl_pro_monthly",
    lookupKeyAnnual: "swfl_pro_annual",
  },
] as const;

export const ALL_LOOKUP_KEYS: readonly string[] = BILLING_TIERS.flatMap((t) => [
  t.lookupKeyMonthly,
  t.lookupKeyAnnual,
]);
