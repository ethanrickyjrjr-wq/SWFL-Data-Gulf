// app/api/projects/[id]/materials/[did]/refresh/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { EmailDocSchema } from "@/lib/email/doc/schema";

const EMPTY_NARRATIVE = { exec_summary: "", sections: [], inference_notes: [] };
const REFRESH_PROMPT =
  "Refresh all statistics and data values with the latest available data for this scope. " +
  "Keep layout, colors, block order, and structure identical.";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; did: string }> },
): Promise<NextResponse> {
  const { id, did } = await params;
  const db = createClient(await cookies());
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Load + ownership. `deliverables` SELECT is public (share-by-unguessable-slug,
  // 20260613_deliverables.sql:37 → USING (true)), so RLS does NOT scope this read —
  // enforce ownership explicitly, mirroring app/api/deliverables/[id]/refresh/route.ts:40.
  const { data: existing } = await db
    .from("deliverables")
    .select("id, user_id, template, doc, scope_kind, scope_value")
    .eq("id", did)
    .eq("project_id", id)
    .single();
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.user_id !== user.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Report templates → delegate to the existing refresh endpoint.
  if (existing.template !== "block-canvas" || !existing.doc) {
    const r = await fetch(`${req.nextUrl.origin}/api/deliverables/${did}/refresh`, {
      method: "POST",
      headers: { Cookie: req.headers.get("cookie") ?? "" },
    });
    return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
  }

  // Block-canvas: AI content-patch with the latest lake data. scope MUST be an object.
  const aiRes = await fetch(`${req.nextUrl.origin}/api/email-lab/ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      doc: existing.doc,
      scope: { kind: existing.scope_kind ?? undefined, value: existing.scope_value ?? undefined },
      mode: "refresh",
      prompt: REFRESH_PROMPT,
    }),
  });
  if (!aiRes.ok) return NextResponse.json({ error: "ai refresh failed" }, { status: 502 });

  const result = await aiRes.json();
  // The route returns 200 even when nothing changed — require an actual patch.
  if (result.applied !== true) {
    return NextResponse.json(
      { error: "no fresh data to apply", detail: result.message ?? null },
      { status: 409 },
    );
  }
  const validated = EmailDocSchema.safeParse(result.doc);
  if (!validated.success)
    return NextResponse.json({ error: "invalid refreshed doc" }, { status: 500 });

  const newId = crypto.randomUUID();
  const admin = createServiceRoleClient();
  const { error } = await admin.from("deliverables").insert({
    id: newId,
    project_id: id,
    user_id: user.id,
    template: "block-canvas",
    doc: validated.data,
    data_as_of: new Date().toISOString(),
    narrative: EMPTY_NARRATIVE,
    items_snapshot: [],
    status: "ready",
    supersedes_id: existing.id, // forks a new version; splitDeliverableVersions collapses the chain
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: newId }, { status: 201 });
}
