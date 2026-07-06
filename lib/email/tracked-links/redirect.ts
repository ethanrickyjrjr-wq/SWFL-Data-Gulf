/**
 * Pure decision core for the `/api/r/<token>` redirect route.
 *
 * Given a token, decide WHERE to send the recipient and WHAT (if anything) to log —
 * with zero I/O and zero database read (design decision 3). The route adapter turns
 * this into a 302 and a fire-and-forget `clicked` insert.
 *
 * Fail-closed: a tampered / malformed / expired-secret token resolves to the site
 * homepage with nothing to log. An old or corrupted link must never dead-end a
 * recipient on a 400/404 (Error handling).
 */
import { verifyLinkToken, type LinkContext } from "./token";

export interface TrackedRedirect {
  /** Absolute URL to 302 to — the decoded destination, or the safe-fallback homepage. */
  location: string;
  /** The click to record, or null when the token didn't verify (log nothing). */
  log: { dest: string; ctx: LinkContext } | null;
}

export function resolveTrackedRedirect(
  token: string,
  opts: { siteOrigin: string },
): TrackedRedirect {
  const v = verifyLinkToken(token);
  if (!v.ok) return { location: opts.siteOrigin, log: null };
  return { location: v.dest, log: { dest: v.dest, ctx: v.ctx } };
}
