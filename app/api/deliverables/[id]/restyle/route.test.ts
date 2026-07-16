import { test, expect, mock, beforeEach } from "bun:test";

interface Scenario {
  user: { id: string } | null;
  deliverable: Record<string, unknown> | null;
  updateError: unknown;
  lastUpdate: Record<string, unknown> | null;
}
const scenario: Scenario = {
  user: null,
  deliverable: null,
  updateError: null,
  lastUpdate: null,
};

mock.module("@/utils/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: scenario.user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: scenario.deliverable }),
        }),
      }),
    }),
  }),
}));
mock.module("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        scenario.lastUpdate = patch;
        return { eq: async () => ({ error: scenario.updateError }) };
      },
    }),
  }),
}));
mock.module("next/headers", () => ({ cookies: async () => ({}) }));

const { POST } = await import("./route");

const makeReq = (body: unknown) =>
  new Request("http://localhost/api/deliverables/d1/restyle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as import("next/server").NextRequest;
const params = Promise.resolve({ id: "d1" });

const baseDeliverable = { user_id: "user-a", template: "market-overview" };

beforeEach(() => {
  scenario.user = { id: "user-a" };
  scenario.deliverable = { ...baseDeliverable };
  scenario.updateError = null;
  scenario.lastUpdate = null;
});

test("unauthenticated → 401", async () => {
  scenario.user = null;
  expect((await POST(makeReq({ template: "one-pager" }), { params })).status).toBe(401);
});

test("invalid target template → 400", async () => {
  expect((await POST(makeReq({ template: "bogus" }), { params })).status).toBe(400);
});

test("block-canvas is not a restyle TARGET → 400", async () => {
  expect((await POST(makeReq({ template: "block-canvas" }), { params })).status).toBe(400);
});

test("not found → 404", async () => {
  scenario.deliverable = null;
  expect((await POST(makeReq({ template: "one-pager" }), { params })).status).toBe(404);
});

test("not owner → 403", async () => {
  scenario.deliverable = { ...baseDeliverable, user_id: "other" };
  expect((await POST(makeReq({ template: "one-pager" }), { params })).status).toBe(403);
});

test("report → report restyle swaps the template in place", async () => {
  const res = await POST(makeReq({ template: "one-pager" }), { params });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, template: "one-pager" });
  expect(scenario.lastUpdate).toEqual({ template: "one-pager" });
});

test("a block-canvas SOURCE is rejected → 400, never updated (in-place swap would strand its doc)", async () => {
  scenario.deliverable = { ...baseDeliverable, template: "block-canvas" };
  const res = await POST(makeReq({ template: "one-pager" }), { params });
  expect(res.status).toBe(400);
  expect(scenario.lastUpdate).toBeNull();
});

test("an email SOURCE is rejected → 400, never updated (scope-bound render path)", async () => {
  scenario.deliverable = { ...baseDeliverable, template: "email" };
  const res = await POST(makeReq({ template: "one-pager" }), { params });
  expect(res.status).toBe(400);
  expect(scenario.lastUpdate).toBeNull();
});
