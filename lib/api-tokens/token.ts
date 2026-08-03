// lib/api-tokens/token.ts
// Per-user API tokens for the REST/skill intake door. Raw token shown ONCE
// at mint; only the sha256 hash is stored (user_api_tokens.token_hash).
// The MCP bearer (app/api/mcp/auth.ts) is a SINGLE shared env token — this
// is deliberately separate and per-user.
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";

const PREFIX = "sdg_";

export function mintToken(): string {
  return PREFIX + randomBytes(32).toString("hex");
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** `Authorization: Bearer sdg_…` → the owning user_id, or null. */
export async function resolveTokenUser(
  admin: SupabaseClient<Database>,
  authHeader: string | null,
): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const raw = authHeader.slice("Bearer ".length);
  if (!raw.startsWith(PREFIX)) return null;
  const { data } = await admin
    .from("user_api_tokens")
    .select("token_hash, user_id")
    .eq("token_hash", hashToken(raw))
    .maybeSingle();
  if (!data) return null;
  await admin
    .from("user_api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token_hash", data.token_hash);
  return data.user_id;
}
