import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveUserBrand } from "@/lib/email/templates/resolve-brand";
import { PROJECT_CARRY_KEYS, isBlank } from "@/lib/brand/profile-ledger";

/**
 * A brand profile row, as far as this module is concerned: an open bag keyed by
 * column name. It used to be a hand-written 11-key type sitting beside a
 * hand-written 11-key select and a hand-written 14-key object literal — three
 * copies of one list, against a table with 38 field columns. The registry is
 * the one authority now; this type deliberately does not restate it.
 */
type BrandProfileRow = Record<string, unknown>;

async function defaultAgentLookup(
  supabase: SupabaseClient,
  userId: string,
): Promise<BrandProfileRow | null> {
  const { data } = await supabase
    .from("user_brand_profiles")
    .select(PROJECT_CARRY_KEYS.join(", "))
    .eq("user_id", userId)
    .maybeSingle();
  return (data as BrandProfileRow | null) ?? null;
}

/**
 * Copy the user's saved brand profile onto a freshly-created project so it starts
 * branded — REGARDLESS of creation path (direct create, draft import, MCP claim).
 *
 * Writes both theme fields (primary_color, accent_color, logo_url from user_brand_profiles
 * via resolveUserBrand) AND every agent identity field BrandingBlock.tsx edits
 * (agent_name, nickname, agent_title, photo_url, license, brokerage, agent_bio,
 * contact_email, contact_phone, website_url, business_address). Previously only the
 * first 4 identity fields copied — bio/website/contact/address were saved at the
 * account level (app/api/user/brand/route.ts) but silently never reached a new
 * project's actual emails (found 2026-07-15 auditing "does profile info stick").
 * The agentLookup param is injectable for tests.
 *
 * Best-effort + never throws — branding is a presentation nicety, never a gate on
 * project birth.
 */
export async function applyUserBrandToProject(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  resolve: typeof resolveUserBrand = resolveUserBrand,
  agentLookup: (
    supabase: SupabaseClient,
    userId: string,
  ) => Promise<BrandProfileRow | null> = defaultAgentLookup,
): Promise<void> {
  try {
    const brand = await resolve(supabase, userId).catch(() => null);
    const agent = await agentLookup(supabase, userId).catch(() => null);

    const branding: Record<string, string> = {};

    // Every carry-flagged field, straight off the registry. A key the profile
    // holds blank is SKIPPED rather than written as "" — an empty string in a
    // project's branding blob reads downstream as "the agent chose blank",
    // which is not the same thing as "never filled in".
    for (const key of PROJECT_CARRY_KEYS) {
      const v = agent?.[key];
      if (!isBlank(v)) branding[key] = (v as string).trim();
    }

    // resolveUserBrand stays authoritative for the three theme keys — it is the
    // established root and carries the project-level precedence rules that a
    // raw profile read does not.
    if (brand?.primary) branding.primary_color = brand.primary;
    if (brand?.accent) branding.accent_color = brand.accent;
    if (brand?.logoUrl) branding.logo_url = brand.logoUrl;

    if (Object.keys(branding).length === 0) return;

    await supabase.from("projects").update({ branding }).eq("id", projectId);
  } catch {
    /* best-effort — a brand-copy failure must never fail project creation */
  }
}

/**
 * A funnel prospect's brand carried in the claim token (arrival-URL shape).
 * Structural so this module doesn't couple to claim-store's `ClaimBrand`.
 */
type CarriedBrand = {
  primary?: string;
  secondary?: string;
  logo_url?: string;
};

/**
 * Save a funnel prospect's carried brand onto their ACCOUNT brand profile
 * (`user_brand_profiles`) at claim/signup, creating the row if absent.
 *
 * This is what makes their colors + logo carry to EVERY future project: the claim
 * route's `brandToBranding` only stamps the first claimed project, while
 * `applyUserBrandToProject` (direct create / import) reads THIS profile. Without
 * this persist, a prospect's second project would land unbranded.
 *
 * Never clobbers a brand the user already chose — if a profile already carries any
 * color/logo, we leave it untouched (first brand wins). Best-effort + never throws:
 * a profile write must never fail the claim (branding is a nicety, not a gate on
 * account birth). Mirrors the PATCH /api/user/brand upsert shape (onConflict user_id).
 */
export async function persistClaimBrandToProfile(
  supabase: SupabaseClient,
  userId: string,
  brand: CarriedBrand | null | undefined,
): Promise<void> {
  if (!brand) return;
  const colors: Record<string, string> = {};
  if (brand.primary) colors.primary_color = brand.primary;
  if (brand.secondary) colors.accent_color = brand.secondary;
  if (brand.logo_url) colors.logo_url = brand.logo_url;
  if (Object.keys(colors).length === 0) return;

  try {
    const { data: existing } = await supabase
      .from("user_brand_profiles")
      .select("primary_color, accent_color, logo_url")
      .eq("user_id", userId)
      .maybeSingle();

    // Respect a brand the user already set — only create/fill an empty profile.
    if (existing && (existing.primary_color || existing.accent_color || existing.logo_url)) {
      return;
    }

    await supabase
      .from("user_brand_profiles")
      .upsert(
        { user_id: userId, ...colors, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
  } catch {
    /* best-effort — profile creation must never fail the claim */
  }
}
