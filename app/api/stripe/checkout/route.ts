// app/api/stripe/checkout/route.ts
/**
 * POST {tier, interval} → Stripe hosted Checkout URL (mode=subscription).
 * Cookie-authed user required. Customer created once, reused forever
 * (billing_subscriptions.stripe_customer_id). Price resolved by lookup key
 * so no Stripe price IDs live in code.
 */
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { getStripe } from "@/lib/billing/stripe-client";
import { BILLING_TIERS } from "@/lib/billing/tiers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function siteOrigin(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;
}

export async function POST(req: NextRequest): Promise<Response> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    tier?: string;
    interval?: string;
  } | null;
  const tier = BILLING_TIERS.find((t) => t.slug === body?.tier);
  const interval =
    body?.interval === "annual" ? "annual" : body?.interval === "monthly" ? "monthly" : null;
  if (!tier || !interval) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const lookupKey = interval === "annual" ? tier.lookupKeyAnnual : tier.lookupKeyMonthly;

  let stripe;
  try {
    stripe = getStripe();
  } catch {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const db = createServiceRoleClient();
  const { data: row } = await db
    .from("billing_subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let customerId = row?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;
    // Seed the row now so webhook updates keyed on customer id always land.
    await db.from("billing_subscriptions").upsert(
      {
        user_id: user.id,
        stripe_customer_id: customerId,
        tier: "free",
        status: "none",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  }

  const prices = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  const price = prices.data[0];
  if (!price) {
    console.error(`[stripe-checkout] no price for lookup key ${lookupKey} — run setup-products`);
    return NextResponse.json({ error: "price_missing" }, { status: 500 });
  }

  const origin = siteOrigin(req);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: price.id, quantity: 1 }],
    success_url: `${origin}/billing?status=success`,
    cancel_url: `${origin}/billing`,
  });

  return NextResponse.json({ url: session.url });
}
