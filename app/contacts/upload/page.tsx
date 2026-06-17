import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import { UploadForm } from "./UploadForm";

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
  searchParams: Promise<{ next?: string }>;
}) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/contacts/upload");

  const { next } = await searchParams;
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-xl font-semibold text-white">Upload contacts</h1>
      <p className="mt-1 text-sm text-gray-400">
        Add a recipient list so you can send (and schedule) your reports to it. The list name
        becomes a pickable audience.
      </p>
      <UploadForm backHref={typeof next === "string" && next.startsWith("/") ? next : "/project"} />
    </main>
  );
}
