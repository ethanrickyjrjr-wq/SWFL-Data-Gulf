import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Account-level MCP token — mint / regenerate / revoke / read.
 *
 * ONE token per user (`public.user_mcp_tokens`), reaching EVERY project the user
 * owns. This is the CONNECT-ONCE default: configure `.mcp.json` a single time
 * ever, then pick a project per tool call by name. It coexists with the
 * per-project `X-Project-Key` path (see `app/api/projects/[id]/mcp-key`), which
 * anyone can still use for tighter single-project scope.
 *
 *   GET    /api/account/mcp-token  → the current token (or null) for the settings UI.
 *   POST   /api/account/mcp-token  → mint OR regenerate. Upsert on `user_id`;
 *                                    regenerate overwrites `token`, so the OLD
 *                                    token matches no row on the next lookup =
 *                                    instant revoke.
 *   DELETE /api/account/mcp-token  → clear it (full revoke, no replacement).
 *
 * Ownership is proven by the COOKIE client: RLS scopes every row to
 * `auth.uid() = user_id`, so a session can only ever touch its own token. The
 * token travels as the `X-Account-Key` header the user hands to their OWN Claude;
 * it never itself names a write target (the project is resolved server-side from
 * the token's owned set).
 */

function mintToken(): string {
  // `acct_` + 32 random bytes base64url = 256 bits of entropy.
  return `acct_${crypto.randomBytes(32).toString("base64url")}`;
}

export async function GET() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("user_mcp_tokens")
    .select("token")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "read failed" }, { status: 500 });
  return NextResponse.json({ token: data?.token ?? null });
}

export async function POST(_req: NextRequest) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const token = mintToken();
  // Upsert on the PK (user_id); RLS WITH CHECK (auth.uid() = user_id) still applies.
  const { error } = await supabase
    .from("user_mcp_tokens")
    .upsert(
      { user_id: user.id, token, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) return NextResponse.json({ error: "mint failed" }, { status: 500 });
  return NextResponse.json({ token });
}

export async function DELETE() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase.from("user_mcp_tokens").delete().eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "revoke failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
