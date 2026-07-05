import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { validateToolInput } from "@/lib/email/schedule-command";
import { patchBodyToCommands, writeAction } from "@/lib/email/schedule-write";

export const runtime = "nodejs";

/**
 * PATCH /api/email/schedules/[id] — structured (form-driven) schedule mutation.
 * Reuses the SAME validated write core as the NL schedule-command lane, minus
 * the model parse and the proposal nonce: a direct form submit IS the user's
 * confirmation. Ownership: the row must belong to the signed-in user (explicit
 * eq + RLS). change-cadence merges missing day/hour fields from the row so a
 * partial edit (e.g. hour only) stays valid.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: row } = await supabase
    .from("email_schedules")
    .select("id, project_id, cadence, day_of_week, day_of_month, send_hour_et")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!row || !row.project_id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const mapped = patchBodyToCommands(id, body);
  if (!mapped.ok) return NextResponse.json({ error: mapped.error }, { status: 422 });

  for (const candidate of mapped.commands) {
    // Partial cadence edits inherit the row's current values (same merge the NL
    // lane does from EXISTING SCHEDULES) so validateToolInput sees a full set.
    const merged =
      candidate.action === "change-cadence"
        ? {
            ...candidate,
            cadence: candidate.cadence ?? (row.cadence as typeof candidate.cadence),
            day_of_week: candidate.day_of_week ?? row.day_of_week ?? undefined,
            day_of_month: candidate.day_of_month ?? row.day_of_month ?? undefined,
            send_hour_et: candidate.send_hour_et ?? row.send_hour_et ?? undefined,
          }
        : candidate;
    const v = validateToolInput(merged);
    if (!v.ok) return NextResponse.json({ error: "invalid", details: v.errors }, { status: 422 });
    const res = await writeAction(supabase, user.id, row.project_id, v.command);
    if (res.status !== 200) return res;
  }
  return NextResponse.json({ ok: true });
}
