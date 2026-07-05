# communities-swfl Phase 1 — Universal Backbone (Spike → Gate → Build) Implementation Plan

> **⚠️ SUPERSEDED 07/05/2026 — the spatial join below is NOT needed.** A live probe proved the
> home→community link is already in every parcel (`S_LEGAL` / `Description`); grouping by that name
> reproduces real community counts within ~7% on a clean built-out community (Heritage Bay), with the
> only gap being sub-neighborhood name fragmentation — the alias reconciler's job, not new infra.
> Evidence + benchmark: `verification/communities-name-join-accuracy.md`. The DuckDB spatial join,
> boundary-polygon ingest, centroid pull, and GO/NO-GO gate in Parts A/B are obsolete. What survives:
> Task 1 (alias reconciler, built + committed), the `neighborhood_stats` aggregation, the pack/page/
> master-wiring tasks, and cadence — now fed by an `S_LEGAL`/`Description` group-by instead of a join.
> This plan will be rewritten to the name-join architecture before further Part-B execution.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 6 tasks, 18 files, keywords: migration, schema, architecture
>
> **Read `docs/superpowers/plans/2026-07-05-communities-swfl.md` first** — it holds the review, the spec-correction ledger, and the Global Constraints that every task below implicitly includes.

**Goal:** Assign every residential parcel in Lee + Collier to its subdivision/neighborhood via a DuckDB spatial join, producing an authoritative home↔neighborhood graph (`parcel_neighborhood`) and per-neighborhood aggregates (`neighborhood_stats`) — gated behind a feasibility spike that proves the join works at scale on both counties.

**Architecture:** Two parts. **Part A** is a throwaway, staging-isolated **feasibility spike** ending at a GO/NO-GO gate — it discovers the boundary endpoints, proves centroid-at-scale pull and DuckDB `ST_Contains`, and sets the X/Y assignment-quality thresholds from real numbers. **Part B** is the TDD production build, executed **only on GO**, referencing the constants Part A discovered. On NO-GO, the program degrades to scraped-community aggregates (Phase 2 ships regardless).

**Tech Stack:** Python (dlt + DuckDB `spatial` extension), ArcGIS FeatureServer REST (free opendata), TypeScript (alias reconciler + Vitest), Supabase Postgres (`data_lake` schema, migrations via `new Bun.SQL`).

## Global Constraints

Inherit **all** of §3 in the program plan. The ones that bite hardest here:
- **Phase 1 uses NO paid APIs** (free ArcGIS + free DuckDB spatial). Fully offline-verifiable; `communities_swfl_live_verify` stays operator-run.
- **Probe is non-destructive:** local DuckDB file + scratch only. **Never** touch prod `data_lake.leepa_parcels` / `collier_parcels` until Part B's guarded type-lift.
- **Probe <1 min** rule: every ArcGIS pull in Part A is a bounded sample, never a full-county fetch.
- **Atomic type-lift ships with backfill** (Task 3); **Gate-4 guard** before any parcel `replace` (both pipelines are `merge` today, so prefer additive `merge` + backfill over `replace`).
- **Brain-first:** the four new lake tables are consumed by the Phase-4 `communities-swfl` pack (same program); each ships with an empty-tolerant reader so nothing orphans in the interim.
- **crawl4ai files gitignored**; probe scripts live in the session scratchpad, never committed.

---

## File Structure

**Part A (spike) — throwaway, NOT committed except the discovered constants + the SESSION_LOG finding:**
- `<scratchpad>/communities-probe/*.py` — throwaway probe scripts (endpoint discovery, centroid pull, DuckDB join, assignment-%).
- Create (committed, the ONE durable spike output): `ingest/pipelines/community_boundaries/constants.py` — the discovered endpoints + CRS + `CO_NO` for Lee.
- `SESSION_LOG.md` — the GO/NO-GO finding with real X/Y numbers.

**Part B (build) — committed:**
- Create: `refinery/lib/subdivision-aliases.mts` — one-to-many platted-name → community-slug reconciler.
- Test: `refinery/lib/subdivision-aliases.test.mts`.
- Create: `ingest/pipelines/community_boundaries/{resources.py,pipeline.py}` — boundary-polygon ingest.
- Test: `ingest/pipelines/community_boundaries/test_resources.py`.
- Modify: `ingest/pipelines/collier_parcels/{constants.py,resources.py}` — add centroid (`lat`,`lon`) columns.
- Modify: `ingest/pipelines/leepa/resources.py` — add centroid columns (Lee track, per Part A finding).
- Test: `ingest/pipelines/collier_parcels/test_centroid.py`.
- Create: `ingest/duckdb_pipelines/parcel_neighborhood/{pipeline.py,agg.py}` — the spatial join + `neighborhood_stats` aggregation.
- Test: `ingest/duckdb_pipelines/parcel_neighborhood/test_join.py`, `test_agg.py`.
- Create: migrations `migrations/2026-07-05-community-boundaries.sql`, `migrations/2026-07-05-parcel-neighborhood.sql`, `migrations/2026-07-05-neighborhood-stats.sql`.
- Modify: `ingest/cadence_registry.yaml` — annual parcel refresh already exists (extend); park `community_boundaries` + `parcel_neighborhood` appropriately.
- Create: `.github/workflows/communities-backbone.yml` — cron wrapper + `--dry-run`.

---

## PART A — Feasibility Spike (non-TDD, throwaway, ends at the GO/NO-GO gate)

> A spike is a **discovery**, not a correctness assertion — you cannot write a failing test first for
> "can we pull 700K centroids without timing out." Run each step, record the number, decide at the gate.
> The one correctness anchor is the known-answer Heritage Bay assignment (Step A5).

### A0 — Prove DuckDB `spatial` loads (local AND on the GHA runner)

- [ ] **Step A0.1:** Local smoke. Run:
```bash
python -c "import duckdb; c=duckdb.connect(); c.execute('INSTALL spatial; LOAD spatial;'); print(c.execute(\"SELECT ST_Contains(ST_GeomFromText('POLYGON((0 0,0 2,2 2,2 0,0 0))'), ST_Point(1,1))\").fetchall())"
```
Expected: `[(True,)]`. (Verifies `INSTALL/LOAD spatial`, `ST_Contains(polygon, point)`, `ST_Point(x=lon,y=lat)` — signatures confirmed against duckdb.org/docs spatial/functions 07/05/2026.)
- [ ] **Step A0.2:** Runner smoke. Add a temporary `workflow_dispatch` job that runs the same one-liner on the `ubuntu-latest` GHA runner (the cron will run there). Confirm green. Delete the temp job after. **If `spatial` fails to install on the runner, that is a NO-GO input — record it.**

### A1 — Discover the subdivision-boundary endpoints (spec open question)

- [ ] **Step A1.1:** Lee. From `https://leegisopendata2-leegis.opendata.arcgis.com/` find the "Subdivisions" dataset's FeatureServer query URL. Fetch `?where=1=1&returnCountOnly=true&f=json` — record the polygon count + the layer's `spatialReference.wkid` (expect 2237 or 2881 = FL State Plane ft, or 4326).
- [ ] **Step A1.2:** Collier. From `https://hub-collierbcc.opendata.arcgis.com/` find the subdivision/plat boundary layer; same count + wkid probe.
- [ ] **Step A1.3:** Pull each layer's **name field** sample (100 polygons, `outFields=<name>,f=json`) to see the raw platted-name format (e.g. `HERITAGE BAY UNIT 12`). This seeds the alias patterns in Task 1.
- [ ] **Step A1.3b (geometry-format contract — decides Task 2/Task 4):** Confirm whether each layer supports **`f=geojson`** (request one polygon `?where=OBJECTID=<n>&outFields=<name>&f=geojson`). ArcGIS `f=json` returns **Esri JSON** (`{"rings":…}`), which `ST_GeomFromGeoJSON` **rejects** — the join would silently return zero rows. `f=geojson` returns RFC-7946 GeoJSON **auto-reprojected to WGS84** (so `wkid=4326`, no `ST_Transform` needed) but moves attributes into `feature["properties"]`. **Record per layer:** `f=geojson` supported? If yes → Task 2 uses it (preferred). If a layer caps at `f=json` → Task 2 converts `rings`→GeoJSON in the normalizer (fallback, mind hole winding-order). This IS the contract; do not leave it ambiguous.
- [ ] **Step A1.4 (durable):** Write the discovered URLs + wkid + the geometry-format decision into `ingest/pipelines/community_boundaries/constants.py` (this is the ONE committed spike artifact — Part B references it):
```python
"""Discovered 2026-07-05 (Part-A spike). Named subdivision-boundary layers, both counties."""
LEE_SUBDIVISIONS_URL = "<discovered FeatureServer .../query>"      # A1.1
LEE_SUBDIVISIONS_WKID = 2881                                        # A1.1 (confirm)
LEE_NAME_FIELD = "<discovered>"                                     # A1.3
COLLIER_SUBDIVISIONS_URL = "<discovered>"                           # A1.2
COLLIER_SUBDIVISIONS_WKID = 2881                                    # A1.2
COLLIER_NAME_FIELD = "<discovered>"                                 # A1.3
BOUNDARY_FETCH_FORMAT = "geojson"  # A1.3b: "geojson" (preferred, wkid becomes 4326) | "json" (rings->GeoJSON in normalizer)
```

### A2 — Probe Collier centroid pull at the API (NOT full polygons — C3)

- [ ] **Step A2.1:** Against `COLLIER_CADASTRAL_URL` (`ingest/pipelines/collier_parcels/constants.py`), request a **bounded sample** with centroids in WGS84:
```python
params = {
  "where": "(CO_NO=21) AND OBJECTID>0", "outFields": "PARCEL_ID,DOR_UC",
  "returnCentroid": "true", "outSR": "4326",     # <-- centroid + lon/lat, avoids the 40s polygon timeout
  "resultRecordCount": 2000, "orderByFields": "OBJECTID ASC", "f": "json",
}
```
Confirm the response carries `feature["centroid"] = {"x": <lon>, "y": <lat>}` and `x∈[-82,-81]`, `y∈[25.8,26.6]` (Collier lon/lat box). **If `returnCentroid` is unsupported or centroids are empty → Collier NO-GO input.**
- [ ] **Step A2.2:** Time a 20-page (40k-parcel) centroid pull. Record wall-clock. Extrapolate to 365k. **If a full pull would exceed the cron budget, record it — Part B Task 3 paginates by OBJECTID keyset (already the pattern) and may need chunking.**

### A3 — Probe Lee centroid availability (SEPARATE feasibility track — C2)

- [ ] **Step A3.1:** Lee is the LeePA feed (`ingest/pipelines/leepa/resources.py`, 3 layers on `FOLIOID`), no ZIP/geometry today. Inspect the LeePA `ParcelDetails` FeatureServer: does any layer expose geometry/centroid? Request `returnCentroid=true&outSR=4326` on a 2000-row sample keyed by `FOLIOID`.
- [ ] **Step A3.2 (fallback track):** If LeePA exposes no usable geometry, probe the **FDOR statewide layer for Lee**: find Lee's `CO_NO` by requesting distinct cities (`where=CO_NO=<candidate>&outFields=PHY_CITY&returnDistinctValues=true`) until Fort Myers / Cape Coral / Lehigh Acres appear. Record the verified Lee `CO_NO` into `constants.py` (do NOT assume it is the tax code). Then repeat A2 for Lee.
- [ ] **Step A3.3:** Decide the Lee geometry source (LeePA-native vs FDOR-statewide-swap). Record it. **Lee and Collier can resolve differently — that is expected.**

### A4 — Spatial join at REALISTIC shape (the mechanism + the true perf gate)

> **Do NOT sample one community × 5k parcels then extrapolate.** An unindexed point-in-polygon join is
> a cross-product whose cost scales with the **polygon count** — one community (~a handful of polygons)
> never exercises the dimension that hurts at 700K × ~thousands. Boundaries are the *small* side (cheap
> to pull in full), so measure at real shape, not a projection. Phase 1 has no paid-API cost — run it.

- [ ] **Step A4.1:** Pull **ALL** of one county's subdivision polygons (Collier, full — the small side) via the A1.3b format, and the **40k-parcel centroid pull already timed in A2.2**. Load both into a local DuckDB file.
- [ ] **Step A4.2:** Run the join through the **same load path production uses** — `ST_GeomFromGeoJSON` on the stored `geom_geojson` string, **not** `ST_Read('<file>')` (a different loader would pass here while hiding the Task-2/Task-4 format bug). With `BOUNDARY_FETCH_FORMAT="geojson"` the geometry is already 4326, so there is no `ST_Transform`:
```sql
INSTALL spatial; LOAD spatial;
-- boundaries.geom_geojson is RFC-7946 GeoJSON in WGS84 (f=geojson); parcels have lon,lat in 4326.
CREATE TEMP TABLE b AS
  SELECT subdivision_name, ST_GeomFromGeoJSON(geom_geojson) AS geom FROM boundaries;
CREATE INDEX b_rt ON b USING RTREE (geom);   -- confirm it's actually consulted (next step)
SELECT p.parcel_id, b.subdivision_name
FROM parcels p JOIN b ON ST_Contains(b.geom, ST_Point(p.lon, p.lat));
```
(Fallback only if A1.3b forced `f=json`: the normalizer stored converted GeoJSON, so this SQL is unchanged.)
- [ ] **Step A4.3 (perf gate):** Measure wall-clock for the **full county-boundaries × 40k-parcel** join, and run `EXPLAIN` (or `EXPLAIN ANALYZE`) to **confirm the RTREE index is actually used** — DuckDB's RTREE accelerates a predicate against a constant and is **not guaranteed** to be consulted for a two-table `ST_Contains` join (or on a TEMP table). **If the index is not consulted OR wall-clock projects to minutes+ at 700K:** Part B Task 4 must add a **bbox-column prefilter** (precompute `min/max lon/lat` per polygon, range-join first, then `ST_Contains`) rather than relying on RTREE. Record the measured number and the plan (RTREE-consulted vs bbox-prefilter) — this is the real perf de-risk the gate exists for.

### A5 — Known-answer correctness + assignment-quality measurement

- [ ] **Step A5.1 (the one hard assertion):** Take 5 parcel IDs known to sit in Heritage Bay (from a listing / the scrape). Confirm the join assigns all 5 to a `subdivision_name` that the alias map (Task 1) will roll up to `heritage-bay`. **If known parcels land in the wrong polygon (or none), the mechanism is broken → NO-GO.**
- [ ] **Step A5.2:** On the **40k Collier sample** (same one joined in A4), compute **assignment % overall AND by property type** (`dor_uc` → single-family / condominium / mobile / etc). Condos are ~186K/616K — **report the condo assignment % explicitly** (stacked-unit centroids must land inside the building footprint's subdivision).
- [ ] **Step A5.3:** Repeat A4.1–A5.2 for a Lee sample (full Lee boundaries × the Lee 40k pull) using the A3 source.

### A6 — GATE: record findings, set thresholds, decide GO/NO-GO

- [ ] **Step A6.1:** Write to `SESSION_LOG.md` (RULE 0.4): the discovered endpoints, Collier & Lee centroid feasibility, join wall-clock, and the measured assignment %s (overall + by type + condo, per county).
- [ ] **Step A6.2:** Set the gate thresholds from the numbers: **X** = min all-residential assignment % to call Tier-1 authoritative (spec suggests high; propose ≥ 90% overall AND ≥ 80% condo); **Y** = min marketed-community match % (propose ≥ 85% of the ~300 matched to a boundary with a plausible home_count). Record the chosen X/Y.
- [ ] **Step A6.3 — DECISION:**
  - **GO** (both counties clear X, mechanism sound) → proceed to Part B.
  - **NO-GO** (geometry unavailable, spatial fails on runner, or assignment < X) → **stop Part B.** The program degrades: Phase 2 ships scraped-community aggregates, home counts become lane-3 (55places, cited estimate). Record the NO-GO reason; the authoritative claim waits. **Do not fake authority.**

---

## PART B — TDD Production Build (execute ONLY on GO)

### Task 1: Subdivision → community alias reconciler

Pure TypeScript, testable now (independent of the probe). Reuses `corridor-aliases`' **test discipline**
(no orphans / no holes / reachability), NOT its 1:1 data shape (C10). The pattern set is **seeded small**
from A1.3 and grows; the test enforces determinism, not coverage of all ~300 yet.

**Files:**
- Create: `refinery/lib/subdivision-aliases.mts`
- Test: `refinery/lib/subdivision-aliases.test.mts`

**Interfaces:**
- Produces: `communityForSubdivision(rawName: string): CommunitySlug | null` and `export const COMMUNITY_ALIASES: Record<CommunitySlug, { label: string; patterns: string[] }>`. Task 4 (join) consumes `communityForSubdivision` to roll platted names up to community slugs; Phase 4 consumes `COMMUNITY_ALIASES` for row labels.

- [ ] **Step 1.1: Write the failing test.**
```ts
// refinery/lib/subdivision-aliases.test.mts
import { describe, it, expect } from "vitest";
import {
  COMMUNITY_ALIASES,
  communityForSubdivision,
  normalizeSubdivisionName,
} from "./subdivision-aliases.mts";

describe("subdivision-aliases", () => {
  it("rolls a platted 'UNIT n' name up to its marketed community", () => {
    expect(communityForSubdivision("HERITAGE BAY UNIT 12")).toBe("heritage-bay");
    expect(communityForSubdivision("Heritage Bay Unit Two")).toBe("heritage-bay");
  });
  it("normalizes away plat qualifiers and punctuation", () => {
    expect(normalizeSubdivisionName("HERITAGE BAY UNIT 12, PHASE 1")).toBe("HERITAGE BAY");
  });
  it("returns null for an unknown subdivision (a coverage hole, not a guess)", () => {
    expect(communityForSubdivision("SOME UNPLATTED TRACT 00")).toBeNull();
  });
  it("has no empty pattern and no duplicate pattern across two communities (discipline)", () => {
    const seen = new Map<string, string>();
    for (const [slug, { patterns }] of Object.entries(COMMUNITY_ALIASES)) {
      expect(patterns.length).toBeGreaterThan(0);
      for (const p of patterns) {
        expect(p).toBe(normalizeSubdivisionName(p)); // patterns are pre-normalized
        expect(seen.has(p)).toBe(false);             // no two communities claim the same pattern
        seen.set(p, slug);
      }
    }
  });
});
```
- [ ] **Step 1.2: Run it, verify it fails.** `bunx vitest run refinery/lib/subdivision-aliases.test.mts` → FAIL ("Cannot find module './subdivision-aliases.mts'").
- [ ] **Step 1.3: Implement the minimal reconciler.**
```ts
// refinery/lib/subdivision-aliases.mts
export type CommunitySlug = string;

/** Normalize a raw platted-subdivision name to its marketed-community stem:
 *  uppercase, drop plat qualifiers (UNIT/PHASE/TRACT/REPLAT/…) and everything after,
 *  strip punctuation, collapse whitespace. "HERITAGE BAY UNIT 12, PHASE 1" -> "HERITAGE BAY". */
export function normalizeSubdivisionName(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\b(UNIT|PHASE|TRACT|BLOCK|BLK|REPLAT|AMENDED|ADDITION|ADD|SECTION|SEC)\b.*$/u, "")
    .replace(/[^A-Z0-9 ]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Canonical marketed community -> the normalized platted-name prefixes that roll into it.
 *  Seeded from the A1.3 boundary-name dump; grown as Phase 2's scrape supplies clean names. */
export const COMMUNITY_ALIASES: Record<CommunitySlug, { label: string; patterns: string[] }> = {
  "heritage-bay": { label: "Heritage Bay", patterns: ["HERITAGE BAY"] },
  // … populated from the A1.3 dump + Phase-2 clean names (bootstrap trick).
};

// Reverse index: normalized pattern -> community slug (built once).
const _PATTERN_INDEX: Map<string, CommunitySlug> = (() => {
  const m = new Map<string, CommunitySlug>();
  for (const [slug, { patterns }] of Object.entries(COMMUNITY_ALIASES)) {
    for (const p of patterns) m.set(p, slug);
  }
  return m;
})();

/** Roll a raw platted-subdivision name up to its marketed community, or null if unknown. */
export function communityForSubdivision(rawName: string): CommunitySlug | null {
  return _PATTERN_INDEX.get(normalizeSubdivisionName(rawName)) ?? null;
}
```
- [ ] **Step 1.4: Run it, verify it passes.** `bunx vitest run refinery/lib/subdivision-aliases.test.mts` → PASS.
- [ ] **Step 1.5: Commit.**
```bash
git add refinery/lib/subdivision-aliases.mts refinery/lib/subdivision-aliases.test.mts
git commit -m "feat(communities): subdivision->community alias reconciler (communities-swfl P1 T1)"
```

### Task 2: `community_boundaries` polygon ingest

**Files:**
- Create: `migrations/2026-07-05-community-boundaries.sql`
- Create: `ingest/pipelines/community_boundaries/resources.py`
- Create: `ingest/pipelines/community_boundaries/pipeline.py`
- Test: `ingest/pipelines/community_boundaries/test_resources.py`

**Interfaces:**
- Consumes: `LEE_SUBDIVISIONS_URL`, `COLLIER_SUBDIVISIONS_URL`, `*_WKID`, `*_NAME_FIELD` from `constants.py` (Part A).
- Produces: `data_lake.community_boundaries(subdivision_id TEXT PK, subdivision_name TEXT, county TEXT, wkid INT, geom_geojson TEXT, source_url TEXT, as_of DATE)`; `fetch_boundaries(county: str) -> list[dict]` for the join (Task 4).

- [ ] **Step 2.1: Write the failing test** (normalizer shape — no network). The stored `geom_geojson` MUST be RFC-7946 GeoJSON (`{"type":"Polygon",…}`) because Task 4 parses it with `ST_GeomFromGeoJSON`, which rejects Esri `rings`. `f=geojson` (A1.3b) returns GeoJSON `Feature`s — attributes live in `properties`, geometry is already RFC-7946, `wkid=4326`:
```python
# ingest/pipelines/community_boundaries/test_resources.py
import json
from ingest.pipelines.community_boundaries.resources import _normalize_boundaries

def test_normalize_stores_rfc7946_geojson_and_name():
    # f=geojson feature shape: attributes under "properties", geometry already GeoJSON.
    feats = [{
        "type": "Feature",
        "id": 7,
        "properties": {"OBJECTID": 7, "NAME": "HERITAGE BAY UNIT 12"},
        "geometry": {"type": "Polygon",
                     "coordinates": [[[-81.7, 26.3], [-81.6, 26.3], [-81.6, 26.4], [-81.7, 26.3]]]},
    }]
    rows = _normalize_boundaries(feats, county="collier", name_field="NAME", wkid=4326, source_url="u")
    assert rows[0]["subdivision_name"] == "HERITAGE BAY UNIT 12"
    assert rows[0]["county"] == "collier"
    assert rows[0]["wkid"] == 4326
    geom = json.loads(rows[0]["geom_geojson"])
    assert geom["type"] == "Polygon"          # RFC-7946, NOT Esri {"rings":…}
    assert "coordinates" in geom and "rings" not in geom

def test_normalize_drops_rows_with_no_geometry():
    feats = [{"type": "Feature", "properties": {"OBJECTID": 1, "NAME": "X"}, "geometry": None}]
    assert _normalize_boundaries(feats, county="lee", name_field="NAME", wkid=4326, source_url="u") == []
```
- [ ] **Step 2.2: Run it, verify it fails.** `python -m pytest ingest/pipelines/community_boundaries/test_resources.py -q` → FAIL (module missing).
- [ ] **Step 2.3: Write the migration** (run via `new Bun.SQL`, idempotent):
```sql
-- migrations/2026-07-05-community-boundaries.sql
CREATE TABLE IF NOT EXISTS data_lake.community_boundaries (
  subdivision_id   TEXT PRIMARY KEY,
  subdivision_name TEXT NOT NULL,
  county           TEXT NOT NULL,
  wkid             INTEGER NOT NULL,
  geom_geojson     TEXT NOT NULL,
  source_url       TEXT NOT NULL,
  as_of            DATE NOT NULL
);
GRANT SELECT ON data_lake.community_boundaries TO service_role;
NOTIFY pgrst, 'reload schema';
```
- [ ] **Step 2.4: Implement `resources.py`.** Fetch `f=geojson` (RFC-7946, auto-reprojected to 4326 — A1.3b preferred path); attributes are under `properties`; store the geometry as-is (already GeoJSON). The normalizer stays format-explicit so Task 4's `ST_GeomFromGeoJSON` never sees Esri `rings`. Boundaries are the small side (thousands), so a full paged pull is fine:
```python
# ingest/pipelines/community_boundaries/resources.py
from __future__ import annotations
import json, time, requests
from datetime import date
from ingest.lib.guards import assert_min_rows
from .constants import (
    LEE_SUBDIVISIONS_URL, LEE_SUBDIVISIONS_WKID, LEE_NAME_FIELD,
    COLLIER_SUBDIVISIONS_URL, COLLIER_SUBDIVISIONS_WKID, COLLIER_NAME_FIELD,
    BOUNDARY_FETCH_FORMAT,
)

_CFG = {
    "lee":     (LEE_SUBDIVISIONS_URL, LEE_SUBDIVISIONS_WKID, LEE_NAME_FIELD),
    "collier": (COLLIER_SUBDIVISIONS_URL, COLLIER_SUBDIVISIONS_WKID, COLLIER_NAME_FIELD),
}

def _esri_rings_to_geojson(geom: dict) -> dict:
    """Fallback for a layer that only serves f=json (Esri {"rings":…}) -> RFC-7946 Polygon.
    Esri outer rings are clockwise, holes counter-clockwise; GeoJSON wants the reverse, but
    ST_GeomFromGeoJSON tolerates ring orientation for containment, so a straight remap is safe here."""
    return {"type": "Polygon", "coordinates": geom["rings"]}

def _normalize_boundaries(feats, county, name_field, wkid, source_url):
    """`feats` are GeoJSON Features (f=geojson): attributes in `properties`, geometry already GeoJSON.
    If the layer forced f=json, pass Esri features and this converts rings->GeoJSON."""
    out = []
    for f in feats:
        geom = f.get("geometry")
        props = f.get("properties") or f.get("attributes") or {}
        name = props.get(name_field)
        if not geom or not name:
            continue
        if "rings" in geom:            # f=json fallback path
            geom = _esri_rings_to_geojson(geom)
        oid = props.get("OBJECTID") or f.get("id")
        out.append({
            "subdivision_id": f"{county}-{oid}",
            "subdivision_name": str(name).strip(),
            "county": county,
            "wkid": wkid,
            "geom_geojson": json.dumps(geom),   # RFC-7946 GeoJSON, always
            "source_url": source_url,
            "as_of": date.today().isoformat(),
        })
    return out

def _iter_features(url, name_field):
    last = -1
    while True:
        params = {"where": f"OBJECTID>{last}", "outFields": f"{name_field},OBJECTID",
                  "orderByFields": "OBJECTID ASC", "resultRecordCount": 2000,
                  "returnGeometry": "true", "f": BOUNDARY_FETCH_FORMAT}
        for attempt in range(3):
            try:
                r = requests.get(url, params=params, timeout=120); r.raise_for_status()
                data = r.json(); break
            except Exception:
                if attempt == 2: raise
                time.sleep(2 ** attempt)
        # f=geojson -> {"features":[Feature…]}; f=json -> {"features":[{attributes,geometry}…]}
        feats = data.get("features", [])
        if not feats: break
        for f in feats: yield f
        def _oid(ft): return (ft.get("properties") or ft.get("attributes") or {}).get("OBJECTID") or ft.get("id")
        if len(feats) < 2000: break
        last = max(_oid(f) for f in feats)

def fetch_boundaries(county: str) -> list[dict]:
    url, wkid, name_field = _CFG[county]
    feats = list(_iter_features(url, name_field))
    rows = _normalize_boundaries(feats, county, name_field, wkid, url)
    assert_min_rows(len(rows), 100, label=f"{county} subdivision boundaries")
    return rows
```
> Note: with `BOUNDARY_FETCH_FORMAT="geojson"`, `*_WKID` in `constants.py` must be `4326` (ArcGIS reprojects). Keep the `wkid` column so Task 4's transform branch stays correct for any future `f=json` layer.
- [ ] **Step 2.5: Implement `pipeline.py`** (dlt merge, mirror `collier_parcels._promote_to_tier2`):
```python
# ingest/pipelines/community_boundaries/pipeline.py
from __future__ import annotations
import dlt
from .resources import fetch_boundaries

_COLUMNS = {
    "subdivision_id":   {"data_type": "text", "nullable": False, "primary_key": True},
    "subdivision_name": {"data_type": "text", "nullable": False},
    "county":           {"data_type": "text", "nullable": False},
    "wkid":             {"data_type": "bigint", "nullable": False},
    "geom_geojson":     {"data_type": "text", "nullable": False},
    "source_url":       {"data_type": "text", "nullable": False},
    "as_of":            {"data_type": "text", "nullable": False},
}

def _resource(rows):
    @dlt.resource(table_name="community_boundaries", write_disposition="merge",
                  primary_key="subdivision_id", columns=_COLUMNS)
    def community_boundary_rows(): yield from rows
    return community_boundary_rows

def ingest_community_boundaries() -> int:
    rows = fetch_boundaries("lee") + fetch_boundaries("collier")
    if not rows: return 0
    p = dlt.pipeline(pipeline_name="community_boundaries", destination="postgres", dataset_name="data_lake")
    p.run(_resource(rows)()).raise_on_failed_jobs()
    print(f"community_boundaries: merged {len(rows)} polygons")
    return len(rows)

if __name__ == "__main__":
    ingest_community_boundaries()
```
- [ ] **Step 2.6: Run test → PASS, then run the migration + a bounded live ingest smoke.** `python -m pytest ingest/pipelines/community_boundaries/test_resources.py -q` → PASS.
- [ ] **Step 2.7: Commit.**
```bash
git add ingest/pipelines/community_boundaries/ migrations/2026-07-05-community-boundaries.sql
git commit -m "feat(communities): community_boundaries polygon ingest (communities-swfl P1 T2)"
```

### Task 3: Add parcel centroid columns (atomic type-lift + backfill)

Property-type is already landed (C1) — this task adds ONLY `lat`,`lon` (WGS84 centroids). Both parcel
pipelines are `merge`, so this is an additive merge + backfill, NOT a `replace` (Gate-4 doesn't fire, but
the backfill is mandatory so existing rows get centroids).

**Files:**
- Modify: `ingest/pipelines/collier_parcels/constants.py` (add `returnCentroid`/`outSR` to the query), `ingest/pipelines/collier_parcels/resources.py` (`_TIER2_COLUMNS` + `_normalize` gain `lat`,`lon`).
- Modify: `ingest/pipelines/leepa/resources.py` (Lee centroid per A3 finding).
- Create: `migrations/2026-07-05-parcel-centroids.sql`.
- Test: `ingest/pipelines/collier_parcels/test_centroid.py`.

**Interfaces:**
- Produces: `data_lake.{collier_parcels,leepa_parcels}` gain `lat DOUBLE, lon DOUBLE`. Task 4 reads `parcel_id, dor_uc/use_code, jv/just_value, lat, lon`.

- [ ] **Step 3.1: Write the failing test** (normalizer picks up the centroid — no network):
```python
# ingest/pipelines/collier_parcels/test_centroid.py
from ingest.pipelines.collier_parcels.resources import _normalize

def test_normalize_reads_centroid_lonlat():
    feats = [{"PARCEL_ID": "P1", "DOR_UC": "004",
              "centroid": {"x": -81.68, "y": 26.31}}]
    rows = _normalize(feats)
    assert rows[0]["lon"] == -81.68 and rows[0]["lat"] == 26.31

def test_normalize_tolerates_missing_centroid():
    rows = _normalize([{"PARCEL_ID": "P2", "DOR_UC": "001"}])
    assert rows[0]["lat"] is None and rows[0]["lon"] is None
```
> Note: ArcGIS returns the centroid as a sibling `centroid` key on the FEATURE, not inside `attributes`. `_iter_collier_attrs` currently yields `feat["attributes"]` only — Step 3.3 must also thread `feat["centroid"]` through. Adjust `_iter_collier_attrs` to yield the whole feature (or `{**attrs, "centroid": feat.get("centroid")}`).
- [ ] **Step 3.2: Run it, verify it fails.** `python -m pytest ingest/pipelines/collier_parcels/test_centroid.py -q` → FAIL (`KeyError`/no `lon`).
- [ ] **Step 3.3: Implement — constants + resources.** In `constants.py`, the fetch loop gains `"returnCentroid": "true", "outSR": "4326"`. In `resources.py`, `_iter_collier_attrs` yields `{**attrs, "centroid": feat.get("centroid")}`, `_TIER2_COLUMNS` gains `"lat": {"data_type":"double","nullable":True}, "lon": {"data_type":"double","nullable":True}`, and `_normalize` gains:
```python
c = a.get("centroid") or {}
row["lon"] = _coerce_float(c.get("x"))
row["lat"] = _coerce_float(c.get("y"))
```
- [ ] **Step 3.4: Write the migration** (add columns, idempotent):
```sql
-- migrations/2026-07-05-parcel-centroids.sql
ALTER TABLE data_lake.collier_parcels ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE data_lake.collier_parcels ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION;
ALTER TABLE data_lake.leepa_parcels   ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE data_lake.leepa_parcels   ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION;
NOTIFY pgrst, 'reload schema';
```
- [ ] **Step 3.5: Run test → PASS; run migration; run a guarded backfill ingest** (keyset-paginated merge re-lands every row WITH centroids; `assert_vs_canonical` already guards the count). `python -m pytest ingest/pipelines/collier_parcels/test_centroid.py -q` → PASS.
- [ ] **Step 3.6: Mirror for Lee** per the A3 finding (LeePA-native centroid, or the FDOR-statewide-swap with the verified Lee `CO_NO`). Same column adds + backfill.
- [ ] **Step 3.7: Commit.**
```bash
git add ingest/pipelines/collier_parcels/ ingest/pipelines/leepa/resources.py migrations/2026-07-05-parcel-centroids.sql
git commit -m "feat(communities): parcel centroid (lat,lon) columns + backfill, both counties (communities-swfl P1 T3)"
```

### Task 4: DuckDB spatial join → `data_lake.parcel_neighborhood`

**Files:**
- Create: `migrations/2026-07-05-parcel-neighborhood.sql`
- Create: `ingest/duckdb_pipelines/parcel_neighborhood/pipeline.py`
- Test: `ingest/duckdb_pipelines/parcel_neighborhood/test_join.py`

**Interfaces:**
- Consumes: `data_lake.{collier_parcels,leepa_parcels}` (with `lat`,`lon`,`dor_uc`/`use_code`,`jv`/`just_value`); `data_lake.community_boundaries`; `communityForSubdivision` (Task 1, applied in TS at Phase-4 read OR mirrored in Python — see Step 4.5).
- Produces: `data_lake.parcel_neighborhood(parcel_id TEXT PK, county TEXT, property_type TEXT, just_value DOUBLE, subdivision_id TEXT, subdivision_name TEXT)`; `run()` entrypoint.

- [ ] **Step 4.1: Write the failing test** — a pure DuckDB point-in-polygon known-answer, no Supabase:
```python
# ingest/duckdb_pipelines/parcel_neighborhood/test_join.py
import duckdb
from ingest.duckdb_pipelines.parcel_neighborhood.pipeline import assign_parcels

def test_point_in_polygon_assigns_known_parcel():
    con = duckdb.connect(); con.execute("INSTALL spatial; LOAD spatial;")
    con.execute("CREATE TABLE boundaries(subdivision_id TEXT, subdivision_name TEXT, wkid INT, geom_geojson TEXT)")
    con.execute("""INSERT INTO boundaries VALUES ('c-1','HERITAGE BAY UNIT 12', 4326,
        '{"type":"Polygon","coordinates":[[[-81.75,26.30],[-81.60,26.30],[-81.60,26.45],[-81.75,26.45],[-81.75,26.30]]]}')""")
    con.execute("CREATE TABLE parcels(parcel_id TEXT, county TEXT, property_type TEXT, just_value DOUBLE, lat DOUBLE, lon DOUBLE)")
    con.execute("INSERT INTO parcels VALUES ('P-IN','collier','condominium',400000,26.37,-81.67), ('P-OUT','collier','condominium',400000,27.9,-82.4)")
    rows = assign_parcels(con)
    got = {r[0]: r[5] for r in rows}  # parcel_id -> subdivision_name
    assert got["P-IN"] == "HERITAGE BAY UNIT 12"
    assert "P-OUT" not in got  # outside every boundary -> unassigned (not invented)
```
- [ ] **Step 4.2: Run it, verify it fails.** `python -m pytest ingest/duckdb_pipelines/parcel_neighborhood/test_join.py -q` → FAIL (module missing).
- [ ] **Step 4.3: Write the migration.**
```sql
-- migrations/2026-07-05-parcel-neighborhood.sql
CREATE TABLE IF NOT EXISTS data_lake.parcel_neighborhood (
  parcel_id        TEXT PRIMARY KEY,
  county           TEXT NOT NULL,
  property_type    TEXT,
  just_value       DOUBLE PRECISION,
  subdivision_id   TEXT,
  subdivision_name TEXT
);
GRANT SELECT ON data_lake.parcel_neighborhood TO service_role;
NOTIFY pgrst, 'reload schema';
```
- [ ] **Step 4.4: Implement the join** (`assign_parcels` is the pure, tested core; `run()` wires Supabase I/O). `ST_Contains`/`ST_Point`/`ST_Transform`/`ST_GeomFromGeoJSON` signatures verified against duckdb.org spatial docs 07/05/2026:
```python
# ingest/duckdb_pipelines/parcel_neighborhood/pipeline.py
from __future__ import annotations
import duckdb

def assign_parcels(con: duckdb.DuckDBPyConnection):
    """Point-in-polygon: each parcel centroid (4326) against subdivision polygons.
    Reprojects boundaries whose wkid != 4326. Returns rows; unassigned parcels are DROPPED
    (a parcel outside every boundary gets no neighborhood — never an invented one)."""
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute("""
        CREATE TEMP TABLE _b AS
        SELECT subdivision_id, subdivision_name,
               CASE WHEN wkid = 4326 THEN ST_GeomFromGeoJSON(geom_geojson)
                    ELSE ST_Transform(ST_GeomFromGeoJSON(geom_geojson),
                                      'EPSG:' || wkid, 'EPSG:4326', always_xy := true) END AS geom
        FROM boundaries;
    """)
    # Perf: DuckDB's RTREE accelerates a predicate against a CONSTANT and is NOT guaranteed to be
    # consulted for a two-table ST_Contains join or on a TEMP table (confirmed open in A4.3). So the
    # reliable prefilter is an explicit per-polygon bounding box (ST_XMin/XMax/YMin/YMax): range-join
    # the point into the box first (cheap, sargable), THEN run exact ST_Contains only on survivors.
    con.execute("""
        ALTER TABLE _b ADD COLUMN xmin DOUBLE; ALTER TABLE _b ADD COLUMN xmax DOUBLE;
        ALTER TABLE _b ADD COLUMN ymin DOUBLE; ALTER TABLE _b ADD COLUMN ymax DOUBLE;
        UPDATE _b SET xmin=ST_XMin(geom), xmax=ST_XMax(geom), ymin=ST_YMin(geom), ymax=ST_YMax(geom);
    """)
    return con.execute("""
        SELECT p.parcel_id, p.county, p.property_type, p.just_value,
               b.subdivision_id, b.subdivision_name
        FROM parcels p
        JOIN _b b
          ON p.lon BETWEEN b.xmin AND b.xmax          -- cheap bbox prefilter
         AND p.lat BETWEEN b.ymin AND b.ymax
         AND ST_Contains(b.geom, ST_Point(p.lon, p.lat))  -- exact test on survivors
        WHERE p.lat IS NOT NULL AND p.lon IS NOT NULL;
    """).fetchall()

# run(): load boundaries + parcels (with a DOR_UC->property_type map applied in SQL) from
# Supabase into DuckDB, call assign_parcels, then dlt-merge the result into
# data_lake.parcel_neighborhood. (I/O wiring mirrors hurdat2_fl.pipeline + collier _promote_to_tier2.)
```
- [ ] **Step 4.5: DOR-code → property_type map.** Apply in the `run()` load SQL (`CASE dor_uc WHEN '001' THEN 'single-family' WHEN '004' THEN 'condominium' …` for Collier; `use_code` map for Lee) so `property_type` lands human-readable. Exclude vacant + non-residential (per spec home-count definition).
- [ ] **Step 4.6: Run test → PASS.** `python -m pytest ingest/duckdb_pipelines/parcel_neighborhood/test_join.py -q` → PASS.
- [ ] **Step 4.7: Commit.**
```bash
git add ingest/duckdb_pipelines/parcel_neighborhood/pipeline.py ingest/duckdb_pipelines/parcel_neighborhood/test_join.py migrations/2026-07-05-parcel-neighborhood.sql
git commit -m "feat(communities): DuckDB spatial join -> parcel_neighborhood (communities-swfl P1 T4)"
```

### Task 5: `neighborhood_stats` aggregation

**Files:**
- Create: `migrations/2026-07-05-neighborhood-stats.sql`
- Create: `ingest/duckdb_pipelines/parcel_neighborhood/agg.py`
- Test: `ingest/duckdb_pipelines/parcel_neighborhood/test_agg.py`

**Interfaces:**
- Consumes: the `parcel_neighborhood` rows (Task 4).
- Produces: `data_lake.neighborhood_stats(subdivision_id TEXT PK, subdivision_name TEXT, county TEXT, home_count INT, count_by_type JSON, median_just_value DOUBLE, source_url TEXT, as_of DATE)`; `aggregate_stats(con) -> rows`.

- [ ] **Step 5.1: Write the failing test** (aggregate-at-source — computed in DuckDB, not TS):
```python
# ingest/duckdb_pipelines/parcel_neighborhood/test_agg.py
import duckdb
from ingest.duckdb_pipelines.parcel_neighborhood.agg import aggregate_stats

def test_home_count_and_median_by_neighborhood():
    con = duckdb.connect()
    con.execute("CREATE TABLE parcel_neighborhood(parcel_id TEXT, county TEXT, property_type TEXT, just_value DOUBLE, subdivision_id TEXT, subdivision_name TEXT)")
    con.execute("""INSERT INTO parcel_neighborhood VALUES
        ('1','collier','condominium',300000,'c-1','HERITAGE BAY UNIT 12'),
        ('2','collier','condominium',500000,'c-1','HERITAGE BAY UNIT 12'),
        ('3','collier','single-family',900000,'c-1','HERITAGE BAY UNIT 12')""")
    rows = {r["subdivision_id"]: r for r in aggregate_stats(con)}
    assert rows["c-1"]["home_count"] == 3
    assert rows["c-1"]["median_just_value"] == 500000
    assert rows["c-1"]["count_by_type"]["condominium"] == 2
```
- [ ] **Step 5.2: Run it, verify it fails.** `python -m pytest ingest/duckdb_pipelines/parcel_neighborhood/test_agg.py -q` → FAIL (module missing).
- [ ] **Step 5.3: Write migration + `aggregate_stats`.**
```sql
-- migrations/2026-07-05-neighborhood-stats.sql
CREATE TABLE IF NOT EXISTS data_lake.neighborhood_stats (
  subdivision_id    TEXT PRIMARY KEY,
  subdivision_name  TEXT NOT NULL,
  county            TEXT NOT NULL,
  home_count        INTEGER NOT NULL,
  count_by_type     JSONB NOT NULL,
  median_just_value DOUBLE PRECISION,
  source_url        TEXT NOT NULL,
  as_of             DATE NOT NULL
);
GRANT SELECT ON data_lake.neighborhood_stats TO service_role;
NOTIFY pgrst, 'reload schema';
```
```python
# ingest/duckdb_pipelines/parcel_neighborhood/agg.py
from __future__ import annotations
import json, duckdb
from datetime import date

def aggregate_stats(con: duckdb.DuckDBPyConnection) -> list[dict]:
    """Home count, count-by-type, median just-value per neighborhood — computed in DuckDB
    (aggregate-at-source; never haul raw parcels to TS). MEDIAN via DuckDB's median()."""
    base = con.execute("""
        SELECT subdivision_id, any_value(subdivision_name) AS subdivision_name,
               any_value(county) AS county, COUNT(*) AS home_count,
               median(just_value) AS median_just_value
        FROM parcel_neighborhood GROUP BY subdivision_id
    """).fetchall()
    by_type = con.execute("""
        SELECT subdivision_id, property_type, COUNT(*) AS n
        FROM parcel_neighborhood GROUP BY subdivision_id, property_type
    """).fetchall()
    types: dict[str, dict] = {}
    for sid, ptype, n in by_type:
        types.setdefault(sid, {})[ptype or "unknown"] = int(n)
    today = date.today().isoformat()
    out = []
    for sid, name, county, hc, med in base:
        out.append({
            "subdivision_id": sid, "subdivision_name": name, "county": county,
            "home_count": int(hc), "count_by_type": types.get(sid, {}),
            "median_just_value": (float(med) if med is not None else None),
            "source_url": "https://www.swfldatagulf.com/r/source/neighborhood_stats",
            "as_of": today,
        })
    return out
```
- [ ] **Step 5.4: Run test → PASS.** `python -m pytest ingest/duckdb_pipelines/parcel_neighborhood/test_agg.py -q` → PASS.
- [ ] **Step 5.5: Commit.**
```bash
git add ingest/duckdb_pipelines/parcel_neighborhood/agg.py ingest/duckdb_pipelines/parcel_neighborhood/test_agg.py migrations/2026-07-05-neighborhood-stats.sql
git commit -m "feat(communities): neighborhood_stats aggregation, aggregate-at-source (communities-swfl P1 T5)"
```

### Task 6: Cadence entries + GHA cron wrapper + `--dry-run`

**Files:**
- Modify: `ingest/cadence_registry.yaml`
- Create: `.github/workflows/communities-backbone.yml`

- [ ] **Step 6.1:** The annual parcel-refresh entries for `leepa` + `collier_parcels` **already exist** (`cadence_registry.yaml`, `cadence_days: 365`) — no new parcel entry. Add `community_boundaries` under `pipelines:` (`cadence_days: 365`, `lane: tier-2`, `count_table: community_boundaries`, `expected_rows_min` = the A1 count × 0.9). Add `parcel_neighborhood` under `pipelines:` (derived, annual after the parcel refresh, `count_table: parcel_neighborhood`, `expected_rows_min` = the A6 assigned-parcel count × 0.9). If either scrape can't cron cleanly, park under `not_yet_running:` with `parked: true` (ODD pattern).
- [ ] **Step 6.2:** Cron wrapper `.github/workflows/communities-backbone.yml` runs, in order: `community_boundaries` ingest → parcel centroid backfill → `parcel_neighborhood` join → `neighborhood_stats` agg. Supports `--dry-run` (fetch + assert counts, skip the Tier-2 write). No LLM, no paid API — no `RunBudget` needed here.
- [ ] **Step 6.3:** Confirm freshness probe green after the first real run; re-baseline `expected_rows_min` from the live count once observed (open a `checks` follow-up).
- [ ] **Step 6.4: Commit.**
```bash
git add ingest/cadence_registry.yaml .github/workflows/communities-backbone.yml
git commit -m "feat(communities): backbone cadence entries + cron wrapper + --dry-run (communities-swfl P1 T6)"
```

---

## Self-Review (run against the spec's Phase-1 section)

**Spec coverage** — Phase-1 requirements → task:
- Parcel-field ingest (situs/geometry/DOR type): DOR type already landed (C1); centroid added (T3); **situs `PHY_ADDR1`/`S_LEGAL` deferred** — not needed for the point-in-polygon join, and pulling them is a separate additive column (fold into Phase 4 if a page needs the street line). *Gap noted, intentionally deferred.*
- `community_boundaries` + spatial join → `parcel_neighborhood` for ALL homes, condos per unit: T2, T4 (condo assignment measured at A5.2; stacked-unit centroids land in the building footprint).
- `neighborhood_stats` aggregates by type: T5.
- Gate on assignment-quality X/Y: A5–A6 (the whole point of Part A).
- Name reconciliation (subdivision → community + aliases): T1.

**Placeholder scan:** The only unresolved values are the Part-A discoveries (endpoints, Lee `CO_NO`, wkid, X/Y) — these are *discovered then written to `constants.py`/`SESSION_LOG`* by Part A, so Part B references real named constants, not placeholders. Flagged as `<discovered>` only inside the A1.4 spike artifact.

**Type consistency:** `communityForSubdivision`/`COMMUNITY_ALIASES` (T1) names match their consumers; `assign_parcels(con)`/`aggregate_stats(con)` signatures match their tests; `data_lake.parcel_neighborhood` column set is identical across T4 migration, T4 producer, and T5 consumer.

**Known deferrals (not gaps):** Situs address columns; the marketed-community boundary UNION (Phase 4 / spec open question — union the matched subdivision polygons); Mapbox centroid enrichment (Phase 3, gated on `neighborhood_stats` existing).
