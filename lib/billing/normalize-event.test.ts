// lib/billing/normalize-event.test.ts
import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import { normalizeEvent, type SubscriptionFacts } from "./normalize-event.ts";

const FACTS: SubscriptionFacts = {
  lookupKey: "swfl_growth_monthly",
  status: "active",
  currentPeriodEndIso: "2026-08-03T00:00:00.000Z",
  customerId: "cus_1",
};
const fetchFacts = async () => FACTS;
const fetchNever = async () => {
  throw new Error("should not fetch");
};

// Minimal Stripe.Event shapes — only the fields normalizeEvent reads.
function stripeEvent(type: string, object: Record<string, unknown>) {
  return { type, data: { object } } as unknown as Parameters<typeof normalizeEvent>[0];
}

describe("normalizeEvent", () => {
  test("checkout.session.completed fetches subscription facts for the lookup key", async () => {
    const n = await normalizeEvent(
      stripeEvent("checkout.session.completed", {
        customer: "cus_1",
        subscription: "sub_1",
        client_reference_id: "user-1",
      }),
      fetchFacts,
    );
    assert.equal(n.type, "checkout.session.completed");
    assert.equal(n.customerId, "cus_1");
    assert.equal(n.subscriptionId, "sub_1");
    assert.equal(n.clientReferenceId, "user-1");
    assert.equal(n.lookupKey, "swfl_growth_monthly");
    assert.equal(n.status, "active");
  });

  test("customer.subscription.updated reads facts from the event object itself", async () => {
    const n = await normalizeEvent(
      stripeEvent("customer.subscription.updated", {
        id: "sub_1",
        customer: "cus_1",
        status: "past_due",
        items: { data: [{ price: { lookup_key: "swfl_starter_monthly" } }] },
      }),
      fetchNever,
    );
    assert.equal(n.lookupKey, "swfl_starter_monthly");
    assert.equal(n.status, "past_due");
    assert.equal(n.subscriptionId, "sub_1");
  });

  test("customer.subscription.deleted needs no fetch", async () => {
    const n = await normalizeEvent(
      stripeEvent("customer.subscription.deleted", { id: "sub_1", customer: "cus_1" }),
      fetchNever,
    );
    assert.equal(n.type, "customer.subscription.deleted");
    assert.equal(n.customerId, "cus_1");
  });

  test("invoice.paid fetches subscription facts when a subscription id is present", async () => {
    const n = await normalizeEvent(
      stripeEvent("invoice.paid", {
        customer: "cus_1",
        parent: { subscription_details: { subscription: "sub_1" } },
      }),
      fetchFacts,
    );
    assert.equal(n.status, "active");
    assert.equal(n.currentPeriodEndIso, "2026-08-03T00:00:00.000Z");
  });

  test("unhandled type passes through with customer only", async () => {
    const n = await normalizeEvent(
      stripeEvent("charge.refunded", { customer: "cus_9" }),
      fetchNever,
    );
    assert.equal(n.type, "charge.refunded");
    assert.equal(n.customerId, "cus_9");
  });
});
