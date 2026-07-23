// app/api/lab/claim-and-send/route.ts
//
// The lab-first funnel's capture step (spec: 2026-07-03-lab-first-funnel-
// landing-design.md §4). The visitor just proved OTP possession of their email
// in SendToSelfModal; this authed route turns their lab doc into a real
// project + deliverable and fires ONE send — to the session user's email ONLY
// (hard-pinned server-side; the client never supplies an address, so no
// anonymous send surface exists).
//
// Send failure after the project is saved still returns { projectId } with
// sent:false — the capture already succeeded, the doc is never lost.

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import { getMarketingResend } from "@/lib/email/marketing-client";
import { resolvePostalAddress } from "@/lib/email/postal-address";
import { checkUsageLimit, recordEmailSent } from "@/lib/email/usage";
import { lintCompiledHtml, collectAllowedUrls } from "@/lib/deliverable/url-lint";
import { applyLinkFallbacks, subjectListingUrl } from "@/lib/email/link-audit";
import { brandWebsiteUrl } from "@/lib/email/inject-photo";
import { deriveProjectName } from "@/lib/project/derive-name";
import { applyUserBrandToProject } from "@/lib/project/apply-brand";
import { logActivity } from "@/lib/project/activity";
import { logClaimed } from "@/lib/prospects/arrival-event";
import { REF_RE } from "@/lib/prospects/build-arrival-url";
import type { ProjectItem } from "@/lib/project/items";

export const runtime = "nodejs";
export const maxDuration = 60;

const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.swfldatagulf.com").replace(
  /\/$/,
  "",
);
const EMPTY_NARRATIVE = { exec_summary: "", sections: [], inference_notes: [] };

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Free-build watermark + CAN-SPAM floor (sender identity + postal line). No
 *  unsubscribe link: this is a single user-requested send to the requester —
 *  there is no list to leave. `postalAddress` is the caller's own resolved,
 *  real value (resolvePostalAddress) — never a hardcoded placeholder city. */
function withSelfSendFooter(html: string, webUrl: string, postalAddress: string): string {
  const footer =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px">` +
    `<tr><td style="padding:20px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#8a8a8a">` +
    `You sent this to yourself from the SWFL Data Gulf email lab &middot; ` +
    `<a href="${escAttr(webUrl)}" style="color:#8a8a8a">keep styling it here</a><br>` +
    `Built free with <a href="${BASE_URL}" style="color:#8a8a8a">SWFL Data Gulf</a> &middot; ${escAttr(postalAddress)}` +
    `</td></tr></table>`;
  return html.includes("</body>") ? html.replace("</body>", `${footer}</body>`) : html + footer;
}

export async function POST(req: NextRequest) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = EmailDocSchema.safeParse(body?.doc);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid doc" }, { status: 400 });
  }
  const zip = typeof body?.zip === "string" && /^\d{5}$/.test(body.zip) ? body.zip : null;
  const ref = typeof body?.ref === "string" && REF_RE.test(body.ref) ? body.ref : null;

  // ── 1. Project (cookie client — RLS WITH CHECK is the authorization) ──
  const items: ProjectItem[] = zip
    ? [
        {
          id: crypto.randomUUID(),
          added_at: new Date().toISOString(),
          origin: "web",
          kind: "note",
          text: `Seeded from the ${zip} map — market email for ${zip}.`,
        },
      ]
    : [];
  const title = items.length > 0 ? deriveProjectName(items) : "My market email";
  const projectId = crypto.randomUUID().slice(0, 12);
  const { error: projErr } = await supabase.from("projects").insert({
    id: projectId,
    user_id: user.id,
    title,
    items,
    kind: "general",
    subject_address: null,
  });
  if (projErr) return NextResponse.json({ error: "create failed" }, { status: 500 });
  await applyUserBrandToProject(supabase, user.id, projectId);
  await logActivity(supabase, {
    projectId,
    type: "project_created",
    actor: "user",
    summary: `Project created: "${title}" (lab send-to-self)`,
    detail: { title, source: "lab-claim-and-send", ...(zip ? { zip } : {}) },
  });

  // ── 2. Deliverable (service-role — deliverables has no owner INSERT policy;
  //       ownership was proven by the RLS project insert above) ──
  const deliverableId = crypto.randomUUID();
  const admin = createServiceRoleClient();
  const { error: dErr } = await admin.from("deliverables").insert({
    id: deliverableId,
    project_id: projectId,
    user_id: user.id,
    template: "block-canvas",
    doc: parsed.data,
    instruction: null,
    data_as_of: new Date().toISOString(),
    narrative: EMPTY_NARRATIVE,
    items_snapshot: [],
    status: "ready",
  });
  if (dErr) return NextResponse.json({ error: "save failed" }, { status: 500 });

  // ── 3. Attribution (best-effort, never blocks — mirrors /api/claim) ──
  if (ref) await logClaimed(ref);

  // ── 4. ONE send, to the proven address only ──
  const respond = (sent: boolean) =>
    NextResponse.json({ projectId, deliverableId, sent }, { status: 201 });

  const usage = await checkUsageLimit(user.id);
  if (!usage.allowed) return respond(false); // saved; quota message shows in-project

  // CAN-SPAM floor: a real physical postal address, never a hardcoded city
  // line — mirrors the same gate app/api/deliverables/[id]/blast/route.ts
  // enforces. This route creates a fresh deliverable with no branding blob of
  // its own, so the account-level brand profile is the only lane; nothing
  // real there → skip the send (capture already succeeded, sent:false) rather
  // than fabricate a compliance-critical field.
  const { data: brandProfile } = await supabase
    .from("user_brand_profiles")
    .select("business_address")
    .eq("user_id", user.id)
    .maybeSingle();
  const postalAddress = resolvePostalAddress(null, brandProfile?.business_address ?? null);
  if (!postalAddress) return respond(false); // saved; no real address to send with

  try {
    const webUrl = `${BASE_URL}/project/${projectId}/email-lab?did=${deliverableId}`;
    // Dead-link floor: the funnel self-send has no link popup, so a labeled
    // button/card with no destination falls down the ladder (doc-held links →
    // the recipient's own lab page). Never a dead button in the first email.
    const ladder = applyLinkFallbacks(parsed.data, {
      listingUrl: subjectListingUrl(parsed.data),
      brandWebsiteUrl: brandWebsiteUrl(parsed.data),
      replyMailto: null,
      hostedUrl: webUrl,
    });
    let html = await renderEmailDocHtml(ladder.doc);
    html = withSelfSendFooter(html, webUrl, postalAddress);
    // Fake-link tripwire — every href/src verbatim from the doc or platform.
    const gate = lintCompiledHtml(html, collectAllowedUrls(parsed.data, [], null, null, webUrl));
    if (!gate.ok) return respond(false); // saved; never ship a minted URL

    const senderAddress = process.env.DIGEST_SENDER_ADDRESS || process.env.RESEND_FROM_EMAIL;
    if (!senderAddress) return respond(false);
    const from = `${process.env.DIGEST_SENDER_NAME || "SWFL Data Gulf"} <${senderAddress}>`;
    const subject = zip ? `Your ${title} email — built from live data` : "Your email lab build";

    const resend = getMarketingResend();
    const { error: sendErr } = await resend.emails.send({
      from,
      to: [user.email], // hard-pinned: the address that just proved OTP possession
      subject,
      html,
    });
    if (sendErr) return respond(false);
    await recordEmailSent(user.id, 1);
    return respond(true);
  } catch {
    return respond(false);
  }
}
