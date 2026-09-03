// lib/email/outreach/recipient-upsert.ts
//
// The ONE select-or-insert for outreach_recipients, shared by every cold-send CLI
// (outreach-campaign.mts, outreach-first-touch.mts). Extracted verbatim from
// outreach-campaign.mts on 09/02/2026 so the first-touch sender did not grow a second copy.
// I/O lives here on purpose; the row SHAPE stays pure in recipients.ts (buildRecipientRow).

import type { createServiceRoleClient } from "@/utils/supabase/service-role";
import type { ComposedMessage } from "./campaign";
import { buildRecipientRow } from "./recipients";

export type ServiceDb = ReturnType<typeof createServiceRoleClient>;

/**
 * Select-or-insert the recipient by (campaign_id, lower(email)); return its id. The
 * unique index is on the functional (campaign_id, lower(email)), so we match on the
 * already-normalized email rather than PostgREST onConflict over an expression. A
 * re-run of the same campaign updates the row in place (idempotent).
 */
export async function upsertRecipient(
  db: ServiceDb,
  campaignId: string,
  m: ComposedMessage,
): Promise<string> {
  const row = buildRecipientRow(campaignId, m);
  const { data: existing, error: selErr } = await db
    .from("outreach_recipients")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("email", row.email)
    .maybeSingle();
  if (selErr) throw new Error(`select recipient ${row.email}: ${selErr.message}`);
  if (existing?.id) {
    const { error: upErr } = await db
      .from("outreach_recipients")
      .update({
        name: row.name,
        domain: row.domain,
        zip: row.zip,
        brand: row.brand,
        brand_source: row.brand_source,
        brand_confidence: row.brand_confidence,
        arrival_url: row.arrival_url,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id as string);
    if (upErr) throw new Error(`update recipient ${row.email}: ${upErr.message}`);
    return existing.id as string;
  }
  const { data: inserted, error: insErr } = await db
    .from("outreach_recipients")
    .insert(row)
    .select("id")
    .single();
  if (insErr || !inserted) {
    throw new Error(`insert recipient ${row.email}: ${insErr?.message ?? "no row returned"}`);
  }
  return inserted.id as string;
}
