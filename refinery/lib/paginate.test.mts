/**
 * Coverage for selectAllPaged — the shared PostgREST pagination helper that
 * defeats the silent db-max-rows=1000 cap. The cases that motivate it:
 *   - assembling a >1000-row result across pages with no dupes/skips
 *   - terminating on the out-of-bounds page (both empty-200 AND PGRST103/416
 *     shapes — the live boundary is empty-200 here, but the helper must not
 *     throw if a config returns 416)
 *   - passing multi-column order through so a composite-key seam is stable
 *   - surfacing real (non-range) errors
 *   - failing loud past the maxRows ceiling instead of looping forever
 */

import { test } from "bun:test";
import assert from "node:assert/strict";
import {
  selectAllPaged,
  type PagedQuery,
  type PagedResult,
} from "./paginate.mts";

type Row = Record<string, number>;

function cmp(a: Row, b: Row, cols: string[]): number {
  for (const c of cols) {
    const av = a[c] ?? 0;
    const bv = b[c] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/**
 * Test double for a Supabase query builder: behaves like the DB under
 * .order().range() — stable-sorts by the order cols, slices [from..to]
 * inclusive. Options simulate the two boundary shapes and a hard error.
 */
function fakeTable(
  rows: Row[],
  opts: {
    /** When set, return this on an out-of-bounds page instead of empty-200. */
    outOfBounds?: PagedResult<Row>;
    /** When set, every range() call returns this error (first-page failure). */
    errorAlways?: PagedResult<Row>;
  } = {},
): () => PagedQuery<Row> {
  return () => {
    const orderCols: string[] = [];
    const q: PagedQuery<Row> = {
      order(col: string) {
        orderCols.push(col);
        return q;
      },
      range(from: number, to: number) {
        if (opts.errorAlways) return Promise.resolve(opts.errorAlways);
        const sorted = [...rows].sort((a, b) => cmp(a, b, orderCols));
        if (from >= sorted.length && opts.outOfBounds) {
          return Promise.resolve(opts.outOfBounds);
        }
        return Promise.resolve({
          data: sorted.slice(from, to + 1),
          error: null,
        });
      },
    };
    return q;
  };
}

const ids = (rows: Row[]) => rows.map((r) => r.id);
const range = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: i }));

test("assembles all rows across pages with a short final page", async () => {
  const out = await selectAllPaged(fakeTable(range(2500)), "id", {
    pageSize: 1000,
  });
  assert.equal(out.length, 2500);
  assert.deepEqual(
    ids(out),
    range(2500).map((r) => r.id),
  ); // in order
  assert.equal(new Set(ids(out)).size, 2500); // no dupes
});

test("exact-multiple-of-pageSize terminates via trailing empty-200 page", async () => {
  // 2000 rows / 1000 = pages return 1000,1000,then an out-of-bounds page.
  const out = await selectAllPaged(fakeTable(range(2000)), "id", {
    pageSize: 1000,
  });
  assert.equal(out.length, 2000);
  assert.equal(new Set(ids(out)).size, 2000);
});

test("exact-multiple with PGRST103 on the out-of-bounds page terminates cleanly", async () => {
  const out = await selectAllPaged(
    fakeTable(range(2000), {
      outOfBounds: {
        data: null,
        error: { code: "PGRST103", message: "Requested range not satisfiable" },
      },
    }),
    "id",
    { pageSize: 1000 },
  );
  assert.equal(out.length, 2000); // did not throw; returned the full set
});

test("empty table returns an empty array", async () => {
  const out = await selectAllPaged(fakeTable([]), "id", { pageSize: 1000 });
  assert.deepEqual(out, []);
});

test("multi-column order keeps the composite-key seam stable across pages", async () => {
  // Deliberately unsorted; order by (a,b); tiny page forces seam crossings.
  const rows: Row[] = [
    { a: 2, b: 1 },
    { a: 1, b: 2 },
    { a: 1, b: 1 },
    { a: 2, b: 2 },
    { a: 3, b: 1 },
  ];
  const out = await selectAllPaged(fakeTable(rows), ["a", "b"], {
    pageSize: 2,
  });
  assert.equal(out.length, 5);
  assert.deepEqual(
    out.map((r) => `${r.a}.${r.b}`),
    ["1.1", "1.2", "2.1", "2.2", "3.1"], // composite order, no dupes/skips
  );
});

test("a real (non-range) error throws with the underlying message", async () => {
  await assert.rejects(
    () =>
      selectAllPaged(
        fakeTable(range(10), {
          errorAlways: {
            data: null,
            error: { code: "42501", message: "permission denied" },
          },
        }),
        "id",
        { pageSize: 1000 },
      ),
    /permission denied/,
  );
});

test("exceeding maxRows throws instead of looping forever", async () => {
  await assert.rejects(
    () =>
      selectAllPaged(fakeTable(range(3000)), "id", {
        pageSize: 1000,
        maxRows: 1500,
      }),
    /maxRows/,
  );
});
