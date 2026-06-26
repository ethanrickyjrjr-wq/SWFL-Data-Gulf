import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

/**
 * GET /api/email/send-status
 *
 * Returns the send affordance state for a deliverable:
 *   - audiences: the user's email_audiences rows (slug + contact_count)
 *   - schedule:  the active/paused recurring schedule for this deliverable's
 *                recipe (template_id="report", scope_kind, scope_value), if any
 *
 * Used by SendWeeklyHandle on /p/[id] and /project deliverable cards to
 * decide what to show: audience chips, existing schedule status, or neither.
 *
 * Auth: cookie/RLS — 401 if not signed in. Audiences and schedules are already
 * RLS-scoped to auth.uid(), so service-role is never needed here.
 *
 * Query params:
 *   projectId    (required) — the project the deliverable belongs to
 *   deliverableId (optional) — when present, also checks for a block-canvas schedule
 *                              tied to this specific deliverable (N6 EmailDoc lane)
 *   scopeKind    (optional) — scope_kind on the deliverable row ("zip" etc.)
 *   scopeValue   (optional) — scope_value on the deliverable row (the ZIP etc.)
 */

const SCHEDULE_COLS = "id,status,cadence,day_of_week,day_of_month,send_hour_et,audience_slug";

export async function GET(req: NextRequest) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }
  const deliverableId = searchParams.get("deliverableId") ?? null;
  const scopeKind = searchParams.get("scopeKind") ?? null;
  const scopeValue = searchParams.get("scopeValue") ?? null;

  // Audiences — all of this user's (RLS-scoped), ordered by slug for stable chip order.
  const { data: audienceRows } = await supabase
    .from("email_audiences")
    .select("audience_slug, contact_count")
    .order("audience_slug");

  const audiences = (audienceRows ?? []).map((r) => ({
    slug: r.audience_slug as string,
    contact_count: (r.contact_count as number) ?? 0,
  }));

  // Schedule — two lanes:
  //   block-canvas: matched by deliverable_id (N6 EmailDoc schedules); checked first.
  //   report:       matched by template_id="report" + scope (legacy; existing behavior).
  // Stopped schedules excluded — they're terminal.
  let schedule = null;

  // Lane 1 — block-canvas (only when caller provides deliverableId).
  if (deliverableId) {
    const { data: bcRow } = await supabase
      .from("email_schedules")
      .select(SCHEDULE_COLS)
      .eq("project_id", projectId)
      .eq("template_id", "block-canvas")
      .eq("deliverable_id", deliverableId)
      .in("status", ["active", "paused"])
      .limit(1)
      .maybeSingle();
    if (bcRow) {
      schedule = {
        id: bcRow.id as number,
        status: bcRow.status as string,
        cadence: bcRow.cadence as string,
        day_of_week: (bcRow.day_of_week as number | null) ?? null,
        day_of_month: (bcRow.day_of_month as number | null) ?? null,
        send_hour_et: bcRow.send_hour_et as number,
        audience_slug: (bcRow.audience_slug as string | null) ?? null,
      };
    }
  }

  // Lane 2 — report schedule (skip if block-canvas already matched).
  const scheduleQuery = supabase
    .from("email_schedules")
    .select(SCHEDULE_COLS)
    .eq("project_id", projectId)
    .eq("template_id", "report")
    .in("status", ["active", "paused"]);

  // Apply NULL-aware scope filters.
  if (scopeKind === null) {
    scheduleQuery.is("scope_kind", null);
  } else {
    scheduleQuery.eq("scope_kind", scopeKind);
  }
  if (scopeValue === null) {
    scheduleQuery.is("scope_value", null);
  } else {
    scheduleQuery.eq("scope_value", scopeValue);
  }

  const { data: scheduleRows } = schedule
    ? { data: null }
    : await scheduleQuery.limit(1).maybeSingle();
  if (scheduleRows) {
    schedule = {
      id: scheduleRows.id as number,
      status: scheduleRows.status as string,
      cadence: scheduleRows.cadence as string,
      day_of_week: (scheduleRows.day_of_week as number | null) ?? null,
      day_of_month: (scheduleRows.day_of_month as number | null) ?? null,
      send_hour_et: scheduleRows.send_hour_et as number,
      audience_slug: (scheduleRows.audience_slug as string | null) ?? null,
    };
  }

  return NextResponse.json({ audiences, schedule });
}
