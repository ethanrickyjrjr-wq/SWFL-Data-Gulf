# Pipeline Data Census Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 14 tasks, 17 files, 2 conflict groups, keywords: migration, refactor, schema

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
- 🔴 Create: `lib/census-logic.mjs`
- 🔴 Test: `lib/census-logic.test.mjs`

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
- 🟡 Create: `lib/census.ts`

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
- 🟡 Create: `app/census/page.tsx`

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

---

## Addendum (2026-07-07, same day): live source reconciliation

Tasks 10–14 implement the "Source Reconciliation" section added to the design spec after Task 1–9 were already written. This is a real automatic drift check against the source's own current total — corrected, after probing our own ingest code (RULE 0.5), from an initial "crawl4ai + LLM" idea to reusing infra that already exists: `ingest/lib/arcgis_paginator.py:88`'s `arcgis_count()` (a public, unauthenticated ArcGIS `returnCountOnly=true` query) is already called by both `collier_parcels` and `leepa` on every ingest run and asserted via `ingest/lib/guards.py:74`'s `assert_vs_canonical(landed, canonical, floor=0.9)` — the parcels leg needs zero new pipeline and zero LLM calls, just surfacing the same live check on the census page. The listings leg captures a number (`meta.total` from the SteadyAPI response) that `ingest/pipelines/listing_lifecycle/extract_api.py:191` already reads and currently throws away.

### Task 10: `data_lake.source_totals` migration

**Repo:** `brain-platform`

**Files:**
- Create: `migrations/20260707_source_totals.sql`

**Interfaces:**
- Produces: table `data_lake.source_totals(id, pipeline_name, source_label, value, method, fetched_at)`. Task 11 inserts into it; Task 13/14 (ops repo) reads the latest row per `pipeline_name`.

- [ ] **Step 1: Write the migration**

Create `migrations/20260707_source_totals.sql`:

```sql
-- Source-of-truth totals captured from the SAME origin each pipeline ingests
-- from (an ArcGIS returnCountOnly query, a SteadyAPI meta.total, etc.) — read
-- by /ops/census (swfldatagulf-ops) to detect silent ingestion drift.
-- Insert-only ledger; the census page reads the latest row per pipeline_name.
CREATE TABLE IF NOT EXISTS data_lake.source_totals (
  id BIGSERIAL PRIMARY KEY,
  pipeline_name TEXT NOT NULL,        -- matches a `name` in ingest/cadence_registry.yaml
  source_label TEXT NOT NULL,         -- e.g. "SteadyAPI meta.total (Lee+Collier+Hendry city sweep)"
  value BIGINT NOT NULL,
  method TEXT NOT NULL,               -- "arcgis_count" | "api_meta_total"
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS source_totals_pipeline_fetched_idx
  ON data_lake.source_totals (pipeline_name, fetched_at DESC);

GRANT SELECT, INSERT ON data_lake.source_totals TO service_role;
GRANT USAGE, SELECT ON SEQUENCE data_lake.source_totals_id_seq TO service_role;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Run the migration**

Run: `bun scripts/run-migration.ts migrations/20260707_source_totals.sql`
Expected: prints `Running migrations/20260707_source_totals.sql...` then `✓ done` then `Migrations complete.`

- [ ] **Step 3: Verify the table exists with the right grants**

Run: `bun scripts/run-migration.ts` is not a query tool — instead verify via a one-off: create a temp file `/tmp-verify.sql` is not needed; instead run this inline check:
```bash
bun -e "
const { readFileSync } = require('fs');
const secrets = readFileSync('.dlt/secrets.toml', 'utf8');
const t = (k) => secrets.match(new RegExp('^'+k+'\\\\s*=\\\\s*\"([^\"]+)\"','m'))[1];
const conn = \`postgres://\${t('username')}:\${encodeURIComponent(t('password'))}@\${t('host')}:5432/\${t('database')}?sslmode=require\`;
const sql = new Bun.SQL(conn);
const rows = await sql\`SELECT count(*) FROM data_lake.source_totals\`;
console.log(rows);
await sql.end();
"
```
Expected: prints `[ { count: "0" } ]` (table exists, empty) with no error.

- [ ] **Step 4: Commit**

```bash
git add migrations/20260707_source_totals.sql
git commit -m "feat(census): add data_lake.source_totals — ledger for live source-total reconciliation"
```

---

### Task 11: Capture SteadyAPI's `meta.total` in `listing_lifecycle`

**Repo:** `brain-platform`

**Files:**
- Modify: `ingest/pipelines/listing_lifecycle/extract_api.py:167-198` (`fetch_steadyapi_city`), `:255-279` (`scan_county_api`)
- Modify: `ingest/pipelines/listing_lifecycle/distill.py` (add `log_source_total`, next to the other `_get_conn()`-using writers)
- Modify: `ingest/pipelines/listing_lifecycle/pipeline.py:56-176` (`run`)
- Test: `ingest/pipelines/listing_lifecycle/test_extract_api.py` (create if it doesn't already exist as a sibling test file; if a test file for `extract_api.py` already exists, add to it instead of creating a duplicate)

**Interfaces:**
- Consumes: nothing new.
- Produces: `fetch_steadyapi_city(...) -> tuple[list[dict], bool, int, int | None]` (4th element is SteadyAPI's `meta.total` for that city, or `None`); `scan_county_api(...)` result dict gains a `"source_total": int` key (sum of each city's `total`, `0` if every city returned `None`); `distill.log_source_total(value: int, source_label: str, dry_run: bool = False) -> None`.

- [ ] **Step 1: Write the failing test for the return-shape change**

Add to `ingest/pipelines/listing_lifecycle/test_extract_api.py` (create the file with this content if it doesn't exist yet; if it exists, add this test function to it):

```python
from ingest.pipelines.listing_lifecycle.extract_api import fetch_steadyapi_city


def test_fetch_steadyapi_city_returns_four_tuple_with_total(monkeypatch):
    """meta.total must be returned, not discarded — Task 11 wires it into the
    census reconciliation ledger."""
    class FakeResp:
        status_code = 200

        def json(self):
            return {"body": [{"property_id": "1"}], "meta": {"total": 1}}

    monkeypatch.setattr(
        "ingest.pipelines.listing_lifecycle.extract_api.requests.get",
        lambda *a, **k: FakeResp(),
    )
    rows, ok, pages, total = fetch_steadyapi_city("Naples", key="fake-key")
    assert len(rows) == 1
    assert ok is True
    assert pages == 1
    assert total == 1
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ingest && python -m pytest pipelines/listing_lifecycle/test_extract_api.py -k four_tuple -v`
Expected: FAIL — `ValueError: not enough values to unpack (expected 4, got 3)` (the function still returns a 3-tuple).

- [ ] **Step 3: Add `total` to `fetch_steadyapi_city`'s return**

In `ingest/pipelines/listing_lifecycle/extract_api.py`, change the signature and every `return` in `fetch_steadyapi_city` (lines 167-198) from 3-tuples to 4-tuples, carrying `total`:

```python
def fetch_steadyapi_city(city: str, state: str = "FL", key: str | None = None) -> tuple[list[dict], bool, int, int | None]:
    """Enumerate one city via SteadyAPI (location slug 'City-Name_FL', offset += 200 until meta.total).
    Returns (rows, ok, pages_fetched, total) — pages_fetched is the real call count for budget
    logging; total is SteadyAPI's own meta.total claim for this city (None if never seen), captured
    for the /ops/census source-reconciliation ledger (Task 11)."""
    key = key or os.environ.get("PHOTOS_API")
    if not key or not city:
        return [], False, 0, None
    slug = f"{city.strip().replace(' ', '-')}_{state}"
    out: list[dict] = []
    total: int | None = None
    for page in range(_MAX_PAGES):
        params = {"location": slug, "offset": page * _SA_PAGE}
        try:
            r = requests.get(f"{STEADYAPI_BASE}/search", params=params,
                             headers={**STEADYAPI_HEADERS, "Authorization": f"Bearer {key}"}, timeout=30)
            pages = page + 1
            if r.status_code != 200:
                return out, False, pages, total
            data = r.json()
            body = data.get("body") if isinstance(data, dict) else None
            if not isinstance(body, list):
                return out, False, pages, total
            if not body:
                return out, True, pages, total
            out.extend(body)
            total = (data.get("meta") or {}).get("total", total)
            if total is not None and (page + 1) * _SA_PAGE >= total:
                return out, True, pages, total
            if len(body) < _SA_PAGE:
                return out, True, pages, total
        except Exception:
            return out, False, page + 1, total
    return out, False, _MAX_PAGES, total
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd ingest && python -m pytest pipelines/listing_lifecycle/test_extract_api.py -k four_tuple -v`
Expected: PASS.

- [ ] **Step 5: Update `scan_county_api`'s caller and aggregate `source_total`**

In `ingest/pipelines/listing_lifecycle/extract_api.py`, update `scan_county_api` (lines 255-279) — the unpacking on line 266 and the returned dict:

```python
def scan_county_api(county: str, known_ids: set[str] | None = None, *, dry_run: bool = False) -> dict[str, Any]:
    """SteadyAPI-only: enumerate every seed city, parse + scope-filter, batch-enrich new listings.
    Returns the coverage-guard payload pipeline.py consumes: {rows, exhausted, count, last_status,
    county_total, search_calls, enrich_calls, source_total}. County is COMPLETE only if every city's
    pull reached natural exhaustion. source_total sums each city's SteadyAPI meta.total — an
    inexact-but-real completeness signal (per-city search, not a single county query) fed to the
    /ops/census reconciliation ledger. `dry_run=True` still fires the (cheap, ~106-call) search sweep
    — that's the real page count the gate needs — but skips the (expensive, multiplying) enrich
    network calls."""
    cities = SWFL_CITY_SEED.get(county, [])
    sa_rows: list[dict] = []
    all_ok = True
    search_calls = 0
    source_total = 0
    for city in cities:
        sa_raw, sa_ok, pages, city_total = fetch_steadyapi_city(city)
        all_ok = all_ok and sa_ok
        search_calls += pages
        source_total += city_total or 0
        sa_rows.extend(p for p in (parse_steadyapi(x, city, "FL") for x in sa_raw) if p)
    rows = [r for r in sa_rows if r.get("county") == county]
    enrich_stats = enrich_baths_batched(rows, known_ids or set(), dry_run=dry_run)
    return {
        "rows": rows, "exhausted": all_ok, "count": len(rows),
        "last_status": 200 if all_ok else 429, "county_total": len(rows),
        "search_calls": search_calls,
        "source_total": source_total,
        "enrich_calls": enrich_stats["calls"],
        "enrich_new_count": enrich_stats["new_count"],
        "enrich_baths_filled": enrich_stats["baths_filled"],
    }
```

- [ ] **Step 6: Add `distill.log_source_total`**

In `ingest/pipelines/listing_lifecycle/distill.py`, add a new function near the other `_get_conn()`-using writers (after the existing `upsert_state`/`append_transitions` functions):

```python
def log_source_total(value: int, source_label: str, *, dry_run: bool = False) -> None:
    """Insert one row into data_lake.source_totals — the source's own current-total claim, read by
    /ops/census to detect silent ingestion drift (Task 11 of the pipeline-data-census plan)."""
    if dry_run:
        print(f"[dry-run] would log source_total={value} ({source_label})", flush=True)
        return
    with _get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO data_lake.source_totals (pipeline_name, source_label, value, method) "
            "VALUES (%s, %s, %s, %s)",
            ("listing_lifecycle", source_label, value, "api_meta_total"),
        )
        conn.commit()
```

- [ ] **Step 7: Wire it into `run()`**

In `ingest/pipelines/listing_lifecycle/pipeline.py`, make two changes inside `run()`:

First, accumulate `source_total` alongside the existing `totals` dict. Change line 72 from:
```python
    totals = {"scanned": 0, "upserts": 0, "transitions": 0}
```
to:
```python
    totals = {"scanned": 0, "upserts": 0, "transitions": 0, "source_total": 0}
```

Then, inside the `for county in counties:` loop, immediately after line 84 (`budget_calls += result.get("search_calls", 0) + result.get("enrich_calls", 0)`), add:
```python
            totals["source_total"] += result.get("source_total", 0)
```

Finally, immediately before the final `return totals` (line 176), add the log call — only for a real, complete, non-dry-run API sweep across every county (not `--county` single-county debug runs, so the ledger always represents the full in-scope footprint):
```python
    if source == "api" and not dry_run and not only_county and totals["source_total"] > 0:
        distill.log_source_total(
            totals["source_total"],
            "SteadyAPI meta.total sum (Lee+Collier+Hendry city sweep)",
        )
    return totals
```

- [ ] **Step 8: Run the full pipeline test suite for this pipeline**

Run: `cd ingest && python -m pytest pipelines/listing_lifecycle/ -v`
Expected: PASS — all existing tests plus the new one from Step 1.

- [ ] **Step 9: Commit**

```bash
git add ingest/pipelines/listing_lifecycle/extract_api.py ingest/pipelines/listing_lifecycle/distill.py ingest/pipelines/listing_lifecycle/pipeline.py ingest/pipelines/listing_lifecycle/test_extract_api.py
git commit -m "feat(census): capture SteadyAPI meta.total into data_lake.source_totals instead of discarding it"
```

---

### Task 12: Bidirectional drift check (pure, TDD)

**Repo:** `swfldatagulf-ops`

**Files:**
- 🔴 Modify: `lib/census-logic.mjs` (add one function)
- 🔴 Modify: `lib/census-logic.test.mjs` (add its tests)

**Interfaces:**
- Produces: `driftStatus(ours: number, benchmark: number, tolerancePct: number): { withinTolerance: boolean, deltaPct: number, direction: "over" | "under" | "match" }`. Task 14 (`lib/census.ts`) calls this for any pipeline with a reconciliation source configured.

- [ ] **Step 1: Write the failing tests**

Add to `lib/census-logic.test.mjs` (append; keep the existing `import` line, adding `driftStatus` to it):

```javascript
import {
  prettifyLabel,
  countPipelines,
  groupByCategory,
  groupSharedTables,
  researchProgress,
  driftStatus,
  UNCATEGORIZED,
} from "./census-logic.mjs";
```

```javascript
test("driftStatus reports match when within tolerance", () => {
  const result = driftStatus(548798, 548798, 0.1);
  assert.deepEqual(result, { withinTolerance: true, deltaPct: 0, direction: "match" });
});

test("driftStatus reports under when ours is far below the benchmark", () => {
  const result = driftStatus(400000, 548798, 0.1);
  assert.equal(result.withinTolerance, false);
  assert.equal(result.direction, "under");
  assert.ok(result.deltaPct > 0.1);
});

test("driftStatus reports over when ours is far above the benchmark (retired/duplicate rows)", () => {
  const result = driftStatus(700000, 548798, 0.1);
  assert.equal(result.withinTolerance, false);
  assert.equal(result.direction, "over");
});

test("driftStatus treats a benchmark of 0 as inconclusive (never divides by zero)", () => {
  const result = driftStatus(100, 0, 0.1);
  assert.deepEqual(result, { withinTolerance: true, deltaPct: 0, direction: "match" });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test lib/census-logic.test.mjs`
Expected: FAIL — `driftStatus is not a function`.

- [ ] **Step 3: Implement `driftStatus`**

Add to `lib/census-logic.mjs` (after `researchProgress`):

```javascript
/**
 * Bidirectional drift check against a live-fetched source total. Separate
 * from the static expected_rows_min floor (which only catches "too few") —
 * too many can mean retired/duplicate rows just as easily as too few means a
 * dropped page, so both directions matter here.
 */
export function driftStatus(ours, benchmark, tolerancePct) {
  if (!benchmark || benchmark <= 0) {
    return { withinTolerance: true, deltaPct: 0, direction: "match" };
  }
  const deltaPct = Math.abs(ours - benchmark) / benchmark;
  const withinTolerance = deltaPct <= tolerancePct;
  const direction = withinTolerance
    ? "match"
    : ours < benchmark
      ? "under"
      : "over";
  return { withinTolerance, deltaPct, direction };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test lib/census-logic.test.mjs`
Expected: PASS — all 12 tests green (8 from Task 5 + 4 new).

- [ ] **Step 5: Commit**

```bash
git add lib/census-logic.mjs lib/census-logic.test.mjs
git commit -m "feat(census): bidirectional driftStatus check against a live source total"
```

---

### Task 13: Live ArcGIS count + reconciliation pairing config

**Repo:** `swfldatagulf-ops`

**Files:**
- Create: `lib/arcgis.ts`
- Create: `lib/census-reconciliation.ts`

**Interfaces:**
- Produces: `arcgisCount(baseUrl: string, where?: string): Promise<number | null>` (from `lib/arcgis.ts`); `RECONCILIATION: Record<string, ReconciliationSource>` where `ReconciliationSource = { kind: "arcgis", url: string, where?: string, sourceLabel: string, tolerancePct: number } | { kind: "source_totals_table", tolerancePct: number }` (from `lib/census-reconciliation.ts`). Task 14 (`lib/census.ts`) imports both.

The exact ArcGIS URLs below are copied verbatim from the SAME constants our own ingest pipelines already query (`ingest/pipelines/collier_parcels/constants.py:18-24` and `ingest/pipelines/leepa/constants.py:1,15`) — not new endpoints, not guessed.

- [ ] **Step 1: Create `lib/arcgis.ts`**

```typescript
/**
 * Public ArcGIS returnCountOnly probe — no auth, mirrors
 * ingest/lib/arcgis_paginator.py:88 (arcgis_count) exactly, so the census
 * page reads the SAME canonical count our own ingest guards already assert
 * against (ingest/lib/guards.py:74 assert_vs_canonical).
 */
export async function arcgisCount(
  baseUrl: string,
  where = "1=1",
): Promise<number | null> {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("where", where);
    url.searchParams.set("returnCountOnly", "true");
    url.searchParams.set("f", "json");
    const res = await fetch(url.toString(), {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { count?: number };
    return typeof data.count === "number" ? data.count : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Create `lib/census-reconciliation.ts`**

```typescript
/**
 * Pairing config: which registry pipelines get a live source-reconciliation
 * check, and where the current source total comes from. Explicit per
 * pipeline, never inferred — a naive pairing (e.g. active-listing count vs.
 * a county's all-parcels total) would show every pipeline as permanently
 * "off" and make the guard worthless.
 */
export type ReconciliationSource =
  | {
      kind: "arcgis";
      url: string;
      where?: string;
      sourceLabel: string;
      tolerancePct: number;
    }
  | { kind: "source_totals_table"; tolerancePct: number };

export const RECONCILIATION: Record<string, ReconciliationSource> = {
  collier_parcels: {
    kind: "arcgis",
    url: "https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0/query",
    where: "CO_NO=21",
    sourceLabel: "FDOR Statewide Cadastral (live parcel count, CO_NO=21)",
    tolerancePct: 0.1, // matches assert_vs_canonical's 0.9 floor (ingest/lib/guards.py:74)
  },
  leepa: {
    kind: "arcgis",
    url: "https://gissvr.leepa.org/gissvr/rest/services/ParcelInfo/MapServer/12/query",
    sourceLabel: "LeePA Just Value layer (live parcel count)",
    tolerancePct: 0.1,
  },
  listing_lifecycle: {
    kind: "source_totals_table",
    tolerancePct: 0.25, // listing inventory churns day to day; wider than the parcel roll
  },
};
```

- [ ] **Step 3: Verify it type-checks**

Run: `npm run build` (from `swfldatagulf-ops`)
Expected: build succeeds (not imported anywhere yet — full wiring verified in Task 14).

- [ ] **Step 4: Commit**

```bash
git add lib/arcgis.ts lib/census-reconciliation.ts
git commit -m "feat(census): live ArcGIS count adapter + reconciliation pairing config (parcels + listings)"
```

---

### Task 14: Wire reconciliation into the census page

**Repo:** `swfldatagulf-ops`

**Files:**
- 🟡 Modify: `lib/census.ts` (fetch reconciliation values, compute drift, attach to `CensusEntry`)
- 🟡 Modify: `app/census/page.tsx` (render a real value + drift pill instead of "pending" for the 3 configured pipelines)

**Interfaces:**
- Consumes: `arcgisCount` from `./arcgis`; `RECONCILIATION` from `./census-reconciliation`; `driftStatus` from `./census-logic.mjs`.
- Produces: `CensusEntry` gains an optional `reconciliation: { sourceLabel: string; benchmark: number; drift: ReturnType<typeof driftStatus> } | undefined` field.

- [ ] **Step 1: Add `latestSourceTotals` to `lib/supabase.ts`**

`directTableFreshness`/`tableCoverage` don't fit here — neither filters by an arbitrary column value nor returns a per-key latest row, and `data_lake.source_totals` needs "the newest row for THIS pipeline_name," not a table-wide count. Add a dedicated small helper instead. Add to `lib/supabase.ts`, after `rowCounts`:

```typescript
export interface LatestSourceTotal {
  pipeline_name: string;
  value: number;
  source_label: string;
  fetched_at: string;
}

/** Most recent data_lake.source_totals row per pipeline_name (Task 14). */
export async function latestSourceTotals(
  pipelineNames: string[],
): Promise<{ available: boolean; rows: LatestSourceTotal[] }> {
  if (!URL || !KEY || pipelineNames.length === 0)
    return { available: false, rows: [] };
  try {
    const sb = createClient(URL, KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "data_lake" },
    });
    const rows: LatestSourceTotal[] = [];
    for (const name of pipelineNames) {
      const { data } = await sb
        .from("source_totals")
        .select("pipeline_name, value, source_label, fetched_at")
        .eq("pipeline_name", name)
        .order("fetched_at", { ascending: false })
        .limit(1);
      if (data?.[0]) rows.push(data[0] as LatestSourceTotal);
    }
    return { available: true, rows };
  } catch {
    return { available: false, rows: [] };
  }
}
```

- [ ] **Step 2: Extend `CensusEntry` and fetch reconciliation values in `buildCensus`**

In `lib/census.ts`, add two new imports (`arcgisCount`, `RECONCILIATION`), add `latestSourceTotals` to the existing `./supabase` import list, and add `driftStatus` to the existing `./census-logic.mjs` import list:

```typescript
import { arcgisCount } from "./arcgis";
import { RECONCILIATION } from "./census-reconciliation";
```

```typescript
import {
  rowCounts,
  latestDltLoads,
  tier1Freshness,
  directTableFreshness,
  latestSourceTotals,
  supabaseMeta,
} from "./supabase";
```

```typescript
import {
  prettifyLabel,
  countPipelines,
  groupByCategory,
  groupSharedTables,
  researchProgress,
  driftStatus,
  UNCATEGORIZED,
} from "./census-logic.mjs";
```

Add the field to `CensusEntry`:

```typescript
export interface CensusEntry {
  name: string;
  label: string;
  lane: string;
  spec: string | null;
  classified: ClassifiedRow;
  sourceScope: SourceScope | undefined;
  reconciliation:
    | { sourceLabel: string; benchmark: number; drift: ReturnType<typeof driftStatus> }
    | undefined;
}
```

Inside `buildCensus`, before building `censusEntries`, fetch every configured benchmark concurrently:

```typescript
  const reconciliationEntries = Object.entries(RECONCILIATION);
  const arcgisResults = await Promise.all(
    reconciliationEntries.map(async ([name, cfg]) => {
      if (cfg.kind !== "arcgis") return [name, null] as const;
      const count = await arcgisCount(cfg.url, cfg.where);
      return [name, count] as const;
    }),
  );
  const arcgisByName = new Map(arcgisResults);

  const tableTargetNames = reconciliationEntries
    .filter(([, cfg]) => cfg.kind === "source_totals_table")
    .map(([name]) => name);
  const sourceTotals = await latestSourceTotals(tableTargetNames);
  const sourceTotalByName = new Map(
    sourceTotals.rows.map((r) => [r.pipeline_name, r]),
  );
```

Then, inside the `censusEntries` map, after computing `classified` and before the `return`, compute `reconciliation`:

```typescript
    const reconCfg = RECONCILIATION[e.name];
    let reconciliation: CensusEntry["reconciliation"];
    if (reconCfg?.kind === "arcgis") {
      const benchmark = arcgisByName.get(e.name) ?? null;
      if (benchmark !== null && rowCount !== null) {
        reconciliation = {
          sourceLabel: reconCfg.sourceLabel,
          benchmark,
          drift: driftStatus(rowCount, benchmark, reconCfg.tolerancePct),
        };
      }
    } else if (reconCfg?.kind === "source_totals_table") {
      const row = sourceTotalByName.get(e.name);
      if (row && rowCount !== null) {
        reconciliation = {
          sourceLabel: row.source_label,
          benchmark: row.value,
          drift: driftStatus(rowCount, row.value, reconCfg.tolerancePct),
        };
      }
    }

    return {
      name: e.name,
      label: probe.label,
      lane,
      spec,
      classified: classify(probe, currentYear),
      sourceScope: e.source_scope,
      reconciliation,
    };
```

- [ ] **Step 3: Verify it type-checks**

Run: `npm run build` (from `swfldatagulf-ops`)
Expected: build succeeds.

- [ ] **Step 4: Render reconciliation in `app/census/page.tsx`**

In `app/census/page.tsx`, replace the "Vendor benchmark" column's header and cell to show live reconciliation when present, falling back to the existing `pending` scope cell otherwise. Change the `<th>` row in `FamilyCard`:

```tsx
            <th style={{ width: 160 }}>Source reconciliation</th>
```

(replacing the old `<th style={{ width: 140 }}>Vendor benchmark</th>`), and change the corresponding `<td>`:

```tsx
              <td>{reconciliationCell(m)}</td>
```

(replacing `<td>{scopeCell(m.sourceScope?.vendor_benchmark)}</td>`). Add the new render function above `FamilyCard`:

```tsx
function reconciliationCell(entry: CensusEntry) {
  const r = entry.reconciliation;
  if (!r) return <span className="pill dim">pending</span>;
  const cls =
    r.drift.direction === "match"
      ? "green"
      : r.drift.direction === "under"
        ? "red"
        : "yellow";
  return (
    <span>
      <span className={`pill ${cls}`}>
        {r.drift.direction === "match"
          ? "match"
          : `${r.drift.direction} ${(r.drift.deltaPct * 100).toFixed(1)}%`}
      </span>
      <div className="note" style={{ fontSize: "0.68rem", marginTop: 2 }}>
        {r.benchmark.toLocaleString("en-US")} via {r.sourceLabel}
      </div>
    </span>
  );
}
```

- [ ] **Step 5: Verify it type-checks and build**

Run: `npm run build` (from `swfldatagulf-ops`)
Expected: build succeeds, no type errors.

- [ ] **Step 6: Manually verify live reconciliation**

Run: `npm run build && npm run start` (from `swfldatagulf-ops`), open `http://localhost:3000/census`, and confirm:
- `collier_parcels` and `leepa` (in "Real Estate & Property") show a real "Source reconciliation" pill (`match`, or `under X.X%`/`over X.X%`) with a benchmark number and "via FDOR Statewide Cadastral..."/"via LeePA Just Value..." underneath — not "pending".
- `listing_lifecycle` shows "pending" until Task 11's pipeline has run at least once in production and written a row to `data_lake.source_totals` (this is expected on first deploy — the reconciliation only appears after the next scheduled `listing_lifecycle` run).
- Every other pipeline still shows "pending" for source reconciliation, unchanged from Task 9's verification.

- [ ] **Step 7: Commit**

```bash
git add lib/supabase.ts lib/census.ts app/census/page.tsx
git commit -m "feat(census): wire live parcel/listing reconciliation into /census"
```

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 5, Task 12 | `lib/census-logic.mjs`, `lib/census-logic.test.mjs` |
| 🟡 | Task 7, Task 8, Task 14 | `lib/census.ts`, `app/census/page.tsx` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
