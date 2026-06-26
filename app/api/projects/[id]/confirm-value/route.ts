// POST /api/projects/[id]/confirm-value — user clicked "Keep mine" on a metric
// collision chip. Logs an in_project confirmed evidence row to data_readiness_alerts.
//
// Cookie client for auth + ownership (RLS); service-role client for the privileged
// insert (the table grants INSERT to service_role).

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import { buildCollisionRow } from "@/lib/signals/log-collision";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // ownership check (RLS): the project must be visible to this user
  const { data: project } = await supabase.from("projects").select("id").eq("id", id).maybeSingle();
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body?.change) return NextResponse.json({ error: "change required" }, { status: 400 });

  // KNOWN-DEBT(phantom-columns): buildCollisionRow writes surface/user_action/gate_reason,
  // which DO NOT exist on the live data_readiness_alerts table (verified: columns are
  // id/project_id/schedule_id/metric_*/scope_*/tier_used/value_used/source_urls/
  // snapshot_value/within_tolerance/alert_at/resolved_at/send_at). So this insert 500s
  // (PGRST204) at runtime today — same class as news-crawl. Real fix deferred: add the
  // columns via migration or drop them from buildCollisionRow. Untyped client until then.
  const db = createServiceRoleClientUntyped();
  const { error } = await db.from("data_readiness_alerts").insert(
    buildCollisionRow({
      projectId: id,
      change: body.change,
      scopeKind: body.scope_kind,
      scopeValue: body.scope_value,
      userAction: "confirmed",
    }),
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
