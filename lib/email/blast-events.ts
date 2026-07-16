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
//
// This module started as two concurrent builds — a deliverability-diagnostics
// panel (per-tenant bounce/complaint tracking, needs `user_id`) and this
// split-test plan (per-cohort results, needs `variant`) — that independently
// built the same did-tag plumbing. Merged: BlastWebhookAction carries both.

import { mapResendOutbound } from "./outreach/lifecycle";

export interface BlastWebhookAction {
  /** deliverables.id, from the `did` tag blastTags() sets at send time. */
  did: string;
  /** Resend's message id, for idempotent event dedupe. */
  emailId: string | null;
  event: "sent" | "delivered" | "opened" | "clicked" | "bounced" | "unsubscribed" | "complained";
  /** The variant cohort index (0-based, as a string) from a split-test send's `variant` tag. */
  variant?: string;
  /** contacts.id from the send's `cid` tag — per-recipient engagement linkage
   *  (blast-stagger). Absent on sends made before the tag shipped. */
  contactId?: string;
}

/** The slice of a Resend webhook payload we read (outbound email.* events). */
export interface ResendWebhookPayload {
  type?: string;
  data?: { email_id?: string; broadcast_id?: string; tags?: Record<string, string> };
}

/**
 * Decide what an inbound Resend webhook means for blast-send tracking. Returns
 * null when the event isn't a tracked outbound type OR carries no `did` tag
 * (i.e. it's an outreach `rid` or weekly-read `wid` send, or untagged/inbound).
 * Pure.
 */
/** Broadcast events → the email_events vocabulary. Only the CHECK-constraint
 *  events are recorded (migrations/20260628_email_events.sql); `complained`
 *  maps to `unsubscribed` (the constraint has no complained value), everything
 *  else (delivery_delayed, received, …) is dropped. */
const BROADCAST_EVENT_MAP: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "unsubscribed",
};

/**
 * A SCHEDULED-broadcast engagement event (hub mission-control Task 12): Resend
 * emits per-recipient email.* events for Broadcast sends carrying
 * `data.broadcast_id` and NO did/rid/wid tag (those route to their own
 * branches). The webhook resolves broadcast_id → email_sends.schedule_id →
 * email_schedules.deliverable_id so scheduled campaigns accrue the same
 * stored, deduped rows manual blasts already get. Pure.
 */
export function extractBroadcastEvent(payload: ResendWebhookPayload): {
  broadcastId: string;
  emailId: string;
  event: string;
} | null {
  const event = BROADCAST_EVENT_MAP[payload.type ?? ""];
  const data = payload.data;
  if (!event || !data?.email_id || !data?.broadcast_id) return null;
  const tags = data.tags ?? {};
  if (tags["did"] || tags["rid"] || tags["wid"]) return null;
  return { broadcastId: data.broadcast_id, emailId: data.email_id, event };
}

export function extractBlastAction(payload: ResendWebhookPayload): BlastWebhookAction | null {
  const did = payload.data?.tags?.["did"];
  if (!did) return null;
  const { event } = mapResendOutbound(payload.type ?? "");
  if (!event) return null;
  const variant = payload.data?.tags?.["variant"];
  const contactId = payload.data?.tags?.["cid"];
  return {
    did,
    emailId: payload.data?.email_id ?? null,
    event,
    ...(variant ? { variant } : {}),
    ...(contactId ? { contactId } : {}),
  };
}
