/**
 * POST /api/email/contacts/sync — Unit C2 (Resend audience sync).
 *
 * INPUT CONTRACT: no body required.
 *
 * For the signed-in user: reads `public.email_contacts`, enumerates the distinct
 * tag values, and for each tag (= `audience_slug`):
 *   - find-or-creates the corresponding Resend **segment** (reusing
 *     `email_audiences.resend_audience_id` when present — idempotent, no
 *     duplicate segments on re-sync),
 *   - upserts each tagged contact into that segment (Resend `contacts.create` is
 *     idempotent on duplicate email — no duplicate contacts on re-sync),
 *   - upserts `public.email_audiences(user_id, audience_slug, resend_audience_id,
 *     contact_count)` with the live tagged-contact count.
 *
 * RESPONSE: 200 { ok, total_audiences, total_contacts_synced, skipped_untagged,
 *                 audiences: [{ audience_slug, resend_audience_id, contact_count,
 *                               created, contacts_synced, errors }] }
 *           401 unauthenticated
 *           500 Resend client unavailable / unexpected failure
 *
 * AUTH: cookie/RLS client only (copy pattern from app/api/projects/route.ts and
 * the C1 sibling app/api/email/contacts/upload/route.ts). RLS `auth.uid() =
 * user_id` IS the authorization — reads of `email_contacts` return only this
 * user's rows; writes to `email_audiences` carry `user_id: user.id`. Never use
 * the service-role client here.
 *
 * RESEND: the full_access `getMarketingResend()` client — segments + contacts
 * need it. The send-only key 401s on these endpoints. See audience-sync.ts for
 * the verified-live SDK surface (segments.*, contacts.create({ segments })).
 */

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { getMarketingResend } from "@/lib/email/marketing-client";
import {
  syncUserAudiences,
  type AudienceStore,
  type ContactRow,
  type AudienceRecord,
} from "@/lib/email/audience-sync";

export const runtime = "nodejs";

/**
 * Adapt the cookie/RLS Supabase client to the `AudienceStore` seam, closing over
 * `userId` for writes (RLS handles read scoping; writes carry the id explicitly).
 */
function makeStore(supabase: SupabaseClient, userId: string): AudienceStore {
  return {
    async readContacts(): Promise<ContactRow[]> {
      const { data, error } = await supabase.from("email_contacts").select("email, tags");
      if (error) throw new Error(`read email_contacts: ${error.message}`);
      return (data ?? []) as ContactRow[];
    },

    async readAudiences(): Promise<AudienceRecord[]> {
      const { data, error } = await supabase
        .from("email_audiences")
        .select("audience_slug, resend_audience_id");
      if (error) throw new Error(`read email_audiences: ${error.message}`);
      return (data ?? []).filter(
        (r): r is AudienceRecord =>
          typeof r.audience_slug === "string" && typeof r.resend_audience_id === "string",
      );
    },

    async upsertAudience(row): Promise<void> {
      const { error } = await supabase.from("email_audiences").upsert(
        {
          user_id: userId,
          audience_slug: row.audience_slug,
          resend_audience_id: row.resend_audience_id,
          contact_count: row.contact_count,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,audience_slug" },
      );
      if (error) throw new Error(error.message);
    },
  };
}

export async function POST(_req: NextRequest) {
  // --- Auth (cookie/RLS client; copy pattern from app/api/projects/route.ts) ---
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // --- Resend (full_access) ---
  let resend;
  try {
    resend = getMarketingResend();
  } catch (e) {
    return NextResponse.json(
      { error: "resend_unconfigured", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  // --- Sync ---
  try {
    const summary = await syncUserAudiences(resend, makeStore(supabase, user.id), user.id);
    return NextResponse.json({ ok: true, ...summary }, { status: 200 });
  } catch (e) {
    console.error("[email/contacts/sync] failed:", e);
    return NextResponse.json(
      { error: "sync_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
