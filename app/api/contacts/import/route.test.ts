// app/api/contacts/import/route.test.ts
// First test file for the contacts import route (added with the verify
// upgrade, spec 2026-08-03 §1). Guards: failure mode 7 (echo is a post-write
// read-back — fake SELECT returns a MARKER row the response must carry) and
// 5 (401 with neither cookie nor token).
import { describe, expect, test, mock } from "bun:test";

let fakeUser: { id: string } | null = { id: "user-1" };

mock.module("@/utils/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: fakeUser } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            limit: async () => ({
              data: [{ email: "readback-marker@x.com", name: "Marker", tags: [] }],
              error: null,
            }),
          }),
        }),
      }),
    }),
  }),
}));
mock.module("next/headers", () => ({ cookies: async () => ({}) }));
mock.module("@/lib/contacts/upsert", () => ({
  upsertCanonicalContacts: async () => ({ added: 1, error: null }),
}));
mock.module("@/lib/api-tokens/token", () => ({
  // No token resolves in these tests — the 401 case exercises the
  // cookie-missing + token-missing path.
  resolveTokenUser: async () => null,
}));
mock.module("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => ({}),
}));

const { POST } = await import("./route");

function csvRequest(csv: string): Request {
  const fd = new FormData();
  fd.set("file", new File([csv], "contacts.csv", { type: "text/csv" }));
  return new Request("http://localhost/api/contacts/import", { method: "POST", body: fd });
}

describe("POST /api/contacts/import", () => {
  test("401 when neither cookie user nor token resolves", async () => {
    fakeUser = null;
    const res = await POST(csvRequest("email\na@x.com") as never);
    expect(res.status).toBe(401);
    fakeUser = { id: "user-1" };
  });
  test("happy path: echo carries the read-back marker, not the payload", async () => {
    const res = await POST(csvRequest("email,name\nreal@x.com,Real") as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.added).toBe(1);
    expect(body.echo[0].email).toBe("readback-marker@x.com");
  });
});
