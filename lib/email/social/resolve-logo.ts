// lib/email/social/resolve-logo.ts
//
// Resolve a brand logo URL for a "custom" social platform from its domain.
// KEYLESS BY DESIGN: Google's favicon service — no account, no API key, no bill.
// We deliberately do NOT use a paid logo API (e.g. Logo.dev); a favicon, falling
// back to our own globe glyph (rendered by SocialIcon when nothing resolves), is
// plenty for the rarely-used "add your own" custom-platform path.
//
// PURE.

const SIZE = 64;

/** Best free logo URL for a domain — the keyless Google favicon service. */
export function logoUrlForDomain(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${SIZE}`;
}
