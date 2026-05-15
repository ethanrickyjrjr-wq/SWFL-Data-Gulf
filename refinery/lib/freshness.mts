/**
 * Freshness guard — the anti-stale-cache anchor for the SWFL Intelligence Lake.
 *
 * Every brain payload carries the same token in two places: a leading
 * `<!-- FRESHNESS ... -->` HTML comment (human-/curl-readable) and a
 * `freshness_token` frontmatter field (survives WebFetch's HTML→markdown
 * stripping, so an agent can always quote it). This module is the single
 * source of truth for building and parsing that token.
 */

/** Fixed SWFL-lake identifier. Stable across every brain in the lake. */
export const LAKE_ID = "7421";

/**
 * Build the freshness token: `SWFL-7421-v{version}-{YYYYMMDD}`.
 * The date segment is the calendar day of `refinedAt` (a refined_at ISO
 * timestamp), so the token changes on every refine.
 */
export function freshnessToken(version: number, refinedAt: string): string {
  const yyyymmdd = refinedAt.slice(0, 10).replace(/-/g, "");
  return `SWFL-${LAKE_ID}-v${version}-${yyyymmdd}`;
}

/** Build the leading HTML comment that wraps the token. */
export function freshnessComment(version: number, token: string): string {
  return `<!-- FRESHNESS: v${version} | Token: ${token} -->`;
}

const COMMENT_RE = /^<!--\s*FRESHNESS:\s*v(\d+)\s*\|\s*Token:\s*(\S+)\s*-->$/;

/**
 * Parse a `<!-- FRESHNESS: v{n} | Token: {token} -->` line.
 * Returns `null` for anything that is not a well-formed freshness comment.
 */
export function parseFreshnessComment(
  line: string,
): { version: number; token: string } | null {
  const m = line.trim().match(COMMENT_RE);
  if (!m) return null;
  return { version: parseInt(m[1], 10), token: m[2] };
}
