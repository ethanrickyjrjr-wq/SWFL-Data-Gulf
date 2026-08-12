// lib/email/brand/fetch-account-brand.ts
//
// THE ONE PLACE that decides "no brand" vs "couldn't check yet" for the account-brand
// prefill fetch (`/api/user/brand`). Before this, EmailLabGridShell.tsx treated a 401
// (genuinely signed out — correct) and a transient failure (500, timeout, network
// error — NOT the same thing) identically: both landed on `branding = {}` with no
// retry, so a signed-in agent with a saved brand profile could silently get an
// unbranded, house-identity build purely because ONE fetch hiccuped. Found live
// 08/11/2026 — operator: "HOW IS IT POSSIBLE WE BUILD DIFFERENT FROM THE SAME
// FUCKING PROFILE EVERY FUCKING TIME."
//
// `isConfirmedNoBrand` is the pure classifier: only an actual 401 means "this
// account has no saved brand." Everything else (5xx, a thrown network error) is
// "the check failed," which is retried once before falling back.

/** True only for a genuine "signed out / no brand" answer. Never true for a server
 *  error or any other non-2xx status — those are transient until proven otherwise. */
export function isConfirmedNoBrand(status: number): boolean {
  return status === 401;
}

export interface AccountBrandFetchResult {
  /** true only on a confirmed 200 with a parsed body. */
  ok: boolean;
  /** true only when the account is genuinely signed out (401) — never true after
   *  a retry-exhausted transient failure, so callers can tell the two apart if they
   *  ever need to (today neither branch blocks the build; RULE 0.7 — never refuse). */
  confirmedNoBrand: boolean;
  data: Record<string, unknown>;
}

/** Fetch `/api/user/brand`, retrying ONCE on anything that isn't a confirmed 401.
 *  A genuine 401 returns immediately — it is not an error, it is the honest answer
 *  for a signed-out visitor. Never throws (RULE 0.7 — a brand-load hiccup must never
 *  block a build); the caller's existing `.finally` still flips its loaded flag on
 *  every path, this only changes what "loaded" resolves TO. */
export async function fetchAccountBrand(
  fetchImpl: typeof fetch = fetch,
): Promise<AccountBrandFetchResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetchImpl("/api/user/brand");
      if (r.ok) {
        const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
        return { ok: true, confirmedNoBrand: false, data };
      }
      if (isConfirmedNoBrand(r.status)) {
        return { ok: false, confirmedNoBrand: true, data: {} };
      }
      // Non-401 failure (5xx, etc.) — fall through to retry once.
    } catch {
      // Thrown network error — fall through to retry once.
    }
  }
  return { ok: false, confirmedNoBrand: false, data: {} };
}
