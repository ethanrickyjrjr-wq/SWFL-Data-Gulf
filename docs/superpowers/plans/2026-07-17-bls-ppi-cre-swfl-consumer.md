# BLS PPI → cre-swfl Construction-Cost Consumer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** ⚡ Sonnet — 9 files, keywords: schema, architecture

**Goal:** Broaden the `bls_ppi` ingest from 2 to 12 series (the full BLS PPI "Nonresidential Building Construction" sector), and wire 8 of those 12 series into `cre-swfl` as named, per-sector construction-cost metrics — closing the `consuming_pack: none` gap on a source that's been landing since 2026-05-27.

**Architecture:** A new Tier-1 DuckDB source connector (`refinery/sources/bls-ppi-source.mts`, modeled on `faf5-source.mts` for the Parquet-glob read and `macro-us-source.mts` for the direction-computation + fixture/live duality) reads `lake-tier1/macro/bls_ppi/*.parquet`, dedupes overlapping monthly snapshots, and normalizes each series to its latest reading + trend direction. `cre-swfl.mts` adds this as a new source, stashes the normalized indicators in closure state (same pattern as its existing MarketBeat/permits/corridor-pulse stashes), and emits 8 named `key_metrics` — one per series that maps onto an existing cre-swfl sector or trade-cost category. 4 series (236222 school, 236400/236500/2381MR aggregates) are ingested but deliberately not surfaced.

**Tech Stack:** Python (dlt ingest, unchanged pipeline shape, broadened `SERIES_IDS`), TypeScript (`refinery/` — DuckDB-over-Parquet source connector, `bun:test`), YAML (`cadence_registry.yaml`), JSON (`brain-vocabulary.json`).

## Global Constraints

- **RULE 0.5 (probe first):** every file this plan touches has already been read in full for this plan — no step below introduces an unverified assumption about existing code shape.
- **RULE 0.4 (research first):** all 12 series IDs are live-verified against `data.bls.gov`/`download.bls.gov` as of 07/17/2026 (see `docs/superpowers/specs/2026-07-17-bls-ppi-cre-swfl-consumer-design.md`) — no hand-typed ID goes in uncross-checked.
- **Thin pipe / zero cross-sector blending (`refinery/packs/CLAUDE.md`):** each BLS series ships as its own named `key_metric` — never averaged or blended with another series, matching cre-swfl's existing MarketBeat per-sector discipline.
- **Vocab-same-commit gate (Gate 2):** every new slug `cre-swfl` can emit must land in `brain-vocabulary.json` in the SAME commit as the pack change — Task 3 ships the pack wiring and the vocab entries together, not split across commits.
- **Pack ⇆ catalog gate (Gate 5):** any commit touching `refinery/packs/**` runs the `catalog.test.mts` mirror + `cre-swfl`'s own `bun:test`. `catalog.mts`'s `cre-swfl` entry mirrors only `id`/`domain`/`scope`/`ttl_seconds` — none of those fields change in this plan, so `catalog.mts` needs no edit (verified against `refinery/packs/catalog.mts:175-180` and `catalog.test.mts`'s field-diff assertion).
- **No invented numbers:** every fixture value is clearly synthetic (matches the existing `macro-us.sample.json` convention of a `__meta.note` disclosure) — never presented as a real BLS reading.
- **Money code = 12 series, 8 surfaced.** Do not silently surface 236222/236400/236500/2381MR — they are pulled for ingest completeness only, per the approved design doc.

---

### Task 1: Broaden BLS PPI ingest scope (Python)

**Files:**
- Modify: `ingest/pipelines/bls_ppi/constants.py`
- Modify: `ingest/tests/pipelines/bls_ppi/test_dry_run.py`
- Modify: `ingest/cadence_registry.yaml:518-542` (the `bls_ppi` entry)

**Interfaces:**
- Consumes: nothing new.
- Produces: `SERIES_IDS: list[str]` (12 entries) — consumed downstream by `ingest/pipelines/bls_ppi/resources.py::fetch_bls_ppi` (unchanged, already reads the module-level `SERIES_IDS`).

- [ ] **Step 1: Write the failing test — outgoing POST payload carries all 12 series**

Add to `ingest/tests/pipelines/bls_ppi/test_dry_run.py` (append after the existing `test_dry_run_skips_upload`, and add `import json` at the top of the file alongside the existing `from unittest.mock import MagicMock, patch`):

```python
import json
from unittest.mock import MagicMock, patch


def _fake_bls_response():
    m = MagicMock()
    m.raise_for_status.return_value = None
    m.json.return_value = {
        "status": "REQUEST_SUCCEEDED",
        "Results": {
            "series": [
                {
                    "seriesID": "PCU236221236221",
                    "data": [
                        {"year": "2024", "period": "M04", "periodName": "April", "value": "239.2"},
                    ],
                },
                {
                    "seriesID": "PCU236211236211",
                    "data": [
                        {"year": "2024", "period": "M04", "periodName": "April", "value": "200.5"},
                    ],
                },
            ]
        },
    }
    return m


def test_dry_run_skips_upload():
    with (
        patch("requests.post", return_value=_fake_bls_response()),
        patch("ingest.pipelines.bls_ppi.pipeline.upload_parquet") as mock_upload,
        patch("ingest.pipelines.bls_ppi.pipeline.upsert_inventory_row") as mock_inv,
    ):
        import importlib
        import ingest.pipelines.bls_ppi.pipeline as mod
        importlib.reload(mod)
        result = mod.main(["--dry-run"])

    assert result == 0
    mock_upload.assert_not_called()
    mock_inv.assert_not_called()


def test_fetch_sends_all_scoped_series():
    from ingest.pipelines.bls_ppi.constants import SERIES_IDS

    captured = {}

    def _capture_post(url, data=None, headers=None, timeout=None):
        captured["payload"] = json.loads(data)
        return _fake_bls_response()

    with patch("requests.post", side_effect=_capture_post):
        from ingest.pipelines.bls_ppi.resources import fetch_bls_ppi

        fetch_bls_ppi()

    assert captured["payload"]["seriesid"] == SERIES_IDS
    assert len(SERIES_IDS) == 12
    assert captured["payload"]["seriesid"][0] == "PCU236211236211"
    assert captured["payload"]["seriesid"][1] == "PCU236221236221"
```

(The existing `_fake_bls_response`/`test_dry_run_skips_upload` are reproduced verbatim above only so the file reads as one coherent block — they are unchanged from what's already on disk; the new content is the `import json` line and the `test_fetch_sends_all_scoped_series` function.)

- [ ] **Step 2: Run the new test to verify it fails**

Run: `pytest ingest/tests/pipelines/bls_ppi/test_dry_run.py::test_fetch_sends_all_scoped_series -v`
Expected: FAIL — `assert captured["payload"]["seriesid"] == SERIES_IDS` fails because `SERIES_IDS` still has 2 entries and no length-12 assertion holds. (If it errors on import instead, that's also an acceptable "fails for the right reason" — the goal is proving the test exercises the not-yet-broadened list.)

- [ ] **Step 3: Broaden `SERIES_IDS` to the full 12-series scope**

Replace the full contents of `ingest/pipelines/bls_ppi/constants.py`:

```python
"""Constants for bls_ppi pipeline."""
from datetime import datetime

# Full "Nonresidential Building Construction" sector (NAICS 236 subset — BLS's own
# NRBC initiative grouping). Verified live 07/17/2026 against
# download.bls.gov/pub/time.series/pc/pc.industry (industry code + title list) and
# individually re-confirmed at data.bls.gov/timeseries/<id> for the 3 non-obvious
# ids (236400, 236500, 2381MR) whose "Series Title" field was cross-checked before
# adding. Broadened from the original 2 (236211, 236221) per
# docs/superpowers/specs/2026-07-17-bls-ppi-cre-swfl-consumer-design.md — that doc
# also confirms NO residential-construction PPI series exists at BLS (no NAICS
# 2361xx entries anywhere in the industry list); the old "residential" label on
# the original 2 series was simply wrong, not a wrong-series mixup.
SERIES_IDS = [
    "PCU236211236211",  # New industrial building construction
    "PCU236221236221",  # New warehouse building construction
    "PCU236222236222",  # New school building construction
    "PCU236223236223",  # New office building construction
    "PCU236224236224",  # New health care building construction
    "PCU23811X23811X",  # Concrete contractors, nonresidential building work
    "PCU23816X23816X",  # Roofing contractors, nonresidential building work
    "PCU23821X23821X",  # Electrical contractors, nonresidential building work
    "PCU23822X23822X",  # Plumbing/HVAC contractors, nonresidential building work
    "PCU236400236400",  # New nonres. building construction by contractor type/region
    "PCU236500236500",  # New nonres. building construction by region
    "PCU2381MR2381MR",  # Nonresidential building maintenance & repair
]

# Why 10y: BLS POST caps at 20 years; match FRED G.17 / Census VIP 10-year window.
def current_year_window() -> tuple[str, str]:
    now = datetime.now()
    return str(now.year - 9), str(now.year)

SOURCE_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/"
BUCKET = "lake-tier1"
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pytest ingest/tests/pipelines/bls_ppi/ -v`
Expected: `test_dry_run_skips_upload PASSED`, `test_fetch_sends_all_scoped_series PASSED` (2 passed).

- [ ] **Step 5: Update `ingest/cadence_registry.yaml`'s `bls_ppi` entry**

Replace the existing `bls_ppi` block (currently `ingest/cadence_registry.yaml:518-542`, spanning from `- name: bls_ppi` through the `source_label:` line just before `- name: bls_oews_swfl_tier1`) with:

```yaml
  - name: bls_ppi
    workflow: ingest-bls-ppi.yml
    consuming_pack: cre-swfl
    lane: tier-1
    cadence_days: 30
    tolerance_multiplier: 2.0
    inventory_id: lake-tier1/macro/bls_ppi/
    inventory_key_type: prefix
    # First run: 2026-05-27 (workflow_dispatch) ✓
    # Broadened 2 -> 12 series 07/17/2026 (full "Nonresidential Building
    # Construction" sector, NAICS 236 subset) — see docs/superpowers/specs/
    # 2026-07-17-bls-ppi-cre-swfl-consumer-design.md. cre-swfl consumes 8 of the
    # 12: industrial/warehouse/office/health-care building-type indexes plus the
    # 4 nonresidential trade-contractor indexes (concrete/roofing/electrical/
    # plumbing-HVAC). 236222 (school) is ingested but deliberately NOT consumed —
    # no existing pack owns institutional/public construction; tracked via check
    # bls_ppi_school_series_no_consumer. 236400/236500/2381MR are aggregate
    # rollups of series already shown individually and are not separately
    # surfaced (would double-count against their own components).
    source_scope:
      confirmed_total:
        summary: "12 PPI industry series, 10-year rolling monthly index — full 'Nonresidential Building Construction' sector (NAICS 236 subset). 8 consumed by cre-swfl; 236222 (school) ingested but unconsumed; 236400/236500/2381MR are aggregate rollups, not separately surfaced."
        source: "our ingest"
      source_ceiling:
        summary: "Adjacent BLS systems verified live but not pulled: Final Demand Construction composite (WPUFD43/WPUFD431/WPUFD432, FD-ID commodity aggregation system) and Materials & Components for Construction input-cost index (WPUID612/WPUID6121/WPUID6122, intermediate-demand commodity system). Different survey/series-id scheme from the NAICS-236 industry data above — flagged as a future extension, not pulled this build. Confirmed: no BLS PPI series exists for residential building construction (no NAICS 2361xx entries anywhere in the industry list) — a real gap in BLS's own coverage, not a gap in our ingest."
        as_of: "07/17/2026"
        source_url: "https://www.bls.gov/ppi/factsheets/"
        source_label: "BLS Producer Price Index — Industry Factsheets"
```

- [ ] **Step 6: Verify the YAML still parses**

Run: `node -e "const yaml=require('js-yaml'); const fs=require('fs'); yaml.load(fs.readFileSync('ingest/cadence_registry.yaml','utf-8')); console.log('cadence_registry.yaml: OK')"`
Expected: `cadence_registry.yaml: OK` (no exception).

- [ ] **Step 7: Commit**

```bash
git add ingest/pipelines/bls_ppi/constants.py ingest/tests/pipelines/bls_ppi/test_dry_run.py ingest/cadence_registry.yaml
git commit -m "feat(ingest): broaden bls_ppi to full 12-series Nonresidential Building Construction scope

Live-verified 07/17/2026 against BLS's own industry code list + Industry
Factsheets. Confirms no residential-construction PPI series exists at BLS at
all (not just a wrong-series mixup on the old 'residential' label)."
```

---

### Task 2: BLS PPI Tier-1 source connector (TypeScript)

**Files:**
- Create: `refinery/sources/bls-ppi-source.mts`
- Create: `refinery/__fixtures__/bls-ppi.sample.json`
- Create: `refinery/sources/bls-ppi-source.test.mts`

**Interfaces:**
- Consumes: `makeDuckDBSource` from `./duckdb-source.mts` (`refinery/sources/duckdb-source.mts:285`), `fragmentId` from `../lib/ids.mts`, `expiresDate` from `../lib/dates.mts`.
- Produces: `blsPpiSource: SourceConnector` and `type BlsPpiNormalized` — both consumed by Task 3's `cre-swfl.mts` edit. `BlsPpiNormalized` shape: `{ kind: "bls-ppi-index"; series_id: string; label: string; value: number; period: string; direction: "rising" | "falling" | "stable" }`.

- [ ] **Step 1: Write the fixture**

Create `refinery/__fixtures__/bls-ppi.sample.json`:

```json
[
  { "series_id": "PCU236211236211", "year": 2026, "period": "M04", "period_name": "April", "value": 195.0 },
  { "series_id": "PCU236211236211", "year": 2026, "period": "M05", "period_name": "May", "value": 200.0 },
  { "series_id": "PCU236211236211", "year": 2026, "period": "M06", "period_name": "June", "value": 205.0 },

  { "series_id": "PCU236221236221", "year": 2026, "period": "M04", "period_name": "April", "value": 215.0 },
  { "series_id": "PCU236221236221", "year": 2026, "period": "M05", "period_name": "May", "value": 210.0 },
  { "series_id": "PCU236221236221", "year": 2026, "period": "M06", "period_name": "June", "value": 205.0 },

  { "series_id": "PCU236223236223", "year": 2026, "period": "M04", "period_name": "April", "value": 190.0 },
  { "series_id": "PCU236223236223", "year": 2026, "period": "M05", "period_name": "May", "value": 190.5 },
  { "series_id": "PCU236223236223", "year": 2026, "period": "M06", "period_name": "June", "value": 191.0 },

  { "series_id": "PCU236224236224", "year": 2026, "period": "M04", "period_name": "April", "value": 220.0 },
  { "series_id": "PCU236224236224", "year": 2026, "period": "M05", "period_name": "May", "value": 226.0 },
  { "series_id": "PCU236224236224", "year": 2026, "period": "M06", "period_name": "June", "value": 232.0 },

  { "series_id": "PCU23811X23811X", "year": 2026, "period": "M04", "period_name": "April", "value": 180.0 },
  { "series_id": "PCU23811X23811X", "year": 2026, "period": "M05", "period_name": "May", "value": 183.0 },
  { "series_id": "PCU23811X23811X", "year": 2026, "period": "M06", "period_name": "June", "value": 186.0 },

  { "series_id": "PCU23816X23816X", "year": 2026, "period": "M04", "period_name": "April", "value": 175.0 },
  { "series_id": "PCU23816X23816X", "year": 2026, "period": "M05", "period_name": "May", "value": 172.0 },
  { "series_id": "PCU23816X23816X", "year": 2026, "period": "M06", "period_name": "June", "value": 169.0 },

  { "series_id": "PCU23821X23821X", "year": 2026, "period": "M04", "period_name": "April", "value": 160.0 },
  { "series_id": "PCU23821X23821X", "year": 2026, "period": "M05", "period_name": "May", "value": 160.5 },
  { "series_id": "PCU23821X23821X", "year": 2026, "period": "M06", "period_name": "June", "value": 161.0 },

  { "series_id": "PCU23822X23822X", "year": 2026, "period": "M04", "period_name": "April", "value": 165.0 },
  { "series_id": "PCU23822X23822X", "year": 2026, "period": "M05", "period_name": "May", "value": 168.0 },
  { "series_id": "PCU23822X23822X", "year": 2026, "period": "M06", "period_name": "June", "value": 171.0 },

  { "series_id": "PCU236222236222", "year": 2026, "period": "M06", "period_name": "June", "value": 198.0 },
  { "series_id": "PCU236400236400", "year": 2026, "period": "M06", "period_name": "June", "value": 200.0 },
  { "series_id": "PCU236500236500", "year": 2026, "period": "M06", "period_name": "June", "value": 199.0 },
  { "series_id": "PCU2381MR2381MR", "year": 2026, "period": "M06", "period_name": "June", "value": 205.0 }
]
```

This is a synthetic fixture (same convention as `macro-us.sample.json`) — NOT real BLS readings. `makeDuckDBSource`'s fixture loader requires a top-level JSON array shaped like the live query's output columns (`series_id`, `year`, `period`, `period_name`, `value`) — no `__meta`/`rows` wrapper, unlike `macroUsSource`'s own hand-rolled fixture loader.

- [ ] **Step 2: Write the failing source test**

Create `refinery/sources/bls-ppi-source.test.mts`:

```typescript
import { test } from "bun:test";
import assert from "node:assert/strict";

// Set fixture mode before any source import so env.source resolves correctly.
process.env["REFINERY_SOURCE"] = "fixture";

const { blsPpiSource } = await import("./bls-ppi-source.mts");

test("fixture mode returns 12 fragments (one per scoped series)", async () => {
  const fragments = await blsPpiSource.fetch();
  assert.equal(fragments.length, 12);
});

test("every fragment has kind = bls-ppi-index", async () => {
  const fragments = await blsPpiSource.fetch();
  for (const f of fragments) {
    const n = f.normalized as { kind: string };
    assert.equal(n.kind, "bls-ppi-index");
  }
});

test("236211 (industrial) resolves to latest value 205 with rising direction", async () => {
  const fragments = await blsPpiSource.fetch();
  const n = fragments.find(
    (f) => (f.normalized as { series_id: string }).series_id === "PCU236211236211",
  )!.normalized as { value: number; direction: string; period: string };
  assert.equal(n.value, 205);
  assert.equal(n.direction, "rising");
  assert.equal(n.period, "2026-06");
});

test("236221 (warehouse) resolves to latest value 205 with falling direction", async () => {
  const fragments = await blsPpiSource.fetch();
  const n = fragments.find(
    (f) => (f.normalized as { series_id: string }).series_id === "PCU236221236221",
  )!.normalized as { value: number; direction: string };
  assert.equal(n.value, 205);
  assert.equal(n.direction, "falling");
});

test("236223 (office) resolves to stable direction under the 2% threshold", async () => {
  const fragments = await blsPpiSource.fetch();
  const n = fragments.find(
    (f) => (f.normalized as { series_id: string }).series_id === "PCU236223236223",
  )!.normalized as { direction: string };
  assert.equal(n.direction, "stable");
});

test("236222 (school, single-row series) still normalizes with stable direction (< 2 observations)", async () => {
  const fragments = await blsPpiSource.fetch();
  const n = fragments.find(
    (f) => (f.normalized as { series_id: string }).series_id === "PCU236222236222",
  )!.normalized as { value: number; direction: string };
  assert.equal(n.value, 198);
  assert.equal(n.direction, "stable");
});

test("fragment_ids are unique", async () => {
  const fragments = await blsPpiSource.fetch();
  const ids = fragments.map((f) => f.fragment_id);
  assert.equal(new Set(ids).size, ids.length);
});

test("citationMeta returns source naming BLS PPI", () => {
  const meta = blsPpiSource.citationMeta("2026-07-17", 2592000);
  assert.ok(meta.source.includes("BLS Producer Price Index"));
  assert.equal(typeof meta.verified, "string");
  assert.equal(typeof meta.expires, "string");
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun test refinery/sources/bls-ppi-source.test.mts`
Expected: FAIL with a module-resolution error — `./bls-ppi-source.mts` does not exist yet.

- [ ] **Step 4: Implement the source connector**

Create `refinery/sources/bls-ppi-source.mts`:

```typescript
import path from "node:path";
import { makeDuckDBSource } from "./duckdb-source.mts";
import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { fragmentId } from "../lib/ids.mts";
import { expiresDate } from "../lib/dates.mts";

/**
 * bls-ppi source connector — BLS Producer Price Index, "Nonresidential
 * Building Construction" sector (NAICS 236 subset). Cold Lane edition, same
 * shape as faf5-source.mts: DuckDB reads Parquet directly from lake-tier1,
 * no external API call from refinery (the Python ingest already owns that).
 *
 * `ingest/pipelines/bls_ppi/pipeline.py` writes a NEW file every monthly run
 * (`macro/bls_ppi/{YYYY-MM}.parquet`), and each run re-fetches the FULL
 * 10-year window — so multiple monthly files overlap on (series_id, year,
 * period). The query below collapses that with GROUP BY + MAX(value); BLS can
 * revise a recent observation within ~30 days, so MAX is a deterministic,
 * documented tie-break, not a claim of "always latest".
 *
 * 12 series ingested; this connector normalizes all 12 (cre-swfl.mts decides
 * which 8 to surface — see BLS_PPI_METRIC_MAP there. 236222/236400/236500/
 * 2381MR normalize here like everything else; cre-swfl simply doesn't map
 * them to a key_metric).
 *
 * Trust tier: 1 (BLS is a primary federal source, same tier as FRED in
 * macro-us-source.mts).
 */

const SOURCE_ID = "bls_ppi_construction";
const BUCKET = "lake-tier1";

const FIXTURE_PATH = path.join(
  process.cwd(),
  "refinery",
  "__fixtures__",
  "bls-ppi.sample.json",
);

export interface BlsPpiSeriesSpec {
  series_id: string;
  naics: string;
  label: string;
}

// Live-verified 07/17/2026 against download.bls.gov/pub/time.series/pc/pc.industry
// + data.bls.gov/timeseries/<id> — see docs/superpowers/specs/
// 2026-07-17-bls-ppi-cre-swfl-consumer-design.md for the verification trail.
export const BLS_PPI_SERIES: BlsPpiSeriesSpec[] = [
  { series_id: "PCU236211236211", naics: "236211", label: "New industrial building construction" },
  { series_id: "PCU236221236221", naics: "236221", label: "New warehouse building construction" },
  { series_id: "PCU236222236222", naics: "236222", label: "New school building construction" },
  { series_id: "PCU236223236223", naics: "236223", label: "New office building construction" },
  { series_id: "PCU236224236224", naics: "236224", label: "New health care building construction" },
  { series_id: "PCU23811X23811X", naics: "23811X", label: "Concrete contractors, nonresidential building work" },
  { series_id: "PCU23816X23816X", naics: "23816X", label: "Roofing contractors, nonresidential building work" },
  { series_id: "PCU23821X23821X", naics: "23821X", label: "Electrical contractors, nonresidential building work" },
  { series_id: "PCU23822X23822X", naics: "23822X", label: "Plumbing/HVAC contractors, nonresidential building work" },
  { series_id: "PCU236400236400", naics: "236400", label: "New nonresidential building construction by contractor type/region" },
  { series_id: "PCU236500236500", naics: "236500", label: "New nonresidential building construction by region" },
  { series_id: "PCU2381MR2381MR", naics: "2381MR", label: "Nonresidential building maintenance & repair" },
];

/** Normalized BLS PPI indicator — what Stage 2 / Stage 3 see. */
export interface BlsPpiNormalized {
  kind: "bls-ppi-index";
  series_id: string;
  label: string;
  value: number;
  /** "YYYY-MM" of the latest observation. */
  period: string;
  direction: "rising" | "falling" | "stable";
}

interface BlsPpiRow {
  series_id: string;
  year: number;
  period: string;
  period_name: string;
  value: number;
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Sortable rank for (year, "M06")-style BLS periods — higher = more recent. */
function periodRank(year: number, period: string): number {
  const m = parseInt(period.replace(/^M/, ""), 10);
  return year * 100 + (Number.isFinite(m) ? m : 0);
}

/** Same threshold convention as macro-us-source.mts::computeDirection. */
function computeDirection(sortedDesc: BlsPpiRow[]): BlsPpiNormalized["direction"] {
  if (sortedDesc.length < 2) return "stable";
  const latest = sortedDesc[0]!.value;
  const compareIdx = Math.min(sortedDesc.length - 1, 6);
  const prior = sortedDesc[compareIdx]!.value;
  if (!Number.isFinite(latest) || !Number.isFinite(prior) || prior === 0) {
    return "stable";
  }
  const relChange = (latest - prior) / Math.abs(prior);
  if (relChange > 0.02) return "rising";
  if (relChange < -0.02) return "falling";
  return "stable";
}

export const blsPpiSource: SourceConnector = makeDuckDBSource<BlsPpiRow>({
  source_id: SOURCE_ID,
  trust_tier: 1,
  parquetViews: [
    { name: "bls_ppi_raw", s3_url: `s3://${BUCKET}/macro/bls_ppi/*.parquet` },
  ],
  query: `
    SELECT series_id, year, period, period_name, MAX(value) AS value
    FROM bls_ppi_raw
    GROUP BY series_id, year, period, period_name
    ORDER BY series_id, year, period
  `,
  rowShape: (r) => ({
    series_id: String(r["series_id"] ?? ""),
    year: toNum(r["year"]),
    period: String(r["period"] ?? ""),
    period_name: String(r["period_name"] ?? ""),
    value: toNum(r["value"]),
  }),
  normalize: (rows, { fetched_at }): RawFragment[] => {
    const bySeries = new Map<string, BlsPpiRow[]>();
    for (const r of rows) {
      const bucket = bySeries.get(r.series_id) ?? [];
      bucket.push(r);
      bySeries.set(r.series_id, bucket);
    }
    const fragments: RawFragment[] = [];
    for (const spec of BLS_PPI_SERIES) {
      const seriesRows = bySeries.get(spec.series_id);
      if (!seriesRows || seriesRows.length === 0) continue;
      const sortedDesc = [...seriesRows].sort(
        (a, b) => periodRank(b.year, b.period) - periodRank(a.year, a.period),
      );
      const latest = sortedDesc[0]!;
      const normalized: BlsPpiNormalized = {
        kind: "bls-ppi-index",
        series_id: spec.series_id,
        label: spec.label,
        value: latest.value,
        period: `${latest.year}-${latest.period.replace(/^M/, "").padStart(2, "0")}`,
        direction: computeDirection(sortedDesc),
      };
      fragments.push({
        fragment_id: fragmentId(SOURCE_ID, spec.series_id),
        source_id: SOURCE_ID,
        source_trust_tier: 1,
        fetched_at,
        raw: { series_id: latest.series_id, year: latest.year, period: latest.period },
        normalized,
      });
    }
    return fragments;
  },
  citation: (verifiedDate, ttlSeconds): Omit<CitationRow, "id"> => ({
    source:
      "BLS Producer Price Index — Nonresidential Building Construction sector " +
      "(NAICS 236 industry data; monthly, not seasonally adjusted) — https://www.bls.gov/ppi/",
    verified: verifiedDate,
    expires: expiresDate(verifiedDate, ttlSeconds),
  }),
  fixturePath: FIXTURE_PATH,
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test refinery/sources/bls-ppi-source.test.mts`
Expected: all 8 tests PASS.

- [ ] **Step 6: Typecheck**

Run: `npm run refinery:typecheck`
Expected: clean (no new errors attributable to `bls-ppi-source.mts` or `bls-ppi-source.test.mts`).

- [ ] **Step 7: Commit**

```bash
git add refinery/sources/bls-ppi-source.mts refinery/__fixtures__/bls-ppi.sample.json refinery/sources/bls-ppi-source.test.mts
git commit -m "feat(refinery): add bls-ppi-source.mts Tier-1 DuckDB connector

Reads lake-tier1/macro/bls_ppi/*.parquet, dedupes overlapping monthly
snapshots (each ingest run re-fetches the full 10y window), normalizes all
12 scoped series with computed rising/falling/stable direction."
```

---

### Task 3: Wire cre-swfl to consume BLS PPI construction-cost metrics

This task ships the pack wiring, its tests, AND the vocab entries in ONE commit — the pre-push gate requires every new slug a pack can emit to be registered in `brain-vocabulary.json` in the same commit (Gate 2), and any commit touching `refinery/packs/**` runs `cre-swfl`'s own `bun:test` (Gate 5). Splitting this across commits would leave an intermediate commit unable to pass `node scripts/safe-push.mjs` cleanly.

**Files:**
- Modify: `refinery/packs/cre-swfl.mts` (closure state ~line 63-135, `creCorpusSummary` ~line 588-669, `creSwflOutputProducer` ~line 973-1903, `sources: [...]` ~line 1866-1873)
- Modify: `refinery/packs/cre-swfl.test.mts`
- Modify: `refinery/vocab/brain-vocabulary.json` (`concepts` object + `slug_index` object)

**Interfaces:**
- Consumes: `blsPpiSource`, `type BlsPpiNormalized` from `../sources/bls-ppi-source.mts` (Task 2's output).
- Produces: 8 new `key_metrics` slugs on `cre-swfl`'s `BrainOutput`: `construction_cost_ppi_industrial`, `construction_cost_ppi_warehouse`, `construction_cost_ppi_office`, `construction_cost_ppi_medical_office`, `construction_cost_ppi_trade_concrete`, `construction_cost_ppi_trade_roofing`, `construction_cost_ppi_trade_electrical`, `construction_cost_ppi_trade_plumbing_hvac`.

- [ ] **Step 1: Write the failing pack tests**

Append to `refinery/packs/cre-swfl.test.mts` (add the import alongside the existing top-of-file imports, then add the test block anywhere after the existing `import { corridorSource } ...` / `import { marketbeatSwflSource } ...` lines — e.g. right after line 14):

```typescript
import type { BlsPpiNormalized } from "../sources/bls-ppi-source.mts";
```

Then append these tests to the end of the file:

```typescript
function makeBlsPpiFragment(
  series_id: string,
  label: string,
  value: number,
  period: string,
  direction: "rising" | "falling" | "stable",
): RawFragment {
  const norm: BlsPpiNormalized = { kind: "bls-ppi-index", series_id, label, value, period, direction };
  return {
    fragment_id: `bls-ppi:${series_id}`,
    source_id: "bls_ppi_construction",
    source_trust_tier: 1,
    fetched_at: NOW,
    raw: { series_id },
    normalized: norm as unknown as Record<string, unknown>,
  };
}

const BLS_PPI_TEST_FRAGMENTS: RawFragment[] = [
  makeBlsPpiFragment("PCU236211236211", "New industrial building construction", 205, "2026-06", "rising"),
  makeBlsPpiFragment("PCU236221236221", "New warehouse building construction", 205, "2026-06", "falling"),
  makeBlsPpiFragment("PCU236223236223", "New office building construction", 191, "2026-06", "stable"),
  makeBlsPpiFragment("PCU236224236224", "New health care building construction", 232, "2026-06", "rising"),
  makeBlsPpiFragment("PCU23811X23811X", "Concrete contractors, nonresidential building work", 186, "2026-06", "rising"),
  makeBlsPpiFragment("PCU23816X23816X", "Roofing contractors, nonresidential building work", 169, "2026-06", "falling"),
  makeBlsPpiFragment("PCU23821X23821X", "Electrical contractors, nonresidential building work", 161, "2026-06", "stable"),
  makeBlsPpiFragment("PCU23822X23822X", "Plumbing/HVAC contractors, nonresidential building work", 171, "2026-06", "rising"),
  makeBlsPpiFragment("PCU236222236222", "New school building construction", 198, "2026-06", "stable"),
  makeBlsPpiFragment("PCU236400236400", "New nonresidential building construction by contractor type/region", 200, "2026-06", "stable"),
  makeBlsPpiFragment("PCU236500236500", "New nonresidential building construction by region", 199, "2026-06", "stable"),
  makeBlsPpiFragment("PCU2381MR2381MR", "Nonresidential building maintenance & repair", 205, "2026-06", "stable"),
];

test("bls-ppi: all 8 mapped series emit their construction_cost_ppi_* metric with the right value + direction", () => {
  creSwfl.corpusSummary!(BLS_PPI_TEST_FRAGMENTS);
  const result = creSwfl.outputProducer!(minimalPackOutput());
  const byMetric = new Map(result.key_metrics.map((m) => [m.metric, m]));

  assert.equal(byMetric.get("construction_cost_ppi_industrial")?.value, 205);
  assert.equal(byMetric.get("construction_cost_ppi_industrial")?.direction, "rising");
  assert.equal(byMetric.get("construction_cost_ppi_warehouse")?.value, 205);
  assert.equal(byMetric.get("construction_cost_ppi_warehouse")?.direction, "falling");
  assert.equal(byMetric.get("construction_cost_ppi_office")?.value, 191);
  assert.equal(byMetric.get("construction_cost_ppi_office")?.direction, "stable");
  assert.equal(byMetric.get("construction_cost_ppi_medical_office")?.value, 232);
  assert.equal(byMetric.get("construction_cost_ppi_medical_office")?.direction, "rising");
  assert.equal(byMetric.get("construction_cost_ppi_trade_concrete")?.value, 186);
  assert.equal(byMetric.get("construction_cost_ppi_trade_roofing")?.value, 169);
  assert.equal(byMetric.get("construction_cost_ppi_trade_electrical")?.value, 161);
  assert.equal(byMetric.get("construction_cost_ppi_trade_plumbing_hvac")?.value, 171);
});

test("bls-ppi: 236222 (school) and the 236400/236500/2381MR aggregates never surface as construction_cost_ppi_* metrics", () => {
  creSwfl.corpusSummary!(BLS_PPI_TEST_FRAGMENTS);
  const result = creSwfl.outputProducer!(minimalPackOutput());
  const slugs = result.key_metrics.map((m) => m.metric);
  assert.ok(!slugs.some((s) => s.includes("school")));
  assert.equal(slugs.filter((s) => s.startsWith("construction_cost_ppi_")).length, 8);
});

test("bls-ppi: each emitted metric carries a source citation naming its own BLS series id", () => {
  creSwfl.corpusSummary!(BLS_PPI_TEST_FRAGMENTS);
  const result = creSwfl.outputProducer!(minimalPackOutput());
  const industrial = result.key_metrics.find((m) => m.metric === "construction_cost_ppi_industrial");
  assert.ok(industrial);
  assert.ok(industrial!.source.citation.includes("PCU236211236211"));
  assert.equal(industrial!.source.tier, 1);
});

test("bls-ppi: emitting any construction_cost_ppi_* metric fires a national-series disclosure caveat", () => {
  creSwfl.corpusSummary!(BLS_PPI_TEST_FRAGMENTS);
  const result = creSwfl.outputProducer!(minimalPackOutput());
  assert.ok(result.caveats.some((c) => /national BLS series/i.test(c)));
});

test("bls-ppi: no BLS PPI fragments → no construction_cost_ppi_* metrics, no disclosure caveat", () => {
  creSwfl.corpusSummary!([]);
  const result = creSwfl.outputProducer!(minimalPackOutput());
  assert.equal(result.key_metrics.filter((m) => m.metric.startsWith("construction_cost_ppi_")).length, 0);
  assert.ok(!result.caveats.some((c) => /national BLS series/i.test(c)));
});

test("bls-ppi: singleton reset — a second run without BLS PPI fragments clears the prior run's metrics", () => {
  creSwfl.corpusSummary!(BLS_PPI_TEST_FRAGMENTS);
  const first = creSwfl.outputProducer!(minimalPackOutput());
  assert.ok(first.key_metrics.some((m) => m.metric === "construction_cost_ppi_industrial"));

  creSwfl.corpusSummary!([]);
  const second = creSwfl.outputProducer!(minimalPackOutput());
  assert.ok(!second.key_metrics.some((m) => m.metric.startsWith("construction_cost_ppi_")));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test refinery/packs/cre-swfl.test.mts -t "bls-ppi"`
Expected: FAIL — `creCorpusSummary` doesn't yet route `kind: "bls-ppi-index"` fragments anywhere, so `byMetric.get("construction_cost_ppi_industrial")` is `undefined` and every assertion throws.

- [ ] **Step 3: Add the BLS PPI import to `cre-swfl.mts`**

In `refinery/packs/cre-swfl.mts`, add this import immediately after the existing `import { makeBrainInputSource, type BrainInputNormalized } from "../sources/brain-input-source.mts";` line (part of the existing import block near the top of the file):

```typescript
import { blsPpiSource, type BlsPpiNormalized } from "../sources/bls-ppi-source.mts";
```

- [ ] **Step 4: Add closure state**

In `refinery/packs/cre-swfl.mts`, immediately after the existing block:

```typescript
let lastLocalCreContextRows: LocalCreContextNormalized[] = [];
```

add:

```typescript
/**
 * Stashed BLS PPI construction-cost indicators — populated by creCorpusSummary,
 * consumed by outputProducer. National series (no per-corridor/per-submarket
 * join needed, unlike MarketBeat) — each maps 1:1 onto an existing cre-swfl
 * sector or trade-cost category via BLS_PPI_METRIC_MAP in outputProducer.
 */
let lastBlsPpiIndicators: BlsPpiNormalized[] = [];
let lastBlsPpiFetchedAt: string | null = null;
```

- [ ] **Step 5: Reset the new state at the top of `creCorpusSummary`**

In `refinery/packs/cre-swfl.mts`, in the reset block at the top of `creCorpusSummary` (immediately after the existing `lastLocalCreContextRows = [];` line), add:

```typescript
  lastBlsPpiIndicators = [];
  lastBlsPpiFetchedAt = null;
```

- [ ] **Step 6: Route `bls-ppi-index` fragments in `creCorpusSummary`**

In `refinery/packs/cre-swfl.mts`, immediately after the existing block:

```typescript
  const localContextFragments = allFragments.filter(
    (f) => (f.normalized as { kind?: string } | null)?.kind === "local-cre-context",
  );
  lastLocalCreContextRows = localContextFragments.map(
    (f) => f.normalized as unknown as LocalCreContextNormalized,
  );
```

add (this MUST land before the `const corridors = allFragments...` line and the `if (corridors.length === 0) return [];` early return a few lines below, so BLS PPI metrics still populate even when the corridor corpus is empty):

```typescript
  // Stash BLS PPI construction-cost fragments (Nonresidential Building
  // Construction sector). National series, no per-corridor join needed.
  const blsPpiFragments = allFragments.filter(
    (f) => (f.normalized as { kind?: string } | null)?.kind === "bls-ppi-index",
  );
  lastBlsPpiIndicators = blsPpiFragments.map(
    (f) => f.normalized as unknown as BlsPpiNormalized,
  );
  lastBlsPpiFetchedAt = blsPpiFragments[0]?.fetched_at ?? null;
```

- [ ] **Step 7: Emit the 8 metrics in `creSwflOutputProducer`**

In `refinery/packs/cre-swfl.mts`, find the corridor_factor block's closing (immediately before the line `const vote = voteCreDirection(corridors);`). Insert this new block right before that line:

```typescript
  // --- BLS PPI construction-cost metrics (Nonresidential Building
  // Construction sector, NAICS 236) ---------------------------------------
  // Populated by creCorpusSummary from blsPpiSource into lastBlsPpiIndicators.
  // Each series maps 1:1 onto an existing cre-swfl sector (industrial/
  // warehouse -> industrial audience, office -> office, health care ->
  // medical_office) or stands alone as a nonresidential trade-cost input
  // (concrete/roofing/electrical/plumbing-HVAC) — never blended into a
  // composite (this pack's zero-cross-sector-blending rule, 2026-06-05/
  // 2026-06-08). 236222 (school) is ingested but deliberately NOT surfaced —
  // no cre-swfl sector maps to institutional/public construction; tracked via
  // check bls_ppi_school_series_no_consumer. 236400/236500/2381MR are
  // aggregate rollups of series already shown individually above and are also
  // not separately surfaced (would double-count).
  const BLS_PPI_METRIC_MAP: Record<string, { metric: string; label: string }> = {
    PCU236211236211: {
      metric: "construction_cost_ppi_industrial",
      label: "Construction cost — new industrial building (PPI)",
    },
    PCU236221236221: {
      metric: "construction_cost_ppi_warehouse",
      label: "Construction cost — new warehouse building (PPI)",
    },
    PCU236223236223: {
      metric: "construction_cost_ppi_office",
      label: "Construction cost — new office building (PPI)",
    },
    PCU236224236224: {
      metric: "construction_cost_ppi_medical_office",
      label: "Construction cost — new health care building (PPI)",
    },
    PCU23811X23811X: {
      metric: "construction_cost_ppi_trade_concrete",
      label: "Construction cost — concrete contractors, nonres. building work (PPI)",
    },
    PCU23816X23816X: {
      metric: "construction_cost_ppi_trade_roofing",
      label: "Construction cost — roofing contractors, nonres. building work (PPI)",
    },
    PCU23821X23821X: {
      metric: "construction_cost_ppi_trade_electrical",
      label: "Construction cost — electrical contractors, nonres. building work (PPI)",
    },
    PCU23822X23822X: {
      metric: "construction_cost_ppi_trade_plumbing_hvac",
      label: "Construction cost — plumbing/HVAC contractors, nonres. building work (PPI)",
    },
  };
  const emittedBlsPpiSlugs: string[] = [];
  for (const indicator of lastBlsPpiIndicators) {
    const m = BLS_PPI_METRIC_MAP[indicator.series_id];
    if (!m) continue; // 236222/236400/236500/2381MR intentionally excluded
    key_metrics.push({
      metric: m.metric,
      value: indicator.value,
      direction: indicator.direction,
      label: m.label,
      variable_type: "intensive",
      units: "PPI index (not seasonally adjusted; base period varies by series)",
      display_format: "raw",
      source: {
        url: `https://data.bls.gov/timeseries/${indicator.series_id}`,
        fetched_at: lastBlsPpiFetchedAt ?? fetched_at,
        tier: 1,
        citation: `BLS PPI industry data for ${indicator.label} (series ${indicator.series_id}) — latest observation ${indicator.value} for period ${indicator.period}, ${indicator.direction} vs. ~6 periods prior.`,
      },
    });
    emittedBlsPpiSlugs.push(m.metric);
  }

```

- [ ] **Step 8: Add the disclosure caveat**

In `refinery/packs/cre-swfl.mts`, immediately after the line `const vote = voteCreDirection(corridors);`, add:

```typescript

  if (emittedBlsPpiSlugs.length > 0) {
    vote.caveats.push(
      `Construction-cost PPI metrics (${emittedBlsPpiSlugs.join(", ")}) are national BLS series — no SWFL-specific or Lee/Collier breakout exists at BLS for any of them. They ship a real month-over-month direction (unlike MarketBeat's schema-required "stable" fallback) but BLS can revise recent observations within ~30 days of first publication.`,
    );
  }
```

- [ ] **Step 9: Add `blsPpiSource` to the pack's `sources` array**

In `refinery/packs/cre-swfl.mts`, in the `creSwfl` `PackDefinition`'s `sources: [...]` array, add `blsPpiSource` as the last entry:

```typescript
  sources: [
    corridorSource,
    marketbeatSwflSource,
    activeListingsSource,
    localCreContextSource,
    makeBrainInputSource("permits-swfl"),
    makeBrainInputSource("corridor-pulse-swfl"),
    blsPpiSource,
  ],
```

(`input_brains` stays unchanged — `blsPpiSource` is a direct Tier-1 data source, not a brain-input, so it needs no `input_brains` entry, same as `corridorSource`/`marketbeatSwflSource`.)

- [ ] **Step 10: Run the pack tests to verify they pass**

Run: `bun test refinery/packs/cre-swfl.test.mts`
Expected: all tests PASS, including the 6 new `bls-ppi:` tests and every pre-existing test (no regressions).

- [ ] **Step 11: Add the 8 vocab concepts**

In `refinery/vocab/brain-vocabulary.json`, inside the `"concepts": {` object, add these 8 entries (placement: anywhere inside `concepts` — e.g. immediately after the existing `"cre_corridor_pulse_signals"` entry, before its closing `},`):

```json
    "cre_construction_cost_ppi_industrial": {
      "id": "cre_construction_cost_ppi_industrial",
      "grade": { "direction_polarity": "lower_is_bullish" },
      "prefLabel": "Construction Cost — New Industrial Building (PPI)",
      "altLabels": ["industrial construction cost", "industrial building PPI"],
      "raw_slugs": ["construction_cost_ppi_industrial"],
      "category": "real-estate",
      "domain": ["real-estate"],
      "source_brains": ["cre-swfl"],
      "value_type": "index",
      "unit": "PPI index (NSA, base period varies by series)",
      "value_range": [0, 1000],
      "direction_concept": "qual_metric_trajectory",
      "status": "active",
      "scope_note": "BLS PPI industry data for New Industrial Building Construction (NAICS 236211), national series, monthly, not seasonally adjusted. Pairs with cre-swfl's existing industrial MarketBeat sector. Rising cost is bearish for development feasibility — lower_is_bullish."
    },
    "cre_construction_cost_ppi_warehouse": {
      "id": "cre_construction_cost_ppi_warehouse",
      "grade": { "direction_polarity": "lower_is_bullish" },
      "prefLabel": "Construction Cost — New Warehouse Building (PPI)",
      "altLabels": ["warehouse construction cost", "warehouse building PPI"],
      "raw_slugs": ["construction_cost_ppi_warehouse"],
      "category": "real-estate",
      "domain": ["real-estate"],
      "source_brains": ["cre-swfl"],
      "value_type": "index",
      "unit": "PPI index (NSA, base period varies by series)",
      "value_range": [0, 1000],
      "direction_concept": "qual_metric_trajectory",
      "status": "active",
      "scope_note": "BLS PPI industry data for New Warehouse Building Construction (NAICS 236221), national series, monthly, not seasonally adjusted. Pairs with cre-swfl's existing industrial MarketBeat sector alongside construction_cost_ppi_industrial. Rising cost is bearish for development feasibility — lower_is_bullish."
    },
    "cre_construction_cost_ppi_office": {
      "id": "cre_construction_cost_ppi_office",
      "grade": { "direction_polarity": "lower_is_bullish" },
      "prefLabel": "Construction Cost — New Office Building (PPI)",
      "altLabels": ["office construction cost", "office building PPI"],
      "raw_slugs": ["construction_cost_ppi_office"],
      "category": "real-estate",
      "domain": ["real-estate"],
      "source_brains": ["cre-swfl"],
      "value_type": "index",
      "unit": "PPI index (NSA, base period varies by series)",
      "value_range": [0, 1000],
      "direction_concept": "qual_metric_trajectory",
      "status": "active",
      "scope_note": "BLS PPI industry data for New Office Building Construction (NAICS 236223), national series, monthly, not seasonally adjusted. Pairs with cre-swfl's existing office MarketBeat sector. Rising cost is bearish for development feasibility — lower_is_bullish."
    },
    "cre_construction_cost_ppi_medical_office": {
      "id": "cre_construction_cost_ppi_medical_office",
      "grade": { "direction_polarity": "lower_is_bullish" },
      "prefLabel": "Construction Cost — New Health Care Building (PPI)",
      "altLabels": ["health care construction cost", "medical office building PPI"],
      "raw_slugs": ["construction_cost_ppi_medical_office"],
      "category": "real-estate",
      "domain": ["real-estate"],
      "source_brains": ["cre-swfl"],
      "value_type": "index",
      "unit": "PPI index (NSA, base period varies by series)",
      "value_range": [0, 1000],
      "direction_concept": "qual_metric_trajectory",
      "status": "active",
      "scope_note": "BLS PPI industry data for New Health Care Building Construction (NAICS 236224), national series, monthly, not seasonally adjusted. Pairs with cre-swfl's existing medical_office MarketBeat sector. Rising cost is bearish for development feasibility — lower_is_bullish."
    },
    "cre_construction_cost_ppi_trade_concrete": {
      "id": "cre_construction_cost_ppi_trade_concrete",
      "grade": { "direction_polarity": "lower_is_bullish" },
      "prefLabel": "Construction Cost — Concrete Contractors, Nonres. (PPI)",
      "altLabels": ["concrete contractor cost", "concrete trade PPI"],
      "raw_slugs": ["construction_cost_ppi_trade_concrete"],
      "category": "real-estate",
      "domain": ["real-estate"],
      "source_brains": ["cre-swfl"],
      "value_type": "index",
      "unit": "PPI index (NSA, base period varies by series)",
      "value_range": [0, 1000],
      "direction_concept": "qual_metric_trajectory",
      "status": "active",
      "scope_note": "BLS PPI industry data for concrete contractors performing nonresidential building work (NAICS 23811X), national series. Cross-sector trade-cost input, not tied to one cre-swfl sector — never blended with the building-type indexes above. Rising cost is bearish — lower_is_bullish."
    },
    "cre_construction_cost_ppi_trade_roofing": {
      "id": "cre_construction_cost_ppi_trade_roofing",
      "grade": { "direction_polarity": "lower_is_bullish" },
      "prefLabel": "Construction Cost — Roofing Contractors, Nonres. (PPI)",
      "altLabels": ["roofing contractor cost", "roofing trade PPI"],
      "raw_slugs": ["construction_cost_ppi_trade_roofing"],
      "category": "real-estate",
      "domain": ["real-estate"],
      "source_brains": ["cre-swfl"],
      "value_type": "index",
      "unit": "PPI index (NSA, base period varies by series)",
      "value_range": [0, 1000],
      "direction_concept": "qual_metric_trajectory",
      "status": "active",
      "scope_note": "BLS PPI industry data for roofing contractors performing nonresidential building work (NAICS 23816X), national series. Cross-sector trade-cost input, not tied to one cre-swfl sector — never blended with the building-type indexes above. Rising cost is bearish — lower_is_bullish."
    },
    "cre_construction_cost_ppi_trade_electrical": {
      "id": "cre_construction_cost_ppi_trade_electrical",
      "grade": { "direction_polarity": "lower_is_bullish" },
      "prefLabel": "Construction Cost — Electrical Contractors, Nonres. (PPI)",
      "altLabels": ["electrical contractor cost", "electrical trade PPI"],
      "raw_slugs": ["construction_cost_ppi_trade_electrical"],
      "category": "real-estate",
      "domain": ["real-estate"],
      "source_brains": ["cre-swfl"],
      "value_type": "index",
      "unit": "PPI index (NSA, base period varies by series)",
      "value_range": [0, 1000],
      "direction_concept": "qual_metric_trajectory",
      "status": "active",
      "scope_note": "BLS PPI industry data for electrical contractors performing nonresidential building work (NAICS 23821X), national series. Cross-sector trade-cost input, not tied to one cre-swfl sector — never blended with the building-type indexes above. Rising cost is bearish — lower_is_bullish."
    },
    "cre_construction_cost_ppi_trade_plumbing_hvac": {
      "id": "cre_construction_cost_ppi_trade_plumbing_hvac",
      "grade": { "direction_polarity": "lower_is_bullish" },
      "prefLabel": "Construction Cost — Plumbing/HVAC Contractors, Nonres. (PPI)",
      "altLabels": ["plumbing contractor cost", "HVAC trade PPI"],
      "raw_slugs": ["construction_cost_ppi_trade_plumbing_hvac"],
      "category": "real-estate",
      "domain": ["real-estate"],
      "source_brains": ["cre-swfl"],
      "value_type": "index",
      "unit": "PPI index (NSA, base period varies by series)",
      "value_range": [0, 1000],
      "direction_concept": "qual_metric_trajectory",
      "status": "active",
      "scope_note": "BLS PPI industry data for plumbing/HVAC contractors performing nonresidential building work (NAICS 23822X), national series. Cross-sector trade-cost input, not tied to one cre-swfl sector — never blended with the building-type indexes above. Rising cost is bearish — lower_is_bullish."
    },
```

- [ ] **Step 12: Add the 8 slug_index entries**

In `refinery/vocab/brain-vocabulary.json`, inside the `"slug_index": {` object, add (placement: anywhere inside `slug_index` — e.g. immediately after the existing `"corridor_pulse_signals_live": "cre_corridor_pulse_signals",` line):

```json
    "construction_cost_ppi_industrial": "cre_construction_cost_ppi_industrial",
    "construction_cost_ppi_warehouse": "cre_construction_cost_ppi_warehouse",
    "construction_cost_ppi_office": "cre_construction_cost_ppi_office",
    "construction_cost_ppi_medical_office": "cre_construction_cost_ppi_medical_office",
    "construction_cost_ppi_trade_concrete": "cre_construction_cost_ppi_trade_concrete",
    "construction_cost_ppi_trade_roofing": "cre_construction_cost_ppi_trade_roofing",
    "construction_cost_ppi_trade_electrical": "cre_construction_cost_ppi_trade_electrical",
    "construction_cost_ppi_trade_plumbing_hvac": "cre_construction_cost_ppi_trade_plumbing_hvac",
```

- [ ] **Step 13: Validate JSON + run vocab coverage**

Run: `node -e "JSON.parse(require('fs').readFileSync('refinery/vocab/brain-vocabulary.json','utf-8')); console.log('brain-vocabulary.json: valid JSON')"`
Expected: `brain-vocabulary.json: valid JSON`

Run: `bun refinery/tools/check-vocab-coverage.mts --all`
Expected: no uncovered-slug error for any `construction_cost_ppi_*` slug (cre-swfl is fully covered).

- [ ] **Step 14: Run the full pack test suite + catalog mirror + typecheck**

Run: `bun test refinery/packs/cre-swfl.test.mts refinery/packs/catalog.test.mts`
Expected: all PASS (catalog mirror passes untouched — `cre-swfl`'s `domain`/`scope`/`ttl_seconds` are unchanged).

Run: `npm run refinery:typecheck`
Expected: clean.

- [ ] **Step 15: Commit**

```bash
git add refinery/packs/cre-swfl.mts refinery/packs/cre-swfl.test.mts refinery/vocab/brain-vocabulary.json
git commit -m "feat(cre-swfl): consume BLS PPI construction-cost metrics (8 of 12 series)

Adds blsPpiSource to cre-swfl's sources[]. Building-type series pair 1:1 with
existing MarketBeat sectors (industrial/warehouse, office, medical_office);
the 4 trade-contractor indexes surface as their own cross-sector metrics —
never blended into a composite. 236222 (school) and the 3 aggregate rollups
stay unconsumed on purpose. Vocab slugs shipped in this same commit (Gate 2)."
```

---

### Task 4: Full-suite verification pass

**Files:** none (verification only — this task should not need a commit unless it surfaces a regression, in which case fix forward and commit the fix).

**Interfaces:** none — this task consumes the outputs of Tasks 1-3.

- [ ] **Step 1: Full Python ingest test suite**

Run: `pytest ingest/tests/pipelines/bls_ppi/ -v`
Expected: 2 passed (`test_dry_run_skips_upload`, `test_fetch_sends_all_scoped_series`).

- [ ] **Step 2: Full TypeScript test suite**

Run: `bun test`
Expected: all tests pass, including every pre-existing `refinery/packs/*.test.mts` and `refinery/sources/*.test.mts` (no regressions from the new source/pack wiring).

- [ ] **Step 3: Full refinery typecheck**

Run: `npm run refinery:typecheck`
Expected: clean exit.

- [ ] **Step 4: Vocab coverage, full repo**

Run: `bun refinery/tools/check-vocab-coverage.mts --all`
Expected: no uncovered slugs anywhere in the repo (not just cre-swfl — confirms this change didn't regress coverage elsewhere).

- [ ] **Step 5: Corridor-aliases test (pre-push Gate 2 also runs this on any vocab touch)**

Run: `bun test refinery/lib/corridor-aliases.test.mts`
Expected: pass (this plan doesn't touch corridor aliases, but Gate 2 runs it on any vocab/pack touch — confirm no incidental breakage).

- [ ] **Step 6: If any step above fails, fix forward and commit**

If a failure surfaces, diagnose against the specific task's code (per `superpowers:systematic-debugging` if the cause isn't immediately obvious from the error), fix in place, re-run the failing command, and commit the fix with a `fix(bls-ppi):` message referencing which verification step caught it. Do not proceed to push until every step above is green.

- [ ] **Step 7: Report back to the operator**

This plan does NOT include pushing (per RULE 1 — docs-only push autonomy does not extend to code changes; ingest/refinery/vocab changes require an explicit push confirmation) or triggering a live rebuild. Once all 3 commits are in place and Task 4 is green, stop and report: 3 commits ready, full verification green, awaiting push approval. The `bls_ppi_cre_swfl_live_verify` check (opened 07/17/2026) stays open until the operator pushes AND a live `cre-swfl` rebuild runs — this plan's job ends at "verified locally, ready to ship."
