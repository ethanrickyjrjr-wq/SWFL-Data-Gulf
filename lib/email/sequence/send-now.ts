/**
 * lib/email/sequence/send-now.ts — the in-request half of "Send now": claim ONE
 * armed row atomically, run it through the SAME processSchedule core the cron
 * uses (identical gates, identical idempotency). Losing the claim is SUCCESS —
 * a concurrent cron tick owns the send ("queued"). A crash after the claim is
 * healed by the runner's once-aware reaper; the date-free once claim key makes
 * the heal at-most-once. The cron is the safety net, never the trigger.
 */
import type { ScheduleOutcome, ScheduleRow } from "@/lib/email/scheduler";

export interface SendNowDeps {
  /** Atomic single-row park: UPDATE … SET next_run_at=NULL, last_run_at=nowIso
   *  WHERE id=? AND status='active' AND next_run_at IS NOT NULL RETURNING *. */
  claimRow: (scheduleId: number, nowIso: string) => Promise<ScheduleRow | null>;
  /** processSchedule with real once-lane deps (built in the route). */
  process: (row: ScheduleRow, fromUtc: Date) => Promise<ScheduleOutcome>;
  log?: (line: string) => void;
}

export type SendNowResult = ScheduleOutcome | { kind: "queued"; scheduleId: number };

export async function sendOnceNow(
  scheduleId: number,
  deps: SendNowDeps,
  now: Date,
): Promise<SendNowResult> {
  const log = deps.log ?? (() => {});
  const row = await deps.claimRow(scheduleId, now.toISOString());
  if (!row) {
    log(`[sequence] send-now schedule=${scheduleId} — claim lost to a cron tick; queued.`);
    return { kind: "queued", scheduleId };
  }
  return deps.process(row, now);
}
