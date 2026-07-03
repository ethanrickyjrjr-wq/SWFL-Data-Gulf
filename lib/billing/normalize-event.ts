// lib/billing/normalize-event.ts
/**
 * Stripe.Event → NormalizedStripeEvent. The ONLY file that knows where
 * Stripe hides fields per event type (they move across API versions —
 * trust the SDK types when they disagree with comments here).
 * fetchSubscription is injected so tests never touch the network.
 */
import type Stripe from "stripe";
import type { NormalizedStripeEvent } from "./stripe-sync.ts";

export interface SubscriptionFacts {
  lookupKey: string | null;
  status: string;
  currentPeriodEndIso: string | null;
  customerId: string | null;
}

function str(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "id" in v) return String((v as { id: unknown }).id);
  return null;
}

/** Pull lookup key / status / period end off a subscription-shaped object. */
function factsFromSubscriptionObject(sub: Record<string, unknown>): SubscriptionFacts {
  const items = (sub.items as { data?: Array<Record<string, unknown>> } | undefined)?.data ?? [];
  const first = items[0] ?? {};
  const price = first.price as { lookup_key?: string | null } | undefined;
  // current_period_end lives on the item in newer API versions, on the
  // subscription in older ones — accept either.
  const periodEnd =
    (first.current_period_end as number | undefined) ??
    (sub.current_period_end as number | undefined) ??
    null;
  return {
    lookupKey: price?.lookup_key ?? null,
    status: typeof sub.status === "string" ? sub.status : "active",
    currentPeriodEndIso: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    customerId: str(sub.customer),
  };
}

export async function normalizeEvent(
  event: Stripe.Event,
  fetchSubscription: (id: string) => Promise<SubscriptionFacts | null>,
): Promise<NormalizedStripeEvent> {
  const obj = event.data.object as unknown as Record<string, unknown>;
  const base: NormalizedStripeEvent = { type: event.type, customerId: str(obj.customer) };

  switch (event.type) {
    case "checkout.session.completed": {
      const subscriptionId = str(obj.subscription);
      const facts = subscriptionId ? await fetchSubscription(subscriptionId) : null;
      return {
        ...base,
        subscriptionId,
        clientReferenceId:
          typeof obj.client_reference_id === "string" ? obj.client_reference_id : null,
        lookupKey: facts?.lookupKey ?? null,
        status: facts?.status ?? "active",
        currentPeriodEndIso: facts?.currentPeriodEndIso ?? null,
      };
    }
    case "customer.subscription.updated": {
      const facts = factsFromSubscriptionObject(obj);
      return {
        ...base,
        subscriptionId: typeof obj.id === "string" ? obj.id : null,
        lookupKey: facts.lookupKey,
        status: facts.status,
        currentPeriodEndIso: facts.currentPeriodEndIso,
      };
    }
    case "customer.subscription.deleted":
      return { ...base, subscriptionId: typeof obj.id === "string" ? obj.id : null };
    case "invoice.paid":
    case "invoice.payment_failed": {
      // Invoice → subscription id location varies by API version; check the
      // modern parent path first, then the legacy top-level field.
      const parent = obj.parent as
        { subscription_details?: { subscription?: unknown } } | undefined;
      const subscriptionId =
        str(parent?.subscription_details?.subscription) ?? str(obj.subscription);
      const facts = subscriptionId ? await fetchSubscription(subscriptionId) : null;
      return {
        ...base,
        subscriptionId,
        status: facts?.status ?? (event.type === "invoice.paid" ? "active" : "past_due"),
        currentPeriodEndIso: facts?.currentPeriodEndIso ?? null,
      };
    }
    default:
      return base;
  }
}
