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

class FakeProjectsQuery {
  private filters: Array<(r: FakeProjectRow) => boolean> = [];
  constructor(private rows: FakeProjectRow[]) {}
  select(_cols: string) {
    return this;
  }
  eq(col: keyof FakeProjectRow, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  then<TResult1 = { data: FakeProjectRow[]; error: null }, TResult2 = never>(
    onfulfilled?:
      ((value: { data: FakeProjectRow[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const result = this.rows.filter((r) => this.filters.every((f) => f(r)));
    const resolved = { data: result, error: null };
    return Promise.resolve(onfulfilled ? onfulfilled(resolved) : (resolved as unknown as TResult1));
  }
}

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

const { findProjectId, insertDraft, recordDraftOnLedger, lookupDuplicateDraft } =
  await import("./persist");

describe("findProjectId (real function, fake Supabase client)", () => {
  test("matches a listing project owned by userId whose subject_address normalizes the same", async () => {
    fakeDb = {
      projects: [
        {
          id: "proj-1",
          user_id: "user-1",
          kind: "listing",
          subject_address: "1275 Carlene Ave, Fort Myers, FL 33901",
        },
      ],
      deliverables: [],
      ledger: [],
    };
    const id = await findProjectId("user-1", "1275 Carlene Ave, Fort Myers, FL 33901");
    expect(id).toBe("proj-1");
  });

  test("never matches a project owned by a DIFFERENT userId, even with the same address", async () => {
    fakeDb = {
      projects: [
        {
          id: "proj-1",
          user_id: "someone-else",
          kind: "listing",
          subject_address: "1275 Carlene Ave, Fort Myers, FL 33901",
        },
      ],
      deliverables: [],
      ledger: [],
    };
    const id = await findProjectId("user-1", "1275 Carlene Ave, Fort Myers, FL 33901");
    expect(id).toBeNull();
  });

  test("no matching project -> null, never guesses", async () => {
    fakeDb = { projects: [], deliverables: [], ledger: [] };
    const id = await findProjectId("user-1", "1 Nowhere Rd, Fort Myers, FL 33901");
    expect(id).toBeNull();
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

describe("recordDraftOnLedger + lookupDuplicateDraft round trip (real functions, fake client)", () => {
  test("linking a draft then looking it up returns the draft id + recipe_key", async () => {
    fakeDb = {
      projects: [],
      deliverables: [{ id: "draft-1", recipe_key: "just-sold", deleted_at: null }],
      ledger: [
        {
          idempotency_key: "agent-build:KEY:sale:sold:2026-08-10T12:00:00.000Z",
          broadcast_id: null,
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
      ledger: [{ idempotency_key: "agent-build:KEY:sale:sold:AT", broadcast_id: null }],
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
      ledger: [{ idempotency_key: "agent-build:KEY:sale:sold:AT", broadcast_id: "draft-1" }],
    };
    const dup = await lookupDuplicateDraft("agent-build:KEY:sale:sold:AT");
    expect(dup).toBeNull();
  });
});
