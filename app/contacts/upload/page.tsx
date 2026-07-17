import { Suspense } from "react";
import { PageShell } from "@/components/PageShell";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import QRCode from "qrcode";
import { createClient } from "@/utils/supabase/server";
import { issueContactImportToken } from "@/lib/email/contact-import-token";
import { siteBaseUrl } from "@/lib/email/google-oauth";
import { isSafeReturnPath } from "@/lib/safe-return";
import { SWITCH_ADDRESS_LOCAL } from "@/lib/switch/forward-inbound";
import { replyDomain } from "@/lib/email/reply-token";
import { formatAsOfDate } from "@/lib/charts/format";
import { UploadForm } from "./UploadForm";
import { SwitchSection } from "./SwitchSection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Upload contacts — SWFL Data Gulf" };

/**
 * /contacts/upload — the contacts-upload UI the "Send weekly" handle links to
 * (Task 6 acceptance: "audience chips + Upload contacts"). Drives the existing
 * POST /api/email/contacts/upload (CSV → email_contacts) then /sync (tags →
 * Resend segments → email_audiences), so a freshly-uploaded list shows up as a
 * pickable audience. Auth-gated (the APIs are RLS-scoped to auth.uid()).
 */
export default async function ContactsUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; mailchimp_error?: string }>;
}) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/contacts/upload");

  const { next, mailchimp_error } = await searchParams;

  // Switch surface (Task 12): the user's OWN pending forwards + active Switch
  // Pass, both owner-read RLS so the signed-in query is self-scoped to auth.uid().
  const nowIso = new Date().toISOString();
  const [{ data: forwardRows }, { data: passRow }] = await Promise.all([
    supabase
      .from("switch_forwards")
      .select("id, kind, platform, sender_domain, payload")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("switch_passes")
      .select("tier, expires_at")
      .gt("expires_at", nowIso)
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const pendingForwards = (forwardRows ?? []).map((r) => {
    const payload = (r.payload ?? {}) as { rows?: unknown[] };
    const contactCount =
      r.kind === "contact_export" && Array.isArray(payload.rows) ? payload.rows.length : null;
    return {
      id: r.id,
      kind: r.kind === "contact_export" ? ("contact_export" as const) : ("campaign" as const),
      platform: r.platform ?? null,
      senderDomain: r.sender_domain ?? null,
      contactCount,
    };
  });

  const activePass = passRow
    ? { tier: passRow.tier, expiresLabel: formatAsOfDate(passRow.expires_at) ?? null }
    : null;

  const switchAddress = `${SWITCH_ADDRESS_LOCAL}@${replyDomain()}`;

  // Mint a short-lived signed token per work-only choice so the phone (no session)
  // is authorized by the token alone; render each as a QR the user scans from their
  // phone. Null when no signing secret is configured → the QR section is hidden.
  const base = siteBaseUrl();
  const toQr = async (workOnly: boolean): Promise<string | null> => {
    const token = issueContactImportToken({ uid: user.id, workOnly });
    if (!token) return null;
    return QRCode.toDataURL(`${base}/m/contacts/${token}`, { width: 176, margin: 1 });
  };
  const [qrAll, qrWork] = await Promise.all([toQr(false), toQr(true)]);

  return (
    <PageShell width="narrow">
      <h1 className="text-xl font-semibold text-white">Upload contacts</h1>
      <p className="mt-1 text-sm text-gray-400">
        Add a recipient list so you can send (and schedule) your reports to it. The list name
        becomes a pickable audience.
      </p>
      <Suspense fallback={null}>
        <UploadForm
          backHref={isSafeReturnPath(next) ? next : "/project"}
          qrAll={qrAll}
          qrWork={qrWork}
        />
      </Suspense>
      <SwitchSection
        switchAddress={switchAddress}
        mailchimpError={mailchimp_error ?? null}
        activePass={activePass}
        pendingForwards={pendingForwards}
      />
    </PageShell>
  );
}
