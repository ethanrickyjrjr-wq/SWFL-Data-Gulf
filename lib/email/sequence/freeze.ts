/**
 * lib/email/sequence/freeze.ts — "frozen" is DERIVED, never a column: a
 * deliverable is frozen iff an ACTIVE, ARMED (next_run_at set) once schedule
 * row references it. The lab's save PATCH refuses writes while frozen; unlock
 * (stop the row) thaws it with no flag to drift. Spec 2026-07-05.
 */

/** Structural slice of the Supabase query builder this lookup chains through —
 *  the real PostgrestFilterBuilder satisfies it (same pattern as ScheduleQuery
 *  in schedule-upsert.ts). */
interface FreezeQuery {
  select(cols: string): FreezeQuery;
  eq(col: string, val: string): FreezeQuery;
  not(col: string, op: string, val: null): FreezeQuery;
  limit(n: number): PromiseLike<{
    data: { id: number; next_run_at: string }[] | null;
    error: { message: string } | null;
  }>;
}

export interface FreezeQueryDb {
  from(table: string): FreezeQuery;
}

export async function findFreezingSchedule(
  db: FreezeQueryDb,
  deliverableId: string,
): Promise<{ id: number; next_run_at: string } | null> {
  const { data, error } = await db
    .from("email_schedules")
    .select("id, next_run_at")
    .eq("deliverable_id", deliverableId)
    .eq("cadence", "once")
    .eq("status", "active")
    .not("next_run_at", "is", null)
    .limit(1);
  if (error) throw new Error(`freeze lookup failed: ${error.message}`);
  return data?.[0] ?? null;
}
