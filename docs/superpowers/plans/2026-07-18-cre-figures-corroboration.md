# CRE Figures Layer + Corroboration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 7 tasks, 10 files, keywords: migration, schema, architecture

**Goal:** Build a unified, monitorable CRE figures layer — every real CRE figure we own at submarket × sector × quarter × metric × firm grain, each carrying its source firm + URL + verified flag + as-of + a cross-source corroboration confidence tier — materialized to a queryable `data_lake.cre_figures` table and rendered on a read-only ops coverage page.

**Architecture:** Deterministic logic in TypeScript (`refinery/lib/derived/`), unit-tested; the result is materialized to two Supabase tables (`data_lake.cre_figures` per-firm, `data_lake.cre_figures_confidence` tiered) by a build script; the ops repo renders a coverage grid from those tables. The CRE brain consuming this layer is a **separate follow-up spec** — not in scope here.

**Tech Stack:** TypeScript (`.mts`, Bun test runner), Supabase PostgREST + Postgres (`data_lake` schema), Next.js (ops repo, separate).

## Global Constraints

- **No-invention boundary (hard reject):** a figure with `source_url == null` is NEVER emitted into `cre_figures`. This is the only hard block. (spec: Provenance & rules)
- **Trust bar = has `source_url`, NOT `verified===true`** — `verified` is an editorial spot-check; do not gate the figures layer on it. (spec: Resolutions §Decision 1, 07/18)
- **Firm identity = `source_name`** (`cw_marketbeat | mhs_databook | colliers_industrial | lee_associates`), NEVER `_source_model` (the LLM extractor). Corroboration keys on `source_name`. (spec: Resolutions finding 1)
- **Core scope = Lee + Collier ONLY.** A submarket outside those two counties (Charlotte County / Sarasota / Glades / Hendry) is dropped from the figures layer entirely — `canonicalSubmarket` returns `null` for it, so it never reaches `cre_figures`. Same scope root as `isCoreScope`/`isCoreCounty` (`refinery/lib/core-scope.mts`; `CORE_SCOPE_COUNTY_FIPS = {12071, 12021}`). The Colliers feed carries a `Charlotte County` submarket — it must NOT surface. No test, fixture, or canonical-set entry may reference an out-of-core place.
- **Zero cross-sector blending:** every aggregate partitions by sector first; a metric is NEVER averaged across two sectors. (spec: Reporting grain)
- **As-of dates render MM/DD/YYYY** in any rendered prose; the raw `quarter`/ISO stays internal. (global FOCUS rule 2)
- **Never framed as "ZIP-level":** grain is submarket × sector. (global FOCUS rule 3)
- **Standard tolerance (operator-approved 07/17):** vacancy within 2.0 percentage points; asking rent within 15% relative; absorption within 25% relative; cap rate / sale psf within 15% relative (provisional). Tolerances live in ONE config object. (spec §3)
- **Sectors surfaced:** industrial, flex, office, retail, medical_office, multifamily — never blended. (spec §4; live firms: Colliers = industrial+flex, Lee = industrial/retail/office/multifamily, C&W/MHS = retail/industrial/office/medical_office)
- **Migrations run directly** against Supabase, idempotent, verify row count after. Creds in `.dlt/secrets.toml`. (project RULE 1)

---

## File map

**Create:**
- `refinery/lib/cre-submarket-crosswalk.mts` — firm submarket vocab → canonical submarket. Extends the knowledge in `marketbeat-submarket-aliases.mts`.
- `refinery/lib/cre-submarket-crosswalk.test.mts`
- `refinery/lib/derived/cre-figures.mts` — the normalizer: source tables → `CreFigureRow[]`, source_url-gated.
- `refinery/lib/derived/cre-figures.test.mts`
- `refinery/lib/derived/cre-corroboration.mts` — deterministic tiering + Standard tolerance config.
- `refinery/lib/derived/cre-corroboration.test.mts`
- `migrations/20260718_cre_figures.sql` — the two tables + indexes.
- `scripts/build-cre-figures.mjs` — reads source tables, runs normalizer + corroboration, upserts both tables. Also `--dry-run`.
- `migrations/20260719_colliers_source_url_backfill.sql` — Task 6, **operator sign-off gated**.

**Modify:**
- `refinery/lib/marketbeat-submarket-aliases.mts` — add the canonical-set export the crosswalk consumes (no behavior change to existing exports).
- `ingest/cadence_registry.yaml` — register `cre_figures` build cadence + `source_scope` block (renders on `/ops/census`).

**Separate repo (swfldatagulf-ops):**
- Ops coverage page reading `data_lake.cre_figures` + `cre_figures_confidence`. Task 7 — data contract defined here, page built there.

---

### Task 1: Canonical submarket crosswalk

Maps each firm's free-text `submarket` to a canonical SWFL submarket so corroboration compares like-for-like. An unmapped firm submarket stays `null` (emitted single-source, never force-fit). Extends `MARKETBEAT_SUBMARKET_MAP` knowledge rather than rebuilding (finding 2).

**Files:**
- Create: `refinery/lib/cre-submarket-crosswalk.mts`
- Test: `refinery/lib/cre-submarket-crosswalk.test.mts`

**Interfaces:**
- Consumes: `MARKETBEAT_SUBMARKET_MAP` keys from `refinery/lib/marketbeat-submarket-aliases.mts` (the canonical vocabulary already lives there).
- Produces:
  - `type CanonicalSubmarket = string`
  - `canonicalSubmarket(firm: string, submarket: string): CanonicalSubmarket | null`
  - `CANONICAL_SUBMARKETS: readonly string[]` (the closed canonical set)

- [ ] **Step 1: Write the failing test**

```ts
// refinery/lib/cre-submarket-crosswalk.test.mts
import { test } from "bun:test";
import assert from "node:assert/strict";
import { canonicalSubmarket, CANONICAL_SUBMARKETS } from "./cre-submarket-crosswalk.mts";

test("exact-match firm submarket resolves to itself", () => {
  assert.equal(canonicalSubmarket("cw_marketbeat", "Fort Myers"), "Fort Myers");
});

test("Colliers broad alias resolves to a canonical name", () => {
  // Colliers 'Bonita/Estero' collapses onto a canonical submarket for comparison.
  assert.equal(canonicalSubmarket("colliers_industrial", "Bonita/Estero"), "Bonita/Estero");
  assert.equal(canonicalSubmarket("colliers_industrial", "Cape Coral/N. Fort Myers"), "Cape Coral/N. Fort Myers");
});

test("Lee 'Fort Myers' resolves (Lee reports one submarket)", () => {
  assert.equal(canonicalSubmarket("lee_associates", "Fort Myers"), "Fort Myers");
});

test("an unmapped firm submarket returns null, never a guess", () => {
  assert.equal(canonicalSubmarket("colliers_industrial", "Atlantis"), null);
});

test("OUT-OF-SCOPE: Charlotte County resolves to null — never enters the layer", () => {
  // Colliers ships a 'Charlotte County' submarket; Charlotte (FIPS 12015) is NOT
  // core scope (Lee + Collier only), so it must be dropped at the crosswalk.
  assert.equal(canonicalSubmarket("colliers_industrial", "Charlotte County"), null);
  assert.ok(!CANONICAL_SUBMARKETS.includes("Charlotte County"));
});

test("every canonical submarket resolves to a CORE county (Lee/Collier)", async () => {
  const { isCoreCounty } = await import("./core-scope.mts");
  const { countyForSubmarket } = await import("./cre-submarket-crosswalk.mts");
  for (const c of CANONICAL_SUBMARKETS) {
    assert.ok(isCoreCounty(countyForSubmarket(c)), `canonical '${c}' is not in Lee/Collier`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test refinery/lib/cre-submarket-crosswalk.test.mts`
Expected: FAIL — module `./cre-submarket-crosswalk.mts` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// refinery/lib/cre-submarket-crosswalk.mts
import { MARKETBEAT_SUBMARKET_MAP, SUBMARKET_METADATA } from "./marketbeat-submarket-aliases.mts";
import { isCoreCounty, CORE_SCOPE_COUNTY_FIPS } from "./core-scope.mts";
import { resolvePlace, parentOf } from "./places-swfl.mts";

export type CanonicalSubmarket = string;

/** County name for a submarket, for the core-scope gate. County-grain entries
 *  carry their FIPS in SUBMARKET_METADATA; city/area entries resolve via
 *  places-swfl (parent = county). Returns "" if unresolved (→ treated non-core). */
export function countyForSubmarket(submarket: string): string {
  const meta = SUBMARKET_METADATA[submarket];
  if (meta?.geographic_type === "county") {
    // Charlotte County (12015) is a key but NOT core → its name won't pass isCoreCounty.
    return submarket; // e.g. "Charlotte County" | "Lee County" | "Collier County"
  }
  const place = resolvePlace(submarket);
  const parent = place ? parentOf(place.display ?? submarket) : parentOf(submarket);
  return parent?.display ?? "";
}

/** Canonical set = MARKETBEAT_SUBMARKET_MAP keys, FILTERED to core scope
 *  (Lee + Collier). Charlotte County (FIPS 12015) and any future out-of-core
 *  entry are excluded here — the single scope authority for the figures layer.
 *  Finding 2: extend the existing map, don't rebuild. */
export const CANONICAL_SUBMARKETS: readonly string[] = Object.keys(MARKETBEAT_SUBMARKET_MAP).filter(
  (s) => isCoreCounty(countyForSubmarket(s)),
);
const CANONICAL_SET = new Set(CANONICAL_SUBMARKETS);

/**
 * Per-firm submarket vocabulary → canonical. Only NON-identity mappings live
 * here; an exact match against the CORE-SCOPED canonical set resolves to itself.
 * A firm submarket with no mapping, no exact match, OR out of core scope returns
 * null (dropped — single-source is never force-fit, out-of-scope is never surfaced).
 */
const FIRM_ALIASES: Record<string, Record<string, CanonicalSubmarket>> = {
  colliers_industrial: {}, lee_associates: {}, cw_marketbeat: {}, mhs_databook: {},
};

export function canonicalSubmarket(firm: string, submarket: string): CanonicalSubmarket | null {
  const alias = FIRM_ALIASES[firm]?.[submarket];
  if (alias) return CANONICAL_SET.has(alias) ? alias : null;
  if (CANONICAL_SET.has(submarket)) return submarket; // exact match, core scope only
  return null; // unmapped OR out-of-core (e.g. Charlotte County)
}
```

> **`CORE_SCOPE_COUNTY_FIPS` is imported** so a reviewer can see the gate is the same `{12071, 12021}` root as every other scoped surface; `isCoreCounty` is what the code calls. Verify `places-swfl.mts` exports `resolvePlace`/`parentOf` with these signatures (it does — `cre-swfl.mts` imports them); if `parentOf` needs the raw label rather than the display, adjust `countyForSubmarket` accordingly and keep the "every canonical resolves to Lee/Collier" guard test green.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test refinery/lib/cre-submarket-crosswalk.test.mts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add refinery/lib/cre-submarket-crosswalk.mts refinery/lib/cre-submarket-crosswalk.test.mts
git commit -m "feat(cre-figures): canonical submarket crosswalk (source-aware, extends MARKETBEAT_SUBMARKET_MAP)"
```

---

### Task 2: `cre_figures` + `cre_figures_confidence` tables

Two tables: the per-firm normalized layer, and the tiered confidence layer the ops page + brain read.

**Files:**
- Create: `migrations/20260718_cre_figures.sql`

**Interfaces:**
- Produces: `data_lake.cre_figures` (per canonical_submarket × sector × quarter × metric × source_firm) and `data_lake.cre_figures_confidence` (per canonical_submarket × sector × quarter × metric, with tier).

- [ ] **Step 1: Write the migration (idempotent)**

```sql
-- migrations/20260718_cre_figures.sql
create schema if not exists data_lake;

-- Per-firm normalized figures. NO row without a source_url (no-invention gate
-- enforced by the build step; the NOT NULL here is the belt-and-braces DB guard).
create table if not exists data_lake.cre_figures (
  canonical_submarket text not null,
  sector              text not null,
  quarter             text not null,          -- 'YYYY-Qn'
  metric              text not null,           -- vacancy_rate | asking_rent_nnn | absorption_sqft | cap_rate | sale_price_psf | asking_price_psf
  value               double precision not null,
  units               text not null,
  source_firm         text not null,           -- source_name, never _source_model
  source_url          text not null,           -- HARD: never null
  source_verified     boolean not null default false,
  as_of               date,                    -- data period (quarter end)
  built_at            timestamptz not null default now(),
  primary key (canonical_submarket, sector, quarter, metric, source_firm)
);

-- Tiered confidence layer: one row per cell, corroboration applied.
create table if not exists data_lake.cre_figures_confidence (
  canonical_submarket text not null,
  sector              text not null,
  quarter             text not null,
  metric              text not null,
  tier                text not null,           -- corroborated | flagged | single_source
  reported_value      double precision not null,
  units               text not null,
  contributing_firms  text[] not null,         -- source_name[]
  spread              double precision,         -- null for single_source
  reported_firm       text not null,           -- which firm's value is reported (verified/most-recent)
  built_at            timestamptz not null default now(),
  primary key (canonical_submarket, sector, quarter, metric)
);

create index if not exists cre_figures_grain_idx
  on data_lake.cre_figures (sector, quarter, metric);
create index if not exists cre_figures_conf_grain_idx
  on data_lake.cre_figures_confidence (sector, quarter, tier);
```

- [ ] **Step 2: Run the migration directly + verify**

Run (creds in `.dlt/secrets.toml`; follow the project's migration-runner convention — see `docs/reference` for `run-migrations-via-bun-sql`):
```bash
# apply, then verify both tables exist and are empty
```
Expected: both tables present, `select count(*)` returns 0 (populated by Task 5).

- [ ] **Step 3: Commit**

```bash
git add migrations/20260718_cre_figures.sql
git commit -m "feat(cre-figures): cre_figures + cre_figures_confidence tables"
```

---

### Task 3: The normalizer (`cre-figures.mts`)

Reads the three numeric source shapes, maps each row through the crosswalk, **drops any row with a null `source_url`**, and emits `CreFigureRow[]`. This is where the no-invention boundary lives.

**Files:**
- Create: `refinery/lib/derived/cre-figures.mts`
- Test: `refinery/lib/derived/cre-figures.test.mts`

**Interfaces:**
- Consumes: `canonicalSubmarket` (Task 1). Raw row shapes: `MarketbeatRow` (`source_name, sector, submarket, quarter, vacancy_rate, asking_rent_nnn, absorption_sqft, cap_rate, sale_price_psf, source_url, verified`), corridor rows, active-listing rows.
- Produces:
  - `interface CreFigureRow { canonical_submarket: string; sector: string; quarter: string; metric: string; value: number; units: string; source_firm: string; source_url: string; source_verified: boolean; as_of: string | null }`
  - `normalizeMarketbeat(rows: MarketbeatRow[]): CreFigureRow[]`

- [ ] **Step 1: Write the failing test**

```ts
// refinery/lib/derived/cre-figures.test.mts
import { test } from "bun:test";
import assert from "node:assert/strict";
import { normalizeMarketbeat } from "./cre-figures.mts";

const lee = {
  source_name: "lee_associates", sector: "industrial", submarket: "Fort Myers",
  quarter: "2026-Q1", vacancy_rate: 9.01, asking_rent_nnn: 12.2, absorption_sqft: null,
  cap_rate: 8.36, sale_price_psf: 146, source_url: "https://www.lee-associates.com/x.pdf", verified: false,
};
const colliers = {
  source_name: "colliers_industrial", sector: "industrial", submarket: "Fort Myers",
  quarter: "2025-Q4", vacancy_rate: 11.8, asking_rent_nnn: 12, absorption_sqft: -152663,
  cap_rate: null, sale_price_psf: null, source_url: null, verified: false,
};

test("no-invention: a row with null source_url emits NOTHING", () => {
  const out = normalizeMarketbeat([colliers]);
  assert.equal(out.length, 0, "unsourced Colliers row must be dropped entirely");
});

test("Lee row (sourced) emits one CreFigureRow per populated metric, tagged by source_name", () => {
  const out = normalizeMarketbeat([lee]);
  const metrics = out.map((r) => r.metric).sort();
  // vacancy_rate, asking_rent_nnn, cap_rate, sale_price_psf — absorption is null so no row
  assert.deepEqual(metrics, ["asking_rent_nnn", "cap_rate", "sale_price_psf", "vacancy_rate"]);
  assert.ok(out.every((r) => r.source_firm === "lee_associates"));
  assert.ok(out.every((r) => r.source_url === "https://www.lee-associates.com/x.pdf"));
  const cap = out.find((r) => r.metric === "cap_rate");
  assert.equal(cap!.value, 8.36);
  assert.equal(cap!.canonical_submarket, "Fort Myers");
});

test("a firm submarket with no canonical mapping is dropped (never force-fit)", () => {
  const out = normalizeMarketbeat([{ ...lee, submarket: "Atlantis" }]);
  assert.equal(out.length, 0);
});

test("SCOPE: an out-of-core Charlotte County row is dropped even when sourced", () => {
  // Charlotte is not Lee/Collier — the crosswalk returns null, so even a
  // fully-sourced Charlotte figure never enters the layer.
  const charlotte = { ...colliers, submarket: "Charlotte County", vacancy_rate: 16.9, source_url: "https://colliers.com/x" };
  assert.equal(normalizeMarketbeat([charlotte]).length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test refinery/lib/derived/cre-figures.test.mts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// refinery/lib/derived/cre-figures.mts
import { canonicalSubmarket } from "../cre-submarket-crosswalk.mts";

export interface CreFigureRow {
  canonical_submarket: string; sector: string; quarter: string; metric: string;
  value: number; units: string; source_firm: string; source_url: string;
  source_verified: boolean; as_of: string | null;
}

export interface MarketbeatRow {
  source_name: string; sector: string; submarket: string; quarter: string;
  vacancy_rate: number | null; asking_rent_nnn: number | null; absorption_sqft: number | null;
  cap_rate: number | null; sale_price_psf: number | null; source_url: string | null; verified: boolean;
}

const METRIC_UNITS: Record<string, string> = {
  vacancy_rate: "percent", asking_rent_nnn: "USD/sqft", absorption_sqft: "sqft",
  cap_rate: "percent", sale_price_psf: "USD/sqft",
};

/** quarter 'YYYY-Qn' → the quarter-end ISO date (as_of). */
function quarterEnd(q: string): string | null {
  const m = q.match(/^(\d{4})-Q([1-4])$/);
  if (!m) return null;
  const ends = { "1": "03-31", "2": "06-30", "3": "09-30", "4": "12-31" } as const;
  return `${m[1]}-${ends[m[2] as "1" | "2" | "3" | "4"]}`;
}

export function normalizeMarketbeat(rows: MarketbeatRow[]): CreFigureRow[] {
  const out: CreFigureRow[] = [];
  for (const r of rows) {
    if (r.source_url == null) continue;                 // NO-INVENTION GATE
    const canon = canonicalSubmarket(r.source_name, r.submarket);
    if (canon == null) continue;                        // unmapped → never force-fit
    const metrics: [string, number | null][] = [
      ["vacancy_rate", r.vacancy_rate], ["asking_rent_nnn", r.asking_rent_nnn],
      ["absorption_sqft", r.absorption_sqft], ["cap_rate", r.cap_rate], ["sale_price_psf", r.sale_price_psf],
    ];
    for (const [metric, value] of metrics) {
      if (value == null) continue;
      out.push({
        canonical_submarket: canon, sector: r.sector, quarter: r.quarter, metric,
        value, units: METRIC_UNITS[metric], source_firm: r.source_name, source_url: r.source_url,
        source_verified: r.verified, as_of: quarterEnd(r.quarter),
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test refinery/lib/derived/cre-figures.test.mts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add refinery/lib/derived/cre-figures.mts refinery/lib/derived/cre-figures.test.mts
git commit -m "feat(cre-figures): marketbeat normalizer with source_url no-invention gate"
```

> **Follow-on within this task (finding 4):** add `normalizeActiveListings(rows)` emitting `metric = "asking_price_psf"` at submarket grain via a corridor→submarket hop (`submarketFor` from `marketbeat-submarket-aliases.mts`), listing count disclosed in a `note`. Add its own test (a listing with a source_url aggregates to submarket median; one without is dropped) before implementing.

---

### Task 4: Corroboration engine (`cre-corroboration.mts`)

For each `canonical_submarket × sector × quarter × metric`, collect all firm values (keyed on `source_firm`) and assign a tier under Standard tolerance.

**Files:**
- Create: `refinery/lib/derived/cre-corroboration.mts`
- Test: `refinery/lib/derived/cre-corroboration.test.mts`

**Interfaces:**
- Consumes: `CreFigureRow[]` (Task 3).
- Produces:
  - `interface ConfidenceRow { canonical_submarket; sector; quarter; metric; tier: "corroborated"|"flagged"|"single_source"; reported_value: number; units: string; contributing_firms: string[]; spread: number | null; reported_firm: string }`
  - `corroborate(rows: CreFigureRow[]): ConfidenceRow[]`
  - `TOLERANCE` config object.

- [ ] **Step 1: Write the failing test**

```ts
// refinery/lib/derived/cre-corroboration.test.mts
import { test } from "bun:test";
import assert from "node:assert/strict";
import { corroborate } from "./cre-corroboration.mts";
import type { CreFigureRow } from "./cre-figures.mts";

const base = { sector: "industrial", quarter: "2026-Q1", metric: "vacancy_rate", units: "percent",
  source_url: "u", source_verified: false, as_of: null, canonical_submarket: "North Fort Myers" };

test("two firms within tolerance → corroborated, value = median of agreeing firms", () => {
  const rows: CreFigureRow[] = [
    { ...base, value: 2.8, source_firm: "cw_marketbeat" },
    { ...base, value: 3.4, source_firm: "mhs_databook" }, // spread 0.6 < 2.0 pts
  ];
  const [c] = corroborate(rows);
  assert.equal(c.tier, "corroborated");
  assert.equal(c.reported_value, 3.1);
  assert.deepEqual(c.contributing_firms.sort(), ["cw_marketbeat", "mhs_databook"]);
});

test("two firms over tolerance → flagged, never averaged (7-pt gap, in-scope cell)", () => {
  // Synthetic tolerance fixture on an IN-SCOPE submarket (Fort Myers = Lee). A
  // 7.0-pt vacancy spread exceeds the 2.0-pt limit → flagged, both firms kept.
  const rows: CreFigureRow[] = [
    { ...base, canonical_submarket: "Fort Myers", value: 2.4, source_firm: "cw_marketbeat" },
    { ...base, canonical_submarket: "Fort Myers", value: 9.4, source_firm: "mhs_databook", source_verified: true },
  ];
  const [c] = corroborate(rows);
  assert.equal(c.tier, "flagged");
  assert.equal(c.spread, 7);
  assert.equal(c.reported_firm, "mhs_databook"); // prefer verified/most-recent
});

test("one firm → single_source, spread null", () => {
  const [c] = corroborate([{ ...base, value: 9.01, source_firm: "lee_associates" }]);
  assert.equal(c.tier, "single_source");
  assert.equal(c.spread, null);
  assert.deepEqual(c.contributing_firms, ["lee_associates"]);
});

test("tolerance boundary: exactly 2.0 pts is corroborated (inclusive)", () => {
  const rows: CreFigureRow[] = [
    { ...base, value: 3.0, source_firm: "cw_marketbeat" },
    { ...base, value: 5.0, source_firm: "colliers_industrial" },
  ];
  assert.equal(corroborate(rows)[0].tier, "corroborated");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test refinery/lib/derived/cre-corroboration.test.mts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// refinery/lib/derived/cre-corroboration.mts
import type { CreFigureRow } from "./cre-figures.mts";

export interface ConfidenceRow {
  canonical_submarket: string; sector: string; quarter: string; metric: string;
  tier: "corroborated" | "flagged" | "single_source"; reported_value: number; units: string;
  contributing_firms: string[]; spread: number | null; reported_firm: string;
}

/** Standard tolerance (operator-approved 07/17). One object, tunable without
 *  touching engine logic. abs = absolute (percentage points); rel = relative fraction. */
export const TOLERANCE: Record<string, { kind: "abs" | "rel"; limit: number }> = {
  vacancy_rate: { kind: "abs", limit: 2.0 },
  asking_rent_nnn: { kind: "rel", limit: 0.15 },
  absorption_sqft: { kind: "rel", limit: 0.25 },
  cap_rate: { kind: "rel", limit: 0.15 },
  sale_price_psf: { kind: "rel", limit: 0.15 },
  asking_price_psf: { kind: "rel", limit: 0.15 },
};

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Within tolerance? Compares the max-min spread against the metric's limit. */
function agrees(metric: string, values: number[]): { ok: boolean; spread: number } {
  const spread = Math.max(...values) - Math.min(...values);
  const t = TOLERANCE[metric] ?? { kind: "rel", limit: 0.15 };
  if (t.kind === "abs") return { ok: spread <= t.limit, spread };
  const denom = Math.abs(median(values)) || 1;
  return { ok: spread / denom <= t.limit, spread };
}

export function corroborate(rows: CreFigureRow[]): ConfidenceRow[] {
  const cells = new Map<string, CreFigureRow[]>();
  for (const r of rows) {
    const key = `${r.canonical_submarket}|${r.sector}|${r.quarter}|${r.metric}`;
    (cells.get(key) ?? cells.set(key, []).get(key)!).push(r);
  }
  const out: ConfidenceRow[] = [];
  for (const group of cells.values()) {
    // Dedupe to one value per FIRM (a firm reporting twice is not corroboration).
    const byFirm = new Map<string, CreFigureRow>();
    for (const r of group) byFirm.set(r.source_firm, r);
    const firms = [...byFirm.values()];
    const first = firms[0];
    const common = {
      canonical_submarket: first.canonical_submarket, sector: first.sector,
      quarter: first.quarter, metric: first.metric, units: first.units,
      contributing_firms: firms.map((f) => f.source_firm),
    };
    if (firms.length === 1) {
      out.push({ ...common, tier: "single_source", reported_value: first.value, spread: null, reported_firm: first.source_firm });
      continue;
    }
    const values = firms.map((f) => f.value);
    const { ok, spread } = agrees(first.metric, values);
    // reported firm = verified first, else the one used as-is (first). round spread to 2dp.
    const reported = firms.find((f) => f.source_verified) ?? firms[0];
    const roundedSpread = Math.round(spread * 100) / 100;
    if (ok) {
      out.push({ ...common, tier: "corroborated", reported_value: median(values), spread: roundedSpread, reported_firm: reported.source_firm });
    } else {
      out.push({ ...common, tier: "flagged", reported_value: reported.value, spread: roundedSpread, reported_firm: reported.source_firm });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test refinery/lib/derived/cre-corroboration.test.mts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add refinery/lib/derived/cre-corroboration.mts refinery/lib/derived/cre-corroboration.test.mts
git commit -m "feat(cre-figures): corroboration engine + Standard tolerance (keyed on source_name)"
```

---

### Task 5: Build + materialize step (`scripts/build-cre-figures.mjs`)

Reads the source tables, runs Task 3 + Task 4, upserts both tables. Idempotent (primary-key upsert). Supports `--dry-run` (prints counts, writes nothing).

**Files:**
- Create: `scripts/build-cre-figures.mjs`
- Modify: `ingest/cadence_registry.yaml` (register the build cadence + `source_scope`)

**Interfaces:**
- Consumes: `normalizeMarketbeat` / `normalizeActiveListings` (Task 3), `corroborate` (Task 4). Reads `data_lake.marketbeat_swfl` (ALL firms — no `verified` filter), `public.corridor_profiles`, `data_lake.active_listings_cre` via the existing Supabase client (`refinery/sources/supabase.mts` `getSupabase()`).
- Produces: populated `data_lake.cre_figures` + `cre_figures_confidence`.

- [ ] **Step 1: Write the failing test (pure core extracted)**

Extract the pure pipeline into a testable function `buildFigures(marketbeatRows, listingRows)` returning `{ figures, confidence }`, and test it with fixtures (a Lee row + an unsourced Colliers row → figures contains Lee only; confidence tiers correct). Run: `bun test scripts/build-cre-figures.test.mjs` → FAIL.

- [ ] **Step 2: Implement `buildFigures` + the IO wrapper**

The IO wrapper: `getSupabase().schema("data_lake").from("marketbeat_swfl").select("source_name, sector, submarket, quarter, vacancy_rate, asking_rent_nnn, absorption_sqft, cap_rate, sale_price_psf, source_url, verified")` (NO `.eq("verified", true)` — the whole point), map to `MarketbeatRow[]`, run `buildFigures`, then `upsert` both tables on their primary keys. `--dry-run` skips the upserts and prints `figures=N confidence=M` plus a per-firm/per-tier breakdown. Reuse `selectAllPaged` for the reads (reference `postgrest-db-max-rows-truncation`).

- [ ] **Step 3: Run the pure test → PASS; run `--dry-run` against live and eyeball counts**

Run: `bun test scripts/build-cre-figures.test.mjs` (PASS), then `node scripts/build-cre-figures.mjs --dry-run`.
Expected dry-run: Lee 20 rows → figures present with cap_rate; Colliers 132 → **0 figures** (unsourced, correctly dropped); C&W/MHS sourced rows present. Confirms the trust bar behaves before any write.

- [ ] **Step 4: Register cadence + run for real + verify row counts**

Add a `cre_figures` entry to `ingest/cadence_registry.yaml` with a `source_scope` block (`confirmed_total` = firms/metrics pulled, `source_ceiling` = Colliers-unsourced awaiting backfill, cited source_url + as_of) so `/ops/census` renders it. Run the build; `select count(*)` on both tables > 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-cre-figures.mjs scripts/build-cre-figures.test.mjs ingest/cadence_registry.yaml
git commit -m "feat(cre-figures): build+materialize step (dry-run), cadence + source_scope"
```

---

### Task 6: Colliers source-URL backfill — **OPERATOR SIGN-OFF REQUIRED**

Colliers rows are real but carry no `source_url`, so Task 5 correctly drops all 132. This task backfills the provenance so they enter the layer. **Do not run without explicit operator go** — it writes real provenance and defines a per-quarter source claim.

**Files:**
- Create: `migrations/20260719_colliers_source_url_backfill.sql`

**Approach:**
- Colliers publishes each quarter at `https://www.colliers.com/en/research/ft-myers/southwest-florida-industrial-market-report-<yyyy>-q<n>` (verified live for 2025-Q4, 2025-Q2, 2025-Q1, 2023-Q4, 2022-Q1, 2021-Q3). Confirm each of the 11 quarters we hold (2022-Q4 → 2025-Q4) resolves via crawl4ai BEFORE writing the URL (RULE 0.4 — verify each URL, do not template blind). Older quarters may use a different slug (`swfl-industrial-<yyyy>-q<n>`) — resolve, don't guess.
- The migration is an idempotent `update data_lake.marketbeat_swfl set source_url = <resolved> where source_name='colliers_industrial' and quarter=<q> and source_url is null`, one statement per confirmed quarter. Any quarter whose report URL cannot be confirmed live is **left null** (stays correctly rejected — never invent a URL).

- [ ] **Step 1:** Resolve + record each quarter's real Colliers report URL (crawl4ai each; note any that 404).
- [ ] **Step 2:** Write the per-quarter `update` migration (only confirmed URLs).
- [ ] **Step 3:** Run it; verify `count(*) where source_name='colliers_industrial' and source_url is not null` == number of confirmed quarters × submarkets.
- [ ] **Step 4:** Re-run `node scripts/build-cre-figures.mjs --dry-run` — Colliers figures now appear; corroboration cells against C&W industrial light up.
- [ ] **Step 5:** Commit (migration + a SESSION_LOG note).

---

### Task 7: Ops monitoring page (swfldatagulf-ops repo — separate)

Read-only coverage page rendering the two tables. Built in the ops repo per convention (`ops-page-belongs-in-ops-repo`).

**Data contract (this repo owns; ops repo consumes):**
- `data_lake.cre_figures` and `data_lake.cre_figures_confidence` as defined in Task 2.
- Page renders: (1) coverage grid — canonical_submarket × sector, one cell per metric, colored by `tier` (corroborated / single_source) or absence, with a distinct state for "real but source pending" (Colliers pre-backfill, surfaced from `marketbeat_swfl` where `source_url is null`); (2) tier counts; (3) the current `flagged` disagreements list (submarket, metric, the two firm values, spread).

- [ ] **Step 1:** In swfldatagulf-ops, add a route (e.g. `/ops/cre-figures`) that queries the two tables (service-role read).
- [ ] **Step 2:** Render the coverage grid (reuse the ops repo's existing table/grid components; the brief mock in `docs/superpowers/specs/2026-07-17-cre-figures-corroboration-design.md` §5 defines the visual).
- [ ] **Step 3:** Verify live: the page shows Lee cap rates green, Colliers cells amber (source pending) pre-backfill / green post-backfill, and any flagged disagreement.
- [ ] **Step 4:** Commit in the ops repo; note the URL in this repo's SESSION_LOG.

---

## Self-review notes

- **Spec coverage:** §1 crosswalk → Task 1; §2 cre_figures → Tasks 2–3; §3 corroboration → Task 4; §4 reporting grain (per-sector) → enforced in Tasks 3–4 (sector is part of the cell key, never blended); §5 ops surface → Task 7; Provenance/no-invention → Task 3 gate + Task 2 NOT NULL; Resolutions Decision 1 (source_url bar) → Task 3 + Task 6; Decision 2 (queryable table + ops page) → Tasks 2/5/7; findings 1–5 → firm-key (Task 4), crosswalk extend (Task 1), sector isolation (Tasks 3–4), listing hop (Task 3 follow-on), source_name corroboration key (Task 4).
- **Scope isolation:** the core-scope gate lives in exactly one place (the crosswalk, Task 1); Tasks 3–4 inherit it via `canonicalSubmarket → null`. Charlotte County (and any non-Lee/Collier place) can never reach `cre_figures`. Guard test: every canonical submarket resolves to Lee/Collier.
- **Related live defect (separate from this build):** the EXISTING cre-swfl brain + master already publish `charlotte_county_industrial` metrics — a live out-of-scope leak (check `cre_charlotte_county_out_of_scope_live`). Fixing it is a small gate on the per-submarket MarketBeat emission in `cre-swfl.mts` + a rebuild; tracked separately.
- **Open item for the follow-up spec (out of scope here):** the CRE brain re-grain onto `cre_figures` — closes `cre_direction_vote_and_corridor_factor_stamped_weighting` residue and moves the brain's number sourcing onto this layer.
- **Check to close on completion:** `cre_figures_corroboration_live_verify` (served/queryable verification).
