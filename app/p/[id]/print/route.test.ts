// Mirrors the mock-module posture of app/api/deliverables/[id]/trash/route.test.ts.
import { test, expect, mock, beforeEach } from "bun:test";

const narrative = {
  exec_summary: "Cape Coral inventory is rising into summer.",
  sections: [{ title: "Overview", intro: "Listings climbed through June." }],
  inference_notes: [],
};

const baseRow = {
  template: "market-overview",
  status: "active",
  deleted_at: null,
  created_at: "2026-07-01T00:00:00.000Z",
  scope_kind: null,
  scope_value: null,
  items_snapshot: [] as unknown[],
  narrative,
  doc: null as unknown,
};

// Minimal doc that PASSES EmailDocSchema (globalStyle required; blocks min 1; id minted).
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

let row: Record<string, unknown> | null = { ...baseRow };
mock.module("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () =>
            row ? { data: row, error: null } : { data: null, error: { message: "not found" } },
        }),
      }),
    }),
  }),
}));

const { GET } = await import("./route");
const req = new Request("http://localhost/p/d1/print");
const params = { params: Promise.resolve({ id: "d1" }) };

beforeEach(() => {
  row = { ...baseRow };
});

test("a narrative template renders the doc-report skin — the email-only 422 is gone", async () => {
  const res = await GET(req, params);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");
  expect(await res.text()).toContain("window.print()");
});

test("the email template still renders (regression)", async () => {
  row = { ...baseRow, template: "email" };
  const res = await GET(req, params);
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("window.print()");
});

test("block-canvas with a parseable doc redirects to its real bytes route", async () => {
  row = { ...baseRow, template: "block-canvas", doc: VALID_DOC };
  const res = await GET(req, params);
  expect(res.status).toBe(307);
  expect(new URL(res.headers.get("location")!).pathname).toBe("/api/deliverables/d1/pdf");
});

test("block-canvas with a corrupt doc does NOT redirect — loop pin", async () => {
  row = { ...baseRow, template: "block-canvas", doc: { blocks: [] } };
  const res = await GET(req, params);
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("window.print()");
});

test("a contentless narrative row serves the empty degrade page, not an error", async () => {
  row = {
    ...baseRow,
    narrative: { exec_summary: "", sections: [], inference_notes: [] },
  };
  const res = await GET(req, params);
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("no content to print yet");
});

test("revoked → 404", async () => {
  row = { ...baseRow, status: "revoked" };
  expect((await GET(req, params)).status).toBe(404);
});

test("trashed → 404", async () => {
  row = { ...baseRow, deleted_at: "2026-07-10T00:00:00.000Z" };
  expect((await GET(req, params)).status).toBe(404);
});
