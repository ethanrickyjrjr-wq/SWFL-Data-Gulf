// lib/figures/find.test.ts
// Contract tests with gap-fill and the db MOCKED — no paid calls, no network.
import { describe, expect, test } from "bun:test";
import { findFigure, type FindDeps } from "./find";
import { findGap } from "./metric-gaps";

interface FakeDbOpts {
  cachedRow?: Record<string, unknown> | null;
  todayCount?: number;
}

/** Minimal stub of the supabase chain findFigure uses. Records upserts. */
function fakeDb(opts: FakeDbOpts) {
  const upserts: unknown[] = [];
  const db = {
    upserts,
    from: () => ({
      select: (_cols: string, sel?: { count?: string; head?: boolean }) => {
        if (sel?.head) {
          // daily-cap count query: .gte() resolves the builder
          return { gte: async () => ({ count: opts.todayCount ?? 0, error: null }) };
        }
        // cache query: .eq().eq().eq().gt().maybeSingle()
        const chain = {
          eq: () => chain,
          gt: () => chain,
          maybeSingle: async () => ({ data: opts.cachedRow ?? null, error: null }),
        };
        return chain;
      },
      upsert: async (row: unknown) => {
        upserts.push(row);
        return { error: null };
      },
    }),
  };
  return db;
}

const deps = (db: ReturnType<typeof fakeDb>, fill?: FindDeps["fill"]): FindDeps => ({
  db: db as unknown as NonNullable<FindDeps["db"]>,
  fill: fill ?? (async () => null),
  now: () => new Date("2026-07-03T15:00:00Z"),
});

describe("findGap allowlist", () => {
  test("allowlisted (permits_90d, Cape Coral ZIP) hits", () => {
    expect(findGap("permits_90d", "33914")).not.toBeNull();
  });
  test("non-allowlisted metric or ZIP → null", () => {
    expect(findGap("median_sale_price", "33914")).toBeNull();
    expect(findGap("permits_90d", "33901")).toBeNull();
  });
});

describe("findFigure", () => {
  test("not-allowlisted request → not_allowed, no db/fill touched", async () => {
    const db = fakeDb({});
    const r = await findFigure("33901", "permits_90d", deps(db));
    expect(r).toEqual({ ok: false, reason: "not_allowed" });
  });

  test("unexpired cache row → returned cached, fill never called", async () => {
    let fillCalled = false;
    const db = fakeDb({
      cachedRow: {
        metric_key: "permits_90d",
        label: "New building permits issued in ZIP 33914 (Cape Coral), last 90 days",
        value_num: 412,
        value_text: "412",
        unit: null,
        source_name: "capecoral.gov",
        source_url: "https://www.capecoral.gov/x",
        as_of: null,
      },
    });
    const r = await findFigure(
      "33914",
      "permits_90d",
      deps(db, async () => {
        fillCalled = true;
        return null;
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cached).toBe(true);
      expect(r.figure.value).toBe("412");
      expect(r.figure.source).toBe("capecoral.gov");
    }
    expect(fillCalled).toBe(false);
  });

  test("global daily cap reached → capped, fill never called", async () => {
    let fillCalled = false;
    const db = fakeDb({ todayCount: 9999 });
    const r = await findFigure(
      "33914",
      "permits_90d",
      deps(db, async () => {
        fillCalled = true;
        return null;
      }),
    );
    expect(r).toEqual({ ok: false, reason: "capped" });
    expect(fillCalled).toBe(false);
  });

  test("cold hit: verified point → upserted + returned with named source", async () => {
    const db = fakeDb({});
    const r = await findFigure(
      "33914",
      "permits_90d",
      deps(db, async () => ({
        label: "x",
        value: 412,
        url: "https://www.capecoral.gov/permit-report",
        cited_text: "the city issued 412 permits",
      })),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cached).toBe(false);
      expect(r.figure.value).toBe("412");
      expect(r.figure.source).toBe("capecoral.gov");
      expect(r.figure.source_url).toBe("https://www.capecoral.gov/permit-report");
    }
    expect(db.upserts.length).toBe(1);
    const row = db.upserts[0] as Record<string, unknown>;
    expect(row.scope_kind).toBe("zip");
    expect(row.scope_key).toBe("33914");
    expect(row.metric_key).toBe("permits_90d");
    expect(row.cited_text).toBe("the city issued 412 permits");
  });

  test("cold miss → honest not_found with the real issuing-source pointer", async () => {
    const db = fakeDb({});
    const r = await findFigure("33914", "permits_90d", deps(db));
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === "not_found") {
      expect(r.pointer.name).toBe("City of Cape Coral permitting");
      expect(r.pointer.url).toBe("https://www.capecoral.gov/");
    } else {
      throw new Error(`expected not_found, got ${JSON.stringify(r)}`);
    }
    expect(db.upserts.length).toBe(0);
  });
});
