// lib/email/blast-events.ts
//
// Pure mapping of an inbound Resend outbound-event payload tagged `did` (a
// deliverable blast send — app/api/deliverables/[id]/blast/route.ts, tags set
// by lib/email/blast-tags.ts) to the email_events row the webhook should
// upsert. Mirrors the SHAPE of outreach's extractOutreachAction / weekly-
// read's extractWeeklyReadAction, but a blast recipient has no drip/
// suppression ledger — this only extracts what to log, never a status flip.
//
// NOTE: this module's `did`-tag webhook plumbing was expected to already
// exist courtesy of a separate, concurrent deliverability-diagnostics-panel
// build (see docs/superpowers/plans/2026-07-09-subject-cta-ai-variants.md,
// "Prerequisite" section). It was absent from this worktree (fresh `main`
// checkout — that other session's uncommitted work never landed here), so
// this file, the webhook branch in app/api/webhooks/resend/route.ts, and the
// `did` column were all built fresh by Task 1, scoped to only what THIS
// plan's later tasks (variant split-test results) actually read. `user_id`
// on email_events — needed only by that other, unrelated feature — was
// deliberately NOT added here; that stays that session's own migration.

import { mapResendOutbound } from "./outreach/lifecycle";

export interface BlastWebhookAction {
  did: string;
  emailId: string | null;
  event: "sent" | "delivered" | "opened" | "clicked" | "bounced" | "unsubscribed" | "complained";
  /** The variant cohort index (0-based, as a string) from a split-test send's `variant` tag. */
  variant?: string;
}

export interface ResendWebhookPayload {
  type?: string;
  data?: { email_id?: string; tags?: Record<string, string> };
}

export function extractBlastAction(payload: ResendWebhookPayload): BlastWebhookAction | null {
  const did = payload.data?.tags?.["did"];
  if (!did) return null;
  const { event } = mapResendOutbound(payload.type ?? "");
  if (!event) return null;
  const variant = payload.data?.tags?.["variant"];
  return {
    did,
    emailId: payload.data?.email_id ?? null,
    event,
    ...(variant ? { variant } : {}),
  };
}
