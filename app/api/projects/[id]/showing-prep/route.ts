import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { seedById } from "@/lib/email/doc/default-docs";
import { gatherShowingPrepData } from "@/lib/listings/showing-prep-source";
import { assembleShowingPrepDoc } from "@/lib/email/showing-prep-assemble";

export const runtime = "nodejs";
export const maxDuration = 30;

const EMPTY_NARRATIVE = { exec_summary: "", sections: [], inference_notes: [] };

/**
 * POST /api/projects/[id]/showing-prep — build the Showing Prep Packet for a
 * project's subject_address and persist it as a block-canvas deliverable. Never a
 * dead end: an unresolved address still builds an address-only skeleton. Mirrors the
 * ai-material route's persist shape exactly (service-role insert into deliverables).
 */
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

  const { data: project } = await db
    .from("projects")
    .select("id, subject_address")
    .eq("id", id)
    .single();
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const address = (project.subject_address as string | null) ?? "";

  // Start from the standard branded seed (sticky header/agent-card/footer/globalStyle),
  // then build the packet grid over it. Never throws — every lane degrades.
  const current = seedById("market-spotlight")!.build();
  const data = await gatherShowingPrepData(address);
  const doc = await assembleShowingPrepDoc(data, current);

  const newId = crypto.randomUUID();
  const admin = createServiceRoleClient();
  const { error } = await admin.from("deliverables").insert({
    id: newId,
    project_id: id,
    user_id: user.id,
    template: "block-canvas",
    doc,
    data_as_of: new Date().toISOString(),
    narrative: EMPTY_NARRATIVE,
    items_snapshot: [],
    status: "ready",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id: newId }, { status: 201 });
}
