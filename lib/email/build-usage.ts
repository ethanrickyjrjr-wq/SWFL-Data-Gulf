/**
 * Build usage metering + the quiet free-tier daily guard (Task 8).
 *
 * DESIGN DECISIONS (flag for review):
 *
 * 1. NEVER THROWS — both exported async functions swallow all errors in
 *    try/catch, mirroring `recordEmailSent` / `checkUsageLimit` in
 *    lib/email/usage.ts (and `recordUse` in lib/highlighter/meter.ts before
 *    that). Metering must never break a build.
 *
 * 2. FAIL OPEN on checkBuildAllowance — a DB error, an unexpected exception,
 *    or a `degraded: true` from resolveEffectiveTier (the billing_subscriptions
 *    read itself failed) all return `allowed: true`. A metering or billing
 *    outage must never block a build.
 *
 * 3. QUIET DAILY GUARD, NOT A MONTHLY QUOTA — this is a separate limiter from
 *    lib/email/usage.ts's send-side monthly billing-period gate. Builds are
 *    free (lib/email/CLAUDE.md: "Send is the paywall, builds are free" — no
 *    build gate, no Stripe on creation). This only throttles the FREE tier's
 *    daily build volume (an abuse/cost guard on LLM calls + lake reads), never
 *    an upsell screen. Any tier other than "free" is allowed ALWAYS, uncapped
 *    — checkBuildAllowance doesn't even read build_usage for a paid/pass tier.
 *
 * 4. UTC DAY KEY — 'YYYY-MM-DD' via `d.toISOString().slice(0, 10)`, the same
 *    UTC-boundary convention as `billingPeriod` in lib/email/usage.ts. The day
 *    boundary is UTC midnight, matching `build_usage.day` (a `date` column).
 *
 * 5. UPSERT-THEN-RPC-INCREMENT — same shape and same race-condition note as
 *    recordEmailSent: two concurrent builds for the same user/day could both
 *    upsert then increment; Postgres integer += is row-atomic so the final
 *    count is still correct. Acceptable for v1.
 */

import {
  createServiceRoleClient,
  createServiceRoleClientUntyped,
} from "@/utils/supabase/service-role";
import { resolveEffectiveTier } from "@/lib/billing/effective-tier";

/**
 * Free-tier daily build cap. Any tier other than "free" is uncapped — see
 * DESIGN DECISION 3 above.
 */
export const FREE_BUILDS_PER_DAY = 30;

/**
 * Returns the UTC day key for a given Date. Format: 'YYYY-MM-DD'.
 * Day boundary is UTC midnight (matches `build_usage.day`, a `date` column).
 */
export function buildDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Increments the user's build_count for today (UTC day key).
 *
 * NEVER THROWS — errors are swallowed so metering never breaks a build.
 * Fire-and-forget from the caller's perspective is fine; awaiting it is also
 * fine since it never rejects.
 *
 * Uses the UNTYPED service-role client (`createServiceRoleClientUntyped`):
 * `increment_build_count` exists in `public` (migrations/20260716_switch_pass.sql),
 * but the generator hardcodes `Functions: Record<string, never>`, so a typed
 * client's `.rpc(...)` types its args as `undefined`.
 * KNOWN-DEBT(rpc-not-in-generated-types): untyped hatch until the generator
 * captures functions — same hatch `recordEmailSent` uses in lib/email/usage.ts.
 * The RPC is EXECUTE-locked to `service_role` only (REVOKE'd from PUBLIC /
 * anon / authenticated), so a cookie-auth'd client could never call it anyway
 * — this MUST be the service-role client, same as `checkBuildAllowance` below.
 *
 * @param userId  The authenticated user's UUID.
 */
export async function recordBuild(userId: string): Promise<void> {
  // SKIP-NOT-THROW: any DB failure is silently ignored.
  try {
    // KNOWN-DEBT(rpc-not-in-generated-types): increment_build_count exists in public,
    // but the generator hardcodes Functions: Record<string, never>, so .rpc(...) types
    // its args as `undefined`. Untyped hatch until the generator captures functions —
    // same hatch recordEmailSent uses in lib/email/usage.ts. File is registered in
    // verification/supabase-untyped-allowlist.json (required by the eslint ban).
    const db = createServiceRoleClientUntyped();
    const day = buildDayKey(new Date());

    // Ensure the row exists for today (no-op if it already does).
    await db
      .from("build_usage")
      .upsert(
        { user_id: userId, day, build_count: 0 },
        { onConflict: "user_id,day", ignoreDuplicates: true },
      );

    // Atomically increment build_count.
    // NOTE (race): upsert + increment are two calls. Concurrent builds still
    // produce the correct final count because Postgres integer += is row-atomic,
    // but a between-calls failure leaves the row at 0 rather than n. Acceptable
    // for v1; upgrade to a single RPC if precision under high concurrency matters.
    await db.rpc("increment_build_count", {
      p_user_id: userId,
      p_day: day,
      p_n: 1,
    });
  } catch {
    // metering must never break a build
  }
}

/**
 * Reads today's build_usage for a user and returns an allow/deny decision.
 *
 * NEVER THROWS — always resolves.
 * FAIL OPEN on DB error, unexpected exception, or a degraded tier read —
 * returns `allowed: true` so a metering/billing outage never blocks a build.
 *
 * Gate semantics: any tier other than "free" is allowed ALWAYS (builds are
 * free; this cap only bounds the free tier's daily volume). Free tier is
 * allowed only while today's build_count < FREE_BUILDS_PER_DAY.
 *
 * @param userId  The authenticated user's UUID.
 */
export async function checkBuildAllowance(userId: string): Promise<{ allowed: boolean }> {
  // FAIL OPEN: if anything goes wrong, allow the build.
  const failOpen = { allowed: true };

  try {
    const db = createServiceRoleClient();

    // Same effective-tier authority the send-side gate uses (billing_subscriptions
    // + switch_passes — lib/billing/effective-tier.ts). `degraded` means the
    // billing_subscriptions read itself failed (thrown OR errored, no throw
    // required) — we could not confirm this caller's real tier, so fail OPEN,
    // same doctrine as checkUsageLimit in lib/email/usage.ts.
    const { tier, degraded } = await resolveEffectiveTier(db, userId);
    if (degraded) {
      return failOpen;
    }

    // Any paid/pass tier is uncapped — never consult build_usage for them.
    if (tier !== "free") {
      return { allowed: true };
    }

    const day = buildDayKey(new Date());
    const { data, error } = await db
      .from("build_usage")
      .select("build_count")
      .eq("user_id", userId)
      .eq("day", day)
      .maybeSingle();

    if (error) {
      // FAIL OPEN: DB error → allow
      return failOpen;
    }

    const count = data?.build_count ?? 0;
    return { allowed: count < FREE_BUILDS_PER_DAY };
  } catch {
    // FAIL OPEN: unexpected exception → allow
    return failOpen;
  }
}
