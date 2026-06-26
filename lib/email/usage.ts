/**
 * Email usage metering and tier-gate for the multi-tenant email product (Unit E).
 *
 * DESIGN DECISIONS (flag for review):
 *
 * 1. NEVER THROWS — Both exported async functions swallow all errors in try/catch,
 *    mirroring the `recordUse` / `recordUseForClient` pattern in
 *    lib/highlighter/meter.ts. Metering must never break a send.
 *
 * 2. FAIL OPEN on checkUsageLimit — If the DB is unavailable or throws, we return
 *    `allowed: true`. A metering outage must not block every tenant's sends. The
 *    gate is advisory; blocking on a metering failure would be worse than an
 *    occasional over-limit send. Unit F (cron worker) should log the DB error
 *    from its own context; this function only reports.
 *
 * 3. GATE SEMANTICS — checkUsageLimit only REPORTS {allowed, tier, sent, limit}.
 *    It NEVER throws, NEVER skips, NEVER notifies. The CALLER (Unit F) decides
 *    what to do with allowed:false (skip + notify, per spec correctness flag #3).
 *    See plan.md §Unit E.
 *
 * 4. CALENDAR MONTH (UTC) BILLING PERIOD — The period key is 'YYYY-MM' in UTC.
 *    Usage resets implicitly each month: a new row is inserted for the new period
 *    key, so the old row's sent_count is simply not consulted. No reset cron needed.
 *    Period boundary: UTC midnight on the 1st of each month (e.g. 2026-06-30T23:59Z
 *    is '2026-06', 2026-07-01T00:00Z is '2026-07').
 *
 * 5. RACE CONDITION NOTE — recordEmailSent uses an upsert (insert-or-update) then
 *    increments via rpc. The upsert ensures the row exists; the increment is a
 *    separate call. Under concurrent sends for the same user in the same period,
 *    two workers could both upsert then increment — the increments are both applied
 *    so the final count is still correct (Postgres integer += is atomic at the row
 *    level). A true atomic insert+increment in one round-trip would require a
 *    custom RPC; acceptable for v1.
 */

import {
  createServiceRoleClient,
  createServiceRoleClientUntyped,
} from "@/utils/supabase/service-role";

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests — no DB dependency)
// ---------------------------------------------------------------------------

/**
 * Returns the billing period key for a given Date in UTC.
 * Format: 'YYYY-MM' (e.g. '2026-06').
 * Period boundary is UTC midnight on the 1st of each month.
 */
export function billingPeriod(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** Tier send limits per calendar month. */
const TIER_LIMITS: Record<string, number> = {
  free: 50,
  starter: 500,
  growth: 2000,
  pro: 10000,
} as const;

/**
 * Returns the monthly send limit for a given tier.
 * Unknown tiers fall back to the free limit (conservative).
 */
export function tierLimit(tier: string): number {
  return TIER_LIMITS[tier] ?? TIER_LIMITS.free;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Increments the user's sent_count for the current billing period (calendar month UTC).
 *
 * NEVER THROWS — errors are swallowed so metering never breaks a send.
 * Uses service-role client; safe to call from cron workers and API routes
 * that have no user cookie.
 *
 * @param userId  The authenticated user's UUID.
 * @param n       Number of sends to credit (usually 1).
 */
export async function recordEmailSent(userId: string, n: number): Promise<void> {
  // SKIP-NOT-THROW: any DB failure is silently ignored.
  try {
    // KNOWN-DEBT(rpc-not-in-generated-types): increment_email_sent_count exists in public,
    // but the generator hardcodes Functions: Record<string, never>, so .rpc(...) types its
    // args as `undefined`. Untyped hatch until the generator captures functions.
    const db = createServiceRoleClientUntyped();
    const period = billingPeriod(new Date());

    // Ensure the row exists for this period (no-op if it already does).
    await db
      .from("email_usage")
      .upsert(
        { user_id: userId, billing_period: period, sent_count: 0 },
        { onConflict: "user_id,billing_period", ignoreDuplicates: true },
      );

    // Atomically increment sent_count.
    // NOTE (race): upsert + increment are two calls. Concurrent sends still
    // produce the correct final count because Postgres integer += is row-atomic,
    // but a between-calls failure leaves the row at 0 rather than n. Acceptable
    // for v1; upgrade to a single RPC if precision under high concurrency matters.
    await db.rpc("increment_email_sent_count", {
      p_user_id: userId,
      p_billing_period: period,
      p_n: n,
    });
  } catch {
    // metering must never break a send
  }
}

/**
 * Reads the current-period usage for a user and returns an allow/deny decision.
 *
 * NEVER THROWS — always resolves.
 * FAIL OPEN on DB error — returns `allowed: true` with safe defaults so a
 * metering outage never blocks tenant sends.
 *
 * Gate semantics (flag for review):
 *   allowed === false means sent_count >= tier limit.
 *   The CALLER decides to skip + notify; this function only reports.
 *   It does NOT throw, skip, or notify itself.
 *
 * @param userId  The authenticated user's UUID.
 */
export async function checkUsageLimit(userId: string): Promise<{
  allowed: boolean;
  tier: string;
  sent: number;
  limit: number;
}> {
  // FAIL OPEN: if anything goes wrong, allow the send.
  // A metering outage must not block every tenant's sends.
  const failOpen = { allowed: true, tier: "free", sent: 0, limit: tierLimit("free") };

  try {
    const db = createServiceRoleClient();
    const period = billingPeriod(new Date());

    const { data, error } = await db
      .from("email_usage")
      .select("sent_count, tier")
      .eq("user_id", userId)
      .eq("billing_period", period)
      .maybeSingle();

    if (error) {
      // FAIL OPEN: DB error → allow
      return failOpen;
    }

    // No row yet this period → zero sends recorded; use free tier default.
    if (!data) {
      return { allowed: true, tier: "free", sent: 0, limit: tierLimit("free") };
    }

    const tier = data.tier ?? "free";
    const sent = data.sent_count ?? 0;
    const limit = tierLimit(tier);
    const allowed = sent < limit;

    return { allowed, tier, sent, limit };
  } catch {
    // FAIL OPEN: unexpected exception → allow
    return failOpen;
  }
}
