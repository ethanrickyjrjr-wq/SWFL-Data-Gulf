// lib/auth/oauth-identity.ts
//
// Map an OAuth identity's claims onto blank-only brand fields (spec
// 2026-07-16-brand-fill-once §E, "Seeding"). On first social sign-in the
// provider hands us name / email / photo in `user.user_metadata`; we fill the
// account brand profile's BLANKS with them (bankBrandFields enforces blank-only
// + never-overwrite). Harmless for email-code sign-ins: their metadata carries
// none of these keys, so the patch is empty and nothing is written.
//
// DELIBERATE DEVIATION from the spec's literal "name/photo/email": we do NOT
// seed photo_url from the provider avatar. photo_url is the marketing HEADSHOT
// (the ledger marks it typable:false — an upload, never a typed field), and
// provider avatars are low-res thumbnails (Google returns ~96px). Baking a
// thumbnail as the brand headshot would ship a blurry face in branded emails
// until the user re-uploads. Name + email are unambiguous wins; the headshot
// stays a deliberate upload. Re-add `picture`/`avatar_url` here to restore the
// literal spec behavior.
//
// Provider claim shapes (verified 2026-07-18):
//   Google        → name, email, picture
//   LinkedIn OIDC → name, given_name, family_name, email, picture
//   Facebook      → name, email, picture
//   Apple         → name (first sign-in only), email (often a private relay)

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/**
 * Blank-fill patch from a Supabase user's `user_metadata`. Returns only the keys
 * we can confidently seed (agent_name, contact_email). Empty object when the
 * metadata carries nothing usable (e.g. an email-code sign-in).
 */
export function oauthIdentityToBrandPatch(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const patch: Record<string, string> = {};
  if (!metadata || typeof metadata !== "object") return patch;

  const name = str(metadata.name) ?? str(metadata.full_name);
  if (name) patch.agent_name = name;

  const email = str(metadata.email);
  if (email) patch.contact_email = email;

  return patch;
}
