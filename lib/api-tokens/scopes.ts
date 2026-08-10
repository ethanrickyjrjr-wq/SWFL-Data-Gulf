// lib/api-tokens/scopes.ts
// Scope-aware token gate for the agent-driver surface (Task 2, agent-driver
// build). A raw bearer token now carries an optional `scope`
// (migrations/20260810_agent_driver.sql). requireScope resolves the token
// and enforces an EXACT scope match — legacy tokens (scope IS NULL, minted
// before this column existed) fail closed: NULL satisfies no agent scope,
// even though those same tokens still work fine on the pre-existing
// resolveTokenUser() door (contacts/listings import, etc).
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { resolveTokenUserWithScope } from "./token";

export type AgentScope = "agent_feed_read" | "agent_build" | "agent_test_inject";

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function requireScope(
  req: Request,
  scope: AgentScope,
): Promise<{ userId: string } | Response> {
  const admin = createServiceRoleClient();
  const row = await resolveTokenUserWithScope(admin, req.headers.get("authorization"));
  if (!row) return jsonError(401, "unauthorized");
  if (row.scope !== scope) return jsonError(403, "forbidden");
  return { userId: row.userId };
}
