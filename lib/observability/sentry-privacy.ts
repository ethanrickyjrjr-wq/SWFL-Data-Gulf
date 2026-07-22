/**
 * The scrub contract — the ONE authority for what user data NEVER leaves this
 * app for Sentry. Imported unchanged by all three Sentry runtime configs
 * (browser / node / edge) so the three can never drift apart and silently
 * re-open a PII leak.
 *
 * WHY THIS EXISTS (verified live against Sentry docs 2026-07-21):
 * `@sentry/nextjs` v10.67.0's `dataCollection` option has PERMISSIVE defaults —
 * the SDK otherwise auto-collects user identity, request/response BODIES, cookies,
 * URL query params, GenAI prompt/response content, GraphQL documents/variables, and
 * stack-frame local variables + source context. Critically, passing a PARTIAL
 * `dataCollection` (e.g. the starter snippet's empty `{}`) opts INTO those permissive
 * defaults for every category you don't name. This product handles contact lists,
 * client uploads, an authenticated Supabase session cookie, a fictional-but-PII-shaped
 * demo account, and Anthropic calls — none of that may be shipped to a third party. So
 * EVERY real `dataCollection` key is set explicitly below (verified against the
 * installed SDK's own type declarations, not just the docs — the full key set is
 * userInfo/cookies/httpHeaders/httpBodies/urlQueryParams/genAI/graphQL/
 * stackFrameVariables/frameContextLines; there is no `databaseQueryData` key in this
 * SDK version, a prior version of this file set one that silently did nothing).
 *
 * `sendDefaultPii` is intentionally NOT set: it is deprecated (removed in v11) and,
 * when `dataCollection` is present, `dataCollection` takes precedence anyway.
 *
 * Categories `dataCollection` structurally CANNOT reach (post-build review finding,
 * fixed alongside this file): console breadcrumbs. Every Sentry init in this repo also
 * disables them — instrumentation-client.ts (browser) via
 * `Sentry.breadcrumbsIntegration({ console: false })` (that integration is browser-only,
 * verified live via crawl4ai against Sentry's own docs); sentry.server.config.ts and
 * sentry.edge.config.ts (Node/edge, whose default `Console` integration has no such
 * option) by filtering it out of `defaultIntegrations` instead. This app has live routes
 * (weekly-read/subscribe, insiders/subscribe) that `console.error` a raw Postgres error
 * object on a subscriber-email upsert path, and an unfiltered console integration would
 * ride that along as a breadcrumb on any later Sentry event in the same request.
 */
export const SENTRY_DATA_COLLECTION = {
  userInfo: false, // no user.id / email / username / ip_address
  cookies: false, // no cookies (incl. the Supabase auth session cookie + sdg_cid)
  httpHeaders: { request: false, response: false }, // no request/response headers
  httpBodies: [], // no request/response bodies (contact lists, uploads) — THE key control
  urlQueryParams: false, // no URL query params (may carry emails / ids)
  genAI: { inputs: false, outputs: false }, // no Anthropic prompt/response content
  graphQL: { document: false, variables: false }, // no GraphQL query text/variables (inert today — no GraphQL integration is registered — but the default is permissive, so set explicitly)
  stackFrameVariables: false, // no local variable values (may hold PII / secrets)
  frameContextLines: 0, // no surrounding source-code lines per stack frame
};
