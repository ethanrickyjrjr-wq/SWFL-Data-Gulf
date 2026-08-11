// app/api/segments/route.test.ts
import { afterAll, describe, expect, it, mock } from "bun:test";

// Route.authed() calls `createClient(await cookies())`; `cookies()` from
// next/headers throws outside a request scope (bun test has none). Mock it to
// an inert value — mirrors app/api/contacts/route.test.ts + app/api/me. The
// supabase `createClient` mock below ignores the arg anyway.
mock.module("next/headers", () => ({ cookies: async () => ({}) }));

// Declared here for the same reason as app/api/segments/preview/route.test.ts:
// bun's `mock.module` is process-global and last-writer-wins, so relying on the
// service-role fake to feed the REAL resolveEffectiveTier makes this file's
// result depend on which test ran before it. This file happened to run before
// the export-route test that hijacks the module; that was luck, not a guard.
// ...AND it must HAND THE MODULE BACK when this file is done. `mock.module` is
// process-global and never unwinds on its own, so the hijack above owned this
// module for every file that ran after it. CI 08/11/2026: this "free, not
// degraded" resolver reached lib/email/__tests__/usage.test.ts 110 files later
// (CI walk order: this file #621, usage #731) and turned its pass-lift case
// ("starter" → got "free") and its fail-open case (degraded false → allowed
// false, sent 200) red — green on every machine whose walk order put usage
// first, red on Linux for 12 straight runs. Declaring the dependency is only
// half the guard; RELEASING it is the other half.
const REAL_EFFECTIVE_TIER = { ...(await import("@/lib/billing/effective-tier")) };
mock.module("@/lib/billing/effective-tier", () => ({
  resolveEffectiveTier: async () => ({ tier: "free", degraded: false }),
  PAID_TIERS: new Set(["starter", "growth", "pro"]),
}));
afterAll(() => {
  mock.module("@/lib/billing/effective-tier", () => REAL_EFFECTIVE_TIER);
});

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
