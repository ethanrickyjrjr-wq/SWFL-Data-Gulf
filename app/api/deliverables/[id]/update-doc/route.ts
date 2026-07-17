// app/api/deliverables/[id]/update-doc/route.ts
//
// POST — the hub Selected-project widget's UPDATE verb: re-run the ONE Email
// Lab build root (buildContentDoc) against this saved block-canvas doc with
// TODAY's data, and fork the result as a NEW row (supersedes_id = [id]) for
// review. This route NEVER sends, never schedules, never touches an active
// schedule (the schedule keeps its own deliverable_id and re-fills fresh at
// each occurrence anyway) — the automation-trust boundary is structural.
// The generic /refresh route can't serve this lane: assembleDeliverable never
// carries `doc` (check deliverable_refresh_drops_blockcanvas_doc).
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { buildContentDoc } from "@/lib/email/build-doc";
import { checkBuildAllowance, recordBuild } from "@/lib/email/build-usage";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import { deriveDocBuildArgs } from "@/lib/email/emaildoc-occurrence";
import type { EmailDoc } from "@/lib/email/doc/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: src } = await supabase
    .from("deliverables")
    .select(
      "user_id, project_id, template, instruction, narrative, items_snapshot, branding, scope_kind, scope_value, campaign_key, doc, deleted_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!src) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (src.user_id !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (src.deleted_at) return NextResponse.json({ error: "deleted" }, { status: 409 });
  if (src.template !== "block-canvas")
    return NextResponse.json({ error: "not a lab email" }, { status: 422 });

  const parsed = EmailDocSchema.safeParse(src.doc);
  if (!parsed.success) return NextResponse.json({ error: "invalid doc" }, { status: 422 });

  // Address spine, read FRESH like the cron lane (run-schedules.mts) does.
  const { data: proj } = await supabase
    .from("projects")
    .select("subject_address")
    .eq("id", src.project_id)
    .maybeSingle();

  const { prompt, scope } = deriveDocBuildArgs({
    instruction: src.instruction,
    scope_kind: src.scope_kind,
    scope_value: src.scope_value,
    subject_address: (proj?.subject_address as string | null) ?? null,
  });
  // Quiet free-tier daily guard (Task 8) — builds are free, but the free tier
  // caps daily volume; paid/pass tiers and a degraded tier-read are always
  // allowed (lib/email/build-usage.ts).
  const allowance = await checkBuildAllowance(user.id);
  if (!allowance.allowed) {
    return NextResponse.json(
      { error: "You've hit today's free build limit — it resets tomorrow." },
      { status: 429 },
    );
  }

  // Same mode the scheduler uses: content fill only, never a restyle; a fill
  // that doesn't apply ships the saved doc unchanged, never a blank.
  const result = await buildContentDoc({ prompt, rawDoc: parsed.data, scope, mode: "quality" });
  const freshDoc = (result.payload?.doc as EmailDoc | undefined) ?? parsed.data;
  // Metering never blocks a build — fire-and-forget, swallow any DB error.
  recordBuild(user.id).catch(() => {});

  const db = createServiceRoleClient();
  const newId = crypto.randomUUID();
  const { error: insErr } = await db.from("deliverables").insert({
    id: newId,
    project_id: src.project_id,
    user_id: user.id,
    template: "block-canvas",
    instruction: src.instruction,
    narrative: src.narrative,
    items_snapshot: src.items_snapshot,
    branding: src.branding,
    status: "ready",
    scope_kind: src.scope_kind,
    scope_value: src.scope_value,
    campaign_key: src.campaign_key,
    supersedes_id: id,
    doc: freshDoc,
    data_as_of: new Date().toISOString(),
  });
  if (insErr) return NextResponse.json({ error: "write failed" }, { status: 500 });
  return NextResponse.json({ id: newId });
}
