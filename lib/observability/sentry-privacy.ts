/**
 * The scrub contract — the ONE authority for what user data NEVER leaves this
 * app for Sentry. Imported unchanged by all three Sentry runtime configs
 * (browser / node / edge) so the three can never drift apart and silently
 * re-open a PII leak.
 *
 * WHY THIS EXISTS (verified live against Sentry docs 2026-07-21):
 * `@sentry/nextjs` v10.67.0's `dataCollection` option has PERMISSIVE defaults —
 * the SDK otherwise auto-collects user identity, request/response BODIES, cookies,
 * URL query params, GenAI prompt/response content, DB query values, and stack-frame
 * local variables. Critically, passing a PARTIAL `dataCollection` (e.g. the starter
 * snippet's empty `{}`) opts INTO those permissive defaults for every category you
 * don't name. This product handles contact lists, client uploads, an authenticated
 * Supabase session cookie, a fictional-but-PII-shaped demo account, and Anthropic
 * calls — none of that may be shipped to a third party. So EVERY sensitive category
 * is disabled EXPLICITLY below; nothing is left to a default.
 *
 * `sendDefaultPii` is intentionally NOT set: it is deprecated (removed in v11) and,
 * when `dataCollection` is present, `dataCollection` takes precedence anyway.
 */
export const SENTRY_DATA_COLLECTION = {
  userInfo: false, // no user.id / email / username / ip_address
  cookies: false, // no cookies (incl. the Supabase auth session cookie + sdg_cid)
  httpHeaders: { request: false, response: false }, // no request/response headers
  httpBodies: [], // no request/response bodies (contact lists, uploads) — THE key control
  urlQueryParams: false, // no URL query params (may carry emails / ids)
  genAI: { inputs: false, outputs: false }, // no Anthropic prompt/response content
  databaseQueryData: false, // no DB query params / inline literals / bodies / result rows
  stackFrameVariables: false, // no local variable values (may hold PII / secrets)
};
