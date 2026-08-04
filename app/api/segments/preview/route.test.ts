// app/api/segments/preview/route.test.ts
import { describe, expect, it, mock } from "bun:test";

// Route calls `createClient(await cookies())`; `cookies()` from next/headers
// throws outside a request scope (bun test has none). Mock it to an inert value
// — mirrors app/api/segments/route.test.ts + app/api/contacts. The supabase
// `createClient` mock below ignores the arg anyway.
mock.module("next/headers", () => ({ cookies: async () => ({}) }));

// This file MUST declare its own `effective-tier` mock rather than lean on the
// service-role fake below feeding the real resolver. `mock.module` in bun is
// process-global and never unwinds, so whichever file registered it last owns
// it for every file that runs after. `app/api/export/[surface]/route.test.ts`
// mocks this same module and leaves its mutable tier at "starter" — a PAID
// tier — so under a bare repo-wide `bun test` this route saw paid, skipped the
// 403 branch entirely, fell through to resolveSegment, and died on
// `db.from is not a function`. Green alone, red in CI, for 5 straight runs.
// Declaring the dependency here makes the test independent of file order.
mock.module("@/lib/billing/effective-tier", () => ({
  resolveEffectiveTier: async () => ({ tier: "free", degraded: false }),
  PAID_TIERS: new Set(["starter", "growth", "pro"]),
}));

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
