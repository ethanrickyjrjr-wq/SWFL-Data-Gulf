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
    // $19 — operator repricing 07/07/2026 (was $19.99, which itself replaced
    // $9.99/$99.90 from the 07/05 repricing, which replaced $29/$290 from the
    // 07/02 spec).
    // Stripe Price objects must carry the same amounts: lookup keys move to
    // new price objects via scripts/stripe/reprice-tier.mts (prices are
    // immutable — the key transfers via transfer_lookup_key, the old price
    // stays live for any existing subscriber still on it).
    priceMonthlyUsd: 19,
    priceAnnualUsd: 190,
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
