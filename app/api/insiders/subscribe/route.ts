// app/api/insiders/subscribe/route.ts
//
// Insiders Edition enrollment. SEPARATE from /api/weekly-read/subscribe (per-ZIP
// weekly, hard ZIP gate) and /api/email/subscribe (daily digest broadcast): the
// Insiders Edition is the regional monthly flagship — no ZIP, one list. Rows live
// in public.insiders_subscribers and are sent by our own runner (Phase C).

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { normalizeEmail, isValidEmail, sanitizeSource } from "@/lib/email/validation";

export const runtime = "nodejs";

/**
 * Canonical opt-in wording — defined server-side so the recorded consent can't be
 * spoofed by the client. The subscribe form's submit IS the opt-in action (the CTA
 * copy promises exactly this), so it's recorded on every enrollment.
 */
const CONSENT_TEXT =
  "Yes, send me the Insiders Edition — the monthly Southwest Florida market read. I can unsubscribe anytime.";

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

  try {
    const supabase = createServiceRoleClient();
    const now = new Date().toISOString();
    // One subscription per address: re-subscribing reactivates (a fresh opt-in
    // outranks a stale unsubscribe).
    const { error } = await supabase.from("insiders_subscribers").upsert(
      {
        email,
        status: "active",
        source: sanitizeSource(payload.source),
        consent_text: CONSENT_TEXT,
        consent_at: now,
        updated_at: now,
      },
      { onConflict: "email" },
    );
    if (error) {
      console.error("[insiders/subscribe] upsert error:", error);
      return NextResponse.json({ error: "subscribe_failed" }, { status: 500 });
    }
  } catch (e) {
    console.error("[insiders/subscribe] supabase unavailable:", e);
    return NextResponse.json({ error: "subscribe_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
