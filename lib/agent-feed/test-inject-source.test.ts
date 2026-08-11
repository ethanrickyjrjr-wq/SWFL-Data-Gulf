// lib/agent-feed/test-inject-source.test.ts
// Guards the review fixes on Task 4 (hermes-email-driver spec 2026-08-10) that the
// route-level mock (app/api/agent-feed/test-inject/route.test.ts) cannot exercise, because
// that file mocks isDemoScopedAddress/normalizedAddressKey wholesale. This suite runs the
// REAL functions against a fake Supabase-like client (auth.admin.listUsers plus a
// .from("projects") query builder), mirroring the precedent
// lib/agent-feed/transitions-source.test.ts already set on Task 3 -- a route mock hid a
// query bug; test the real module against a fake DB instead. Same class of finding here: a
// route-level mock of isDemoScopedAddress can never catch a bug INSIDE its own query
// construction (e.g. missing the user_id filter) or inside normalizedAddressKey's ZIP
// extraction.
//
//   1. finding 1 (MEDIUM-HIGH): normalizedAddressKey must extract the LAST 5-digit run as
//      the ZIP, not the first -- SWFL addresses commonly carry a 5-digit HOUSE NUMBER
//      (Cape Coral, Golden Gate Estates grids) that a naive first-match regex would grab
//      instead of the real trailing ZIP. Verified against lib/listings/address-key.ts's
//      addressKey directly, not a hand-computed expected string.
//   2. finding 3, part 2: an address with NO 5-digit run anywhere fails CLOSED -- the
//      computed key carries an empty ZIP, which can never coincidentally match a demo
//      project whose subject_address DOES carry a real ZIP.
//   3. finding 3, part 3: the demo-scope query filters on user_id, not just kind=listing --
//      an otherwise-identical address owned by a DIFFERENT user_id must never scope as the
//      demo account's own, and the SAME address under the demo user_id must.
import { describe, expect, test, mock } from "bun:test";
import { addressKey } from "@/lib/listings/address-key";

interface FakeUser {
  id: string;
  email: string;
}
interface FakeProject {
  user_id: string;
  kind: string;
  subject_address: string | null;
}
interface FakeDb {
  users: FakeUser[];
  projects: FakeProject[];
}

class FakeProjectsQuery implements PromiseLike<{ data: FakeProject[]; error: null }> {
  private filters: Array<(r: FakeProject) => boolean> = [];
  constructor(private rows: FakeProject[]) {}
  select(_cols: string) {
    return this;
  }
  eq(col: keyof FakeProject, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  then<TResult1 = { data: FakeProject[]; error: null }, TResult2 = never>(
    onfulfilled?:
      ((value: { data: FakeProject[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const result = this.rows.filter((r) => this.filters.every((f) => f(r)));
    const resolved = { data: result, error: null };
    return Promise.resolve(onfulfilled ? onfulfilled(resolved) : (resolved as unknown as TResult1));
  }
}

function makeFakeClient(db: FakeDb) {
  return {
    auth: {
      admin: {
        listUsers: async ({ page, perPage }: { page: number; perPage: number }) => {
          const start = (page - 1) * perPage;
          const users = db.users.slice(start, start + perPage);
          return { data: { users }, error: null };
        },
      },
    },
    from(table: string) {
      if (table !== "projects") {
        throw new Error("fake client: unexpected table " + JSON.stringify(table));
      }
      return new FakeProjectsQuery(db.projects);
    },
  };
}

let fakeDb: FakeDb = { users: [], projects: [] };

mock.module("@/utils/supabase/service-role", () => ({
  createServiceRoleClientUntyped: () => makeFakeClient(fakeDb),
}));

const { normalizedAddressKey, isDemoScopedAddress } = await import("./test-inject-source");

describe("normalizedAddressKey (real function, no mock)", () => {
  test("finding 1: 5-digit HOUSE NUMBER plus real ZIP -> the LAST 5-digit run wins, not the first", () => {
    const full = "12345 Ocean Blvd, Naples, FL 34102";
    expect(normalizedAddressKey(full)).toBe(addressKey("12345 Ocean Blvd", "34102"));
  });

  test("finding 1: matches lib/listings/address-key.ts addressKey directly for a normal address too", () => {
    const full = "1403 NE 19th Ter, Cape Coral, FL 33909";
    expect(normalizedAddressKey(full)).toBe(addressKey("1403 NE 19th Ter", "33909"));
  });

  test("address with no 5-digit run anywhere computes a key with an empty ZIP, deterministically", () => {
    const noZip = "123 Demo Ln, Fort Myers, FL";
    expect(normalizedAddressKey(noZip)).toBe(addressKey("123 Demo Ln", ""));
  });
});

describe("isDemoScopedAddress (real function, fake Supabase client)", () => {
  test("finding 3: fails CLOSED when the posted address carries no ZIP -- never a fluke match", async () => {
    fakeDb = {
      users: [{ id: "demo-1", email: "allstatecoop@gmail.com" }],
      projects: [
        {
          user_id: "demo-1",
          kind: "listing",
          subject_address: "12345 Ocean Blvd, Naples, FL 34102",
        },
      ],
    };
    const allowed = await isDemoScopedAddress("12345 Ocean Blvd, Naples, FL");
    expect(allowed).toBe(false);
  });

  test("finding 3: demo-scope query filters on user_id -- a matching address owned by a different user never scopes as demo", async () => {
    fakeDb = {
      users: [{ id: "demo-1", email: "allstatecoop@gmail.com" }],
      projects: [
        {
          user_id: "real-account-999",
          kind: "listing",
          subject_address: "500 Gulf Shore Blvd, Naples, FL 34102",
        },
      ],
    };
    const allowed = await isDemoScopedAddress("500 Gulf Shore Blvd, Naples, FL 34102");
    expect(allowed).toBe(false);
  });

  test("finding 3: the SAME address under the demo user_id DOES scope as demo", async () => {
    fakeDb = {
      users: [{ id: "demo-1", email: "allstatecoop@gmail.com" }],
      projects: [
        {
          user_id: "demo-1",
          kind: "listing",
          subject_address: "500 Gulf Shore Blvd, Naples, FL 34102",
        },
      ],
    };
    const allowed = await isDemoScopedAddress("500 Gulf Shore Blvd, Naples, FL 34102");
    expect(allowed).toBe(true);
  });

  test("kind filter: a non-listing project owned by the demo user never scopes", async () => {
    fakeDb = {
      users: [{ id: "demo-1", email: "allstatecoop@gmail.com" }],
      projects: [
        {
          user_id: "demo-1",
          kind: "general",
          subject_address: "500 Gulf Shore Blvd, Naples, FL 34102",
        },
      ],
    };
    const allowed = await isDemoScopedAddress("500 Gulf Shore Blvd, Naples, FL 34102");
    expect(allowed).toBe(false);
  });

  test("no demo user resolvable (email miss) fails closed, never throws", async () => {
    fakeDb = {
      users: [{ id: "someone-else", email: "not-the-demo@example.com" }],
      projects: [],
    };
    const allowed = await isDemoScopedAddress("500 Gulf Shore Blvd, Naples, FL 34102");
    expect(allowed).toBe(false);
  });
});
