// app/api/stripe/report-unlock/route.ts
/**
 * GET ?session_id → verify the Checkout session actually paid, set the signed
 * unlock cookie, land the buyer back on their spread. zip+address ride the
 * session's metadata, so the redirect trusts no client input.
 */
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/billing/stripe-client";
import { mintUnlock, UNLOCK_COOKIE, UNLOCK_DAYS } from "@/lib/billing/report-unlock";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type SessionLookup =
  | { outcome: "found"; session: Stripe.Checkout.Session }
  | { outcome: "invalid" } // genuinely bad/expired/consumed session id
  | { outcome: "unreachable" }; // Stripe hiccup — NOT the same as unpaid

// sa0718_report_unlock_swallows_retrieve_error_to_unpaid: a transient Stripe
// error (network/API/rate-limit) used to be indistinguishable from "this
// session never paid" — a buyer who just checked out got bounced back to the
// paywall with no unlock, no log, no retry. StripeInvalidRequestError on a
// session id IS genuinely unpaid; everything else gets one retry, and if it
// still fails we say so — never fold it into the same "unpaid" bucket.
async function lookupSession(sessionId: string): Promise<SessionLookup> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(sessionId);
      return { outcome: "found", session };
    } catch (err) {
      if (err instanceof Stripe.errors.StripeInvalidRequestError) return { outcome: "invalid" };
      console.error(`[report-unlock] session retrieve failed (attempt ${attempt + 1}/2):`, err);
      if (attempt === 0) await sleep(500);
    }
  }
  return { outcome: "unreachable" };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? req.nextUrl.origin;
  const sessionId = req.nextUrl.searchParams.get("session_id") ?? "";
  if (!sessionId) return NextResponse.redirect(`${origin}/r/should-i-sell`);

  const lookup = await lookupSession(sessionId);

  let paid = false;
  let zip = "";
  let address = "";
  let kind = "seller_report";
  let offer = "";
  let sqft = "";
  if (lookup.outcome === "found") {
    paid = lookup.session.payment_status === "paid";
    zip = lookup.session.metadata?.zip ?? "";
    address = lookup.session.metadata?.address ?? "";
    kind = lookup.session.metadata?.kind ?? "seller_report";
    offer = lookup.session.metadata?.offer ?? "";
    sqft = lookup.session.metadata?.sqft ?? "";
  }

  let back: string;
  if (kind === "offer_check") {
    const qs = new URLSearchParams();
    if (address) qs.set("address", address);
    if (offer) qs.set("offer", offer);
    if (sqft) qs.set("sqft", sqft);
    if (/^\d{5}$/.test(zip)) qs.set("zip", zip);
    back = `${origin}/r/offer-check${qs.size ? `?${qs.toString()}` : ""}`;
  } else {
    back = /^\d{5}$/.test(zip)
      ? `${origin}/r/should-i-sell/${zip}${address ? `?address=${encodeURIComponent(address)}` : ""}`
      : `${origin}/r/should-i-sell`;
  }

  if (lookup.outcome === "unreachable") {
    // Do NOT send a buyer who may well have paid back to the exact same
    // paywall with no signal anything went wrong. No async fallback exists
    // for payment-mode sessions (report-checkout ignores them by design), so
    // this is the best honest signal available: land them back with a flag
    // the report page can render as "we couldn't confirm your payment —
    // reload this link or contact support" instead of a silent re-paywall.
    const unreachable = new URL(back);
    unreachable.searchParams.set("unlock_error", "1");
    return NextResponse.redirect(unreachable.toString());
  }
  if (!paid) return NextResponse.redirect(back);

  (await cookies()).set(UNLOCK_COOKIE, mintUnlock(Date.now()), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: UNLOCK_DAYS * 86400,
  });
  return NextResponse.redirect(back);
}
