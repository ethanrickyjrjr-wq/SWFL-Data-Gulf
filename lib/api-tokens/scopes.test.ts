// lib/api-tokens/scopes.test.ts
// Guards the agent-driver token gate: missing/malformed bearer -> 401; wrong
// scope OR null scope (legacy token) -> 403 (fail closed -- a legacy token
// satisfies NO agent scope); exact scope match -> { userId }.
//
// F2 fix (hermes-email-driver final review, was HIGH -- CI red). The old mock.module
// factory for "@/lib/api-tokens/token" exported ONLY resolveTokenUserWithScope --
// bun:test's mock.module replaces a module in the GLOBAL registry for the whole test
// process, not just this file, so any OTHER test file that runs in the same process and
// imports "@/lib/api-tokens/token" for its OTHER exports (token.test.ts needs
// resolveTokenUser/mintToken/hashToken) hit "Export named 'resolveTokenUser' not found".
// Fix: import the REAL module and spread its ACTUAL exports into the mock factory,
// overriding only the one function this suite needs to control. Every other export stays
// the real implementation, so a shared-process run never breaks a sibling file that never
// asked to be mocked. Proof: bun test lib/api-tokens (both files, together) -- see
// token.test.ts, unchanged, now green in the same invocation.
import { describe, expect, test, mock } from "bun:test";
import * as realToken from "@/lib/api-tokens/token";

let fakeRow: { userId: string; scope: string | null } | null = null;

mock.module("@/lib/api-tokens/token", () => ({
  ...realToken,
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
