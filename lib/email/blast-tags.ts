// lib/email/blast-tags.ts — Resend outbound tags for agent blast sends.
//
// Build 2 (campaign results strip) reads these back off Resend webhook events —
// verified 07/05/2026 (SDK 6.16.0 + live docs): tags ride emails.send AND
// batch.send, and "after the email is sent, the tag is included in the webhook
// event". campaign comes from deliverables.campaign_key (stamped at save when
// a quick-start campaign seeded the build — operator-ratified full thread).
// Resend tag names/values allow only ASCII letters, numbers, underscores, and
// dashes (≤256 chars); an unsafe value is dropped, never shipped — a rejected
// tag would fail the whole send.
const SAFE = /[^A-Za-z0-9_-]/g;

export function blastTags(
  deliverableId: string,
  template: string,
  campaignKey?: string | null,
  variant?: number,
): { name: string; value: string }[] {
  const tags = [
    { name: "did", value: deliverableId.replace(SAFE, "") },
    { name: "tpl", value: template.replace(SAFE, "") },
  ];
  const campaign = (campaignKey ?? "").replace(SAFE, "");
  if (campaign) tags.push({ name: "campaign", value: campaign });
  if (variant !== undefined) tags.push({ name: "variant", value: String(variant) });
  return tags;
}
