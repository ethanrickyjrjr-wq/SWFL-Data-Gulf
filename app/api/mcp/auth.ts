/**
 * MCP auth gate.
 *
 * - MCP_BEARER_TOKEN not set → open (v1 backward-compatible mode) → returns null.
 * - MCP_BEARER_TOKEN set     → require `Authorization: Bearer <token>` to match.
 *   Returns a 401 `Response` that the caller MUST return. Never throws.
 *
 * WHY NOT THROW: this used to `throw new Response(...)`, on the belief that
 * "Next.js App Router returns a thrown Response directly to the caller." It does
 * not — that is the Remix / React Router idiom. Next route handlers *return* a
 * Response (nextjs.org/docs/app/api-reference/file-conventions/route); a thrown
 * non-Error is an unhandled exception, which Next answers with a bare 500 and an
 * empty body. Once MCP_BEARER_TOKEN was actually set in Vercel, every
 * POST /api/mcp — including a well-formed one carrying a wrong token — returned
 * 500 instead of 401 and the MCP surface went dark. The unit tests stayed green
 * throughout, because they asserted the *throw* instead of the status a client
 * actually receives.
 */

const DENY_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id",
};

/**
 * @returns a 401 `Response` when the request is not authorized — the caller
 *          returns it verbatim — or `null` when the request may proceed.
 */
export async function unauthorizedResponse(request: Request): Promise<Response | null> {
  const expected = process.env.MCP_BEARER_TOKEN;
  if (!expected) return null;

  const auth = request.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (provided !== expected) {
    return new Response("Unauthorized", { status: 401, headers: DENY_HEADERS });
  }
  return null;
}
