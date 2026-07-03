import { test, expect, mock, beforeEach } from "bun:test";

// PostgREST builders are chainable AND awaitable (thenable → { count }). This mock
// returns a per-table count so we can drive the three existence checks:
// user_mcp_tokens (account path), projects (per-project path), usage_events (built).
const scenario = { tokenCount: 0, projectCount: 0, mcpEventCount: 0 };

function builder(getResult: () => { count: number }) {
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.eq = () => b;
  b.not = () => b;
  b.then = (resolve: (v: { count: number }) => unknown) => resolve(getResult());
  return b;
}

// Provide BOTH exports the real module has. `mock.module` is process-global in
// bun, so an incomplete mock here bleeds into sibling test files run in the same
// process (one importing `createServiceRoleClientUntyped` would hit an "export
// not found"). Mirror the full surface so the combined suite is deterministic.
const fakeClient = () => ({
  from: (table: string) =>
    builder(() => {
      if (table === "user_mcp_tokens") return { count: scenario.tokenCount };
      if (table === "projects") return { count: scenario.projectCount };
      return { count: scenario.mcpEventCount };
    }),
});

mock.module("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: fakeClient,
  createServiceRoleClientUntyped: fakeClient,
}));

const { isMcpConnected } = await import("./mcp-connected");

beforeEach(() => {
  scenario.tokenCount = 0;
  scenario.projectCount = 0;
  scenario.mcpEventCount = 0;
});

test("account-level token + mcp:<uid> usage row → true (no keyed project needed)", async () => {
  scenario.tokenCount = 1;
  scenario.projectCount = 0;
  scenario.mcpEventCount = 3;
  expect(await isMcpConnected("uid-1")).toBe(true);
});

test("per-project mcp_key + mcp:<uid> usage row → true (account token absent)", async () => {
  scenario.tokenCount = 0;
  scenario.projectCount = 1;
  scenario.mcpEventCount = 3;
  expect(await isMcpConnected("uid-1")).toBe(true);
});

test("web-only account (no token, no keyed project) → false", async () => {
  scenario.tokenCount = 0;
  scenario.projectCount = 0;
  scenario.mcpEventCount = 0;
  expect(await isMcpConnected("uid-1")).toBe(false);
});

test("wired (account token) but never built → false", async () => {
  scenario.tokenCount = 1;
  scenario.projectCount = 0;
  scenario.mcpEventCount = 0;
  expect(await isMcpConnected("uid-1")).toBe(false);
});

test("wired (per-project key) but never built → false", async () => {
  scenario.tokenCount = 0;
  scenario.projectCount = 1;
  scenario.mcpEventCount = 0;
  expect(await isMcpConnected("uid-1")).toBe(false);
});

test("empty authUid → false (no lookup)", async () => {
  expect(await isMcpConnected("")).toBe(false);
});
