// app/api/weekly-read/subscribe/route.ts
//
// Weekly-read enrollment (Lane D). SEPARATE from /api/email/subscribe (the daily
// digest, a Resend Segment broadcast): weekly-read rows live in
// public.weekly_read_subscribers and are sent personalized-per-ZIP by our own
// runner. Unlike the digest, the ZIP is the product here — missing/out-of-scope
// ZIP is a hard 400, never a silent drop.

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { normalizeEmail, isValidEmail, sanitizeSource } from "@/lib/email/validation";
import { resolveZip } from "@/refinery/lib/zip-resolver.mts";

export const runtime = "nodejs";

/**
 * Canonical opt-in wording — defined server-side so the recorded consent can't be
 * spoofed by the client. The subscribe form's submit IS the opt-in action (the CTA
 * copy promises exactly this), so it's recorded on every enrollment.
 */
const CONSENT_TEXT = "Yes, send me the weekly market read for my ZIP. I can unsubscribe anytime.";

export async function POST(request: Request) {
  let payload: { email?: unknown; source?: unknown; zip?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const email = normalizeEmail(payload.email);
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  // The MOAT gate: weekly-read is per-ZIP by definition — only the 6-county footprint.
  const rawZip = typeof payload.zip === "string" ? payload.zip.trim() : "";
  if (!/^\d{5}$/.test(rawZip) || !resolveZip(rawZip).in_scope) {
    return NextResponse.json({ error: "invalid_zip" }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleClient();
    const now = new Date().toISOString();
    // One subscription per address: re-subscribing updates the ZIP and reactivates
    // (a fresh opt-in outranks a stale unsubscribe). next_send_at null = first issue
    // goes out on the next run.
    const { error } = await supabase.from("weekly_read_subscribers").upsert(
      {
        email,
        zip: rawZip,
        status: "active",
        next_send_at: null,
        source: sanitizeSource(payload.source),
        consent_text: CONSENT_TEXT,
        consent_at: now,
        updated_at: now,
      },
      { onConflict: "email" },
    );
    if (error) {
      console.error("[weekly-read/subscribe] upsert error:", error);
      return NextResponse.json({ error: "subscribe_failed" }, { status: 500 });
    }
  } catch (e) {
    console.error("[weekly-read/subscribe] supabase unavailable:", e);
    return NextResponse.json({ error: "subscribe_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
