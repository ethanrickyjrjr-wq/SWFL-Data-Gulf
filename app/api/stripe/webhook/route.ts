// app/api/stripe/webhook/route.ts
/**
 * Stripe webhook — the ONLY writer of billing_subscriptions tier state.
 * Same refuse-to-process pattern as app/api/webhooks/resend/route.ts:
 * unset secret → 500, bad signature → 401. A genuinely ignored/unknown event
 * type → 200 (nothing to do). A normalize failure or a DB write failure →
 * 5xx, on purpose, so Stripe's own retry redelivers it rather than the tier
 * change being silently lost (sa0718_checkout_session_completed_silently_
 * drops_, fixed 08/06/2026 — was 200-always). Idempotent: upsert keyed on
 * user (checkout) or update keyed on customer id (everything else).
 */
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { getStripe, isResourceMissing } from "@/lib/billing/stripe-client";
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

  // sa0718_checkout_session_completed_silently_drops_: this used to catch a
  // retrieve failure and return null, which normalizeEvent reads as "no
  // lookup key" — a real Stripe hiccup was indistinguishable from "nothing to
  // fetch," so the write was silently skipped, we ack'd 200, and Stripe never
  // retried: the tier upgrade was gone forever. Let it throw instead — the
  // POST handler below catches it and returns a 5xx so Stripe retries the
  // event until the write actually lands.
  const fetchSubscription = async (id: string): Promise<SubscriptionFacts> => {
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
  };

  let normalized;
  try {
    normalized = await normalizeEvent(event, fetchSubscription);
  } catch (err) {
    if (isResourceMissing(err)) {
      // Stripe itself says the subscription is gone — retrying a genuine
      // deletion forever is pointless, so ack instead of asking for retry.
      // Everything else (network blip, rate limit, Stripe 5xx) still falls
      // through to the 502 below so Stripe keeps redelivering the event.
      console.error(
        `[stripe-webhook] subscription genuinely missing for ${event.type} — acking:`,
        err,
      );
      return NextResponse.json({ received: true, ignored: true });
    }
    console.error(`[stripe-webhook] normalize failed for ${event.type} — retry requested:`, err);
    return NextResponse.json({ error: "normalize_failed" }, { status: 502 });
  }
  const mutation = subscriptionMutationFromEvent(normalized, new Date().toISOString());
  if (!mutation) return NextResponse.json({ received: true, ignored: true });

  const db = createServiceRoleClient();
  if (mutation.user_id) {
    // checkout: we know the user — upsert the full row. (Spread re-pins
    // user_id as a definite string; the if-guard doesn't narrow the object.)
    const { error } = await db
      .from("billing_subscriptions")
      .upsert({ ...mutation, user_id: mutation.user_id }, { onConflict: "user_id" });
    if (error) {
      // Same failure shape as the retrieve fix above (sa0718 second-order
      // review, 08/06/2026): acking 200 on a write failure drops the tier
      // upgrade exactly as silently as a swallowed fetch error did. A 5xx
      // asks Stripe to retry instead of losing the event.
      console.error("[stripe-webhook] upsert failed — retry requested:", error.message);
      return NextResponse.json({ error: "write_failed" }, { status: 502 });
    }
  } else {
    // subscription/invoice events: keyed by customer id. A miss means we
    // never saw the checkout — log and ack (never invent a row); that's a
    // data-integrity signal, not a transient failure, so it stays a 200.
    const { stripe_customer_id, ...fields } = mutation;
    const { error, count } = await db
      .from("billing_subscriptions")
      .update(fields, { count: "exact" })
      .eq("stripe_customer_id", stripe_customer_id);
    if (error) {
      console.error("[stripe-webhook] update failed — retry requested:", error.message);
      return NextResponse.json({ error: "write_failed" }, { status: 502 });
    }
    if (count === 0)
      console.error(`[stripe-webhook] no row for customer ${stripe_customer_id} (${event.type})`);
  }

  return NextResponse.json({ received: true });
}
