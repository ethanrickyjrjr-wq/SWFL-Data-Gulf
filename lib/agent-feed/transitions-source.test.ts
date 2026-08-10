// lib/agent-feed/transitions-source.test.ts
// Guards the review fixes on Task 3 (hermes-email-driver spec 2026-08-10) that the
// route-level mock (app/api/agent-feed/transitions/route.test.ts) cannot exercise, because
// that file mocks fetchTransitionCandidates wholesale. These tests run the REAL
// fetchTransitionCandidates against a fake Supabase-like query builder that faithfully
// simulates PostgREST filter semantics (.eq/.in/.gte/.or, multi-key .order, .limit) over an
// in-memory fixture table, so the actual DB-query construction is what gets checked:
//
//   1. CRITICAL -- keyset pushdown. The old code bounded each fetch with .gte("at", sinceAt)
//      only -- the date half of the cursor. On a date with more candidate rows than the page
//      cap, that loose bound returns the SAME lowest-id page every call, the route's
//      in-memory filter discards all of them, and next_cursor never advances (production
//      sees 1,090+ real rows on a single date). This suite drives >PAGE_CAP same-date rows
//      through multiple fetchTransitionCandidates calls, feeding each call's own returned
//      cursor into the next, and asserts every row is eventually seen exactly once and the
//      cursor strictly advances every call -- i.e. paging terminates instead of wedging.
//   2. HIGH -- seed=true baseline rows (mirrors lib/desk/loaders.ts:499's .eq("seed", false))
//      must never reach the feed.
//   3. MEDIUM-HIGH -- every returned `at`, from either source, is normalized to full
//      millisecond-precision ISO-8601 UTC before it ever leaves this module.
//   4. LOW-MEDIUM -- the address join must prefer a non-null street_address over a null one
//      regardless of which listing_state row (there can be more than one per address_key)
//      is read first or last.
//
// The fake query builder models the ONE Postgres behavior this module's correctness
// actually depends on: filtering a `date` column against a full-ISO operand truncates the
// operand to its date part first (PostgREST casts on the column's real type), while a
// `timestamptz` column compares at full precision, and an integer PK column (`id`) compares
// numerically, never lexically ("9" > "50" as strings would be a fake-builder bug, not a
// real PostgREST behavior -- PostgREST always casts to the column's real type).
import { describe, expect, test, mock } from "bun:test";

// ---------------------------------------------------------------------------
// Fake Supabase-like query builder -- enough of the real PostgREST filter
// surface (.eq, .in, .gte, .or, multi .order, .limit) to prove the real
// module's query construction, not just its JS-side merge logic.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

const NUMERIC_COLS = new Set(["id"]);

function splitTopLevelCommas(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Compare a row's column value against a filter operand the way PostgREST/Postgres would:
 *  numeric columns (id) cast-and-compare numerically, date columns truncate the operand to
 *  its date part first, everything else compares as a plain string (safe for full-ISO `at`
 *  values, which order correctly lexically). */
function compareCol(
  rowValue: unknown,
  operand: string,
  col: string,
  dateCols: Set<string>,
): -1 | 0 | 1 {
  if (NUMERIC_COLS.has(col)) {
    const a = Number(rowValue);
    const b = Number(operand);
    return a < b ? -1 : a > b ? 1 : 0;
  }
  const a = dateCols.has(col) ? String(rowValue).slice(0, 10) : String(rowValue);
  const b = dateCols.has(col) ? operand.slice(0, 10) : operand;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Parse one PostgREST-style .or() term (`col.op.value` or `and(term,term)`) into a
 *  predicate. */
function parseOrTerm(term: string, dateCols: Set<string>): (r: Row) => boolean {
  const t = term.trim();
  if (t.startsWith("and(") && t.endsWith(")")) {
    const subterms = splitTopLevelCommas(t.slice(4, -1)).map((s) => parseOrTerm(s, dateCols));
    return (r) => subterms.every((p) => p(r));
  }
  const firstDot = t.indexOf(".");
  const secondDot = t.indexOf(".", firstDot + 1);
  const col = t.slice(0, firstDot);
  const op = t.slice(firstDot + 1, secondDot);
  const value = t.slice(secondDot + 1);
  if (op === "gt") return (r) => compareCol(r[col], value, col, dateCols) > 0;
  if (op === "eq") return (r) => compareCol(r[col], value, col, dateCols) === 0;
  if (op === "gte") return (r) => compareCol(r[col], value, col, dateCols) >= 0;
  throw new Error(`fake query builder: unsupported op "${op}"`);
}

class FakeQueryBuilder implements PromiseLike<{ data: Row[]; error: null }> {
  private filters: Array<(r: Row) => boolean> = [];
  private orders: Array<{ col: string; ascending: boolean }> = [];
  private limitN: number | undefined;

  constructor(
    private rows: Row[],
    private dateCols: Set<string>,
  ) {}

  select(_cols: string) {
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  gte(col: string, val: string) {
    this.filters.push((r) => compareCol(r[col], val, col, this.dateCols) >= 0);
    return this;
  }
  or(expr: string) {
    const preds = splitTopLevelCommas(expr).map((t) => parseOrTerm(t, this.dateCols));
    this.filters.push((r) => preds.some((p) => p(r)));
    return this;
  }
  order(col: string, opts: { ascending: boolean }) {
    this.orders.push({ col, ascending: opts.ascending });
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?:
      ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    let result = this.rows.filter((r) => this.filters.every((f) => f(r)));
    result = [...result].sort((a, b) => {
      for (const { col, ascending } of this.orders) {
        const cmp = compareCol(a[col], String(b[col]), col, this.dateCols);
        if (cmp !== 0) return ascending ? cmp : -cmp;
      }
      return 0;
    });
    if (this.limitN != null) result = result.slice(0, this.limitN);
    const resolved = { data: result, error: null };
    return Promise.resolve(onfulfilled ? onfulfilled(resolved) : (resolved as unknown as TResult1));
  }
}

interface FakeDb {
  tables: Record<string, Row[]>;
  dateCols: Record<string, Set<string>>;
}

function makeFakeClient(db: FakeDb) {
  return {
    schema(_name: string) {
      return this;
    },
    from(table: string) {
      return new FakeQueryBuilder(db.tables[table] ?? [], db.dateCols[table] ?? new Set());
    },
  };
}

let fakeDb: FakeDb = { tables: {}, dateCols: {} };

mock.module("@/utils/supabase/service-role", () => ({
  createServiceRoleClientUntyped: () => makeFakeClient(fakeDb),
}));

const { fetchTransitionCandidates } = await import("./transitions-source");

const BEGINNING = { at: "", id: -Infinity };

function realRow(overrides: Partial<Row>): Row {
  return {
    id: 1,
    address_key: "1-a-st|33901",
    sale_or_rent: "sale",
    from_state: "active",
    to_state: "pending",
    price_delta: null,
    at: "2026-08-01",
    source_name: "steadyapi",
    seed: false,
    ...overrides,
  };
}

describe("fetchTransitionCandidates (real DB-query construction, via fake PostgREST builder)", () => {
  test("[finding 1, CRITICAL] keyset pushdown pages through >PAGE_CAP same-date rows without wedging", async () => {
    const PAGE_CAP = 50;
    const TOTAL = 130; // > 2 full pages on a SINGLE date, the exact production shape (1,090+/date)
    const rows = Array.from({ length: TOTAL }, (_, i) => realRow({ id: i + 1, at: "2026-08-01" }));
    fakeDb = {
      tables: { listing_transitions: rows, listing_state: [] },
      dateCols: { listing_transitions: new Set(["at"]) },
    };

    const seenIds = new Set<number>();
    let cursor = BEGINNING;
    let calls = 0;
    const prevCursors: string[] = [];
    while (calls < 10) {
      calls++;
      const page = await fetchTransitionCandidates(cursor, PAGE_CAP);
      if (page.length === 0) break;
      for (const ev of page) seenIds.add(ev.id);
      const last = page[page.length - 1];
      const nextCursorStr = `${last.at}|${last.id}`;
      expect(prevCursors.includes(nextCursorStr)).toBe(false); // cursor must strictly advance
      prevCursors.push(nextCursorStr);
      cursor = { at: last.at, id: last.id };
    }
    expect(seenIds.size).toBe(TOTAL); // every row seen exactly once
    // ceil(130/50) = 3 productive pages, +1 final call that returns empty and confirms
    // termination (the loop always fires one more fetch to discover there's nothing left).
    expect(calls).toBe(Math.ceil(TOTAL / PAGE_CAP) + 1);
  });

  test("[finding 2, HIGH] seed=true baseline rows never reach the feed", async () => {
    fakeDb = {
      tables: {
        listing_transitions: [
          realRow({ id: 1, seed: true, address_key: "seed-row" }),
          realRow({ id: 2, seed: false, address_key: "live-row" }),
        ],
        listing_state: [],
      },
      dateCols: { listing_transitions: new Set(["at"]) },
    };
    const events = await fetchTransitionCandidates(BEGINNING, 50);
    const keys = events.map((e) => e.address_key);
    expect(keys).toContain("live-row");
    expect(keys).not.toContain("seed-row");
  });

  test("[finding 4, LOW-MEDIUM] address join prefers non-null street_address, null-first order", async () => {
    fakeDb = {
      tables: {
        listing_transitions: [realRow({ id: 1, address_key: "addr-1" })],
        listing_state: [
          { address_key: "addr-1", street_address: null },
          { address_key: "addr-1", street_address: "1 A St" },
        ],
      },
      dateCols: { listing_transitions: new Set(["at"]) },
    };
    const events = await fetchTransitionCandidates(BEGINNING, 50);
    expect(events[0].address).toBe("1 A St");
  });

  test("[finding 4, LOW-MEDIUM] address join prefers non-null street_address, null-last order", async () => {
    fakeDb = {
      tables: {
        listing_transitions: [realRow({ id: 1, address_key: "addr-2" })],
        listing_state: [
          { address_key: "addr-2", street_address: "2 B Ave" },
          { address_key: "addr-2", street_address: null },
        ],
      },
      dateCols: { listing_transitions: new Set(["at"]) },
    };
    const events = await fetchTransitionCandidates(BEGINNING, 50);
    expect(events[0].address).toBe("2 B Ave");
  });

  test("[finding 3, MEDIUM-HIGH] every returned `at` is normalized to full ISO regardless of source column type", async () => {
    fakeDb = {
      tables: {
        listing_transitions: [realRow({ id: 1, at: "2026-08-01", address_key: "real-row" })],
        listing_state: [],
        agent_feed_test_events: [
          {
            id: 1,
            address: "9 Z Ct",
            address_key: "test-row",
            sale_or_rent: "sale",
            from_state: "active",
            to_state: "pending",
            price_delta: null,
            at: "2026-08-01T14:00:00+00:00",
          },
        ],
      },
      dateCols: { listing_transitions: new Set(["at"]) },
    };
    const events = await fetchTransitionCandidates(BEGINNING, 50);
    const real = events.find((e) => e.address_key === "real-row")!;
    const testEv = events.find((e) => e.address_key === "test-row")!;
    expect(real.at).toBe("2026-08-01T00:00:00.000Z");
    expect(testEv.at).toBe("2026-08-01T14:00:00.000Z");
    // Same format shape (full ISO, millisecond, Z suffix) for both origins.
    const isoShape = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    expect(isoShape.test(real.at)).toBe(true);
    expect(isoShape.test(testEv.at)).toBe(true);
  });

  test("[finding 3, MEDIUM-HIGH] same-day real+test mix pages correctly, real-then-test order", async () => {
    // A real (date-only) row always normalizes to midnight, so a same-day test row with a
    // real time-of-day necessarily sorts AFTER it. Advance the cursor past the real row and
    // confirm the same-day test row is still reachable (the shadowing bug precision
    // mismatch would cause: a loose real "at" comparison could wrongly exclude a
    // higher-precision same-day test row, or vice versa).
    fakeDb = {
      tables: {
        listing_transitions: [realRow({ id: 1, at: "2026-08-01", address_key: "real-midnight" })],
        listing_state: [],
        agent_feed_test_events: [
          {
            id: 1,
            address: "mid-day test",
            address_key: "test-noon",
            sale_or_rent: "sale",
            from_state: "active",
            to_state: "pending",
            price_delta: null,
            at: "2026-08-01T12:00:00.000Z",
          },
        ],
      },
      dateCols: { listing_transitions: new Set(["at"]) },
    };

    const page1 = await fetchTransitionCandidates(BEGINNING, 50);
    const sorted = [...page1].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id - b.id));
    expect(sorted.map((e) => e.address_key)).toEqual(["real-midnight", "test-noon"]);

    // Advance the cursor past real-midnight; test-noon (same calendar day, later time) must
    // still come back.
    const midCursor = { at: sorted[0].at, id: sorted[0].id };
    const page2 = await fetchTransitionCandidates(midCursor, 50);
    const keys = page2.map((e) => e.address_key);
    expect(keys).toContain("test-noon");
    expect(keys).not.toContain("real-midnight");
  });

  test("[finding 3, MEDIUM-HIGH] same-day real+test mix pages correctly, test-then-next-day-real order", async () => {
    // Symmetric case: a test row on day 1 must not shadow a real row on day 2 once the
    // cursor advances past it -- the cross-precision comparison has to hold in both
    // directions, not just the one the first test happens to exercise.
    fakeDb = {
      tables: {
        listing_transitions: [realRow({ id: 1, at: "2026-08-02", address_key: "real-next-day" })],
        listing_state: [],
        agent_feed_test_events: [
          {
            id: 1,
            address: "day-one test",
            address_key: "test-day-one",
            sale_or_rent: "sale",
            from_state: "active",
            to_state: "pending",
            price_delta: null,
            at: "2026-08-01T12:00:00.000Z",
          },
        ],
      },
      dateCols: { listing_transitions: new Set(["at"]) },
    };

    const page1 = await fetchTransitionCandidates(BEGINNING, 50);
    const sorted = [...page1].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id - b.id));
    expect(sorted.map((e) => e.address_key)).toEqual(["test-day-one", "real-next-day"]);

    const midCursor = { at: sorted[0].at, id: sorted[0].id };
    const page2 = await fetchTransitionCandidates(midCursor, 50);
    const keys = page2.map((e) => e.address_key);
    expect(keys).toContain("real-next-day");
    expect(keys).not.toContain("test-day-one");
  });
});
