// lib/email/blast-tags.ts — Resend outbound tags for agent blast sends.
//
// Build 2 (campaign results strip) reads these back off Resend webhook events;
// the deliverable id is the join key to campaign/schedule attribution (the
// campaign_key column lands with Build 2's events storage — see the agent-launch
// spec's deviation note). Resend tag names/values allow only ASCII letters,
// numbers, underscores, and dashes.
const SAFE = /[^A-Za-z0-9_-]/g;

export function blastTags(
  deliverableId: string,
  template: string,
): { name: string; value: string }[] {
  return [
    { name: "did", value: deliverableId.replace(SAFE, "") },
    { name: "tpl", value: template.replace(SAFE, "") },
  ];
}
