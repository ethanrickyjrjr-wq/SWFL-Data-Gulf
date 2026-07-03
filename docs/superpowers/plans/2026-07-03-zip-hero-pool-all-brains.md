# Widen ZIP Hero Candidate Pool to All Brains — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 7 tasks, 7 files, 2 conflict groups, keywords: migration, refactor, architecture

**Goal:** Widen the ZIP hero's candidate pool from 4 sources (housing, flood, permits, census) to 13 zip-grain packs, competing on **concept** (not column) so overlapping measurements of the same real-world thing never occupy two ranked slots.

**Architecture:** A declarative `ZIP_METRIC_SOURCES` registry (`lib/zip-report/candidates.ts`) replaces the hand-written `HOUSING_METRICS` array, generalized to cover housing's existing 6 concepts plus 15 new ones from 10 additional packs. A generic loop (`buildRegistryCandidates`) walks the registry once per ZIP page render, emitting either a competing `SignalCandidate` or a rail-only `DemotedFigure`. A new generic loader (`lib/zip-report/load-registry-tables.ts`) turns the page's loaded `ParsedBrain`s into the flat `packId:tableId → rows` map the registry loop reads. Flood (dual-source fallback) and permits (Find-it gap-fill) keep their existing special-cased code in `candidates.ts`; census keeps its own `data_lake` loader. Two macro/micro pairs (ZHVI/MLS home value, ZORI/asking-rent) compete as fully independent candidates and additionally carry a shared `footnote` when both are held for a ZIP — an additive field on `SignalCandidate`, not a change to the ranking formula.

**Tech Stack:** Next.js App Router (nodejs runtime), TypeScript, `bun:test`, the existing `refinery/render/speaker.mts` (`loadParsedBrain`, `ParsedBrain`) and `refinery/types/brain-output.mts` (`BrainOutputDetailTable`/`BrainOutputDetailRow`) types.

**Spec:** `docs/superpowers/specs/2026-07-03-zip-hero-pool-all-brains-design.md` · **Check:** `zip_hero_pool_all_brains` (already open — do NOT open a new check, do NOT close this one from this plan; it stays open until built + live-verified by the operator).

## Global Constraints

- **No invented numbers.** Every candidate and demoted figure reads a value already held in a pack's `detail_tables` row; nothing is computed beyond percentile/movement/footnote math on numbers already cited by the source pack.
- **No paid API calls in tests/CI.** This build touches no gap-fill/web-search code at all — purely local pack-data wiring.
- **Dates MM/DD/YYYY**, stated once per surface (unchanged — this build adds no new date displays).
- **No "ZIP-level" framing** in any copy. No system nouns (master/brain-id/§/pack ids) in user-facing text — demoted-figure "also reported by" lines cite plain-English source names (e.g. "realtor.com"), never a pack id.
- **Layout:** `dvh`/`h-full`, never `h-screen` (unchanged existing layout; no new layout primitives needed).
- **Thin pipe:** no pack changes in this build — every pack's existing `detail_tables` output is read as-is, never mutated.
- **Coverage is natural, not special-cased:** a concept with no row for a ZIP simply produces no candidate (and no demoted figure) — same mechanism `permits_90d` already uses. Collier-only concepts (`assessed_value`, `soh_gap`) never appear as fake gaps on Lee ZIPs; they're just absent.
- **Commits:** stage explicit paths only (never `git add -A`). Commit per task. **Do NOT push** — at the end, show `git log` and STOP for operator confirmation (no autonomous push).
- **Verify with `bunx next build`**, not bare `npx tsc`.
- Every registry entry's `packId` matches the pack's own `brain_id` string exactly (verified in-session against each pack file, not guessed): `housing-swfl`, `home-values-swfl`, `rentals-swfl`, `active-rentals-swfl`, `market-heat-swfl`, `market-temperature-swfl`, `listing-momentum-swfl`, `seller-stress-swfl`, `tier-divergence-swfl`, `permits-commercial-swfl`, `properties-collier-value`.

---

### Task 1: `SignalCandidate` gains an optional `footnote` field

**Files:**
- Modify: `lib/zip-report/signal-rank.ts`
- Test: `lib/zip-report/signal-rank.test.ts` (extend)

**Interfaces:**
- Consumes: nothing new.
- Produces: `SignalCandidate.footnote?: string` and `RankedSignal.footnote?: string` (inherited via `extends`) — read by Task 3's pairing logic and Task 6's `SignalCard`.

- [ ] **Step 1: Write the failing test** (append to `lib/zip-report/signal-rank.test.ts`)

```ts
describe("rankSignals — footnote passthrough", () => {
  test("an optional footnote on a candidate survives ranking unchanged, and doesn't affect score", () => {
    const withFootnote = rankSignals([
      cand({ key: "a", percentile: 80, footnote: "tracks within 6% of the index" }),
    ])[0];
    const without = rankSignals([cand({ key: "a", percentile: 80 })])[0];
    expect(withFootnote.footnote).toBe("tracks within 6% of the index");
    expect(withFootnote.score).toBeCloseTo(without.score, 10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/zip-report/signal-rank.test.ts`
Expected: FAIL — TypeScript error, `footnote` does not exist on type `SignalCandidate` (the `cand()` helper's `Partial<SignalCandidate>` override rejects the unknown key).

- [ ] **Step 3: Add the field**

In `lib/zip-report/signal-rank.ts`, add one line to `SignalCandidate` (after the existing `source?` field):

```ts
  source?: { label: string; url: string };
  /**
   * Cross-reference note shown alongside the candidate when a linked macro/micro
   * measurement of a DIFFERENT concept is also held for the same ZIP (e.g. ZHVI vs
   * MLS median). Set by the candidate builder, never by the ranker — purely additive,
   * does not participate in scoring.
   */
  footnote?: string;
```

`RankedSignal extends SignalCandidate` already inherits it with no further change. `rankSignals`'s `{ ...c, score, why }` spread already carries `footnote` through untouched — no logic change needed there.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/zip-report/signal-rank.test.ts`
Expected: PASS (9 tests — the 8 existing + this one).

- [ ] **Step 5: Commit**

```bash
git add lib/zip-report/signal-rank.ts lib/zip-report/signal-rank.test.ts
git commit -m "feat(zip-report): SignalCandidate carries an optional cross-reference footnote"
```

---

### Task 2: `ZIP_METRIC_SOURCES` registry + `buildRegistryCandidates` (standalone, not yet wired)

**Files:**
- 🔴 Modify: `lib/zip-report/candidates.ts` (add new types + registry + function; existing `buildZipCandidates`/`HOUSING_METRICS` untouched until Task 3)
- 🔴 Test: `lib/zip-report/candidates.test.ts` (add a new `describe` block; existing tests untouched until Task 3)

**Interfaces:**
- Consumes: `percentileOf` (already imported).
- Produces (used by Task 3):
  - `interface ZipDetailRow { key: string; cells: Record<string, number | string | boolean | null> }` (this is a rename-in-place of the existing `HousingZipRow` — done in Task 3, NOT here, so this task's diff stays additive-only and the existing housing tests keep passing unmodified in the meantime. This task defines its OWN local row type identical in shape.)
  - `interface RegistryTableData { rows: ZipDetailRow[]; source?: { label: string; url: string } }`
  - `interface DemotedFigure { concept: string; label: string; display: string; sourceLabel: string; sourceUrl: string }`
  - `interface ZipMetricSource { concept: string; packId: string; tableId: string; cell: string; role: "primary" | "demoted"; pairId?: string; key: string; label: string; sub: string; display: (v: number) => string; movementCell?: string; computeMovement?: (row: ZipDetailRow, v: number) => { movementPct: number | null; movementText?: string } }`
  - `ZIP_METRIC_SOURCES: ZipMetricSource[]` (37 entries: 6 housing + 15 new competing + 16 demoted)
  - `buildRegistryCandidates(zip: string, tables: Map<string, RegistryTableData>): { candidates: SignalCandidate[]; railContext: Map<string, DemotedFigure[]> }`

- [ ] **Step 1: Write the failing tests** (append to `lib/zip-report/candidates.test.ts`)

```ts
// --------------------------------------------------------------------------
// buildRegistryCandidates — concept-deduped registry (spec 2026-07-03
// zip-hero-pool-all-brains). Standalone in this task; wired into
// buildZipCandidates in the next task.
// --------------------------------------------------------------------------
import { buildRegistryCandidates, type RegistryTableData } from "./candidates";

function tableMap(entries: Record<string, RegistryTableData>): Map<string, RegistryTableData> {
  return new Map(Object.entries(entries));
}

describe("buildRegistryCandidates — concept dedup", () => {
  test("housing-swfl's median_sale_price competes; a same-concept demoted column from another pack does NOT produce a second candidate", () => {
    const { candidates } = buildRegistryCandidates(
      "33914",
      tableMap({
        "housing-swfl:housing_by_zip": {
          rows: [
            { key: "33914", cells: { median_sale_price: 485_000, median_sale_price_yoy_pct: 18 } },
            { key: "33901", cells: { median_sale_price: 300_000, median_sale_price_yoy_pct: null } },
          ],
          source: { label: "MLS", url: "https://example.com/mls" },
        },
        "active-listings-swfl:active_listings_by_zip": {
          rows: [{ key: "33914", cells: { median_list_price: 499_000 } }],
          source: { label: "realtor.com", url: "https://realtor.com" },
        },
      }),
    );
    expect(candidates.filter((c) => c.key === "median_sale_price")).toHaveLength(1);
    expect(candidates.find((c) => c.key === "median_list_price")).toBeUndefined();
  });

  test("the demoted column lands in railContext under the winning concept, cited with its own source", () => {
    const { railContext } = buildRegistryCandidates(
      "33914",
      tableMap({
        "housing-swfl:housing_by_zip": {
          rows: [{ key: "33914", cells: { median_sale_price: 485_000 } }],
        },
        "active-listings-swfl:active_listings_by_zip": {
          rows: [{ key: "33914", cells: { median_list_price: 499_000 } }],
          source: { label: "realtor.com", url: "https://realtor.com" },
        },
      }),
    );
    const demoted = railContext.get("home_value");
    expect(demoted).toHaveLength(1);
    expect(demoted![0].display).toBe("$499K");
    expect(demoted![0].sourceLabel).toBe("realtor.com");
  });

  test("a Collier-only concept (assessed_value) is absent for a Lee ZIP with no row — not a fake zero", () => {
    const { candidates } = buildRegistryCandidates(
      "33914", // Lee ZIP
      tableMap({
        "properties-collier-value:collier_parcels_by_zip": {
          rows: [{ key: "34102", cells: { median_jv: 900_000 } }], // Naples, Collier
        },
      }),
    );
    expect(candidates.find((c) => c.key === "assessed_value")).toBeUndefined();
  });

  test("a Collier ZIP with a held row DOES get the assessed_value candidate", () => {
    const { candidates } = buildRegistryCandidates(
      "34102",
      tableMap({
        "properties-collier-value:collier_parcels_by_zip": {
          rows: [{ key: "34102", cells: { median_jv: 900_000 } }],
          source: { label: "FDOR cadastral", url: "https://floridarevenue.com" },
        },
      }),
    );
    const av = candidates.find((c) => c.key === "assessed_value")!;
    expect(av.display).toBe("$900K");
    expect(av.covered).toBe(true);
  });

  test("the home-value pair: ZHVI and MLS both compete independently AND both carry a matching footnote when both held", () => {
    const { candidates } = buildRegistryCandidates(
      "33914",
      tableMap({
        "housing-swfl:housing_by_zip": {
          rows: [{ key: "33914", cells: { median_sale_price: 500_000 } }],
        },
        "home-values-swfl:home_values_by_zip": {
          rows: [{ key: "33914", cells: { home_value_zhvi: 530_000 } }],
        },
      }),
    );
    const mls = candidates.find((c) => c.key === "median_sale_price")!;
    const zhvi = candidates.find((c) => c.key === "home_value_zhvi")!;
    expect(mls).toBeDefined();
    expect(zhvi).toBeDefined();
    expect(mls.footnote).toBeDefined();
    expect(zhvi.footnote).toBe(mls.footnote);
    expect(mls.footnote).toContain("6%"); // |500000-530000|/530000 = 5.66% -> rounds to 6
  });

  test("the home-value pair: only ZHVI held (no MLS row) -> ZHVI still competes, with no footnote", () => {
    const { candidates } = buildRegistryCandidates(
      "33914",
      tableMap({
        "home-values-swfl:home_values_by_zip": {
          rows: [{ key: "33914", cells: { home_value_zhvi: 530_000 } }],
        },
      }),
    );
    const zhvi = candidates.find((c) => c.key === "home_value_zhvi")!;
    expect(zhvi).toBeDefined();
    expect(zhvi.footnote).toBeUndefined();
    expect(candidates.find((c) => c.key === "median_sale_price")).toBeUndefined();
  });

  test("the market-sentiment composite: market_heat_score competes, hotness_score from the SAME pack is demoted", () => {
    const { candidates, railContext } = buildRegistryCandidates(
      "33914",
      tableMap({
        "market-heat-swfl:market_heat_by_zip": {
          rows: [{ key: "33914", cells: { market_heat_score: 72.5, hotness_score: 81 } }],
          source: { label: "realtor.com list-side", url: "https://realtor.com" },
        },
      }),
    );
    expect(candidates.find((c) => c.key === "market_heat_score")?.display).toBe("73");
    expect(candidates.find((c) => c.key === "hotness_score")).toBeUndefined();
    expect(railContext.get("market_sentiment")?.[0].display).toBe("81");
  });

  test("a table absent entirely from the map (pack failed to load) -> its concepts just don't compete, never throws", () => {
    expect(() => buildRegistryCandidates("33914", new Map())).not.toThrow();
    const { candidates, railContext } = buildRegistryCandidates("33914", new Map());
    expect(candidates).toEqual([]);
    expect(railContext.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test lib/zip-report/candidates.test.ts`
Expected: FAIL — `buildRegistryCandidates` is not exported from `./candidates` (module has no such export yet).

- [ ] **Step 3: Implement — add to `lib/zip-report/candidates.ts`**

Add these imports at the top (extend the existing `import { percentileOf, ... }` line — do not remove the existing `type SignalCandidate` import):

```ts
import { percentileOf, type SignalCandidate } from "./signal-rank";
```

(unchanged — already present). Then, after the existing `numCell` helper function (do not modify it), add:

```ts
// ---------------------------------------------------------------------------
// Concept-deduped registry (spec 2026-07-03 zip-hero-pool-all-brains). Widens
// the pool from 4 sources to 13 zip-grain packs while keeping "concept" — not
// column — as the unit that competes, so overlapping measurements of the same
// real-world thing (home value, days-on-market, ...) never occupy two ranked
// slots. A pack's headline metric is either the concept's PRIMARY (competes)
// or DEMOTED (cited in the rail under whichever pack won that concept).
// ---------------------------------------------------------------------------

export interface ZipDetailRow {
  key: string;
  cells: Record<string, number | string | boolean | null>;
}

export interface RegistryTableData {
  rows: ZipDetailRow[];
  source?: { label: string; url: string };
}

export interface DemotedFigure {
  concept: string;
  label: string;
  display: string;
  sourceLabel: string;
  sourceUrl: string;
}

export interface ZipMetricSource {
  /** Dedup key — "home_value", "days_on_market", ... Two entries sharing a concept
   * compete for the SAME slot; only one (the `role: "primary"`) wins it. */
  concept: string;
  packId: string;
  tableId: string;
  cell: string;
  role: "primary" | "demoted";
  /** Shared by BOTH sides of an approved macro/micro pair — footnote linkage only,
   * never scoring. The two entries sharing a pairId have DIFFERENT concepts (they
   * both compete independently) but are cross-referenced when both are held. */
  pairId?: string;
  key: string;
  label: string;
  sub: string;
  display: (v: number) => string;
  /** A column already holding a signed YoY %, restated verbatim as the movement text. */
  movementCell?: string;
  /** Escape hatch for movement that isn't a plain YoY-%-column (e.g. DOM's day-delta). */
  computeMovement?: (row: ZipDetailRow, v: number) => { movementPct: number | null; movementText?: string };
}

// Reuses the existing module-private `fmtUsdShort`/`arrow` helpers already defined
// earlier in this file (used today by the flood block) — not redefined here.
const fmtUsdPerMonth = (v: number): string => `${fmtUsdShort(v)}/mo`;
const fmtPct = (v: number): string => `${v}%`;
const fmtCount = (v: number): string => v.toLocaleString("en-US");
const fmtRatio = (v: number): string => `${v.toFixed(2)}x`;
const fmtScore = (v: number): string => v.toFixed(0);
const domMovement = (row: ZipDetailRow, v: number) => {
  const days = row.cells["median_dom_yoy_days"];
  if (typeof days !== "number" || !Number.isFinite(days) || days === 0) return { movementPct: null };
  const prior = v - days;
  const movementPct = prior > 0 ? Math.round((days / prior) * 100) : null;
  return { movementPct, movementText: `${arrow(days)} ${Math.abs(days)} days YoY` };
};
const priceMovement = (row: ZipDetailRow, _v: number) => {
  const yoy = row.cells["median_sale_price_yoy_pct"];
  if (typeof yoy !== "number" || !Number.isFinite(yoy) || yoy === 0) return { movementPct: null };
  return { movementPct: yoy, movementText: `${arrow(yoy)} ${Math.abs(yoy)}% YoY` };
};

export const ZIP_METRIC_SOURCES: ZipMetricSource[] = [
  // ── Housing (housing-swfl, housing_by_zip) — carried over from pool v1 ──
  {
    concept: "home_value",
    packId: "housing-swfl",
    tableId: "housing_by_zip",
    cell: "median_sale_price",
    role: "primary",
    key: "median_sale_price",
    label: "Median Home Value",
    sub: "90-day median sale price",
    display: fmtUsdShort,
    computeMovement: priceMovement,
  },
  {
    concept: "days_on_market",
    packId: "housing-swfl",
    tableId: "housing_by_zip",
    cell: "median_dom",
    role: "primary",
    key: "median_dom",
    label: "Days on Market",
    sub: "90-day median",
    display: (v) => `${v} days`,
    computeMovement: domMovement,
  },
  {
    concept: "sale_to_list_ratio",
    packId: "housing-swfl",
    tableId: "housing_by_zip",
    cell: "avg_sale_to_list_pct",
    role: "primary",
    key: "avg_sale_to_list_pct",
    label: "Sale-to-List Ratio",
    sub: "Average, 90-day window",
    display: fmtPct,
  },
  {
    concept: "months_of_supply",
    packId: "housing-swfl",
    tableId: "housing_by_zip",
    cell: "months_of_supply",
    role: "primary",
    key: "months_of_supply",
    label: "Months of Supply",
    sub: "At the current sales pace",
    display: (v) => `${v} mo`,
  },
  {
    concept: "homes_sold",
    packId: "housing-swfl",
    tableId: "housing_by_zip",
    cell: "homes_sold",
    role: "primary",
    key: "homes_sold",
    label: "Homes Sold",
    sub: "Last 90 days",
    display: fmtCount,
  },
  {
    concept: "active_inventory",
    packId: "housing-swfl",
    tableId: "housing_by_zip",
    cell: "inventory",
    role: "primary",
    key: "inventory",
    label: "Active Inventory",
    sub: "Homes for sale now",
    display: fmtCount,
  },

  // ── Home value macro index — pairId "home_value" with housing-swfl above ──
  {
    concept: "home_value_zhvi",
    packId: "home-values-swfl",
    tableId: "home_values_by_zip",
    cell: "home_value_zhvi",
    role: "primary",
    pairId: "home_value",
    key: "home_value_zhvi",
    label: "Zillow Home Value Index",
    sub: "Monthly index — macro trend",
    display: fmtUsdShort,
    movementCell: "value_yoy_pct",
  },

  // ── Rent pair ──
  {
    concept: "rent_level",
    packId: "rentals-swfl",
    tableId: "rentals_by_zip",
    cell: "rent_index_latest",
    role: "primary",
    pairId: "rent_level",
    key: "rent_index_latest",
    label: "Zillow Rent Index (ZORI)",
    sub: "Monthly index — macro trend",
    display: fmtUsdPerMonth,
    movementCell: "rent_yoy_pct",
  },
  {
    concept: "asking_rent_median",
    packId: "market-temperature-swfl",
    tableId: "market_temperature_by_zip",
    cell: "median_rent_price",
    role: "primary",
    pairId: "rent_level",
    key: "median_rent_price",
    label: "Median Asking Rent",
    sub: "Current realtor.com listing median — micro snapshot",
    display: fmtUsdPerMonth,
  },

  // ── Rental inventory (distinct from the ZORI index and the median above) ──
  {
    concept: "rental_inventory",
    packId: "active-rentals-swfl",
    tableId: "active_rentals_by_zip",
    cell: "rental_listing_count",
    role: "primary",
    key: "rental_listing_count",
    label: "Active Rental Listings",
    sub: "For-rent inventory, live count",
    display: fmtCount,
  },

  // ── Commercial permits (distinct concept from residential permits_90d) ──
  {
    concept: "permits_commercial",
    packId: "permits-commercial-swfl",
    tableId: "commercial_permits_by_zip",
    cell: "count",
    role: "primary",
    key: "commercial_permits",
    label: "Commercial Permits",
    sub: "Issued, current year",
    display: fmtCount,
  },

  // ── Collier-only: assessed value + Save-Our-Homes gap ──
  {
    concept: "assessed_value",
    packId: "properties-collier-value",
    tableId: "collier_parcels_by_zip",
    cell: "median_jv",
    role: "primary",
    key: "assessed_value",
    label: "Tax-Assessed Value",
    sub: "Collier County median just value",
    display: fmtUsdShort,
  },
  {
    concept: "soh_gap",
    packId: "properties-collier-value",
    tableId: "collier_parcels_by_zip",
    cell: "soh_gap_median_pct",
    role: "primary",
    key: "soh_gap",
    label: "Save-Our-Homes Gap",
    sub: "Collier County — % of value shielded from tax by the cap",
    display: fmtPct,
  },

  // ── Tier spread ──
  {
    concept: "tier_spread",
    packId: "tier-divergence-swfl",
    tableId: "tier_divergence_by_zip",
    cell: "spread_ratio",
    role: "primary",
    key: "tier_spread",
    label: "Luxury/Starter Spread",
    sub: "Top-tier ÷ bottom-tier home value",
    display: fmtRatio,
    movementCell: "spread_yoy_pct",
  },

  // ── market-temperature-swfl's two net-new concepts ──
  {
    concept: "price_per_sqft",
    packId: "market-temperature-swfl",
    tableId: "market_temperature_by_zip",
    cell: "median_price_per_sqft",
    role: "primary",
    key: "price_per_sqft",
    label: "Price per Square Foot",
    sub: "realtor.com monthly ZIP aggregate",
    display: (v) => `$${v}/sqft`,
  },
  {
    concept: "sold_to_rent_ratio",
    packId: "market-temperature-swfl",
    tableId: "market_temperature_by_zip",
    cell: "sold_to_rent_ratio",
    role: "primary",
    key: "sold_to_rent_ratio",
    label: "Sold-to-Rent Ratio",
    sub: "realtor.com monthly ZIP aggregate",
    display: (v) => v.toFixed(1),
  },

  // ── listing-momentum-swfl's two headline shares ──
  {
    concept: "price_reduced_share",
    packId: "listing-momentum-swfl",
    tableId: "listing_momentum_by_zip",
    cell: "price_reduced_share",
    role: "primary",
    key: "price_reduced_share",
    label: "Price-Cut Share",
    sub: "Active listings with a price reduction",
    display: fmtPct,
  },
  {
    concept: "new_listing_share",
    packId: "listing-momentum-swfl",
    tableId: "listing_momentum_by_zip",
    cell: "new_listing_share",
    role: "primary",
    key: "new_listing_share",
    label: "New-Listing Share",
    sub: "Active listings newly on market",
    display: fmtPct,
  },

  // ── seller-stress-swfl's one promoted magnitude ──
  {
    concept: "price_cut_depth",
    packId: "seller-stress-swfl",
    tableId: "seller_stress_by_zip",
    cell: "avg_price_drop_pct",
    role: "primary",
    key: "price_cut_depth",
    label: "Avg Price-Cut Depth",
    sub: "Among listings that cut price",
    display: fmtPct,
  },

  // ── market-heat-swfl's pending ratio + the one winning composite ──
  {
    concept: "pending_ratio",
    packId: "market-heat-swfl",
    tableId: "market_heat_by_zip",
    cell: "pending_ratio",
    role: "primary",
    key: "pending_ratio",
    label: "Pending Ratio",
    sub: "Pending sales vs. active inventory",
    display: (v) => v.toFixed(2),
    movementCell: "pending_ratio_yy",
  },
  {
    concept: "market_sentiment",
    packId: "market-heat-swfl",
    tableId: "market_heat_by_zip",
    cell: "market_heat_score",
    role: "primary",
    key: "market_heat_score",
    label: "Market Heat Score",
    sub: "0-100 relative heat, realtor.com list-side signals",
    display: fmtScore,
  },

  // ── Demoted — same concept as a winner above, cited in the rail only ──
  {
    concept: "home_value",
    packId: "active-listings-swfl",
    tableId: "active_listings_by_zip",
    cell: "median_list_price",
    role: "demoted",
    key: "median_list_price",
    label: "List-side asking median",
    sub: "",
    display: fmtUsdShort,
  },
  {
    concept: "days_on_market",
    packId: "active-listings-swfl",
    tableId: "active_listings_by_zip",
    cell: "avg_days_on_market",
    role: "demoted",
    key: "active_listings_avg_dom",
    label: "Active-listing average DOM",
    sub: "",
    display: (v) => `${v} days`,
  },
  {
    concept: "active_inventory",
    packId: "active-listings-swfl",
    tableId: "active_listings_by_zip",
    cell: "listing_count",
    role: "demoted",
    key: "active_listings_count",
    label: "realtor.com active listing count",
    sub: "",
    display: fmtCount,
  },
  {
    concept: "days_on_market",
    packId: "market-heat-swfl",
    tableId: "market_heat_by_zip",
    cell: "median_dom",
    role: "demoted",
    key: "market_heat_median_dom",
    label: "realtor.com median DOM",
    sub: "",
    display: (v) => `${v} days`,
  },
  {
    concept: "active_inventory",
    packId: "market-heat-swfl",
    tableId: "market_heat_by_zip",
    cell: "active_listing_count",
    role: "demoted",
    key: "market_heat_active_count",
    label: "realtor.com active listing count",
    sub: "",
    display: fmtCount,
  },
  {
    concept: "new_listing_share",
    packId: "market-heat-swfl",
    tableId: "market_heat_by_zip",
    cell: "new_listing_count",
    role: "demoted",
    key: "market_heat_new_listing_count",
    label: "realtor.com new-listing count",
    sub: "",
    display: fmtCount,
  },
  {
    concept: "price_reduced_share",
    packId: "market-heat-swfl",
    tableId: "market_heat_by_zip",
    cell: "price_reduced_share",
    role: "demoted",
    key: "market_heat_price_reduced_share",
    label: "realtor.com price-cut share",
    sub: "",
    display: fmtPct,
  },
  {
    concept: "market_sentiment",
    packId: "market-heat-swfl",
    tableId: "market_heat_by_zip",
    cell: "hotness_score",
    role: "demoted",
    key: "hotness_score",
    label: "realtor.com relative hotness score",
    sub: "",
    display: fmtScore,
  },
  {
    concept: "home_value",
    packId: "market-temperature-swfl",
    tableId: "market_temperature_by_zip",
    cell: "median_sold_price",
    role: "demoted",
    key: "market_temp_median_sold_price",
    label: "realtor.com median sold price",
    sub: "",
    display: fmtUsdShort,
  },
  {
    concept: "home_value",
    packId: "market-temperature-swfl",
    tableId: "market_temperature_by_zip",
    cell: "median_listing_price",
    role: "demoted",
    key: "market_temp_median_listing_price",
    label: "realtor.com median listing price",
    sub: "",
    display: fmtUsdShort,
  },
  {
    concept: "days_on_market",
    packId: "market-temperature-swfl",
    tableId: "market_temperature_by_zip",
    cell: "median_days_on_market",
    role: "demoted",
    key: "market_temp_median_dom",
    label: "realtor.com median days on market",
    sub: "",
    display: (v) => `${v} days`,
  },
  {
    concept: "sale_to_list_ratio",
    packId: "market-temperature-swfl",
    tableId: "market_temperature_by_zip",
    cell: "list_to_sold_ratio_pct",
    role: "demoted",
    key: "market_temp_list_to_sold_ratio",
    label: "realtor.com list-to-sold ratio",
    sub: "",
    display: fmtPct,
  },
  {
    concept: "market_sentiment",
    packId: "market-temperature-swfl",
    tableId: "market_temperature_by_zip",
    cell: "local_hotness_score",
    role: "demoted",
    key: "local_hotness_score",
    label: "realtor.com local hotness score",
    sub: "",
    display: fmtScore,
  },
  {
    concept: "active_inventory",
    packId: "listing-momentum-swfl",
    tableId: "listing_momentum_by_zip",
    cell: "active_listing_count",
    role: "demoted",
    key: "listing_momentum_active_count",
    label: "realtor.com active listing count",
    sub: "",
    display: fmtCount,
  },
  {
    concept: "market_sentiment",
    packId: "seller-stress-swfl",
    tableId: "seller_stress_by_zip",
    cell: "seller_stress_score",
    role: "demoted",
    key: "seller_stress_score",
    label: "Seller stress score (vs. 2019–2021 baseline)",
    sub: "",
    display: fmtScore,
  },
  {
    concept: "market_sentiment",
    packId: "seller-stress-swfl",
    tableId: "seller_stress_by_zip",
    cell: "share_delisted_pct",
    role: "demoted",
    key: "share_delisted_pct",
    label: "Share of listings delisted",
    sub: "",
    display: fmtPct,
  },
];

/** Concept → the two pairId-sharing entries that get a cross-reference footnote. */
function pairedEntries(): Map<string, [ZipMetricSource, ZipMetricSource]> {
  const byPair = new Map<string, ZipMetricSource[]>();
  for (const s of ZIP_METRIC_SOURCES) {
    if (!s.pairId) continue;
    const list = byPair.get(s.pairId) ?? [];
    list.push(s);
    byPair.set(s.pairId, list);
  }
  const out = new Map<string, [ZipMetricSource, ZipMetricSource]>();
  for (const [pairId, members] of byPair) {
    if (members.length === 2) out.set(pairId, [members[0], members[1]]);
  }
  return out;
}

/**
 * Concept-deduped candidate builder (spec 2026-07-03 zip-hero-pool-all-brains).
 * Pure — reads only the passed table map, no I/O. `tables` is keyed
 * `${packId}:${tableId}`; a missing key means that pack didn't load or hold a
 * table for this ZIP window, and every registry entry referencing it silently
 * produces nothing (empty-tolerant, never throws, never invents).
 */
export function buildRegistryCandidates(
  zip: string,
  tables: Map<string, RegistryTableData>,
): { candidates: SignalCandidate[]; railContext: Map<string, DemotedFigure[]> } {
  const candidates: SignalCandidate[] = [];
  const railContext = new Map<string, DemotedFigure[]>();
  const rawValueByKey = new Map<string, number>();

  for (const spec of ZIP_METRIC_SOURCES) {
    const data = tables.get(`${spec.packId}:${spec.tableId}`);
    if (!data) continue;
    const row = data.rows.find((r) => r.key === zip);
    const raw = row?.cells[spec.cell];
    const v = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    if (v == null) continue;

    if (spec.role === "demoted") {
      const list = railContext.get(spec.concept) ?? [];
      list.push({
        concept: spec.concept,
        label: spec.label,
        display: spec.display(v),
        sourceLabel: data.source?.label ?? spec.packId,
        sourceUrl: data.source?.url ?? "",
      });
      railContext.set(spec.concept, list);
      continue;
    }

    const dist = data.rows
      .map((r) => r.cells[spec.cell])
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
    const pct = percentileOf(dist, v);

    let movementPct: number | null = null;
    let movementText: string | undefined;
    if (spec.computeMovement && row) {
      const m = spec.computeMovement(row, v);
      movementPct = m.movementPct;
      movementText = m.movementText;
    } else if (spec.movementCell && row) {
      const mv = row.cells[spec.movementCell];
      if (typeof mv === "number" && Number.isFinite(mv) && mv !== 0) {
        movementPct = mv;
        movementText = `${arrow(mv)} ${Math.abs(mv)}% YoY`;
      }
    }

    rawValueByKey.set(spec.key, v);
    candidates.push({
      key: spec.key,
      label: spec.label,
      display: spec.display(v),
      sub: spec.sub,
      percentile: pct?.percentile ?? null,
      rankPos: pct?.rankPos,
      rankOf: pct?.rankOf,
      movementPct,
      movementText,
      covered: true,
      source: data.source,
    });
  }

  for (const [a, b] of pairedEntries().values()) {
    const ca = candidates.find((c) => c.key === a.key);
    const cb = candidates.find((c) => c.key === b.key);
    if (!ca || !cb) continue; // one or both sides not held for this ZIP — no footnote, both still stand alone
    const va = rawValueByKey.get(a.key)!;
    const vb = rawValueByKey.get(b.key)!;
    if (vb === 0) continue;
    const deltaPct = Math.round((Math.abs(va - vb) / vb) * 100);
    const footnote = `${a.label} tracks within ${deltaPct}% of ${b.label}`;
    ca.footnote = footnote;
    cb.footnote = footnote;
  }

  return { candidates, railContext };
}
```

`arrow` is the existing module-private helper already defined earlier in `candidates.ts` (`const arrow = (n: number) => (n > 0 ? "↑" : "↓");`) — reused as-is, not redefined.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test lib/zip-report/candidates.test.ts`
Expected: PASS (all — the existing housing/flood/permits/census describe-blocks untouched, plus the 8 new `buildRegistryCandidates` tests).

- [ ] **Step 5: Commit**

```bash
git add lib/zip-report/candidates.ts lib/zip-report/candidates.test.ts
git commit -m "feat(zip-report): concept-deduped ZIP_METRIC_SOURCES registry + buildRegistryCandidates

Standalone in this commit — not yet wired into buildZipCandidates."
```

---

### Task 3: Wire the registry into `buildZipCandidates`; retire `HOUSING_METRICS`

**Files:**
- 🔴 Modify: `lib/zip-report/candidates.ts` (rewrite `buildZipCandidates`'s housing section + `CandidateInput`; remove `HOUSING_METRICS`/`HousingMetricSpec`; rename `HousingZipRow` → `ZipDetailRow` — Task 2 already defined `ZipDetailRow` as a fresh interface, so this task deletes the old `HousingZipRow` and makes every remaining reference point at the one from Task 2)
- 🔴 Modify: `lib/zip-report/candidates.test.ts` (update the housing describe-block to the new `CandidateInput` shape)

**Interfaces:**
- Consumes: `buildRegistryCandidates`, `ZIP_METRIC_SOURCES`, `RegistryTableData`, `ZipDetailRow` (Task 2).
- Produces (used by Task 5): `CandidateInput` drops `housingRows`/`housingSource`, gains `registryTables: Map<string, RegistryTableData>`. `buildZipCandidates` return type unchanged (`{ candidates: SignalCandidate[]; gaps: GapSlot[] }`) but candidates now also carry `railContext` via a new third field: `{ candidates, gaps, railContext: Map<string, DemotedFigure[]> }`.

- [ ] **Step 1: Update the failing/changing tests first** — replace the existing `describe("buildZipCandidates — housing", ...)` block in `lib/zip-report/candidates.test.ts` and the `baseInput` helper:

```ts
// Replace the existing baseInput() helper:
function baseInput(over: Partial<CandidateInput> = {}): CandidateInput {
  return {
    zip: "33914",
    registryTables: new Map(),
    floodRows: [],
    floodForZip: null,
    permitsCounts: new Map(),
    censusValues: [],
    censusDistribution: new Map(),
    ...over,
  };
}

// Replace the HOUSING_ROWS constant + its describe block:
const HOUSING_TABLE: RegistryTableData = {
  rows: [
    {
      key: "33914",
      cells: {
        median_sale_price: 485_000,
        median_sale_price_yoy_pct: 18,
        median_dom: 60,
        median_dom_yoy_days: 12,
        homes_sold: 90,
        inventory: 300,
        months_of_supply: 5,
        avg_sale_to_list_pct: 96,
      },
    },
    {
      key: "33901",
      cells: {
        median_sale_price: 300_000,
        median_sale_price_yoy_pct: null,
        median_dom: 40,
        median_dom_yoy_days: null,
        homes_sold: 50,
        inventory: 100,
        months_of_supply: 3,
        avg_sale_to_list_pct: 97,
      },
    },
    {
      key: "34102",
      cells: {
        median_sale_price: 900_000,
        median_sale_price_yoy_pct: 2,
        median_dom: 80,
        median_dom_yoy_days: -5,
        homes_sold: 20,
        inventory: 200,
        months_of_supply: 8,
        avg_sale_to_list_pct: 94,
      },
    },
  ],
};

describe("buildZipCandidates — housing (via the registry)", () => {
  test("price candidate: percentile from the all-ZIP distribution + YoY movement restated", () => {
    const { candidates } = buildZipCandidates(
      baseInput({ registryTables: new Map([["housing-swfl:housing_by_zip", HOUSING_TABLE]]) }),
    );
    const price = candidates.find((c) => c.key === "median_sale_price")!;
    expect(price.covered).toBe(true);
    expect(price.percentile).toBe(50);
    expect(price.rankPos).toBe(2);
    expect(price.rankOf).toBe(3);
    expect(price.movementPct).toBe(18);
    expect(price.movementText).toBe("↑ 18% YoY");
    expect(price.display).toBe("$485K");
  });

  test("DOM movement % derives from held days delta: 12 days on a 48-day prior = +25%", () => {
    const { candidates } = buildZipCandidates(
      baseInput({ registryTables: new Map([["housing-swfl:housing_by_zip", HOUSING_TABLE]]) }),
    );
    const dom = candidates.find((c) => c.key === "median_dom")!;
    expect(dom.movementPct).toBe(25);
    expect(dom.movementText).toBe("↑ 12 days YoY");
  });

  test("a widened-pool concept (e.g. rent_index_latest) rides the same registry path", () => {
    const { candidates } = buildZipCandidates(
      baseInput({
        registryTables: new Map([
          [
            "rentals-swfl:rentals_by_zip",
            { rows: [{ key: "33914", cells: { rent_index_latest: 2100, rent_yoy_pct: 4 } }] },
          ],
        ]),
      }),
    );
    const rent = candidates.find((c) => c.key === "rent_index_latest")!;
    expect(rent.display).toBe("$2K/mo");
    expect(rent.movementText).toBe("↑ 4% YoY");
  });
});
```

Leave the `describe("buildZipCandidates — flood", ...)`, `describe("buildZipCandidates — permits + gaps", ...)`, and `describe("buildZipCandidates — census", ...)` blocks exactly as they are — they don't reference `housingRows`, so they keep passing once `baseInput()` above provides `registryTables: new Map()` as the default.

- [ ] **Step 2: Run to verify the housing describe-block fails, others still pass**

Run: `bun test lib/zip-report/candidates.test.ts`
Expected: FAIL on the new "housing (via the registry)" block (`registryTables` not in `CandidateInput` yet); flood/permits/census blocks PASS unchanged.

- [ ] **Step 3: Rewrite `buildZipCandidates` and `CandidateInput` in `lib/zip-report/candidates.ts`**

Delete the `HOUSING_METRICS` array and `HousingMetricSpec` interface entirely (lines that currently hold the 6-entry array and its interface — Task 2 already added the equivalent 6 entries into `ZIP_METRIC_SOURCES`, so this is pure deletion, not a copy). Delete the `numCell` helper's housing-specific caller inside the old housing loop (the generic `numCell` function itself stays — it's still used by the flood/permits sections below).

Replace the `HousingZipRow` interface with nothing (superseded by Task 2's `ZipDetailRow`) and update `CandidateInput`:

```ts
export interface CandidateInput {
  zip: string;
  /** packId:tableId -> table data, for every pack the registry (Task 2) references. */
  registryTables: Map<string, RegistryTableData>;
  floodRows: FloodZipRow[];
  floodForZip: FloodZipRow | null;
  floodSource?: { label: string; url: string };
  permitsCounts: Map<string, number>;
  permitsSource?: { label: string; url: string };
  censusValues: CensusValue[];
  censusDistribution: Map<string, number[]>;
}
```

Replace the body of `buildZipCandidates` — delete the entire "── Housing" loop block (the `for (const spec of HOUSING_METRICS) { ... }` loop) and replace the function's opening + housing section with:

```ts
export function buildZipCandidates(input: CandidateInput): {
  candidates: SignalCandidate[];
  gaps: GapSlot[];
  railContext: Map<string, DemotedFigure[]>;
} {
  const registryResult = buildRegistryCandidates(input.zip, input.registryTables);
  const candidates: SignalCandidate[] = [...registryResult.candidates];
  const gaps: GapSlot[] = [];

  // ── Flood — all-ZIP detail table preferred; key_metrics fallback keeps today's page working.
  if (input.floodForZip) {
    const f = input.floodForZip;
    let percentile: number | null = null;
    let rankPos: number | undefined;
    let rankOf: number | undefined;
    if (input.floodRows.length > 1) {
      const pct = percentileOf(
        input.floodRows.map((r) => r.aal),
        f.aal,
      );
      percentile = pct?.percentile ?? null;
      rankPos = pct?.rankPos;
      rankOf = pct?.rankOf;
    } else if (f.pctRank != null) {
      percentile = Math.round(f.pctRank);
      rankOf = TOTAL_SWFL_ZIPS;
      rankPos = Math.max(1, Math.round((1 - percentile / 100) * TOTAL_SWFL_ZIPS) + 1);
    }
    candidates.push({
      key: "flood_aal",
      label: "Annual Flood Loss",
      display: fmtUsdShort(f.aal),
      sub: "Flood insurance avg/home per year",
      percentile,
      rankPos,
      rankOf,
      movementPct: null,
      covered: true,
      source: input.floodSource,
    });
  }

  // ── Permits — competes only where the Lee Accela feed covers (count > 0).
  const permitCount = input.permitsCounts.get(input.zip) ?? 0;
  if (permitCount > 0) {
    const dist = [...input.permitsCounts.values()].filter((n) => n > 0);
    const pct = percentileOf(dist, permitCount);
    candidates.push({
      key: "permits_90d",
      label: "New Permits (90 Days)",
      display: permitCount.toLocaleString("en-US"),
      sub: "Lee County building permits",
      percentile: pct?.percentile ?? null,
      rankPos: pct?.rankPos,
      rankOf: pct?.rankOf,
      movementPct: null,
      covered: true,
      source: input.permitsSource,
    });
  } else {
    // Structurally-absent source → Find-it slot (never an em-dash, never a fake zero).
    const gap = findGap("permits_90d", input.zip);
    if (gap) {
      gaps.push({
        metric_key: "permits_90d",
        label: "New Permits (90 Days)",
        coverage: gap.coverage,
      });
    }
  }

  // ── Census — joins the same ranked pool; percentile from the SWFL ACS distribution.
  for (const cv of input.censusValues) {
    const dist = input.censusDistribution.get(cv.key) ?? [];
    const pct = dist.length > 1 ? percentileOf(dist, cv.value) : null;
    candidates.push({
      key: cv.key,
      label: cv.label,
      display: cv.display,
      sub: cv.sourceLabel,
      percentile: pct?.percentile ?? null,
      rankPos: pct?.rankPos,
      rankOf: pct?.rankOf,
      movementPct: null,
      covered: true,
      source: { label: cv.sourceLabel, url: cv.sourceUrl },
    });
  }

  return { candidates, gaps, railContext: registryResult.railContext };
}
```

The flood/permits/census blocks above are pasted in **verbatim** from today's `candidates.ts` — only the surrounding scaffolding changed: they now push onto a `candidates` array seeded from the registry instead of an empty one, and the function returns the extra `railContext` field. `TOTAL_SWFL_ZIPS`, `fmtUsdShort`, and `findGap` are all already imported/defined earlier in this same file — no new imports needed for this step.

Add the missing import at the top of the file (all other types used above are already defined earlier in this same file from Task 2, so no new imports needed beyond what Task 2 already added).

- [ ] **Step 4: Run tests to verify everything passes**

Run: `bun test lib/zip-report/candidates.test.ts lib/zip-report/signal-rank.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Typecheck the whole project (this touches an exported interface many files may reference)**

Run: `grep -rln "HousingZipRow\|HOUSING_METRICS\|HousingMetricSpec" --include="*.ts" --include="*.tsx" .`
Expected: no matches outside `lib/zip-report/candidates.ts` itself (the type was renamed/removed, not re-exported elsewhere). If matches appear in `app/r/zip-report/[zip]/page.tsx`, note them — Task 5 handles that file's migration to `registryTables`.

- [ ] **Step 6: Commit**

```bash
git add lib/zip-report/candidates.ts lib/zip-report/candidates.test.ts
git commit -m "refactor(zip-report): buildZipCandidates reads housing through the concept registry

Retires HOUSING_METRICS/HousingMetricSpec (superseded by Task 2's
ZIP_METRIC_SOURCES) and CandidateInput.housingRows/housingSource in favor
of the generic registryTables map. Flood/permits/census sections
untouched."
```

---

### Task 4: `lib/zip-report/load-registry-tables.ts` — the generic pack-output extractor

**Files:**
- Create: `lib/zip-report/load-registry-tables.ts`
- Test: `lib/zip-report/load-registry-tables.test.ts`

**Interfaces:**
- Consumes: `ParsedBrain` (`refinery/render/speaker.mts`), `RegistryTableData`/`ZipDetailRow`/`ZIP_METRIC_SOURCES` (`./candidates`).
- Produces (used by Task 5): `buildRegistryTableMap(brains: Map<string, ParsedBrain | null>): Map<string, RegistryTableData>` — for every distinct `(packId, tableId)` pair referenced anywhere in `ZIP_METRIC_SOURCES`, looks up `brains.get(packId)?.output.detail_tables`, finds the table by id, and if present maps its `rows`/`source` into `RegistryTableData`. Empty-tolerant: a missing brain, a missing table, or a table with 0 rows all simply omit that key from the returned map — never throws.

- [ ] **Step 1: Write the failing test**

```ts
// lib/zip-report/load-registry-tables.test.ts
import { describe, expect, test } from "bun:test";
import { buildRegistryTableMap } from "./load-registry-tables";
import type { ParsedBrain } from "@/refinery/render/speaker.mts";

function fakeBrain(detail_tables: ParsedBrain["output"]["detail_tables"]): ParsedBrain {
  return {
    brain_id: "x",
    version: 1,
    freshness_token: "SWFL-x-20260703",
    scope: "test",
    refined_at: "2026-07-03T00:00:00Z",
    raw_md: "",
    output: {
      conclusion: "",
      key_metrics: [],
      caveats: [],
      direction: "neutral",
      magnitude: 0,
      drivers: [],
      overrides: [],
      contradicts: [],
      exogenous_signals: [],
      detail_tables,
    },
  } as unknown as ParsedBrain;
}

describe("buildRegistryTableMap", () => {
  test("extracts rows + source for a table the registry references, keyed packId:tableId", () => {
    const brains = new Map<string, ParsedBrain | null>([
      [
        "housing-swfl",
        fakeBrain([
          {
            id: "housing_by_zip",
            title: "t",
            grain: "zip",
            columns: [],
            rows: [{ key: "33914", label: "33914", cells: { median_sale_price: 485_000 } }],
            source: { url: "https://example.com", fetched_at: "2026-07-01T00:00:00Z", tier: 1, citation: "MLS" },
          },
        ]),
      ],
    ]);
    const map = buildRegistryTableMap(brains);
    const entry = map.get("housing-swfl:housing_by_zip")!;
    expect(entry.rows).toEqual([{ key: "33914", cells: { median_sale_price: 485_000 } }]);
    expect(entry.source).toEqual({ label: "MLS", url: "https://example.com" });
  });

  test("a brain that's null (failed to load) -> its tables are simply absent from the map, never throws", () => {
    const brains = new Map<string, ParsedBrain | null>([["housing-swfl", null]]);
    expect(() => buildRegistryTableMap(brains)).not.toThrow();
    expect(buildRegistryTableMap(brains).has("housing-swfl:housing_by_zip")).toBe(false);
  });

  test("a brain present but missing the referenced table id -> absent from the map", () => {
    const brains = new Map<string, ParsedBrain | null>([["housing-swfl", fakeBrain([])]]);
    expect(buildRegistryTableMap(brains).has("housing-swfl:housing_by_zip")).toBe(false);
  });

  test("a pack the registry never references is ignored even if present in the input map", () => {
    const brains = new Map<string, ParsedBrain | null>([
      ["some-unrelated-brain", fakeBrain([{ id: "whatever", title: "t", grain: "zip", columns: [], rows: [], source: { url: "", fetched_at: "", tier: 1, citation: "" } }])],
    ]);
    expect(buildRegistryTableMap(brains).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/zip-report/load-registry-tables.test.ts`
Expected: FAIL — `Cannot find module './load-registry-tables'`

- [ ] **Step 3: Implement**

```ts
// lib/zip-report/load-registry-tables.ts
//
// Turns the ZIP page's loaded ParsedBrains into the flat packId:tableId -> rows
// map lib/zip-report/candidates.ts's registry loop reads. Spec: 2026-07-03
// zip-hero-pool-all-brains §2. Empty-tolerant: a missing brain, a missing table,
// or a pack the registry doesn't reference are all silently omitted — never throws.
import type { ParsedBrain } from "@/refinery/render/speaker.mts";
import { ZIP_METRIC_SOURCES, type RegistryTableData, type ZipDetailRow } from "./candidates";

/** Every distinct (packId, tableId) pair the registry reads from, deduplicated. */
function referencedTables(): { packId: string; tableId: string }[] {
  const seen = new Set<string>();
  const out: { packId: string; tableId: string }[] = [];
  for (const spec of ZIP_METRIC_SOURCES) {
    const k = `${spec.packId}:${spec.tableId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ packId: spec.packId, tableId: spec.tableId });
  }
  return out;
}

export function buildRegistryTableMap(
  brains: Map<string, ParsedBrain | null>,
): Map<string, RegistryTableData> {
  const out = new Map<string, RegistryTableData>();
  for (const { packId, tableId } of referencedTables()) {
    const brain = brains.get(packId);
    if (!brain) continue;
    const table = brain.output.detail_tables?.find((t) => t.id === tableId);
    if (!table || table.rows.length === 0) continue;
    const rows: ZipDetailRow[] = table.rows.map((r) => ({ key: r.key, cells: r.cells }));
    out.set(`${packId}:${tableId}`, {
      rows,
      source: { label: table.source.citation || packId, url: table.source.url },
    });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/zip-report/load-registry-tables.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/zip-report/load-registry-tables.ts lib/zip-report/load-registry-tables.test.ts
git commit -m "feat(zip-report): generic pack-output extractor for the concept registry"
```

---

### Task 5: `page.tsx` — load the 10 new packs, wire the registry, drop redundant housing extraction

**Files:**
- 🟡 Modify: `app/r/zip-report/[zip]/page.tsx`

**Interfaces:**
- Consumes: `buildRegistryTableMap` (Task 4), updated `buildZipCandidates`/`CandidateInput` (Task 3).
- Produces: no new exports — this is the page's data-assembly section only.

- [ ] **Step 1: Add the new pack IDs + generic loader, extend the `Promise.all`**

In `app/r/zip-report/[zip]/page.tsx`, add the import (next to the existing `loadParsedBrain` import):

```ts
import { buildRegistryTableMap } from "../../../../lib/zip-report/load-registry-tables";
```

Replace the existing `Promise.all` block:

```ts
  const [housing, env, permits, dossier, summary, metroTrend, censusSignals, sourcedFigures] =
    await Promise.all([
      loadParsedBrain("housing-swfl"),
      loadParsedBrain("env-swfl"),
      loadParsedBrain("permits-swfl"),
      assembleLocationDossier(loc),
      loadZipQuickSummary(zip),
      loadMetroTrend("zhvi_pivoted"),
      loadCensusSignals(zip),
      getSourcedFigures({ kind: "zip", key: zip }),
    ]);
```

with:

```ts
  const REGISTRY_PACK_IDS = [
    "housing-swfl",
    "home-values-swfl",
    "rentals-swfl",
    "active-rentals-swfl",
    "market-heat-swfl",
    "market-temperature-swfl",
    "listing-momentum-swfl",
    "seller-stress-swfl",
    "tier-divergence-swfl",
    "permits-commercial-swfl",
    "properties-collier-value",
  ] as const;

  const [
    registryBrains,
    env,
    permits,
    dossier,
    summary,
    metroTrend,
    censusSignals,
    sourcedFigures,
  ] = await Promise.all([
    Promise.all(REGISTRY_PACK_IDS.map((id) => loadParsedBrain(id))).then(
      (brains) => new Map(REGISTRY_PACK_IDS.map((id, i) => [id, brains[i]])),
    ),
    loadParsedBrain("env-swfl"),
    loadParsedBrain("permits-swfl"),
    assembleLocationDossier(loc),
    loadZipQuickSummary(zip),
    loadMetroTrend("zhvi_pivoted"),
    loadCensusSignals(zip),
    getSourcedFigures({ kind: "zip", key: zip }),
  ]);
  const housing = registryBrains.get("housing-swfl") ?? null;
  const registryTables = buildRegistryTableMap(registryBrains);
```

`housing` stays defined (used below for `hasHousing`/`housingRow` display fields and `freshnessToken`), now sourced from the map instead of its own separate `loadParsedBrain` call.

- [ ] **Step 2: Remove the now-redundant standalone housing detail-table lookup that fed the OLD candidate builder call**

Find and delete these lines (the `housingTable`/`housingRows`/`housingSource` block that existed ONLY to build the old `CandidateInput.housingRows`/`housingSource` — the display-only uses of `housingRow` below it, e.g. `price`, `dom`, `saleToList`, stay, since those still read directly off `housing`):

```ts
  // ── Housing (all-ZIP detail table — the candidate builder ranks from it) ──
  const housingTable = housing?.output.detail_tables?.find((t) => t.id === "housing_by_zip");
  const housingRows = housingTable?.rows ?? [];
  const housingRow = housingRows.find((r) => r.key === zip);
```

Replace with:

```ts
  // ── Housing display fields read directly off the brain; ranking now goes
  // through registryTables (populated above via buildRegistryTableMap). ──
  const housingRow = housing?.output.detail_tables
    ?.find((t) => t.id === "housing_by_zip")
    ?.rows.find((r) => r.key === zip);
```

Delete the now-unused `housingSource` construction (`const housingSource = housingTable ? {...} : undefined;`) entirely — it's no longer passed anywhere.

- [ ] **Step 3: Update the `buildZipCandidates` call site**

Replace:

```ts
  const { candidates, gaps } = buildZipCandidates({
    zip,
    housingRows,
    housingSource,
    floodRows,
    floodForZip,
    floodSource: floodSourceUrl
      ? { label: floodSourceCitation || "FEMA NFIP", url: floodSourceUrl }
      : undefined,
    permitsCounts: permitsCountMap,
    permitsSource: permitsSourceUrl
      ? { label: permitsSourceCitation, url: permitsSourceUrl }
      : undefined,
    censusValues,
    censusDistribution: censusSignals.distribution,
  });
```

with:

```ts
  const { candidates, gaps, railContext } = buildZipCandidates({
    zip,
    registryTables,
    floodRows,
    floodForZip,
    floodSource: floodSourceUrl
      ? { label: floodSourceCitation || "FEMA NFIP", url: floodSourceUrl }
      : undefined,
    permitsCounts: permitsCountMap,
    permitsSource: permitsSourceUrl
      ? { label: permitsSourceCitation, url: permitsSourceUrl }
      : undefined,
    censusValues,
    censusDistribution: censusSignals.distribution,
  });
```

- [ ] **Step 4: Verify the page still typechecks and builds**

Run: `bunx next build`
Expected: build succeeds; no type errors referencing `housingRows`/`housingSource`/`FloodZipRow` mismatches. (This is the first point a real type error in Tasks 1–4's work would surface end-to-end, since `candidates.test.ts` alone can't catch a page-level wiring mistake.)

- [ ] **Step 5: Commit**

```bash
git add "app/r/zip-report/[zip]/page.tsx"
git commit -m "feat(zip-report): load all 11 registry packs + wire the concept-deduped pool into the page"
```

---

### Task 6: Render footnotes on `SignalCard` + "also reported by" lines in the rail

**Files:**
- 🟡 Modify: `app/r/zip-report/[zip]/page.tsx` (the `SignalCard` function + the rail's `<aside className="zp-rail">` JSX)

**Interfaces:**
- Consumes: `RankedSignal.footnote` (Task 1), `railContext: Map<string, DemotedFigure[]>` (Tasks 2/3/5).
- Produces: no new exports — presentation only.

- [ ] **Step 1: Render the footnote in `SignalCard`**

In the `SignalCard` function, add one line after the existing `movementText` line:

```tsx
function SignalCard({ s }: { s: RankedSignal }) {
  return (
    <div className="rounded-xl glass-card-modern border border-white/10 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{s.label}</p>
      <p className="mt-1 font-mono text-lg font-semibold text-white">{s.display}</p>
      {s.sub && <p className="mt-0.5 text-xs text-gray-500">{s.sub}</p>}
      {s.why && <p className="mt-1 text-xs text-teal-primary/80">{s.why}</p>}
      {s.movementText && s.movementText !== s.why && (
        <p className="mt-1 text-xs text-gray-400">{s.movementText}</p>
      )}
      {s.footnote && <p className="mt-1 text-xs text-gray-500 italic">{s.footnote}</p>}
    </div>
  );
}
```

The hero strip's rendering (`heroSignals.map(...)` in the main render body) is a separate, simpler inline block (`zp-stat-cell`) that doesn't currently render `sub`'s sibling `movementText` either — leave it as-is; a footnote is rail/grid-appropriate detail, not hero-strip real estate (matches the spec's "hero = top-3, terse" framing).

- [ ] **Step 2: Add "also reported by" lines to the rail**

In the rail's `<aside className="zp-rail">`, find the existing `{gaps.map((g) => ( ... ))}` block and add a new block immediately after it, before `<div className="zp-rail-footer">`:

```tsx
          {gaps.map((g) => (
            <p key={g.metric_key} className="mt-3 text-xs leading-relaxed text-gray-500">
              Building permits here are issued by the{" "}
              <a
                href={g.coverage.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-white/30 underline-offset-2 hover:text-white"
              >
                {g.coverage.name.replace(/ permitting$/, "")}
              </a>{" "}
              — not the county feed our permit counts come from.
            </p>
          ))}

          {[...heroSignals, ...gridSignals]
            .flatMap((s) => {
              const demoted = railContext.get(RAIL_CONCEPT_BY_KEY[s.key] ?? "");
              return demoted ? demoted.map((d) => ({ winner: s, demoted: d })) : [];
            })
            .map(({ winner, demoted }) => (
              <p
                key={`${winner.key}:${demoted.label}`}
                className="mt-3 text-xs leading-relaxed text-gray-500"
              >
                Also reported — {demoted.label}: {demoted.display} (
                <a
                  href={demoted.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-white/30 underline-offset-2 hover:text-white"
                >
                  {demoted.sourceLabel}
                </a>
                ).
              </p>
            ))}

          <div className="zp-rail-footer">Every figure is cited — sources listed below.</div>
```

Add `ZIP_METRIC_SOURCES` to the existing candidates-module import at the top of the file — this is the SAME import line Task 5 already touches, so extend it rather than adding a second import statement for the same module:

```ts
import {
  buildZipCandidates,
  loadCensusSignals,
  ZIP_METRIC_SOURCES,
  type CensusValue,
  type FloodZipRow,
} from "../../../../lib/zip-report/candidates";
```

Then add the `RAIL_CONCEPT_BY_KEY` lookup near the top of the file, next to the other module-level helpers (e.g. right after the `grainBucket` function) — this maps a rendered candidate's `key` back to the registry `concept` it won, since `RankedSignal` carries `key` (unique per-metric) but `railContext` is keyed by `concept` (shared across the winner + its demoted siblings):

```ts
const RAIL_CONCEPT_BY_KEY: Record<string, string> = Object.fromEntries(
  ZIP_METRIC_SOURCES.filter((s) => s.role === "primary").map((s) => [s.key, s.concept]),
);
```

- [ ] **Step 3: Verify the page builds and renders**

Run: `bunx next build`
Expected: build succeeds.

Run: `bun test lib/zip-report/`
Expected: PASS (all — `signal-rank.test.ts`, `candidates.test.ts`, `load-registry-tables.test.ts`).

- [ ] **Step 4: Commit**

```bash
git add "app/r/zip-report/[zip]/page.tsx"
git commit -m "feat(zip-report): render footnotes + 'also reported by' rail citations for demoted figures"
```

---

### Task 7: Full verify + close-out

**Files:** none (verification only).

- [ ] **Step 1: Run the full targeted test suite**

Run: `bun test lib/zip-report/ lib/figures/`
Expected: PASS — everything from this plan plus the parent build's untouched `lib/figures/*.test.ts`.

- [ ] **Step 2: Full production build**

Run: `bunx next build`
Expected: build succeeds with no type errors.

- [ ] **Step 3: Vocab / pack gates — confirm this build is a no-op for them**

This plan touches zero files under `refinery/packs/**` (only `lib/zip-report/**` and one `app/r/zip-report/**` page), so Gate 2 (vocab coverage) and Gate 5 (pack ⇆ catalog) are not triggered. Confirm:

Run: `git diff --stat origin/main..HEAD -- refinery/packs/`
Expected: empty output (no pack files touched).

- [ ] **Step 4: Show the operator what's ready to push**

Run: `git log origin/main..HEAD --oneline`
Expected: 6 commits (Tasks 1–6; Task 7 has no commit of its own since it's verification-only) — footnote field, registry+builder, wiring, loader, page wiring, rail rendering.

**STOP HERE.** Do not push. Show the operator the commit list and a one-line summary of what's ready (candidate pool widened from 4 to 13 packs, concept-deduped, 15 new competing signals + 1 winning composite + 2 macro/micro pairs, ~16 demoted figures cited in the rail) and wait for explicit push confirmation, per the no-autonomous-push rule. Do NOT close the `zip_hero_pool_all_brains` check from this session — that's an operator action once the build is live-verified in prod (same convention as the parent build).

---


---


---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 2, Task 3 | `lib/zip-report/candidates.ts`, `lib/zip-report/candidates.test.ts` |
| 🟡 | Task 5, Task 6 | `app/r/zip-report/[zip]/page.tsx` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
