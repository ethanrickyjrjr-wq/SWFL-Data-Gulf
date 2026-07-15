import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSoldSeries, reduceActiveStats, type ActiveStatsRow } from "./loaders";

// ---------------------------------------------------------------------------
// reduceActiveStats — the dedup + core-county guard over data_lake.listing_active_stats
// ---------------------------------------------------------------------------

const row = (r: Partial<ActiveStatsRow>): ActiveStatsRow => ({
  county: null,
  zip_code: null,
  listing_count: null,
  median_list_price: null,
  latest_scraped_at: null,
  ...r,
});

describe("reduceActiveStats", () => {
  test("region rollup is the county-null + zip-null row", () => {
    const out = reduceActiveStats([
      row({ listing_count: 20691, median_list_price: 500000 }),
      row({ county: "Lee", listing_count: 13898 }),
      row({ county: "Lee", zip_code: "33901", listing_count: 300 }),
    ]);
    expect(out.region?.listing_count).toBe(20691);
  });

  test("duplicate ZIP rows collapse to the max-listing_count row", () => {
    // The live shape (lake, 07/14/2026): 34110 carries a real 441-listing row at
    // $659,000 AND a junk 14-listing row at $1,599,500. Before the fix BOTH rows
    // survived and the downstream last-write-wins map took whichever came second.
    const out = reduceActiveStats([
      row({ county: "Collier", zip_code: "34110", listing_count: 441, median_list_price: 659000 }),
      row({
        county: "Collier",
        zip_code: "34110",
        listing_count: 14,
        median_list_price: 1599500,
      }),
    ]);
    expect(out.zips).toHaveLength(1);
    expect(out.zips[0].listing_count).toBe(441);
    expect(out.zips[0].median_list_price).toBe(659000);
  });

  test("the junk twin loses no matter which order the view returns it in", () => {
    // Order-independence is the whole point — the old bug was that row ORDER decided
    // the median. Same two rows, reversed, must produce the identical winner.
    const real = row({ zip_code: "33971", listing_count: 578, median_list_price: 319998 });
    const junk = row({ zip_code: "33971", listing_count: 7, median_list_price: 337900 });
    for (const rows of [
      [real, junk],
      [junk, real],
    ]) {
      const out = reduceActiveStats(rows);
      expect(out.zips).toHaveLength(1);
      expect(out.zips[0].median_list_price).toBe(319998);
    }
  });

  test("distinct ZIPs are all kept", () => {
    const out = reduceActiveStats([
      row({ zip_code: "33901", listing_count: 300 }),
      row({ zip_code: "34110", listing_count: 441 }),
      row({ zip_code: "34119", listing_count: 467 }),
    ]);
    expect(out.zips.map((z) => z.zip_code).sort()).toEqual(["33901", "34110", "34119"]);
  });

  test("duplicate county rollups collapse to the max-listing_count row", () => {
    const out = reduceActiveStats([
      row({ county: "Lee", listing_count: 13898 }),
      row({ county: "Lee", listing_count: 2 }),
    ]);
    expect(out.counties).toHaveLength(1);
    expect(out.counties[0].listing_count).toBe(13898);
  });

  test("non-core counties are dropped from the county rollups", () => {
    const out = reduceActiveStats([
      row({ county: "Lee", listing_count: 13898 }),
      row({ county: "Collier", listing_count: 6792 }),
      row({ county: "Hendry", listing_count: 120 }),
      row({ county: "Charlotte", listing_count: 900 }),
      row({ county: "Sarasota", listing_count: 800 }),
    ]);
    expect(out.counties.map((c) => c.county).sort()).toEqual(["Collier", "Lee"]);
  });

  test('core-county match tolerates a trailing " County"', () => {
    const out = reduceActiveStats([row({ county: "Lee County", listing_count: 13898 })]);
    expect(out.counties).toHaveLength(1);
  });

  test("a ZIP row never leaks into the county rollups", () => {
    const out = reduceActiveStats([
      row({ county: "Lee", zip_code: "33901", listing_count: 999999 }),
      row({ county: "Lee", listing_count: 13898 }),
    ]);
    expect(out.counties).toHaveLength(1);
    expect(out.counties[0].zip_code).toBeNull();
    expect(out.counties[0].listing_count).toBe(13898);
  });

  test("empty input is tolerated", () => {
    expect(reduceActiveStats([])).toEqual({ region: null, counties: [], zips: [] });
  });
});

// ---------------------------------------------------------------------------
// loadSoldSeries — server-side null filter + paged assembly
// ---------------------------------------------------------------------------

interface FakeSoldRow {
  area: string;
  period_end: string;
  median_sale_price: number | null;
  months_of_supply: number | null;
}

interface FakeDb {
  client: SupabaseClient;
  filters: string[];
  orderings: string[][];
  pages: Array<[number, number]>;
}

/**
 * A PostgREST stand-in that behaves like the real one where it matters: it ENFORCES the
 * `db-max-rows` cap (never returns more than `maxRows` per response, no error), applies the
 * filters the query asked for, and honours `.order()`/`.range()`. So an un-paged fetch
 * against it truncates silently — exactly the failure the real cap produces.
 */
function fakeDb(rows: FakeSoldRow[], opts?: { maxRows?: number; error?: string }): FakeDb {
  const maxRows = opts?.maxRows ?? 1000;
  const filters: string[] = [];
  const orderings: string[][] = [];
  const pages: Array<[number, number]> = [];

  const from = () => {
    const preds: Array<(r: FakeSoldRow) => boolean> = [];
    const orderCols: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = {
      select: () => q,
      eq: (col: string, val: unknown) => {
        filters.push(`eq:${col}=${String(val)}`);
        return q;
      },
      in: (col: string, vals: unknown[]) => {
        filters.push(`in:${col}=[${vals.join(",")}]`);
        preds.push((r) => vals.includes(r[col as keyof FakeSoldRow] as never));
        return q;
      },
      not: (col: string, op: string, val: unknown) => {
        filters.push(`not:${col} ${op} ${String(val)}`);
        if (op === "is" && val === null) preds.push((r) => r[col as keyof FakeSoldRow] != null);
        return q;
      },
      order: (col: string) => {
        orderCols.push(col);
        return q;
      },
      range: async (lo: number, hi: number) => {
        if (opts?.error) return { data: null, error: { message: opts.error } };
        orderings.push([...orderCols]);
        pages.push([lo, hi]);
        const matched = rows.filter((r) => preds.every((p) => p(r)));
        matched.sort((a, b) => {
          for (const c of orderCols) {
            const cmp = String(a[c as keyof FakeSoldRow]).localeCompare(
              String(b[c as keyof FakeSoldRow]),
            );
            if (cmp !== 0) return cmp;
          }
          return 0;
        });
        // The cap: PostgREST silently clips the response, it does not error.
        const width = Math.min(hi - lo + 1, maxRows);
        return { data: matched.slice(lo, lo + width), error: null };
      },
    };
    return q;
  };

  const client = { schema: () => ({ from }) } as unknown as SupabaseClient;
  return { client, filters, orderings, pages };
}

/** 3 cities × 800 months = 2,400 valued rows — well past the 1000-row cap. */
function bigFixture(): FakeSoldRow[] {
  const out: FakeSoldRow[] = [];
  for (const area of ["cape_coral", "fort_myers", "naples"]) {
    for (let i = 0; i < 800; i++) {
      const yr = 1900 + Math.floor(i / 12);
      const mo = String((i % 12) + 1).padStart(2, "0");
      out.push({
        area,
        period_end: `${yr}-${mo}-28`,
        median_sale_price: 100_000 + i,
        months_of_supply: 1 + (i % 9),
      });
    }
  }
  return out;
}

describe("loadSoldSeries", () => {
  test("filters NULL median_sale_price SERVER-side, not after the fetch", async () => {
    const db = fakeDb([
      { area: "naples", period_end: "2026-01-31", median_sale_price: null, months_of_supply: 3 },
      { area: "naples", period_end: "2026-02-28", median_sale_price: 800000, months_of_supply: 4 },
    ]);
    const out = await loadSoldSeries(db.client);
    // The filter must be pushed to the server — a null row that rides back in the response
    // has already spent a slot against db-max-rows, even if TS drops it afterwards.
    expect(db.filters).toContain("not:median_sale_price is null");
    expect(out.sold.get("naples")).toEqual([{ period: "2026-02-28", value: 800000 }]);
  });

  test("assembles ALL rows past the 1000-row db-max-rows cap", async () => {
    const rows = bigFixture();
    const db = fakeDb(rows, { maxRows: 1000 });
    const out = await loadSoldSeries(db.client);

    // The bug: one un-paged .select() would have stopped at 1000 rows with no error,
    // silently amputating the deepest price series on the desk.
    const total =
      (out.sold.get("cape_coral")?.length ?? 0) +
      (out.sold.get("fort_myers")?.length ?? 0) +
      (out.sold.get("naples")?.length ?? 0);
    expect(total).toBe(2400);
    expect(out.sold.get("naples")).toHaveLength(800);
    expect(out.monthsSupply.get("naples")).toHaveLength(800);
    expect(db.pages.length).toBeGreaterThan(1); // it really paged
  });

  test("pages on a UNIQUE order key — area first, never period_end first", async () => {
    const db = fakeDb(bigFixture());
    await loadSoldSeries(db.client);
    // period_end is NOT unique (the same month exists for all three cities), so a
    // period_end-primary sort lets PostgREST skip/repeat rows across page seams.
    for (const cols of db.orderings) expect(cols).toEqual(["area", "period_end"]);
  });

  test("each city's series stays in ascending period order across page seams", async () => {
    const db = fakeDb(bigFixture());
    const out = await loadSoldSeries(db.client);
    for (const city of ["cape_coral", "fort_myers", "naples"]) {
      const periods = (out.sold.get(city) ?? []).map((p) => p.period);
      expect(periods).toEqual([...periods].sort());
    }
  });

  test("scopes to All Residential and the three desk cities", async () => {
    const db = fakeDb(bigFixture());
    await loadSoldSeries(db.client);
    expect(db.filters).toContain("eq:property_type=All Residential");
    expect(db.filters).toContain("in:area=[cape_coral,fort_myers,naples]");
  });

  test("a dead feed returns empty maps, never throws", async () => {
    const db = fakeDb([], { error: "connection refused" });
    const out = await loadSoldSeries(db.client);
    expect(out.sold.size).toBe(0);
    expect(out.monthsSupply.size).toBe(0);
  });
});
