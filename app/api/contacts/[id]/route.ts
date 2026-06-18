// PATCH  /api/contacts/[id] — edit name/phone/tags
// DELETE /api/contacts/[id] — remove a contact
// RLS (auth.uid()) gates ownership; the explicit user_id eq is belt-and-suspenders.
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

async function authed() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await authed();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if ("name" in body) update.name = typeof body.name === "string" ? body.name.trim() || null : null;
  if ("phone" in body)
    update.phone = typeof body.phone === "string" ? body.phone.trim() || null : null;
  if ("tags" in body)
    update.tags = Array.isArray(body.tags)
      ? body.tags.map((t: unknown) => String(t).trim().toLowerCase()).filter(Boolean)
      : [];

  const { data, error } = await supabase
    .from("contacts")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: "update failed" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await authed();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase.from("contacts").delete().eq("id", id).eq("user_id", user.id);

  if (error) return NextResponse.json({ error: "delete failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
