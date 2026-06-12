import type { SupabaseClient } from "@supabase/supabase-js";
import { extractBrandTheme } from "@/lib/deliverable/brand-theme";
import type { BrandTheme } from "@/lib/deliverable/brand-theme";

export async function resolveUserBrand(
  supabase: SupabaseClient,
  userId: string,
  projectId?: string,
): Promise<BrandTheme | null> {
  // 1. Project-level — most specific active context
  if (projectId) {
    const { data: project } = await supabase
      .from("projects")
      .select("branding")
      .eq("id", projectId)
      .eq("user_id", userId)
      .single();
    const brand = extractBrandTheme(project?.branding ?? null);
    if (brand) return brand;
  }

  // 2. User-level account default
  const { data: profile } = await supabase
    .from("user_brand_profiles")
    .select("primary_color, accent_color, logo_url")
    .eq("user_id", userId)
    .single();

  if (profile?.primary_color || profile?.accent_color || profile?.logo_url) {
    return {
      primary: profile.primary_color ?? null,
      accent: profile.accent_color ?? null,
      logoUrl: profile.logo_url ?? null,
    };
  }

  // 3. No brand on file — caller must prompt user to set one.
  // NEVER fall back to SWFL_THEME for an authenticated user.
  return null;
}
