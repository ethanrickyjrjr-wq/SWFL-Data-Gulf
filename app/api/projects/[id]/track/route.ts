// app/api/projects/[id]/track/route.ts
//
// Cockpit instrumentation — the verdict metrics ride the EXISTING event
// capture (usage_events via lib/highlighter/meter), no new table. Whitelisted
// event names only; counts travel in the reach tags (the column is a text[]).
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { recordUse } from "@/lib/highlighter/meter";

export const runtime = "nodejs";

const EVENTS = new Set(["week_schedule_all"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const db = createClient(await cookies());
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: project } = await db.from("projects").select("id").eq("id", id).maybeSingle();
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as {
    event?: string;
    approved?: number;
    skipped?: number;
  } | null;
  if (!body?.event || !EVENTS.has(body.event)) {
    return NextResponse.json({ error: "unknown event" }, { status: 400 });
  }

  await recordUse(
    req,
    {
      report_id: "",
      reach: [
        `project:${id}`,
        `approved:${Number.isFinite(body.approved) ? body.approved : 0}`,
        `skipped:${Number.isFinite(body.skipped) ? body.skipped : 0}`,
      ],
      action: body.event,
    },
    user.id,
  );
  return NextResponse.json({ ok: true });
}
