// lib/email/segments/resolve.ts
//
// Thin Supabase wrapper for the pure filter engine (./filter.ts). Fetches the
// user's contacts, plus — only when the filter references an engagement
// condition — the email_events rows for those specific deliverable ids
// (never a full-table pull). Mirrors lib/email/suppression.ts's
// getSuppressedContacts chunked-fetch pattern.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateSegment,
  type Condition,
  type SegmentContact,
  type SegmentEventRow,
} from "./filter";

const CHUNK = 100;

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

/** Every deliverable_id referenced by an engagement leaf anywhere in the filter. */
function engagementDeliverableIds(cond: Condition): string[] {
  if ("and" in cond) return cond.and.flatMap(engagementDeliverableIds);
  if ("or" in cond) return cond.or.flatMap(engagementDeliverableIds);
  if ("not" in cond) return engagementDeliverableIds(cond.not);
  if (cond.field === "engagement") return [cond.deliverable_id];
  return [];
}

/**
 * Resolve which of `userId`'s contacts match `filter`.
 *
 * Fails open to an empty list on a contacts-read error (never throws — the
 * picker shows "0 matches" rather than crashing). An email_events lookup
 * error is likewise swallowed per chunk (fail open, matching
 * suppression.ts's posture) — a chunk that errors simply contributes no
 * engagement rows, never blocks resolution of the rest.
 */
export async function resolveSegment(
  db: SupabaseClient,
  userId: string,
  filter: Condition,
): Promise<SegmentContact[]> {
  const { data: contactRows, error: contactsErr } = await db
    .from("contacts")
    .select("id, email, name, tags, attribs")
    .eq("user_id", userId)
    .eq("unsubscribed", false);
  if (contactsErr || !contactRows) return [];

  const contacts: SegmentContact[] = contactRows.map((c: Record<string, unknown>) => ({
    id: c.id as string,
    email: c.email as string,
    name: (c.name as string) ?? null,
    tags: (c.tags as string[]) ?? [],
    attribs: (c.attribs as Record<string, string>) ?? {},
  }));

  const deliverableIds = [...new Set(engagementDeliverableIds(filter))];
  const events: SegmentEventRow[] = [];
  if (deliverableIds.length > 0) {
    const contactIds = contacts.map((c) => c.id);
    for (const idChunk of chunks(contactIds)) {
      const { data } = await db
        .from("email_events")
        .select("contact_id, event, did")
        .eq("user_id", userId)
        .in("contact_id", idChunk)
        .in("did", deliverableIds);
      if (data) events.push(...(data as SegmentEventRow[]));
    }
  }

  return evaluateSegment(contacts, events, filter);
}
