import { test, expect, mock, beforeEach } from "bun:test";

// RLS makes a non-owned row invisible → maybeSingle() returns null data. The
// scenario.row=null case simulates "GET/PATCH someone else's project".
const scenario: {
  user: { id: string } | null;
  row: { id: string } | null;
  /** Last UPDATE payload sent to the projects table (wave 1.5: property_url asserts). */
  captured: Record<string, unknown> | null;
} = {
  user: { id: "user-a" },
  row: { id: "proj-1" },
  captured: null,
};

mock.module("@/utils/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: scenario.user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: scenario.row, error: null }) }),
      }),
      update: (row: Record<string, unknown>) => {
        scenario.captured = row;
        return {
          eq: () => ({
            select: () => ({ maybeSingle: async () => ({ data: scenario.row, error: null }) }),
          }),
        };
      },
      delete: () => ({ eq: async () => ({ error: null }) }),
      // fire-and-forget logActivity() inserts a project_activity row on every
      // PATCH that changes name/branding/scope; stub it so the caught insert
      // doesn't log a TypeError (it never affects assertions — logActivity swallows errors).
      insert: async () => ({ error: null }),
    }),
  }),
}));
mock.module("next/headers", () => ({ cookies: async () => ({}) }));

// Fill-once §B: a branding PATCH also banks blank account fields upward. The
// helper is unit-tested on its own (lib/brand/bank-brand-fields.test.ts); here
// we only assert the route CALLS it with the branding payload + the authed user.
const banked: { userId: string; patch: Record<string, unknown> }[] = [];
mock.module("@/lib/brand/bank-brand-fields", () => ({
  bankBrandFields: async (_s: unknown, userId: string, patch: Record<string, unknown>) => {
    banked.push({ userId, patch });
  },
}));

const { GET, PATCH, DELETE } = await import("./route");

const params = Promise.resolve({ id: "proj-1" });
function req(method: string, body?: unknown) {
  return new Request("http://localhost/api/projects/proj-1", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as import("next/server").NextRequest;
}

beforeEach(() => {
  scenario.user = { id: "user-a" };
  scenario.row = { id: "proj-1" };
  scenario.captured = null;
  banked.length = 0;
});

test("GET unauthenticated → 401", async () => {
  scenario.user = null;
  const res = await GET(req("GET"), { params });
  expect(res.status).toBe(401);
});

test("GET another user's project → 404 (RLS invisible)", async () => {
  scenario.row = null; // RLS returns no row
  const res = await GET(req("GET"), { params });
  expect(res.status).toBe(404);
});

test("GET owned project → 200", async () => {
  const res = await GET(req("GET"), { params });
  expect(res.status).toBe(200);
});

test("PATCH invalid items → 422", async () => {
  const res = await PATCH(req("PATCH", { items: [{ kind: "bogus" }] }), { params });
  expect(res.status).toBe(422);
});

test("PATCH valid items on owned row → ok", async () => {
  const res = await PATCH(req("PATCH", { items: [], title: "renamed" }), { params });
  expect(res.status).toBe(200);
  expect((await res.json()).ok).toBe(true);
});

test("PATCH non-owned row → 404", async () => {
  scenario.row = null;
  const res = await PATCH(req("PATCH", { title: "x" }), { params });
  expect(res.status).toBe(404);
});

test("DELETE owned row → ok", async () => {
  const res = await DELETE(req("DELETE"), { params });
  expect(res.status).toBe(200);
});

// ── wave 1.5: property_url (head of the artifact link chain) ─────────────────

test("PATCH valid property_url is saved trimmed", async () => {
  const res = await PATCH(req("PATCH", { property_url: "  https://myagentsite.com/homes/465  " }), {
    params,
  });
  expect(res.status).toBe(200);
  expect(scenario.captured?.property_url).toBe("https://myagentsite.com/homes/465");
});

test("PATCH empty-string property_url clears to null", async () => {
  const res = await PATCH(req("PATCH", { property_url: "" }), { params });
  expect(res.status).toBe(200);
  expect(scenario.captured?.property_url).toBeNull();
});

test("PATCH explicit null property_url clears to null", async () => {
  const res = await PATCH(req("PATCH", { property_url: null }), { params });
  expect(res.status).toBe(200);
  expect(scenario.captured?.property_url).toBeNull();
});

test("PATCH non-http(s) property_url → 422, nothing written", async () => {
  const res = await PATCH(req("PATCH", { property_url: "javascript:alert(1)" }), { params });
  expect(res.status).toBe(422);
  expect(scenario.captured).toBeNull();
});

test("PATCH without property_url leaves the column untouched", async () => {
  const res = await PATCH(req("PATCH", { title: "renamed" }), { params });
  expect(res.status).toBe(200);
  expect(scenario.captured && "property_url" in scenario.captured).toBe(false);
});

// ── capture-or-blank (spec 2026-07-16): subject_address / subject_area ───────

test("PATCH subject_address and subject_area save trimmed, empties → null", async () => {
  const res = await PATCH(req("PATCH", { subject_address: " 123 Palm Ave ", subject_area: "  " }), {
    params,
  });
  expect(res.status).toBe(200);
  expect(scenario.captured?.subject_address).toBe("123 Palm Ave");
  expect(scenario.captured?.subject_area).toBeNull();
});

test("PATCH subject_area saves trimmed", async () => {
  const res = await PATCH(req("PATCH", { subject_area: " Cape Coral " }), { params });
  expect(res.status).toBe(200);
  expect(scenario.captured?.subject_area).toBe("Cape Coral");
});

test("PATCH without subject fields leaves them untouched", async () => {
  const res = await PATCH(req("PATCH", { title: "renamed" }), { params });
  expect(res.status).toBe(200);
  expect(scenario.captured && "subject_address" in scenario.captured).toBe(false);
  expect(scenario.captured && "subject_area" in scenario.captured).toBe(false);
});

// ── fill-once (spec 2026-07-16 §B): branding banks upward to the account ─────

test("PATCH with branding banks the payload upward for the authed user", async () => {
  const res = await PATCH(
    req("PATCH", { branding: { agent_name: "Marisol Vega", brokerage: "Vega Realty" } }),
    { params },
  );
  expect(res.status).toBe(200);
  expect(banked).toHaveLength(1);
  expect(banked[0].userId).toBe("user-a");
  expect(banked[0].patch).toMatchObject({ agent_name: "Marisol Vega", brokerage: "Vega Realty" });
});

test("PATCH without branding never touches the bank", async () => {
  const res = await PATCH(req("PATCH", { title: "renamed" }), { params });
  expect(res.status).toBe(200);
  expect(banked).toHaveLength(0);
});
