import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { recordUse } from "@/lib/highlighter/meter";
import { buildDeliverableNarrative, freezeSnapshot } from "@/lib/deliverable/build";
import type { TemplateId } from "@/lib/deliverable/templates";
import { projectItemsSchema } from "@/lib/project/items";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/projects/[id]/build  — assemble a deliverable from a project.
 *
 * Ownership is proven via the COOKIE client (RLS: a non-owner's project row is
 * invisible → 404). The deliverable is a FROZEN snapshot (items + resolved chart
 * blocks). One forced-tool LLM call writes narrative-only prose, linted against
 * the snapshot numbers (the moat). The row is written via service-role because
 * `deliverables` has no INSERT policy — ownership is already proven above.
 * Returns `{ id }` → the client navigates to /p/[id].
 */

const TEMPLATES = new Set<TemplateId>(["market-overview", "bov-lite", "client-email", "one-pager"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // RLS proves ownership: a non-owner id resolves to no row → 404.
  const { data: project, error: loadErr } = await supabase
    .from("projects")
    .select("id, items, branding")
    .eq("id", id)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: "read failed" }, { status: 500 });
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { template?: string; instruction?: string };
  const template = body.template as TemplateId | undefined;
  if (!template || !TEMPLATES.has(template)) {
    return NextResponse.json({ error: "invalid template" }, { status: 400 });
  }
  const instruction = typeof body.instruction === "string" ? body.instruction : "";

  // Validate the stored items before we freeze (defensive — they're trusted, but
  // a malformed row must not reach the LLM path).
  const parsedItems = projectItemsSchema.safeParse(project.items ?? []);
  if (!parsedItems.success) {
    return NextResponse.json({ error: "project items invalid" }, { status: 422 });
  }

  await recordUse(req, { report_id: id, reach: [], action: "build" });

  const itemsSnapshot = await freezeSnapshot(supabase, parsedItems.data);
  const { narrative } = await buildDeliverableNarrative({
    instruction,
    items: itemsSnapshot,
    template,
  });

  // Full-entropy slug (≥122 bits, [LB-R5]) — base64url of 16 random bytes = 128 bits.
  const slug = crypto.randomBytes(16).toString("base64url");

  const svc = createServiceRoleClient();
  const { error: insErr } = await svc.from("deliverables").insert({
    id: slug,
    project_id: id,
    user_id: user.id,
    template,
    instruction: instruction || null,
    narrative,
    items_snapshot: itemsSnapshot,
    branding: project.branding ?? null,
    status: "ready",
  });
  if (insErr) return NextResponse.json({ error: "build failed" }, { status: 500 });

  return NextResponse.json({ id: slug });
}
