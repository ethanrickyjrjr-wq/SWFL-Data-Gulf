// lib/billing/stripe-sync.ts
/**
 * Pure core for Stripe webhook → billing_subscriptions sync. NO I/O.
 * The webhook route (app/api/stripe/webhook) normalizes the Stripe event
 * (doing any retrieves it needs) and hands a NormalizedStripeEvent here;
 * this module encodes ALL policy:
 *   - keep-through-dunning: past_due keeps the paid tier
 *   - only subscription.deleted reverts to free
 *   - invoice events touch status/period only, never tier
 *   - unknown lookup keys and unresolvable users → null, never a guess
 */
import { BILLING_TIERS } from "./tiers.ts";

export type TierSlug = "free" | "starter" | "growth" | "pro";

export interface NormalizedStripeEvent {
  type: string;
  customerId: string | null;
  subscriptionId?: string | null;
  clientReferenceId?: string | null;
  lookupKey?: string | null;
  status?: string | null;
  currentPeriodEndIso?: string | null;
}

export interface SubscriptionMutation {
  user_id?: string;
  stripe_customer_id: string;
  stripe_subscription_id?: string | null;
  tier?: TierSlug;
  status?: string;
  current_period_end?: string | null;
  updated_at: string;
}

const KEY_TO_TIER: Record<string, TierSlug> = Object.fromEntries(
  BILLING_TIERS.flatMap((t) => [
    [t.lookupKeyMonthly, t.slug],
    [t.lookupKeyAnnual, t.slug],
  ]),
);

export function tierFromLookupKey(key: string | null | undefined): TierSlug | null {
  if (!key) return null;
  return KEY_TO_TIER[key] ?? null;
}

export function subscriptionMutationFromEvent(
  e: NormalizedStripeEvent,
  nowIso: string,
): SubscriptionMutation | null {
  if (!e.customerId) return null;
  const base = { stripe_customer_id: e.customerId, updated_at: nowIso };

  switch (e.type) {
    case "checkout.session.completed": {
      if (!e.clientReferenceId) return null; // never invent a user
      const tier = tierFromLookupKey(e.lookupKey);
      if (!tier) return null;
      return {
        ...base,
        user_id: e.clientReferenceId,
        stripe_subscription_id: e.subscriptionId ?? null,
        tier,
        status: e.status ?? "active",
        current_period_end: e.currentPeriodEndIso ?? null,
      };
    }
    case "customer.subscription.updated": {
      const tier = tierFromLookupKey(e.lookupKey);
      if (!tier) return null; // unknown price — refuse to guess
      return {
        ...base,
        stripe_subscription_id: e.subscriptionId ?? null,
        tier, // past_due keeps this tier: keep-through-dunning
        status: e.status ?? "active",
        current_period_end: e.currentPeriodEndIso ?? null,
      };
    }
    case "customer.subscription.deleted":
      return { ...base, stripe_subscription_id: null, tier: "free", status: "canceled" };
    case "invoice.paid":
    case "invoice.payment_failed":
      return {
        ...base,
        status: e.status ?? (e.type === "invoice.paid" ? "active" : "past_due"),
        current_period_end: e.currentPeriodEndIso ?? null,
      };
    default:
      return null;
  }
}
