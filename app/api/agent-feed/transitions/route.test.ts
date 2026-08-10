// app/api/agent-feed/transitions/route.test.ts
// Guards Task 3 (hermes-email-driver spec 2026-08-10): the cursor round-trips unchanged on
// an empty page (lossless late/missed ticks -- decision 5), strictly-greater-than (at,id)
// paging never re-serves the cursor row, real vs test origin + source_name tagging (never
// let a rehearsal event look real -- failure mode 3/7b), wrong-scope passthrough (401/403
// stay the auth layer's problem, not the route's), and the 50-row page cap on the merged
// real UNION test stream. Mirrors the mock.module style of
// app/api/listings/import/route.test.ts (data-access module mocked wholesale) combined with
// lib/api-tokens/scopes.test.ts's auth-result mock. The Supabase client itself lives inside
// lib/agent-feed/transitions-source.ts (mocked wholesale below), so this test never touches
// @/utils/supabase/service-role.
import { describe, expect, test, mock } from "bun:test";
import type { TransitionEvent } from "@/lib/agent-feed/transitions-source";

let scopeResult: { userId: string } | Response = { userId: "hermes-1" };
let candidates: TransitionEvent[] = [];

mock.module("@/lib/api-tokens/scopes", () => ({
  requireScope: async () => scopeResult,
}));
mock.module("@/lib/agent-feed/transitions-source", () => ({
  fetchTransitionCandidates: async () => candidates,
}));

const { GET } = await import("./route");

function ev(overrides: Partial<TransitionEvent>): TransitionEvent {
  return {
    origin: "real",
    id: 1,
    address: "1 A St",
    address_key: "1-a-st|33901",
    sale_or_rent: "sale",
    from_state: "active",
    to_state: "pending",
    price_delta: null,
    at: "2026-08-01",
    source_name: "steadyapi",
    ...overrides,
  };
}

function req(cursor?: string): Request {
  const url = cursor
    ? `http://localhost/api/agent-feed/transitions?cursor=${encodeURIComponent(cursor)}`
    : "http://localhost/api/agent-feed/transitions";
  return new Request(url, { headers: { authorization: "Bearer sdg_x" } });
}

describe("GET /api/agent-feed/transitions", () => {
  test("wrong-scope token -> 403 passthrough from requireScope", async () => {
    scopeResult = new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
    const res = await GET(req());
    expect(res.status).toBe(403);
    scopeResult = { userId: "hermes-1" };
  });

  test("empty feed with a cursor -> {events:[], next_cursor: same as input}", async () => {
    candidates = [];
    const res = await GET(req("2026-08-01|9"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ events: [], next_cursor: "2026-08-01|9" });
  });

  test("empty feed with no cursor param -> next_cursor is empty string, never crashes", async () => {
    candidates = [];
    const res = await GET(req());
    const body = await res.json();
    expect(body).toEqual({ events: [], next_cursor: "" });
  });

  test("only rows strictly after the cursor come back, ordered by (at, id)", async () => {
    candidates = [
      ev({ id: 5, at: "2026-08-01", address_key: "before-cursor" }),
      ev({ id: 9, at: "2026-08-01", address_key: "exactly-at-cursor" }),
      ev({ id: 10, at: "2026-08-01", address_key: "after-same-day" }),
      ev({ id: 1, at: "2026-08-02", address_key: "after-next-day" }),
    ];
    const res = await GET(req("2026-08-01|9"));
    const body = await res.json();
    expect(body.events.map((e: { address_key: string }) => e.address_key)).toEqual([
      "after-same-day",
      "after-next-day",
    ]);
    expect(body.next_cursor).toBe("2026-08-02|1");
  });

  test("real rows stamped origin real; test rows stamped origin test + source_name test-inject", async () => {
    candidates = [
      ev({
        id: 1,
        origin: "real",
        source_name: "steadyapi",
        address_key: "real-row",
        at: "2026-08-01",
      }),
      ev({
        id: 2,
        origin: "test",
        source_name: "test-inject",
        address_key: "test-row",
        at: "2026-08-01",
      }),
    ];
    const res = await GET(req());
    const body = await res.json();
    const real = body.events.find((e: { address_key: string }) => e.address_key === "real-row");
    const testEv = body.events.find((e: { address_key: string }) => e.address_key === "test-row");
    expect(real.origin).toBe("real");
    expect(real.source_name).toBe("steadyapi");
    expect(testEv.origin).toBe("test");
    expect(testEv.source_name).toBe("test-inject");
  });

  test("page cap: 60 merged candidates cap to 50, next_cursor lands on the 50th", async () => {
    candidates = Array.from({ length: 60 }, (_, i) =>
      ev({ id: i + 1, at: "2026-08-01", address_key: `row-${i + 1}` }),
    );
    const res = await GET(req());
    const body = await res.json();
    expect(body.events.length).toBe(50);
    expect(body.events[49].address_key).toBe("row-50");
    expect(body.next_cursor).toBe("2026-08-01|50");
  });

  test("response never leaks the internal cursor-plumbing id field", async () => {
    candidates = [ev({ id: 42 })];
    const res = await GET(req());
    const body = await res.json();
    expect(body.events[0].id).toBeUndefined();
  });
});
