// lib/auth/post-login-route.ts
//
// The ONE post-verify routing decision (spec 2026-08-10-auth-create-account §D2).
// Keys on PROFILE STATE, never on which door (Sign in / Create account) the user
// clicked — an existing user through the "Create" door signs in and goes to `next`;
// a brand-new user through the "Sign in" door still gets the Brand welcome.
//
// Pure string ops, client-safe. Callers fetch the profile themselves and pass
// "unknown" on any fetch failure — unknown NEVER strands the user on the modal
// and NEVER guesses "new"; it falls through to the normal destination.

import { isSafeReturnPath } from "@/lib/safe-return";

export const BRAND_WELCOME_PATH = "/account/brand?welcome=1";

/**
 * Has this account saved ANY brand value yet? Runs on the flat GET /api/user/brand
 * payload. A `user_brand_profiles` row only exists after a save, and the GET
 * returns only user-set columns — so any non-empty string outside the two
 * synthetic keys means "started". Empty object (no row) = first login.
 */
export function brandProfileStarted(payload: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(payload)) {
    if (key === "account_email" || key === "color_palettes" || key === "error") continue;
    if (typeof value === "string" && value.trim() !== "") return true;
  }
  return false;
}

export function postLoginDestination({
  stayInPlace,
  profileStarted,
  next,
}: {
  /** onSignedIn-style callers keep the page; navigation is theirs alone. */
  stayInPlace: boolean;
  /** false = no brand value saved yet (first login); "unknown" = fetch failed. */
  profileStarted: boolean | "unknown";
  next: string;
}): string | null {
  if (stayInPlace) return null;
  if (profileStarted === false) return BRAND_WELCOME_PATH;
  return isSafeReturnPath(next) ? next : "/";
}
