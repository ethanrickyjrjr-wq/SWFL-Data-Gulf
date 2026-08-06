// app/api/stripe/portal/route.ts
/**
 * POST → short-lived Stripe customer-portal URL for the authed user.
 * All plan management (upgrade/downgrade/cancel/payment method) happens
 * in the portal — we build no plan-management UI (spec non-goal).
 */
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { getStripe } from "@/lib/billing/stripe-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = createServiceRoleClient();
  // sa0718_portal_route_drops_supabase_read_error: `error` used to be
  // silently discarded, so a transient read failure looked identical to "no
  // customer" — a real subscriber got a 404 instead of their portal link.
  // Fail closed with a distinct status instead of collapsing into "not found".
  const { data: row, error: readErr } = await db
    .from("billing_subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (readErr) {
    console.error(`[stripe-portal] billing_subscriptions read failed: ${readErr.message}`);
    return NextResponse.json({ error: "billing_unavailable" }, { status: 503 });
  }
  if (!row?.stripe_customer_id) {
    return NextResponse.json({ error: "no_customer" }, { status: 404 });
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;
  const session = await stripe.billingPortal.sessions.create({
    customer: row.stripe_customer_id,
    return_url: `${origin}/billing`,
  });

  return NextResponse.json({ url: session.url });
}
