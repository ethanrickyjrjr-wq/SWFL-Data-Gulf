// app/api/agent-feed/test-inject/route.test.ts
// Guards Task 4 (hermes-email-driver spec 2026-08-10): the load-bearing demo-account scoping
// guard (spec failure modes 3/7b -- a fake event must never reach a real account), strict
// schema rejection of any extra/unknown field (FM4 -- Hermes can never smuggle free text
// through this seam), and wrong-scope passthrough (401/403 stay the auth layer's problem, not
// the route's). Mirrors the mock.module style of app/api/agent-feed/transitions/route.test.ts
// (data-access module mocked wholesale) combined with lib/api-tokens/scopes.test.ts's
// auth-result mock. The Supabase client itself lives inside
// lib/agent-feed/test-inject-source.ts (mocked wholesale below), so this test never touches
// @/utils/supabase/service-role.
import { describe, expect, test, mock } from "bun:test";

let scopeResult: { userId: string } | Response = { userId: "hermes-1" };
let demoScoped = true;
let insertedId: number | null = 202;
let insertedRow: unknown = null;

mock.module("@/lib/api-tokens/scopes", () => ({
  requireScope: async () => scopeResult,
}));
mock.module("@/lib/agent-feed/test-inject-source", () => ({
  isDemoScopedAddress: async () => demoScoped,
  insertTestEvent: async (row: unknown) => {
    insertedRow = row;
    return insertedId;
  },
  normalizedAddressKey: (address: string) => `KEY:${address}`,
}));

const { POST } = await import("./route");

function req(body: unknown): Request {
  return new Request("http://localhost/api/agent-feed/test-inject", {
    method: "POST",
    headers: { authorization: "Bearer sdg_x", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/agent-feed/test-inject", () => {
  test("wrong-scope token (feed-read) -> 403 passthrough from requireScope", async () => {
    scopeResult = new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
    const res = await POST(req({ address: "1 A St, Fort Myers, FL 33901", to_state: "pending" }));
    expect(res.status).toBe(403);
    scopeResult = { userId: "hermes-1" };
  });

  test("real-account address (not in demo projects) -> 403, never inserts", async () => {
    demoScoped = false;
    insertedRow = null;
    const res = await POST(req({ address: "1 A St, Fort Myers, FL 33901", to_state: "pending" }));
    expect(res.status).toBe(403);
    expect(insertedRow).toBeNull();
    demoScoped = true;
  });

  test("demo address -> 201 {id}, insert called with created_by=userId + computed address_key", async () => {
    insertedRow = null;
    insertedId = 202;
    const res = await POST(
      req({
        address: "123 Demo Ln, Fort Myers, FL 33901",
        sale_or_rent: "sale",
        from_state: "active",
        to_state: "pending",
        price_delta: -5000,
      }),
    );
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body).toEqual({ id: 202 });
    expect(insertedRow).toMatchObject({
      address: "123 Demo Ln, Fort Myers, FL 33901",
      address_key: "KEY:123 Demo Ln, Fort Myers, FL 33901",
      sale_or_rent: "sale",
      from_state: "active",
      to_state: "pending",
      price_delta: -5000,
      created_by: "hermes-1",
    });
  });

  test("extra field prose:'hi' -> 400, never inserts", async () => {
    insertedRow = null;
    const res = await POST(
      req({ address: "123 Demo Ln, Fort Myers, FL 33901", to_state: "pending", prose: "hi" }),
    );
    expect(res.status).toBe(400);
    expect(insertedRow).toBeNull();
  });

  test("missing to_state -> 400, never inserts", async () => {
    insertedRow = null;
    const res = await POST(req({ address: "123 Demo Ln, Fort Myers, FL 33901" }));
    expect(res.status).toBe(400);
    expect(insertedRow).toBeNull();
  });

  test("missing address -> 400", async () => {
    const res = await POST(req({ to_state: "pending" }));
    expect(res.status).toBe(400);
  });
});
