# Lee Homes-Only Sold Median per ZIP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 6 tasks, 17 files, keywords: migration, schema, architecture

**Goal:** Ship a homes-only sold median per ZIP for Lee County, computed from LeePA recorded-deed data already in the lake, surfaced through the `properties-lee-value` brain.

**Architecture:** Lee's sold prices + use codes are already live in `data_lake.leepa_parcels` (528,130/548,798 priced, `use_code` separates homes from land). The one missing dimension is ZIP — not a column in the LeePA source, so we derive `folioid → zip_code` by a DuckDB spatial join of LeePA parcel centroids against the TIGER ZCTA polygons already in the repo (`public/maps/fl_zips.geojson`), landing `data_lake.leepa_parcel_zip`. A Postgres view `data_lake.leepa_sold_median_by_zip` then computes the homes-only, arm's-length, 2024+ median per ZIP with a min-N=20 county fallback. The pack reads the view (pure reader, aggregate-at-source).

**Tech Stack:** Python (dlt + DuckDB spatial), Postgres/Supabase views, TypeScript refinery pack/source (bun).

**Spec:** `docs/superpowers/specs/2026-07-11-homes-only-sold-median-design.md`. Collier is a documented fast-follow, NOT in this plan (blocked on `collier_parcels_fdor_query_lockdown`).

## Global Constraints

- **Homes-only headline set:** `use_code IN ('01','04')` (single-family + condo). Full home set available: `01,02,04,05,07,08` (maps to the canonical `DOR_HOME_TYPE` authority in `ingest/pipelines/parcel_subdivision/constants.py`; LeePA 2-digit ↔ FDOR 3-digit via `int(code)`). Vacant residential `00` is ALWAYS excluded.
- **Arm's-length:** LeePA layer 10 is already "Last Qualified Sale"; ADD a price floor `last_sale_amount > 20000` (drops the 7.9% nominal-consideration tail). Both apply.
- **Recency:** `last_sale_date >= '2024-01-01'` (each parcel's latest qualified sale — a stock of most-recent prices, NOT a transaction-flow median).
- **Min-N gate:** a ZIP with `< 20` qualifying sales reports the **county median, flagged `county_fallback = true`** — never a raw sub-20 ZIP median.
- **ZIP provenance (G1):** site ZIP only (parcel centroid), never a mailing ZIP.
- **G3 / atomic:** the consuming metric + view ship in the SAME PR as the new table. Vocab slugs a pack can emit register in `refinery/brain-vocabulary.json` in the SAME commit (`bun refinery/tools/check-vocab-coverage.mts --all`).
- **Citation:** customer-facing source string = "Lee County Property Appraiser (recorded deeds)". No vendor/MLS id, no internal ids/§/tokens (display-leak + speaker-hygiene).
- **As-of:** Lee snapshot date, MM/DD/YYYY, stated once (RULE 5).
- **Verify with `bunx next build`**, not `npx tsc`. SQL migrations run via `new Bun.SQL` (psql not installed). After any new table/view: `GRANT SELECT ON ALL TABLES IN SCHEMA data_lake TO service_role; NOTIFY pgrst,'reload schema';`
- **Pipeline-freshness:** the new ingest ships its GHA cron wrapper + `--dry-run` in the same PR; add its `cadence_registry.yaml` entry.

---

### Task 0: ZIP-source probe (decide the crosswalk mechanism)

Non-TDD orientation task. Confirms the default centroid→ZCTA path is viable and checks for a cheaper LeePA situs shortcut before building. Run with the crawl4ai venv python (`C:\Users\ethan\crawl4ai-venv\Scripts\python.exe`) which has `requests`.

**Files:** none (throwaway probe in scratchpad).

- [ ] **Step 1: Confirm LeePA layer 12 serves polygon geometry** (the centroid source)

```python
import requests
BASE = "https://gissvr.leepa.org/gissvr/rest/services/ParcelInfo/MapServer/12/query"
r = requests.get(BASE, params={"where": "1=1", "outFields": "FOLIOID",
     "resultRecordCount": 1, "returnGeometry": "true", "f": "geojson"}, timeout=60).json()
print(r["features"][0]["geometry"]["type"], "| FOLIOID:", r["features"][0]["properties"].get("FOLIOID"))
# Expected: "Polygon" (or "MultiPolygon") and a FOLIOID value.
```

- [ ] **Step 2: Confirm fl_zips.geojson carries Lee ZCTAs with polygon geometry**

```bash
C:/Users/ethan/crawl4ai-venv/Scripts/python.exe -c "import json; d=json.load(open('public/maps/fl_zips.geojson')); \
lee=[f['properties']['ZCTA5CE10'] for f in d['features'] if f['properties']['ZCTA5CE10'].startswith(('339','341','336'))]; \
print('features:', len(d['features']), '| sample Lee ZCTAs:', sorted(set(lee))[:8]); \
print('geom type:', d['features'][0]['geometry']['type'])"
# Expected: several thousand features, Lee ZCTAs present (33901, 33903, 33904, 33990, ...), geometry Polygon/MultiPolygon.
```

- [ ] **Step 3: Confirm DuckDB spatial extension loads + does point-in-polygon**

```bash
C:/Users/ethan/crawl4ai-venv/Scripts/python.exe -c "import duckdb; c=duckdb.connect(); c.execute('INSTALL spatial; LOAD spatial;'); \
print(c.execute(\"SELECT ST_Contains(ST_GeomFromText('POLYGON((0 0,0 2,2 2,2 0,0 0))'), ST_Point(1,1))\").fetchone())"
# Expected: (True,). If INSTALL fails offline, note it — the pipeline's GHA step must run INSTALL with network.
```

- [ ] **Step 4: (optional shortcut) probe for a LeePA situs/ZIP export.** Skim the LeePA open-data / downloads page for a parcel file carrying a site ZIP keyed to FOLIOID. If one exists and joins on FOLIOID, it replaces Task 1's spatial join with a plain table load. If not found in ~10 min, proceed with the centroid→ZCTA path (Task 1 as written). Record the decision in the PR description.

- [ ] **Step 5: Record outcome.** Write one line to `SESSION_LOG.md` staging notes (not committed yet): "ZIP mechanism = centroid→ZCTA (default) / LeePA situs export (found at <url>)".

---

### Task 1: Lee parcel→ZIP crosswalk pipeline (`data_lake.leepa_parcel_zip`)

**Files:**
- Create: `ingest/pipelines/leepa_parcel_zip/__init__.py`
- Create: `ingest/pipelines/leepa_parcel_zip/constants.py`
- Create: `ingest/pipelines/leepa_parcel_zip/spatial.py` (pure, testable point-in-polygon assign)
- Create: `ingest/pipelines/leepa_parcel_zip/pipeline.py`
- Test: `ingest/tests/pipelines/leepa_parcel_zip/test_spatial.py`

**Interfaces:**
- Produces: table `data_lake.leepa_parcel_zip` with columns `folioid TEXT PK, zip_code TEXT, method TEXT` (method = 'centroid_zcta'). Consumed by Task 2's view join `ON z.folioid = p.folioid`.
- Produces (Python): `assign_zip(centroids: list[dict], zcta_geojson: dict) -> list[dict]` where each input `{ "folioid": str, "lon": float, "lat": float }` maps to `{ "folioid": str, "zip_code": str|None, "method": "centroid_zcta" }`.

- [ ] **Step 1: constants.py** — pin the source + asset path.

```python
LEEPA_JUST_VALUE_URL = "https://gissvr.leepa.org/gissvr/rest/services/ParcelInfo/MapServer/12/query"
# TIGER ZCTA polygons already in the repo (see ingest/utils/zip_approx.py provenance).
import os
ZCTA_ASSET_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "public", "maps", "fl_zips.geojson")
)
PAGE_SIZE = 2000
```

- [ ] **Step 2: Write the failing test** for the spatial assignment (DuckDB spatial, isolated with a fake 2-ZCTA GeoJSON).

```python
# ingest/tests/pipelines/leepa_parcel_zip/test_spatial.py
from ingest.pipelines.leepa_parcel_zip.spatial import assign_zip

_ZCTA = {"type": "FeatureCollection", "features": [
    {"type": "Feature", "properties": {"ZCTA5CE10": "33901"},
     "geometry": {"type": "Polygon", "coordinates": [[[-82.0, 26.6], [-82.0, 26.7], [-81.9, 26.7], [-81.9, 26.6], [-82.0, 26.6]]]}},
    {"type": "Feature", "properties": {"ZCTA5CE10": "34102"},
     "geometry": {"type": "Polygon", "coordinates": [[[-81.8, 26.1], [-81.8, 26.2], [-81.7, 26.2], [-81.7, 26.1], [-81.8, 26.1]]]}},
]}

def test_point_inside_zcta_gets_that_zip():
    out = assign_zip([{"folioid": "A", "lon": -81.95, "lat": 26.65}], _ZCTA)
    assert out == [{"folioid": "A", "zip_code": "33901", "method": "centroid_zcta"}]

def test_point_outside_all_zctas_gets_none():
    out = assign_zip([{"folioid": "B", "lon": 0.0, "lat": 0.0}], _ZCTA)
    assert out == [{"folioid": "B", "zip_code": None, "method": "centroid_zcta"}]
```

- [ ] **Step 3: Run it, verify it fails**

Run: `C:/Users/ethan/crawl4ai-venv/Scripts/python.exe -m pytest ingest/tests/pipelines/leepa_parcel_zip/test_spatial.py -v`
Expected: FAIL — module `spatial` not found.

- [ ] **Step 4: Implement `spatial.py`** (DuckDB point-in-polygon).

```python
# ingest/pipelines/leepa_parcel_zip/spatial.py
from __future__ import annotations
import json, tempfile, os
import duckdb

def assign_zip(centroids: list[dict], zcta_geojson: dict) -> list[dict]:
    """Point-in-polygon each parcel centroid against ZCTA polygons via DuckDB spatial.
    centroids: [{folioid, lon, lat}]. Returns [{folioid, zip_code|None, method}]."""
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    with tempfile.TemporaryDirectory() as td:
        zpath = os.path.join(td, "zcta.geojson")
        with open(zpath, "w") as f:
            json.dump(zcta_geojson, f)
        con.execute("CREATE TABLE zcta AS SELECT ZCTA5CE10 AS zip_code, geom FROM ST_Read(?)", [zpath])
        con.execute("CREATE TABLE pts(folioid TEXT, lon DOUBLE, lat DOUBLE)")
        con.executemany("INSERT INTO pts VALUES (?,?,?)",
                        [(c["folioid"], c["lon"], c["lat"]) for c in centroids])
        rows = con.execute(
            """SELECT p.folioid, z.zip_code
                 FROM pts p LEFT JOIN zcta z
                   ON ST_Contains(z.geom, ST_Point(p.lon, p.lat))"""
        ).fetchall()
    return [{"folioid": f, "zip_code": z, "method": "centroid_zcta"} for (f, z) in rows]
```

- [ ] **Step 5: Run it, verify it passes**

Run: `C:/Users/ethan/crawl4ai-venv/Scripts/python.exe -m pytest ingest/tests/pipelines/leepa_parcel_zip/test_spatial.py -v`
Expected: PASS (2 tests).

- [ ] **Step 6: Implement `pipeline.py`** — pull L12 geometry, compute centroids, assign, merge to Tier 2. Mirrors `collier_parcels` chunked-merge pattern.

```python
# ingest/pipelines/leepa_parcel_zip/pipeline.py
from __future__ import annotations
import json
import requests
from ingest.pipelines.leepa_parcel_zip.constants import LEEPA_JUST_VALUE_URL, ZCTA_ASSET_PATH, PAGE_SIZE
from ingest.pipelines.leepa_parcel_zip.spatial import assign_zip

_TIER2_COLUMNS = {
    "folioid":  {"data_type": "text", "nullable": False, "primary_key": True},
    "zip_code": {"data_type": "text", "nullable": True},
    "method":   {"data_type": "text", "nullable": True},
}

def _ring_centroid(geom: dict) -> tuple[float, float] | None:
    """Mean of the outer-ring vertices — adequate ZIP-grain centroid (not area-weighted)."""
    if not geom:
        return None
    coords = geom.get("coordinates") or []
    ring = coords[0][0] if geom.get("type") == "MultiPolygon" else (coords[0] if coords else None)
    if not ring:
        return None
    xs = [p[0] for p in ring]; ys = [p[1] for p in ring]
    return (sum(xs) / len(xs), sum(ys) / len(ys))

def fetch_centroids() -> list[dict]:
    out, offset = [], 0
    while True:
        r = requests.get(LEEPA_JUST_VALUE_URL, params={
            "where": "1=1", "outFields": "FOLIOID", "returnGeometry": "true",
            "f": "geojson", "resultRecordCount": PAGE_SIZE, "resultOffset": offset,
        }, timeout=120)
        r.raise_for_status()
        data = r.json()
        feats = data.get("features", [])
        if not feats:
            break
        for ft in feats:
            fid = (ft.get("properties") or {}).get("FOLIOID")
            c = _ring_centroid(ft.get("geometry"))
            if fid and c:
                out.append({"folioid": str(fid), "lon": c[0], "lat": c[1]})
        if not data.get("exceededTransferLimit", False):
            break
        offset += len(feats)
    return out

def _make_resource(chunk: list[dict]):
    import dlt
    @dlt.resource(table_name="leepa_parcel_zip", write_disposition="merge",
                  primary_key="folioid", columns=_TIER2_COLUMNS)
    def rows():
        yield from chunk
    return rows

def ingest_leepa_parcel_zip() -> int:
    centroids = fetch_centroids()
    if not centroids:
        print("leepa_parcel_zip: 0 centroids — aborting")
        return 0
    with open(ZCTA_ASSET_PATH) as f:
        zcta = json.load(f)
    rows = assign_zip(centroids, zcta)
    import dlt
    pipeline = dlt.pipeline(pipeline_name="leepa_parcel_zip", destination="postgres", dataset_name="data_lake")
    for i in range(0, len(rows), 5000):
        pipeline.run(_make_resource(rows[i:i+5000])()).raise_on_failed_jobs()
    matched = sum(1 for r in rows if r["zip_code"])
    print(f"leepa_parcel_zip: {matched}/{len(rows)} parcels matched a ZCTA")
    return len(rows)
```

- [ ] **Step 7: Add `--dry-run` + `__init__.py`.** In `pipeline.py` add a `if __name__ == "__main__"` guard that honors `--dry-run` (fetch + assign, print match rate, skip the dlt merge) — copy the guard shape from `ingest/pipelines/collier_parcels/pipeline.py`. Create empty `__init__.py` in the pipeline + test dirs.

- [ ] **Step 8: Commit**

```bash
git add ingest/pipelines/leepa_parcel_zip ingest/tests/pipelines/leepa_parcel_zip
git commit -m "feat(ingest): leepa_parcel_zip crosswalk (centroid->ZCTA spatial join)"
```

---

### Task 2: Postgres median view `data_lake.leepa_sold_median_by_zip`

**Files:**
- Create: `docs/sql/20260711_leepa_sold_median_by_zip.sql`
- Create: `docs/sql/leepa_parcel_zip_grant.sql`

**Interfaces:**
- Produces: view with columns `zip_code TEXT, home_sales_n INT, median_sale NUMERIC, county_fallback BOOL, county_median NUMERIC, county_n INT`. Consumed by Task 3's source connector.

- [ ] **Step 1: Write the migration SQL**

```sql
-- docs/sql/20260711_leepa_sold_median_by_zip.sql
CREATE OR REPLACE VIEW data_lake.leepa_sold_median_by_zip AS
WITH eligible AS (
  SELECT z.zip_code, p.last_sale_amount
  FROM data_lake.leepa_parcels p
  JOIN data_lake.leepa_parcel_zip z ON z.folioid = p.folioid
  WHERE p.use_code IN ('01','04')            -- SF + condo (headline home set)
    AND p.last_sale_date >= DATE '2024-01-01'
    AND p.last_sale_amount > 20000           -- arm's-length price floor (drops nominal tail)
    AND z.zip_code IS NOT NULL
),
county AS (
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY last_sale_amount) AS county_median,
         count(*)::int AS county_n
  FROM eligible
),
by_zip AS (
  SELECT zip_code, count(*)::int AS home_sales_n,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY last_sale_amount) AS zip_median
  FROM eligible GROUP BY zip_code
)
SELECT b.zip_code, b.home_sales_n,
       round(CASE WHEN b.home_sales_n >= 20 THEN b.zip_median ELSE c.county_median END) AS median_sale,
       (b.home_sales_n < 20) AS county_fallback,
       round(c.county_median) AS county_median,
       c.county_n
FROM by_zip b CROSS JOIN county c
ORDER BY b.zip_code;
```

```sql
-- docs/sql/leepa_parcel_zip_grant.sql
GRANT SELECT ON ALL TABLES IN SCHEMA data_lake TO service_role;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply both via Bun.SQL** (psql is not installed).

Run:
```bash
bun -e "const {SQL}=require('bun'); const sql=new SQL(process.env.SUPABASE_DB_URL+'?sslmode=require'); \
await sql.file('docs/sql/20260711_leepa_sold_median_by_zip.sql'); await sql.file('docs/sql/leepa_parcel_zip_grant.sql'); \
console.log('applied'); await sql.end();"
```
Expected: `applied`. (Requires `data_lake.leepa_parcel_zip` to exist — run Task 1's pipeline against prod first, or apply the view after the pipeline lands. If the table is absent the view still creates but returns 0 rows.)

- [ ] **Step 3: Verify correctness — the whole point of the build (right data = green)**

Run (via lake MCP `query_lake` or Bun.SQL):
```sql
SELECT zip_code, home_sales_n, median_sale, county_fallback
FROM data_lake.leepa_sold_median_by_zip
WHERE zip_code IN ('33972','33901','33904') ORDER BY zip_code;
```
Expected: ZIP 33972 (Lehigh Acres) `median_sale` in the **~$300k–$360k** band (homes-only) — NOT ~$35k (the land-blended active-asking number). `county_median` ≈ $385,000. Any ZIP with `home_sales_n < 20` shows `county_fallback = true` and `median_sale = county_median`.

- [ ] **Step 4: Commit**

```bash
git add docs/sql/20260711_leepa_sold_median_by_zip.sql docs/sql/leepa_parcel_zip_grant.sql
git commit -m "feat(sql): leepa_sold_median_by_zip view (homes-only, arm's-length, min-N county fallback)"
```

---

### Task 3: Source connector + fixture

**Files:**
- Create: `refinery/sources/leepa-sold-median-source.mts`
- Create: `refinery/__fixtures__/leepa-sold-median.sample.json`
- Test: `refinery/sources/leepa-sold-median-source.test.mts`

**Interfaces:**
- Produces (consumed by Task 4): exported `leepaSoldMedianSource` plus normalized types `LeepaSoldMedianSummaryNormalized` (`{ kind: "leepa-sold-median-summary", county_median: number, county_n: number, as_of: string }`) and `LeepaSoldMedianZipRowNormalized` (`{ kind: "leepa-sold-median-zip-row", zip: string, home_sales_n: number, median_sale: number, county_fallback: boolean }`).

- [ ] **Step 1: Model the connector on the existing collier parcels source.** Read `refinery/sources/collier-parcels-source.mts` and mirror its shape (live REST url on `${supabaseUrl}/rest/v1/leepa_sold_median_by_zip`, fixture fallback, one summary fragment + one fragment per ZIP row). Use `env.source`/`env.supabaseUrl` from `../config/env.mts`.

- [ ] **Step 2: Write the fixture** with 33972-style land-heavy + a normal ZIP + a sub-20 fallback ZIP, and a county summary — values consistent with the view (33972 ≈ $330k homes-only, county ≈ $385k).

- [ ] **Step 3: Write the failing test** — asserts the source emits one summary fragment (`county_median === 385000`-ish from fixture) and N zip-row fragments, and that a `county_fallback: true` row carries `median_sale === county_median`.

- [ ] **Step 4: Run it, verify it fails** — `bun test refinery/sources/leepa-sold-median-source.test.mts` → FAIL (module missing).

- [ ] **Step 5: Implement the connector** to pass. Keep the `kind` strings exact (Task 4 matches on them, mirroring the strict `=== kind` discipline in `properties-lee-value.mts`).

- [ ] **Step 6: Run it, verify it passes** — `bun test refinery/sources/leepa-sold-median-source.test.mts` → PASS.

- [ ] **Step 7: Commit**

```bash
git add refinery/sources/leepa-sold-median-source.mts refinery/sources/leepa-sold-median-source.test.mts refinery/__fixtures__/leepa-sold-median.sample.json
git commit -m "feat(refinery): leepa-sold-median source connector + fixture"
```

---

### Task 4: Wire into `properties-lee-value` + fix stale caveat + vocab

**Files:**
- Modify: `refinery/packs/properties-lee-value.mts`
- Modify: `refinery/packs/properties-lee-value.test.mts`
- Modify: `refinery/brain-vocabulary.json`
- Modify: `refinery/packs/catalog.mts` (if the mirror requires it — keep in sync per Gate 5)

**Interfaces:**
- Consumes: `leepaSoldMedianSource` + the two normalized types from Task 3.
- Produces: key metric `lee_sold_median_homes_only` + detail table `lee_sold_median_by_zip`.

- [ ] **Step 1: Add the source** to the pack's `sources: [...]` array and import the connector + types.

- [ ] **Step 2: Write the failing pack test** — build the pack on the fixture; assert (a) a `key_metrics` entry `metric === "lee_sold_median_homes_only"` with `variable_type: "intensive"`, `display_format: "currency"`, value ≈ county median; (b) a `detail_tables` entry `id === "lee_sold_median_by_zip"` with a 33972 row whose median is in the homes band, not ~$35k; (c) the citation string contains "Lee County Property Appraiser" and NO `[config]`/`§`/internal ids.

- [ ] **Step 3: Run it, verify it fails** — `bun test refinery/packs/properties-lee-value.test.mts` → FAIL.

- [ ] **Step 4: Implement** — in `propertyValueCorpusSummary`/`propertyValueOutputProducer`, read the summary + zip-row fragments (strict `=== kind`), push the county metric with a `BrainOutputMetricSource` citation "Lee County Property Appraiser (recorded deeds)…", and a `detail_tables` entry mirroring `collier_parcels_by_zip` (columns: `median_sale` currency, `home_sales_n` count, `county_fallback`; one row per ZIP, `note` states the min-N=20 fallback + as-of).

- [ ] **Step 5: Fix the stale caveat.** Remove/replace the `properties-lee-value.mts` line asserting *"LeePA last_sale_amount is null"* (~line 400) — it is populated (96%). Reword any dependent caveat: LeePA sold data is real; sold median is homes-only, latest-sale-per-parcel (not transaction-flow).

- [ ] **Step 6: Register vocab slugs.** Add `lee_sold_median_homes_only` (+ any detail-table slug the pack emits) to `refinery/brain-vocabulary.json`. Run `bun refinery/tools/check-vocab-coverage.mts --all` → 0 orphans.

- [ ] **Step 7: Run pack + catalog tests** — `bun test refinery/packs/properties-lee-value.test.mts` and `bun test refinery/packs/catalog.test.mts` → PASS.

- [ ] **Step 8: Commit**

```bash
git add refinery/packs/properties-lee-value.mts refinery/packs/properties-lee-value.test.mts refinery/brain-vocabulary.json refinery/packs/catalog.mts
git commit -m "feat(brain): properties-lee-value emits homes-only sold median per ZIP + fix stale null caveat"
```

---

### Task 5: Cadence, freshness, live-verify, and the stale memory fix

**Files:**
- Modify: `ingest/cadence_registry.yaml`
- Create: `.github/workflows/leepa-parcel-zip-monthly.yml` (or fold into an existing LeePA cron)
- Modify: `C:\Users\ethan\.claude\projects\C--Users-ethan-dev-brain-platform\memory\leepa-no-sale-price.md`

- [ ] **Step 1: Add cadence entry** for `leepa_parcel_zip` (30d cadence, matches LeePA; `dlt_schema_name: leepa_parcel_zip`, `freshness_table: data_lake.leepa_parcel_zip`, `expected_rows_min` set from the first real load count). Model on the `collier_parcels` entry.

- [ ] **Step 2: Add the GHA cron wrapper** running `python -m ingest.pipelines.leepa_parcel_zip.pipeline` monthly, with the `crawl4ai-setup`/`playwright install chromium` step ONLY if needed (this pipeline uses plain `requests` + DuckDB, so it likely needs just `pip install -r ingest/requirements.txt` + a DuckDB `INSTALL spatial` with network). Include a `--dry-run` job.

- [ ] **Step 3: Verify end-to-end** (`bunx next build` green; then a live SSR/read check).

Run: `bunx next build`
Expected: green. Then confirm the brain surfaces the metric (rebuild just this brain, never `--force` all):
```bash
gh workflow run daily-rebuild.yml --repo ethanrickyjrjr-wq/SWFL-Data-Gulf -f pack_id=properties-lee-value -f force=true
```

- [ ] **Step 4: Close the live-verify check with evidence** once prod shows the homes-only median (33972 ≈ homes band, not $35k):

```bash
node scripts/check.mjs close homes_only_sold_median_live_verify "Lee homes-only sold median per ZIP live; 33972 reads homes band not land-blend" --evidence "<paste the live view row + brain metric>"
```

- [ ] **Step 5: Correct the stale memory.** Update `leepa-no-sale-price.md`: `last_sale_amount` verified POPULATED live 07/11/2026 (528,130/548,798 = 96%); it now backs the homes-only sold median. The "NULL scare" is resolved — do not re-litigate.

- [ ] **Step 6: SESSION_LOG entry + commit + push** (docs/tooling — but per operator rule, commit locally, show the log, and ASK before `git push`; use `node scripts/safe-push.mjs`).

```bash
git add ingest/cadence_registry.yaml .github/workflows/leepa-parcel-zip-monthly.yml SESSION_LOG.md
git commit -m "chore(ingest): cadence + cron + freshness for leepa_parcel_zip; live-verify"
```

---

## Self-Review (spec coverage)

- Homes-only headline (01/04) + arm's-length floor + 2024+ → Task 2 view. ✓
- Min-N=20 county fallback → Task 2 view + Task 3/4 surfacing. ✓
- Lee ZIP derivation (centroid→ZCTA, site-ZIP G1) → Task 0 probe + Task 1. ✓
- Aggregate-at-source (SQL view, pack is reader) → Task 2 + Task 4. ✓
- Citation/as-of/display-leak → Task 4 (asserted in tests). ✓
- Stale `last_sale_amount` caveat + memory → Task 4 Step 5 + Task 5 Step 5. ✓
- Freshness/cron/vocab/grant/G3 gates → Tasks 2/4/5. ✓
- "Right data = green" acceptance (33972 correctness) → Task 2 Step 3 + Task 5 Step 4. ✓
- Collier — explicitly OUT (fast-follow, tracked). ✓
