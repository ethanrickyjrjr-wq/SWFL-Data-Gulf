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

// Shared row-fetch: parses the Bearer header, looks up user_api_tokens by
// hash, stamps last_used_at. `scope` is selected too (agent-driver, Task 2)
// even though the generated Database type doesn't know the column yet
// (migration 20260810_agent_driver.sql added it; types weren't regenerated) —
// cast at the boundary rather than duplicate this whole lookup a second time
// in lib/api-tokens/scopes.ts (RULE 0.5: don't re-derive what's already here).
async function findTokenRow(
  admin: SupabaseClient<Database>,
  authHeader: string | null,
): Promise<{ token_hash: string; user_id: string; scope: string | null } | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const raw = authHeader.slice("Bearer ".length);
  if (!raw.startsWith(PREFIX)) return null;
  const { data } = await admin
    .from("user_api_tokens")
    .select("token_hash, user_id, scope")
    .eq("token_hash", hashToken(raw))
    .maybeSingle();
  const row = data as { token_hash: string; user_id: string; scope: string | null } | null;
  if (!row) return null;
  await admin
    .from("user_api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token_hash", row.token_hash);
  return row;
}

/**
 * `Authorization: Bearer sdg_…` → the owning user_id, or null.
 *
 * F3 fix (hermes-email-driver final review, MEDIUM): a row whose `scope` IS NOT NULL is an
 * agent-driver token (agent_feed_read / agent_build / agent_test_inject -- see
 * migrations/20260810_agent_driver.sql) and must NOT open this legacy door -- the
 * contacts/listings import routes that call resolveTokenUser were never audited against an
 * agent-scoped token's narrow blast radius, and letting one in here would silently widen it.
 * A legacy (pre-agent-driver) token always has `scope IS NULL` (verified live) and is
 * completely unaffected -- this only closes a door that no real legacy token could ever have
 * opened anyway.
 */
export async function resolveTokenUser(
  admin: SupabaseClient<Database>,
  authHeader: string | null,
): Promise<string | null> {
  const row = await findTokenRow(admin, authHeader);
  if (!row || row.scope !== null) return null;
  return row.user_id;
}

/**
 * `Authorization: Bearer sdg_…` → { userId, scope }, or null.
 * `scope` is NULL for legacy (pre-agent-driver) tokens — see
 * migrations/20260810_agent_driver.sql. Added for lib/api-tokens/scopes.ts
 * (requireScope) which needs the scope column resolveTokenUser doesn't
 * surface.
 */
export async function resolveTokenUserWithScope(
  admin: SupabaseClient<Database>,
  authHeader: string | null,
): Promise<{ userId: string; scope: string | null } | null> {
  const row = await findTokenRow(admin, authHeader);
  if (!row) return null;
  return { userId: row.user_id, scope: row.scope };
}
