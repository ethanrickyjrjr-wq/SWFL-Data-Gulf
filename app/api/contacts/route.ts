// GET  /api/contacts        — list the signed-in user's contacts + caller's email-lab tier
// POST /api/contacts        — upsert one contact
// RLS (auth.uid()) scopes every row to its owner; no contact is visible cross-user.
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { emailLabTierFor, type EmailLabTier } from "@/lib/email/lab/capabilities";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function authed() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// Resolve the caller's email-lab tier. Same query shape as
// lib/email/usage.ts#checkUsageLimit — service-role read of billing_subscriptions,
// select "tier", eq user_id, maybeSingle. FAILS OPEN to "free" on ANY lookup
// error: a query error leaves `sub` null (→ "free"), and a thrown client/network
// error is caught here (→ "free"). A billing/metering hiccup must never 500 the
// contacts list and block its picker from loading at all.
async function tierForUser(userId: string): Promise<EmailLabTier> {
  try {
    const db = createServiceRoleClient();
    const { data: sub } = await db
      .from("billing_subscriptions")
      .select("tier")
      .eq("user_id", userId)
      .maybeSingle();
    return emailLabTierFor(sub?.tier ?? "free");
  } catch {
    return "free";
  }
}

export async function GET() {
  const { supabase, user } = await authed();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "read failed" }, { status: 500 });

  const tier = await tierForUser(user.id);
  return NextResponse.json({ contacts: data ?? [], tier });
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await authed();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "valid email required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("contacts")
    .upsert(
      {
        user_id: user.id,
        email,
        name: typeof body.name === "string" ? body.name.trim() || null : null,
        phone: typeof body.phone === "string" ? body.phone.trim() || null : null,
        tags: Array.isArray(body.tags)
          ? body.tags.map((t: unknown) => String(t).trim().toLowerCase()).filter(Boolean)
          : [],
      },
      { onConflict: "user_id,email" },
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: "save failed" }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
