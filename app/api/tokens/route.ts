// POST /api/tokens — mint a per-user API token for the REST/skill intake door.
// The raw token is returned ONCE and never stored; only its hash lands
// (public.user_api_tokens, RLS-scoped). Revocation = delete the row.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { mintToken, hashToken } from "@/lib/api-tokens/token";

export const runtime = "nodejs";

export async function POST() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const raw = mintToken();
  const { error } = await supabase
    .from("user_api_tokens")
    .insert({ user_id: user.id, token_hash: hashToken(raw), label: "data-connect" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ token: raw, note: "shown once — store it now" });
}
