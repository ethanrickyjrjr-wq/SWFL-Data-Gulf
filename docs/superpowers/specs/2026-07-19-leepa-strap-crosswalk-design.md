# STRAP crosswalk column on leepa_parcels (FabricParcels Name-FolioID)

**Date:** 2026-07-19 · **Checks:** `leepa_fdor_strap_crosswalk_unwired` + `leepa_strap_crosswalk_live_verify`
**Operator-approved design (07/19, in-session):** backfill + pipeline change · key only (no served metric in this build).

## Problem

`data_lake.leepa_parcels` (LeePA appraiser, KEEP-BOTH ratified 07/18) keys on `folioid` only — no
strap, no address. `data_lake.lee_parcels` (FDOR, landed 07/18) keys on `parcel_id` (the Lee STRAP)
with `alternate_key` 0% populated. The two Lee parcel tables therefore only meet at ZIP grain; the
parcel-grain appraiser-vs-state cross-check (SOH reconciliation, `building_value` context on FDOR
rows) is impossible.

## Evidence (live probes, 07/19/2026)

- LeePA `ParcelsWFS/MapServer/0` ("FabricParcels") — a sibling SERVICE to ParcelInfo, not one of its
  24 layers: 564,339 rows, `Name` + `FolioID` both zero-NULL, `Historical=1` count 0,
  maxRecordCount 1000, supportsPagination/orderBy true.
- `Name` IS the STRAP in FDOR form: 5/5 sampled straps (via ParcelInfo layer 21 `current_strap`)
  joined `data_lake.lee_parcels.parcel_id` exactly.
- 564,339 fabric rows vs 548,798 leepa parcels → ~15.5k fabric artifacts; dedupe required.
- **G1 trap:** FabricParcels `Address1/City/State/ZIP` are OWNER-MAILING fields (a CA ZIP appears on
  a Lee parcel). Never pulled. FDOR `phy_zipcd` stays the situs-ZIP authority.

## FULL-SCOPE-FIRST census — FabricParcels field ceiling

~110 fields available. **Pulled: 2** — `Name` (STRAP), `FolioID`. Available-unpulled, noted for the
registry: `Longitude/Latitude/Point_X/Point_Y` (parcel coordinates — would give leepa geometry),
`DORCode`, `CondoName`, `Legal`, `LandUseCode/Desc`, `Zoning/ZoningDesc`, `TaxingDistrict`,
`AVMMarketArea`, `AVMNBHD`, `BldgNumber/UnitNumber/MaxFloor/PhaseNum`, plat `Book/Page`,
PLSS township/range/section. Owner fields (`OwnerName`, `CareOf`, mailing address block) are PII —
deliberately excluded, same policy as FDOR.

## What we're building

1. **`strap text` column on `data_lake.leepa_parcels`** (attribute lives on the parcel row — same
   precedent as `zip_code`; no second crosswalk table). Idempotent DDL in
   `migrations/20260719_leepa_parcels_strap.sql`.
2. **Pipeline change** (`ingest/pipelines/leepa/`): `_fetch_strap_by_folio()` pulls Name+FolioID via
   `paginate_arcgis_keyset` (offset walk silently truncates on this host — the L12 lesson), dedupes
   one-strap-per-folio (deterministic `min(Name)`), asserts fetched-vs-canonical ≥90%
   (`assert_vs_canonical`), archives the pairs to Tier-1 (`leepa/fabric_strap/<date>.csv.gz` +
   inventory pointer). `_join_leepa` gains `strap_by_folio`; attach degrades to NULL on any fetch
   failure — the crosswalk lane never aborts the parcel ingest (zip_code precedent).
3. **One-off backfill** `scripts/backfill_leepa_strap.py` (apply_collier_sold_median_view.py
   credential precedent: `.dlt/secrets.toml` / `DESTINATION__POSTGRES__CREDENTIALS`, psycopg): ALTER
   IF NOT EXISTS → fetch pairs → COPY into temp table → single UPDATE-join → print live coverage %
   and lee_parcels join-rate %. Exits 1 if coverage <90%; numbers printed, never assumed.
4. **Bookkeeping in the same commit:** `ingest/quality/schema_baselines/data_lake.leepa_parcels.json`
   gains `strap` (and the already-live, baseline-missing `zip_code` — pre-existing drift folded in);
   `cadence_registry.yaml` leepa `source_scope` gains the FabricParcels census + confirms the
   layer-19–23 field schemas this session's probes resolved (registry said UNCONFIRMED/timeouts);
   `docs/standards/data-roots.md` leepa row updated (strap landed, parcel-grain join now real);
   stale test count assert fixed (15 → 17: zip_code had already made the dict 16, strap makes 17).

## Not in scope

Any served metric on top of the key (SOH reconciliation, building_value on FDOR surfaces) — a
separate greenlit build. No consumer repoints. No leepa deletion (KEEP BOTH is ratified and inert).

## Success criteria (live-verified, not promised)

- `count(strap) / count(*)` on `leepa_parcels` ≥ 90% (expected ~high-90s).
- Of non-null straps, % matching `lee_parcels.parcel_id` reported (expected high; mismatches =
  genuine snapshot drift between appraiser and state rolls, reported not hidden).
- Existing leepa pipeline tests green + new strap tests green.
- Future annual leepa runs carry strap natively (unit-tested via mocked crosswalk).
