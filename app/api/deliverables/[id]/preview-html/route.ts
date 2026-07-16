// app/api/deliverables/[id]/preview-html/route.ts
//
// Owner-gated EmailDoc→HTML for the hub's Selected-project frozen preview.
// Renders through the ONE EmailDoc→HTML root (renderEmailDocHtml) — the same
// bytes /p/[id] and the blast path produce. Read-only; no writes.
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import { EmailDocSchema } from "@/lib/email/doc/schema";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("deliverables")
    .select("user_id, template, doc, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (data.user_id !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (data.deleted_at || data.template !== "block-canvas")
    return NextResponse.json({ error: "no preview" }, { status: 422 });

  const parsed = EmailDocSchema.safeParse(data.doc);
  if (!parsed.success) return NextResponse.json({ error: "invalid doc" }, { status: 422 });
  const html = await renderEmailDocHtml(parsed.data);
  return NextResponse.json({ html });
}
