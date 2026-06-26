/**
 * lib/email/schedule-upsert.ts — idempotent schedule creation (Task 7, D2).
 *
 * `createOrTouchSchedule` is the ONE create path for `email_schedules`, used by both the
 * NL `create` action and the build→schedule bridge. Re-issuing an identical recipe
 * UPDATES/reactivates the existing row instead of inserting a duplicate.
 *
 * Idempotence key = the nine-column recipe signature (`schedule-signature.ts`), scoped
 * to (user_id, project_id). Matching uses `IS NOT DISTINCT FROM` semantics for every
 * nullable column — expressed per-column as `.is(col, null)` for a null target and
 * `.eq(col, value)` otherwise (operator-locked: a plain `.eq` against null hits the
 * Postgres NULL-distinct trap and silently duplicates the scoped recipes this feature
 * creates). A match in ANY status (active / paused / stopped) is REACTIVATED in place
 * (set active + re-armed), exactly like un-pausing — safe because the row stores only a
 * recipe, never data, so the next run re-fetches current numbers regardless. One entry
 * per recipe; we never spawn a duplicate alongside a stopped/paused twin.
 *
 * Time is injected (`nowIso` / `nextRunAtIso`) so this is deterministic + DB-only —
 * unit-tested against a fake builder with no clock and no network.
 */

import type { ParsedCommand } from "./schedule-command";
import { recipeSignature, signatureFilters } from "./schedule-signature";

type DbResult<T> = { data: T; error: { message: string } | null };

/** The narrow slice of the Supabase query builder this module uses. The real
 *  PostgrestFilterBuilder satisfies it structurally (it is itself a PromiseLike). */
export interface ScheduleQuery extends PromiseLike<DbResult<unknown>> {
  select(cols: string): ScheduleQuery;
  eq(col: string, val: string | number): ScheduleQuery;
  neq(col: string, val: string | number): ScheduleQuery;
  is(col: string, val: null): ScheduleQuery;
  update(patch: Record<string, unknown>): ScheduleQuery;
  insert(obj: Record<string, unknown>): ScheduleQuery;
  maybeSingle(): Promise<DbResult<{ id: number } | null>>;
  single(): Promise<DbResult<{ id: number } | null>>;
}

export interface ScheduleUpsertDb {
  from(table: string): ScheduleQuery;
}

export interface CreateOrTouchInput {
  userId: string;
  projectId: string;
  command: ParsedCommand;
  nowIso: string;
  nextRunAtIso: string | null;
}

export interface CreateOrTouchResult {
  id: number;
  created: boolean;
}

const TABLE = "email_schedules";

export async function createOrTouchSchedule(
  db: ScheduleUpsertDb,
  input: CreateOrTouchInput,
): Promise<CreateOrTouchResult> {
  const { userId, projectId, command, nowIso, nextRunAtIso } = input;

  // ── Find an existing schedule with the SAME recipe, ANY status (NULL-equal). ──
  let find = db.from(TABLE).select("id").eq("user_id", userId).eq("project_id", projectId);
  for (const f of signatureFilters(recipeSignature(command))) {
    find = f.op === "is" ? find.is(f.col, null) : find.eq(f.col, f.value);
  }
  const existing = await find.maybeSingle();
  if (existing.error) throw new Error(`schedule lookup failed: ${existing.error.message}`);

  // ── Match (active / paused / stopped) → reactivate + re-arm + touch (no duplicate). ──
  if (existing.data) {
    const upd = await db
      .from(TABLE)
      .update({ status: "active", next_run_at: nextRunAtIso, updated_at: nowIso })
      .eq("id", existing.data.id);
    if (upd.error) throw new Error(`schedule reactivate failed: ${upd.error.message}`);
    return { id: existing.data.id, created: false };
  }

  // ── No match → insert (identical field set to the legacy create path). ──
  const ins = await db
    .from(TABLE)
    .insert({
      user_id: userId,
      project_id: projectId,
      status: "active",
      cadence: command.cadence,
      day_of_week: command.day_of_week ?? null,
      day_of_month: command.day_of_month ?? null,
      send_hour_et: command.send_hour_et,
      audience_slug: command.audience_slug ?? null,
      template_id: command.template_id ?? null,
      scope_kind: command.scope_kind ?? null,
      scope_value: command.scope_value ?? null,
      topic: command.topic ?? null,
      deliverable_id: command.deliverable_id ?? null,
      next_run_at: nextRunAtIso,
      updated_at: nowIso,
    })
    .select("id")
    .single();
  if (ins.error || !ins.data) {
    throw new Error(`schedule create failed: ${ins.error?.message ?? "no id returned"}`);
  }
  return { id: ins.data.id, created: true };
}
