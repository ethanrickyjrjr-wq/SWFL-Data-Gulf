/**
 * The ONE validated write path for email_schedules mutations — extracted from
 * app/api/email/schedule-command/route.ts (route files can't export helpers) so
 * BOTH lanes share it: the NL chat lane (propose → nonce → confirm) and the
 * structured form lane (PATCH /api/email/schedules/[id], spec
 * 2026-07-05-account-quick-access). Callers run validateToolInput first —
 * writeAction trusts its ParsedCommand.
 */

import type { Database } from "@/database.types";
import { NextResponse } from "next/server";
import type { createClient } from "@/utils/supabase/server";
import { computeNextRunAt, type Cadence } from "@/lib/email/schedule-cadence";
import type { ParsedCommand } from "@/lib/email/schedule-command";
import { createOrTouchSchedule, type ScheduleUpsertDb } from "@/lib/email/schedule-upsert";

export type Db = ReturnType<typeof createClient>;

export async function writeAction(
  supabase: Db,
  userId: string,
  projectId: string,
  command: ParsedCommand,
): Promise<NextResponse> {
  const now = new Date().toISOString();

  if (command.action === "create") {
    const next = computeNextRunAt({
      cadence: command.cadence!,
      day_of_week: command.day_of_week ?? null,
      day_of_month: command.day_of_month ?? null,
      send_hour_et: command.send_hour_et!,
    });
    const nextIso = next ? next.toISOString() : null;
    // Idempotent create (Task 7, D2): re-issuing the SAME recipe reactivates/updates the
    // existing schedule rather than inserting a duplicate. NULL-equal matching lives in
    // createOrTouchSchedule (IS NOT DISTINCT FROM, never `=` against null). One create
    // path for both the NL `create` and the build→schedule bridge.
    try {
      const { id, created } = await createOrTouchSchedule(supabase as unknown as ScheduleUpsertDb, {
        userId,
        projectId,
        command,
        nowIso: now,
        nextRunAtIso: nextIso,
      });
      return NextResponse.json({
        ok: true,
        action: "create",
        schedule_id: id,
        created,
        next_run_at: nextIso,
      });
    } catch (e) {
      console.error("[schedule-command] create failed:", e);
      return NextResponse.json({ error: "create_failed" }, { status: 500 });
    }
  }

  // All other actions mutate an existing row, scoped to this user's project (RLS
  // also enforces ownership). schedule_id is guaranteed present post-resolve.
  if (command.schedule_id == null) {
    return NextResponse.json({ error: "schedule_id required" }, { status: 422 });
  }

  let patch: Database["public"]["Tables"]["email_schedules"]["Update"];
  switch (command.action) {
    case "pause":
      patch = { status: "paused", updated_at: now };
      break;
    case "resume": {
      // Recompute next_run_at from the row's OWN cadence — a resumed schedule
      // must never fire off a stale next_run_at frozen at pause time.
      const { data: row } = await supabase
        .from("email_schedules")
        .select("cadence, day_of_week, day_of_month, send_hour_et")
        .eq("id", command.schedule_id)
        .eq("project_id", projectId)
        .maybeSingle();
      if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
      const next = computeNextRunAt({
        cadence: row.cadence as Cadence,
        day_of_week: row.day_of_week,
        day_of_month: row.day_of_month,
        send_hour_et: row.send_hour_et,
      });
      patch = { status: "active", next_run_at: next ? next.toISOString() : null, updated_at: now };
      break;
    }
    case "stop":
      patch = { status: "stopped", next_run_at: null, updated_at: now };
      break;
    case "change-template":
      patch = { template_id: command.template_id, updated_at: now };
      break;
    case "change-audience":
      patch = { audience_slug: command.audience_slug, updated_at: now };
      break;
    case "change-cadence": {
      const next = computeNextRunAt({
        cadence: command.cadence!,
        day_of_week: command.day_of_week ?? null,
        day_of_month: command.day_of_month ?? null,
        send_hour_et: command.send_hour_et!,
      });
      patch = {
        cadence: command.cadence,
        day_of_week: command.day_of_week ?? null,
        day_of_month: command.day_of_month ?? null,
        send_hour_et: command.send_hour_et,
        next_run_at: next ? next.toISOString() : null,
        updated_at: now,
      };
      break;
    }
    default:
      return NextResponse.json({ error: "unsupported_action" }, { status: 422 });
  }

  const { error } = await supabase
    .from("email_schedules")
    .update(patch)
    .eq("id", command.schedule_id)
    .eq("project_id", projectId);
  if (error) {
    console.error(`[schedule-command] ${command.action} failed:`, error);
    return NextResponse.json({ error: `${command.action}_failed` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, action: command.action, schedule_id: command.schedule_id });
}

/** Map a structured PATCH body onto ParsedCommand candidates. UNVALIDATED —
 *  the caller runs each through validateToolInput (defense-in-depth). */
export function patchBodyToCommands(
  scheduleId: number,
  body: unknown,
): { ok: true; commands: ParsedCommand[] } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid body" };
  }
  const b = body as Record<string, unknown>;
  if (b.op === "pause" || b.op === "resume" || b.op === "stop") {
    return { ok: true, commands: [{ action: b.op, schedule_id: scheduleId } as ParsedCommand] };
  }
  if (b.op !== "edit") return { ok: false, error: "op must be pause | resume | stop | edit" };
  const commands: ParsedCommand[] = [];
  if (
    b.cadence != null ||
    b.send_hour_et != null ||
    b.day_of_week != null ||
    b.day_of_month != null
  ) {
    commands.push({
      action: "change-cadence",
      schedule_id: scheduleId,
      cadence: b.cadence as Cadence | undefined,
      day_of_week: b.day_of_week as number | undefined,
      day_of_month: b.day_of_month as number | undefined,
      send_hour_et: b.send_hour_et as number | undefined,
    } as ParsedCommand);
  }
  if (typeof b.audience_slug === "string" && b.audience_slug) {
    commands.push({
      action: "change-audience",
      schedule_id: scheduleId,
      audience_slug: b.audience_slug,
    });
  }
  if (typeof b.template_id === "string" && b.template_id) {
    commands.push({
      action: "change-template",
      schedule_id: scheduleId,
      template_id: b.template_id,
    });
  }
  if (!commands.length) return { ok: false, error: "no changes" };
  return { ok: true, commands };
}
