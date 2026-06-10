# J6 — Parcels PARKED brief (= §G parcel-exact)

> **Preamble:** This is a **documentation-only** card. It exists to satisfy **G2** ("no address/geo
> on the row → **park in deferred, do not silently omit**"). No schema change, no pipeline edit.

**Phase:** any · **Depends on:** nothing · **Parallel:** fully independent.
**Model: 🟢 SONNET-FINE** — doc-only + open one `checks` row.

## The verdict
`data_lake.leepa_parcels` and `data_lake.collier_parcels` **cannot take a `zip_code` column today**:
they carry **no site geo on the row**. `leepa_parcels` is folioid + valuation + sale columns only
(`ingest/pipelines/leepa/resources.py:_TIER2_LEEPA_COLUMNS` — 15 columns, no situs address, no
lat/lon, no zip). A ZIP here is **not a column-add** — it requires new ingest work first. Per G2,
that means **parked, not omitted.**

## What's required to unblock (the real work, scoped separately)
1. **Extend the parcel ingest** to pull a site locator:
   - LeePA: add the **situs-address** (or parcel-centroid geometry) layer to
     `ingest/pipelines/leepa/resources.py` joined on `folioid`.
   - Collier parcels: the equivalent situs/geometry layer.
2. **Geocode** the situs address (or reverse-geocode the centroid) → ZIP, **scope-gated through
   `resolveZip(zip).in_scope`** (J1), NULL when out-of-6-county.
3. `ALTER TABLE … ADD COLUMN IF NOT EXISTS zip_code text` + backfill + **wire the pipeline** (G2).
4. **G3:** the consuming brain is `properties-lee-value` (already reads `leepa_parcels`); surface
   the ZIP in its detail_tables in the same PR.

## Relationship to the existing plan
This is exactly **§G "parcel-exact"** of `../2026-06-09-universal-location-search/07-parcel-exact.md`
— "address → parcel enrichment," flagged there as days-to-weeks, separate from the spine, not a
blocker for ZIP search. Track it as a `checks` row (e.g. `parcels_zip_source_layer`) rather than
leaving it implicit.

## Acceptance (of THIS card)
- A `checks` row is opened for the parcel ZIP source-layer extension (`node scripts/check.mjs open
  …`), and this brief is committed under the handoff folder. Nothing is silently dropped.
