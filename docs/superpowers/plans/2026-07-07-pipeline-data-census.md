# Pipeline Data Census Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 9 tasks, 10 files, keywords: refactor, schema, architecture

**Goal:** Ship a live `/census` ops page that lists every pipeline in `cadence_registry.yaml`, grouped by category, showing live row counts, the existing freshness/floor guard, and three research cells (confirmed total / source ceiling / vendor benchmark) that show real cited data or an explicit "pending" — never a guess.

**Architecture:** `cadence_registry.yaml` (brain-platform) stays the one config root; this plan documents its new optional `source_scope` schema there (no entries filled in yet — that's a separate future pass). All display/grouping logic lives in `swfldatagulf-ops`: a new `lib/census.ts` orchestrator reuses the live Supabase/GitHub adapters and the `classify()` guard logic already proven in `lib/coverage.ts`, adds one new row-count-only Supabase query (`rowCounts`, needed because the existing `tableCoverage` skips any table without a date column — several pipelines have none), and a small pure `lib/census-logic.mjs` module (grouping/counting, unit-tested) feeds a new `app/census/page.tsx`.

**Tech Stack:** Next.js 15 App Router (server component, no client JS needed), TypeScript, `@supabase/supabase-js`, `yaml` package, plain Node `node:test` for pure-logic unit tests (matches this repo's existing `lib/queue-match.mjs` / `lib/queue-match.test.mjs` pattern — this repo does not unit-test its Supabase/GitHub I/O adapters or page components; those are verified via `npm run build` + a manual dev-server check, and this plan follows that established split rather than introducing a new one).

## Global Constraints

- Two repos are touched: `brain-platform` (`C:\Users\ethan\dev\brain-platform`) for Task 1 only, and `swfldatagulf-ops` (`C:\Users\ethan\dev\swfldatagulf-ops`) for Tasks 2–9. Each task states which repo it's in.
- Never invent a number. `source_scope.confirmed_total` / `source_ceiling` / `vendor_benchmark` are only ever real, cited values or absent (rendered as "pending research"). This plan does not populate any real values — that's a future, separate research pass per pipeline.
- No new database table and no new ledger — `cadence_registry.yaml` is the only new place data can live, and this plan only documents its schema, doesn't populate it.
- Category and cross-pipeline grouping metadata live in the ops repo (`lib/census-supplement.ts`), following the existing `SUPPLEMENT` pattern already in `lib/coverage.ts` — "the registry can't carry purely cosmetic ops-display metadata" is an established precedent here, not a new one.
- No auto-remediation of guard failures. The guard badge on the new page reuses the exact `classify()` status (`FRESH`/`STALE`/`LOW_VOLUME`/`MISSING`/`EMPTY`/`RECENT_GAP`) already computed by `lib/coverage.ts` — this plan does not duplicate the GRAB/FIX/FIND/ROUTE work-order text generator, which stays on `/coverage`.
- Stage explicit file paths in every commit — never `git add -A` (RULE 1.5).
- Reference design doc: `docs/superpowers/specs/2026-07-07-pipeline-data-census-design.md`.

---

### Task 1: Document the `source_scope` schema in the registry

**Repo:** `brain-platform`

**Files:**
- Modify: `ingest/cadence_registry.yaml:1-41` (the header comment block)

**Interfaces:**
- Produces: the `source_scope` YAML shape (`confirmed_total`, `source_ceiling`, `vendor_benchmark`, each `{value|summary, as_of, source_url, source_label|source}`) that Task 7's `census.ts` parser expects to find on any entry that has it. No entry gets one populated in this plan — this task only documents the shape so a future research pass has a schema to fill in.

- [ ] **Step 1: Add the `source_scope` doc block**

Open `ingest/cadence_registry.yaml` and insert this new block immediately after the existing `#   SLA fields (optional...)` block (ends at line 37) and before the blank line at line 38:

```yaml
#
#   source_scope (optional, any lane — filled in ONLY by a real per-source research pass,
#                 crawl4ai per RULE 0.4; never a guessed number; absent = "pending research"):
#     confirmed_total: {value, as_of, source_url, source_label}
#       The source's own confirmed/published total — DISTINCT from expected_rows_min above,
#       which is a 90%-of-last-observed-count heuristic, not a confirmed promise.
#     source_ceiling: {summary, source_url}
#       Everything the source publishes that we could pull, even fields/years/geography we
#       don't currently ingest — the true ceiling, not just what we've built so far.
#     vendor_benchmark: {source, value, as_of, source_url}
#       An external authority's own count for the same scope (e.g. Redfin's own published
#       inventory count for a ZIP/county). Omit entirely when no real comparable exists —
#       never fill with a placeholder or "N/A" value.
#   Read live by /ops/census (swfldatagulf-ops repo). See
#   docs/superpowers/specs/2026-07-07-pipeline-data-census-design.md for the full design.
```

- [ ] **Step 2: Verify the registry still parses cleanly**

Run: `python -c "import yaml; d = yaml.safe_load(open('ingest/cadence_registry.yaml')); print(len(d['pipelines']), len(d['not_yet_running']))"`
Expected: prints two numbers (pipeline counts) with no exception — confirms the added comments didn't break YAML syntax.

- [ ] **Step 3: Commit**

```bash
git add ingest/cadence_registry.yaml
git commit -m "docs(ingest): document source_scope registry schema for the pipeline data census"
```

---

### Task 2: Add a row-count-only Supabase query

**Repo:** `swfldatagulf-ops`

**Files:**
- Modify: `lib/supabase.ts` (append new function + interfaces at end of file, after `supabaseMeta`)

**Interfaces:**
- Consumes: nothing new — same `URL`/`KEY`/`createClient` module-level setup already in this file.
- Produces: `rowCounts(specs: RowCountSpec[]): Promise<{ available: boolean; rows: RowCount[] }>` where `RowCountSpec = { name: string; schema: string; table: string; source_name?: string }` and `RowCount = { name: string; count: number }` (`count: -1` = query failed). Task 7 (`lib/census.ts`) calls this directly.

**Why this can't reuse `tableCoverage`:** `tableCoverage` requires a `dateCol` on every spec (it always queries min/max on that column). Several pipelines have no date column at all in the existing `SUPPLEMENT` map (e.g. `collier_parcels`, `fl_dbpr_licenses`) and are silently skipped by `/coverage`'s row-count query today. The census page needs a count for every tier-2 pipeline regardless, so this is a new, narrower function rather than a retrofit of a working one.

- [ ] **Step 1: Append the new function**

Add to the end of `lib/supabase.ts`, after the `supabaseMeta` line:

```typescript
export interface RowCountSpec {
  name: string; // registry entry name — lookup key
  schema: string;
  table: string;
  source_name?: string; // filter WHERE source_name = ? on shared tables
}

export interface RowCount {
  name: string;
  count: number; // -1 = query failed
}

/**
 * Row-count-only probe, usable on ANY tier-2 table regardless of whether it
 * has a date column (tableCoverage above requires one for its min/max feature
 * and silently skips tables that lack it — this doesn't).
 */
export async function rowCounts(
  specs: RowCountSpec[],
): Promise<{ available: boolean; rows: RowCount[] }> {
  if (!URL || !KEY || specs.length === 0) return { available: false, rows: [] };
  try {
    const rows: RowCount[] = [];
    for (const s of specs) {
      const sb = createClient(URL, KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        db: { schema: s.schema },
      });
      let query = sb.from(s.table).select("*", { count: "exact", head: true });
      if (s.source_name) query = query.eq("source_name", s.source_name);
      const { count, error } = await query;
      rows.push({ name: s.name, count: error ? -1 : (count ?? 0) });
    }
    return { available: true, rows };
  } catch {
    return { available: false, rows: [] };
  }
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run build` (from `swfldatagulf-ops`)
Expected: build succeeds (this function isn't imported anywhere yet, so this only proves it compiles standalone — full wiring is verified in Task 7/9).

- [ ] **Step 3: Commit**

```bash
git add lib/supabase.ts
git commit -m "feat(census): add rowCounts — row-count probe for tables without a date column"
```

---

### Task 3: Add a "pending research" pill style

**Repo:** `swfldatagulf-ops`

**Files:**
- Modify: `app/globals.css:710-723` (the `.pill` block)

**Interfaces:**
- Produces: CSS class `.pill.dim`, used by Task 8's `app/census/page.tsx` for the "pending" badge.

- [ ] **Step 1: Add the `.pill.dim` rule**

In `app/globals.css`, immediately after the existing `.pill.red { ... }` rule (ends at line 723), add:

```css
.pill.dim {
  background: rgba(107, 135, 148, 0.12);
  color: var(--muted);
}
```

- [ ] **Step 2: Verify visually**

Run: `npm run dev` (from `swfldatagulf-ops`), open any existing page with pills (e.g. `/coverage`) in a browser, confirm no visual regression to the existing green/yellow/red pills. (The new `.dim` variant itself is verified visually in Task 9 once a page actually renders it.)

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "style(census): add .pill.dim for pending-research badges"
```

---

### Task 4: Export the guard/parsing internals from `lib/coverage.ts`

**Repo:** `swfldatagulf-ops`

**Files:**
- Modify: `lib/coverage.ts` (four single-word additions — no logic changes)

**Interfaces:**
- Produces: `classify` (function), `resolveSpec` (function), `ageInDays` (function), and `RegistryEntry` (type) all become exported. Task 7 (`lib/census.ts`) imports all four instead of re-implementing the same guard/parsing logic.

- [ ] **Step 1: Add `export` to the four internals**

In `lib/coverage.ts`, change:
- `function resolveSpec(e: RegistryEntry): string | null {` → `export function resolveSpec(e: RegistryEntry): string | null {`
- `function ageInDays(iso: string, now: Date): number {` → `export function ageInDays(iso: string, now: Date): number {`
- `function classify(p: SourceProbe, currentYear: number): ClassifiedRow {` → `export function classify(p: SourceProbe, currentYear: number): ClassifiedRow {`
- `interface RegistryEntry {` → `export interface RegistryEntry {`

- [ ] **Step 2: Verify it type-checks and `/coverage` still builds identically**

Run: `npm run build` (from `swfldatagulf-ops`)
Expected: build succeeds with no new errors (these are additive `export` keywords on functions/types whose bodies are unchanged — `/coverage`'s existing behavior cannot change).

- [ ] **Step 3: Commit**

```bash
git add lib/coverage.ts
git commit -m "refactor(census): export classify/resolveSpec/ageInDays/RegistryEntry for reuse by the census page"
```

---

### Task 5: Pure census logic module (TDD)

**Repo:** `swfldatagulf-ops`

**Files:**
- Create: `lib/census-logic.mjs`
- Test: `lib/census-logic.test.mjs`

**Interfaces:**
- Consumes: nothing (pure functions, plain objects in/out).
- Produces: `prettifyLabel(name: string): string`, `countPipelines(registry: {pipelines?: Array, not_yet_running?: Array}): {total, active, parked}`, `groupByCategory(entries: Array<{name: string}>, categoryMap: Record<string,string>): Map<string, Array>`, `groupSharedTables(entries: Array<{name: string, spec: string|null}>): Array<{spec: string|null, members: Array}>`, `researchProgress(entries: Array<{source_scope?: object}>): {total, confirmedTotal, sourceCeiling, vendorBenchmark}`, and the constant `UNCATEGORIZED`. Task 6 uses none of these directly; Task 7 (`lib/census.ts`) imports all of them.

- [ ] **Step 1: Write the failing tests**

Create `lib/census-logic.test.mjs`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import {
  prettifyLabel,
  countPipelines,
  groupByCategory,
  groupSharedTables,
  researchProgress,
  UNCATEGORIZED,
} from "./census-logic.mjs";

test("prettifyLabel replaces underscores and title-cases each word", () => {
  assert.equal(prettifyLabel("fl_dbpr_licenses"), "Fl Dbpr Licenses");
  assert.equal(prettifyLabel("leepa"), "Leepa");
});

test("countPipelines sums pipelines: + not_yet_running: entries", () => {
  const registry = {
    pipelines: [{ name: "a" }, { name: "b" }],
    not_yet_running: [{ name: "c" }],
  };
  assert.deepEqual(countPipelines(registry), { total: 3, active: 2, parked: 1 });
});

test("countPipelines handles a missing not_yet_running block", () => {
  const registry = { pipelines: [{ name: "a" }] };
  assert.deepEqual(countPipelines(registry), { total: 1, active: 1, parked: 0 });
});

test("groupByCategory buckets entries by the category map", () => {
  const entries = [{ name: "leepa" }, { name: "bls_laus" }];
  const map = { leepa: "Real Estate & Property", bls_laus: "Labor & Economy" };
  const groups = groupByCategory(entries, map);
  assert.deepEqual(
    groups.get("Real Estate & Property").map((e) => e.name),
    ["leepa"],
  );
  assert.deepEqual(
    groups.get("Labor & Economy").map((e) => e.name),
    ["bls_laus"],
  );
});

test("groupByCategory falls back to Uncategorized for an unmapped entry (surfaces the gap, doesn't drop it)", () => {
  const entries = [{ name: "brand_new_pipeline" }];
  const groups = groupByCategory(entries, {});
  assert.deepEqual(groups.get(UNCATEGORIZED).map((e) => e.name), [
    "brand_new_pipeline",
  ]);
});

test("groupSharedTables clusters entries with the same resolved spec into one family", () => {
  const entries = [
    { name: "marketbeat_swfl", spec: "data_lake.marketbeat_swfl" },
    { name: "colliers_industrial", spec: "data_lake.marketbeat_swfl" },
    { name: "leepa", spec: "data_lake.leepa_parcels" },
  ];
  const families = groupSharedTables(entries);
  const marketbeatFamily = families.find(
    (f) => f.spec === "data_lake.marketbeat_swfl",
  );
  assert.equal(marketbeatFamily.members.length, 2);
  const leepaFamily = families.find((f) => f.spec === "data_lake.leepa_parcels");
  assert.equal(leepaFamily.members.length, 1);
});

test("groupSharedTables keeps null-spec (Tier-1 Parquet) entries as singleton families", () => {
  const entries = [
    { name: "hurdat2_fl", spec: null },
    { name: "faf5", spec: null },
  ];
  const families = groupSharedTables(entries);
  assert.equal(families.length, 2);
  assert.equal(
    families.every((f) => f.members.length === 1),
    true,
  );
});

test("researchProgress counts filled source_scope cells against the total", () => {
  const entries = [
    { name: "a", source_scope: { confirmed_total: { value: 1 } } },
    {
      name: "b",
      source_scope: {
        confirmed_total: { value: 2 },
        source_ceiling: { summary: "x" },
      },
    },
    { name: "c" },
  ];
  assert.deepEqual(researchProgress(entries), {
    total: 3,
    confirmedTotal: 2,
    sourceCeiling: 1,
    vendorBenchmark: 0,
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test lib/census-logic.test.mjs`
Expected: FAIL — `Cannot find module './census-logic.mjs'` (the module doesn't exist yet).

- [ ] **Step 3: Implement the module**

Create `lib/census-logic.mjs`:

```javascript
/**
 * Pure logic for the /census page — no I/O, no Supabase, no GitHub. Tested
 * directly with node:test (see census-logic.test.mjs), mirroring the existing
 * queue-match.mjs / queue-match.test.mjs split in this repo.
 */

/** "fl_dbpr_licenses" -> "Fl Dbpr Licenses" */
export function prettifyLabel(name) {
  return name
    .split("_")
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

/**
 * Total pipeline count = every entry under `pipelines:` + `not_yet_running:`
 * in the parsed registry YAML — the live denominator for "how many pipelines
 * do we have," never hand-typed.
 */
export function countPipelines(registry) {
  const active = registry?.pipelines ?? [];
  const parked = registry?.not_yet_running ?? [];
  return {
    total: active.length + parked.length,
    active: active.length,
    parked: parked.length,
  };
}

export const UNCATEGORIZED = "Uncategorized";

/**
 * Groups entries by category from `categoryMap`. An entry missing from the
 * map falls into UNCATEGORIZED so a newly-added pipeline is visible as a gap
 * on the page instead of silently vanishing.
 */
export function groupByCategory(entries, categoryMap) {
  const groups = new Map();
  for (const entry of entries) {
    const category = categoryMap[entry.name] ?? UNCATEGORIZED;
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(entry);
  }
  return groups;
}

/**
 * Clusters entries that resolve to the SAME table spec (e.g. four registry
 * entries all writing to data_lake.marketbeat_swfl, split by source_name)
 * into one family so the page renders them as sub-rows of a single pipeline
 * card instead of unrelated cards. Entries with a null spec (Tier-1 Parquet,
 * no SQL table) are singleton families of one, keyed by insertion order.
 */
export function groupSharedTables(entries) {
  const bySpec = new Map();
  const singles = [];
  for (const entry of entries) {
    if (!entry.spec) {
      singles.push({ spec: null, members: [entry] });
      continue;
    }
    if (!bySpec.has(entry.spec)) bySpec.set(entry.spec, []);
    bySpec.get(entry.spec).push(entry);
  }
  const families = [...bySpec.entries()].map(([spec, members]) => ({
    spec,
    members,
  }));
  return [...families, ...singles];
}

/**
 * Research progress counters for the page header: how many of the total
 * pipelines have each source_scope cell filled in.
 */
export function researchProgress(entries) {
  let confirmedTotal = 0;
  let sourceCeiling = 0;
  let vendorBenchmark = 0;
  for (const e of entries) {
    const scope = e.source_scope;
    if (scope?.confirmed_total) confirmedTotal += 1;
    if (scope?.source_ceiling) sourceCeiling += 1;
    if (scope?.vendor_benchmark) vendorBenchmark += 1;
  }
  return { total: entries.length, confirmedTotal, sourceCeiling, vendorBenchmark };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test lib/census-logic.test.mjs`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/census-logic.mjs lib/census-logic.test.mjs
git commit -m "feat(census): pure grouping/counting logic for the pipeline data census, unit-tested"
```

---

### Task 6: Category map for every pipeline

**Repo:** `swfldatagulf-ops`

**Files:**
- Create: `lib/census-supplement.ts`

**Interfaces:**
- Produces: `CATEGORY: Record<string, string>` (every current registry pipeline name → category) and `CATEGORY_ORDER: string[]` (display order). Task 7 (`lib/census.ts`) imports both.

This is a hand-maintained data file — same precedent as `SUPPLEMENT` in `lib/coverage.ts`. It is data, not logic, so it has no unit test; correctness is verified by the page actually rendering every pipeline into a named category with zero falling into "Uncategorized" (checked in Task 9). Every one of the 72 pipeline names currently in `ingest/cadence_registry.yaml` (as of 2026-07-07, verified by reading the file directly) is listed below.

- [ ] **Step 1: Create the file**

Create `lib/census-supplement.ts`:

```typescript
/**
 * Category assignment for every pipeline in ingest/cadence_registry.yaml —
 * purely a display/grouping concern for /census, so it lives here rather than
 * in the registry (same precedent as SUPPLEMENT in lib/coverage.ts). Any
 * pipeline name missing from this map falls into "Uncategorized" on the page
 * (see census-logic.mjs groupByCategory) instead of vanishing silently —
 * that's the signal to add it here when a new pipeline is registered.
 */

export const CATEGORY: Record<string, string> = {
  // ── Real Estate & Property ──────────────────────────────────────────────
  live_search_daily_median_price: "Real Estate & Property",
  live_search_daily_mortgage: "Real Estate & Property",
  zori_swfl_duckdb: "Real Estate & Property",
  zhvi_swfl_duckdb: "Real Estate & Property",
  tier_divergence_swfl_duckdb: "Real Estate & Property",
  redfin_swfl: "Real Estate & Property",
  redfin_price_drops: "Real Estate & Property",
  redfin_contract_cancellations: "Real Estate & Property",
  redfin_delistings_relistings: "Real Estate & Property",
  fred_listing_swfl: "Real Estate & Property",
  leepa: "Real Estate & Property",
  redfin_collier: "Real Estate & Property",
  redfin_lee: "Real Estate & Property",
  collier_parcels: "Real Estate & Property",
  fhfa: "Real Estate & Property",
  zori_swfl_tier2: "Real Estate & Property",
  zhvi_swfl_tier2: "Real Estate & Property",
  tier_divergence_swfl_tier2: "Real Estate & Property",
  active_listings: "Real Estate & Property",
  listing_lifecycle: "Real Estate & Property",
  rentals_swfl: "Real Estate & Property",
  airdna_str_swfl: "Real Estate & Property",
  land_manufactured_swfl: "Real Estate & Property",

  // ── Market Aggregates ────────────────────────────────────────────────────
  market_heat_swfl: "Market Aggregates",
  market_aggregates_histogram: "Market Aggregates",
  market_aggregates_details: "Market Aggregates",

  // ── Permits & Licenses ───────────────────────────────────────────────────
  lee_permits: "Permits & Licenses",
  collier_permits: "Permits & Licenses",
  dbpr_sirs_submissions: "Permits & Licenses",
  fl_dbpr_licenses: "Permits & Licenses",
  fl_dbpr_applicants: "Permits & Licenses",
  dbpr_public_notices: "Permits & Licenses",

  // ── CRE / Commercial ─────────────────────────────────────────────────────
  marketbeat_swfl: "CRE / Commercial",
  colliers_industrial: "CRE / Commercial",
  mhs_databook: "CRE / Commercial",
  mhs_permits_swfl: "CRE / Commercial",
  crexi_listings: "CRE / Commercial",
  brevitas_listings: "CRE / Commercial",
  lee_associates_swfl: "CRE / Commercial",
  estero_edc: "CRE / Commercial",
  fmb_recovery: "CRE / Commercial",

  // ── Labor & Economy ──────────────────────────────────────────────────────
  bls_oews_swfl_tier1: "Labor & Economy",
  census_vip: "Labor & Economy",
  bls_laus: "Labor & Economy",
  bls_qcew: "Labor & Economy",
  bls_oews_swfl: "Labor & Economy",
  census_cbp: "Labor & Economy",
  census_acs: "Labor & Economy",
  fgcu_reri_indicators: "Labor & Economy",
  swfl_inc: "Labor & Economy",
  sba_foia_franchise_outcomes: "Labor & Economy",

  // ── Environmental ────────────────────────────────────────────────────────
  hurdat2_fl: "Environmental",
  storm_history_swfl: "Environmental",
  usgs: "Environmental",
  usgs_tier2: "Environmental",
  fema: "Environmental",
  noaa_ghcn_rainfall: "Environmental",

  // ── Government Revenue & Tourism ─────────────────────────────────────────
  fl_dor_tdt: "Government Revenue & Tourism",
  fl_dor_sales_tax: "Government Revenue & Tourism",
  rsw_airport_monthly: "Government Revenue & Tourism",

  // ── News & Compliance ────────────────────────────────────────────────────
  city_pulse: "News & Compliance",
  city_pulse_corridors: "News & Compliance",
  dbpr_press_releases: "News & Compliance",
  city_pulse_corridors_tier2: "News & Compliance",
  news_swfl: "News & Compliance",

  // ── Infrastructure & Transportation ──────────────────────────────────────
  faf5: "Infrastructure & Transportation",
  fdot: "Infrastructure & Transportation",

  // ── Macro (National) ─────────────────────────────────────────────────────
  fred_g17: "Macro (National)",
  fred_laus_alfred: "Macro (National)",
  bls_ppi: "Macro (National)",

  // ── Public Safety ────────────────────────────────────────────────────────
  fdle_crime_swfl: "Public Safety",

  // ── Operator-Internal ────────────────────────────────────────────────────
  swfl_search_demand: "Operator-Internal",
};

export const CATEGORY_ORDER: string[] = [
  "Real Estate & Property",
  "Market Aggregates",
  "Permits & Licenses",
  "CRE / Commercial",
  "Labor & Economy",
  "Environmental",
  "Government Revenue & Tourism",
  "News & Compliance",
  "Infrastructure & Transportation",
  "Macro (National)",
  "Public Safety",
  "Operator-Internal",
];
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run build` (from `swfldatagulf-ops`)
Expected: build succeeds (not imported anywhere yet — full wiring verified in Task 7/9).

- [ ] **Step 3: Commit**

```bash
git add lib/census-supplement.ts
git commit -m "feat(census): category map for every registry pipeline"
```

---

### Task 7: Census orchestrator

**Repo:** `swfldatagulf-ops`

**Files:**
- Create: `lib/census.ts`

**Interfaces:**
- Consumes: `rawText` from `./github`; `rowCounts`, `latestDltLoads`, `tier1Freshness`, `directTableFreshness`, `supabaseMeta` from `./supabase`; `classify`, `resolveSpec`, `ageInDays`, `RegistryEntry`, `SourceProbe`, `ClassifiedRow` from `./coverage`; `prettifyLabel`, `countPipelines`, `groupByCategory`, `groupSharedTables`, `researchProgress`, `UNCATEGORIZED` from `./census-logic.mjs`; `CATEGORY`, `CATEGORY_ORDER` from `./census-supplement`.
- Produces: `buildCensus(): Promise<CensusResult>` and the exported types `CensusEntry`, `CensusFamily`, `CensusCategory`, `CensusResult`, `SourceScope`. Task 8 (`app/census/page.tsx`) calls `buildCensus()` and renders these types.

- [ ] **Step 1: Create the file**

Create `lib/census.ts`:

```typescript
/**
 * Pipeline Data Census — every registry pipeline, grouped by category, with
 * live row counts, the existing freshness/floor guard (reused from
 * lib/coverage.ts), and source-scope research cells (confirmed total /
 * source ceiling / vendor benchmark) shown as real cited data or an explicit
 * "pending" — never a guess. See
 * docs/superpowers/specs/2026-07-07-pipeline-data-census-design.md
 * (brain-platform) for the design.
 */
import { parse as parseYaml } from "yaml";
import { rawText } from "./github";
import {
  rowCounts,
  latestDltLoads,
  tier1Freshness,
  directTableFreshness,
  supabaseMeta,
} from "./supabase";
import {
  classify,
  resolveSpec,
  ageInDays,
  type RegistryEntry,
  type SourceProbe,
  type ClassifiedRow,
} from "./coverage";
import {
  prettifyLabel,
  countPipelines,
  groupByCategory,
  groupSharedTables,
  researchProgress,
  UNCATEGORIZED,
} from "./census-logic.mjs";
import { CATEGORY, CATEGORY_ORDER } from "./census-supplement";

export interface SourceScopeValue {
  value?: number;
  as_of?: string;
  source_url?: string;
  source_label?: string;
  summary?: string;
  source?: string;
}

export interface SourceScope {
  confirmed_total?: SourceScopeValue;
  source_ceiling?: SourceScopeValue;
  vendor_benchmark?: SourceScopeValue;
}

interface CensusRegistryEntry extends RegistryEntry {
  source_scope?: SourceScope;
}

export interface CensusEntry {
  name: string;
  label: string;
  lane: string;
  spec: string | null;
  classified: ClassifiedRow;
  sourceScope: SourceScope | undefined;
}

export interface CensusFamily {
  spec: string | null;
  members: CensusEntry[];
}

export interface CensusCategory {
  category: string;
  families: CensusFamily[];
}

export interface CensusResult {
  generatedAt: string;
  available: { github: boolean; supabase: boolean };
  pipelineCount: { total: number; active: number; parked: number };
  progress: {
    total: number;
    confirmedTotal: number;
    sourceCeiling: number;
    vendorBenchmark: number;
  };
  categories: CensusCategory[];
}

export async function buildCensus(): Promise<CensusResult> {
  const now = new Date();
  const currentYear = now.getUTCFullYear();

  const registryRaw = await rawText("ingest/cadence_registry.yaml");
  let reg: {
    pipelines?: CensusRegistryEntry[];
    not_yet_running?: CensusRegistryEntry[];
  } = {};
  if (registryRaw) {
    try {
      reg = parseYaml(registryRaw) ?? {};
    } catch {
      reg = {};
    }
  }
  const githubOk = Boolean(registryRaw);

  const active = reg.pipelines ?? [];
  const parked = reg.not_yet_running ?? [];
  const parkedSet = new Set(parked);
  const allEntries = [...active, ...parked];
  const pipelineCount = countPipelines(reg);

  const withSpec = allEntries.map((e) => ({ e, spec: resolveSpec(e) }));

  const rowCountSpecs = withSpec
    .filter(({ spec }) => spec !== null)
    .map(({ e, spec }) => {
      const [schema, table] = (spec as string).split(".", 2);
      return { name: e.name, schema, table, source_name: e.source_name };
    });
  const t1Entries = allEntries
    .filter((e) => e.inventory_id)
    .map((e) => ({
      inventory_id: e.inventory_id!,
      key_type: (e.inventory_key_type ?? "exact") as "exact" | "prefix",
    }));
  const freshTables = allEntries
    .filter((e) => Boolean(e.freshness_table))
    .map((e) => ({
      name: e.name,
      table: e.freshness_table!,
      column: e.freshness_column,
      source_name: e.source_name,
    }));

  const [counts, dlt, t1, direct] = await Promise.all([
    rowCounts(rowCountSpecs),
    latestDltLoads(),
    tier1Freshness(t1Entries),
    directTableFreshness(freshTables),
  ]);

  const countByName = new Map(counts.rows.map((r) => [r.name, r.count]));
  const loadBySchema = new Map(dlt.loads.map((l) => [l.schema_name, l.last_loaded]));
  const loadByInv = new Map(t1.loads.map((l) => [l.inventory_id, l.updated_at]));
  const loadByName = new Map(direct.loads.map((l) => [l.name, l.last_inserted]));

  const censusEntries: CensusEntry[] = withSpec.map(({ e, spec }) => {
    const lane = e.lane ?? "tier-2";
    const rawCount = spec !== null ? (countByName.get(e.name) ?? null) : null;
    const queryFailed = rawCount === -1;
    const rowCount = queryFailed ? null : rawCount;
    const lastLoad = e.freshness_table
      ? (loadByName.get(e.name) ?? null)
      : e.inventory_id
        ? (loadByInv.get(e.inventory_id) ?? null)
        : (loadBySchema.get(e.dlt_schema_name ?? e.name) ?? null);

    const probe: SourceProbe = {
      name: e.name,
      label: prettifyLabel(e.name),
      brainId: null,
      brainHref: null,
      brainIsLive: false,
      lane,
      spec,
      notYetRunning: parkedSet.has(e),
      note: e.note ?? null,
      cadenceDays: e.cadence_days ?? 30,
      toleranceMultiplier: e.tolerance_multiplier ?? 2,
      expectedRowsMin: e.expected_rows_min ?? null,
      rowCount,
      queryFailed,
      lastLoad,
      ageDays: lastLoad ? ageInDays(lastLoad, now) : null,
      minYear: null,
      maxYear: null,
      windowStart: 0, // unused: census tracks row counts, not year coverage (that's /coverage's job)
    };

    return {
      name: e.name,
      label: probe.label,
      lane,
      spec,
      classified: classify(probe, currentYear),
      sourceScope: e.source_scope,
    };
  });

  const byCategory = groupByCategory(censusEntries, CATEGORY) as Map<
    string,
    CensusEntry[]
  >;
  const orderedCategories = [...CATEGORY_ORDER, UNCATEGORIZED].filter((c) =>
    byCategory.has(c),
  );
  const categories: CensusCategory[] = orderedCategories.map((category) => ({
    category,
    families: groupSharedTables(byCategory.get(category)!) as CensusFamily[],
  }));

  return {
    generatedAt: now.toISOString(),
    available: { github: githubOk, supabase: supabaseMeta.hasEnv },
    pipelineCount,
    progress: researchProgress(allEntries),
    categories,
  };
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run build` (from `swfldatagulf-ops`)
Expected: build succeeds. `buildCensus` isn't called from a page yet, so this only proves the module compiles; end-to-end behavior is verified in Task 9.

- [ ] **Step 3: Commit**

```bash
git add lib/census.ts
git commit -m "feat(census): buildCensus orchestrator — live counts + guard + grouping for every pipeline"
```

---

### Task 8: The `/census` page

**Repo:** `swfldatagulf-ops`

**Files:**
- Create: `app/census/page.tsx`

**Interfaces:**
- Consumes: `buildCensus`, `CensusEntry`, `CensusFamily`, `SourceScopeValue` from `../../lib/census`; `Link` from `../ui`.
- Produces: the `/census` route (default export `CensusPage`).

- [ ] **Step 1: Create the page**

Create `app/census/page.tsx`:

```tsx
import Image from "next/image";
import { Link } from "../ui";
import {
  buildCensus,
  type CensusEntry,
  type CensusFamily,
  type SourceScopeValue,
} from "../../lib/census";

export const revalidate = 300;

function guardPill(entry: CensusEntry) {
  const status = entry.classified.status;
  const cls =
    status === "FRESH"
      ? "green"
      : status === "STALE" || status === "RECENT_GAP"
        ? "yellow"
        : "red";
  return <span className={`pill ${cls}`}>{status}</span>;
}

function countCell(entry: CensusEntry) {
  const p = entry.classified.probe;
  if (p.lane !== "tier-2") return <span className="note">Tier-1 Parquet</span>;
  if (p.queryFailed)
    return <span style={{ color: "var(--red)" }}>query failed</span>;
  if (p.rowCount === null) return <span className="note">no data</span>;
  return <span className="mono">{p.rowCount.toLocaleString("en-US")}</span>;
}

function scopeCell(value: SourceScopeValue | undefined) {
  if (!value) return <span className="pill dim">pending</span>;
  const label =
    value.value !== undefined
      ? value.value.toLocaleString("en-US")
      : (value.summary ?? "—");
  const detailParts = [value.source, value.as_of].filter(Boolean);
  const detail = detailParts.length > 0 ? detailParts.join(" · ") : null;
  return (
    <span>
      {value.source_url ? (
        <a href={value.source_url} target="_blank" rel="noreferrer">
          {label}
        </a>
      ) : (
        label
      )}
      {detail && (
        <div className="note" style={{ fontSize: "0.68rem" }}>
          {detail}
        </div>
      )}
    </span>
  );
}

function FamilyCard({ family }: { family: CensusFamily }) {
  return (
    <div className="table-wrap" style={{ marginBottom: "0.75rem" }}>
      <table>
        <thead>
          <tr>
            <th>Pipeline</th>
            <th style={{ width: 90 }}>Guard</th>
            <th style={{ width: 110 }}>Current count</th>
            <th style={{ width: 140 }}>Confirmed total</th>
            <th style={{ width: 160 }}>Source ceiling</th>
            <th style={{ width: 140 }}>Vendor benchmark</th>
          </tr>
        </thead>
        <tbody>
          {family.members.map((m) => (
            <tr key={m.name}>
              <td>
                <div className="name">{m.label}</div>
                <div className="mono note" style={{ fontSize: "0.68rem" }}>
                  {m.spec ?? m.lane}
                </div>
              </td>
              <td>{guardPill(m)}</td>
              <td>{countCell(m)}</td>
              <td>{scopeCell(m.sourceScope?.confirmed_total)}</td>
              <td>{scopeCell(m.sourceScope?.source_ceiling)}</td>
              <td>{scopeCell(m.sourceScope?.vendor_benchmark)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function CensusPage() {
  const census = await buildCensus();
  const { pipelineCount, progress } = census;

  return (
    <main className="wrap">
      <div className="topbar">
        <Image
          src="/logo.png"
          alt="SWFL Data Gulf"
          width={48}
          height={48}
          className="logo"
          priority
        />
        <div className="topbar-text">
          <h1>
            Pipeline Data Census <span className="ops-badge">/ops</span>
          </h1>
          <p className="subtitle mono">
            {pipelineCount.total} pipelines tracked ({pipelineCount.active}{" "}
            active, {pipelineCount.parked} parked) · {progress.confirmedTotal}/
            {progress.total} confirmed-total researched ·{" "}
            {progress.sourceCeiling}/{progress.total} source-ceiling
            researched · {progress.vendorBenchmark}/{progress.total}{" "}
            vendor-benchmark applicable
          </p>
        </div>
        <div className="topbar-stats">
          <div className="top-stat">
            <span className="top-stat-num dim">{pipelineCount.total}</span>
            <span className="top-stat-label">pipelines</span>
          </div>
        </div>
      </div>

      {(!census.available.github || !census.available.supabase) && (
        <div className="banner warn">
          Signal degraded:{" "}
          {!census.available.github && (
            <span>GitHub PAT unset (registry unavailable) </span>
          )}
          {!census.available.supabase && (
            <span>Supabase env unset (counts unknown)</span>
          )}
        </div>
      )}

      {census.categories.map((cat) => (
        <section className="category" key={cat.category}>
          <div className="category-header">
            <span className="cat-title">{cat.category}</span>
            <span
              className="note mono"
              style={{ fontSize: "0.75rem", marginLeft: "auto" }}
            >
              {cat.families.reduce((n, f) => n + f.members.length, 0)}{" "}
              pipelines
            </span>
          </div>
          {cat.families.map((f) => (
            <FamilyCard family={f} key={f.spec ?? f.members[0].name} />
          ))}
        </section>
      ))}

      <footer>
        SWFL Data Gulf · /ops/census · live from Supabase +{" "}
        <code>ingest/cadence_registry.yaml</code>.{" "}
        <Link href="/coverage">coverage</Link> · <Link href="/">dashboard</Link>
      </footer>
    </main>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run build` (from `swfldatagulf-ops`)
Expected: build succeeds, `/census` listed in the route output.

- [ ] **Step 3: Commit**

```bash
git add app/census/page.tsx
git commit -m "feat(census): /census page — every pipeline, grouped, live counts + guard + research cells"
```

---

### Task 9: Nav link + end-to-end manual verification

**Repo:** `swfldatagulf-ops`

**Files:**
- Modify: `app/coverage/page.tsx` (add one nav link)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this is the final wiring + verification task.

- [ ] **Step 1: Add the nav link from `/coverage`**

In `app/coverage/page.tsx`, find the `<nav className="catnav">` block containing `<Link href="/targets" className="catnav-pill catnav-targets">Data Targets ◎</Link>`. Immediately after that line, add:

```tsx
        <Link href="/census" className="catnav-pill catnav-targets">
          Data Census ⊞
        </Link>
```

- [ ] **Step 2: Build and start the app**

Run: `npm run build && npm run start` (from `swfldatagulf-ops`)
Expected: build succeeds; server starts on the configured port with no runtime errors in the console.

- [ ] **Step 3: Manually verify `/census` in a browser**

Open `http://localhost:3000/census` (adjust port if different) and confirm:
- The header shows a total pipeline count and a "N/total confirmed-total researched" progress line (all zero, since no `source_scope` has been populated yet — expected).
- Every one of the 12 categories from `lib/census-supplement.ts` renders with at least one pipeline, and there is no "Uncategorized" section (if one appears, a pipeline exists in the live registry that's missing from `CATEGORY` — add it to `lib/census-supplement.ts` and re-run this step).
- Pipelines that share a table (e.g. `marketbeat_swfl`, `colliers_industrial`, `mhs_databook` — search for the "CRE / Commercial" category) render as multiple rows inside ONE family card, not as three separate cards.
- At least one tier-2 pipeline with real data (e.g. `leepa` in "Real Estate & Property") shows a real row count and a `FRESH` or other real guard pill — not "no data" or "query failed" (a "query failed" here means the Supabase env/grants are misconfigured for that table and needs investigation, not a code bug in this plan).
- Every Confirmed total / Source ceiling / Vendor benchmark cell shows the "pending" dim pill (none should show a real value — none were populated by this plan).
- Click through to `/coverage` and back via the new nav link and the page footer link — both navigate correctly.

- [ ] **Step 4: Commit**

```bash
git add app/coverage/page.tsx
git commit -m "feat(census): link /coverage <-> /census"
```
