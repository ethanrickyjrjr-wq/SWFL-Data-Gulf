/**
 * GET /api/email/contacts/mailchimp/start
 *
 * Begins the one-shot Mailchimp member import. Requires a signed-in user
 * (the import is RLS-scoped to them on the callback leg). Mints a CSRF
 * `state`, stows it in a short-lived httpOnly cookie, and redirects to
 * Mailchimp's consent screen. Mirrors app/api/email/contacts/google/start.
 */
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/utils/supabase/server";
import {
  buildMailchimpAuthUrl,
  mailchimpRedirectUri,
  mailchimpOauthConfigured,
} from "@/lib/email/mailchimp-oauth";
import { checkRateLimit, clientIpFromHeaders, rateLimitHeaders } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OAUTH_STATE_COOKIE = "mc_contacts_oauth";

export async function GET(req: NextRequest) {
  // Per-IP rate limit — guards OAuth-mint spam (not in the middleware prefix list).
  const rl = checkRateLimit(clientIpFromHeaders(req.headers));
  if (rl.limited) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/contacts/upload", req.url));
  }

  if (!mailchimpOauthConfigured()) {
    return NextResponse.redirect(
      new URL("/contacts/upload?mailchimp_error=not_configured", req.url),
    );
  }

  const state = randomBytes(16).toString("hex");
  const redirectUri = mailchimpRedirectUri(req.url);

  const res = NextResponse.redirect(buildMailchimpAuthUrl({ state, redirectUri }));
  // httpOnly + 10-min TTL; single-use (callback deletes it); lax so the cookie
  // rides the top-level redirect back from Mailchimp.
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
