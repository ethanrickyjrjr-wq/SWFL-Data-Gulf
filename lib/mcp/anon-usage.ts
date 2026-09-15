/**
 * Monthly usage cap for anonymous (keyless) MCP callers.
 *
 * DESIGN DECISIONS (mirrors lib/email/build-usage.ts's doctrine, adapted):
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
 *    This bounds anonymous volume without requiring an account for casual use.
 *    Any caller presenting X-Account-Key or X-Project-Key skips this entirely
 *    — see app/api/mcp/usage-gate.ts.
 *
 * 4. MONTHLY, NOT DAILY (Ricky, 2026-09-15: "5 a day sounds like a lot...
 *    let's do 30 a month" — landed at 15/month). A daily reset never actually
 *    runs out: a free caller can take N requests every single day forever and
 *    never hit a wall, which is a worse conversion shape than a bigger number
 *    would be — general freemium research backs this (usage caps that produce
 *    a real "I've used my allowance" moment convert meaningfully better than
 *    caps that only throttle pace). A monthly cap produces that moment; a
 *    daily one doesn't, no matter how low it's set.
 *
 * 5. 15/MONTH IS A FIRST GUESS, NOT A MEASURED NUMBER — anchored below Carbon
 *    Arc's own cheapest PAID tier (50 tokens/$20/mo — see wiki/florida-public-
 *    records.md), so free never looks like a better deal than their paid
 *    comparable. No published benchmark exists for this specific product
 *    category; the standard industry move (and what we're doing) is launch
 *    with a reasonable guess, then tune from real usage after 30-90 days.
 *
 * 6. KEYED ON HASHED IP, NOT user_id — there is no account for an anonymous
 *    caller to key on. SHA-256 of the resolved client IP; raw IPs are never
 *    persisted. Not a security boundary (shared NAT/VPN callers share a
 *    bucket) — same caveat lib/rate-limit.ts's burst limiter already accepts
 *    for the same reason.
 *
 * 7. UTC MONTH KEY — first-of-month 'YYYY-MM-01', matching the `date` column
 *    type in migrations/20260915_mcp_anon_usage.sql (a bare 'YYYY-MM' isn't a
 *    valid date literal).
 *
 * 8. UNTYPED CLIENT for BOTH read and write — mcp_anon_usage
 *    (migrations/20260915_mcp_anon_usage.sql) postdates the last generated
 *    database.types.ts snapshot, so the typed client doesn't know this table.
 *    Registered in verification/supabase-untyped-allowlist.json.
 */

import crypto from "node:crypto";
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";

/** Free monthly request cap per anonymous (keyless) caller IP. */
export const FREE_ANON_MCP_REQUESTS_PER_MONTH = 15;

/** Returns the UTC first-of-month key for a given Date. Format: 'YYYY-MM-01'. */
export function mcpUsageMonthKey(d: Date): string {
  return `${d.toISOString().slice(0, 7)}-01`;
}

/** SHA-256 hex digest of a client IP. Never persist the raw IP. */
export function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex");
}

/**
 * Increments this month's request_count for this IP hash. NEVER THROWS.
 */
export async function recordMcpUsage(ipHash: string): Promise<void> {
  // SKIP-NOT-THROW: any DB failure is silently ignored.
  try {
    const db = createServiceRoleClientUntyped();
    const month = mcpUsageMonthKey(new Date());

    await db
      .from("mcp_anon_usage")
      .upsert(
        { ip_hash: ipHash, month, request_count: 0 },
        { onConflict: "ip_hash,month", ignoreDuplicates: true },
      );

    // NOTE (race): upsert + increment are two calls, same acceptable-for-v1
    // race build-usage.ts documents — Postgres integer += is row-atomic so
    // concurrent callers still land on the correct final count.
    await db.rpc("increment_mcp_anon_usage", {
      p_ip_hash: ipHash,
      p_month: month,
      p_n: 1,
    });
  } catch {
    // metering must never break a tool call
  }
}

/**
 * Reads this month's request_count for this IP hash and returns an
 * allow/deny decision. NEVER THROWS. FAIL OPEN on any error.
 */
export async function checkMcpUsageAllowance(
  ipHash: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const failOpen = { allowed: true, remaining: FREE_ANON_MCP_REQUESTS_PER_MONTH };

  try {
    const db = createServiceRoleClientUntyped();
    const month = mcpUsageMonthKey(new Date());

    const { data, error } = await db
      .from("mcp_anon_usage")
      .select("request_count")
      .eq("ip_hash", ipHash)
      .eq("month", month)
      .maybeSingle();

    if (error) {
      // FAIL OPEN: DB error (including "relation does not exist" if this
      // ships ahead of its migration) → allow.
      return failOpen;
    }

    const count = (data as { request_count?: number } | null)?.request_count ?? 0;
    return {
      allowed: count < FREE_ANON_MCP_REQUESTS_PER_MONTH,
      remaining: Math.max(0, FREE_ANON_MCP_REQUESTS_PER_MONTH - count),
    };
  } catch {
    // FAIL OPEN: unexpected exception → allow
    return failOpen;
  }
}
