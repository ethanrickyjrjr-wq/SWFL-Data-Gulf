// Mirrors the mock-module posture of app/api/deliverables/[id]/trash/route.test.ts.
// GET only — POST (Email Lab live-doc render) is out of scope for this build.
import { test, expect, mock, beforeEach } from "bun:test";

const VALID_DOC = {
  globalStyle: {
    primaryColor: "#0f1d24",
    accentColor: "#3DC9C0",
    fontFamily: "LATO_SANS",
    textColor: "#242424",
    backdropColor: "#F8F8F8",
  },
  blocks: [{ type: "text", props: { body: "Hello" } }],
};

const baseRow = {
  doc: null as unknown,
  status: "active",
  deleted_at: null as string | null,
  data_as_of: "2026-07-01T00:00:00.000Z",
  template: "market-overview",
};

let row: Record<string, unknown> | null = { ...baseRow };
mock.module("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row }) }),
      }),
    }),
  }),
}));
mock.module("@/utils/supabase/server", () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
mock.module("next/headers", () => ({ cookies: async () => ({}) }));

const { GET } = await import("./route");

function makeReq() {
  return new Request("http://localhost/api/deliverables/d1/pdf") as Parameters<typeof GET>[0];
}
const params = { params: Promise.resolve({ id: "d1" }) };

beforeEach(() => {
  row = { ...baseRow };
});

test("a narrative row 307s to the print skin — no more 422", async () => {
  const res = await GET(makeReq(), params);
  expect(res.status).toBe(307);
  expect(new URL(res.headers.get("location")!).pathname).toBe("/p/d1/print");
});

test("a corrupt-doc block-canvas row also 307s (print route owns the fallback)", async () => {
  row = { ...baseRow, template: "block-canvas", doc: { blocks: [] } };
  const res = await GET(makeReq(), params);
  expect(res.status).toBe(307);
  expect(new URL(res.headers.get("location")!).pathname).toBe("/p/d1/print");
});

test("a block-canvas row with a parseable doc still returns real PDF bytes", async () => {
  row = { ...baseRow, template: "block-canvas", doc: VALID_DOC };
  const res = await GET(makeReq(), params);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("application/pdf");
  const buf = new Uint8Array(await res.arrayBuffer());
  expect(new TextDecoder("latin1").decode(buf.subarray(0, 4))).toBe("%PDF");
});

test("missing row → 404", async () => {
  row = null;
  expect((await GET(makeReq(), params)).status).toBe(404);
});

test("revoked → 404", async () => {
  row = { ...baseRow, status: "revoked" };
  expect((await GET(makeReq(), params)).status).toBe(404);
});

test("trashed → 404", async () => {
  row = { ...baseRow, deleted_at: "2026-07-10T00:00:00.000Z" };
  expect((await GET(makeReq(), params)).status).toBe(404);
});
