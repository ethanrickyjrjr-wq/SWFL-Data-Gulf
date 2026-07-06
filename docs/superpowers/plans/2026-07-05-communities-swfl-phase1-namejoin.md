# communities-swfl Phase 1 (NAME-JOIN) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or
> **Recommended model:** 🧠 Opus — 6 tasks, keywords: migration, schema, architecture
> superpowers:executing-plans. Steps use `- [ ]` checkboxes.
>
> **This REPLACES** `2026-07-05-communities-swfl-phase1-backbone.md` (the spatial-join spike), which is
> superseded. Read the program map `2026-07-05-communities-swfl.md` and the evidence
> `verification/communities-name-join-accuracy.md` first.

**Goal:** Assign every residential parcel in Lee + Collier to its subdivision, then roll up to marketed
communities, by grouping on the subdivision name **each parcel already carries** (`S_LEGAL` / `Description`) —
no spatial join, no boundary polygons, no centroid pull.

**Architecture (proven 07/05/2026):** the home→community link is already in the parcel record.
Ingest parcel name+type+zip → `data_lake.parcel_subdivision` → group into `neighborhood_stats`
(per subdivision) and roll subdivisions up to marketed communities via the alias reconciler
(`refinery/lib/subdivision-aliases.mts`, already built). Accuracy vs named sources: ~7% on a built-out
single-name community (Heritage Bay 1,501 vs 1,400); the only systematic gap is sub-neighborhood name
fragmentation (Pelican Bay raw prefix = 59% of 6,500), which the alias map closes.

**Tech Stack:** Python (dlt + ArcGIS REST keyset pagination), DuckDB (local grouping), TypeScript
(reconciler + Vitest), Supabase Postgres (`data_lake`, migrations via `new Bun.SQL`).

---

## Proven facts & landmines (07/05/2026 — do NOT re-derive)

**Collier parcel names — WORKS.**
- Source: FDOR `Florida_Statewide_Parcel_Centroid_Version` FeatureServer, layer 0 ("FDOR Cadastral
  Centroids 2025"), `CO_NO=21`. 364,827 parcels. Carries `PARCEL_ID, S_LEGAL, DOR_UC, PA_UC, JV,
  PHY_ADDR1, PHY_CITY, PHY_ZIPCD` (all populated).
- Query shape that WORKS: keyset pagination — `where=(CO_NO=21) AND OBJECTID>{last}`,
  `orderByFields=OBJECTID ASC`, `resultRecordCount=2000`, `returnGeometry=false`, `f=json`.
- Query shapes that **400** on this layer (do not use): `returnCountOnly=true`, `S_LEGAL LIKE '…'`,
  `returnCentroid=true`, `outSR` combined with the above. Retries won't help — they're rejected shapes.
- The **cadastral** layer (`Florida_Statewide_Cadastral`, the one the daily `collier_parcels` ingest
  uses) does **NOT** expose `S_LEGAL` — requesting it 400s. Use the **centroid-version** layer for names.

**Lee parcel names — FDOR is BROKEN; use a different source.**
- Lee is `CO_NO=46` (verified via FDOR scheme: 21=Collier, 46=Lee, 71=Suwannee). On BOTH statewide
  layers, `CO_NO=46` **record queries 400** (count works, records don't) — a broken Lee partition.
  **Do not keep retrying FDOR for Lee.**
- Lee sources that DO work: (a) Lee GIS `Subdivisions_and_Condominiums` FeatureServer layer 0
  (`FabricSubdivisions`, `services2.arcgis.com/LvWGAAhHwbCJ2GMP`), 7,557 polygons — the human name is
  in the **`Description`** field (`"LEHIGH ACRES UNIT 4"`, `"POINTE ESTERO"`); `Name` is a STRAP code
  (trap), `Legal` is plat text. `f=geojson` returns WGS84. Keyed on `FolioID`. (b) LeePA
  `gissvr.leepa.org/gissvr/rest/services/ParcelInfo/MapServer` — 24 polygon layers keyed on `FOLIOID`,
  wkid 2237. **T3 resolves which of these to use — see follow-up F1.**

**Condo count discrepancy (flag, don't settle):** our Collier pull shows 169,047 condo units vs an
earlier spec figure of 100,847. Single-family matches (110,992 vs 111,129). The gap is per-unit vs
per-building grain — each condo folio is its own row here, which is the grain we want. Reconcile before
citing (follow-up F2).

**Reconciler is BUILT:** `refinery/lib/subdivision-aliases.mts` (committed) — `communityForSubdivision`,
`normalizeSubdivisionName`, `COMMUNITY_ALIASES`. Currently seeded with 1 community; T5 grows it.

## Global Constraints
Inherit §3 of the program plan. Phase 1 uses **no paid APIs** (free ArcGIS). Never invent a number.
Vocab+pack same commit; atomic type-lift ships with backfill; `GRANT SELECT … TO service_role;
NOTIFY pgrst,'reload schema';` after any table creation; ship the GHA cron wrapper + `--dry-run`.

## File Structure
- Done: `refinery/lib/subdivision-aliases.{mts,test.mts}` (T1).
- Create: `fixtures/community-aliases.json` (single source of truth for the alias map — read by both TS and Python).
- Create: `ingest/pipelines/parcel_subdivision/{constants,resources,pipeline}.py` + `test_resources.py`.
- Create: `migrations/2026-07-05-parcel-subdivision.sql`, `migrations/2026-07-05-neighborhood-stats.sql`.
- Create: `ingest/duckdb_pipelines/neighborhood_stats/{agg.py,test_agg.py}`.
- Modify: `ingest/cadence_registry.yaml`; Create `.github/workflows/communities-backbone.yml`.

---

## Task 1 — alias reconciler ✅ DONE
Committed (`refinery/lib/subdivision-aliases.mts` + test, 4/4 passing). No action; T5 grows its map.

## Task 2 — Collier parcel-name ingest → `data_lake.parcel_subdivision`

**Files:** `ingest/pipelines/parcel_subdivision/{constants,resources,pipeline}.py`,
`test_resources.py`, `migrations/2026-07-05-parcel-subdivision.sql`.

**Interfaces:** Produces `data_lake.parcel_subdivision(parcel_id TEXT PK, county TEXT, property_type
TEXT, just_value DOUBLE, zip TEXT, subdivision_name TEXT, phy_addr1 TEXT)`; `fetch_parcels(co_no)` +
`_normalize(feats)`.

- [ ] **Step 2.1 — failing test** (normalizer maps DOR→type and stems the name; no network):
```python
# ingest/pipelines/parcel_subdivision/test_resources.py
from ingest.pipelines.parcel_subdivision.resources import _normalize
def test_normalize_maps_type_and_stems_name():
    feats=[{"attributes":{"PARCEL_ID":"P1","S_LEGAL":"HERITAGE BAY UNIT 12","DOR_UC":"004","PHY_ZIPCD":34120,"PHY_ADDR1":"1 X ST"}}]
    r=_normalize(feats,"collier")
    assert r[0]["property_type"]=="condominium"
    assert r[0]["subdivision_name"]=="HERITAGE BAY"   # UNIT stripped
    assert r[0]["zip"]=="34120"
def test_normalize_drops_non_residential():
    assert _normalize([{"attributes":{"PARCEL_ID":"P2","S_LEGAL":"X","DOR_UC":"010"}}],"collier")==[]  # 010 = commercial
```
- [ ] **Step 2.2 — run, expect fail** (`python -m pytest ingest/pipelines/parcel_subdivision/test_resources.py -q`).
- [ ] **Step 2.3 — migration:**
```sql
-- migrations/2026-07-05-parcel-subdivision.sql
CREATE TABLE IF NOT EXISTS data_lake.parcel_subdivision (
  parcel_id TEXT PRIMARY KEY, county TEXT NOT NULL, property_type TEXT,
  just_value DOUBLE PRECISION, zip TEXT, subdivision_name TEXT, phy_addr1 TEXT);
GRANT SELECT ON data_lake.parcel_subdivision TO service_role;
NOTIFY pgrst,'reload schema';
```
- [ ] **Step 2.4 — implement** (keyset paginator = the WORKING shape; DOR→type map; stem via a Python
  port of `normalizeSubdivisionName` kept identical to the TS):
```python
# ingest/pipelines/parcel_subdivision/constants.py
CENTROID_URL="https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0/query"
CO_NO={"collier":21,"lee":46}   # NOTE: lee(46) record queries 400 on FDOR — Lee uses T3's source, not this.
HOME={"001":"single-family","002":"mobile","004":"condominium","005":"cooperative","008":"duplex-small-multifamily","007":"misc-residential"}
```
```python
# ingest/pipelines/parcel_subdivision/resources.py  (excerpt — keyset paginator identical to collier_parcels)
import re, time, requests
from .constants import CENTROID_URL, CO_NO, HOME
_QUAL=re.compile(r"\b(UNIT|PH|PHASE|BLK|BLOCK|LOT|TR|TRACT|SEC|SECTION|REPLAT|AMD|AMENDED)\b.*$")
def _stem(s):
    s=(s or "").upper().strip(); s=_QUAL.split(s)[0]
    s=re.sub(r"\s+\d.*$","",s); s=re.sub(r"\s+[IVX]+$","",s); return re.sub(r"\s+"," ",s).strip()
def _normalize(feats, county):
    out=[]
    for ft in feats:
        a=ft.get("attributes",{}); dor=str(a.get("DOR_UC") or "").zfill(3)
        if dor not in HOME: continue
        out.append({"parcel_id":str(a.get("PARCEL_ID")),"county":county,"property_type":HOME[dor],
                    "just_value":a.get("JV"),"zip":(str(a["PHY_ZIPCD"]) if a.get("PHY_ZIPCD") else None),
                    "subdivision_name":_stem(a.get("S_LEGAL")),"phy_addr1":(a.get("PHY_ADDR1") or "").strip() or None})
    return out
def fetch_parcels(county):
    last=-1; rows=[]
    while True:
        params={"where":f"(CO_NO={CO_NO[county]}) AND OBJECTID>{last}","outFields":"OBJECTID,PARCEL_ID,S_LEGAL,DOR_UC,JV,PHY_ZIPCD,PHY_ADDR1",
                "orderByFields":"OBJECTID ASC","resultRecordCount":2000,"returnGeometry":"false","f":"json"}
        for a in range(6):
            try:
                j=requests.get(CENTROID_URL,params=params,timeout=60).json()
                if "error" not in j: feats=j.get("features",[]); break
            except Exception: pass
            time.sleep(2*(a+1))
        else: raise RuntimeError(f"{county} page failed @oid>{last}")
        if not feats: break
        rows+=_normalize(feats,county)
        if len(feats)<2000: break
        last=max(f["attributes"]["OBJECTID"] for f in feats)
    return rows
```
`pipeline.py` = dlt merge into `parcel_subdivision` (mirror `collier_parcels._promote_to_tier2` chunked-merge; `assert_min_rows(len(rows), 250000, label="collier parcel_subdivision")`).
- [ ] **Step 2.5 — run test (PASS), migration, live Collier ingest** (~364k rows; the paced paginator handles the FDOR throttle). Verify row count ≈ 364k.
- [ ] **Step 2.6 — commit** (`ingest/pipelines/parcel_subdivision/`, migration).

## Task 3 — Lee parcel-name ingest (SEPARATE source — FDOR Lee is broken; see F1)
Same `data_lake.parcel_subdivision` table, `county="lee"`. **First resolve F1** (which Lee source yields
per-parcel names cleanly): either (a) Lee GIS `FabricSubdivisions.Description` joined to LeePA parcels on
`FolioID`, or (b) LeePA `ParcelInfo` layers directly. Then mirror T2's normalize/merge. TDD the FolioID
join with a known Lee parcel (e.g. a Pelican Preserve / Gateway folio). **Do not pull Lee from FDOR.**

## Task 4 — Aggregate → `data_lake.neighborhood_stats`
Group `parcel_subdivision` by `subdivision_name` (per county) in DuckDB (`aggregate-at-source`): `home_count`,
`count_by_type` (JSON), `median(just_value)`. Migration + `aggregate_stats(con)` + known-answer test
(3 rows → count 3, median, by-type). Same shape as the superseded plan's Task 5 — that code carries over
verbatim, just reading `parcel_subdivision` instead of `parcel_neighborhood`.

## Task 5 — Grow the alias map + roll up to communities
- [ ] Extract `COMMUNITY_ALIASES` to `fixtures/community-aliases.json` (single source of truth; TS reconciler
  and a small Python helper both read it — avoids dual maintenance).
- [ ] Seed it from the marketed-community name list (Phase-2 scrape target: ~120 golf via naplesgolfguy +
  gated via 55places) mapped to their sub-neighborhood name prefixes (from the `parcel_subdivision`
  `subdivision_name` dump). Prioritize the fragmented masters first (Pelican Bay's 58, Lely, Fiddler's).
- [ ] Test: known communities resolve (Heritage Bay, Pelican Bay incl. sub-neighborhoods → one slug);
  **measure coverage** = % of homes whose subdivision rolls up to a marketed community; target set from the
  first run (Pelican Bay should climb from 59% toward ~100%).
- [ ] Build the community rollup → `data_lake.community_profiles` seed (home_count per marketed community).

## Task 6 — cadence + cron + `--dry-run`
Add `parcel_subdivision` + `neighborhood_stats` to `ingest/cadence_registry.yaml` (annual, `count_table`,
`expected_rows_min` from the live count). `.github/workflows/communities-backbone.yml` runs T2→T3→T4→T5
rollup with `--dry-run`. No LLM, no paid API.

---

## Follow-ups (punch list — carry to next session)

- **F1 — RESOLVED 07/06/2026, but the answer is NOT a name-join.** FDOR `CO_NO=46` is broken (record
  queries 400) — AND neither of this file's two candidates yields a per-home name: `FabricSubdivisions`
  / `ParcelDetails` layer 33 "Subdivisions" (7,387 rows) is subdivision/plat-BOUNDARY grain (one row per
  plat, `Just`/`Assessed` null on every row) — not per home; `ParcelInfo`'s 24 layers carry no
  legal-description/subdivision field at all. Lee has no Collier-style `S_LEGAL`-on-every-parcel
  equivalent. **Lee needs a scoped spatial join** (548,389-parcel centroids from `ParcelInfo` layer 12's
  `SHAPE` × ~7,387 `ParcelDetails/33` polygons, CRS 2237→4326, DuckDB `ST_Contains`) — full evidence +
  recommended approach in `verification/communities-lee-source-probe.md`. This reuses the SUPERSEDED
  backbone plan's Part A (A0–A4) DuckDB spatial-join steps almost verbatim, narrowed to one county. Owns
  T3; T2 (Collier, already built) is unaffected and ships regardless.
- **F2 — RESOLVED 07/06/2026.** 169,047 (ours, per-unit) is the number to cite; `100,847` was a
  different-grain/stale source, not a live discrepancy — single-family independently matched within
  0.1% so the pull method is sound. Spec annotated in place (`docs/superpowers/specs/2026-07-05-communities-swfl-design.md`
  §Scope). Collier total homes is **289,212**, not ~221K.
- **F3 — Alias-map coverage.** Grow `COMMUNITY_ALIASES` from the name dumps; measure % of homes assigned to
  a marketed community; set the coverage bar. This is the ONLY remaining accuracy work (replaces the X/Y gate).
- **F4 — Marketed-community master list.** Build the ~120–300 name list (naplesgolfguy golf + 55places gated)
  — this is Phase 2's scrape and also the reconciler's target set. Each with golf structure / fee range / amenities.
- **F5 — Situs address.** `PHY_ADDR1` is on the centroid layer and now landed — enables the assistant's
  per-address "what neighborhood am I in" lookup. Wire it in Phase 5.
- **F6 — Other counties.** v1 is Lee+Collier. The centroid layer is statewide; extend by `CO_NO` (21 & 71
  work; **probe each new county's partition** — 46 was broken, so don't assume). Charlotte/Sarasota next.
- **F7 — Register checks.** Open `communities_swfl_live_verify` + sub-checks via `scripts/check.mjs` before
  Part-B execution (spec exists; do NOT re-run `new-build.mjs`).
- **F8 — Phases 2–5 unchanged** by the pivot — they consume the backbone tables regardless of how built.
  See the program plan's briefs (scrape → `community_profiles`; Mapbox drive-times; pack + drill route +
  master wiring; Lab AI + chat grounding).

## Session artifacts (07/05/2026)
- `refinery/lib/subdivision-aliases.{mts,test.mts}` — reconciler, committed (live on origin).
- `verification/communities-name-join-accuracy.md` — the benchmark, committed `c39925f1`.
- Local scratch (not committed): `collier_names.csv` (364k Collier parcel names) in the session scratchpad —
  the group-by source; regenerate via T2 if needed.
