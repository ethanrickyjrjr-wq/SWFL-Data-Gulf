// app/api/email/sequence-setups/route.ts
//
// The agent's reusable arc setups (spec 2026-07-05-lifecycle-sequences-design.md).
//   GET  — list mine, newest first.
//   POST — save {name, steps, is_default}; saving a default clears the previous
//          one first (one_default partial unique index would reject otherwise).
// A setup is prompts + layouts ONLY — project data never lands here.

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { SetupStepsSchema } from "@/lib/email/sequence/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = createClient(await cookies());
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await db
    .from("email_sequence_setups")
    .select("id, name, is_default, steps, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  return NextResponse.json({ setups: data ?? [] });
}

export async function POST(req: NextRequest) {
  const db = createClient(await cookies());
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";
  const steps = SetupStepsSchema.safeParse(body?.steps);
  const isDefault = body?.is_default === true;
  if (!name || !steps.success || steps.data.length === 0) {
    return NextResponse.json({ error: "name + steps required" }, { status: 422 });
  }
  if (isDefault) {
    await db
      .from("email_sequence_setups")
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("is_default", true);
  }
  const { data, error } = await db
    .from("email_sequence_setups")
    .insert({ user_id: user.id, name, is_default: isDefault, steps: steps.data })
    .select("id, name, is_default")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ setup: data }, { status: 201 });
}
