# §G — Parcel-exact answers (separate data track; NOT a blocker)

**Phase 4 · days–weeks · depends on: a data-acquisition track, not §A–§F · status: deferred**
Read [`README.md`](./README.md) §0 first. This is the ONE thing the universal-search build can't
deliver on existing data — documented here so it is never faked.

---

## The honest gap
We hold parcel **values** (Lee `data_lake.leepa_parcels`, Collier `data_lake.collier_parcels`)
but **cannot join a street address to a parcel today**:
- Neither parcel table carries a situs **address** or **lat/lon** (Lee = 15 value columns +
  `folioid`; Collier = value columns + `parcel_id` + `phy_zipcd`, no address/coords).
- Lee parcel **geometry** lives only in Tier-1 `leepa/parcels/*.geojson.gz` (not queryable at
  runtime).
- Corridor assignment is **nearest-centroid**, not point-in-polygon.

So an address resolves to **ZIP / corridor** grain (via §E) and we say so. **Never invent a
parcel-level number from a street address** — that violates the moat.

## Cheapest honest paths (ODD-scaffold — see `docs/superpowers/plans/2026-06-05-operation-dumbo-drop.md`)
- **Lee (best ROI):** ingest parcel **centroids** from the Tier-1 `leepa/parcels/*.geojson.gz` we
  already archive → enables nearest-parcel via the existing Haversine helper
  (`refinery/lib/corridor-assignment.mts`). Then address → geocode → nearest Lee parcel → value.
- **Collier:** `phy_zipcd` already gives **ZIP-grain** parcel stats now; address→parcel needs a
  situs join (FDOR cadastral has none) → ATTOM / third-party parcel API enrichment.

## When to pick this up
Only after Phases 1–3 ship and there is real demand for parcel-exact address answers. Scope it as
its own plan with its own provenance + cadence (it's an ingest project, not a wiring job). It is
explicitly **out of the critical path** for universal location search.
