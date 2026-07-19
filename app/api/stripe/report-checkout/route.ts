// app/api/stripe/report-checkout/route.ts
/**
 * POST {zip, address?} → Stripe hosted Checkout URL (mode=payment) for the
 * one-time Should I Sell spread unlock. Guest-friendly: no auth and no
 * customer row — the billing webhook ignores payment-mode sessions (no
 * client_reference_id) by design, so tier state is never touched.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getStripe } from "@/lib/billing/stripe-client";
import { SELLER_REPORT } from "@/lib/billing/tiers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_ZIP = /^\d{5}$/;

function siteOrigin(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;
}

export async function POST(req: NextRequest): Promise<Response> {
  const body = (await req.json().catch(() => null)) as {
    zip?: string;
    address?: string;
  } | null;
  const zip = body?.zip ?? "";
  const address = (body?.address ?? "").trim().slice(0, 200);
  if (!VALID_ZIP.test(zip)) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  let stripe;
  try {
    stripe = getStripe();
  } catch {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const prices = await stripe.prices.list({ lookup_keys: [SELLER_REPORT.lookupKey], limit: 1 });
  const price = prices.data[0];
  if (!price) {
    console.error(
      `[report-checkout] no price for ${SELLER_REPORT.lookupKey} — run setup-report-product`,
    );
    return NextResponse.json({ error: "price_missing" }, { status: 500 });
  }

  const origin = siteOrigin(req);
  const cancel = `${origin}/r/should-i-sell/${zip}${
    address ? `?address=${encodeURIComponent(address)}` : ""
  }`;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: price.id, quantity: 1 }],
    metadata: { kind: "seller_report", zip, address },
    success_url: `${origin}/api/stripe/report-unlock?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancel,
  });

  return NextResponse.json({ url: session.url });
}
