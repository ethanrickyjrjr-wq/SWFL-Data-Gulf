// lib/auth/social-login.ts
//
// Social login provider registry + gating (spec 2026-07-16-brand-fill-once §E).
//
// WHY ITS OWN GATE (not socialOauthConfigured): the "connect your socials for
// POSTING" flow gates on OUR client id/secret (lib/social/connect/oauth-config.ts)
// because we hold those credentials. LOGIN providers are configured in the
// Supabase dashboard — we never hold their secrets — so a client component can't
// know a provider is ready by looking at process.env for a secret. Instead a
// single PUBLIC flag lists which login providers are turned on:
//
//   NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS="google,linkedin_oidc"
//
// A provider absent from the list renders no button. Unset/empty = email-code
// only (today's behavior, byte-for-byte). Flipping a provider on here is step 3
// of going live — it does nothing until that provider is also enabled in the
// Supabase dashboard with /auth/callback on the redirect allow-list.
//
// Provider slugs are VENDOR-EXACT and re-verified live in-session (2026-07-18)
// against supabase.com/docs/guides/auth/social-login: google, facebook, apple,
// and linkedin_oidc (the bare `linkedin` slug is retired — do not use it).
//
// Client-safe: pure data + a pure parser, no fs / no server imports.

export type LoginProviderSlug = "google" | "facebook" | "linkedin_oidc" | "apple";

export interface LoginProvider {
  /** The exact string passed to supabase.auth.signInWithOAuth({ provider }). */
  slug: LoginProviderSlug;
  /** Button label tail — the button reads "Continue with {label}". */
  label: string;
}

/** Known login providers in the order we prefer to show them. The label is the
 *  brand name; the button composes "Continue with {label}". */
const KNOWN_PROVIDERS: Record<LoginProviderSlug, { label: string }> = {
  google: { label: "Google" },
  linkedin_oidc: { label: "LinkedIn" },
  facebook: { label: "Facebook" },
  apple: { label: "Apple" },
};

const KNOWN_SLUGS = new Set<string>(Object.keys(KNOWN_PROVIDERS));

/**
 * Parse the public gate flag into the enabled provider list. Preserves the
 * order the operator wrote (Google first if they list Google first), drops
 * unknown slugs (never invents a provider), and de-dupes. Unset/blank → [].
 */
export function parseLoginProviders(raw: string | undefined | null): LoginProvider[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: LoginProvider[] = [];
  for (const token of raw.split(",")) {
    const slug = token.trim().toLowerCase();
    if (!slug || seen.has(slug) || !KNOWN_SLUGS.has(slug)) continue;
    seen.add(slug);
    out.push({
      slug: slug as LoginProviderSlug,
      label: KNOWN_PROVIDERS[slug as LoginProviderSlug].label,
    });
  }
  return out;
}

/**
 * The enabled login providers for THIS build. `process.env.NEXT_PUBLIC_*` is
 * inlined at build time, so this constant is fixed per deploy — set the env in
 * Vercel and redeploy to change which buttons appear.
 */
export const ENABLED_LOGIN_PROVIDERS: LoginProvider[] = parseLoginProviders(
  process.env.NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS,
);
