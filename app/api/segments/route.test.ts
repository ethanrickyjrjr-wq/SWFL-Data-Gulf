// app/api/segments/route.test.ts
import { describe, expect, it, mock } from "bun:test";

// Route.authed() calls `createClient(await cookies())`; `cookies()` from
// next/headers throws outside a request scope (bun test has none). Mock it to
// an inert value — mirrors app/api/contacts/route.test.ts + app/api/me. The
// supabase `createClient` mock below ignores the arg anyway.
mock.module("next/headers", () => ({ cookies: async () => ({}) }));

function mockSupabase(user: { id: string } | null, insertResult: unknown) {
  mock.module("@/utils/supabase/server", () => ({
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user } }) },
      from: (_table: string) => ({
        select: () => ({ order: async () => ({ data: [], error: null }) }),
        insert: () => ({
          select: () => ({ single: async () => ({ data: insertResult, error: null }) }),
        }),
      }),
    }),
  }));
}

describe("POST /api/segments", () => {
  it("401s when signed out", async () => {
    mockSupabase(null, null);
    mock.module("@/utils/supabase/service-role", () => ({ createServiceRoleClient: () => ({}) }));
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ name: "n", filter: {} }) }),
    );
    expect(res.status).toBe(401);
  });

  it("403s a paid-only filter for a free-tier caller", async () => {
    mockSupabase({ id: "u1" }, { id: "s1" });
    mock.module("@/utils/supabase/service-role", () => ({
      createServiceRoleClient: () => ({
        from: () => ({
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { tier: "free" } }) }) }),
        }),
      }),
    }));
    const { POST } = await import("./route");
    const body = {
      name: "VIPs",
      filter: { field: "attribs", key: "city", op: "eq", value: "Naples" },
    };
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));
    expect(res.status).toBe(403);
  });

  it("201s and saves a tag-only filter for a free-tier caller", async () => {
    mockSupabase(
      { id: "u1" },
      { id: "s1", name: "Buyers", filter: { field: "tags", op: "has", value: "buyer" } },
    );
    mock.module("@/utils/supabase/service-role", () => ({
      createServiceRoleClient: () => ({
        from: () => ({
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { tier: "free" } }) }) }),
        }),
      }),
    }));
    const { POST } = await import("./route");
    const body = { name: "Buyers", filter: { field: "tags", op: "has", value: "buyer" } };
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));
    expect(res.status).toBe(201);
  });
});
