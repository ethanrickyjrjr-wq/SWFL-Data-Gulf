// lib/email/outreach/demo-cadence.ts
//
// Funnel-demo cadence state machine — pure, no I/O. Two-axis model: the existing
// `status` (lifecycle.ts) stays authoritative for CAN-send (suppression); `stage`
// (this module) says WHERE in the demo sequence a recipient is. The runner + webhook
// apply these decisions against outreach_recipients; this module just decides.
// Spec: docs/superpowers/specs/2026-07-02-funnel-demo-email-design.md §5.

export type DemoStage =
  | "cold_t1"
  | "cold_t2"
  | "cold_t3"
  | "cold_t4"
  | "trial_active"
  | "cooldown"
  | "reengaged"
  | "retired"
  | "converted";

export type DemoTouch = "t1" | "t2" | "t3" | "t4" | "trial" | "reengage";

export const TRIAL_CAP = 30;
export const COOLDOWN_DAYS = 30;
/** Daily-trial send hour. 13:00 UTC ≈ 9 AM Eastern (EDT); acceptable DST drift to 8 AM. */
export const TRIAL_SEND_HOUR_UTC = 13;
/** A reengaged recipient quiet this long is retired permanently (spec: no second cycle). */
export const REENGAGE_QUIET_DAYS = 30;

export interface DemoCursor {
  stage: DemoStage;
  next_send_at: string | null;
  trial_sends: number;
}

/** Which email a DUE recipient at this stage receives. null = this stage never sends. */
export function touchForStage(stage: DemoStage): DemoTouch | null {
  switch (stage) {
    case "cold_t1":
      return "t1";
    case "cold_t2":
      return "t2";
    case "cold_t3":
      return "t3";
    case "cold_t4":
      return "t4";
    case "trial_active":
      return "trial";
    case "cooldown":
      return "reengage"; // due = the 30-day park expired
    default:
      return null; // reengaged | retired | converted
  }
}

/** Deterministic per-recipient jitter — varied spacing reads human; identical intervals read robotic. */
export function jitterDays(recipientId: string, min: number, max: number): number {
  let h = 0;
  for (const c of recipientId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return min + (h % (max - min + 1));
}

function daysFromNow(now: Date, days: number): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

/** Next TRIAL_SEND_HOUR_UTC strictly after `now`. */
export function nextTrialSendAt(now: Date): string {
  const next = new Date(now);
  next.setUTCHours(TRIAL_SEND_HOUR_UTC, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

/**
 * Advance the cursor after a successful send at the current stage.
 * Windows (cumulative from T1): T2 = +3–4d, T3 = day 9–11, T4 = day 18–21.
 */
export function afterSend(cur: DemoCursor, recipientId: string, now: Date): DemoCursor {
  switch (cur.stage) {
    case "cold_t1":
      return {
        stage: "cold_t2",
        next_send_at: daysFromNow(now, jitterDays(recipientId, 3, 4)),
        trial_sends: 0,
      };
    case "cold_t2":
      return {
        stage: "cold_t3",
        next_send_at: daysFromNow(now, jitterDays(recipientId, 6, 7)),
        trial_sends: 0,
      };
    case "cold_t3":
      return {
        stage: "cold_t4",
        next_send_at: daysFromNow(now, jitterDays(recipientId, 9, 10)),
        trial_sends: 0,
      };
    case "cold_t4":
      return { stage: "cooldown", next_send_at: daysFromNow(now, COOLDOWN_DAYS), trial_sends: 0 };
    case "cooldown":
      // The single re-engagement email just went out. Terminal unless it earns a click.
      return { stage: "reengaged", next_send_at: null, trial_sends: 0 };
    case "trial_active": {
      const sends = cur.trial_sends + 1;
      return sends >= TRIAL_CAP
        ? { stage: "retired", next_send_at: null, trial_sends: sends }
        : { stage: "trial_active", next_send_at: nextTrialSendAt(now), trial_sends: sends };
    }
    default:
      return cur; // terminal stages never send
  }
}

/** Apply an engagement/suppression event to the stage. null = no stage change. */
export function onDemoEvent(
  stage: DemoStage,
  event: "clicked" | "bounced" | "unsubscribed" | "complained" | "claimed",
  now: Date,
): { stage: DemoStage; next_send_at: string | null } | null {
  if (event === "claimed") {
    return stage === "converted" ? null : { stage: "converted", next_send_at: null };
  }
  if (event === "bounced" || event === "unsubscribed" || event === "complained") {
    return stage === "retired" ? null : { stage: "retired", next_send_at: null };
  }
  // clicked → daily trial is EARNED by engagement, never sent cold.
  if (stage === "trial_active" || stage === "converted" || stage === "retired") return null;
  return { stage: "trial_active", next_send_at: nextTrialSendAt(now) };
}

/** Spec: reengaged + still nothing → retire the address permanently. */
export function retireIfStale(stage: DemoStage, lastActivityIso: string, now: Date): boolean {
  if (stage !== "reengaged") return false;
  return now.getTime() - new Date(lastActivityIso).getTime() > REENGAGE_QUIET_DAYS * 86_400_000;
}
