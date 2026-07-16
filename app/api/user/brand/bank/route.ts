// app/api/user/brand/bank/route.ts
//
// The IMPLICIT bank endpoint — build popups and project saves POST here so a
// field typed once anywhere fills the account profile's blanks (and only its
// blanks). The account editor keeps using PATCH /api/user/brand (overwrite);
// this route exists precisely because implicit flows must not overwrite.

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { bankBrandFields } from "@/lib/brand/bank-brand-fields";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  await bankBrandFields(supabase, user.id, body as Record<string, unknown>);
  return NextResponse.json({ ok: true });
}
