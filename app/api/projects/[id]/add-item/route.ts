import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { projectItemSchema, projectItemsSchema } from "@/lib/project/items";

export const runtime = "nodejs";

/**
 * POST /api/projects/[id]/add-item
 *
 * Appends one item to a project's items array without requiring the caller to
 * hold the current array. Uses a fresh DB read → dedup → append → PATCH so
 * concurrent filers don't clobber each other. RLS-scoped via cookie client —
 * non-owner gets 404.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = projectItemSchema.safeParse(body?.item);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid item", detail: parsed.error.issues },
      { status: 422 },
    );
  }
  const newItem = parsed.data;

  const { data: project, error: readErr } = await supabase
    .from("projects")
    .select("items")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: "read failed" }, { status: 500 });
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const existing = projectItemsSchema.catch([]).parse(project.items);
  if (existing.some((it) => it.id === newItem.id)) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const { error: writeErr } = await supabase
    .from("projects")
    .update({ items: [...existing, newItem], updated_at: new Date().toISOString() })
    .eq("id", id);
  if (writeErr) return NextResponse.json({ error: "update failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
