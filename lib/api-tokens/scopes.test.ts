// lib/api-tokens/scopes.test.ts
// Guards the agent-driver token gate: missing/malformed bearer -> 401; wrong
// scope OR null scope (legacy token) -> 403 (fail closed -- a legacy token
// satisfies NO agent scope); exact scope match -> { userId }.
import { describe, expect, test, mock } from "bun:test";

let fakeRow: { userId: string; scope: string | null } | null = null;

mock.module("@/lib/api-tokens/token", () => ({
  resolveTokenUserWithScope: async () => fakeRow,
}));
mock.module("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => ({}),
}));

const { requireScope } = await import("./scopes");

function req(header?: string): Request {
  return new Request("http://localhost/x", {
    headers: header ? { authorization: header } : {},
  });
}

describe("requireScope", () => {
  test("no/malformed bearer token -> 401", async () => {
    fakeRow = null;
    const res = await requireScope(req(), "agent_feed_read");
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(401);
  });

  test("wrong scope -> 403", async () => {
    fakeRow = { userId: "user-1", scope: "agent_build" };
    const res = await requireScope(req("Bearer sdg_x"), "agent_feed_read");
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(403);
  });

  test("null scope (legacy token) -> 403, fails closed", async () => {
    fakeRow = { userId: "user-1", scope: null };
    const res = await requireScope(req("Bearer sdg_x"), "agent_feed_read");
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(403);
  });

  test("matching scope -> { userId }", async () => {
    fakeRow = { userId: "user-1", scope: "agent_feed_read" };
    const result = await requireScope(req("Bearer sdg_x"), "agent_feed_read");
    expect(result).toEqual({ userId: "user-1" });
  });
});
