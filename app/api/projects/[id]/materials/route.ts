import type { Database } from "@/database.types";
// app/api/projects/[id]/materials/route.ts
//
// Materials API for the project Marketing Hub (v2, Task 2).
//   POST  — save a NEW block-canvas email as a `deliverables` row.
//   PATCH — manual Save IN PLACE on an existing block-canvas row (no new version;
//           the data-refresh *fork* is Task 3).
//
// `deliverables` has public SELECT (USING true) and NO owner INSERT/UPDATE policy
// (docs/sql/20260613_deliverables.sql:37,40-41). So selecting a deliverable row
// proves NOTHING about ownership — ownership is proven on the `projects` table
// (which IS owner-RLS'd) via the cookie client, then the write goes through the
// service-role client. Mirrors app/api/projects/[id]/build/route.ts:18-20,65.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { EmailDocSchema } from "@/lib/email/doc/schema";

const EMPTY_NARRATIVE = { exec_summary: "", sections: [], inference_notes: [] };

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

  // Ownership: projects has owner RLS, so this select only succeeds for the owner.
  const { data: project } = await db.from("projects").select("id").eq("id", id).single();
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = EmailDocSchema.safeParse(body?.doc);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid doc", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const newId = crypto.randomUUID();
  // The AI build prompt is stored in `instruction` so a SCHEDULED re-render reproduces
  // this email — chart included — with fresh data (run-schedules.mts reads it). Optional.
  const aiPrompt =
    typeof body?.ai_prompt === "string" && body.ai_prompt.trim() ? body.ai_prompt.trim() : null;
  const admin = createServiceRoleClient(); // deliverables has no owner INSERT policy — write via service-role
  const { error } = await admin.from("deliverables").insert({
    id: newId,
    project_id: id,
    user_id: user.id,
    template: "block-canvas",
    doc: parsed.data,
    instruction: aiPrompt,
    data_as_of: body?.data_as_of ?? new Date().toISOString(),
    narrative: EMPTY_NARRATIVE,
    items_snapshot: [],
    status: "ready",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: newId }, { status: 201 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const db = createClient(await cookies());
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.deliverable_id)
    return NextResponse.json({ error: "missing deliverable_id" }, { status: 400 });
  const parsed = EmailDocSchema.safeParse(body?.doc);
  if (!parsed.success) return NextResponse.json({ error: "invalid doc" }, { status: 400 });

  // Ownership: gate on the projects table (owner-RLS'd) the same way POST and
  // build/route.ts do. `deliverables` has public SELECT (USING true), so selecting
  // the deliverable alone proves nothing — prove project ownership FIRST.
  const { data: project } = await db.from("projects").select("id").eq("id", id).single();
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Then confirm the deliverable belongs to this owned project and is block-canvas.
  const { data: owned } = await db
    .from("deliverables")
    .select("id")
    .eq("id", body.deliverable_id)
    .eq("project_id", id)
    .eq("template", "block-canvas")
    .single();
  if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Keep the saved build prompt fresh too (only overwrite when one is supplied, so a
  // doc-only PATCH never wipes it). Powers the scheduled re-render's chart fidelity.
  const patch: Database["public"]["Tables"]["deliverables"]["Update"] = {
    doc: parsed.data,
    data_as_of: new Date().toISOString(),
  };
  if (typeof body?.ai_prompt === "string" && body.ai_prompt.trim()) {
    patch.instruction = body.ai_prompt.trim();
  }
  const admin = createServiceRoleClient();
  const { error } = await admin.from("deliverables").update(patch).eq("id", body.deliverable_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
