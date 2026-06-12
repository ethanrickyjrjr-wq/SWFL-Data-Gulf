import { NextResponse } from "next/server";
import { getMarketingResend, getDigestSegmentId } from "@/lib/email/marketing-client";

/**
 * Server-side digest broadcast trigger (Email Marketing Phase 2).
 *
 * Why this exists: Resend Broadcasts (the only way to send to a Segment, with
 * managed unsubscribe) require a full_access key, which must NOT live in the GHA
 * cron. So the cron renders the digest HTML/subject and POSTs it here; this
 * route — running in the Vercel app where full_access lives — fires the
 * broadcast. Bearer-protected with DIGEST_BROADCAST_SECRET.
 *
 * Safe by default: creates a Resend DRAFT (operator reviews + sends in the
 * dashboard) unless the caller passes `send: true` for an immediate send.
 *
 * Compliance guard: the HTML MUST contain Resend's managed-unsubscribe token
 * `{{{RESEND_UNSUBSCRIBE_URL}}}`. Without it a broadcast ships with no working
 * per-recipient unsubscribe — a CAN-SPAM violation — so we reject it.
 */
const UNSUBSCRIBE_TOKEN = "{{{RESEND_UNSUBSCRIBE_URL}}}";

export async function POST(request: Request) {
  const secret = process.env.DIGEST_BROADCAST_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    subject?: unknown;
    html?: unknown;
    send?: unknown;
    previewText?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const html = typeof body.html === "string" ? body.html : "";
  if (!subject || !html) {
    return NextResponse.json({ error: "subject_and_html_required" }, { status: 400 });
  }
  if (!html.includes(UNSUBSCRIBE_TOKEN)) {
    return NextResponse.json({ error: "missing_unsubscribe_token" }, { status: 400 });
  }

  const senderName = process.env.DIGEST_SENDER_NAME;
  const senderAddress = process.env.DIGEST_SENDER_ADDRESS;
  if (!senderName || !senderAddress) {
    return NextResponse.json({ error: "sender_not_configured" }, { status: 503 });
  }
  const from = `${senderName} <${senderAddress}>`;

  let segmentId: string;
  try {
    segmentId = getDigestSegmentId();
  } catch {
    return NextResponse.json({ error: "segment_not_configured" }, { status: 503 });
  }

  const sendNow = body.send === true;
  try {
    const resend = getMarketingResend();
    // `send` is a discriminated union in the SDK ({send:true,…} | {send?:false}),
    // so build the two shapes as distinct concrete calls rather than spreading.
    const base = {
      segmentId,
      from,
      subject,
      html,
      ...(typeof body.previewText === "string" ? { previewText: body.previewText } : {}),
    };
    const { data, error } = sendNow
      ? await resend.broadcasts.create({ ...base, send: true })
      : await resend.broadcasts.create(base);
    if (error || !data) {
      console.error("[email/broadcast] resend error:", error);
      return NextResponse.json({ error: "broadcast_failed" }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      broadcast_id: data.id,
      status: sendNow ? "sent" : "draft",
    });
  } catch (e) {
    console.error("[email/broadcast] unavailable:", e);
    return NextResponse.json({ error: "broadcast_failed" }, { status: 502 });
  }
}
