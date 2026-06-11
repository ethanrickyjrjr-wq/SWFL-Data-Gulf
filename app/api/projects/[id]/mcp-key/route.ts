import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-project capability key — mint / regenerate / revoke.
 *
 *   POST   /api/projects/[id]/mcp-key  → mint OR regenerate. Regenerate overwrites
 *                                        `projects.mcp_key`, so the OLD key matches
 *                                        no row on the next lookup = instant revoke.
 *   DELETE /api/projects/[id]/mcp-key  → clear the key (full revoke, no replacement).
 *
 * Ownership is proven by the COOKIE client: the UPDATE is RLS-scoped to the owner
 * (`auth.uid() = user_id`), so a non-owner's id updates no row → 404. The key is
 * the capability the user hands to their OWN Claude (as the `X-Project-Key`
 * header); it scopes writes to THIS one project only and never itself names a
 * write target. Leak mitigation: single-project scope + regenerate-to-revoke.
 */

function mintKey(): string {
  // `proj_` + 32 random bytes base64url = 256 bits of entropy.
  return `proj_${crypto.randomBytes(32).toString("base64url")}`;
}

async function ownerUpdate(id: string, mcp_key: string | null) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401 as const, body: { error: "unauthorized" } };

  // RLS scopes this UPDATE to the owner — a non-owner id updates no row.
  const { data, error } = await supabase
    .from("projects")
    .update({ mcp_key, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return { status: 500 as const, body: { error: "update failed" } };
  if (!data) return { status: 404 as const, body: { error: "not found" } };
  return { status: 200 as const, body: null };
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mcp_key = mintKey();
  const r = await ownerUpdate(id, mcp_key);
  if (r.status !== 200) return NextResponse.json(r.body, { status: r.status });
  return NextResponse.json({ mcp_key });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await ownerUpdate(id, null);
  if (r.status !== 200) return NextResponse.json(r.body, { status: r.status });
  return NextResponse.json({ ok: true });
}
