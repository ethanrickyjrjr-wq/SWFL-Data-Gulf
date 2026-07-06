// app/api/projects/[id]/sequence/nudges/route.ts
//
// Dismiss endpoint for lifecycle_nudges (spec
// 2026-07-06-platform-arc-auto-advance-nudges-design.md). PATCH {nudge_id} sets dismissed_at —
// the ONLY mutation the UI makes on this table; nothing here touches step state. RLS
// (auth.uid() = user_id) is the ownership check.

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createClient(await cookies());
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const nudgeId = typeof body?.nudge_id === "string" ? body.nudge_id : "";
  if (!nudgeId) return NextResponse.json({ error: "nudge_id required" }, { status: 422 });

  const { data, error } = await db
    .from("lifecycle_nudges")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", nudgeId)
    .eq("project_id", id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
