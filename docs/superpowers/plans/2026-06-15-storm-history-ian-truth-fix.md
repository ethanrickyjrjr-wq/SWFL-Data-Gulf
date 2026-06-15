# storm-history-swfl Hurricane Ian Truth Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Hurricane Ian (and all NOAA zone-logged tropical cyclones) appear correctly in `storm-history-swfl`, fixing the "ZERO hurricane-force / last billion-dollar = 2004" lie (A1) and surfacing the storm's proper name (A2).

**Architecture:** Root cause is an ingest filter that drops NOAA zone-type rows (`CZ_TYPE='Z'`, `CZ_NAME='COASTAL LEE'…`) where hurricanes/surge live. Fix the ingest filter + add a volume guard; teach the source connector to normalize zone→county, count distinct named cyclones, and extract storm names from narratives; rename the now-misnamed wind slug across pack + vocab + constitution atomically; regenerate the fixture (which currently falsely claims to contain Ian); re-ingest live after merge.

**Tech Stack:** Python 3.13 + DuckDB (ingest), TypeScript/Bun (refinery source + pack), JSON vocab, `pytest` + `bun:test`.

**Spec:** `docs/superpowers/specs/2026-06-15-storm-history-ian-truth-fix-design.md` — read it first.

**Atomicity note:** Tasks 1 and 2 are independent commits. **Task 4 is one atomic commit** (source + pack + vocab + constitution + fixture + tests) — the BrainOutput field types, the slug-rename contract (gate requires vocab+pack same commit), and the new fixture are mutually dependent; splitting them reddens the build or the gate.

---

## Task 1: Ingest — include hazard zone rows + volume guard

**Files:**
- Modify: `ingest/duckdb_pipelines/storm_history_swfl/constants.py`
- Modify: `ingest/duckdb_pipelines/storm_history_swfl/pipeline.py`
- Test: `ingest/tests/duckdb_pipelines/storm_history_swfl/test_pipeline.py`

- [ ] **Step 1: Add constants** to `constants.py` (after `SWFL_COUNTIES_CZ`):

```python
# Hazard zone-event types (CZ_TYPE='Z'). NOAA logs hurricanes/surge ONLY at the
# NWS zone level, with CZ_NAME like "COASTAL LEE" / "INLAND COLLIER COUNTY".
# Exclude Drought / Frost/Freeze (climatology, not storms).
HAZARD_ZONE_EVENT_TYPES = [
    "Hurricane (Typhoon)",
    "Tropical Storm",
    "Tropical Depression",
    "Storm Surge/Tide",
    "High Wind",
    "Strong Wind",
    "Coastal Flood",
]

# Volume-guard floors for the destructive parquet replace (BIBLE §0.2 rule 5).
MIN_TOTAL_ROWS = 1000        # live corpus is ~1,178 county rows; zone rows only add
MIN_HURRICANE_ROWS = 5       # Hurricane Ian alone is 6 zone rows; full vintage has many


def swfl_filter_sql() -> str:
    """WHERE clause: all county-type rows for the 3 counties, PLUS hazard-type
    zone rows for those counties. cz_name for zones is 'COASTAL/INLAND <county>'
    with an optional ' COUNTY' suffix."""
    counties = ", ".join(f"'{c}'" for c in SWFL_COUNTIES_CZ)
    hazards = ", ".join(f"'{t}'" for t in HAZARD_ZONE_EVENT_TYPES)
    zone_re = r"^(COASTAL|INLAND) (LEE|COLLIER|CHARLOTTE)( COUNTY)?$"
    return (
        f"state = 'FLORIDA' AND (\n"
        f"  (cz_type = 'C' AND cz_name IN ({counties}))\n"
        f"  OR (cz_type = 'Z'\n"
        f"      AND regexp_matches(cz_name, '{zone_re}')\n"
        f"      AND event_type IN ({hazards}))\n"
        f")"
    )
```

- [ ] **Step 2: Write the failing filter test** — append to `test_pipeline.py`:

```python
import duckdb
from ingest.duckdb_pipelines.storm_history_swfl.constants import swfl_filter_sql


def _rows(csv_text: str):
    con = duckdb.connect()
    con.execute(
        "CREATE TABLE raw AS SELECT * FROM read_csv_auto(?, header=true)",
        ["/dev/stdin"],
    ) if False else None
    con.execute("CREATE TABLE raw (state VARCHAR, cz_type VARCHAR, cz_name VARCHAR, event_type VARCHAR)")
    for line in csv_text.strip().splitlines():
        st, ct, cn, et = line.split("|")
        con.execute("INSERT INTO raw VALUES (?,?,?,?)", [st, ct, cn, et])
    return con.execute(f"SELECT cz_name, event_type FROM raw WHERE {swfl_filter_sql()}").fetchall()


def test_filter_keeps_county_rows_and_hazard_zone_rows_drops_climatology():
    rows = _rows(
        """
        FLORIDA|C|LEE|Tornado
        FLORIDA|C|COLLIER|Flood
        FLORIDA|Z|COASTAL LEE|Hurricane (Typhoon)
        FLORIDA|Z|INLAND COLLIER COUNTY|Tropical Storm
        FLORIDA|Z|COASTAL CHARLOTTE|Drought
        FLORIDA|Z|INLAND LEE|Frost/Freeze
        FLORIDA|Z|COASTAL MANATEE|Hurricane (Typhoon)
        GEORGIA|C|LEE|Tornado
        """
    )
    kept = {(cz, et) for cz, et in rows}
    assert ("LEE", "Tornado") in kept                       # county row kept
    assert ("COASTAL LEE", "Hurricane (Typhoon)") in kept   # the bug fix: Ian zone row kept
    assert ("INLAND COLLIER COUNTY", "Tropical Storm") in kept
    assert ("COASTAL CHARLOTTE", "Drought") not in kept     # climatology excluded
    assert ("INLAND LEE", "Frost/Freeze") not in kept
    assert ("COASTAL MANATEE", "Hurricane (Typhoon)") not in kept  # out-of-footprint county
    assert ("LEE", "Tornado") in kept and not any(r[0] == "LEE" and "GEORGIA" in str(r) for r in rows)
```

- [ ] **Step 3: Run it — expect FAIL** (`swfl_filter_sql` import / behavior):

Run: `python -m pytest ingest/tests/duckdb_pipelines/storm_history_swfl/test_pipeline.py::test_filter_keeps_county_rows_and_hazard_zone_rows_drops_climatology -v`
Expected: PASS once Step 1 is in (the test IS the spec for Step 1; if it fails, the regex/constants are wrong — fix them).

- [ ] **Step 4: Wire the filter + guard into `pipeline.py`.** Replace the single `COPY (... WHERE ...) TO ...` block (lines ~108-122) with stage → guard → copy:

```python
    from ingest.lib.guards import assert_min_rows
    from ingest.duckdb_pipelines.storm_history_swfl.constants import (
        MIN_TOTAL_ROWS, MIN_HURRICANE_ROWS, swfl_filter_sql,
    )

    urls_sql_list = ", ".join(f"'{u}'" for u in urls)
    con.execute(f"""
        CREATE TABLE staged AS
        SELECT *
        FROM read_csv_auto(
            [{urls_sql_list}],
            union_by_name=true,
            ignore_errors=true,
            null_padding=true
        )
        WHERE {swfl_filter_sql()};
    """)

    total = con.execute("SELECT count(*) FROM staged").fetchone()[0]
    hurricane = con.execute(
        "SELECT count(*) FROM staged WHERE event_type IN ('Hurricane (Typhoon)', 'Tropical Storm')"
    ).fetchone()[0]
    print(f"  staged rows: {total:,} (hurricane/TS: {hurricane:,})")
    assert_min_rows(total, MIN_TOTAL_ROWS, "storm_events_swfl total")
    assert_min_rows(hurricane, MIN_HURRICANE_ROWS, "storm_events_swfl hurricane/TS rows")

    con.execute(f"COPY staged TO '{PARQUET_TARGET}' (FORMAT PARQUET, COMPRESSION ZSTD);")
```

(Add the two imports to the top-level import block instead if preferred; `constants` is already imported — extend that import. `assert_min_rows` is the only new module import.)

- [ ] **Step 5: Run full ingest test file — expect PASS:**

Run: `python -m pytest ingest/tests/duckdb_pipelines/storm_history_swfl/test_pipeline.py -v`
Expected: all PASS (parse_damage_string + the new filter test).

- [ ] **Step 6: PROBE the live filter against NOAA (manual, no commit).** Confirm the filter behaves on real data before trusting it:

```bash
python - <<'PY'
import duckdb
from ingest.duckdb_pipelines.storm_history_swfl.constants import swfl_filter_sql
con = duckdb.connect(); con.execute("INSTALL httpfs; LOAD httpfs;")
URL=("https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/"
     "StormEvents_details-ftp_v1.0_d2022_c20260323.csv.gz")
rel=f"read_csv_auto('{URL}', ignore_errors=true, null_padding=true)"
n=con.execute(f"SELECT count(*) FROM {rel} WHERE {swfl_filter_sql()}").fetchone()[0]
ian=con.execute(f"SELECT count(*) FROM {rel} WHERE {swfl_filter_sql()} AND event_type='Hurricane (Typhoon)'").fetchone()[0]
print("2022 rows kept:", n, "| Ian hurricane rows:", ian)   # expect ian == 6
PY
```
Expected: `Ian hurricane rows: 6`. (Compile-date `c20260323` may roll — if 404, re-list the index per `_list_noaa_urls`.)

- [ ] **Step 7: Commit:**

```bash
git add ingest/duckdb_pipelines/storm_history_swfl/constants.py \
        ingest/duckdb_pipelines/storm_history_swfl/pipeline.py \
        ingest/tests/duckdb_pipelines/storm_history_swfl/test_pipeline.py
git commit -m "fix(ingest): storm-history keeps NOAA hazard zone rows + volume guard

cz_name IN (county) dropped every CZ_TYPE='Z' row -> Hurricane Ian (logged as
COASTAL/INLAND LEE etc.) never entered the parquet. Keep county rows + hazard
zone types; guard the destructive replace with a hurricane-presence floor."
```

---

## Task 2: Source connector — pure helpers `normalizeCounty` + `extractStormName`

**Files:**
- Modify: `refinery/sources/storm-history-source.mts`
- Test: `refinery/sources/storm-history-source.test.mts`

- [ ] **Step 1: Write the failing tests** — append to `storm-history-source.test.mts` (extend the existing import on line 7 to also pull the two new exports):

```ts
const { normalizeCounty, extractStormName } =
  await import("./storm-history-source.mts");

test("normalizeCounty maps zone names to canonical county", () => {
  assert.equal(normalizeCounty("COASTAL LEE"), "LEE");
  assert.equal(normalizeCounty("INLAND COLLIER COUNTY"), "COLLIER");
  assert.equal(normalizeCounty("coastal charlotte"), "CHARLOTTE");
  assert.equal(normalizeCounty("LEE"), "LEE");          // county row unchanged
  assert.equal(normalizeCounty(null), null);
  assert.equal(normalizeCounty("   "), null);
});

test("extractStormName pulls the proper name from NOAA narratives", () => {
  assert.equal(
    extractStormName("Hurricane Ian formed in the central Caribbean Sea on September 23", null),
    "Ian",
  );
  // No "Hurricane <Name>" present -> falls back to the tropical-storm match.
  assert.equal(
    extractStormName("A tropical depression formed... upgraded to Tropical Storm Ian at 11 PM. Ian moved", null),
    "Ian",
  );
  assert.equal(extractStormName(null, "Wind gusts of 100-110 mph were measured"), null);
});
```

- [ ] **Step 2: Run — expect FAIL** (`normalizeCounty`/`extractStormName` undefined):

Run: `bun test refinery/sources/storm-history-source.test.mts`
Expected: FAIL — exports not defined.

- [ ] **Step 3: Implement the helpers** in `storm-history-source.mts` (add near the other exported parsers, e.g. after `parseNoaaDate`):

```ts
/**
 * Map a NOAA CZ_NAME to its canonical SWFL county. Zone rows arrive as
 * "COASTAL LEE" / "INLAND COLLIER COUNTY"; county rows as "LEE". Returns the
 * bare uppercase county, or null when the string is empty.
 */
export function normalizeCounty(czName: string | null): string | null {
  if (czName == null) return null;
  const s = czName
    .toUpperCase()
    .trim()
    .replace(/^(COASTAL|INLAND)\s+/, "")
    .replace(/\s+COUNTY$/, "")
    .trim();
  return s === "" ? null : s;
}

const HURRICANE_NAME_RE = /\bHurricane\s+([A-Z][a-z]+)\b/;
const TROPICAL_NAME_RE =
  /\b(?:Hurricane|Tropical Storm|Tropical Depression|Subtropical Storm)\s+([A-Z][a-z]+)\b/;

/**
 * Extract a storm's proper name (e.g. "Ian") from NOAA narrative text. Prefers
 * a "Hurricane <Name>" match over a generic tropical match so a row that first
 * mentions the depression phase still resolves to the hurricane name. Returns
 * null when no name is present.
 */
export function extractStormName(
  ...narratives: (string | null)[]
): string | null {
  for (const re of [HURRICANE_NAME_RE, TROPICAL_NAME_RE]) {
    for (const n of narratives) {
      if (!n) continue;
      const m = n.match(re);
      if (m) return m[1];
    }
  }
  return null;
}
```

- [ ] **Step 4: Run — expect PASS:**

Run: `bun test refinery/sources/storm-history-source.test.mts`
Expected: the two new tests PASS. (The older `extreme_wind_event_count` assertion still passes — it's replaced in Task 4.)

- [ ] **Step 5: Commit:**

```bash
git add refinery/sources/storm-history-source.mts refinery/sources/storm-history-source.test.mts
git commit -m "feat(storm-source): normalizeCounty + extractStormName helpers

Pure functions for zone->county attribution and storm-name extraction from
NOAA narratives; wired into the aggregator in the next commit."
```

---

## Task 3: Regenerate the fixture parquet (produce file; commit deferred to Task 4)

**Files:**
- Create: `ingest/duckdb_pipelines/storm_history_swfl/make_fixture.py`
- Produce (do NOT commit yet): `refinery/__fixtures__/storm-history-swfl.sample.parquet`

> Why deferred commit: the new fixture contains zone rows that the *old* aggregator mis-handles (it would put "COASTAL LEE" into `counties_covered`, reddening the existing source test). The fixture must land in the same commit as the Task-4 aggregator fix. Generate it here; stage it in Task 4.

- [ ] **Step 1: Write the generator** `make_fixture.py`:

```python
"""Regenerate refinery/__fixtures__/storm-history-swfl.sample.parquet from NOAA.

A 2022-2024 SWFL slice using the production filter, so the fixture actually
contains Hurricane Ian's zone rows + narratives + the $7B Coastal Lee damage.
Run: python -m ingest.duckdb_pipelines.storm_history_swfl.make_fixture
"""
import re
import duckdb
import requests
from pathlib import Path

from ingest.duckdb_pipelines.storm_history_swfl.constants import (
    NOAA_BASE_URL, swfl_filter_sql,
)

OUT = (Path(__file__).parents[3] / "refinery" / "__fixtures__"
       / "storm-history-swfl.sample.parquet")
YEARS = (2022, 2023, 2024)


def _urls() -> list[str]:
    resp = requests.get(NOAA_BASE_URL, timeout=60)
    resp.raise_for_status()
    rx = re.compile(r"StormEvents_details-ftp_v1\.0_d(\d{4})_c(\d+)\.csv\.gz")
    best: dict[int, tuple[int, str]] = {}
    for m in rx.finditer(resp.text):
        y, c, name = int(m.group(1)), int(m.group(2)), m.group(0)
        if y in YEARS and (y not in best or c > best[y][0]):
            best[y] = (c, name)
    return [f"{NOAA_BASE_URL}{n}" for _, n in best.values()]


def run() -> None:
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    urls = ", ".join(f"'{u}'" for u in _urls())
    con.execute(f"""
        COPY (
            SELECT * FROM read_csv_auto([{urls}], union_by_name=true,
                                        ignore_errors=true, null_padding=true)
            WHERE {swfl_filter_sql()}
        ) TO '{OUT.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD);
    """)
    n = con.execute(f"SELECT count(*) FROM read_parquet('{OUT.as_posix()}')").fetchone()[0]
    ian = con.execute(
        f"SELECT count(*) FROM read_parquet('{OUT.as_posix()}') "
        "WHERE event_type='Hurricane (Typhoon)'"
    ).fetchone()[0]
    print(f"fixture rows: {n} | Ian hurricane rows: {ian}")
    assert ian >= 6, "fixture must contain Hurricane Ian zone rows"


if __name__ == "__main__":
    run()
```

- [ ] **Step 2: Run it — expect Ian present:**

Run: `python -m ingest.duckdb_pipelines.storm_history_swfl.make_fixture`
Expected: `Ian hurricane rows: 6` (or more), fixture file rewritten. The file is staged/committed in Task 4.

---

## Task 4: Atomic truth-fix + slug rename (source aggregation + pack + vocab + constitution + fixture + tests)

**Files:**
- Modify: `refinery/sources/storm-history-source.mts`
- Modify: `refinery/sources/storm-history-source.test.mts`
- Modify: `refinery/packs/storm-history-swfl.mts`
- Modify: `refinery/packs/storm-history-swfl.test.mts`
- Modify: `refinery/vocab/brain-vocabulary.json`
- Modify: `refinery/constitution/real-estate.mts`
- Modify: `refinery/constitution/real-estate.test.mts`
- Stage: `refinery/__fixtures__/storm-history-swfl.sample.parquet` (from Task 3)
- Create: `ingest/duckdb_pipelines/storm_history_swfl/make_fixture.py` (from Task 3)

### 4A — Source connector aggregation

- [ ] **Step 1: Extend `StormRow` + the SELECT.** In `storm-history-source.mts`, add fields to `interface StormRow` (after `cz_name`):

```ts
  cz_type: string | null;
  episode_id: string | null;
  episode_narrative: string | null;
  event_narrative: string | null;
```

Extend the `runAndReadAll` SELECT (after `CZ_NAME AS cz_name`) and the `rowObjects.map` projection:

```sql
       CZ_TYPE AS cz_type,
       EPISODE_ID AS episode_id,
       EPISODE_NARRATIVE AS episode_narrative,
       EVENT_NARRATIVE AS event_narrative,
```
```ts
    cz_type: toStr(r["cz_type"]),
    episode_id: toStr(r["episode_id"]),
    episode_narrative: toStr(r["episode_narrative"]),
    event_narrative: toStr(r["event_narrative"]),
```

- [ ] **Step 2: Fix the type sets** near the top of the file:

```ts
const MAJOR_EVENT_TYPES = new Set([
  "Hurricane (Typhoon)",
  "Tropical Storm",
  "Tornado",
  "Flash Flood",
  "Storm Surge/Tide",
]);
const TROPICAL_CYCLONE_EVENT_TYPES = new Set([
  "Hurricane (Typhoon)",
  "Tropical Storm",
  "Tropical Depression",
]);
```
Delete `EXTREME_WIND_MAGNITUDE_KT`.

- [ ] **Step 3: Update the aggregate interfaces.** In `StormPerCountyAggregate` remove `extreme_wind_event_count`. In `StormCorpusSummary` add:

```ts
  /** Distinct named tropical cyclones (hurricane / TS / TD) affecting the footprint in the trailing 10yr window. Dedup key = UPPER(name)|year. */
  distinct_tropical_cyclones_10yr: number;
  /** Proper name of the most recent billion-dollar storm (e.g. "Ian"). Null if not extractable. */
  last_billion_dollar_event_name: string | null;
```

- [ ] **Step 4: Rewrite `aggregateStormRows` body.** Replace per-county `extremeWind10yr` with corpus-level distinct-cyclone tracking, use `normalizeCounty`, capture the billion-dollar name. Key diffs:

```ts
  // remove `extremeWind10yr` from the perCountyMap bucket shape + init.
  const tropicalCycloneKeys = new Set<string>();   // corpus-level distinct count
  let lastBillionName: string | null = null;

  for (const row of rows) {
    const isoDate = parseNoaaDate(row.begin_date_time);
    // ...year tracking unchanged...
    const county = normalizeCounty(row.cz_name);          // <-- was row.cz_name.toUpperCase().trim()
    if (county) countiesCovered.add(county);
    // ...damage parse unchanged...
    const eventType = row.event_type?.trim() ?? "";
    // ...majorEventTypeCounts unchanged (now matches "Hurricane (Typhoon)")...

    if (
      damage != null && damage >= BILLION_DOLLAR_USD &&
      isoDate != null && (lastBillionDate == null || isoDate > lastBillionDate)
    ) {
      lastBillionDate = isoDate;
      lastBillionType = eventType !== "" ? eventType : null;
      lastBillionName = extractStormName(row.episode_narrative, row.event_narrative);
    }

    // distinct tropical cyclones in the 10yr window (corpus-level, NOT per-county).
    if (isoDate != null && TROPICAL_CYCLONE_EVENT_TYPES.has(eventType)) {
      const ts = Date.parse(`${isoDate}T00:00:00Z`);
      if (Number.isFinite(ts) && ts >= tenYearsAgo) {
        const name = extractStormName(row.episode_narrative, row.event_narrative);
        const year = isoDate.slice(0, 4);
        const key = name
          ? `${name.toUpperCase()}|${year}`
          : `episode:${row.episode_id ?? `${eventType}|${isoDate}`}`;
        tropicalCycloneKeys.add(key);
      }
    }

    if (!county || !perCountyMap.has(county)) continue;
    const bucket = perCountyMap.get(county)!;
    bucket.total += 1;
    // major + damage10yr unchanged; DELETE the extremeWind10yr block.
    if (isoDate != null) {
      const ts = Date.parse(`${isoDate}T00:00:00Z`);
      if (Number.isFinite(ts) && ts >= tenYearsAgo && damage != null && damage > 0) {
        bucket.damage10yr += 1;
      }
    }
  }
```

In the `perCounty` map output, drop `extreme_wind_event_count`. In the `corpus` object add:

```ts
    distinct_tropical_cyclones_10yr: tropicalCycloneKeys.size,
    last_billion_dollar_event_name: lastBillionName,
```

- [ ] **Step 5: Update source tests.** In `storm-history-source.test.mts`:
  - Line ~60: replace `assert.equal(typeof n["extreme_wind_event_count"], "number");` with **nothing** (delete) — the field is gone.
  - Replace the corpus billion-dollar test body (the "Ian is in the LIVE Parquet only" comment + null-or-string assertion) with:

```ts
  // Fixture now contains Hurricane Ian (2022) — billion-dollar event IS present.
  assert.equal(typeof n["last_billion_dollar_event_date"], "string");
  assert.equal(n["last_billion_dollar_event_name"], "Ian");
  assert.ok((n["distinct_tropical_cyclones_10yr"] as number) >= 1);
  assert.deepEqual(n["counties_covered"], ["CHARLOTTE", "COLLIER", "LEE"]);
```

### 4B — Pack

- [ ] **Step 6: Rename in `storm-history-swfl.mts`.**
  - `StormSnapshot`: `swflExtremeWindEvents10yr` → `swflDistinctTropicalCyclones10yr`.
  - `buildSnapshot`: set it from `corpus.distinct_tropical_cyclones_10yr` (NOT a per-county reduce):

```ts
    swflDistinctTropicalCyclones10yr: corpus.distinct_tropical_cyclones_10yr,
```
  - Rename the exported fn + keep the threshold:

```ts
export function directionFromTropicalCyclones(
  cycloneCount: number,
): "bearish" | "neutral" {
  return cycloneCount >= TROPICAL_CYCLONE_BEARISH_THRESHOLD ? "bearish" : "neutral";
}
```
   and `const TROPICAL_CYCLONE_BEARISH_THRESHOLD = 3;` (replaces `EXTREME_WIND_BEARISH_THRESHOLD`). Update the call site in `stormOutputProducer`.

- [ ] **Step 7: Replace the metric + add the name metric.** Swap the `storm_extreme_wind_events_10yr` `key_metrics.push` for:

```ts
  key_metrics.push({
    metric: "storm_tropical_cyclones_10yr",
    value: snapshot.swflDistinctTropicalCyclones10yr,
    direction: "stable",
    label:
      "SWFL tropical cyclones — distinct hurricanes / tropical storms affecting the footprint, trailing 10-year window",
    variable_type: "extensive",
    units: "storms",
    display_format: "count",
    source: sourceMeta,
  });
```

  Add a `billionDollarLabel` helper near the top of the file and use it for both the fact and the metric/conclusion:

```ts
function billionDollarLabel(c: StormCorpusSummary): string {
  const type = (c.last_billion_dollar_event_type ?? "storm").replace(/\s*\(Typhoon\)\s*/i, "");
  return c.last_billion_dollar_event_name ? `${type} ${c.last_billion_dollar_event_name}` : type;
}
```
  - `stormCorpusSummary` billion-dollar fact value → ``Last billion-dollar event in the SWFL footprint: ${billionDollarLabel(corpus)} on ${corpus.last_billion_dollar_event_date}.``
  - `stormOutputProducer` conclusion `Most recent billion-dollar event in scope:` → use `billionDollarLabel(corpus)`.
  - In the billion-dollar `if` block, after the `_type` metric, add (only when a name exists):

```ts
    if (corpus.last_billion_dollar_event_name) {
      key_metrics.push({
        metric: "storm_last_billion_dollar_event_name",
        value: corpus.last_billion_dollar_event_name,
        direction: "stable",
        label: "Most recent SWFL billion-dollar storm — proper name",
        variable_type: "categorical",
        source: sourceMeta,
      });
    }
```

- [ ] **Step 8: Fix the conclusion/caveat wording** that referenced "hurricane-force wind (>= 74 kt)" and "absence of named storms":
  - Conclusion trailing clause → ``${snapshot.swflDistinctTropicalCyclones10yr.toLocaleString()} distinct tropical cyclones in the trailing 10-year window — ${direction} read on near-term physical risk.``
  - Replace the `>= 74 kt` direction caveat with: ``Direction is bearish when >= 3 distinct named tropical cyclones (hurricane / tropical storm / depression) affected the SWFL footprint in the trailing 10-year window; neutral otherwise. This brain never emits bullish — it is a backward-looking hazard record. For SWFL this threshold is effectively always met (Irma 2017, Ian 2022, Helene + Milton 2024), so the brain reads structurally bearish on physical risk by design.``

- [ ] **Step 9: Update pack tests** in `storm-history-swfl.test.mts`:
  - Import `directionFromTropicalCyclones` instead of `directionFromExtremeWind`; update the 4 assertions (same 0/2→neutral, 3/50→bearish).
  - The `>= 6 key_metrics` assertion: with the fixture now carrying Ian, the 2 billion-dollar metrics + the name metric appear, so assert `>= 7`. Add a check that a `storm_last_billion_dollar_event_name` metric exists with value `"Ian"` and that a `storm_tropical_cyclones_10yr` metric exists.
  - The direction assertion `bearish || neutral` stays valid.

### 4C — Vocab (`refinery/vocab/brain-vocabulary.json`)

- [ ] **Step 10: Rename the concept** (lines ~1941-1968). Replace the `env_storm_extreme_wind_events_10yr_swfl` block with:

```json
    "env_storm_tropical_cyclones_10yr_swfl": {
      "id": "env_storm_tropical_cyclones_10yr_swfl",
      "prefLabel": "SWFL Tropical Cyclones Affecting the Footprint (10-Year Window)",
      "altLabels": ["SWFL hurricanes 10yr", "distinct tropical cyclones SWFL"],
      "raw_slugs": ["storm_tropical_cyclones_10yr"],
      "category": "environmental",
      "domain": ["environmental", "real-estate"],
      "source_brains": ["storm-history-swfl"],
      "value_type": "count",
      "unit": "storms",
      "value_range": [0, 100],
      "direction_concept": "qual_metric_trajectory",
      "status": "active",
      "scope_note": "Count of DISTINCT named tropical cyclones (hurricane / tropical storm / tropical depression) that affected LEE+COLLIER+CHARLOTTE in the trailing 10-year window, deduped corpus-wide by UPPER(name)|year (Ian 2022 = 1, not 6 zone rows). Drives storm-history-swfl's bearish/neutral direction: >= 3 flips bearish. NOTE: for SWFL this is effectively always met (Irma 2017, Ian 2022, Helene + Milton 2024) — the brain reads structurally bearish on physical risk by design. Replaces the retired storm_extreme_wind_events_10yr slug, which counted MAGNITUDE>=74 kt rows and read 0 because NOAA logs hurricanes with a null magnitude."
    },
```

- [ ] **Step 11: Add the name concept** immediately after `env_storm_last_billion_dollar_event_type_swfl` (line ~2079):

```json
    "env_storm_last_billion_dollar_event_name_swfl": {
      "id": "env_storm_last_billion_dollar_event_name_swfl",
      "prefLabel": "Most Recent SWFL Billion-Dollar Storm — Proper Name",
      "altLabels": ["last $1B storm name"],
      "raw_slugs": ["storm_last_billion_dollar_event_name"],
      "category": "environmental",
      "domain": ["environmental", "real-estate"],
      "source_brains": ["storm-history-swfl"],
      "value_type": "string",
      "direction_concept": "qual_metric_trajectory",
      "status": "active",
      "scope_note": "Proper name (e.g. 'Ian', 'Charley') of the most recent SWFL billion-dollar storm, extracted from the NOAA EPISODE/EVENT narrative. Pairs with the date + type concepts so the read says 'Hurricane Ian on 2022-09-28' instead of a nameless 'Hurricane on <date>'. Null when no billion-dollar event exists in the corpus."
    },
```

- [ ] **Step 12: Update the `slug_index`** (lines ~7810-7817): change
  `"storm_extreme_wind_events_10yr": "env_storm_extreme_wind_events_10yr_swfl",` →
  `"storm_tropical_cyclones_10yr": "env_storm_tropical_cyclones_10yr_swfl",`
  and add `"storm_last_billion_dollar_event_name": "env_storm_last_billion_dollar_event_name_swfl",`.
  Also update the `env_storm_last_billion_dollar_event_type_swfl` `scope_note` to note Ian 2022 is now the live answer.

### 4D — Constitution (`refinery/constitution/real-estate.mts` + `.test.mts`)

- [ ] **Step 13: Rename the metric constant + threshold + doc comment** (lines ~146-188):

```ts
const STORM_TROPICAL_CYCLONE_METRIC = "storm_tropical_cyclones_10yr";
const STORM_TROPICAL_CYCLONE_THRESHOLD = 3;
```
  Update `condition` to find `m.metric === STORM_TROPICAL_CYCLONE_METRIC` and compare `>= STORM_TROPICAL_CYCLONE_THRESHOLD`. Rewrite the doc comment: the modifier now fires when storm-history-swfl emits `>= 3` distinct tropical cyclones in 10yr — note this is **intentionally near-permanent for SWFL** (active-storm climate); the caveat flags that permit z-scores may be storm-rebuild-inflated. (Behavior — priority 70, `add_caveat`, brain_id-scoped — unchanged.)

- [ ] **Step 14: Update `real-estate.test.mts`** (lines ~209, 226, 269, 298): replace `storm_extreme_wind_events_10yr` with `storm_tropical_cyclones_10yr` in the `metric(...)` builders and comments. The threshold (3) and pass/fail expectations are unchanged.

### 4E — Verify + atomic commit

- [ ] **Step 15: Run the full storm + constitution test surface — expect PASS:**

Run: `bun test refinery/sources/storm-history-source.test.mts refinery/packs/storm-history-swfl.test.mts refinery/constitution/real-estate.test.mts`
Expected: all PASS (Ian present in fixture; rename consistent).

- [ ] **Step 16: Run vocab coverage (mandatory `--all`) — expect no orphans:**

Run: `bun refinery/tools/check-vocab-coverage.mts --all`
Expected: no orphan for `storm_tropical_cyclones_10yr` / `storm_last_billion_dollar_event_name`; no dangling `storm_extreme_wind_events_10yr`.

- [ ] **Step 17: Commit (atomic):**

```bash
git add refinery/sources/storm-history-source.mts refinery/sources/storm-history-source.test.mts \
        refinery/packs/storm-history-swfl.mts refinery/packs/storm-history-swfl.test.mts \
        refinery/vocab/brain-vocabulary.json \
        refinery/constitution/real-estate.mts refinery/constitution/real-estate.test.mts \
        refinery/__fixtures__/storm-history-swfl.sample.parquet \
        ingest/duckdb_pipelines/storm_history_swfl/make_fixture.py
git commit -m "fix(storm-history): surface Hurricane Ian; rename extreme-wind slug

Source: normalize zone->county, count distinct named tropical cyclones (10yr,
dedup UPPER(name)|year), extract storm name from narratives, fix MAJOR_EVENT_TYPES.
Pack: rename storm_extreme_wind_events_10yr -> storm_tropical_cyclones_10yr,
add storm_last_billion_dollar_event_name, render 'Hurricane Ian on 2022-09-28' (A2).
Vocab + real-estate constitution refs renamed same commit (no dangling slug).
Fixture regenerated to actually contain Ian (the old one falsely claimed to)."
```

---

## Task 5: Regenerate generated docs + rendered brain; full verification

**Files:**
- Modify (generated): `docs/semantic-ledger.md`
- Modify (generated): `brains/storm-history-swfl.md`

- [ ] **Step 1: Regenerate the semantic ledger:**

Run: `npm run ledger`
Expected: `docs/semantic-ledger.md` now lists `env_storm_tropical_cyclones_10yr_swfl` + the name concept; no `extreme_wind` rows remain.

- [ ] **Step 2: Rebuild the brain locally (target-only to avoid the cre-swfl egress hang):**

Run: `npm run refinery -- storm-history-swfl --target-only`
Expected: `brains/storm-history-swfl.md` regenerated. Read it back and confirm: direction `bearish`; a `storm_tropical_cyclones_10yr` metric > 0; billion-dollar reads **"Hurricane Ian on 2022-09-28"**; a `storm_last_billion_dollar_event_name` = "Ian" metric present. (Local build uses fixture unless S3 creds are set — the fixture now contains Ian, so the shape is correct even offline.)

- [ ] **Step 3: Run the Gate-5 catalog mirror + typecheck sanity:**

Run: `bun test refinery/packs/catalog.test.mts`
Expected: PASS (catalog ⇆ registry on id/domain/scope/ttl — unchanged for this pack).

- [ ] **Step 4: Commit the generated artifacts:**

```bash
git add docs/semantic-ledger.md brains/storm-history-swfl.md
git commit -m "chore(storm-history): regen semantic-ledger + brain md after Ian fix"
```

---

## Task 6: Ship — SESSION_LOG, build-queue, push, post-merge live re-ingest

**Files:**
- Modify: `SESSION_LOG.md`
- Modify (if listed): `_AUDIT_AND_ROADMAP/build-queue.md`

- [ ] **Step 1: Prepend a SESSION_LOG entry** (newest-first) summarizing: root cause (zone-row ingest filter dropped Ian), the fixes (filter + guard, distinct-cyclone rename, storm-name A2), and the pending post-merge `workflow_dispatch`. Reference the spec + this plan.

- [ ] **Step 2: Reconcile build-queue / checks** if A1/A2 are tracked there (mark in-progress `[~]` → done `[x]` as appropriate); open a `check.mjs` follow-up for the live re-ingest verification, e.g.:

```bash
node scripts/check.mjs open storm-history storm_ian_live_verify "Verify live parquet re-ingested with zone rows; storm read shows Ian + bearish" --detail "after workflow_dispatch on storm-history-monthly"
```

- [ ] **Step 3: Push via safe-push (worktree lands on main):**

Run: `node scripts/safe-push.mjs`  (or, on the worktree branch, `git push origin HEAD:main` — pre-push hooks still fire: vocab `--all`, Gate 4 ingest guard, Gate 5 pack⇆catalog, SESSION_LOG.)
Expected: gates green; push succeeds. **Do not push without operator confirmation** (no-autonomous-push rule).

- [ ] **Step 4: After merge — dispatch the live re-ingest:**

Run: `gh workflow run storm-history-monthly.yml`
Then watch the run; confirm the volume guard passes (logs `staged rows … hurricane/TS: N`) and the parquet is rewritten. Once the next refinery rebuild runs, the client-facing read shows Ian + bearish. Close `storm_ian_live_verify` only on the live runtime signal (not on "code looks right").

---

## Self-Review

**Spec coverage:**
- A1 ingest filter → Task 1 ✓ · volume guard (BIBLE §0.2) → Task 1 ✓ · zone→county → Task 2/4A ✓ · distinct-cyclone metric + dedup key → Task 4A ✓ · MAJOR_EVENT_TYPES → Task 4A ✓ · slug rename + vocab + constitution (atomic) → Task 4B/C/D ✓ · A2 storm name → Task 2 + 4B ✓ · fixture regen → Task 3/4 ✓ · tests → Task 1/2/4 ✓ · generated docs → Task 5 ✓ · live dispatch → Task 6 ✓ · Flag-1 threshold doc → Task 4B Step 8 + vocab Step 10 ✓ · Flag-2 dedup key → Task 4A Step 4 ✓.

**Placeholder scan:** none — every step shows the actual code/command/expected output.

**Type consistency:** `swflDistinctTropicalCyclones10yr` (snapshot), `distinct_tropical_cyclones_10yr` (corpus), `storm_tropical_cyclones_10yr` (slug), `directionFromTropicalCyclones`, `STORM_TROPICAL_CYCLONE_METRIC`/`_THRESHOLD`, `last_billion_dollar_event_name` — used consistently across source, pack, vocab, constitution, and tests. `normalizeCounty`/`extractStormName` defined in Task 2, consumed in Task 4A.
