# Lee permits from Lee ArcGIS — NOT BUILT: the source is a frozen snapshot

**Date:** 2026-09-20 · **Verdict:** do not swap. Plan task E1
(`docs/superpowers/plans/2026-09-15-master-brain-backend-week.md`) rested on a registry line that
was never probed for freshness. Operator waived the plan gate 09/20/2026; the live source killed it.

**Already known, never wired:** `docs/handoff/2026-07-11-reliable-sources-findings.md:251` found the same
freeze on 07/11/2026 and `docs/audit/2026-07-11-pipeline-problems/02-known-problems-ledger.md:412` said "do NOT
retire the Accela cron on this" - but the registry line stayed uncorrected until 09/20/2026, so the 09/15 plan
was written from it.

## What the live source says (probed 09/20/2026, plain GETs, reproducible)

Org `LvWGAAhHwbCJ2GMP`, host `https://services2.arcgis.com/LvWGAAhHwbCJ2GMP/arcgis/rest/services`,
930 services, three permit layers, every one named `_March2025`:

- `BuildingPermits_UnincorporatedLee_March2025/FeatureServer/0` — `returnCountOnly` 9,386 ·
  `editingInfo.lastEditDate` 03/05/2025 · `USER_Date_Issued` 01/08/2003 → 03/04/2025.
- `CommercialBuildingPermits_UnincorporatedLeeCounty_March2025/FeatureServer/0` — 719 ·
  last edit 03/11/2025.
- `CapeCoral_ResidentialBuildingPermits_March2025/FeatureServer/0` — 2,192 · last edit 03/06/2025;
  dates are strings, permit numbers are a different format (`BRC24-001483`).

No 2026 successor exists among the 930 service names. `gismapserver.leegov.com` carries only
regulatory overlays and the Accela basemap — no permit-record table.

## Why it cannot replace the Accela scrape

1. **Dead.** Newest permit 03/04/2025. Our table (`data_lake.lee_building_permits`, read the same
   day): 333 rows, issued 02/25/2026 → 09/14/2026. The pipeline's own 14-day content-freshness
   guard would fail the first run.
2. **Two record types of nineteen.** Every `USER_Record_ID` is `RES…` or `COM…` (the "neither"
   count is 0 on both layers). The scrape lands MEC, ELE, ROF, FIR, PLU, POL, SOL, DEM, SGN, FNC
   and more; RES + COM are 89 of our 333 rows.
3. **`USER_Type_of_Use` is a use class** ("Single Family Residence", "Duplex"), not a permit
   type — `buckets.py` would put the whole residential layer in one bucket and mis-bucket new
   commercial as alteration.
4. **`USER_Record_ID` is not unique** (9,386 rows / 9,331 ids; 719 / 620) — one row per geocoded
   unit. A `primary_key="permit_id"` merge would collapse them silently.
5. No valuation, no description (not load-bearing today — `permits-swfl` reads only permit_id,
   issued_date, bucket, zip_code, lat, lon — but a loss all the same).

## What it IS good for (not scoped, not started)

The Accela portal cannot serve history before 2026 (`ingest/pipelines/lee_permits/README.md`).
The residential layer is a free one-shot 2003–2025 register of new dwellings with parcel STRAP on
9,384 rows, situs ZIP on 9,377, and point-address geocodes on 9,308 — a history backfill, in its
own table or behind a source discriminator with a `replace` load, never merged into the live
weekly root. Open question before any use: 36.6% of rows have no `USER_Date_Issued`, and some
non-issued statuses carry one — what that date means on those rows is UNVERIFIED.
Check: `lee_permits_arcgis_history_backfill`.
