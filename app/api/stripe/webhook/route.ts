// app/api/stripe/webhook/route.ts
/**
 * Stripe webhook — the ONLY writer of billing_subscriptions tier state.
 * Same refuse-to-process pattern as app/api/webhooks/resend/route.ts:
 * unset secret → 500, bad signature → 401. Handled/ignored events → 200
 * always, so Stripe never retry-storms. Idempotent: upsert keyed on user
 * (checkout) or update keyed on customer id (everything else).
 */
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { getStripe } from "@/lib/billing/stripe-client";
import { normalizeEvent, type SubscriptionFacts } from "@/lib/billing/normalize-event";
import { subscriptionMutationFromEvent } from "@/lib/billing/stripe-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET unset — refusing to process.");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      raw,
      request.headers.get("stripe-signature") ?? "",
      secret,
    );
  } catch {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  const fetchSubscription = async (id: string): Promise<SubscriptionFacts | null> => {
    try {
      const sub = await getStripe().subscriptions.retrieve(id);
      const item = sub.items.data[0];
      const periodEnd =
        (item as unknown as { current_period_end?: number }).current_period_end ??
        (sub as unknown as { current_period_end?: number }).current_period_end ??
        null;
      return {
        lookupKey: item?.price.lookup_key ?? null,
        status: sub.status,
        currentPeriodEndIso: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      };
    } catch (err) {
      console.error("[stripe-webhook] subscription retrieve failed:", err);
      return null;
    }
  };

  const normalized = await normalizeEvent(event, fetchSubscription);
  const mutation = subscriptionMutationFromEvent(normalized, new Date().toISOString());
  if (!mutation) return NextResponse.json({ received: true, ignored: true });

  const db = createServiceRoleClient();
  if (mutation.user_id) {
    // checkout: we know the user — upsert the full row. (Spread re-pins
    // user_id as a definite string; the if-guard doesn't narrow the object.)
    const { error } = await db
      .from("billing_subscriptions")
      .upsert({ ...mutation, user_id: mutation.user_id }, { onConflict: "user_id" });
    if (error) console.error("[stripe-webhook] upsert failed:", error.message);
  } else {
    // subscription/invoice events: keyed by customer id. A miss means we
    // never saw the checkout — log and ack (never invent a row).
    const { stripe_customer_id, ...fields } = mutation;
    const { error, count } = await db
      .from("billing_subscriptions")
      .update(fields, { count: "exact" })
      .eq("stripe_customer_id", stripe_customer_id);
    if (error) console.error("[stripe-webhook] update failed:", error.message);
    else if (count === 0)
      console.error(`[stripe-webhook] no row for customer ${stripe_customer_id} (${event.type})`);
  }

  return NextResponse.json({ received: true });
}
