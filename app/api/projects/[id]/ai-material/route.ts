import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import { seedById } from "@/lib/email/doc/default-docs";
import { pickSeedId } from "./pick-seed";

export const runtime = "nodejs";
export const maxDuration = 30;

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

  // Ownership check + scope for lake context (RLS ensures this user owns the project).
  const { data: project } = await db
    .from("projects")
    .select("id, scope_kind, scope_value")
    .eq("id", id)
    .single();
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { intent } = await req.json().catch(() => ({ intent: "" }));
  const seed = seedById(pickSeedId(intent ?? ""))!; // pickSeedId always returns a valid id
  const seededDoc = seed.build();

  // Try to fill with lake data. Never a dead end: if AI can't fill, fall back to the seeded doc.
  let finalDoc = seededDoc;
  const aiRes = await fetch(`${req.nextUrl.origin}/api/email-lab/ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      doc: seededDoc,
      scope: { kind: project.scope_kind ?? undefined, value: project.scope_value ?? undefined },
      prompt: intent || "Fill this template with the latest data for this project.",
    }),
  }).catch(() => null);

  if (aiRes?.ok) {
    const result = await aiRes.json().catch(() => null);
    if (result?.applied === true) {
      const validated = EmailDocSchema.safeParse(result.doc);
      if (validated.success) finalDoc = validated.data;
    }
  }

  const newId = crypto.randomUUID();
  const admin = createServiceRoleClient();
  const { error } = await admin.from("deliverables").insert({
    id: newId,
    project_id: id,
    user_id: user.id,
    template: "block-canvas",
    doc: finalDoc,
    data_as_of: new Date().toISOString(),
    narrative: EMPTY_NARRATIVE,
    items_snapshot: [],
    status: "ready",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    { id: newId, template: { id: seed.id, name: seed.name } },
    { status: 201 },
  );
}
