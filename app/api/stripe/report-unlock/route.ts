// app/api/stripe/report-unlock/route.ts
/**
 * GET ?session_id → verify the Checkout session actually paid, set the signed
 * unlock cookie, land the buyer back on their spread. zip+address ride the
 * session's metadata, so the redirect trusts no client input.
 */
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getStripe } from "@/lib/billing/stripe-client";
import { mintUnlock, UNLOCK_COOKIE, UNLOCK_DAYS } from "@/lib/billing/report-unlock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? req.nextUrl.origin;
  const sessionId = req.nextUrl.searchParams.get("session_id") ?? "";
  if (!sessionId) return NextResponse.redirect(`${origin}/r/should-i-sell`);

  let paid = false;
  let zip = "";
  let address = "";
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    paid = session.payment_status === "paid";
    zip = session.metadata?.zip ?? "";
    address = session.metadata?.address ?? "";
  } catch {
    // unknown session → treated as unpaid below
  }

  const back = /^\d{5}$/.test(zip)
    ? `${origin}/r/should-i-sell/${zip}${address ? `?address=${encodeURIComponent(address)}` : ""}`
    : `${origin}/r/should-i-sell`;
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
