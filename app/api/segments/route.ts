// app/api/segments/route.ts
//
// GET  /api/segments — list the signed-in user's saved contact segments
// POST /api/segments — create one ({ name, filter })
//
// NOT the Resend "Segments" API and NOT email_audiences (the tag ->
// Resend-segment-id cache for the recurring digest lane,
// lib/email/audience-sync.ts). This is the ONE-OFF BLAST lane's saved
// filter — see lib/email/CLAUDE.md.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { requiresPaidTier, type Condition } from "@/lib/email/segments/filter";
import { emailLabTierFor } from "@/lib/email/lab/capabilities";
import { resolveEffectiveTier } from "@/lib/billing/effective-tier";

async function authed() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Same effective-tier authority lib/email/usage.ts#checkUsageLimit consults. */
async function currentTier(userId: string): Promise<"free" | "paid"> {
  const db = createServiceRoleClient();
  const { tier } = await resolveEffectiveTier(db, userId);
  return emailLabTierFor(tier);
}

export async function GET() {
  const { supabase, user } = await authed();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("contact_segments")
    .select("id, name, filter, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "read failed" }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const { supabase, user } = await authed();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const filter = body?.filter as Condition | undefined;
  if (!name || !filter) {
    return NextResponse.json({ error: "name and filter required" }, { status: 400 });
  }

  // Server-side tier floor — the picker UI already hides these controls from
  // free tier, but that must not be the only gate (a raw fetch could bypass it).
  if (requiresPaidTier(filter) && (await currentTier(user.id)) !== "paid") {
    return NextResponse.json({ error: "paid_tier_required" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("contact_segments")
    .insert({ user_id: user.id, name, filter })
    .select("id, name, filter, created_at, updated_at")
    .single();
  if (error) return NextResponse.json({ error: "save failed" }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
