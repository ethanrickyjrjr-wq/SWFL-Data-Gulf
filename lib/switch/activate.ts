// lib/switch/activate.ts
// THE ONE place a Switch Pass is granted. Server-side only (service role):
// proof is a verified migration, never a client claim. Spec §1–2.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/database.types";

export const MIN_SWITCH_IMPORT = 25;
export const SWITCH_PASS_DAYS = 60;

export interface SwitchProof {
  lane: "oauth_extraction" | "forwarded_email";
  platform: string;
  contactsImported: number;
  detail?: Json;
}

export async function activateSwitchPass(
  db: SupabaseClient<Database>,
  userId: string,
  proof: SwitchProof,
): Promise<{ activated: boolean; reason?: "below_minimum" | "already_active" | "error" }> {
  if (proof.contactsImported < MIN_SWITCH_IMPORT) {
    return { activated: false, reason: "below_minimum" };
  }
  const expiresAt = new Date(Date.now() + SWITCH_PASS_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await db.from("switch_passes").insert({
    user_id: userId,
    tier: "starter",
    source_lane: proof.lane,
    platform: proof.platform,
    contacts_imported: proof.contactsImported,
    proof: proof.detail ?? {},
    expires_at: expiresAt,
  });
  if (!error) return { activated: true };
  if (error.code === "23505") return { activated: false, reason: "already_active" };
  console.error(`[switch-pass] activation failed: ${error.message}`);
  return { activated: false, reason: "error" };
}
