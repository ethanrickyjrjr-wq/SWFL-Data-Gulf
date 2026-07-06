# Lee parcel-subdivision source probe (F1) — 07/06/2026

**Finding: Lee has NO per-home text field carrying subdivision name. The pure
name-join that works for Collier (`S_LEGAL` populated on every parcel row) has
no Lee equivalent. Lee needs a spatial join (point-in-polygon), scoped small —
against ~7,400 subdivision-boundary polygons, not a full re-litigation of the
dead spatial-join spike.**

## What was checked (live, free ArcGIS REST, 07/06/2026)

1. **Lee GIS `Subdivisions_and_Condominiums` FeatureServer** (`services2.arcgis.com/LvWGAAhHwbCJ2GMP`),
   layer 0 "FabricSubdivisions". 7,557 rows. Fields confirmed: `Name` = STRAP code
   (trap, e.g. `224423C303000000A`), `Description` = clean human name (e.g.
   `POINTE ESTERO`, `LEHIGH ACRES UNIT 4`). **But**: within one 2,000-row page,
   only 1,940/2,000 `FolioID`s were unique — this is catalog/plat grain, not
   home grain.
2. **LeePA `ParcelDetails` MapServer** (`gissvr.leepa.org/gissvr/rest/services/ParcelDetails/MapServer`)
   layer 33 "Subdivisions" — the design spec's implied source (spec said "layer 32
   SUBDIV"; the live layer list has no 32-named-SUBDIV, but layer 33 "Subdivisions"
   is the same idea and carries far more: `Description`, `CondoName`, `CondoDesc`,
   `DORCode`/`DORDesc`, `SiteNumber`/`SiteStreet`/`SiteZip`, `Just`/`Assessed`/`Taxable`,
   `Legal`, geometry (`esriGeometryPolygon`). **Count: 7,387.** A direct query for
   `Description='POINTE ESTERO'` returns exactly **1 row** with `Just`/`Assessed`
   both NULL — confirming this is a subdivision/plat BOUNDARY record, not a home
   valuation record. One row per platted subdivision, not per home.
3. **LeePA `ParcelInfo` MapServer** (the service the existing `ingest/pipelines/leepa`
   pipeline already reads for `use_code`/values/sales) — checked ALL 24 layers'
   field lists. None carry a legal-description or subdivision-name field. Layer 12
   ("Just Value", the real per-home spine — 548,389 rows, matches Lee's full parcel
   count incl. non-home) has only value fields + `SHAPE`. Layer 0 ("Tangible
   Business Names", 65,487 rows) is tangible personal property (business
   equipment accounts), NOT real property — a red herring, despite being the
   `LEEPA_PARCELS_URL` constant name suggesting otherwise.

## Why this breaks the plan's F1 assumption

The `phase1-namejoin` plan's F1 posed the choice as "(a) `FabricSubdivisions.Description`
⋈ LeePA `FolioID`, or (b) LeePA `ParcelInfo` layers directly" — both read as if one
would yield a per-home name via a simple join or direct field. Neither does:
(a)/the `ParcelDetails/33` twin of it is catalog-grain (7,387 subdivisions, no
per-home value), and (b) has no name field at all. There is no FDOR-for-Collier
equivalent for Lee — Collier's win (`S_LEGAL` on every parcel) does not generalize.

## What Lee actually needs

Point-in-polygon: each Lee home's centroid (from `ParcelInfo` layer 12's `SHAPE`,
the real per-home parcel geometry, 548,389 rows) against `ParcelDetails` layer
33's ~7,387 subdivision boundary polygons. This is the spatial join the program
plan's pivot declared dead **for Collier** — it is NOT dead for Lee; it was never
tested against Lee because the pivot's live probe (07/05/2026) only checked
Collier's `S_LEGAL` availability. Scope is far smaller than the original
spatial-join spike's full two-county 700K×boundaries plan: ~548K parcels ×
~7,387 polygons, Lee only.

**Open before building:** geometry CRS (LeePA services return `wkid 2237`, FL
State Plane ft, per the program plan's C3 finding on this same service family —
needs reprojection to 4326 before any lon/lat point-in-polygon test); DuckDB
`spatial` extension has never been proven to load on the GHA runner (same C4
gap the program plan flagged); perf at this scale is untested. None of this is
disqualifying — it's the superseded backbone plan's Part A (A0–A4) steps,
narrowed to one county and ~7,400 polygons instead of two counties and the full
boundary set. That plan's DuckDB `ST_Contains` code can be reused almost
verbatim; only the boundary source changes (`ParcelDetails/33` instead of the
"Subdivisions" opendata layer it originally targeted).

**Recommendation:** hand this to whichever session is doing Phase 4 (or a fresh
one) as a scoped spike — prove `INSTALL spatial` on GHA + one known-answer
point-in-polygon (e.g. a Pointe Estero or Lehigh Acres parcel) before writing
the full T3 ingest. Collier's T2 (already built, `ingest/pipelines/parcel_subdivision/`)
is unaffected and ships regardless of how Lee resolves — `parcel_subdivision`
already has a `county` column, so Lee lands as a second write path into the same
table once its join is proven.
