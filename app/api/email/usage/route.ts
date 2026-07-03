// app/api/email/usage/route.ts
//
// GET /api/email/usage — the signed-in user's send meter for the current
// billing period. Returns checkUsageLimit() verbatim: {allowed, tier, sent,
// limit}. Fail-open semantics ride along from checkUsageLimit (a metering
// outage reports sent:0 / allowed:true — the meter is furniture, the real
// gate stays server-side at send time).
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { checkUsageLimit } from "@/lib/email/usage";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  return NextResponse.json(await checkUsageLimit(user.id));
}
