// lib/brand/bank-brand-fields.ts
//
// BANK UPWARD WHEN BLANK (spec 2026-07-16-brand-fill-once §B). A brand field a
// user types anywhere (build popup, project Brand panel) also fills the ACCOUNT
// profile — but ONLY where the account copy is empty. Never overwrites: the
// account editor (PATCH /api/user/brand) is the only overwrite surface;
// deliberate per-project divergence stays local.
//
// Best-effort + never throws, exactly like applyUserBrandToProject — banking is
// a nicety, never a gate on the save that triggered it.

import type { SupabaseClient } from "@supabase/supabase-js";
import { PROFILE_FIELD_KEYS, isBlank } from "@/lib/brand/profile-ledger";

const LEDGER_KEYS = new Set(PROFILE_FIELD_KEYS);

export async function bankBrandFields(
  supabase: SupabaseClient,
  userId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  try {
    const candidates = Object.entries(patch).filter(
      ([k, v]) => LEDGER_KEYS.has(k) && typeof v === "string" && v.trim().length > 0,
    ) as [string, string][];
    if (candidates.length === 0) return;

    const { data: existing } = await supabase
      .from("user_brand_profiles")
      .select(candidates.map(([k]) => k).join(", "))
      .eq("user_id", userId)
      .maybeSingle();

    const row: Record<string, string> = {};
    for (const [k, v] of candidates) {
      if (isBlank((existing as Record<string, unknown> | null)?.[k])) row[k] = v.trim();
    }
    if (Object.keys(row).length === 0) return;

    await supabase
      .from("user_brand_profiles")
      .upsert(
        { user_id: userId, ...row, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
  } catch {
    /* best-effort — a bank failure must never fail the triggering save */
  }
}
