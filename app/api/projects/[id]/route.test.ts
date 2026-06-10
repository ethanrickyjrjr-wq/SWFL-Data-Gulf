import { test, expect, mock, beforeEach } from "bun:test";

// RLS makes a non-owned row invisible → maybeSingle() returns null data. The
// scenario.row=null case simulates "GET/PATCH someone else's project".
const scenario: { user: { id: string } | null; row: { id: string } | null } = {
  user: { id: "user-a" },
  row: { id: "proj-1" },
};

mock.module("@/utils/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: scenario.user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: scenario.row, error: null }) }),
      }),
      update: () => ({
        eq: () => ({
          select: () => ({ maybeSingle: async () => ({ data: scenario.row, error: null }) }),
        }),
      }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));
mock.module("next/headers", () => ({ cookies: async () => ({}) }));

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
