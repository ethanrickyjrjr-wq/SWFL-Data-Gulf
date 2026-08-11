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
//
// H2b fix (hermes-email-driver review round): the `addresses=<comma-separated address_keys>`
// query param, parsed here and threaded to fetchTransitionCandidates. This suite proves the
// ROUTE'S OWN parsing/wiring (the mock captures exactly what args the route called the
// source module with, and simulates the source module's own address_key filtering so a
// scoped request's response can be asserted end-to-end); lib/agent-feed/transitions-
// source.test.ts separately proves the REAL DB-query construction (.in() pushed down before
// .limit()).
//
// F1 fix (hermes-email-driver final review, was HIGH): the cursor wire format grew two
// per-source segments (`r:<lastRealId>` / `t:<lastTestId>`) -- next_cursor assertions below
// were updated to the new 4-segment shape, and a new describe block proves the actual bug
// this closes: a same-calendar-date REAL row with a LOW id, arriving after the cursor was
// advanced by a TEST row with a much HIGHER (unrelated-sequence) id, must still be served.
// This route-level mock (fetchTransitionCandidates stubbed wholesale) exercises parseCursor
// + isAfterCursor + next_cursor construction -- the actual per-source DB keyset filter is
// proven separately in lib/agent-feed/transitions-source.test.ts.
import { describe, expect, test, mock } from "bun:test";
import type { TransitionEvent } from "@/lib/agent-feed/transitions-source";

let scopeResult: { userId: string } | Response = { userId: "hermes-1" };
let candidates: TransitionEvent[] = [];
let lastCandidatesCall: { limit: number; addressKeys: string[] | undefined } | null = null;

mock.module("@/lib/api-tokens/scopes", () => ({
  requireScope: async () => scopeResult,
}));
mock.module("@/lib/agent-feed/transitions-source", () => ({
  // Simulates the real module's address-scoping contract (.in() applied BEFORE the page
  // cap): filters candidates down to addressKeys FIRST, then the route itself still applies
  // its own PAGE_CAP slice on top -- exactly the two-stage shape production has. The cursor
  // argument itself is NOT re-filtered here (unlike production's per-source DB keyset) --
  // this mock hands back every candidate and lets the ROUTE'S OWN isAfterCursor do the
  // filtering, which is exactly what the F1 tests below need to exercise.
  fetchTransitionCandidates: async (_cursor: unknown, limit: number, addressKeys?: string[]) => {
    lastCandidatesCall = { limit, addressKeys };
    if (!addressKeys || addressKeys.length === 0) return candidates;
    return candidates.filter((c) => addressKeys.includes(c.address_key));
  },
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

function req(cursor?: string, addresses?: string): Request {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (addresses) params.set("addresses", addresses);
  const qs = params.toString();
  const url = `http://localhost/api/agent-feed/transitions${qs ? `?${qs}` : ""}`;
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
    // F1: next_cursor now carries per-source segments. A legacy 2-segment input cursor
    // ("2026-08-01|9") has no r:/t:, so both sources fall back to the shared id 9; the page
    // (all "real" origin, the ev() default) advances realId to the highest real id served
    // (10), testId stays at the fallback (9, no test events in this page).
    expect(body.next_cursor).toBe("2026-08-02|1|r:10|t:9");
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
    // F1: no input cursor -> BEGINNING sentinel, both realId/testId start at -Infinity. All
    // 60 candidates default to "real" origin (ev()'s default), so nextRealId advances to the
    // highest real id actually served (50); nextTestId, with no test-origin rows in this
    // page, stays at its starting -Infinity.
    expect(body.next_cursor).toBe("2026-08-01|50|r:50|t:-Infinity");
  });

  test("response never leaks the internal cursor-plumbing id field", async () => {
    candidates = [ev({ id: 42 })];
    const res = await GET(req());
    const body = await res.json();
    expect(body.events[0].id).toBeUndefined();
  });

  // ── H2b: addresses=<comma-separated address_keys> ──────────────────────────────────
  test("H2b: no addresses param -> fetchTransitionCandidates called with addressKeys undefined (unscoped, today's behavior)", async () => {
    candidates = [ev({ id: 1, address_key: "row-1" })];
    lastCandidatesCall = null;
    await GET(req());
    expect(lastCandidatesCall?.addressKeys).toBeUndefined();
  });

  test("H2b: addresses param parsed into a trimmed, comma-split array and passed through", async () => {
    candidates = [ev({ id: 1, address_key: "key-a" })];
    lastCandidatesCall = null;
    await GET(req(undefined, "key-a, key-b ,key-c"));
    expect(lastCandidatesCall?.addressKeys).toEqual(["key-a", "key-b", "key-c"]);
  });

  test("H2b: scoped request returns ONLY matching address_keys, never the region-wide set", async () => {
    candidates = [
      ev({ id: 1, at: "2026-08-01", address_key: "key-a" }),
      ev({ id: 2, at: "2026-08-01", address_key: "key-b" }),
      ev({ id: 3, at: "2026-08-01", address_key: "key-c" }),
    ];
    const res = await GET(req(undefined, "key-a,key-c"));
    const body = await res.json();
    expect(body.events.map((e: { address_key: string }) => e.address_key).sort()).toEqual([
      "key-a",
      "key-c",
    ]);
  });

  test("H2b: page cap applies to the FILTERED (post-scope) set, not the full unscoped candidate count", async () => {
    // 100 candidates total; only 5 match the scope. The cap (50) must never exclude any of
    // the 5 relevant rows just because 100 unscoped candidates existed upstream.
    const scoped = Array.from({ length: 5 }, (_, i) =>
      ev({ id: i + 1, at: "2026-08-01", address_key: `wanted-${i + 1}` }),
    );
    const unscoped = Array.from({ length: 95 }, (_, i) =>
      ev({ id: i + 100, at: "2026-08-01", address_key: `noise-${i + 1}` }),
    );
    candidates = [...scoped, ...unscoped];
    const res = await GET(req(undefined, scoped.map((e) => e.address_key).join(",")));
    const body = await res.json();
    expect(body.events.length).toBe(5);
    expect(body.events.map((e: { address_key: string }) => e.address_key).sort()).toEqual(
      scoped.map((e) => e.address_key).sort(),
    );
  });

  test("H2b: empty/whitespace-only addresses param treated as unscoped (undefined), never an empty-match filter", async () => {
    candidates = [ev({ id: 1, address_key: "row-1" })];
    lastCandidatesCall = null;
    const res = await GET(req(undefined, "   "));
    const body = await res.json();
    expect(lastCandidatesCall?.addressKeys).toBeUndefined();
    expect(body.events.length).toBe(1);
  });
});

// ── F1: per-source cursor -- the shadow-loss bug and its guards ───────────────────────────
describe("GET /api/agent-feed/transitions -- F1 per-source cursor (final review, was HIGH)", () => {
  test("the exact shadow scenario: a real date-grain row with a LOW id (its own sequence) is served even though the cursor's shared id (500) came from a TEST row's unrelated sequence", async () => {
    // Cursor position after a tick consumed a test event at 2026-08-10T01:57:00.000Z whose
    // OWN (agent_feed_test_events) id was 500 -- r:3 (last real id served, an earlier date)
    // t:500 (the test id that actually advanced the shared `at`/`id` display pair). A later
    // real transition on the SAME calendar date, appended by the nightly sweep, carries id 4
    // -- listing_transitions' OWN id sequence, nowhere near 500.
    //
    // BEFORE F1 this row was lost forever: the DB-level keyset thresholded id.gt.500 against
    // the WRONG table's sequence, and even where that survived, the route's in-memory
    // isAfterCursor compared full timestamps -- "2026-08-10" (real, midnight-normalized) <
    // "2026-08-10T01:57:00.000Z" (the shared cursor.at) -- and dropped it, permanently, the
    // moment the cursor advanced past that date.
    const cursor = "2026-08-10T01:57:00.000Z|500|r:3|t:500";
    candidates = [
      ev({ id: 4, origin: "real", at: "2026-08-10", address_key: "shadowed-real-row" }),
    ];
    const res = await GET(req(cursor));
    const body = await res.json();
    expect(body.events.map((e: { address_key: string }) => e.address_key)).toEqual([
      "shadowed-real-row",
    ]);
  });

  test("legacy-cursor parse: a 2-segment cursor (no r:/t:) still works -- both sources fall back to the shared id", async () => {
    candidates = [
      ev({ id: 10, origin: "real", at: "2026-08-01", address_key: "real-after" }),
      ev({
        id: 10,
        origin: "test",
        at: "2026-08-01T12:00:00.000Z",
        address_key: "test-after",
        source_name: "test-inject",
      }),
    ];
    const res = await GET(req("2026-08-01|9"));
    const body = await res.json();
    expect(body.events.map((e: { address_key: string }) => e.address_key).sort()).toEqual([
      "real-after",
      "test-after",
    ]);
    // The route emits the NEW 4-segment format going forward, both sources correctly
    // advanced from the SAME legacy fallback threshold (9).
    expect(body.next_cursor).toBe("2026-08-01T12:00:00.000Z|10|r:10|t:10");
  });

  test("per-source independence: a same-date real row ties on realId, never the cursor's much-higher testId", async () => {
    // realId=2 (this source's own low-water mark); testId=9999 (many rehearsal events
    // already run). A genuinely new real row on the SAME date with id 5 must be served --
    // its threshold is realId(2), never testId(9999). Before F1, a shared-id design would
    // have compared 5 > 9999 (false) and wrongly dropped it.
    const cursor = "2026-08-10T00:00:00.000Z|9999|r:2|t:9999";
    candidates = [ev({ id: 5, origin: "real", at: "2026-08-10", address_key: "later-real-row" })];
    const res = await GET(req(cursor));
    const body = await res.json();
    expect(body.events.map((e: { address_key: string }) => e.address_key)).toEqual([
      "later-real-row",
    ]);
  });

  test("per-source independence, negative case: a same-date real row with id <= realId is correctly excluded (never re-served just because testId is huge)", async () => {
    const cursor = "2026-08-10T00:00:00.000Z|9999|r:5|t:9999";
    candidates = [ev({ id: 3, origin: "real", at: "2026-08-10", address_key: "already-served" })];
    const res = await GET(req(cursor));
    const body = await res.json();
    expect(body.events).toEqual([]);
  });

  test("per-source independence, test side: a same-timestamp test row ties on testId, never the cursor's much-higher realId", async () => {
    // Identical `at` forces the tie-break onto id. cursor.realId=9999, cursor.testId=2 -- a
    // genuinely new test row (id 3) must be served against testId(2), never realId(9999).
    const sameInstant = "2026-08-10T05:00:00.000Z";
    const cursor = `${sameInstant}|2|r:9999|t:2`;
    candidates = [
      ev({
        id: 3,
        origin: "test",
        at: sameInstant,
        address_key: "new-test-row",
        source_name: "test-inject",
      }),
    ];
    const res = await GET(req(cursor));
    const body = await res.json();
    expect(body.events.map((e: { address_key: string }) => e.address_key)).toEqual([
      "new-test-row",
    ]);
  });
});
