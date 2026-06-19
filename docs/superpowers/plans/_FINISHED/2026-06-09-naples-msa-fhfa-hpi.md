# Naples MSA FHFA HPI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Naples-Marco Island MSA FHFA House Price Index (already in `data_lake.fhfa_hpi`) through the computation layer, add its vocab slug, emit it from `properties-collier-value`, and flip 5 Collier cities from `gap` to `partial` in the city matrix.

**Architecture:** No new ingest pipeline needed — `data_lake.fhfa_hpi` already contains "Naples-Marco Island, FL" rows (the FHFA pipeline fetches the full master JSON which covers all SWFL MSAs). The gap is purely in the refinery: `HpiSwflSummary` doesn't expose a `naples_msa` block, `properties-collier-value` doesn't import `fhfaHpiSource`, and the vocab has no slug for this series. Fix all three layers, then update the ops city matrix.

**Tech Stack:** Bun + TypeScript, `refinery/sources/fhfa-hpi-source.mts`, `refinery/packs/properties-collier-value.mts`, `refinery/vocab/brain-vocabulary.json`, `scripts/write_ops_cities.py`

---

## File Map

| File | Change |
|------|--------|
| `refinery/__fixtures__/fhfa-hpi.sample.json` | Add 5 Naples-Marco Island MSA rows (enables fixture-mode tests) |
| `refinery/sources/fhfa-hpi-source.mts` | Add `naples_msa` field to `HpiSwflSummary`; wire into `buildSwflSummary()` |
| `refinery/vocab/brain-vocabulary.json` | New concept `fhfa_naples_msa_yoy_pct` + slug_index entry |
| `refinery/packs/properties-collier-value.mts` | Import `fhfaHpiSource`; add to `sources`; extract + emit metric |
| `refinery/packs/properties-collier-value.test.mts` | Fix `sources.length` assertion; add FHFA round-trip coverage |
| `scripts/write_ops_cities.py` | Flip 5 Collier cities `fhfa_hpi:"gap"` → `"partial"`; update need strings |

---

## Task 1 — Add Naples MSA fixture rows

**Files:**
- Modify: `refinery/__fixtures__/fhfa-hpi.sample.json`

The fixture currently has 132 rows, all Cape Coral, FL State, and other MSAs — zero Naples rows. The `loadFixture()` filter in `fhfa-hpi-source.mts` already passes `SWFL_MSA_NAMES.has(r.place_name)`, and "Naples-Marco Island, FL" is already in that Set. So we only need rows in the JSON.

The `computeMsaSummary()` helper needs `sorted.length >= 5` to compute a YoY change (uses `sorted[sorted.length - 5]` as prior-year quarter). Add exactly 5 consecutive quarterly rows.

Naples-Marco Island, FL MSA CBSA code: `34940`.

Designed values (rounded deterministically by the computation helper):
| yr   | period | index_nsa | role              |
|------|--------|-----------|-------------------|
| 2024 | 4      | 495.00    | prior-year anchor |
| 2025 | 1      | 490.00    |                   |
| 2025 | 2      | 488.00    |                   |
| 2025 | 3      | 486.00    |                   |
| 2025 | 4      | 502.00    | latest            |

YoY = (502 − 495) / 495 × 100 = **+1.41%** (Math.round(1.4141…×100)/100)
QoQ = (502 − 486) / 486 × 100 = **+3.29%** (Math.round(3.2921…×100)/100)

- [ ] **Step 1: Append 5 Naples rows to the fixture**

Open `refinery/__fixtures__/fhfa-hpi.sample.json`. It has a `"master": [...]` array. Append these 5 objects inside that array (after the last existing row, before the closing `]`):

```json
{
  "hpi_type": "traditional",
  "hpi_flavor": "purchase-only",
  "frequency": "quarterly",
  "level": "MSA",
  "place_name": "Naples-Marco Island, FL",
  "place_id": "34940",
  "yr": 2024,
  "period": 4,
  "index_nsa": 495.00,
  "index_sa": 494.50
},
{
  "hpi_type": "traditional",
  "hpi_flavor": "purchase-only",
  "frequency": "quarterly",
  "level": "MSA",
  "place_name": "Naples-Marco Island, FL",
  "place_id": "34940",
  "yr": 2025,
  "period": 1,
  "index_nsa": 490.00,
  "index_sa": 491.00
},
{
  "hpi_type": "traditional",
  "hpi_flavor": "purchase-only",
  "frequency": "quarterly",
  "level": "MSA",
  "place_name": "Naples-Marco Island, FL",
  "place_id": "34940",
  "yr": 2025,
  "period": 2,
  "index_nsa": 488.00,
  "index_sa": 487.00
},
{
  "hpi_type": "traditional",
  "hpi_flavor": "purchase-only",
  "frequency": "quarterly",
  "level": "MSA",
  "place_name": "Naples-Marco Island, FL",
  "place_id": "34940",
  "yr": 2025,
  "period": 3,
  "index_nsa": 486.00,
  "index_sa": 485.50
},
{
  "hpi_type": "traditional",
  "hpi_flavor": "purchase-only",
  "frequency": "quarterly",
  "level": "MSA",
  "place_name": "Naples-Marco Island, FL",
  "place_id": "34940",
  "yr": 2025,
  "period": 4,
  "index_nsa": 502.00,
  "index_sa": 501.50
}
```

- [ ] **Step 2: Verify fixture JSON is valid**

```bash
node -e "
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('refinery/__fixtures__/fhfa-hpi.sample.json','utf-8'));
const naples = d.master.filter(r => r.place_name === 'Naples-Marco Island, FL');
console.log('Naples rows added:', naples.length);
console.log('Total rows:', d.master.length);
"
```

Expected:
```
Naples rows added: 5
Total rows: 137
```

---

## Task 2 — Extend `HpiSwflSummary` + `buildSwflSummary()`

**Files:**
- Modify: `refinery/sources/fhfa-hpi-source.mts`

The `computeMsaSummary(rows, placeName)` helper already works generically — it takes any `placeName` string. We only need to:
1. Add `naples_msa` to the interface (same shape as `cape_coral_msa`)
2. Call `computeMsaSummary(rows, "Naples-Marco Island, FL")` in `buildSwflSummary()`
3. Add `naples_msa_period` to the fragment `raw` field (mirrors `cape_coral_msa_period`)

- [ ] **Step 1: Write the failing test**

There is no dedicated source test file — we verify the source through the pack test (Task 4). Skip this step and go straight to implementation; the pack round-trip in Task 4 Step 1 covers this.

- [ ] **Step 2: Edit `refinery/sources/fhfa-hpi-source.mts`**

**Change 1 — `HpiSwflSummary` interface** (add `naples_msa` after `cape_coral_msa`):

```typescript
export interface HpiSwflSummary {
  kind: "hpi-swfl-summary";
  /** Cape Coral-Fort Myers MSA — quarterly, Lee County price-level proxy. */
  cape_coral_msa: {
    latest_period: string;
    index_nsa: number | null;
    qoq_change_pct: number | null;
    yoy_change_pct: number | null;
  } | null;
  /** Naples-Marco Island MSA — quarterly, Collier County price-level proxy. */
  naples_msa: {
    latest_period: string;
    index_nsa: number | null;
    qoq_change_pct: number | null;
    yoy_change_pct: number | null;
  } | null;
  /** FL state baseline — latest quarterly index. */
  fl_state: {
    latest_period: string;
    index_nsa: number | null;
    yoy_change_pct: number | null;
  } | null;
}
```

**Change 2 — `buildSwflSummary()` function** (add `naples_msa` line):

```typescript
function buildSwflSummary(rows: DbRow[]): HpiSwflSummary {
  return {
    kind: "hpi-swfl-summary",
    cape_coral_msa: computeMsaSummary(rows, "Cape Coral-Fort Myers, FL"),
    naples_msa: computeMsaSummary(rows, "Naples-Marco Island, FL"),
    fl_state: computeStateSummary(rows),
  };
}
```

**Change 3 — fragment `raw` field** (add `naples_msa_period`):

```typescript
    // SWFL rollup summary — the thin-pipe fragment consuming packs read
    const summary = buildSwflSummary(rows);
    fragments.push({
      fragment_id: fragmentId(SOURCE_ID, "swfl-summary"),
      source_id: SOURCE_ID,
      source_trust_tier: 1,
      fetched_at,
      raw: {
        cape_coral_msa_period: summary.cape_coral_msa?.latest_period ?? null,
        naples_msa_period: summary.naples_msa?.latest_period ?? null,
        fl_state_period: summary.fl_state?.latest_period ?? null,
      },
      normalized: summary,
    });
```

- [ ] **Step 3: Verify typecheck passes on the source file**

```bash
bun tsc --noEmit -p refinery/tsconfig.json 2>&1 | grep "fhfa-hpi-source" | head -20
```

Expected: no lines mentioning `fhfa-hpi-source.mts`. (The baseline ~18 refinery typecheck errors are pre-existing debt; new errors from this file are a red flag.)

- [ ] **Step 4: Commit**

```bash
git add refinery/__fixtures__/fhfa-hpi.sample.json refinery/sources/fhfa-hpi-source.mts
git commit -m "feat(fhfa-hpi): add naples_msa block to HpiSwflSummary + fixture rows"
```

---

## Task 3 — Add vocab concept `fhfa_naples_msa_yoy_pct`

**Files:**
- Modify: `refinery/vocab/brain-vocabulary.json`

Two additions needed: (a) the concept block in the `concepts` object, (b) the slug_index entry.

- [ ] **Step 1: Add concept block**

In `refinery/vocab/brain-vocabulary.json`, find the `fhfa_fl_state_yoy_pct` concept block (around line 1915). Insert the new concept **immediately after** the closing `}` of `fhfa_fl_state_yoy_pct`:

```json
    "fhfa_naples_msa_yoy_pct": {
      "id": "fhfa_naples_msa_yoy_pct",
      "grade": { "direction_polarity": "higher_is_bullish" },
      "prefLabel": "Naples-Marco Island MSA HPI Year-over-Year Change (FHFA)",
      "altLabels": ["Naples MSA HPI YoY", "Collier County HPI YoY proxy"],
      "raw_slugs": ["fhfa_naples_msa_yoy_pct"],
      "category": "real-estate",
      "domain": ["real-estate"],
      "source_brains": ["properties-collier-value", "master"],
      "value_type": "percent_change",
      "unit": "percent",
      "value_range": [-30, 30],
      "direction_concept": "qual_metric_trajectory",
      "status": "active",
      "scope_note": "Year-over-year percent change in FHFA House Price Index (traditional, purchase-only, quarterly, NSA) for the Naples-Marco Island FL MSA — the Collier County price-level proxy. Computed from data_lake.fhfa_hpi: (latest_quarter_index - same_quarter_prior_year_index) / same_quarter_prior_year_index × 100. Negative = falling prices; positive = rising. Exogenous signal in properties-collier-value; contrasted against Redfin homes-sold velocity z-score."
    },
```

- [ ] **Step 2: Add slug_index entry**

In the `slug_index` object (around line 3802), find the two existing fhfa entries:

```json
    "fhfa_cape_coral_msa_yoy_pct": "fhfa_cape_coral_msa_yoy_pct",
    "fhfa_fl_state_yoy_pct": "fhfa_fl_state_yoy_pct",
```

Add the new entry on the line after `fhfa_fl_state_yoy_pct`:

```json
    "fhfa_cape_coral_msa_yoy_pct": "fhfa_cape_coral_msa_yoy_pct",
    "fhfa_fl_state_yoy_pct": "fhfa_fl_state_yoy_pct",
    "fhfa_naples_msa_yoy_pct": "fhfa_naples_msa_yoy_pct",
```

- [ ] **Step 3: Validate JSON and run vocab coverage check**

```bash
node -e "JSON.parse(require('fs').readFileSync('refinery/vocab/brain-vocabulary.json','utf-8')); console.log('JSON valid')"
```

Expected: `JSON valid`

```bash
bun refinery/tools/check-vocab-coverage.mts --all 2>&1 | tail -10
```

Expected: exit 0, no orphan slugs. (The new slug `fhfa_naples_msa_yoy_pct` is registered — but it won't appear in rendered output until Task 4 wires it into the pack. `--all` won't flag it as orphaned because we haven't emitted it yet; once the pack emits it, `--all` will confirm coverage.)

- [ ] **Step 4: Commit**

```bash
git add refinery/vocab/brain-vocabulary.json
git commit -m "feat(vocab): add fhfa_naples_msa_yoy_pct concept + slug_index"
```

---

## Task 4 — Wire `fhfaHpiSource` into `properties-collier-value`

**Files:**
- Modify: `refinery/packs/properties-collier-value.mts`

Follow the exact same pattern as `properties-lee-value.mts`. The pack needs:
1. Import `fhfaHpiSource` + `HpiSwflSummary`
2. Module-level `let lastFhfaSummary: HpiSwflSummary | null = null`
3. `fhfaSummaryFrom()` helper (extract `hpi-swfl-summary` fragment)
4. `fhfaHpiSource` added to `PackDefinition.sources`
5. `corpusSummary` sets `lastFhfaSummary`
6. `outputProducer` emits `fhfa_naples_msa_yoy_pct` metric

- [ ] **Step 1: Update imports** (top of file, after existing imports)

```typescript
import {
  fhfaHpiSource,
  type HpiSwflSummary,
} from "../sources/fhfa-hpi-source.mts";
```

- [ ] **Step 2: Add module-level state variable**

After `let lastFetchedAt: string | null = null;` (around line 74), add:

```typescript
let lastFhfaSummary: HpiSwflSummary | null = null;
```

- [ ] **Step 3: Add `fhfaSummaryFrom()` helper**

Add after the `parcelsSummaryFrom()` function (around line 104):

```typescript
function fhfaSummaryFrom(fragments: RawFragment[]): HpiSwflSummary | null {
  for (const f of fragments) {
    const n = f.normalized as unknown as HpiSwflSummary;
    if (n?.kind === "hpi-swfl-summary") return n;
  }
  return null;
}
```

- [ ] **Step 4: Set `lastFhfaSummary` in `collierCorpusSummary()`**

In `collierCorpusSummary()`, after the line that sets `lastFetchedAt` (around line 193):

```typescript
  lastFetchedAt = allFragments[0]?.fetched_at ?? null;
  lastFhfaSummary = fhfaSummaryFrom(allFragments);  // ← add this line
```

- [ ] **Step 5: Add Naples MSA fact in `collierCorpusSummary()`**

After the `agg.totalParcels > 0` fact block (around line 259, just before `return facts;`), add:

```typescript
  const fhfa = lastFhfaSummary;
  if (fhfa?.naples_msa) {
    const msa = fhfa.naples_msa;
    facts.push({
      topic: "metric:fhfa_naples_msa_yoy",
      fact: `FHFA Naples-Marco Island MSA HPI YoY (${msa.latest_period})`,
      value:
        `Index (NSA): ${msa.index_nsa ?? "n/a"}. ` +
        `YoY: ${msa.yoy_change_pct != null ? `${msa.yoy_change_pct > 0 ? "+" : ""}${msa.yoy_change_pct}%` : "n/a"}. ` +
        `QoQ: ${msa.qoq_change_pct != null ? `${msa.qoq_change_pct > 0 ? "+" : ""}${msa.qoq_change_pct}%` : "n/a"}. ` +
        `Federal HPI benchmark for Collier County market price direction (purchase-only, traditional, quarterly).`,
      source_fragment_ids: [],
    });
  }
```

- [ ] **Step 6: Emit `fhfa_naples_msa_yoy_pct` metric in `collierOutputProducer()`**

After the parcel-grain metrics block (around line 394, just before the `const direction = directionFromZScore(agg.zScore);` line), add:

```typescript
  const fhfa = lastFhfaSummary;
  const fhfaCitationBase =
    env.source === "live"
      ? "FHFA House Price Index via data_lake.fhfa_hpi (purchase-only, traditional, quarterly)"
      : "FHFA House Price Index (fixture)";

  if (fhfa?.naples_msa) {
    const msa = fhfa.naples_msa;
    key_metrics.push({
      metric: "fhfa_naples_msa_yoy_pct",
      value: msa.yoy_change_pct ?? 0,
      direction:
        msa.yoy_change_pct == null
          ? "stable"
          : msa.yoy_change_pct > 0
            ? "rising"
            : "falling",
      label: `FHFA Naples-Marco Island MSA HPI YoY (${msa.latest_period}) — Collier County price-level proxy`,
      variable_type: "intensive",
      units: "percent",
      display_format: "percent",
      source: {
        url: "https://www.fhfa.gov/hpi/download/monthly/hpi_master.json",
        fetched_at,
        tier: 1,
        citation: fhfaCitationBase,
      },
    });
  }
```

- [ ] **Step 7: Add `fhfaHpiSource` to `PackDefinition.sources`**

In the `propertiesCollierValue` definition (around line 463):

```typescript
  sources: [collierMarketSource, collierParcelsSource, fhfaHpiSource],
```

- [ ] **Step 8: Verify typecheck**

```bash
bun tsc --noEmit -p refinery/tsconfig.json 2>&1 | grep "properties-collier-value" | head -20
```

Expected: no new errors on `properties-collier-value.mts`.

- [ ] **Step 9: Commit**

```bash
git add refinery/packs/properties-collier-value.mts
git commit -m "feat(collier): wire fhfaHpiSource + emit fhfa_naples_msa_yoy_pct metric"
```

---

## Task 5 — Update pack tests

**Files:**
- Modify: `refinery/packs/properties-collier-value.test.mts`

Two tests need updates after adding `fhfaHpiSource` to `sources`:
1. `sources.length` assertion: `2` → `3`, plus a new assertion for the fhfa source
2. Round-trip test: include `fhfaHpiSource.fetch()` in `allFragments`, assert `fhfa_naples_msa_yoy_pct` appears in metrics

- [ ] **Step 1: Write the failing tests first**

Add these two test additions to `properties-collier-value.test.mts`. Run **before** the fix to confirm they fail.

**Update the sources test** (find the existing test around line 45):

```typescript
test("propertiesCollierValue pack: Redfin + FDOR parcel + FHFA sources wired", () => {
  assert.equal(propertiesCollierValue.sources.length, 3);
  const redfin = propertiesCollierValue.sources.find(
    (s) => s.source_id === "redfin_collier_market",
  );
  assert.ok(redfin, "redfin_collier_market source must be wired");
  assert.equal(redfin!.trust_tier, 2);
  const parcels = propertiesCollierValue.sources.find(
    (s) => s.source_id === "collier_parcels_fdor",
  );
  assert.ok(parcels, "collier_parcels_fdor source must be wired");
  assert.equal(parcels!.trust_tier, 2);
  const fhfa = propertiesCollierValue.sources.find(
    (s) => s.source_id === "fhfa_hpi",
  );
  assert.ok(fhfa, "fhfa_hpi source must be wired");
  assert.equal(fhfa!.trust_tier, 1);
});
```

**Update the round-trip test** — in the existing `"fixture round-trip produces expected metrics"` test (around line 59), update the fragment fetch and add the FHFA assertion:

```typescript
test("propertiesCollierValue pack: fixture round-trip produces expected metrics", async () => {
  const { collierMarketSource } =
    await import("../sources/collier-market-source.mts");
  const { collierParcelsSource } =
    await import("../sources/collier-parcels-source.mts");
  const { fhfaHpiSource } =
    await import("../sources/fhfa-hpi-source.mts");
  const allFragments = [
    ...(await collierMarketSource.fetch()),
    ...(await collierParcelsSource.fetch()),
    ...(await fhfaHpiSource.fetch()),
  ];

  // ... (keep all existing assertions unchanged) ...

  // After the existing metricNames assertions, add:
  assert.ok(
    metricNames.includes("fhfa_naples_msa_yoy_pct"),
    "fhfa_naples_msa_yoy_pct metric must appear when FHFA fixture has Naples rows",
  );

  const naplesMsaMetric = result.key_metrics.find(
    (m) => m.metric === "fhfa_naples_msa_yoy_pct",
  );
  assert.ok(naplesMsaMetric, "Naples MSA HPI metric must exist");
  assert.equal(naplesMsaMetric!.value, 1.41, "Naples MSA YoY must be +1.41% from fixture");
  assert.equal(naplesMsaMetric!.direction, "rising", "Naples MSA rising (positive YoY)");
  assert.equal(naplesMsaMetric!.units, "percent");
  assert.equal(naplesMsaMetric!.display_format, "percent");
});
```

- [ ] **Step 2: Run tests to confirm current failures**

```bash
bun test refinery/packs/properties-collier-value.test.mts 2>&1 | tail -20
```

Expected: 2 failures — the sources.length test and the `fhfa_naples_msa_yoy_pct` assertion in the round-trip test.

(If the tests already pass, the pack wiring in Task 4 is complete and this step is a green run — that's fine.)

- [ ] **Step 3: Apply full updated test file**

Replace the **sources wired** test (lines 45–57) with the version from Step 1.

Replace the **round-trip test** (lines 59–158) with the updated version: add the `fhfaHpiSource` import + fetch, keep all existing assertions, add the Naples MSA assertions at the end of the metric assertions block.

- [ ] **Step 4: Run tests to confirm they pass**

```bash
bun test refinery/packs/properties-collier-value.test.mts
```

Expected: all tests pass (green). Count should be previous count + 0 new tests (the sources test is an edit, not a new test; the round-trip test gains 3 new assertions but stays as one `test()` call).

- [ ] **Step 5: Run vocab coverage check to confirm no orphan slugs**

```bash
bun refinery/tools/check-vocab-coverage.mts --all 2>&1 | tail -10
```

Expected: exit 0. `fhfa_naples_msa_yoy_pct` is now emitted by the pack AND registered in vocab — coverage should be clean.

- [ ] **Step 6: Commit**

```bash
git add refinery/packs/properties-collier-value.test.mts
git commit -m "test(collier): add fhfa_naples_msa_yoy_pct fixture round-trip coverage"
```

---

## Task 6 — Update city matrix + push to Supabase

**Files:**
- Modify: `scripts/write_ops_cities.py`

Five Collier cities currently have `fhfa_hpi:"gap"`. With the pack wired, the data is now available — flip to `"partial"` (not `"live"` because the MSA-grain HPI is one step removed from a city-grain read; "partial" correctly signals that Naples-Marco Island MSA covers these cities but is not city-specific).

Update the `needs` array for each city to remove the "NOT ingested" language and replace with a reference to the new metric.

- [ ] **Step 1: Edit `scripts/write_ops_cities.py` — naples**

Find the Naples entry (around line 175). Change:

```python
      fhfa_hpi:"gap",
```
→
```python
      fhfa_hpi:"partial",
```

And update the FHFA need string:
```python
      "FHFA HPI: only Cape Coral-Fort Myers MSA is in the lake. Naples-Marco Island MSA HPI is NOT ingested. Source: FRED series ATNHPIUS34940Q. Wire via existing FHFA/FRED pipeline.",
```
→
```python
      "FHFA HPI partial: Naples-Marco Island MSA HPI wired via properties-collier-value (fhfa_naples_msa_yoy_pct). MSA-grain — covers all Collier cities but is not Naples-specific.",
```

- [ ] **Step 2: Edit — marco-island** (around line 195)

Change `fhfa_hpi:"gap"` → `fhfa_hpi:"partial"`.

Update the FHFA need string:
```python
      "FHFA HPI: Naples-Marco Island MSA not in lake. See Naples needs above.",
```
→
```python
      "FHFA HPI partial: Naples-Marco Island MSA HPI wired (fhfa_naples_msa_yoy_pct). Marco Island is in this MSA — coverage is MSA-grain, not island-specific.",
```

- [ ] **Step 3: Edit — east-naples** (around line 210)

Change `fhfa_hpi:"gap"` → `fhfa_hpi:"partial"`.

Update:
```python
      "FHFA HPI: Naples-Marco Island MSA not in lake.",
```
→
```python
      "FHFA HPI partial: Naples-Marco Island MSA HPI wired (fhfa_naples_msa_yoy_pct). MSA-grain proxy.",
```

- [ ] **Step 4: Edit — north-naples** (around line 225)

Change `fhfa_hpi:"gap"` → `fhfa_hpi:"partial"`.

Update:
```python
      "FHFA HPI: Naples-Marco Island MSA not in lake.",
```
→
```python
      "FHFA HPI partial: Naples-Marco Island MSA HPI wired (fhfa_naples_msa_yoy_pct). MSA-grain proxy.",
```

- [ ] **Step 5: Edit — golden-gate** (around line 240)

Change `fhfa_hpi:"gap"` → `fhfa_hpi:"partial"`.

Update:
```python
      "FHFA HPI: Naples-Marco Island MSA not in lake.",
```
→
```python
      "FHFA HPI partial: Naples-Marco Island MSA HPI wired (fhfa_naples_msa_yoy_pct). MSA-grain proxy.",
```

- [ ] **Step 6: Verify the 5 changes before running**

```bash
python -c "
import re, ast
src = open('scripts/write_ops_cities.py').read()
gaps = src.count('fhfa_hpi:\"gap\"')
partials = src.count('fhfa_hpi:\"partial\"')
print(f'fhfa_hpi:gap remaining: {gaps}')
print(f'fhfa_hpi:partial count: {partials}')
"
```

Expected: `fhfa_hpi:gap remaining: 0`, `fhfa_hpi:partial count: 5` (plus any existing partials from other cities).

- [ ] **Step 7: Run the city matrix script**

```bash
python scripts/write_ops_cities.py
```

Expected: script runs without errors, upserts city matrix rows to Supabase. Watch for any Postgres/Supabase connection errors.

- [ ] **Step 8: Commit**

```bash
git add scripts/write_ops_cities.py
git commit -m "feat(city-matrix): flip 5 Collier cities fhfa_hpi gap→partial (naples msa wired)"
```

---

## Task 7 — Final verification sweep

- [ ] **Step 1: Run full Collier pack test suite**

```bash
bun test refinery/packs/properties-collier-value.test.mts
```

Expected: all green.

- [ ] **Step 2: Run vocab coverage check**

```bash
bun refinery/tools/check-vocab-coverage.mts --all 2>&1 | tail -10
```

Expected: exit 0, no orphans.

- [ ] **Step 3: Typecheck**

```bash
bun tsc --noEmit -p refinery/tsconfig.json 2>&1 | grep -v "^$" | wc -l
```

Run this **before** your changes to get the baseline count, then after to confirm the count hasn't increased. (The ~18 pre-existing baseline errors are known debt — new errors are the signal.)

- [ ] **Step 4: SESSION_LOG + safe-push**

Write a SESSION_LOG.md entry at the top of the file covering:
- `fhfa-hpi-source.mts`: `naples_msa` added to `HpiSwflSummary`; `buildSwflSummary()` wired
- `properties-collier-value.mts`: `fhfaHpiSource` added; `fhfa_naples_msa_yoy_pct` emitted
- `brain-vocabulary.json`: concept + slug_index for `fhfa_naples_msa_yoy_pct`
- city matrix: 5 Collier cities flipped `gap`→`partial`

Then push:

```bash
node scripts/safe-push.mjs
```

---

## Self-Review

**Spec coverage:**
- ✅ Wire FRED series (confirmed: data already in lake via FHFA master JSON; computation layer wired) — Tasks 1–2
- ✅ Add new slug to vocab — Task 3
- ✅ Wire into brain pack (properties-collier-value) — Task 4
- ✅ Update city matrix for 5 Collier cities — Task 6
- ✅ Tests updated — Task 5

**Placeholders:** None — all code blocks are complete and use actual values.

**Type consistency:** `fhfa_naples_msa_yoy_pct` slug is used consistently in vocab concept ID, `raw_slugs`, slug_index key, and `metric:` field in the pack output. `HpiSwflSummary.naples_msa` field shape matches `cape_coral_msa` exactly (same 4-field struct). `fhfaSummaryFrom()` is defined in Task 4 Step 3 before it is called in Steps 4–6.
