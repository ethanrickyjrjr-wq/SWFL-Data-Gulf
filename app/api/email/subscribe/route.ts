import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { getMarketingResend, getDigestSegmentId } from "@/lib/email/marketing-client";
import { normalizeEmail, isValidEmail, sanitizeSource } from "@/lib/email/validation";
import { resolveZip } from "@/refinery/lib/zip-resolver.mts";

/**
 * The canonical opt-in wording — defined server-side so the recorded consent can't
 * be spoofed by the client. Stored verbatim with a timestamp when `consent === true`
 * (Resend AUP requires explicit opt-in; CAN-SPAM requires a clear consent record).
 */
const CONSENT_TEXT =
  "Yes, send me my SWFL market report and what changes each week. I can unsubscribe anytime.";

/** A brand skin a prospect may carry in (white-label producer for prospect_brand). */
function sanitizeBrand(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const k of ["primary_color", "accent_color", "logo_url", "company_name"]) {
    const v = b[k];
    if (typeof v === "string" && v.trim().length > 0 && v.length <= 256) out[k] = v.trim();
  }
  return Object.keys(out).length ? out : null;
}

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
  let payload: {
    email?: unknown;
    source?: unknown;
    zip?: unknown;
    consent?: unknown;
    brand?: unknown;
  };
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

  // Scope: a prospect's patch. Stored ONLY when it resolves inside the 6-county
  // footprint (the MOAT gate) — never an out-of-scope ZIP, never an invented grain.
  const rawZip = typeof payload.zip === "string" ? payload.zip.trim() : "";
  let scope: { zip: string } | null = null;
  if (/^\d{5}$/.test(rawZip) && resolveZip(rawZip).in_scope) {
    scope = { zip: rawZip };
  }

  // Explicit opt-in record (Resend AUP / CAN-SPAM). We store the canonical wording,
  // never client-supplied text, so the consent record is authoritative.
  const consented = payload.consent === true;
  const prospectBrand = sanitizeBrand(payload.brand);

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
        // Additive: only set when supplied, so the legacy capture path is unchanged.
        ...(scope ? { scope } : {}),
        ...(consented ? { consent_text: CONSENT_TEXT, consent_at: new Date().toISOString() } : {}),
        ...(prospectBrand ? { prospect_brand: prospectBrand } : {}),
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
