/**
 * Pure email-input helpers shared by the subscribe + waitlist routes.
 * No I/O, no env — unit-testable in isolation.
 */

// Mirrors the regex used by app/api/waitlist/route.ts (keep them identical).
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trim + lowercase; non-strings collapse to "". */
export function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

/** RFC-lite shape check + 254-char cap (the SMTP address limit). */
export function isValidEmail(email: string): boolean {
  return email.length > 0 && email.length <= 254 && EMAIL_RE.test(email);
}

/**
 * A short provenance tag ("landing", "r-page", "r-page:housing-swfl").
 * Anything unexpected collapses to "unknown" so a caller can't write junk.
 */
export function sanitizeSource(raw: unknown): string {
  if (typeof raw !== "string") return "unknown";
  const s = raw.trim().slice(0, 64);
  return s.length > 0 && /^[a-z0-9:_-]+$/i.test(s) ? s : "unknown";
}
