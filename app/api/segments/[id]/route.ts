// app/api/segments/[id]/route.ts
//
// PATCH  /api/segments/[id] — update a saved segment's name/filter
// DELETE /api/segments/[id] — delete a saved segment
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { requiresPaidTier, type Condition } from "@/lib/email/segments/filter";
import { emailLabTierFor } from "@/lib/email/lab/capabilities";

async function authed() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

async function currentTier(userId: string): Promise<"free" | "paid"> {
  const db = createServiceRoleClient();
  const { data } = await db
    .from("billing_subscriptions")
    .select("tier")
    .eq("user_id", userId)
    .maybeSingle();
  return emailLabTierFor(data?.tier ?? "free");
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await authed();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const update: { name?: string; filter?: Condition; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body?.name === "string" && body.name.trim()) update.name = body.name.trim();
  if (body?.filter) update.filter = body.filter as Condition;
  if (!update.name && !update.filter) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }
  if (update.filter && requiresPaidTier(update.filter) && (await currentTier(user.id)) !== "paid") {
    return NextResponse.json({ error: "paid_tier_required" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("contact_segments")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, name, filter, created_at, updated_at")
    .single();
  if (error) return NextResponse.json({ error: "update failed" }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await authed();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("contact_segments")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "delete failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
