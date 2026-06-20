// lib/email/outreach/recipients.ts
//
// Pure helpers for the outreach_recipients ledger: normalize the email key and build
// the insert row from a composed message. Kept PURE (no DB) so it's unit tested; the
// actual upsert I/O lives in the CLI/runner adapters with the real service-role
// client. Columns mirror docs/sql/20260620_outreach_recipients.sql.

import type { ComposedMessage } from "./campaign";

/** Canonical recipient key: trimmed + lowercased. Unique index is (campaign_id, lower(email)). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface RecipientInsert {
  campaign_id: string;
  email: string;
  name: string | null;
  domain: string | null;
  zip: string | null;
  /** What we keep of the resolved brand for our records (not the full ActivationBrand). */
  brand: { primary: string | null; used_house_brand: boolean } | null;
  brand_source: string;
  brand_confidence: number;
  arrival_url: string | null;
}

/** Build the outreach_recipients insert payload from a composed message. Pure. */
export function buildRecipientRow(campaignId: string, m: ComposedMessage): RecipientInsert {
  return {
    campaign_id: campaignId,
    email: normalizeEmail(m.email),
    name: m.name ?? null,
    domain: m.domain ?? null,
    zip: m.zip ?? null,
    brand: m.primary != null ? { primary: m.primary, used_house_brand: m.usedHouseBrand } : null,
    brand_source: m.brandSource,
    brand_confidence: m.brandConfidence,
    arrival_url: m.arrivalUrl || null,
  };
}
