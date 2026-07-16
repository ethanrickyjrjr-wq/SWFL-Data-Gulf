// lib/billing/effective-tier.ts
// THE effective-tier authority. billing_subscriptions is the Stripe truth;
// switch_passes is the timed Switch Pass override (spec 2026-07-16). A real
// paid subscription ALWAYS wins; the pass only lifts "free". Consumers keep
// receiving the same tier strings tierLimit/emailLabTierFor already handle.
import type { SupabaseClient } from "@supabase/supabase-js";

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

/** Service-role read. FAIL OPEN to the subscription tier (mirrors usage.ts). */
export async function resolveEffectiveTier(db: SupabaseClient, userId: string): Promise<string> {
  let subTier: string | null = null;
  try {
    const { data } = await db
      .from("billing_subscriptions")
      .select("tier")
      .eq("user_id", userId)
      .maybeSingle();
    subTier = (data?.tier as string | null) ?? null;
  } catch {
    /* fail open to free below */
  }
  let pass: { tier: string; expires_at: string } | null = null;
  try {
    const { data } = await db
      .from("switch_passes")
      .select("tier, expires_at")
      .eq("user_id", userId)
      .maybeSingle();
    pass = (data as { tier: string; expires_at: string } | null) ?? null;
  } catch {
    /* pass lookup failure must never block */
  }
  return pickEffectiveTier(subTier, pass, new Date());
}
