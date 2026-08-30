# Subdivision-to-community crosswalk via public PUD/PD boundary geometry

**Registered:** 2026-08-12 (stub) · **Designed:** 2026-08-28 · **Status:** BUILT + LIVE 08/28/2026
— first run: 104,911 assignments / 409 communities; 96,679 servable across 401
(`parcel_community_pd_summary_v`); 7,429 ambiguous flagged, 803 low-trust silenced; Collier's
220,875 parcels explicitly excluded. Pipeline `ingest/pipelines/lee_planned_developments/`,
consumers `lib/listings/community-identity.ts` + communities-swfl pack.

Every number in this spec was measured live on 08/28/2026. Nothing here is carried from the
08/12/2026 playbook without re-measurement; where the playbook and a live probe disagreed, the
probe wins and the disagreement is called out.

---

## Problem

A home cannot be tied to the community it is marketed as being in.

- `data_lake.parcel_subdivision_v` — 604,362 homes-only Lee+Collier parcels — carries a PLATTED
  subdivision name derived from FDOR legal text ("GOLDEN GATE EST UNIT82"), not a marketed
  community name.
- `data_lake.community_profiles` — 81 marketed communities with in-gate facts (gated, golf, HOA
  range, CDD, amenities), each fact sourced and as-of.
- `data_lake.neighborhood_stats` — 20,400 rows at subdivision grain (live count 08/28/2026).

81 profiles against 20,400 subdivisions makes a miss the normal case.

**String matching is measured dead, not assumed dead.** `docs/standards/community-crosswalk-playbook.md`
line 32: stemming UNIT/PHASE/TRACT collapsed 23 of 20,369 names, because only 71 names contain
those tokens at all. Line 35: "don't propose a bigger regex. The names genuinely don't carry the
relationship." **A vector/embedding ranker is the same class of move and is equally out of scope
here** — this was proposed and withdrawn on 08/28/2026 before design began.

## Goal

Ship community IDENTITY for Lee parcels via geometry: a parcel's point either falls inside a
county-recorded Planned Development boundary or it does not. No name matching anywhere in the
assignment path.

**Explicitly NOT the goal of this build:** in-gate facts coverage. Measured 08/28/2026, only
**3 of 81** profiles match a PD polygon by normalized name — Shadow Wood Preserve, West Bay Club,
Wildcat Run. 40 of the 81 profiles are Collier (a Lee-only layer can never cover them) and most
of the remaining 41 are country clubs inside incorporated cities the layer excludes by design.
Facts coverage is phase 2 and depends on growing `community_profiles`, not on this join.

## Scope limit — never drop this sentence

The source layer covers **unincorporated Lee County only**, plus some legacy incorporated
polygons. Cape Coral, Fort Myers and Bonita Springs are NOT fully covered. This build must never
be described, in code comments, source lines, or customer copy, as "the community answer for Lee."

Collier's equivalent layer is UNCONFIRMED. Playbook line 54 forbids re-running that search from
zero; it was not re-run on 08/28/2026 and remains open.

---

## The source — full field census, live 08/28/2026

Lee County Department of Community Development, "Planned Developments".
Info page: `https://www.leegov.com/dcd/zoning/pd`
FeatureServer: `https://services2.arcgis.com/LvWGAAhHwbCJ2GMP/arcgis/rest/services/PlannedDevelopments/FeatureServer/0`

`maxRecordCount` 2000 · pagination supported · `esriGeometryPolygon` · wkid **2237**
(NAD83 Florida State Plane West, **feet**).

**26 fields:** OBJECTID, CASE_NAME, PL_COM, REMARKS, PLANNEDDEVELOPMENTS_AREA, ACRES, PC_ID,
TIDEMARK_ID, DATASHEET, INPUTMETHOD, INITIALAPPROVAL, ZONING_CATEGORY, MASTER_NO, INIT_RESOLUTION,
IMS_STATUS, TESTFIELD, GlobalID, Source_GlobalID, EDITOR_NAME, EDIT_DATE, created_user,
created_date, last_edited_user, last_edited_date, Shape__Area, Shape__Length.

**1,629 features total** (the playbook recorded 1,627 on 08/12/2026 — the layer grew by 2).

`IMS_STATUS`: Approved 1207 · Rezoned 190 · Withdrawn 86 · Pending 67 · Denied 35 · Other 22 ·
null 21 · "Approved/Pending" 1.

`ZONING_CATEGORY`: **CPD 749** · RPD 414 · MPD 133 · IPD 133 · CFPD 47 · PUD 47 · MHPD 29 ·
null 26 · RVPD 18 · AOPD 7 · MEPD 5 · PRFPD 5 · MHPD-RVPD 3 · CFPD-RPD 2 · C-1 2 · DRI 2 ·
CONV 2 · CCPD 1 · "Pre MEPD" 1 · CF 1 · IPD-CPD 1 · CPD-RPD 1.

`INPUTMETHOD`: Legal 1096 · null 368 · MaB 82 · Plats 43 · Parcels 15 · **Sketched 15** ·
Plat 6 · Digital 2 · "SDE Parcels" 1 · **"Bad Legal" 1**.

**The finding that reshaped this design:** the largest category is CPD — Commercial Planned
Development. The playbook treated CPD as in-scope ("PUD/RPD/MPD/CPD/etc"). It is not: including
it maps homes into shopping centers.

Measured intersections:
- Approved: **1207**
- Approved AND residential-capable (RPD, PUD, MPD, MHPD, RVPD, CFPD-RPD, CPD-RPD, MHPD-RVPD):
  **490** ← the honest joinable universe
- Approved AND commercial/industrial/civic (CPD, IPD, CFPD, AOPD, MEPD, PRFPD, CCPD): **703**
- Approved + residential + INPUTMETHOD='Sketched': **4**
- CASE_NAME null or empty: **2**

The 490 uses the full eight-category allowlist. A narrower five-category sample
(RPD, PUD, MPD, MHPD, RVPD) returned **486** rows, and the name statistics below come from that
sample — the two counts are consistent, not a discrepancy.

Of those 486 sampled residential rows: **436 distinct CASE_NAME**, 32 names repeat (multi-phase
polygons of one community), ACRES median 38.5 / min 0.0 / max 5208.6. Names are dirty by design —
street addresses ("11101 New Moon Ct"), zoning suffixes ("Amavida RPD"), former names
("Stoneybrook DRI/RPD/CPD (FKA Corkscrew Pines)").

## The blocker that was found and cleared

`parcel_subdivision_v` has **no coordinate column**. Neither does `lee_parcels` (104 columns) nor
`leepa_parcels`. The playbook's instruction to "reproject before joining against our lat/lon
parcel data" assumed parcel coordinates we do not hold.

Cleared: LeePA **FabricParcels** (`https://gissvr.leepa.org/gissvr/rest/services/ParcelsWFS/MapServer/0`,
106 fields, maxRecordCount 1000) exposes `Latitude`, `Longitude`, `Point_X`, `Point_Y`, and
**563,963 rows carry a non-null Latitude**. `ingest/pipelines/leepa/` **already queries this exact
layer** for the strap crosswalk (`constants.py:25`). The missing input is two extra fields on a
call we already make — not a new source, not new spend.

---

## What we're building

### Piece 1 — parcel coordinates

Extend the existing LeePA FabricParcels pull to also land `Latitude` and `Longitude` alongside the
`Name`/`FolioID` strap crosswalk. Snapshot source; keeps its existing write disposition, with the
reason documented in the pipeline. Lee only.

### Piece 2 — boundary ingest

New pipeline `lee_planned_developments` → `data_lake.lee_planned_developments`.

Lands **all 1,629 features**, not the 490. Full-scope-first: a Pending polygon becomes Approved
next quarter, and filtering at ingest would silently rewrite history. The residential/Approved
filter is applied at READ, in the join, where it is auditable.

Geometry is requested with **`outSR=4326`** so the ArcGIS server performs the State Plane →
WGS84 reprojection. This deletes the reprojection failure class rather than guarding it — no
client-side pyproj, no new dependency.

Columns: OBJECTID, CASE_NAME (raw, never overwritten), community_name_normalized (zoning suffixes
and parenthetical FKA stripped — this is BOTH the display label AND the key that collapses the 32
multi-phase repeats in failure mode 4, so it is load-bearing, not cosmetic; it is derived in the
normalizer and is never a substitute for CASE_NAME, which is preserved verbatim),
ZONING_CATEGORY, IMS_STATUS, INPUTMETHOD,
ACRES, INITIALAPPROVAL, MASTER_NO, PC_ID, last_edited_date, geometry (GeoJSON, WGS84).

### Piece 3 — the spatial join

DuckDB `spatial` extension, inside the Python ingest island. Verified working locally 08/28/2026
on the pinned 3.12 venv: duckdb 1.5.4, `INSTALL spatial; LOAD spatial;`, `ST_Contains` returns
true/false correctly.

Chosen over two alternatives:
- **PostGIS** — available 3.3.7 but NOT installed on the Brains database. Installing an extension
  on production for a 564k × 490 problem is a heavier change than the problem warrants (RULE 11).
- **TypeScript `lib/geo/ray-cast.ts`** — the playbook's suggestion, but it would pull geometry out
  of the Python island for no gain. DuckDB also means writing **no new point-in-polygon code**,
  which matters: this repo already holds two implementations and `ray-cast.ts`'s header documents
  that it exists specifically to prevent a third.

Output `data_lake.parcel_community_pd`: parcel_id, pd_object_id, community_name_normalized,
case_name_raw, zoning_category, input_method, acres, assigned_at. The residential/Approved filter
is recorded in the table so any number it produces is auditable back to its own criteria.

### Piece 4 — consumer (brain-first, same PR)

A `PackDefinition` reads `parcel_community_pd` in the same PR. Gate 12 already blocks a new
`data_lake.*` table nothing reads. The 3 matched profiles are wired through the existing
`lib/listings/community-inside-the-gate.ts` lookup; the other 487 polygons deliver identity only.

---

## Failure modes, each paired with the guard that stops it

1. **Commercial polygons put homes in shopping centers** (703 Approved features are CPD/IPD/CFPD).
   Guard: the join filters on a NAMED residential allowlist, never a negation. Test: a CPD fixture
   asserts zero parcels assigned.
2. **Longitude/latitude swapped** — compiles fine, silently matches nothing. `ray-cast.ts`'s header
   documents this exact trap. Guard: a fixture parcel with known containment in a known PD; the
   test fails if the match count is zero.
3. **Reprojection error** — State Plane feet read as degrees. Guard: `outSR=4326` requested from
   the server (the class is deleted, not caught), PLUS a bounds assertion that every polygon vertex
   falls inside Lee County's lat/lon envelope; outside → fail loud, do not write.
4. **Multi-phase duplicates** — 32 CASE_NAMEs repeat. Guard: assignment is many-to-one on
   normalized community name. Test: a parcel inside two polygons of ONE community yields one row.
5. **Overlapping/nested polygons** — a small RPD inside a large MPD. Guard: on multi-match, smallest
   ACRES wins; the ambiguity count is recorded as a run metric, never silently first-wins. Test:
   a parcel inside two DIFFERENT communities is flagged, not quietly assigned.
6. **Hand-drawn boundaries shipped as fact** — 4 Sketched + 1 Bad Legal in scope. Guard:
   INPUTMETHOD travels to the consumer; the consumer stays SILENT for Sketched/Bad Legal. A silent
   miss is correct; a wrong community ships as a stated fact.
7. **Claiming coverage we don't have** — incorporated cities. Guard: the source line states
   unincorporated Lee only, wording test-enforced the way `neighborhoodAmenitiesSourceLine`
   already is.
8. **Empty names** — 2 features. Guard: dropped at normalize, counted, logged. Never a blank
   community.
9. **Collier parcels silently absent** — they have no coordinates. Guard: the join is scoped to Lee
   and reports the Collier count as explicitly excluded, not missing.
10. **Destructive replace with no non-null guard** (pre-push Gate 4). Guard: `ingest.lib.guards` on
    CASE_NAME and geometry before any replace.
11. **Built-not-wired** — this repo's most-repeated failure. Guard: consuming pack in the same PR;
    Gate 12 enforces it.
12. **Source drift / staleness.** Guard: registry entry carrying this field census as its
    `source_scope`, plus the GHA cron wrapper and `--dry-run` in the same PR.

## Testing

TDD, mandatory. Every guard above gets its failing test FIRST, named for the failure mode it
stops. A green suite does not replace the environment and data-existence guards; those are
separate and also required.

## Definition of done

- `lee_planned_developments` lands 1,629 rows with WGS84 geometry; registry entry carries the
  census above as `source_scope`; cron wrapper + `--dry-run` ship in the same PR.
- FabricParcels pull carries Latitude/Longitude.
- `parcel_community_pd` is populated, with the assigned/ambiguous/excluded counts reported.
- A consuming pack reads it.
- `docs/standards/data-roots.md` gains the boundary root; the playbook's status list is updated
  in place (line 51 says update, don't duplicate).
- Check `community_crosswalk_live_verify` is promoted back to verify class ONLY when code lands.
