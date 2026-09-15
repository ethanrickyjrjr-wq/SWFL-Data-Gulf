/**
 * Daily usage cap for anonymous (keyless) MCP callers.
 *
 * DESIGN DECISIONS (mirrors lib/email/build-usage.ts's doctrine exactly):
 *
 * 1. NEVER THROWS — both exported async functions swallow all errors,
 *    matching recordBuild / checkBuildAllowance. Metering must never break
 *    a tool call.
 *
 * 2. FAIL OPEN on checkMcpUsageAllowance — a DB error, a missing table (the
 *    migration not yet applied), or any unexpected exception all return
 *    `allowed: true`. A metering outage, or this shipping ahead of its own
 *    migration, must never take the MCP surface down.
 *
 * 3. ABUSE/COST GUARD, NOT A PAYWALL — swfl_fetch and swfl_reconcile are
 *    intentionally keyless (v1 connect-once design; see app/api/mcp/server.ts).
 *    This bounds anonymous daily volume (the "clone the whole lake for free"
 *    case lib/rate-limit.ts's docstring already names) without requiring an
 *    account for casual use. Any caller presenting X-Account-Key or
 *    X-Project-Key skips this entirely — see app/api/mcp/usage-gate.ts.
 *
 * 4. KEYED ON HASHED IP, NOT user_id — there is no account for an anonymous
 *    caller to key on. SHA-256 of the resolved client IP; raw IPs are never
 *    persisted. Not a security boundary (shared NAT/VPN callers share a
 *    bucket) — same caveat lib/rate-limit.ts's burst limiter already accepts
 *    for the same reason.
 *
 * 5. UTC DAY KEY — 'YYYY-MM-DD', same convention as build_usage.day /
 *    lib/email/build-usage.ts's buildDayKey.
 *
 * 6. UNTYPED CLIENT for BOTH read and write — mcp_anon_usage
 *    (migrations/20260915_mcp_anon_usage.sql) postdates the last generated
 *    database.types.ts snapshot, so the typed client doesn't know this table.
 *    Registered in verification/supabase-untyped-allowlist.json.
 */

import crypto from "node:crypto";
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";

/** Free daily request cap per anonymous (keyless) caller IP. */
export const FREE_ANON_MCP_REQUESTS_PER_DAY = 20;

/** Returns the UTC day key for a given Date. Format: 'YYYY-MM-DD'. */
export function mcpUsageDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** SHA-256 hex digest of a client IP. Never persist the raw IP. */
export function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex");
}

/**
 * Increments today's request_count for this IP hash. NEVER THROWS.
 */
export async function recordMcpUsage(ipHash: string): Promise<void> {
  // SKIP-NOT-THROW: any DB failure is silently ignored.
  try {
    const db = createServiceRoleClientUntyped();
    const day = mcpUsageDayKey(new Date());

    await db
      .from("mcp_anon_usage")
      .upsert(
        { ip_hash: ipHash, day, request_count: 0 },
        { onConflict: "ip_hash,day", ignoreDuplicates: true },
      );

    // NOTE (race): upsert + increment are two calls, same acceptable-for-v1
    // race build-usage.ts documents — Postgres integer += is row-atomic so
    // concurrent callers still land on the correct final count.
    await db.rpc("increment_mcp_anon_usage", {
      p_ip_hash: ipHash,
      p_day: day,
      p_n: 1,
    });
  } catch {
    // metering must never break a tool call
  }
}

/**
 * Reads today's request_count for this IP hash and returns an allow/deny
 * decision. NEVER THROWS. FAIL OPEN on any error.
 */
export async function checkMcpUsageAllowance(
  ipHash: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const failOpen = { allowed: true, remaining: FREE_ANON_MCP_REQUESTS_PER_DAY };

  try {
    const db = createServiceRoleClientUntyped();
    const day = mcpUsageDayKey(new Date());

    const { data, error } = await db
      .from("mcp_anon_usage")
      .select("request_count")
      .eq("ip_hash", ipHash)
      .eq("day", day)
      .maybeSingle();

    if (error) {
      // FAIL OPEN: DB error (including "relation does not exist" if this
      // ships ahead of its migration) → allow.
      return failOpen;
    }

    const count = (data as { request_count?: number } | null)?.request_count ?? 0;
    return {
      allowed: count < FREE_ANON_MCP_REQUESTS_PER_DAY,
      remaining: Math.max(0, FREE_ANON_MCP_REQUESTS_PER_DAY - count),
    };
  } catch {
    // FAIL OPEN: unexpected exception → allow
    return failOpen;
  }
}
