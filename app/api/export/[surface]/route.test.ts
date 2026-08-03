// app/api/export/[surface]/route.test.ts
// Guards, one test per spec failure mode: FM1 escaped body, FM2 free→402,
// FM3 degraded fails OPEN, FM4 no service-role data read (the service-role
// fake THROWS on .from — any data read via it explodes every test), FM5
// page-boundary truth through the REAL selectAllPaged (1001 rows, two pages),
// FM7 BOM, FM8 read error → 500 JSON never text/csv. Plus 404/401/headers.
import { describe, expect, test, mock } from "bun:test";

let fakeUser: { id: string } | null = { id: "user-1" };
let tierResult: { tier: string; degraded: boolean } = { tier: "free", degraded: false };
let tierThrows = false;
let dataRows: Record<string, unknown>[] = [];
let dataError = false;
const cookieReads: string[] = [];

function pagedQuery() {
  return {
    order() {
      return this;
    },
    async range(from: number, to: number) {
      if (dataError) return { data: null, error: { message: "boom" } };
      return { data: dataRows.slice(from, to + 1), error: null };
    },
  };
}

mock.module("next/headers", () => ({ cookies: async () => ({}) }));
mock.module("@/utils/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: fakeUser } }) },
    from: (table: string) => {
      cookieReads.push(table);
      return { select: () => pagedQuery() };
    },
  }),
}));
mock.module("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => {
      throw new Error("FM4 violation: service-role data read");
    },
  }),
}));
mock.module("@/lib/billing/effective-tier", () => ({
  resolveEffectiveTier: async () => {
    if (tierThrows) throw new Error("billing outage");
    return tierResult;
  },
}));

const { GET } = await import("./route");

function get(surface: string) {
  return GET(new Request(`http://localhost/api/export/${surface}`), {
    params: Promise.resolve({ surface }),
  });
}

function contactRow(i: number) {
  return {
    id: `c-${i}`,
    user_id: "u-1",
    name: `Contact ${i}`,
    email: `c${i}@example.com`,
    phone: null,
    tags: [],
    created_at: "2026-08-01T00:00:00.000Z",
  };
}

describe("GET /api/export/[surface]", () => {
  test("404 on unknown surface", async () => {
    const res = await get("lake_secrets");
    expect(res.status).toBe(404);
  });

  test("401 when unauthenticated", async () => {
    fakeUser = null;
    const res = await get("contacts");
    expect(res.status).toBe(401);
    fakeUser = { id: "user-1" };
  });

  test("FM2: free tier → 402 JSON with upgrade path, no CSV body", async () => {
    tierResult = { tier: "free", degraded: false };
    const res = await get("contacts");
    expect(res.status).toBe(402);
    expect(res.headers.get("content-type")).not.toContain("text/csv");
    const body = await res.json();
    expect(body.upgrade_url).toBe("/billing");
  });

  test("paid tier → 200 text/csv with dated attachment filename", async () => {
    tierResult = { tier: "starter", degraded: false };
    dataRows = [contactRow(1)];
    const res = await get("contacts");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toMatch(
      /^attachment; filename="swfl-contacts-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
  });

  test("FM7 + FM1 + FM6 on the wire: BOM first, formula escaped, no internal ids", async () => {
    tierResult = { tier: "growth", degraded: false };
    dataRows = [{ ...contactRow(1), name: "=2+2" }];
    const res = await get("contacts");
    const body = await res.text();
    expect(body.codePointAt(0)).toBe(0xfeff);
    expect(body).toContain('"\'=2+2"');
    expect(body).not.toContain("user_id");
    expect(body).not.toContain("c-1");
  });

  test("FM3: degraded tier read fails OPEN — free-looking user still gets the CSV", async () => {
    tierResult = { tier: "free", degraded: true };
    dataRows = [contactRow(1)];
    const res = await get("contacts");
    expect(res.status).toBe(200);
  });

  test("FM3 belt-and-suspenders: a THROWN tier lookup also fails open", async () => {
    tierThrows = true;
    dataRows = [contactRow(1)];
    const res = await get("contacts");
    expect(res.status).toBe(200);
    tierThrows = false;
  });

  test("FM5: 1001 rows cross the PostgREST page boundary intact (real selectAllPaged)", async () => {
    tierResult = { tier: "pro", degraded: false };
    dataRows = Array.from({ length: 1001 }, (_, i) => contactRow(i));
    const res = await get("contacts");
    const lines = (await res.text()).trimEnd().split("\r\n");
    expect(lines.length).toBe(1002); // header + 1001 rows
  });

  test("FM8: read error → 500 JSON, NEVER a valid-looking empty CSV", async () => {
    tierResult = { tier: "pro", degraded: false };
    dataError = true;
    const res = await get("contacts");
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).not.toContain("text/csv");
    dataError = false;
  });

  test("FM4: the data read happened on the cookie RLS client", async () => {
    // The service-role fake throws on .from() — reaching this line at all
    // proves no test above routed a data read through service role.
    expect(cookieReads).toContain("contacts");
  });

  test("zero rows → 200 header-only CSV (a true answer, not an error)", async () => {
    tierResult = { tier: "starter", degraded: false };
    dataRows = [];
    const res = await get("contacts");
    expect(res.status).toBe(200);
    const lines = (await res.text()).trimEnd().split("\r\n");
    expect(lines.length).toBe(1);
  });
});
