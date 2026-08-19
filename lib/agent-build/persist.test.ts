// lib/agent-build/persist.test.ts
// Runs the REAL persist.ts functions against a fake Supabase-like client, mirroring the
// precedent lib/agent-feed/test-inject-source.test.ts already set: the route-level mock
// (app/api/agent/build/route.test.ts) mocks this whole module away, so it can never catch a
// bug INSIDE findProjectId's own query construction, insertDraft's EmailDocSchema guard, or
// the broadcast_id link/lookup round trip. defaultDoc() (real, unmocked) supplies a
// genuinely schema-valid EmailDoc so the parse-success path is exercised against the real
// schema, not a hand-rolled fixture that might drift from it.
import { describe, expect, test, mock } from "bun:test";
import { defaultDoc } from "@/lib/email/doc/default-docs";

interface FakeProjectRow {
  id: string;
  user_id: string;
  kind: string;
  subject_address: string | null;
  updated_at: string;
}
interface FakeDeliverableRow {
  id: string;
  recipe_key: string | null;
  deleted_at: string | null;
  [key: string]: unknown;
}
interface FakeLedgerRow {
  idempotency_key: string;
  broadcast_id: string | null;
  created_at: string;
}
interface FakeDb {
  projects: FakeProjectRow[];
  deliverables: FakeDeliverableRow[];
  ledger: FakeLedgerRow[];
}

class ThenableQuery<T> implements PromiseLike<{ data: T; error: null }> {
  constructor(private resolve_: () => T) {}
  then<TResult1 = { data: T; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: T; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const resolved = { data: this.resolve_(), error: null };
    return Promise.resolve(onfulfilled ? onfulfilled(resolved) : (resolved as unknown as TResult1));
  }
}

// L1 fix coverage: findProjectId now chains .order() + .limit() onto the projects query
// (PostgREST max-rows truncation guard). This fake models both as real, order-respecting
// operations (not no-ops) so a regression that drops the ordering, or shrinks the effective
// limit below the fixture size, would show up as a wrong/missing match here.
class FakeProjectsQuery {
  private filters: Array<(r: FakeProjectRow) => boolean> = [];
  private orderCol: keyof FakeProjectRow | null = null;
  private orderAsc = true;
  private limitN: number | undefined;
  constructor(private rows: FakeProjectRow[]) {}
  select(_cols: string) {
    return this;
  }
  eq(col: keyof FakeProjectRow, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  order(col: keyof FakeProjectRow, opts: { ascending: boolean }) {
    this.orderCol = col;
    this.orderAsc = opts.ascending;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  then<TResult1 = { data: FakeProjectRow[]; error: null }, TResult2 = never>(
    onfulfilled?:
      ((value: { data: FakeProjectRow[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    let result = this.rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.orderCol) {
      const col = this.orderCol;
      result = [...result].sort((a, b) => {
        const cmp = String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0;
        return this.orderAsc ? cmp : -cmp;
      });
    }
    if (this.limitN != null) result = result.slice(0, this.limitN);
    // Error injection (08/19/2026 husk-bug coverage): a real PostgREST failure returns
    // { data: null, error } — findProjectId must fail CLOSED on it, never guess.
    const resolved = fakeProjectsQueryError
      ? {
          data: null as unknown as FakeProjectRow[],
          error: fakeProjectsQueryError as unknown as null,
        }
      : { data: result, error: null };
    return Promise.resolve(onfulfilled ? onfulfilled(resolved) : (resolved as unknown as TResult1));
  }
}

// Set by a test to make the NEXT projects query fail like a live PostgREST error.
let fakeProjectsQueryError: { message: string } | null = null;

class FakeDeliverablesTable {
  constructor(private db: FakeDb) {}
  insert(row: FakeDeliverableRow) {
    return new ThenableQuery(() => {
      this.db.deliverables.push(row);
      return null;
    });
  }
  select(_cols: string) {
    return new FakeDeliverableSelect(this.db.deliverables);
  }
}
class FakeDeliverableSelect {
  private filters: Array<(r: FakeDeliverableRow) => boolean> = [];
  constructor(private rows: FakeDeliverableRow[]) {}
  eq(col: keyof FakeDeliverableRow, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  maybeSingle() {
    const hit = this.rows.find((r) => this.filters.every((f) => f(r))) ?? null;
    return Promise.resolve({ data: hit, error: null });
  }
}

class FakeLedgerTable {
  constructor(private db: FakeDb) {}
  update(patch: Partial<FakeLedgerRow>) {
    return new FakeLedgerUpdate(this.db.ledger, patch);
  }
  select(_cols: string) {
    return new FakeLedgerSelect(this.db.ledger);
  }
}
// L3 fix coverage: a real PostgREST UPDATE that matches zero rows returns `error: null` too
// -- it is not an error to update nothing. The fake now models `.select()` chained after
// `.update()` (as persist.ts's recordDraftOnLedger does) by returning ONLY the rows that
// actually matched the filter, so a test can distinguish "I linked 1 row" from "I matched 0
// rows and silently did nothing" -- the exact gap the fix closes.
class FakeLedgerUpdate {
  private filters: Array<(r: FakeLedgerRow) => boolean> = [];
  constructor(
    private rows: FakeLedgerRow[],
    private patch: Partial<FakeLedgerRow>,
  ) {}
  eq(col: keyof FakeLedgerRow, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  select(_cols: string) {
    return new FakeLedgerUpdateThenSelect(this.rows, this.filters, this.patch);
  }
  // Support calling recordDraftOnLedger-shaped code that awaits WITHOUT .select() too
  // (not used by persist.ts today, but keeps the fake honest about the real API shape).
  then<TResult1 = { error: null }, TResult2 = never>(
    onfulfilled?: ((value: { error: null }) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    for (const row of this.rows) {
      if (this.filters.every((f) => f(row))) Object.assign(row, this.patch);
    }
    const resolved = { error: null };
    return Promise.resolve(onfulfilled ? onfulfilled(resolved) : (resolved as unknown as TResult1));
  }
}
class FakeLedgerUpdateThenSelect implements PromiseLike<{ data: FakeLedgerRow[]; error: null }> {
  constructor(
    private rows: FakeLedgerRow[],
    private filters: Array<(r: FakeLedgerRow) => boolean>,
    private patch: Partial<FakeLedgerRow>,
  ) {}
  then<TResult1 = { data: FakeLedgerRow[]; error: null }, TResult2 = never>(
    onfulfilled?:
      ((value: { data: FakeLedgerRow[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const matched: FakeLedgerRow[] = [];
    for (const row of this.rows) {
      if (this.filters.every((f) => f(row))) {
        Object.assign(row, this.patch);
        matched.push(row);
      }
    }
    const resolved = { data: matched, error: null };
    return Promise.resolve(onfulfilled ? onfulfilled(resolved) : (resolved as unknown as TResult1));
  }
}
class FakeLedgerSelect {
  private filters: Array<(r: FakeLedgerRow) => boolean> = [];
  constructor(private rows: FakeLedgerRow[]) {}
  eq(col: keyof FakeLedgerRow, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  maybeSingle() {
    const hit = this.rows.find((r) => this.filters.every((f) => f(r))) ?? null;
    return Promise.resolve({ data: hit, error: null });
  }
}

function makeFakeClient(db: FakeDb) {
  return {
    from(table: string) {
      if (table === "projects") return new FakeProjectsQuery(db.projects);
      if (table === "deliverables") return new FakeDeliverablesTable(db);
      if (table === "email_send_ledger") return new FakeLedgerTable(db);
      throw new Error("fake client: unexpected table " + JSON.stringify(table));
    },
  };
}

let fakeDb: FakeDb = { projects: [], deliverables: [], ledger: [] };

mock.module("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => makeFakeClient(fakeDb),
  createServiceRoleClientUntyped: () => makeFakeClient(fakeDb),
}));

const { findProjectId, insertDraft, recordDraftOnLedger, lookupDuplicateDraft, findLedgerClaim } =
  await import("./persist");

describe("findProjectId (real function, fake Supabase client)", () => {
  test("matches a listing project owned by userId whose subject_address normalizes the same, returns projectId + the stored subjectAddress", async () => {
    fakeDb = {
      projects: [
        {
          id: "proj-1",
          user_id: "user-1",
          kind: "listing",
          subject_address: "1275 Carlene Ave, Fort Myers, FL 33901",
          updated_at: "2026-08-01T00:00:00Z",
        },
      ],
      deliverables: [],
      ledger: [],
    };
    const match = await findProjectId("user-1", "1275 Carlene Ave, Fort Myers, FL 33901");
    expect(match).toEqual({
      projectId: "proj-1",
      subjectAddress: "1275 Carlene Ave, Fort Myers, FL 33901",
    });
  });

  // L2 fix coverage: the returned subjectAddress is the PROJECT'S OWN stored value, not a
  // copy of whatever string the caller searched with -- proven by searching with a
  // cosmetically different (but address_key-equivalent) string.
  test("L2: returns the PROJECT'S stored subject_address even when the search string differs cosmetically", async () => {
    fakeDb = {
      projects: [
        {
          id: "proj-1",
          user_id: "user-1",
          kind: "listing",
          subject_address: "1275 Carlene Ave, Fort Myers, FL 33901",
          updated_at: "2026-08-01T00:00:00Z",
        },
      ],
      deliverables: [],
      ledger: [],
    };
    const match = await findProjectId("user-1", "1275 Carlene Avenue, Fort Myers, FL 33901");
    expect(match?.subjectAddress).toBe("1275 Carlene Ave, Fort Myers, FL 33901");
  });

  test("never matches a project owned by a DIFFERENT userId, even with the same address", async () => {
    fakeDb = {
      projects: [
        {
          id: "proj-1",
          user_id: "someone-else",
          kind: "listing",
          subject_address: "1275 Carlene Ave, Fort Myers, FL 33901",
          updated_at: "2026-08-01T00:00:00Z",
        },
      ],
      deliverables: [],
      ledger: [],
    };
    const match = await findProjectId("user-1", "1275 Carlene Ave, Fort Myers, FL 33901");
    expect(match).toBeNull();
  });

  test("no matching project -> null, never guesses", async () => {
    fakeDb = { projects: [], deliverables: [], ledger: [] };
    const match = await findProjectId("user-1", "1 Nowhere Rd, Fort Myers, FL 33901");
    expect(match).toBeNull();
  });

  // L1 fix coverage: the query is ordered + bounded (PROJECT_SCAN_LIMIT), not an unbounded
  // scan -- a match still succeeds correctly with several candidate rows present, and the
  // fake's .order()/.limit() are real (not no-ops), so a regression that drops either call
  // would still need to keep the OTHER row(s) from accidentally matching instead.
  test("L1: matches correctly among several other listing projects, with .order()/.limit() on the query", async () => {
    fakeDb = {
      projects: [
        {
          id: "proj-old",
          user_id: "user-1",
          kind: "listing",
          subject_address: "1 Old St, Fort Myers, FL 33901",
          updated_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "proj-1",
          user_id: "user-1",
          kind: "listing",
          subject_address: "1275 Carlene Ave, Fort Myers, FL 33901",
          updated_at: "2026-08-01T00:00:00Z",
        },
        {
          // 08/19/2026: kind no longer filters (address-titled generals are real targets) —
          // this row is a NON-match by ADDRESS so the test still proves ordering/limit alone.
          id: "proj-other-kind",
          user_id: "user-1",
          kind: "general",
          subject_address: "9 Unrelated Rd, Fort Myers, FL 33901",
          updated_at: "2026-08-01T00:00:00Z",
        },
      ],
      deliverables: [],
      ledger: [],
    };
    const match = await findProjectId("user-1", "1275 Carlene Ave, Fort Myers, FL 33901");
    expect(match?.projectId).toBe("proj-1");
  });

  // 08/19/2026 husk/grouping fix: address-titled projects born through older doors are
  // kind:"general" with subject_address set (or backfilled) — the old .eq("kind","listing")
  // made every one of them invisible, so agent builds for a known address scattered
  // instead of grouping. A subject_address match IS the listing signal.
  test("kind:'general' project with a matching subject_address IS matched — generals group agent builds", async () => {
    fakeDb = {
      projects: [
        {
          id: "proj-general",
          user_id: "user-1",
          kind: "general",
          subject_address: "326 Shore Dr, Fort Myers, FL 33905",
          updated_at: "2026-08-10T00:00:00Z",
        },
      ],
      deliverables: [],
      ledger: [],
    };
    const match = await findProjectId("user-1", "326 Shore Drive, Fort Myers, FL 33905");
    expect(match).toEqual({
      projectId: "proj-general",
      subjectAddress: "326 Shore Dr, Fort Myers, FL 33905",
    });
  });

  // The 08/19/2026 husk bug's invariant, at the one seam this suite can reach: a FAILED
  // query is not an empty result. findProjectId must return null (fail closed), and the
  // caller 404s — it must never treat the error as "no such project, mint/guess one".
  test("query error -> null (fail closed), even when a matching row exists behind the error", async () => {
    fakeDb = {
      projects: [
        {
          id: "proj-1",
          user_id: "user-1",
          kind: "listing",
          subject_address: "1275 Carlene Ave, Fort Myers, FL 33901",
          updated_at: "2026-08-01T00:00:00Z",
        },
      ],
      deliverables: [],
      ledger: [],
    };
    fakeProjectsQueryError = { message: "connection slots exhausted" };
    try {
      expect(await findProjectId("user-1", "1275 Carlene Ave, Fort Myers, FL 33901")).toBeNull();
    } finally {
      fakeProjectsQueryError = null;
    }
  });
});

describe("insertDraft (real function, fake Supabase client)", () => {
  test("a schema-valid EmailDoc (defaultDoc()) inserts and returns the new id", async () => {
    fakeDb = { projects: [], deliverables: [], ledger: [] };
    const draftId = await insertDraft({
      projectId: "proj-1",
      userId: "user-1",
      recipeKey: "just-sold",
      doc: defaultDoc(),
    });
    expect(draftId).not.toBeNull();
    expect(fakeDb.deliverables.length).toBe(1);
    expect(fakeDb.deliverables[0]).toMatchObject({
      project_id: "proj-1",
      user_id: "user-1",
      template: "block-canvas",
      recipe_key: "just-sold",
      status: "ready",
    });
  });

  test("a schema-INVALID doc (empty object) -> null, never inserts", async () => {
    fakeDb = { projects: [], deliverables: [], ledger: [] };
    const draftId = await insertDraft({
      projectId: "proj-1",
      userId: "user-1",
      recipeKey: "just-sold",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      doc: {} as any,
    });
    expect(draftId).toBeNull();
    expect(fakeDb.deliverables.length).toBe(0);
  });
});

describe("recordDraftOnLedger (real function, fake Supabase client)", () => {
  test("matching key -> updates the row and returns linked:true", async () => {
    fakeDb = {
      projects: [],
      deliverables: [],
      ledger: [
        {
          idempotency_key: "agent-build:KEY:sale:sold:AT",
          broadcast_id: null,
          created_at: "2026-08-10T12:00:00.000Z",
        },
      ],
    };
    const linked = await recordDraftOnLedger("agent-build:KEY:sale:sold:AT", "draft-1");
    expect(linked).toBe(true);
    expect(fakeDb.ledger[0].broadcast_id).toBe("draft-1");
  });

  // L3 fix coverage: a key with NO matching ledger row updates zero rows. Before the fix,
  // this returned true (a bare `!error` check, and a zero-row UPDATE has no error). Now it
  // must return false -- a real assertion that a link happened, not an error-absence guess.
  test("L3: key matches ZERO ledger rows -> returns linked:false (not a false-positive true)", async () => {
    fakeDb = { projects: [], deliverables: [], ledger: [] };
    const linked = await recordDraftOnLedger("agent-build:NOPE:sale:sold:AT", "draft-1");
    expect(linked).toBe(false);
  });
});

describe("findLedgerClaim (real function, fake Supabase client) -- H1 fix", () => {
  test("returns broadcast_id + created_at for an existing ledger row", async () => {
    fakeDb = {
      projects: [],
      deliverables: [],
      ledger: [
        {
          idempotency_key: "agent-build:KEY:sale:sold:AT",
          broadcast_id: "draft-1",
          created_at: "2026-08-10T12:00:00.000Z",
        },
      ],
    };
    const claim = await findLedgerClaim("agent-build:KEY:sale:sold:AT");
    expect(claim).toEqual({ broadcastId: "draft-1", createdAt: "2026-08-10T12:00:00.000Z" });
  });

  test("no ledger row for the key -> null", async () => {
    fakeDb = { projects: [], deliverables: [], ledger: [] };
    const claim = await findLedgerClaim("agent-build:NOPE:sale:sold:AT");
    expect(claim).toBeNull();
  });

  test("row exists but was never linked -> broadcastId null, createdAt still returned", async () => {
    fakeDb = {
      projects: [],
      deliverables: [],
      ledger: [
        {
          idempotency_key: "agent-build:KEY:sale:sold:AT",
          broadcast_id: null,
          created_at: "2026-08-10T00:00:00.000Z",
        },
      ],
    };
    const claim = await findLedgerClaim("agent-build:KEY:sale:sold:AT");
    expect(claim).toEqual({ broadcastId: null, createdAt: "2026-08-10T00:00:00.000Z" });
  });
});

describe("recordDraftOnLedger + lookupDuplicateDraft round trip (real functions, fake client)", () => {
  test("linking a draft then looking it up returns the draft id + recipe_key", async () => {
    fakeDb = {
      projects: [],
      deliverables: [{ id: "draft-1", recipe_key: "just-sold", deleted_at: null }],
      ledger: [
        {
          idempotency_key: "agent-build:KEY:sale:sold:2026-08-10T12:00:00.000Z",
          broadcast_id: null,
          created_at: "2026-08-10T12:00:00.000Z",
        },
      ],
    };
    const linked = await recordDraftOnLedger(
      "agent-build:KEY:sale:sold:2026-08-10T12:00:00.000Z",
      "draft-1",
    );
    expect(linked).toBe(true);
    const dup = await lookupDuplicateDraft("agent-build:KEY:sale:sold:2026-08-10T12:00:00.000Z");
    expect(dup).toEqual({ draftId: "draft-1", recipeKey: "just-sold" });
  });

  test("no ledger row for the key -> null (not yet claimed, or a different key)", async () => {
    fakeDb = { projects: [], deliverables: [], ledger: [] };
    const dup = await lookupDuplicateDraft("agent-build:NOPE:sale:sold:2026-08-10T12:00:00.000Z");
    expect(dup).toBeNull();
  });

  test("ledger row exists but was never linked (broadcast_id null) -> null, the genuine race case", async () => {
    fakeDb = {
      projects: [],
      deliverables: [],
      ledger: [
        {
          idempotency_key: "agent-build:KEY:sale:sold:AT",
          broadcast_id: null,
          created_at: "2026-08-10T12:00:00.000Z",
        },
      ],
    };
    const dup = await lookupDuplicateDraft("agent-build:KEY:sale:sold:AT");
    expect(dup).toBeNull();
  });

  test("linked draft was soft-trashed (deleted_at set) -> null, never hands back a dead draft", async () => {
    fakeDb = {
      projects: [],
      deliverables: [
        { id: "draft-1", recipe_key: "just-sold", deleted_at: "2026-08-10T00:00:00Z" },
      ],
      ledger: [
        {
          idempotency_key: "agent-build:KEY:sale:sold:AT",
          broadcast_id: "draft-1",
          created_at: "2026-08-10T12:00:00.000Z",
        },
      ],
    };
    const dup = await lookupDuplicateDraft("agent-build:KEY:sale:sold:AT");
    expect(dup).toBeNull();
  });
});
