// app/api/segments/preview/route.test.ts
import { describe, expect, it, mock } from "bun:test";

// Route calls `createClient(await cookies())`; `cookies()` from next/headers
// throws outside a request scope (bun test has none). Mock it to an inert value
// — mirrors app/api/segments/route.test.ts + app/api/contacts. The supabase
// `createClient` mock below ignores the arg anyway.
mock.module("next/headers", () => ({ cookies: async () => ({}) }));

describe("POST /api/segments/preview", () => {
  it("403s a paid-only filter for a free-tier caller", async () => {
    mock.module("@/utils/supabase/server", () => ({
      createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }),
    }));
    mock.module("@/utils/supabase/service-role", () => ({
      createServiceRoleClient: () => ({
        from: () => ({
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { tier: "free" } }) }) }),
        }),
      }),
    }));
    const { POST } = await import("./route");
    const body = { filter: { field: "engagement", op: "opened", deliverable_id: "d-1" } };
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));
    expect(res.status).toBe(403);
  });
});
