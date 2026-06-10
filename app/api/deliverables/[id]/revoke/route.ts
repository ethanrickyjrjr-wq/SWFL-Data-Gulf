import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

export const runtime = "nodejs";

/**
 * POST /api/deliverables/[id]/revoke
 *   body: { restore?: boolean }
 *
 * Revokes (status='revoked') or restores (status='ready') a deliverable.
 * Ownership is checked explicitly: the deliverables table has only a public
 * SELECT policy; writes go through service_role after the ownership gate.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Public SELECT — verify ownership before mutating.
  const { data: deliverable } = await supabase
    .from("deliverables")
    .select("user_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!deliverable) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (deliverable.user_id !== user.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const nextStatus = body.restore ? "ready" : "revoked";

  const svc = createServiceRoleClient();
  const { error } = await svc.from("deliverables").update({ status: nextStatus }).eq("id", id);
  if (error) return NextResponse.json({ error: "update failed" }, { status: 500 });

  return NextResponse.json({ ok: true, status: nextStatus });
}
