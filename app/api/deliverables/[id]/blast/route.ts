import type { EmailDeliverableRow } from "@/lib/deliverable/email-deliverable";
// POST /api/deliverables/[id]/blast — send a frozen email deliverable to selected
// contacts via Resend.
//
// SEND is the paywall (build is free): this route enforces the per-user email
// quota (checkUsageLimit) and records usage (recordEmailSent). It renders the
// REAL deliverable HTML (renderGroundedReport — the same render /p/[id] shows),
// not a bare link, and sends from the platform's VERIFIED domain with the agent's
// name + reply-to (sending From: an unverified agent address would fail DKIM and
// land in spam). Each recipient gets a one-click unsubscribe (List-Unsubscribe
// header for Gmail + an in-body footer link as the CAN-SPAM floor).
//
// Split-send (variant_test): an optional { subjects?, ctas? } on the request body
// cohort-hashes each recipient (cohortIndex, Task 8) into 2-4 groups, deterministically
// and stably across a retried/partial send. subjects-only and ctas-only tests are both
// valid; when both axes are given they must be the same length (one cohort = one
// subject + one CTA). A single-length override (e.g. variant_test: {ctas:[x]}) is a
// content override, not a real test — it applies to every recipient, tags no
// `variant:i`, and persists no `variant_config` (isRealSplit requires variantCount>=2).
// Block-canvas only — the legacy non-block-canvas template branch is untouched.
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getMarketingResend } from "@/lib/email/marketing-client";
import { checkUsageLimit, recordEmailSent } from "@/lib/email/usage";
import { bindUnsubscribeHref } from "@/lib/email/bind-unsubscribe";
import { buildEmailDeliverableModel } from "@/lib/deliverable/email-deliverable";
import { renderGroundedReport } from "@/lib/email/grounded-report";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import { renderEmailDocToBuffer, pdfFilename } from "@/lib/pdf";
import { logActivity } from "@/lib/project/activity";
import { lintCompiledHtml, collectAllowedUrls } from "@/lib/deliverable/url-lint";
import { blastTags } from "@/lib/email/blast-tags";
import { cohortIndex } from "@/lib/email/variant-cohort";
import {
  partitionByEngagement,
  WAVE2_DELAY_MS,
  WAVE2_PACE_MS,
  type ContactEventRow,
} from "@/lib/email/blast-stagger";
import {
  validateVariantTest,
  variantTestMatchesDoc,
  withCtaLabel,
} from "@/lib/email/blast-variant-doc";
import type { EmailDoc } from "@/lib/email/doc/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_CONTACTS = 500;
const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.swfldatagulf.com").replace(
  /\/$/,
  "",
);

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Replace {{merge_tags}} with per-recipient values. Case-insensitive. */
function withMergeTags(html: string, c: { name: string | null; email: string }): string {
  const firstName = (c.name ?? "").split(/\s+/)[0] || "there";
  const fullName = c.name ?? c.email;
  return html
    .replace(/\{\{first_name\}\}/gi, firstName)
    .replace(/\{\{full_name\}\}/gi, fullName)
    .replace(/\{\{email\}\}/gi, c.email);
}

/** Per-recipient unsubscribe + view-online footer, injected before </body>. */
function withFooter(html: string, webUrl: string, unsubUrl: string): string {
  const footer =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px">` +
    `<tr><td style="padding:20px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#8a8a8a">` +
    `<a href="${escAttr(webUrl)}" style="color:#8a8a8a">View this report online</a> &middot; ` +
    `<a href="${escAttr(unsubUrl)}" style="color:#8a8a8a">Unsubscribe</a><br>` +
    `SWFL Data Gulf &middot; Fort Myers, FL` +
    `</td></tr></table>`;
  return html.includes("</body>") ? html.replace("</body>", `${footer}</body>`) : html + footer;
}

/** A short, clean subject from the deliverable's prose, with a sensible default. */
function deriveSubject(narrative: { exec_summary?: string } | null): string {
  const s = (narrative?.exec_summary ?? "").trim();
  if (!s) return "Your SWFL market report";
  const firstSentence = s.split(/(?<=[.!?])\s/)[0] ?? s;
  return firstSentence.length > 90 ? firstSentence.slice(0, 87) + "…" : firstSentence;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const rawIds: unknown[] = Array.isArray(body?.contact_ids) ? body.contact_ids : [];
  const contactIds = [...new Set(rawIds.filter((v): v is string => typeof v === "string"))];
  if (contactIds.length === 0) {
    return NextResponse.json({ error: "contact_ids required" }, { status: 400 });
  }
  if (contactIds.length > MAX_CONTACTS) {
    return NextResponse.json({ error: `max ${MAX_CONTACTS} contacts per blast` }, { status: 400 });
  }

  // Split-send request: optional { subjects?, ctas? }, validated against each
  // other (mismatched lengths, >4 variants) before any rendering/quota work.
  // Absent entirely (the common case) → variantCount stays 1 and every branch
  // below behaves exactly as it did before split-send existed.
  const variantTestRaw = body?.variant_test as { subjects?: string[]; ctas?: string[] } | undefined;
  let variantCount = 1;
  if (variantTestRaw) {
    const v = validateVariantTest(variantTestRaw);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 422 });
    variantCount = v.variantCount;
  }

  // Deliverable (RLS proves ownership → non-owner sees nothing → 404).
  const { data: deliverable } = await supabase
    .from("deliverables")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!deliverable) return NextResponse.json({ error: "not found" }, { status: 404 });
  // Block-canvas (Email Lab) emails are first-class senders alongside the legacy
  // "email" template — both carry frozen, ready content.
  const BLASTABLE = new Set(["email", "block-canvas"]);
  if (!BLASTABLE.has(deliverable.template)) {
    return NextResponse.json({ error: "deliverable is not sendable" }, { status: 400 });
  }
  if (deliverable.status !== "ready") {
    return NextResponse.json({ error: "deliverable is not ready" }, { status: 400 });
  }

  // Split-send content moat: every subject/CTA in variant_test must already be
  // one of the doc's own AI-authored variants (doc.subjectVariants/ctaVariants
  // — populated only after filterAnchoredVariants + cleanTellText at build
  // time). This request body is reachable by any authenticated caller, not
  // just the send-modal UI, which only ever offers the doc's own variants —
  // without this check a raw API call could push an unanchored-number or
  // voice-tell string straight into a real send, skipping the moat every
  // authored string already passes through. It also means split-testing only
  // exists for docs the model actually wrote variants onto (block-canvas),
  // matching this route's stated scope.
  if (
    variantTestRaw &&
    !variantTestMatchesDoc(variantTestRaw, deliverable.doc as EmailDoc | null)
  ) {
    return NextResponse.json(
      { error: "variant_test values must match the deliverable's own authored variants" },
      { status: 422 },
    );
  }

  // SEND is the paywall — gate on the user's monthly quota before doing any work.
  const usage = await checkUsageLimit(user.id);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: "quota_reached", tier: usage.tier, sent: usage.sent, limit: usage.limit },
      { status: 402 },
    );
  }

  // Recipients: own, not unsubscribed.
  const { data: contacts, error: contactsErr } = await supabase
    .from("contacts")
    .select("id, email, name")
    .in("id", contactIds)
    .eq("user_id", user.id)
    .eq("unsubscribed", false);
  if (contactsErr) {
    return NextResponse.json({ error: "contacts fetch failed" }, { status: 500 });
  }
  if (!contacts || contacts.length === 0) {
    return NextResponse.json({ error: "no sendable contacts" }, { status: 400 });
  }

  // Render the REAL report once (same engine as /p/[id]); per-recipient we only
  // swap the footer's unsubscribe link. Non-ZIP deliverables (model null) fall
  // back to a minimal wrapper linking to the web version. A ctas split-test
  // renders 2-4 near-identical HTML variants (same doc, only the button label
  // differs) instead of one; every other path renders exactly one, same as
  // before split-send existed.
  const webUrl = `${BASE_URL}/p/${id}`;
  // Opt-in PDF attachment — block-canvas only (the only template the PDF root
  // renders). Default off: attachments inflate every message.
  const includePdf = body?.include_pdf === true && deliverable.template === "block-canvas";
  let htmlByVariant: string[] = [];
  let pdfBuffer: Buffer | null = null;

  if (deliverable.template === "block-canvas") {
    // Render the SAME block-canvas HTML the Email Lab preview shows — through
    // the ONE EmailDoc→HTML root, so paid grid docs compile here exactly like
    // the render route (a doc must never preview compiled but send stacked) —
    // and, when requested, a real PDF through the single PDF root.
    const parsedDoc = EmailDocSchema.safeParse(deliverable.doc);
    if (!parsedDoc.success) {
      return NextResponse.json({ error: "invalid email document" }, { status: 422 });
    }
    const ctas = variantTestRaw?.ctas;
    const docsToRender =
      ctas && ctas.length > 1
        ? ctas.map((label) => withCtaLabel(parsedDoc.data, label))
        : ctas && ctas.length === 1
          ? [withCtaLabel(parsedDoc.data, ctas[0])]
          : [parsedDoc.data];
    htmlByVariant = await Promise.all(docsToRender.map((d) => renderEmailDocHtml(d)));
    if (includePdf) {
      pdfBuffer = await renderEmailDocToBuffer(parsedDoc.data);
    }
  } else {
    // jsonb read: the typed row carries items_snapshot/narrative as Json; the builder
    // reads the concrete EmailDeliverableRow shape (same columns, concrete jsonb).
    const model = buildEmailDeliverableModel(deliverable as unknown as EmailDeliverableRow, {
      siteOrigin: BASE_URL,
    });
    let legacyHtml: string;
    if (model) {
      legacyHtml = await renderGroundedReport(model, { skin: "email" });
    } else {
      legacyHtml =
        `<!doctype html><html><body style="font-family:Arial,sans-serif;padding:24px">` +
        `<p style="font-size:16px;color:#111">Your market report is ready.</p>` +
        `<p><a href="${escAttr(webUrl)}" style="display:inline-block;background:#3DC9C0;color:#fff;` +
        `padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">View Report</a></p>` +
        `</body></html>`;
    }
    // Split-send is block-canvas only (plan's own scope note) — legacy template
    // always renders exactly one HTML, regardless of variant_test.
    htmlByVariant = [legacyHtml];
  }
  const baseHtml = htmlByVariant[0]; // keep existing single-HTML call sites (url-lint) working

  // Fake-link tripwire (invention-surface-guards §C, unattended send = hard
  // fail): every href/src in the compiled email must be verbatim from the
  // deliverable's own content (doc/snapshot/branding) or a platform link. A
  // minted URL never ships. Every htmlByVariant entry is the SAME doc with only
  // the button label swapped, so linting the first is sufficient.
  const allowedUrls = collectAllowedUrls(
    deliverable.doc,
    deliverable.items_snapshot,
    deliverable.narrative,
    deliverable.branding,
    webUrl,
  );
  const urlGate = lintCompiledHtml(baseHtml, allowedUrls);
  if (!urlGate.ok) {
    return NextResponse.json(
      { error: "url_violation", violations: urlGate.violations },
      { status: 422 },
    );
  }

  // Deliverability-safe sender: verified platform address, agent's name shown,
  // agent's account email as reply-to.
  const branding = (deliverable.branding ?? {}) as { name?: string };
  const senderName = branding.name?.trim() || process.env.DIGEST_SENDER_NAME || "SWFL Data Gulf";
  const senderAddress = process.env.DIGEST_SENDER_ADDRESS || process.env.RESEND_FROM_EMAIL;
  if (!senderAddress) {
    return NextResponse.json({ error: "sender_not_configured" }, { status: 503 });
  }
  const from = `${senderName} <${senderAddress}>`;
  const replyTo = user.email || undefined;
  const subjectByVariant: string[] =
    variantTestRaw?.subjects && variantTestRaw.subjects.length > 0
      ? variantTestRaw.subjects
      : [
          typeof body?.subject === "string" && body.subject.trim()
            ? body.subject.trim()
            : deriveSubject(deliverable.narrative as { exec_summary?: string } | null),
        ];

  // A real split needs >=2 cohorts on at least one axis — a single-length
  // override (subjects or ctas) renders/sends that one value to everyone but
  // is a content override, not a test: no variant_config persisted, no
  // variant:i tag on the Resend send.
  const isRealSplit = variantCount >= 2;

  // Audit row.
  const { data: blast } = await supabase
    .from("email_blasts")
    .insert({
      user_id: user.id,
      deliverable_id: id,
      contact_ids: contacts.map((c) => c.id),
      status: "sending",
      ...(isRealSplit
        ? {
            variant_config: {
              subjects: variantTestRaw?.subjects ?? null,
              ctas: variantTestRaw?.ctas ?? null,
            },
          }
        : {}),
    })
    .select("id")
    .single();

  // ── Engagement-staggered waves (spec: 2026-07-09-engagement-staggered-send-design.md) ──
  // Wave 1 = engaged / new / thin-history contacts, batch-sent NOW. Wave 2 = dormant
  // (≥2 deliveries, zero opens/clicks) or bouncy contacts, scheduled +2h via per-recipient
  // scheduledAt (Resend's batch endpoint has no scheduled_at — verified 07/09/2026).
  // Fail-open: an engagement-lookup error means "no history" → everyone sends now,
  // exactly the pre-stagger behavior. The lookup is chunked to keep PostgREST URLs sane.
  const startedAt = Date.now();
  const engagementRows: ContactEventRow[] = [];
  for (let i = 0; i < contacts.length; i += 100) {
    const chunk = contacts.slice(i, i + 100);
    const { data: rows } = await supabase
      .from("email_events")
      .select("contact_id, event")
      .eq("user_id", user.id)
      .in(
        "contact_id",
        chunk.map((c) => c.id),
      );
    if (rows) engagementRows.push(...rows);
  }
  const { wave1, wave2 } = partitionByEngagement(contacts, engagementRows);
  const wave2ScheduledAt = new Date(startedAt + WAVE2_DELAY_MS).toISOString();
  // Stop scheduling wave 2 this many ms into the request; the remainder degrades to an
  // immediate send (never a timeout). 15s of headroom under maxDuration.
  const wave2Deadline = startedAt + (maxDuration - 15) * 1000;

  const resend = getMarketingResend();
  let sent = 0;
  let failed = 0;
  let scheduled = 0;

  const messageFor = (c: { id: string; email: string; name: string | null }) => {
    const cohort = isRealSplit ? cohortIndex(c.id, variantCount) : 0;
    const html = htmlByVariant[cohort] ?? htmlByVariant[0];
    const subject = subjectByVariant[cohort] ?? subjectByVariant[0];
    const unsubUrl = `${BASE_URL}/api/unsubscribe?id=${c.id}`;
    const finalHtml = withMergeTags(
      bindUnsubscribeHref(withFooter(html, webUrl, unsubUrl), unsubUrl),
      c,
    );
    return {
      from,
      to: [c.email],
      subject,
      html: finalHtml,
      ...(replyTo ? { replyTo } : {}),
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      // Attribution hook: webhook events carry these back (Build 2 reads them).
      // `campaign` = the quick-start campaign that seeded this deliverable
      // (deliverables.campaign_key, stamped at save) — null for organic builds.
      // `variant:<cohort>` tags only a real split (isRealSplit) so a single-value
      // content override never fakes a two-arm test in the results aggregator.
      tags: blastTags(
        id,
        deliverable.template,
        deliverable.campaign_key,
        isRealSplit ? cohort : undefined,
        c.id,
      ),
    };
  };

  /** Sleep between wave-2 sends: 4/s stays under Resend's 5 req/s team limit. */
  const pace = () => new Promise((r) => setTimeout(r, WAVE2_PACE_MS));

  /** Wave-2 per-recipient scheduled send. Returns false once the deadline passes
   *  so the caller can degrade the remainder to an immediate send. */
  const scheduleOne = async (
    c: (typeof contacts)[number],
    attachments?: { content: Buffer; filename: string }[],
  ): Promise<boolean> => {
    if (Date.now() >= wave2Deadline) return false;
    try {
      const { error } = await resend.emails.send({
        ...messageFor(c),
        ...(attachments ? { attachments } : {}),
        scheduledAt: wave2ScheduledAt,
      });
      if (error) failed += 1;
      else scheduled += 1;
    } catch {
      failed += 1;
    }
    await pace();
    return true;
  };

  if (pdfBuffer) {
    // Resend's BATCH endpoint strips attachments — its payload type is
    // Omit<CreateEmailOptions, "attachments" | "scheduledAt"> (verified against the
    // installed SDK, index.d.cts:635). So an attached PDF forces per-recipient
    // emails.send() — which is also the only lane that supports scheduledAt.
    const attachments = [{ content: pdfBuffer, filename: pdfFilename() }];
    for (const c of wave1) {
      try {
        const { error } = await resend.emails.send({ ...messageFor(c), attachments });
        if (error) failed += 1;
        else sent += 1;
      } catch {
        failed += 1;
      }
    }
    for (let i = 0; i < wave2.length; i += 1) {
      const c = wave2[i];
      if (!(await scheduleOne(c, attachments))) {
        // Deadline hit → the rest sends immediately (degrade, never time out).
        for (const rest of wave2.slice(i)) {
          try {
            const { error } = await resend.emails.send({ ...messageFor(rest), attachments });
            if (error) failed += 1;
            else sent += 1;
          } catch {
            failed += 1;
          }
        }
        break;
      }
    }
  } else {
    // No attachment → wave 1 on the fast batch path, up to 100 per call.
    for (let i = 0; i < wave1.length; i += 100) {
      const batch = wave1.slice(i, i + 100);
      try {
        const { error } = await resend.batch.send(batch.map(messageFor));
        if (error) failed += batch.length;
        else sent += batch.length;
      } catch {
        failed += batch.length;
      }
    }
    // Wave 2: per-recipient scheduled sends (batch has no scheduled_at). On
    // deadline, the remainder degrades to immediate batches.
    for (let i = 0; i < wave2.length; i += 1) {
      if (!(await scheduleOne(wave2[i]))) {
        const overflow = wave2.slice(i);
        for (let j = 0; j < overflow.length; j += 100) {
          const batch = overflow.slice(j, j + 100);
          try {
            const { error } = await resend.batch.send(batch.map(messageFor));
            if (error) failed += batch.length;
            else sent += batch.length;
          } catch {
            failed += batch.length;
          }
        }
        break;
      }
    }
  }

  // A wave-2 scheduled email is a committed send: it counts toward sent_count,
  // quota, and the activity summary; the response separates it so the UI can say
  // "N now, M scheduled".
  const accepted = sent + scheduled;
  if (blast?.id) {
    await supabase
      .from("email_blasts")
      .update({
        status: failed > 0 && accepted === 0 ? "failed" : "sent",
        sent_count: accepted,
        failed_count: failed,
        sent_at: new Date().toISOString(),
      })
      .eq("id", blast.id);
  }
  if (accepted > 0) await recordEmailSent(user.id, accepted);

  // Activity log on any successful send so the AI knows "email blast sent to N contacts".
  if (accepted > 0 && deliverable.project_id) {
    await logActivity(supabase, {
      projectId: deliverable.project_id,
      type: "email_sent",
      actor: "system",
      summary:
        scheduled > 0
          ? `Email blast sent to ${sent} contact${sent === 1 ? "" : "s"} now, ${scheduled} scheduled +2h (engagement stagger)`
          : `Email blast sent to ${sent} contact${sent === 1 ? "" : "s"}`,
      detail: { sent, failed, scheduled, deliverable_id: id, subject: subjectByVariant[0] },
    });
  }

  return NextResponse.json({ sent, failed, scheduled });
}
