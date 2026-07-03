// lib/email/weekly-read/cadence.ts
//
// Weekly-read cadence — pure, no I/O. Deliberately smaller than the outreach demo
// cadence (no touch sequence, no trial funnel): send weekly, forever, until they
// leave. jitterDays is COPIED from demo-cadence.ts — a pure technique — not imported,
// so weekly-read never couples to outreach's types (spec isolation rule).

export type WeeklyReadStatus = "active" | "unsubscribed" | "bounced";

export interface WeeklyReadCursor {
  status: WeeklyReadStatus;
  next_send_at: string | null;
}

/** Deterministic per-subscriber jitter — spreads a growing list across the 6–8 day
 *  window so one weekly instant never carries the whole list into Resend's rate limit. */
export function jitterDays(subscriberId: string, min: number, max: number): number {
  let h = 0;
  for (const c of subscriberId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return min + (h % (max - min + 1));
}

/** Due = active AND (never sent, or the scheduled instant has passed). */
export function shouldSend(cur: WeeklyReadCursor, now: Date): boolean {
  if (cur.status !== "active") return false;
  if (cur.next_send_at === null) return true;
  return new Date(cur.next_send_at).getTime() <= now.getTime();
}

/** After a successful send: next issue 6–8 days out, jittered per subscriber. */
export function afterSend(subscriberId: string, now: Date): { next_send_at: string } {
  const days = jitterDays(subscriberId, 6, 8);
  return { next_send_at: new Date(now.getTime() + days * 86_400_000).toISOString() };
}

/** Suppression event → terminal status. null = already terminal, leave untouched. */
export function onEvent(
  status: WeeklyReadStatus,
  event: "bounced" | "unsubscribed" | "complained",
): WeeklyReadStatus | null {
  if (status !== "active") return null;
  return event === "bounced" ? "bounced" : "unsubscribed";
}
