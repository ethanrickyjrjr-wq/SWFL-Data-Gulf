// app/api/segments/preview/route.ts
//
// POST /api/segments/preview — resolve a filter (saved or ad-hoc) against the
// signed-in user's own contacts. Used by ContactPickerModal to show a live
// match count as conditions are built, before saving or sending.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { resolveSegment } from "@/lib/email/segments/resolve";
import { requiresPaidTier, type Condition } from "@/lib/email/segments/filter";
import { emailLabTierFor } from "@/lib/email/lab/capabilities";

export async function POST(req: Request) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const filter = body?.filter as Condition | undefined;
  if (!filter) return NextResponse.json({ error: "filter required" }, { status: 400 });

  if (requiresPaidTier(filter)) {
    const db = createServiceRoleClient();
    const { data: sub } = await db
      .from("billing_subscriptions")
      .select("tier")
      .eq("user_id", user.id)
      .maybeSingle();
    if (emailLabTierFor(sub?.tier ?? "free") !== "paid") {
      return NextResponse.json({ error: "paid_tier_required" }, { status: 403 });
    }
  }

  const contacts = await resolveSegment(supabase, user.id, filter);
  return NextResponse.json({ contacts, count: contacts.length });
}
