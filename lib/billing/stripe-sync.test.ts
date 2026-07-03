// lib/billing/stripe-sync.test.ts
import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import {
  tierFromLookupKey,
  subscriptionMutationFromEvent,
  type NormalizedStripeEvent,
} from "./stripe-sync.ts";

const NOW = "2026-07-03T12:00:00.000Z";

function ev(partial: Partial<NormalizedStripeEvent>): NormalizedStripeEvent {
  return { type: "unknown", customerId: "cus_1", ...partial };
}

describe("tierFromLookupKey", () => {
  test("maps every registered lookup key", () => {
    assert.equal(tierFromLookupKey("swfl_starter_monthly"), "starter");
    assert.equal(tierFromLookupKey("swfl_starter_annual"), "starter");
    assert.equal(tierFromLookupKey("swfl_growth_monthly"), "growth");
    assert.equal(tierFromLookupKey("swfl_pro_annual"), "pro");
  });
  test("unknown key → null, never a guess", () => {
    assert.equal(tierFromLookupKey("swfl_mega_monthly"), null);
    assert.equal(tierFromLookupKey(null), null);
    assert.equal(tierFromLookupKey(undefined), null);
  });
});

describe("subscriptionMutationFromEvent", () => {
  test("checkout.session.completed → full row with user_id", () => {
    const m = subscriptionMutationFromEvent(
      ev({
        type: "checkout.session.completed",
        clientReferenceId: "user-1",
        subscriptionId: "sub_1",
        lookupKey: "swfl_growth_monthly",
        status: "active",
        currentPeriodEndIso: "2026-08-03T12:00:00.000Z",
      }),
      NOW,
    );
    assert.deepEqual(m, {
      user_id: "user-1",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
      tier: "growth",
      status: "active",
      current_period_end: "2026-08-03T12:00:00.000Z",
      updated_at: NOW,
    });
  });

  test("checkout without client_reference_id → null (never invent a row)", () => {
    const m = subscriptionMutationFromEvent(
      ev({ type: "checkout.session.completed", lookupKey: "swfl_pro_monthly" }),
      NOW,
    );
    assert.equal(m, null);
  });

  test("subscription.updated past_due KEEPS the paid tier (dunning policy)", () => {
    const m = subscriptionMutationFromEvent(
      ev({
        type: "customer.subscription.updated",
        subscriptionId: "sub_1",
        lookupKey: "swfl_starter_monthly",
        status: "past_due",
      }),
      NOW,
    );
    assert.equal(m?.tier, "starter");
    assert.equal(m?.status, "past_due");
  });

  test("subscription.deleted → tier free, status canceled", () => {
    const m = subscriptionMutationFromEvent(
      ev({ type: "customer.subscription.deleted", subscriptionId: "sub_1" }),
      NOW,
    );
    assert.equal(m?.tier, "free");
    assert.equal(m?.status, "canceled");
    assert.equal(m?.stripe_subscription_id, null);
  });

  test("invoice.paid / invoice.payment_failed → status+period only, NO tier field", () => {
    const paid = subscriptionMutationFromEvent(
      ev({
        type: "invoice.paid",
        status: "active",
        currentPeriodEndIso: "2026-08-01T00:00:00.000Z",
      }),
      NOW,
    );
    assert.equal(paid?.tier, undefined);
    assert.equal(paid?.status, "active");
    const failed = subscriptionMutationFromEvent(
      ev({ type: "invoice.payment_failed", status: "past_due" }),
      NOW,
    );
    assert.equal(failed?.tier, undefined);
    assert.equal(failed?.status, "past_due");
  });

  test("unhandled event type → null", () => {
    assert.equal(subscriptionMutationFromEvent(ev({ type: "charge.refunded" }), NOW), null);
  });

  test("missing customerId → null", () => {
    assert.equal(
      subscriptionMutationFromEvent(ev({ type: "invoice.paid", customerId: null }), NOW),
      null,
    );
  });

  test("updated with UNKNOWN lookup key → null (never guess a tier)", () => {
    const m = subscriptionMutationFromEvent(
      ev({ type: "customer.subscription.updated", lookupKey: "swfl_mystery", status: "active" }),
      NOW,
    );
    assert.equal(m, null);
  });
});
