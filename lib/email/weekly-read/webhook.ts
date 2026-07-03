// lib/email/weekly-read/webhook.ts
//
// Pure mapping of an inbound Resend outbound-event payload tagged `wid` → the
// weekly_read_subscribers status flip. Mirrors the SHAPE of outreach's
// extractOutreachAction without importing outreach types. Only suppression events
// act in v1 (bounce/complaint); opens/clicks are not tracked for this list.
// NOTE: Resend delivers tags as a plain object {"key":"value"} in webhook payloads.

import { onEvent, type WeeklyReadStatus } from "./cadence";

export interface WeeklyReadWebhookAction {
  /** weekly_read_subscribers.id, from the `wid` tag set at send time. */
  wid: string;
  suppressTo: WeeklyReadStatus;
}

export function extractWeeklyReadAction(payload: {
  type?: string;
  data?: { tags?: Record<string, string> };
}): WeeklyReadWebhookAction | null {
  const wid = payload.data?.tags?.["wid"];
  if (!wid) return null;
  const event =
    payload.type === "email.bounced"
      ? ("bounced" as const)
      : payload.type === "email.complained"
        ? ("complained" as const)
        : null;
  if (!event) return null;
  const suppressTo = onEvent("active", event);
  return suppressTo ? { wid, suppressTo } : null;
}
