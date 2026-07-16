// lib/billing/effective-tier.ts
// THE effective-tier authority. billing_subscriptions is the Stripe truth;
// switch_passes is the timed Switch Pass override (spec 2026-07-16). A real
// paid subscription ALWAYS wins; the pass only lifts "free". Consumers keep
// receiving the same tier strings tierLimit/emailLabTierFor already handle.
//
// DEGRADE CONTRACT (review Critical, 2026-07-16): supabase-js does NOT throw
// on a normal query failure (RLS denial, timeout) — it resolves
// `{data: null, error}`. The billing_subscriptions read is the loud one: a
// thrown exception OR a non-null `error` there means we could NOT determine
// whether this caller pays, so `degraded: true` comes back and the CALLER
// (checkUsageLimit) must fail OPEN — a billing outage must never block a
// paying customer's send. The switch_passes read is the quiet one: it's a
// bonus lift on top of whatever billing_subscriptions said, so a thrown
// exception OR a non-null `error` there just means "no pass" (pass = null)
// and never sets `degraded` — a Switch Pass outage degrades gracefully to
// "no pass," not to "we don't know this user's tier."
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";

const PAID = new Set(["starter", "growth", "pro"]);

export function pickEffectiveTier(
  subTier: string | null,
  pass: { tier: string; expires_at: string } | null,
  now: Date,
): string {
  if (subTier && PAID.has(subTier)) return subTier;
  if (pass && new Date(pass.expires_at).getTime() > now.getTime()) return pass.tier;
  return subTier ?? "free";
}

/**
 * Service-role read. Returns the effective tier PLUS a `degraded` flag.
 *
 * `degraded: true` means the billing_subscriptions read itself failed
 * (thrown exception OR a returned `error`) — we could not confirm this
 * caller's real subscription, so `tier` here is NOT trustworthy for gating
 * and the caller must fail open (never block a send on a billing hiccup).
 * `degraded: false` means billing_subscriptions was read successfully
 * (paid, free, or no row) regardless of whether the switch_passes lookup
 * also succeeded — a pass-lookup failure only means "no pass," never a
 * degrade of the whole resolution.
 */
export async function resolveEffectiveTier(
  db: SupabaseClient<Database>,
  userId: string,
): Promise<{ tier: string; degraded: boolean }> {
  let subTier: string | null = null;
  let degraded = false;
  try {
    const { data, error } = await db
      .from("billing_subscriptions")
      .select("tier")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      degraded = true;
    } else {
      subTier = data?.tier ?? null;
    }
  } catch {
    degraded = true;
  }

  let pass: { tier: string; expires_at: string } | null = null;
  try {
    const { data, error } = await db
      .from("switch_passes")
      .select("tier, expires_at")
      .eq("user_id", userId)
      .maybeSingle();
    // A pass-lookup error just means "no pass" — never degrades the whole
    // resolution; the pass is a bonus, billing_subscriptions is the truth.
    pass = !error && data ? { tier: data.tier, expires_at: data.expires_at } : null;
  } catch {
    /* pass lookup failure must never block — pass stays null */
  }

  return { tier: pickEffectiveTier(subTier, pass, new Date()), degraded };
}
