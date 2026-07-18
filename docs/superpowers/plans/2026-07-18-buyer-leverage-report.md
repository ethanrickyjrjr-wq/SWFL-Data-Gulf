# Buyer Leverage Report (/r/how-long-has-it-sat) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 8 tasks, 13 files, keywords: migration, schema, architecture

**Goal:** A standalone buyer-facing route that reads a specific home's time-on-market and price-cut history from our own lake and frames it as objective negotiating context — facts only, never asserting seller motivation or a discount.

**Architecture:** A new `lib/buyer-leverage/` module of small, injectable-dep, empty-tolerant reads (modeled on `lib/back-on-market/relist-fact.ts`) that assemble a per-home read (DOM + cut history + relist) plus a live ZIP benchmark, feed a pure deterministic sentence composer (the no-invention framing, modeled on `lib/deliverable/recipes/price-reduced.ts`), and render through the shared report-shell chrome at `app/r/how-long-has-it-sat/`.

**Tech Stack:** Next.js App Router (server components, `runtime="nodejs"`), TypeScript, Supabase service-role untyped client for `data_lake.*`, `bun:test`. Verify with `bunx next build`.

**Spec:** `docs/superpowers/specs/2026-07-18-buyer-leverage-report-design.md` (read it first).

## Global Constraints

- **No invention.** Every figure names a real source (our lake). No discount/elasticity estimate ever. A leverage line renders only on real data.
- **No seller-motivation / negotiation-room language, ever** — forbidden phrases (verbatim ban list): "motivated", "anxious", "relocating", "room to negotiate", "you'll get X% off", "priced to sell", "won't last", "a deal", "a steal", and any *reason* the price moved.
- **Forward-only cut history + floored DOM must hedge, never suppress.** A floored subject (`dom_is_floor=true`) reads "at least N" for both DOM gap and cut count; a non-floored subject reads the crisp number. Never a crisp count on a floored subject.
- **Benchmark excludes floored rows** (`dom_is_floor=false` in the median).
- **Only `state='active'` subjects get the leverage framing.** pending/holding/sold → no leverage line.
- **Provenance:** every figure cites "SWFL Data Gulf". As-of dates MM/DD/YYYY, stated once. Vendor name never surfaced. No system nouns / internal IDs in rendered copy.
- **Empty-tolerant everywhere:** no creds / no rows / query error → null or [], never throws, never invents.
- **Reuse, do not edit:** `lib/back-on-market/relist-fact.ts` stays untouched (rank-6 collision + one-authority for relists). Reuse `formatDom` (`lib/listings/dom.ts`), `resolveQToZip` (`app/r/back-on-market/page.tsx`), `addressKey` (`lib/listings/address-key.ts`), `createServiceRoleClientUntyped` (`utils/supabase/service-role.ts`), report-shell (`app/r/_components/report-shell.tsx`), `resolveZip` (`refinery/lib/zip-resolver.mts`), `cityForZip` (`lib/swfl-zip-city.ts`).
- **Commits are LOCAL per task.** Do NOT push. `main` has a live parallel-session divergence; the final push is operator-gated with the diff shown. Stage explicit paths only (never `git add -A`).
- **Worktree if rank 6 is running concurrently** (both touch the back-on-market area). Otherwise `main` is fine — this build only *reads* `relist-fact.ts`.

---

## File Structure

- `lib/buyer-leverage/types.ts` — shared interfaces (single source of truth for shapes).
- `lib/buyer-leverage/cut-history.ts` — `data_lake.listing_transitions` reader + pure `deriveCutHistory`.
- `lib/buyer-leverage/dom-read.ts` — per-home `listing_dom` read (carries `state` + `isFloor`).
- `lib/buyer-leverage/zip-benchmark.ts` — live ZIP median DOM (`percentile_cont`, floored-excluded) + `price_reduced_share` reuse.
- `lib/buyer-leverage/compose.ts` — pure deterministic sentence composer (the framing).
- `lib/buyer-leverage/load.ts` — orchestrator: assembles the read, degrade-to-area, state branch.
- `components/buyer-leverage/BuyerLeverageRead.tsx` — render component.
- `app/r/how-long-has-it-sat/page.tsx` — the route.

Tests live beside each file (`*.test.ts`), run with `bun test <path>`.

---

## Task 1: Types + pure cut-history derivation

**Files:**
- Create: `lib/buyer-leverage/types.ts`
- 🔴 Create: `lib/buyer-leverage/cut-history.ts`
- 🔴 Test: `lib/buyer-leverage/cut-history.test.ts`

**Interfaces:**
- Produces: `CutEvent`, `CutHistory`, `DomRead`, `ZipBenchmark`, `LeverageRead` (types.ts);
  `deriveCutHistory(rows: TransitionRow[], subjectFloored: boolean): CutHistory` and
  `TransitionRow` (cut-history.ts).

- [ ] **Step 1: Write the types**

```typescript
// lib/buyer-leverage/types.ts
import type { RelistFact } from "@/lib/back-on-market/relist-fact";

export interface CutEvent {
  /** Cut date, MM/DD/YYYY (as-of convention). */
  date: string;
  /** Positive dollar size of the cut. */
  sizeUsd: number;
}

export interface CutHistory {
  count: number;
  totalCutUsd: number;
  events: CutEvent[];
  /** false when the subject is floored — pre-window cuts may be censored, so the count is a lower bound. */
  complete: boolean;
}

export interface DomRead {
  domDays: number | null;
  /** dom_is_floor — first_seen ≤ 07/03/2026 with no vendor date/relist → dom_days is a lower bound. */
  isFloor: boolean;
  cdomDays: number | null;
  /** listing_state.state — only 'active' gets the leverage framing. */
  state: string | null;
}

export interface ZipBenchmark {
  /** Median dom_days of active for-sale listings in the ZIP, floored rows excluded. */
  medianDomDays: number | null;
  /** Share of the ZIP's active listings that have taken a cut (reused own-data aggregate). */
  priceReducedShare: number | null;
  /** Count of listings behind the median — used to drop a thin benchmark. */
  sampleSize: number;
}

export interface LeverageRead {
  zip: string;
  place: string;
  /** null when there is no per-home match (area-only read). */
  dom: DomRead | null;
  cuts: CutHistory | null;
  relist: RelistFact | null;
  benchmark: ZipBenchmark | null;
  /** Render-ready, already-composed fact sentences. Empty = nothing real to say. */
  lines: string[];
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// lib/buyer-leverage/cut-history.test.ts
import { expect, test } from "bun:test";
import { deriveCutHistory, type TransitionRow } from "./cut-history";

const cut = (at: string, delta: number, from = "active", to = "active"): TransitionRow => ({
  at, from_state: from, to_state: to, price: 500000, price_delta: delta,
});

test("counts only same-state negative price moves as cuts", () => {
  const rows: TransitionRow[] = [
    cut("2026-07-10", -20000),
    cut("2026-06-01", -25000),
    cut("2026-05-01", 15000), // a RAISE — excluded
    cut("2026-04-01", -10000, "holding", "active"), // relist delta — excluded (state changed)
  ];
  const h = deriveCutHistory(rows, false);
  expect(h.count).toBe(2);
  expect(h.totalCutUsd).toBe(45000);
  expect(h.events.map((e) => e.date)).toEqual(["07/10/2026", "06/01/2026"]);
  expect(h.complete).toBe(true);
});

test("floored subject → complete=false (count is a lower bound)", () => {
  const h = deriveCutHistory([cut("2026-07-10", -20000)], true);
  expect(h.count).toBe(1);
  expect(h.complete).toBe(false);
});

test("no cuts → zeros, empty events, never throws", () => {
  const h = deriveCutHistory([], false);
  expect(h).toEqual({ count: 0, totalCutUsd: 0, events: [], complete: true });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test lib/buyer-leverage/cut-history.test.ts`
Expected: FAIL — `Cannot find module './cut-history'`.

- [ ] **Step 4: Write minimal implementation**

```typescript
// lib/buyer-leverage/cut-history.ts
import type { CutHistory, CutEvent } from "./types";

/** One transition row as read from data_lake.listing_transitions. */
export interface TransitionRow {
  at: string | null;
  from_state: string | null;
  to_state: string | null;
  price: number | null;
  price_delta: number | null;
}

/** ISO "YYYY-MM-DD…" → "MM/DD/YYYY". "" on anything unparseable. */
function toMdY(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : "";
}

/**
 * Derive the observed price-cut history from a home's transition rows.
 *
 * A cut = a SAME-STATE move with a negative delta (from_state === to_state, price_delta < 0).
 * State-change deltas (e.g. holding→active relists) and raises are excluded. FORWARD-ONLY:
 * these rows only exist from the second scan onward (see spec / transitions.py), so on a
 * floored subject the count is a lower bound — `complete` is false and the composer hedges.
 */
export function deriveCutHistory(rows: TransitionRow[], subjectFloored: boolean): CutHistory {
  const events: CutEvent[] = rows
    .filter(
      (r) =>
        r.from_state != null &&
        r.from_state === r.to_state &&
        typeof r.price_delta === "number" &&
        r.price_delta < 0 &&
        typeof r.at === "string" &&
        r.at.length > 0,
    )
    .map((r) => ({ date: toMdY(r.at as string), sizeUsd: Math.abs(r.price_delta as number) }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const totalCutUsd = events.reduce((s, e) => s + e.sizeUsd, 0);
  return { count: events.length, totalCutUsd, events, complete: !subjectFloored };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test lib/buyer-leverage/cut-history.test.ts`
Expected: PASS (3 tests). Note the date sort is string-descending on MM/DD/YYYY — the test dates are within one year so lexical order matches chronological; if cross-year sorting is ever needed, sort on the ISO before formatting.

- [ ] **Step 6: Commit**

```bash
git add lib/buyer-leverage/types.ts lib/buyer-leverage/cut-history.ts lib/buyer-leverage/cut-history.test.ts
git commit -m "feat(buyer-leverage): types + pure cut-history derivation (forward-only aware)"
```

---

## Task 2: Cut-history lake reader

**Files:**
- 🔴 Modify: `lib/buyer-leverage/cut-history.ts` (add the lake read)
- 🔴 Test: `lib/buyer-leverage/cut-history.test.ts` (add reader tests)

**Interfaces:**
- Consumes: `TransitionRow`, `deriveCutHistory` (Task 1); `addressKey` (`lib/listings/address-key.ts`), `createServiceRoleClientUntyped` (`utils/supabase/service-role.ts`).
- Produces: `fetchCutRows(addressKey: string, deps?: CutDeps): Promise<TransitionRow[]>` and `CutDeps { fetchRows?: (key: string) => Promise<TransitionRow[]> }`.

- [ ] **Step 1: Write the failing test**

```typescript
// append to lib/buyer-leverage/cut-history.test.ts
import { fetchCutRows } from "./cut-history";

test("fetchCutRows returns [] on injected empty read (empty-tolerant)", async () => {
  const rows = await fetchCutRows("123MAINST:33904", { fetchRows: async () => [] });
  expect(rows).toEqual([]);
});

test("fetchCutRows swallows a throwing read → []", async () => {
  const rows = await fetchCutRows("123MAINST:33904", {
    fetchRows: async () => {
      throw new Error("no creds");
    },
  });
  expect(rows).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/buyer-leverage/cut-history.test.ts`
Expected: FAIL — `fetchCutRows is not exported`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// append to lib/buyer-leverage/cut-history.ts
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";

export interface CutDeps {
  /** Injectable lake read — tests never touch Supabase. */
  fetchRows?: (addressKey: string) => Promise<TransitionRow[]>;
}

/** Default read: this home's sale transitions, freshest first. Empty-tolerant — any error → []. */
async function defaultFetchRows(key: string): Promise<TransitionRow[]> {
  try {
    const db = createServiceRoleClientUntyped();
    const { data } = await db
      .schema("data_lake")
      .from("listing_transitions")
      .select("at, from_state, to_state, price, price_delta")
      .eq("address_key", key)
      .eq("sale_or_rent", "sale")
      .order("at", { ascending: false })
      .limit(25);
    return Array.isArray(data) ? (data as TransitionRow[]) : [];
  } catch {
    return [];
  }
}

/** Fetch a home's transition rows for a derived address_key. Never throws. */
export async function fetchCutRows(addressKey: string, deps: CutDeps = {}): Promise<TransitionRow[]> {
  const fetchRows = deps.fetchRows ?? defaultFetchRows;
  try {
    return await fetchRows(addressKey);
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/buyer-leverage/cut-history.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/buyer-leverage/cut-history.ts lib/buyer-leverage/cut-history.test.ts
git commit -m "feat(buyer-leverage): empty-tolerant cut-history lake reader"
```

---

## Task 3: Per-home DOM + state read

**Files:**
- Create: `lib/buyer-leverage/dom-read.ts`
- Test: `lib/buyer-leverage/dom-read.test.ts`

**Interfaces:**
- Consumes: `DomRead` (Task 1); `createServiceRoleClientUntyped`.
- Produces: `fetchDomRead(addressKey: string, deps?: DomDeps): Promise<DomRead | null>` and `DomDeps { fetchRow?: (key: string) => Promise<RawDomRow | null> }`, `RawDomRow`.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/buyer-leverage/dom-read.test.ts
import { expect, test } from "bun:test";
import { fetchDomRead } from "./dom-read";

test("maps a listing_dom row → DomRead", async () => {
  const read = await fetchDomRead("123MAINST:33904", {
    fetchRow: async () => ({ dom_days: 138, dom_is_floor: false, cdom_days: 138, state: "active" }),
  });
  expect(read).toEqual({ domDays: 138, isFloor: false, cdomDays: 138, state: "active" });
});

test("floored row → isFloor true", async () => {
  const read = await fetchDomRead("123MAINST:33904", {
    fetchRow: async () => ({ dom_days: 400, dom_is_floor: true, cdom_days: 400, state: "active" }),
  });
  expect(read?.isFloor).toBe(true);
});

test("no match → null (area-only degrade upstream)", async () => {
  expect(await fetchDomRead("X:33904", { fetchRow: async () => null })).toBeNull();
});

test("throwing read → null (empty-tolerant)", async () => {
  const read = await fetchDomRead("X:33904", {
    fetchRow: async () => {
      throw new Error("no creds");
    },
  });
  expect(read).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/buyer-leverage/dom-read.test.ts`
Expected: FAIL — `Cannot find module './dom-read'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/buyer-leverage/dom-read.ts
import type { DomRead } from "./types";
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";

export interface RawDomRow {
  dom_days: number | null;
  dom_is_floor: boolean | null;
  cdom_days: number | null;
  state: string | null;
}

export interface DomDeps {
  fetchRow?: (addressKey: string) => Promise<RawDomRow | null>;
}

/** Default read: the home's listing_dom row (our own api_feed inventory). Any error → null. */
async function defaultFetchRow(key: string): Promise<RawDomRow | null> {
  try {
    const db = createServiceRoleClientUntyped();
    const { data } = await db
      .schema("data_lake")
      .from("listing_dom")
      .select("dom_days, dom_is_floor, cdom_days, state")
      .eq("address_key", key)
      .eq("sale_or_rent", "sale")
      .limit(1)
      .maybeSingle();
    return (data as RawDomRow) ?? null;
  } catch {
    return null;
  }
}

/** Resolve a home's DOM + state, or null on any miss. Never throws. */
export async function fetchDomRead(addressKey: string, deps: DomDeps = {}): Promise<DomRead | null> {
  const fetchRow = deps.fetchRow ?? defaultFetchRow;
  let row: RawDomRow | null;
  try {
    row = await fetchRow(addressKey);
  } catch {
    return null;
  }
  if (!row) return null;
  return {
    domDays: row.dom_days,
    isFloor: row.dom_is_floor === true,
    cdomDays: row.cdom_days,
    state: row.state,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/buyer-leverage/dom-read.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/buyer-leverage/dom-read.ts lib/buyer-leverage/dom-read.test.ts
git commit -m "feat(buyer-leverage): per-home DOM+state read (floor-aware, empty-tolerant)"
```

---

## Task 4: Live ZIP benchmark

**Files:**
- Create: `lib/buyer-leverage/zip-benchmark.ts`
- Test: `lib/buyer-leverage/zip-benchmark.test.ts`

**Interfaces:**
- Consumes: `ZipBenchmark` (Task 1); `createServiceRoleClientUntyped`.
- Produces: `fetchZipBenchmark(zip: string, deps?: BenchmarkDeps): Promise<ZipBenchmark | null>` and `BenchmarkDeps`.

Median DOM is computed at source via a Postgres RPC (`percentile_cont`). The RPC is created in a migration in this task; `deps` inject both reads for tests.

- [ ] **Step 1: Write the migration**

```sql
-- docs/sql/20260718_zip_active_dom_median.sql
-- Live per-ZIP median dom_days over ACTIVE for-sale listings, floored rows EXCLUDED
-- (floored dom_days are lower bounds and concentrate in the high-DOM tail — including
-- them understates "typical" and overstates a leverage gap). Read-time; nothing stored.
-- Apply: bun scripts/run-migration.ts docs/sql/20260718_zip_active_dom_median.sql
CREATE OR REPLACE FUNCTION data_lake.zip_active_dom_median(p_zip text)
RETURNS TABLE (median_dom numeric, sample_size bigint)
LANGUAGE sql STABLE AS $$
  SELECT
    percentile_cont(0.5) WITHIN GROUP (ORDER BY dom_days) AS median_dom,
    count(*) AS sample_size
  FROM data_lake.listing_dom
  WHERE sale_or_rent = 'sale'
    AND state = 'active'
    AND zip_code = p_zip
    AND dom_days IS NOT NULL
    AND dom_is_floor = false;
$$;
GRANT EXECUTE ON FUNCTION data_lake.zip_active_dom_median(text) TO service_role;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Write the failing test**

```typescript
// lib/buyer-leverage/zip-benchmark.test.ts
import { expect, test } from "bun:test";
import { fetchZipBenchmark } from "./zip-benchmark";

test("assembles median + share + sample size", async () => {
  const b = await fetchZipBenchmark("33904", {
    fetchMedian: async () => ({ median_dom: 44, sample_size: 120 }),
    fetchShare: async () => 0.31,
  });
  expect(b).toEqual({ medianDomDays: 44, priceReducedShare: 0.31, sampleSize: 120 });
});

test("thin sample still returns; caller decides to drop", async () => {
  const b = await fetchZipBenchmark("34142", {
    fetchMedian: async () => ({ median_dom: 12, sample_size: 2 }),
    fetchShare: async () => null,
  });
  expect(b?.sampleSize).toBe(2);
  expect(b?.priceReducedShare).toBeNull();
});

test("both reads empty → null benchmark", async () => {
  const b = await fetchZipBenchmark("33904", {
    fetchMedian: async () => ({ median_dom: null, sample_size: 0 }),
    fetchShare: async () => null,
  });
  expect(b).toBeNull();
});

test("throwing reads → null (empty-tolerant)", async () => {
  const b = await fetchZipBenchmark("33904", {
    fetchMedian: async () => {
      throw new Error("no rpc");
    },
    fetchShare: async () => 0.2,
  });
  expect(b).toBeNull();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test lib/buyer-leverage/zip-benchmark.test.ts`
Expected: FAIL — `Cannot find module './zip-benchmark'`.

- [ ] **Step 4: Write minimal implementation**

```typescript
// lib/buyer-leverage/zip-benchmark.ts
import type { ZipBenchmark } from "./types";
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";

export interface BenchmarkDeps {
  fetchMedian?: (zip: string) => Promise<{ median_dom: number | null; sample_size: number }>;
  fetchShare?: (zip: string) => Promise<number | null>;
}

async function defaultFetchMedian(zip: string): Promise<{ median_dom: number | null; sample_size: number }> {
  try {
    const db = createServiceRoleClientUntyped();
    const { data } = await db.schema("data_lake").rpc("zip_active_dom_median", { p_zip: zip });
    const row = Array.isArray(data) ? data[0] : data;
    return {
      median_dom: row?.median_dom != null ? Number(row.median_dom) : null,
      sample_size: row?.sample_size != null ? Number(row.sample_size) : 0,
    };
  } catch {
    return { median_dom: null, sample_size: 0 };
  }
}

async function defaultFetchShare(zip: string): Promise<number | null> {
  try {
    const db = createServiceRoleClientUntyped();
    const { data } = await db
      .schema("data_lake")
      .from("listing_momentum_stats")
      .select("price_reduced_share")
      .eq("zip_code", zip)
      .limit(1)
      .maybeSingle();
    const v = (data as { price_reduced_share: number | null } | null)?.price_reduced_share;
    return v != null ? Number(v) : null;
  } catch {
    return null;
  }
}

/**
 * The ZIP's own-data leverage context: live median dom_days (active for-sale, floored
 * excluded) + the reused own-inventory price-reduced share. null when there is nothing
 * real (no median AND no share). Never throws.
 */
export async function fetchZipBenchmark(zip: string, deps: BenchmarkDeps = {}): Promise<ZipBenchmark | null> {
  const fetchMedian = deps.fetchMedian ?? defaultFetchMedian;
  const fetchShare = deps.fetchShare ?? defaultFetchShare;
  let median: { median_dom: number | null; sample_size: number };
  let share: number | null;
  try {
    median = await fetchMedian(zip);
  } catch {
    median = { median_dom: null, sample_size: 0 };
  }
  try {
    share = await fetchShare(zip);
  } catch {
    share = null;
  }
  if (median.median_dom == null && share == null) return null;
  return { medianDomDays: median.median_dom, priceReducedShare: share, sampleSize: median.sample_size };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test lib/buyer-leverage/zip-benchmark.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Apply the migration + spot-check live**

Run: `bun scripts/run-migration.ts docs/sql/20260718_zip_active_dom_median.sql`
Then verify the function returns a real median for a dense ZIP (33904 Cape Coral):
Run: `bun -e "import{createServiceRoleClientUntyped}from './utils/supabase/service-role';const d=createServiceRoleClientUntyped();const{data,error}=await d.schema('data_lake').rpc('zip_active_dom_median',{p_zip:'33904'});console.log(error??data)"`
Expected: a row with a non-null `median_dom` and `sample_size` > 0 (proves the read is live, not just typed).

- [ ] **Step 7: Commit**

```bash
git add docs/sql/20260718_zip_active_dom_median.sql lib/buyer-leverage/zip-benchmark.ts lib/buyer-leverage/zip-benchmark.test.ts
git commit -m "feat(buyer-leverage): live per-ZIP median DOM benchmark (floored-excluded) + share reuse"
```

---

## Task 5: The composer (the framing — no-invention heart)

**Files:**
- Create: `lib/buyer-leverage/compose.ts`
- Test: `lib/buyer-leverage/compose.ts` via `lib/buyer-leverage/compose.test.ts`
- Test: `lib/buyer-leverage/no-invention.test.ts`

**Interfaces:**
- Consumes: `DomRead`, `CutHistory`, `ZipBenchmark`, `RelistFact`; `formatDom` (`lib/listings/dom.ts`).
- Produces: `composeLeverageLines(input: ComposeInput): string[]` and `ComposeInput`, plus exported `FORBIDDEN_PHRASES: string[]` and `MIN_BENCHMARK_SAMPLE`, `MIN_GAP_DAYS`.

- [ ] **Step 1: Write the failing test (behavior)**

```typescript
// lib/buyer-leverage/compose.test.ts
import { expect, test } from "bun:test";
import { composeLeverageLines } from "./compose";

const dom = (over: Partial<{ domDays: number; isFloor: boolean; cdomDays: number; state: string }> = {}) => ({
  domDays: 138, isFloor: false, cdomDays: 138, state: "active", ...over,
});

test("active home, long DOM, two complete cuts → crisp leverage lines", () => {
  const lines = composeLeverageLines({
    dom: dom(),
    cuts: { count: 2, totalCutUsd: 45000, events: [], complete: true },
    benchmark: { medianDomDays: 44, priceReducedShare: 0.3, sampleSize: 120 },
    relist: null,
  });
  expect(lines.some((l) => l.includes("94 days longer than typical"))).toBe(true);
  expect(lines.some((l) => l.includes("cut twice") && l.includes("$45,000"))).toBe(true);
});

test("floored subject → hedged 'at least', never a crisp gap/count", () => {
  const lines = composeLeverageLines({
    dom: dom({ isFloor: true, domDays: 400, cdomDays: 400 }),
    cuts: { count: 2, totalCutUsd: 45000, events: [], complete: false },
    benchmark: { medianDomDays: 44, priceReducedShare: 0.3, sampleSize: 120 },
    relist: null,
  }).join(" ");
  expect(lines).toContain("at least");
  expect(lines).not.toMatch(/\b356 days longer\b/); // no crisp gap on a floored subject
});

test("non-active subject → no leverage lines", () => {
  const lines = composeLeverageLines({
    dom: dom({ state: "pending" }),
    cuts: { count: 2, totalCutUsd: 45000, events: [], complete: true },
    benchmark: { medianDomDays: 44, priceReducedShare: 0.3, sampleSize: 120 },
    relist: null,
  });
  expect(lines).toEqual([]);
});

test("thin benchmark sample → DOM stated, no gap claim", () => {
  const lines = composeLeverageLines({
    dom: dom(),
    cuts: null,
    benchmark: { medianDomDays: 10, priceReducedShare: null, sampleSize: 2 },
    relist: null,
  }).join(" ");
  expect(lines).toContain("138 days on market");
  expect(lines).not.toContain("longer than typical");
});

test("no real data → no lines", () => {
  expect(composeLeverageLines({ dom: null, cuts: null, benchmark: null, relist: null })).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/buyer-leverage/compose.test.ts`
Expected: FAIL — `Cannot find module './compose'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/buyer-leverage/compose.ts
import type { DomRead, CutHistory, ZipBenchmark } from "./types";
import type { RelistFact } from "@/lib/back-on-market/relist-fact";
import { formatDom } from "@/lib/listings/dom";

export interface ComposeInput {
  dom: DomRead | null;
  cuts: CutHistory | null;
  benchmark: ZipBenchmark | null;
  relist: RelistFact | null;
}

/** A benchmark median below this many listings is too thin to call "typical". */
export const MIN_BENCHMARK_SAMPLE = 8;
/** Below this gap, "longer than typical" isn't worth stating. */
export const MIN_GAP_DAYS = 14;

/** Phrases that must NEVER appear — asserted by no-invention.test.ts. */
export const FORBIDDEN_PHRASES = [
  "motivated", "anxious", "relocating", "room to negotiate", "% off",
  "priced to sell", "won't last", "a deal", "a steal", "desperate",
];

function usd(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

/**
 * Compose the render-ready leverage sentences — FACTS ONLY. Only an ACTIVE subject gets
 * the framing. A floored subject/cut-history is hedged ("at least"), never crisp. No
 * benchmark gap unless the sample is real. Never states a reason a price moved, never
 * implies seller motivation or negotiation room (see FORBIDDEN_PHRASES).
 */
export function composeLeverageLines(input: ComposeInput): string[] {
  const { dom, cuts, benchmark } = input;
  const lines: string[] = [];

  if (!dom || dom.state !== "active") return lines; // area-only / not a live target

  // DOM line, benchmarked when the sample is real.
  if (dom.domDays != null && dom.domDays >= 0) {
    const domPhrase = formatDom({ domDays: dom.domDays, isFloor: dom.isFloor, cdomDays: dom.cdomDays });
    const hasGap =
      benchmark?.medianDomDays != null &&
      benchmark.sampleSize >= MIN_BENCHMARK_SAMPLE &&
      dom.domDays - benchmark.medianDomDays >= MIN_GAP_DAYS;
    if (hasGap) {
      const gap = dom.domDays - (benchmark!.medianDomDays as number);
      const atLeast = dom.isFloor ? "at least " : "";
      lines.push(
        `This home has been listed ${domPhrase} — ${atLeast}${gap} days longer than typical for its area.`,
      );
    } else if (domPhrase) {
      const atLeast = dom.isFloor ? "at least " : "";
      lines.push(`This home has been listed ${atLeast}${domPhrase}.`);
    }
  }

  // Cut line, hedged when the history is incomplete (floored subject).
  if (cuts && cuts.count > 0) {
    const times = cuts.count === 1 ? "once" : cuts.count === 2 ? "twice" : `${cuts.count} times`;
    const total = usd(cuts.totalCutUsd);
    lines.push(
      cuts.complete
        ? `The price has been cut ${times}, ${total} total.`
        : `The price has been cut at least ${times} since we began tracking this listing, ${total} total.`,
    );
  }

  return lines;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/buyer-leverage/compose.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the no-invention guard test**

```typescript
// lib/buyer-leverage/no-invention.test.ts
import { expect, test } from "bun:test";
import { composeLeverageLines, FORBIDDEN_PHRASES } from "./compose";

const CASES = [
  { dom: { domDays: 300, isFloor: false, cdomDays: 300, state: "active" },
    cuts: { count: 3, totalCutUsd: 90000, events: [], complete: true },
    benchmark: { medianDomDays: 30, priceReducedShare: 0.4, sampleSize: 200 }, relist: null },
  { dom: { domDays: 400, isFloor: true, cdomDays: 400, state: "active" },
    cuts: { count: 2, totalCutUsd: 50000, events: [], complete: false },
    benchmark: { medianDomDays: 20, priceReducedShare: null, sampleSize: 50 }, relist: null },
];

test("composed copy never contains a forbidden motivation/discount phrase", () => {
  for (const c of CASES) {
    const text = composeLeverageLines(c).join(" ").toLowerCase();
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(text.includes(phrase.toLowerCase())).toBe(false);
    }
  }
});

test("a floored subject is never given a crisp (non-'at least') cut count", () => {
  const text = composeLeverageLines(CASES[1]).join(" ");
  expect(text).toContain("at least");
});
```

- [ ] **Step 6: Run the guard test**

Run: `bun test lib/buyer-leverage/no-invention.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add lib/buyer-leverage/compose.ts lib/buyer-leverage/compose.test.ts lib/buyer-leverage/no-invention.test.ts
git commit -m "feat(buyer-leverage): deterministic no-invention leverage composer"
```

---

## Task 6: The load orchestrator

**Files:**
- Create: `lib/buyer-leverage/load.ts`
- Test: `lib/buyer-leverage/load.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–5; `resolveRelistFact` (`lib/back-on-market/relist-fact.ts`), `addressKey` (`lib/listings/address-key.ts`), `geocodeAddress` (`lib/geo/geocode-address.ts`), `resolveZip` (`refinery/lib/zip-resolver.mts`), `cityForZip` (`lib/swfl-zip-city.ts`).
- Produces: `loadLeverageRead(q: string, deps?: LoadDeps): Promise<LeverageRead | null>`.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/buyer-leverage/load.test.ts
import { expect, test } from "bun:test";
import { loadLeverageRead } from "./load";

const baseDeps = {
  geocode: async () => ({ zip: "33904", countyFips: "12071" }),
  fetchDom: async () => ({ domDays: 138, isFloor: false, cdomDays: 138, state: "active" }),
  fetchCuts: async () => [{ at: "2026-07-01", from_state: "active", to_state: "active", price: 480000, price_delta: -20000 }],
  fetchBenchmark: async () => ({ medianDomDays: 44, priceReducedShare: 0.3, sampleSize: 120 }),
  fetchRelist: async () => null,
};

test("address in scope → per-home read with composed lines", async () => {
  const read = await loadLeverageRead("123 Main St, Cape Coral", baseDeps);
  expect(read?.zip).toBe("33904");
  expect(read?.dom?.domDays).toBe(138);
  expect(read?.lines.some((l) => l.includes("longer than typical"))).toBe(true);
});

test("bare ZIP → area-only read, no per-home lines", async () => {
  const read = await loadLeverageRead("33904", { ...baseDeps, fetchDom: async () => null });
  expect(read?.dom).toBeNull();
  expect(read?.benchmark?.medianDomDays).toBe(44);
});

test("in-scope address with no per-home match → degrades to area, still returns", async () => {
  const read = await loadLeverageRead("999 Nowhere Rd, Cape Coral", {
    ...baseDeps,
    fetchDom: async () => null,
    fetchCuts: async () => [],
  });
  expect(read).not.toBeNull();
  expect(read?.dom).toBeNull();
  expect(read?.benchmark).not.toBeNull();
});

test("empty query → null", async () => {
  expect(await loadLeverageRead("", baseDeps)).toBeNull();
});

test("out-of-scope county → null", async () => {
  const read = await loadLeverageRead("1 Miami Ave, Miami", {
    ...baseDeps,
    geocode: async () => ({ zip: "33101", countyFips: "12086" }),
  });
  expect(read).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/buyer-leverage/load.test.ts`
Expected: FAIL — `Cannot find module './load'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/buyer-leverage/load.ts
import type { LeverageRead } from "./types";
import { fetchDomRead, type DomDeps } from "./dom-read";
import { fetchCutRows, deriveCutHistory } from "./cut-history";
import { fetchZipBenchmark } from "./zip-benchmark";
import { composeLeverageLines } from "./compose";
import { resolveRelistFact, type RelistFact } from "@/lib/back-on-market/relist-fact";
import { addressKey } from "@/lib/listings/address-key";
import { geocodeAddress, type GeocodeFn } from "@/lib/geo/geocode-address";
import { resolveZip } from "@/refinery/lib/zip-resolver.mts";
import { cityForZip } from "@/lib/swfl-zip-city";

const LEE_FIPS = "12071";
const COLLIER_FIPS = "12021";
const BARE_ZIP = /^\d{5}$/;

export interface LoadDeps {
  geocode?: GeocodeFn;
  fetchDom?: DomDeps["fetchRow"] extends infer _ ? (key: string) => ReturnType<typeof fetchDomRead> : never;
  // Injected reads for tests (each mirrors the module default's shape).
  fetchDomRead?: typeof fetchDomRead;
}

/** Assemble a home's/area's leverage read. null on empty / out-of-scope; area-only when no per-home match. */
export async function loadLeverageRead(
  q: string,
  deps: {
    geocode?: GeocodeFn;
    fetchDom?: (key: string) => Promise<import("./types").DomRead | null>;
    fetchCuts?: (key: string) => Promise<import("./cut-history").TransitionRow[]>;
    fetchBenchmark?: (zip: string) => Promise<import("./types").ZipBenchmark | null>;
    fetchRelist?: (addr: string) => Promise<RelistFact | null>;
  } = {},
): Promise<LeverageRead | null> {
  const s = (q ?? "").trim();
  if (!s) return null;

  // Resolve ZIP + scope. Bare ZIP → area-only (no per-home key).
  let zip: string;
  let isAddress: boolean;
  if (BARE_ZIP.test(s)) {
    zip = s;
    isAddress = false;
    if (!resolveZip(zip).in_scope) return null;
  } else {
    const geo = await (deps.geocode ? geocodeAddress(s, { geocode: deps.geocode }) : geocodeAddress(s)).catch(
      () => null,
    );
    if (!geo?.zip) return null;
    if (geo.countyFips !== LEE_FIPS && geo.countyFips !== COLLIER_FIPS) return null;
    zip = geo.zip;
    isAddress = true;
  }

  const place = cityForZip(zip) ?? `ZIP ${zip}`;

  // Per-home leg (address only).
  let dom = null;
  let cuts = null;
  let relist: RelistFact | null = null;
  if (isAddress) {
    const street = s.split(",")[0]?.trim() ?? "";
    const key = addressKey(street.replace(/#\s*/g, "Unit "), zip);
    dom = deps.fetchDom ? await deps.fetchDom(key) : await fetchDomRead(key);
    if (dom) {
      const rows = deps.fetchCuts ? await deps.fetchCuts(key) : await fetchCutRows(key);
      cuts = deriveCutHistory(rows, dom.isFloor);
      relist = deps.fetchRelist ? await deps.fetchRelist(s) : await resolveRelistFact(s);
    }
  }

  const benchmark = deps.fetchBenchmark ? await deps.fetchBenchmark(zip) : await fetchZipBenchmark(zip);
  const lines = composeLeverageLines({ dom, cuts, benchmark, relist });

  return { zip, place, dom, cuts, relist, benchmark, lines };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/buyer-leverage/load.test.ts`
Expected: PASS (5 tests). If a type error surfaces on `LoadDeps` (the `fetchDom` inference helper is unused noise), delete the unused `LoadDeps` interface — the inline `deps` param is the real signature.

- [ ] **Step 5: Commit**

```bash
git add lib/buyer-leverage/load.ts lib/buyer-leverage/load.test.ts
git commit -m "feat(buyer-leverage): load orchestrator (scope, degrade-to-area, state branch)"
```

---

## Task 7: Render component + route

**Files:**
- Create: `components/buyer-leverage/BuyerLeverageRead.tsx`
- Create: `app/r/how-long-has-it-sat/page.tsx`

**Interfaces:**
- Consumes: `loadLeverageRead`, `LeverageRead` (Task 6); report-shell (`app/r/_components/report-shell.tsx`).

- [ ] **Step 1: Write the render component**

```tsx
// components/buyer-leverage/BuyerLeverageRead.tsx
import type { LeverageRead } from "@/lib/buyer-leverage/types";

/** Renders the composed leverage lines + the ZIP-area context. Facts only; empty-tolerant. */
export default function BuyerLeverageRead({ data }: { data: LeverageRead }) {
  const { lines, benchmark, dom } = data;
  const hasArea = benchmark?.medianDomDays != null;
  return (
    <section className="mt-6 space-y-4">
      {lines.length > 0 ? (
        <div className="space-y-3">
          {lines.map((line, i) => (
            <p key={i} className="text-base leading-7 text-gray-200">
              {line}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-base leading-7 text-gray-300">
          {dom && dom.state !== "active"
            ? "This home isn't actively for sale right now, so there's no live negotiating read to give."
            : "We don't have enough recorded history on this home yet to read its negotiating position."}
        </p>
      )}
      {hasArea && (
        <dl className="grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-gray-500">Typical time on market here</dt>
            <dd className="text-gray-200">{benchmark!.medianDomDays} days</dd>
          </div>
          {benchmark!.priceReducedShare != null && (
            <div>
              <dt className="text-gray-500">Listings here with a price cut</dt>
              <dd className="text-gray-200">{Math.round(benchmark!.priceReducedShare * 100)}%</dd>
            </div>
          )}
        </dl>
      )}
      <p className="text-xs text-gray-600">Source: SWFL Data Gulf. Figures reflect our recorded listing history.</p>
    </section>
  );
}
```

- [ ] **Step 2: Write the route (mirror back-on-market)**

```tsx
// app/r/how-long-has-it-sat/page.tsx
import { loadLeverageRead } from "@/lib/buyer-leverage/load";
import BuyerLeverageRead from "@/components/buyer-leverage/BuyerLeverageRead";
import { ReportShell, ReportHeader, ReportFooter, Meta } from "../_components/report-shell";
import { resolveZip } from "@/refinery/lib/zip-resolver.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const data = await loadLeverageRead(q);

  if (!data) {
    return (
      <ReportShell width="2xl">
        <ReportHeader title="How long has it sat?">
          <p className="mt-3 max-w-2xl text-base leading-7 text-gray-300">
            How long a home has really been listed — and how its price has moved — in Lee or Collier
            County. Enter a ZIP or a full street address.
          </p>
          <form method="get" className="mt-5 flex max-w-xl flex-wrap gap-2">
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Your ZIP or address — e.g. 33904, or 123 Main St, Cape Coral"
              aria-label="ZIP or address"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:border-gulf-teal/60 focus:outline-none focus:ring-1 focus:ring-gulf-teal/40"
            />
            <button
              type="submit"
              className="btn-gradient inline-flex shrink-0 items-center rounded-lg px-5 py-3 text-sm font-semibold text-navy-dark transition-all hover:opacity-90"
            >
              Look it up
            </button>
          </form>
        </ReportHeader>
        <ReportFooter />
      </ReportShell>
    );
  }

  const county = resolveZip(data.zip).county_names?.[0];
  return (
    <ReportShell width="2xl">
      <ReportHeader title="How long has it sat?">
        <p className="mt-3 max-w-2xl text-base leading-7 text-gray-300">
          The real time-on-market and price history for {data.place} — the signals that shape a
          buyer&rsquo;s negotiating position. Every number names its source.
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <Meta label="Area" value={`${data.place} · ${data.zip}`} />
          {county && <Meta label="County" value={`${county} County`} />}
        </dl>
      </ReportHeader>
      <BuyerLeverageRead data={data} />
      <ReportFooter />
    </ReportShell>
  );
}
```

- [ ] **Step 3: Verify the production build compiles**

Run: `bunx next build`
Expected: build succeeds; `/r/how-long-has-it-sat` appears in the route list. (Do NOT trust `npx tsc` here — verify with the real build per project convention.)

- [ ] **Step 4: Commit**

```bash
git add components/buyer-leverage/BuyerLeverageRead.tsx app/r/how-long-has-it-sat/page.tsx
git commit -m "feat(buyer-leverage): /r/how-long-has-it-sat route + read component"
```

---

## Task 8: Live-verify + close out

**Files:** none (verification + ledger).

- [ ] **Step 1: Serve and fingerprint the real route** — use the `verify` skill (build → serve on a clean port → screenshot) against `/r/how-long-has-it-sat?q=33904` (area read) and one real Cape Coral address (per-home read). Confirm: real numbers render, no forbidden phrase appears, as-of/source line shows "SWFL Data Gulf", no vendor name, no system nouns.

- [ ] **Step 2: Full test sweep**

Run: `bun test lib/buyer-leverage/`
Expected: all tests green.

- [ ] **Step 3: SESSION_LOG entry** — append a top-of-file entry (what shipped, the route, the follow-up check) per RULE 0.

- [ ] **Step 4: Close the checks**

Run: `node scripts/check.mjs close buyer_leverage_report_live_verify`
Run: `node scripts/check.mjs close steady20_buyer_leverage_report_dom_cdom`

- [ ] **Step 5: Operator-gated push** — show the diff and the SESSION_LOG entry; do NOT push autonomously. On the operator's go: `node scripts/safe-push.mjs` (after confirming no foreign commits are bundled — `main` had a live parallel-session divergence).

---

## Self-Review

**Spec coverage:** route + grain (Task 6/7) · per-home DOM+state read (Task 3) · price-cut event history incl. forward-only hedge (Tasks 1–2, 5) · relist reuse (Task 6) · live ZIP benchmark floored-excluded + share reuse (Task 4) · no-invention framing (Task 5) · provenance/as-of (Task 7) · empty-tolerance (every read task) · no-match degrade-to-area (Task 6) · state branch (Task 5/6) · testing incl. completeness/censor (Tasks 1,4,5) · close-out + follow-up check already open (Task 8). All spec sections map to a task.

**Placeholder scan:** no TBD/TODO; every code step carries real code; every command has expected output.

**Type consistency:** `DomRead`/`CutHistory`/`ZipBenchmark`/`LeverageRead` defined once in `types.ts` (Task 1) and consumed unchanged in Tasks 3–7; `deriveCutHistory`/`fetchCutRows`/`fetchDomRead`/`fetchZipBenchmark`/`composeLeverageLines`/`loadLeverageRead` names match across producer and consumer tasks. `TransitionRow` defined in cut-history.ts (Task 1), reused in load.ts (Task 6). The `LoadDeps` interface in Task 6 is flagged as removable noise — the real signature is the inline `deps` param.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 1, Task 2 | `lib/buyer-leverage/cut-history.ts`, `lib/buyer-leverage/cut-history.test.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
