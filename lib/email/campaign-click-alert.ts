// lib/email/campaign-click-alert.ts
//
// Pure decision core for click-triggered listing-campaign alerts (spec
// 2026-07-15-campaign-click-alerts-design.md). A milestone email goes out as a Resend
// Broadcast (no did/rid/wid tag to key off — see lib/email/blast-events.ts's tag pattern for
// contrast), so this extractor keys off `data.broadcast_id` instead, which Resend includes on
// every email.clicked event for a broadcast send regardless of tags (verified live against
// resend.com/docs/webhooks/emails/clicked, 07/15/2026). No I/O — the route resolves
// broadcast_id -> project/contact via email_sends + email_contacts and does the send.

export interface CampaignClickPayload {
  type?: string;
  data?: {
    broadcast_id?: string;
    to?: string[];
    click?: { link?: string };
  };
}

export interface CampaignClick {
  broadcastId: string;
  /** The recipient address that clicked, lowercased for lookup consistency. */
  email: string;
  /** The exact URL clicked — recorded now, filtered on later (per-button intent tiers are a
   *  fast-follow, not v1; see spec "Out of scope"). */
  link: string | null;
}

/** Returns null when the event isn't an email.clicked, or carries no broadcast_id (not a
 *  broadcast send), or no recipient address (nothing to alert about). Pure. */
export function extractCampaignClick(payload: CampaignClickPayload): CampaignClick | null {
  if (payload.type !== "email.clicked") return null;
  const broadcastId = payload.data?.broadcast_id;
  const email = payload.data?.to?.[0];
  if (!broadcastId || !email) return null;
  return {
    broadcastId,
    email: email.trim().toLowerCase(),
    link: payload.data?.click?.link ?? null,
  };
}

export interface ClickAlertInput {
  contactEmail: string;
  contactName: string | null;
  /** Human label for the campaign the click happened in, e.g. "326 Shore Dr". */
  projectTitle: string;
  link: string | null;
}

export interface ClickAlertContent {
  subject: string;
  text: string;
}

function who(input: ClickAlertInput): string {
  return input.contactName?.trim() || input.contactEmail;
}

/** Build the click-alert email — same private "your contact just showed interest" ping as the
 *  reply sensor (lib/email/agent-alert.ts), second trigger. Pure content builder; the route owns
 *  the recipient lookup + actual send. */
export function buildClickAlertContent(input: ClickAlertInput): ClickAlertContent {
  const name = who(input);
  const subject = `${name} clicked into your ${input.projectTitle} campaign`;

  const lines: string[] = [];
  lines.push(`${name} clicked a link in your ${input.projectTitle} campaign email.`);
  lines.push("");
  lines.push("That's real interest — worth a personal follow-up while it's fresh.");
  if (input.link) {
    lines.push("");
    lines.push(`What they clicked: ${input.link}`);
  }
  lines.push("");
  lines.push(`Reach out to ${input.contactEmail} to take it from here.`);

  return { subject, text: lines.join("\n") };
}
