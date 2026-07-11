# HANDOFF — Lee homes-only sold median per ZIP (build-ready)

**For:** a fresh Claude session picking up execution. **Date:** 2026-07-11.
**Spec:** `docs/superpowers/specs/2026-07-11-homes-only-sold-median-design.md`
**Plan:** `docs/superpowers/plans/2026-07-11-homes-only-sold-median-lee.md` (task-by-task, TDD)
**Build slug:** `homes-only-sold-median` · **Live-verify check:** `homes_only_sold_median_live_verify`

## What this is

Ship a **homes-only sold median per ZIP for Lee County** from LeePA recorded-deed data already in the
lake. It replaces the land-blended "median" that collapses land-heavy ZIPs (e.g. Lehigh Acres 33972
currently reads ~$35k on the active-asking path when the real single-family median is ~$355k). Brainstorm
+ spec + plan are done; **execution has not started.** Start at Plan Task 0.

## Ground truth already verified (do NOT re-probe — all live 07/11/2026)

- **Lee sold data is already live and correct.** `data_lake.leepa_parcels`: 548,798 parcels, 528,130
  priced (96%). Reproduced against the live lake: `use_code` 01 (single-family) 44,578 sales @ median
  **$385,000**; 04 (condo) 10,879 @ **$295,000**; 00 (vacant residential) 17,612 @ **$50,000** — the
  land that must be excluded. Filter used: `last_sale_date >= '2024-01-01' AND last_sale_amount > 20000`.
- **The Lee pack caveat "LeePA last_sale_amount is null" (`properties-lee-value.mts` ~line 400) and the
  memory `leepa-no-sale-price` are STALE/WRONG.** Fix both (Plan Task 4 Step 5, Task 5 Step 5).
- **Lee's ONLY gap is ZIP.** No LeePA ParcelInfo MapServer layer (checked 0/9/10/12/23 of 24) carries a
  situs/address/ZIP field — only parcel geometry (`SHAPE`). So ZIP is **derived**: parcel centroid →
  point-in-polygon vs the TIGER ZCTA polygons already in the repo at `public/maps/fl_zips.geojson`, via
  DuckDB spatial (`duckdb>=1.1`, `INSTALL spatial`). Plan Task 1.
- **FDOR cannot supply Lee ZIP.** Lee is `CO_NO=46`, a broken partition on both FDOR statewide layers
  ("count works, records 400") — documented in `ingest/pipelines/parcel_subdivision/constants.py`.

## Gotchas that cost time (inherit them, don't rediscover)

- **crawl4ai mangles multi-param REST queries.** For ArcGIS `/query` endpoints use direct `requests`
  GET/POST via `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe` (has `requests`). crawl4ai is still the
  only *web-crawl* tool per RULE 0.4 — this is an API call, not crawling.
- **LeePA layer 12 (`Just Value`) is the parcel spine** with `SHAPE` per `FOLIOID` — use it for centroids
  (Task 1). `f=geojson&returnGeometry=true` + `resultOffset` pagination (honor `exceededTransferLimit`).
- **`leepa_parcels` join key is `folioid`** (LeePA internal id) — the new `leepa_parcel_zip` table keys on
  the same `folioid`. Do NOT try to join LeePA to any FDOR `PARCEL_ID` (STRAP) — different key, won't match.
- **Aggregate at source.** Median is a Postgres view (`percentile_cont`), the pack is a pure reader —
  mirror `collier_parcels_by_zip` in `properties-collier-value.mts`, don't compute medians in TS.
- **Migrations run via `new Bun.SQL`** (psql not installed); grant + `NOTIFY pgrst` after any new table.

## Definition of done ("right data = green" — presence ≠ correctness)

The live-verify check closes only on: (1) ZIP 33972 returns a homes-only median in the **~$300k–$360k**
band, NOT ~$35k; (2) any ZIP with `< 20` qualifying sales shows `county_fallback = true` = county median
(~$385k), never a raw sub-20 median; (3) citation "Lee County Property Appraiser (recorded deeds)", as-of
MM/DD/YYYY once, no internal ids; (4) `bunx next build` + pack/catalog tests green.

## Related checks (already opened — context, not this build's scope)

- **`collier_parcels_fdor_query_lockdown`** — the FDOR Cadastral FeatureServer now 400s every
  attribute-field WHERE (`CO_NO=21` etc.); `collier_parcels` silently no-ops (last load 06/06) yet reads
  "FRESH 35d" to the probe. Collier's homes-only median is the **fast-follow**, blocked on this. Repair
  path: switch to the working `returnIdsOnly` + `objectIds` pattern proven in `parcel_subdivision`, or
  FDOR bulk-file. Not in this plan.
- **`active_listing_median_land_blend`** — `listing_active_stats` (active *asking* price) blends land, no
  `property_type` filter (audit `03-lake-live-state §4a`). Sibling bug, operator decision = its own task.

## How to start

1. Read the spec, then the plan. 2. Execute Plan Task 0 (probe — confirms centroid→ZCTA viability + checks
for a cheaper LeePA situs export). 3. Proceed Task 1→5 with `superpowers:subagent-driven-development` or
`superpowers:executing-plans`. 4. Rebuild ONLY `properties-lee-value` (`-f pack_id=properties-lee-value`,
never `master --force`). 5. Close `homes_only_sold_median_live_verify` with live evidence.
Cross-reference the pipeline-fixing effort in `docs/audit/2026-07-11-pipeline-problems/`.
