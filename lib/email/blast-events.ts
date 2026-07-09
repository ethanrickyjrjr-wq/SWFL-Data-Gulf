// lib/email/blast-events.ts
//
// Pure mapping of an inbound Resend outbound-event payload tagged `did` (a
// deliverable blast send — app/api/deliverables/[id]/blast/route.ts, tags set
// by lib/email/blast-tags.ts) to the email_events row the webhook should
// upsert. Mirrors the SHAPE of outreach's extractOutreachAction / weekly-
// read's extractWeeklyReadAction, but a blast recipient has no drip/
// suppression ledger — this only extracts what to log, never a status flip.
// Reuses mapResendOutbound's event vocabulary (same Resend account, same
// webhook types) without pulling in its suppressTo (outreach-only concept).

import { mapResendOutbound } from "./outreach/lifecycle";

export interface BlastWebhookAction {
  /** deliverables.id, from the `did` tag blastTags() sets at send time. */
  did: string;
  /** Resend's message id, for idempotent event dedupe. */
  emailId: string | null;
  event: "sent" | "delivered" | "opened" | "clicked" | "bounced" | "unsubscribed" | "complained";
}

/** The slice of a Resend webhook payload we read (outbound email.* events). */
export interface ResendWebhookPayload {
  type?: string;
  data?: { email_id?: string; tags?: Record<string, string> };
}

/**
 * Decide what an inbound Resend webhook means for blast-send tracking. Returns
 * null when the event isn't a tracked outbound type OR carries no `did` tag
 * (i.e. it's an outreach `rid` or weekly-read `wid` send, or untagged/inbound).
 * Pure.
 */
export function extractBlastAction(payload: ResendWebhookPayload): BlastWebhookAction | null {
  const did = payload.data?.tags?.["did"];
  if (!did) return null;
  const { event } = mapResendOutbound(payload.type ?? "");
  if (!event) return null;
  return { did, emailId: payload.data?.email_id ?? null, event };
}
