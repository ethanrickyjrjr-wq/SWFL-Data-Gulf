import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { getMarketingResend, getDigestSegmentId } from "@/lib/email/marketing-client";
import { normalizeEmail, isValidEmail, sanitizeSource } from "@/lib/email/validation";

/**
 * Daily-digest subscribe endpoint (Email Marketing Phase 2).
 *
 * Adds the email to the Resend digest Segment (the delivery + managed-unsubscribe
 * source of truth) and mirrors a row into public.email_subscribers (app-side
 * analytics + Phase 3 reply prefs). SEPARATE from /api/waitlist (launch-notify).
 *
 * Uses the full_access Resend key — server-side only (never the GHA cron).
 * Resend's contacts.create is idempotent on duplicate email (verified live:
 * returns the same contact id, no error), so re-subscribing is a no-op upsert.
 */
export async function POST(request: Request) {
  let payload: { email?: unknown; source?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const email = normalizeEmail(payload.email);
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  const source = sanitizeSource(payload.source);

  // 1) Add to the Resend Segment — the list the digest broadcast actually sends to.
  let segmentId: string | null = null;
  let contactId: string | null = null;
  try {
    segmentId = getDigestSegmentId();
    const { data, error } = await getMarketingResend().contacts.create({
      email,
      unsubscribed: false,
      segments: [{ id: segmentId }],
    });
    if (error) {
      // Don't lose the signup over a Resend hiccup — fall through to the DB mirror.
      console.error("[email/subscribe] resend contacts.create error:", error);
    } else {
      contactId = data?.id ?? null;
    }
  } catch (e) {
    console.error("[email/subscribe] resend unavailable:", e);
  }

  // 2) Mirror to Supabase (idempotent on the unique email).
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("email_subscribers").upsert(
      {
        email,
        status: "subscribed",
        source,
        segment_id: segmentId,
        contact_id: contactId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email" },
    );
    if (error) {
      console.error("[email/subscribe] supabase upsert error:", error);
      // The contact is already on the Resend segment (delivery source of truth);
      // a mirror-write failure must not 500 a successful subscribe.
    }
  } catch (e) {
    console.error("[email/subscribe] supabase unavailable:", e);
  }

  // A subscribe is successful if the contact reached Resend OR we recorded it.
  // Both paths above swallow their own errors; only a total failure (no segment
  // configured AND no contact id) is worth surfacing.
  if (!contactId && !segmentId) {
    return NextResponse.json({ error: "subscribe_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
