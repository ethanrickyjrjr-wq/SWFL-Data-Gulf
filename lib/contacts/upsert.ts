// lib/contacts/upsert.ts
// THE canonical write path into public.contacts. Every bulk-import connector
// (CSV/vCard today via app/api/contacts/import; Mailchimp/Follow Up
// Boss/export-webhook lanes next — Tasks 6, 7, 10) calls this instead of
// hand-rolling its own batch loop (extract on copy #3).
//
// THE ONE BEHAVIORAL RULE: an import may SET unsubscribed:true (honoring an
// opt-out recorded on a competitor platform) but must NEVER write
// unsubscribed:false — that would resurrect an opt-out a user recorded
// directly with us. A row whose `unsubscribed` is not strictly `true` OMITS
// the column from the upsert payload entirely, so onConflict's merge leaves
// whatever is already in the DB untouched.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";
import type { ContactRow } from "@/lib/contacts/types";

const BATCH_SIZE = 100;

/**
 * In-batch dedup — collapses rows sharing the exact same `email` string
 * (case-SENSITIVE: public.contacts' UNIQUE(user_id,email) is case-sensitive,
 * so "A@x.com" and "a@x.com" are different keys and are NOT merged) before
 * they ever reach a single `.upsert()` call. Two rows with the same
 * (user_id, email) landing in one upsert call make Postgres throw "ON
 * CONFLICT DO UPDATE command cannot affect row a second time" — this closes
 * `contacts_upsert_no_same_batch_email_dedup` (a repeated CSV/vCard address,
 * or an upcoming connector that doesn't pre-dedupe like Mailchimp's mapper
 * does, would hit it today).
 *
 * Merge folds left-to-right over duplicates (later row wins ties):
 *   - name/phone: later non-null value wins; a later null never nulls out
 *     an earlier value
 *   - tags: union, order-preserving first-seen
 *   - attribs: shallow merge, later keys win
 *   - unsubscribed: one-way — true wins if ANY duplicate says true;
 *     otherwise the key stays ABSENT (mirrors the opt-out rule below)
 */
function dedupeSameBatchEmails(rows: ContactRow[]): ContactRow[] {
  const order: string[] = [];
  const byEmail = new Map<string, ContactRow>();

  for (const r of rows) {
    const prev = byEmail.get(r.email);
    if (!prev) {
      order.push(r.email);
      byEmail.set(r.email, { ...r, tags: [...r.tags], attribs: { ...r.attribs } });
      continue;
    }
    byEmail.set(r.email, {
      name: r.name ?? prev.name,
      email: r.email,
      phone: r.phone ?? prev.phone,
      tags: Array.from(new Set([...prev.tags, ...r.tags])),
      attribs: { ...prev.attribs, ...r.attribs },
      ...(prev.unsubscribed === true || r.unsubscribed === true
        ? { unsubscribed: true as const }
        : {}),
    });
  }

  return order.map((email) => byEmail.get(email)!);
}

export async function upsertCanonicalContacts(
  supabase: SupabaseClient<Database>,
  userId: string,
  rows: ContactRow[],
): Promise<{ added: number; error: string | null }> {
  let added = 0;
  const deduped = dedupeSameBatchEmails(rows);

  // PostgREST derives a request's column set as the UNION of keys across
  // every object in the payload (postgrest-js PostgrestQueryBuilder.upsert:
  // `values.reduce((acc, x) => acc.concat(Object.keys(x)), [])`), and per
  // the PostgREST docs (Prefer Header — Missing): "any missing columns in
  // the payload will be inserted as null value by default." So a single
  // call mixing an `unsubscribed:true` row with rows that omit the key
  // would have PostgREST fill THOSE rows' `unsubscribed` with null/default
  // — resurrecting an opt-out, exactly what this module exists to prevent.
  // Partition opt-outs from everything else BEFORE chunking so every call's
  // batch has a homogeneous key set (either every row specifies
  // `unsubscribed` or none do).
  const optedOut = deduped.filter((r) => r.unsubscribed === true);
  const rest = deduped.filter((r) => r.unsubscribed !== true);

  for (const group of [optedOut, rest]) {
    for (let i = 0; i < group.length; i += BATCH_SIZE) {
      const batch = group.slice(i, i + BATCH_SIZE).map((r) => ({
        name: r.name,
        email: r.email,
        phone: r.phone,
        tags: r.tags,
        attribs: r.attribs,
        user_id: userId,
        // Omit the key entirely unless the source explicitly says opted-out —
        // see the ONE BEHAVIORAL RULE above.
        ...(r.unsubscribed === true ? { unsubscribed: true as const } : {}),
      }));

      // No .select() chained — Supabase docs: "By default, upserted rows are
      // not returned." We don't need the rows back, only the count, and
      // Supabase upsert doesn't distinguish insert vs update anyway — count
      // every row in a successful batch as added.
      const { error } = await supabase
        .from("contacts")
        .upsert(batch, { onConflict: "user_id,email" });

      if (error) {
        return { added, error: error.message };
      }
      added += batch.length;
    }
  }

  return { added, error: null };
}
