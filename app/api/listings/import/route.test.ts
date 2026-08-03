// app/api/listings/import/route.test.ts
// Guards: failure mode 7 (echo is a post-write read-back — the fake SELECT
// returns a MARKER row and the response must carry the marker, proving the
// echo did not come from the parsed payload), 1 (caps), 5 (401 without auth).
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
              data: [{ address: "READBACK MARKER", price: 1, beds: 1, county: "Lee" }],
              error: null,
            }),
          }),
        }),
      }),
    }),
  }),
}));
mock.module("next/headers", () => ({ cookies: async () => ({}) }));
mock.module("@/lib/listings-user/upsert", () => ({
  upsertUserListings: async () => ({ added: 1, matchedToCounty: 1, error: null }),
}));

const { POST } = await import("./route");

function csvRequest(csv: string): Request {
  const fd = new FormData();
  fd.set("file", new File([csv], "listings.csv", { type: "text/csv" }));
  return new Request("http://localhost/api/listings/import", { method: "POST", body: fd });
}

describe("POST /api/listings/import", () => {
  test("401 when unauthenticated", async () => {
    fakeUser = null;
    const res = await POST(csvRequest("address\n1 A St") as never);
    expect(res.status).toBe(401);
    fakeUser = { id: "user-1" };
  });
  test("happy path: parses, upserts, and echoes ROWS READ BACK (marker proves read-back)", async () => {
    const res = await POST(
      csvRequest('address,price\n"1 A St, Fort Myers, FL 33901",100000') as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.added).toBe(1);
    expect(body.matched_to_county).toBe(1);
    expect(body.echo[0].address).toBe("READBACK MARKER");
  });
  test("413 over 5000 rows", async () => {
    const rows = Array.from({ length: 5001 }, (_, i) => `"${i} A St"`).join("\n");
    const res = await POST(csvRequest(`address\n${rows}`) as never);
    expect(res.status).toBe(413);
  });
});
