/**
 * MCP auth gate. v1 is open — mirrors `/api/b/[slug]` (no auth). The function
 * exists so adding bearer-token verification later is a single-function edit
 * with no route-handler refactor.
 *
 * To add auth later: read `request.headers.get("authorization")`, validate the
 * bearer token (against env, Supabase, etc.), and throw on failure. Callers
 * already wrap the call in `try/catch` for tool errors.
 */
export async function assertAuthorized(_request: Request): Promise<void> {
  // v1: open. Intentionally a no-op.
}
