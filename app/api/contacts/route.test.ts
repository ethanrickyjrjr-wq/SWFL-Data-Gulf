import { describe, expect, it, mock } from "bun:test";

// Route.authed() calls `createClient(await cookies())`; `cookies()` from
// next/headers throws outside a request scope (bun test has none). Mock it to
// an inert value — mirrors app/api/me/route.test.ts. The supabase `createClient`
// mock below ignores the arg anyway.
mock.module("next/headers", () => ({ cookies: async () => ({}) }));

describe("GET /api/contacts", () => {
  it("returns { contacts, tier } instead of a bare array", async () => {
    mock.module("@/utils/supabase/server", () => ({
      createClient: () => ({
        auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
        from: () => ({
          select: () => ({
            order: () => Promise.resolve({ data: [{ id: "c1" }], error: null }),
          }),
        }),
      }),
    }));
    mock.module("@/utils/supabase/service-role", () => ({
      createServiceRoleClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { tier: "growth" }, error: null }) }),
          }),
        }),
      }),
    }));
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ contacts: [{ id: "c1" }], tier: "paid" });
  });
});
