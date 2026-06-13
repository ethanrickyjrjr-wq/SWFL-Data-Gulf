// scripts/email/migrate-segment-names.mts
//
// One-time, idempotent migration to the per-tenant namespaced Resend segment name
// `${userId}:${slug}` (see lib/email/audience-sync.ts `segmentName`). resend@6.12.3's
// Segments API has NO update/rename (verified in node_modules: create/list/get/remove
// only), so a legacy bare-named segment must be RE-CREATED under the namespaced name.
//
// SEQUENCE PER ROW (order is load-bearing — the old segment is removed LAST so a tenant
// is never left without an active segment):
//   count(*)  →  create namespaced  →  re-sync contacts from email_contacts
//             →  repoint email_audiences.resend_audience_id  →  remove() the old segment
//
// Idempotent: a row whose segment is already named `${userId}:${slug}` is skipped.
// Almost certainly a no-op in prod today (the multi-tenant engine has never run), but
// it is the correct migration the moment any tenant audience exists.
//
// Run:  DRY_RUN=true bun scripts/email/migrate-segment-names.mts   # report only
//       bun scripts/email/migrate-segment-names.mts                # apply

import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { getMarketingResend } from "@/lib/email/marketing-client";
import { segmentName } from "@/lib/email/audience-sync";

const DRY = process.env.DRY_RUN === "true";

interface AudienceRow {
  id: number;
  user_id: string;
  audience_slug: string;
  resend_audience_id: string | null;
}

async function main(): Promise<void> {
  const db = createServiceRoleClient();
  const resend = getMarketingResend();

  // ── count(*) ──
  const { data, error } = await db
    .from("email_audiences")
    .select("id, user_id, audience_slug, resend_audience_id");
  if (error) throw new Error(`read email_audiences: ${error.message}`);
  const rows = (data ?? []) as AudienceRow[];
  console.log(`[migrate-segments] ${rows.length} email_audiences row(s) total.`);
  if (rows.length === 0) {
    console.log("[migrate-segments] nothing to migrate (no tenant audiences exist).");
    return;
  }

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const a of rows) {
    const want = segmentName(a.user_id, a.audience_slug);
    const oldId = a.resend_audience_id;
    try {
      // What is the current segment's name?
      let currentName: string | null = null;
      if (oldId) {
        const got = await resend.segments.get(oldId);
        currentName = got.error ? null : (got.data?.name ?? null);
      }
      if (currentName === want) {
        skipped++;
        continue; // already namespaced
      }

      if (DRY) {
        console.log(
          `[migrate-segments] WOULD migrate audience ${a.id} (user ${a.user_id}, slug "${a.audience_slug}"): ` +
            `"${currentName ?? "(no segment)"}" -> "${want}".`,
        );
        continue;
      }

      // 1) CREATE the namespaced segment.
      const created = await resend.segments.create({ name: want });
      if (created.error || !created.data?.id) {
        throw new Error(
          `segments.create("${want}"): ${created.error?.message ?? "no id returned"}`,
        );
      }
      const newId = created.data.id;

      // 2) RE-SYNC contacts from email_contacts (the source of truth) into the new segment.
      const { data: contactRows, error: cErr } = await db
        .from("email_contacts")
        .select("email, tags")
        .eq("user_id", a.user_id);
      if (cErr) throw new Error(`read email_contacts: ${cErr.message}`);
      const emails = (contactRows ?? [])
        .filter(
          (c) =>
            Array.isArray(c.tags) &&
            c.tags.map((t: string) => String(t).trim().toLowerCase()).includes(a.audience_slug),
        )
        .map((c) => String(c.email).trim().toLowerCase())
        .filter(Boolean);
      let synced = 0;
      for (const email of emails) {
        const r = await resend.contacts.create({
          email,
          unsubscribed: false,
          segments: [{ id: newId }],
        });
        if (!r.error) synced++;
        else console.warn(`[migrate-segments]   contact "${email}" -> ${want}: ${r.error.message}`);
      }

      // 3) REPOINT the cache id to the new segment.
      const { error: upErr } = await db
        .from("email_audiences")
        .update({ resend_audience_id: newId, updated_at: new Date().toISOString() })
        .eq("id", a.id);
      if (upErr) throw new Error(`repoint email_audiences ${a.id}: ${upErr.message}`);

      // 4) REMOVE the old segment LAST — only after re-sync + repoint succeeded, so a
      //    tenant is never without an active segment at any point.
      if (oldId && oldId !== newId) {
        const rm = await resend.segments.remove(oldId);
        if (rm.error)
          console.warn(`[migrate-segments]   remove old segment ${oldId}: ${rm.error.message}`);
      }

      migrated++;
      console.log(
        `[migrate-segments] migrated audience ${a.id} -> "${want}" ` +
          `(${synced}/${emails.length} contacts re-synced; old=${oldId ?? "(none)"} removed).`,
      );
    } catch (e) {
      failed++;
      console.error(
        `[migrate-segments] FAILED audience ${a.id} (user ${a.user_id}, slug "${a.audience_slug}"): ` +
          `${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  console.log(
    `[migrate-segments] done — migrated=${migrated} skipped(already-namespaced)=${skipped} failed=${failed}.`,
  );
}

main().catch((e) => {
  console.error("[migrate-segments] FATAL", e);
  process.exit(1);
});
