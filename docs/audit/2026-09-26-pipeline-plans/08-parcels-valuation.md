# 08 parcels-valuation — pipeline plan (09/26/2026)

Family 08 owns the Lee and Collier parcel and valuation base in four pipelines: `leepa` (Lee Property Appraiser value, use-code and last-sale layers plus the FabricParcels strap and coordinate crosswalk), `leepa_comp_sales` (LeePA layer 23 "Comparable Sales", the only Lee beds/baths source), and `lee_parcels` and `collier_parcels` (the FDOR statewide cadastral for CO_NO=46 and CO_NO=21). Verdict: all four are behind their source today and two are wrong in ways the dashboards do not show. `collier_parcels` silently drops the last 827 features of every monthly pull because a soft 400 is read as end-of-data, which leaves 582 Collier parcels frozen at a 06/06/2026 pre-widen load; both served sold medians say "as of" the brain build date and "recorded 2024+" when they are rolling 12-month windows ending at the data vintage (Collier's ends 06/2025); FDOR published the 2026 preliminary roll as flat files on 07/27/2026 while the ArcGIS layer we pull still serves 2025; the full `leepa` pull has never completed on any scheduler (5 of 5 runs cancelled, data from manual local runs, newest 07/11/2026); and `leepa_comp_sales` is proven fetchable on the Fedora box but scheduled once a year against a layer that grows monthly. No family leg calls an LLM. Nine plan items are DO and two are ASK-FIRST.

## 1. Scope

Four pipelines. Registry lines are in `ingest/cadence_registry.yaml`:

- `leepa`
  - Registry: `ingest/cadence_registry.yaml:809`
  - Workflow: `.github/workflows/leepa-parcels-annual.yml`
  - Code: `ingest/pipelines/leepa/`
  - Table: `data_lake.leepa_parcels`
  - Pack: `properties-lee-value` (`cadence_registry.yaml:811`)
- `leepa_comp_sales`
  - Registry: `ingest/cadence_registry.yaml:897`
  - Workflow: `.github/workflows/leepa-comparable-sales-annual.yml`
  - Code: `ingest/pipelines/leepa_comp_sales/`
  - Table: `data_lake.leepa_comparable_sales`
  - Pack (per the registry): `properties-lee-value` (`:899`)
  - Live consumer: `lib/assistant/comp-source-lake.ts` through `data_lake.lee_comp_sales_v` (`cadence_registry.yaml` comment block after `:912`)
- `collier_parcels`
  - Registry: `ingest/cadence_registry.yaml:1019`
  - Workflow: `.github/workflows/collier-parcels-annual.yml`
  - Code: `ingest/pipelines/collier_parcels/`
  - Table: `data_lake.collier_parcels`
  - Pack: `properties-collier-value` (`:1021`)
- `lee_parcels`
  - Registry: `ingest/cadence_registry.yaml:1041`
  - Workflow: `.github/workflows/lee-parcels-annual.yml`, dispatch-only (`:1051`)
  - Code: `ingest/pipelines/lee_parcels/`
  - Table: `data_lake.lee_parcels`
  - Pack: `properties-lee-value` (`:1043`)

Consumers found by grep. The command, with test files filtered out:

```
grep -rlE "\b<table>\b" refinery lib app components utils supabase/functions ingest/pipelines ingest/lib scripts migrations docs/sql
```

- `leepa_parcels`
  - `refinery/sources/leepa-value-source.mts:32-34` reads the table and the views `leepa_parcels_sales_yearly` and `leepa_parcels_summary`.
  - `refinery/sources/leepa-sold-median-source.mts` reads view `leepa_sold_median_by_zip`.
  - `refinery/packs/properties-lee-value.mts`
  - `lib/assistant/comp-source-lake.ts` via `lee_comp_sales_v` (sale recency and price, `comp-source-lake.ts:12`)
  - `ingest/pipelines/lee_planned_developments/spatial_join.py:106` reads leepa strap + lat/lon to build `parcel_community_pd` (`cadence_registry.yaml` parcel_community_pd entry).
  - Quality contracts in `ingest/quality/quality_registry.yaml:75-78` and `:466-531`.
- `leepa_comparable_sales`
  - `lee_comp_sales_v` (`docs/sql/20260804_lee_comp_sales_v_pool.sql:53`)
  - `lib/assistant/comp-source-lake.ts:22,59,220`, imported by `lib/assistant/comp-helper.ts`, `lib/deliverable/recipes/market-comps.ts` and `lib/listings/apify-identity.ts`
- `lee_parcels`
  - `refinery/sources/lee-parcels-source.mts:29-31` reads the table and the views `lee_parcels_summary` and `lee_parcels_zip_summary`.
  - `lib/should-i-sell/load-parcel-soh.ts:11`
  - `lib/why-not-selling/parcel-read.ts:73`
  - `lib/listings/community-lookup.ts:41,124` and `app/r/source/_tables.ts`, both through view `parcel_subdivision_v`
  - `lib/assistant/comp-source-lake.ts` through `lee_comp_sales_v`
  - Views `parcel_subdivision_v`, `lee_comp_sales_v`, `lee_records_addressed_v`, `lee_parcels_summary`, `lee_parcels_zip_summary`, `lee_parcels_city_summary` (live `pg_depend` query, 09/26; see §13)
- `collier_parcels`
  - `refinery/sources/collier-parcels-source.mts:28-30` reads the table and the views `collier_parcels_summary` and `collier_parcels_zip_summary`.
  - `refinery/sources/collier-sold-median-source.mts`, which reads view `collier_sold_median_by_zip`
  - `refinery/packs/properties-collier-value.mts`
  - `lib/should-i-sell/load-parcel-soh.ts:11`
  - `lib/why-not-selling/parcel-read.ts:73`
  - `lib/listings/community-lookup.ts` and `app/r/source/_tables.ts`, both through view `parcel_subdivision_v`
  - Views `parcel_subdivision_v`, `collier_sold_median_by_zip`, `collier_parcels_summary`, `collier_parcels_zip_summary`, `collier_parcels_city_summary` (same `pg_depend` query)

Not readers, although an earlier draft of this section listed them (second-Opus correction, 09/26): `lib/listings/property-tax-history.ts` reads only `steadyapi_tax_history_v` (`:143`, `:179`), and names `leepa_parcels`/`collier_parcels` in a comment (`:12`); `refinery/sources/active-listings-residential-source.mts` names both tables in a comment only (`:34`); `lib/assistant/comp-rank.ts` names `lee_parcels`/`leepa_parcels`/`leepa_comparable_sales` in comments only (`:24,27,40,67,203`); `ingest/pipelines/lee_deed_official_records/normalize.py:11,106` parses a strap that joins to `lee_parcels` but never reads the table.

Dark derived views: `collier_parcels_city_summary` and `lee_parcels_city_summary` (defined in `docs/sql/20260725_parcels_city_summary.sql`) and `lee_records_addressed_v` have no reader in `refinery/`, `lib/`, `app/` or `components/` (Grep, 09/26). `lee_records_addressed_v` belongs to family 10.

None of the four tables is a DARK ROOT. Every table has a live reader.

## 2. What is being brought in

Live counts and freshness come from SQL run 09/26/2026 through Bun.SQL, using the connection approach in `scripts/apply-fdic-sod-view.mts:15-27` (a throwaway SELECT-only helper in the session scratchpad, never committed). Base count query:

```
select count(*) from data_lake.<table>;
select to_timestamp(max(_dlt_load_id::numeric)), to_timestamp(min(_dlt_load_id::numeric)), count(distinct _dlt_load_id) from data_lake.<table>;
```

### leepa

- **Source.** LeePA ParcelInfo MapServer (`ingest/pipelines/leepa/constants.py:1`):
  - Layer 9: use codes (`:7`)
  - Layer 10: last qualified sale (`:10`)
  - Layer 12: just-value bundle, the spine, pulled with geometry for site ZIP (`:15`)
  - The sibling ParcelsWFS FabricParcels layer, for strap, latitude and longitude (`:24-26`)
  - The run also fetches layer 0 "Tangible Business Names" first (`pipeline.py:11-12`, `resources.py:26-34`) and archives it to Tier 1. Nothing reads that archive: a grep for `leepa/parcels/` outside the pipeline and its tests found no reader.
- **Fields.** 19 typed columns (`resources.py:39-70`): folioid, strap, latitude, longitude, zip_code, 8 value fields, use_code/description, and 4 last-sale fields. The live table has 22 columns, adding `_dlt_load_id`, `_dlt_id` and `last_sale_date__v_text` (information_schema query, 09/26).
- **Geography.** Lee only, by construction.
- **Cadence.** `cadence_days: 365` (`:816`). Cron `0 13 1 3 *`, March 1 (`leepa-parcels-annual.yml:14`).
- **Live, 09/26.**
  - 548,798 rows. Newest load 07/11/2026 23:28 UTC, oldest load 05/18/2026, 199 distinct load ids.
  - `last_sale_date` spans 1900-01-01 to 2026-06-01.
  - Non-null counts: strap 547,972 · latitude 547,724 · zip_code 548,323 · just_value 548,798 · last_sale_amount 528,502.
  - 24 rows landed in the variant column `last_sale_date__v_text`.
- **Source now, 09/26.**
  - Layer 12 count 555,179, from the doctor source-liveness line in run 36259690113. My own `returnCountOnly` on layer 12 returned an empty body, which is the intermittency `probe_source_liveness.py:97` documents.
  - Layer 10 count 535,125, from my `returnCountOnly` probe and the same doctor run.
  - FabricParcels count 564,734 (my probe).
  - Layer 10 rows with `DoS='2026-7'`: 3,250. The same query with `DoS='2026-07'` returns 0, so the format is unpadded.
  - Layer 10 also already serves later months (second-Opus `returnCountOnly` probes, 09/26): `DoS='2026-8'` 3,006 · `DoS='2026-9'` 630 · `DoS='2026-10'` 0. The source is therefore three months past the lake's newest sale month (2026-06), not one.
  - June itself is partial in the lake: `select count(*) filter (where last_sale_date >= '2026-06-01') from data_lake.leepa_parcels` = 1,383, while `DoS='2026-6'` on L10 returns 3,541 today (a last-sale layer overwrites a June sale when the parcel resells, so the two are not an exact like-for-like, but the lake's June was loaded 07/11, about six weeks into the recording lag).
  - The L10 count itself is intermittent from this box too: of three `returnCountOnly` calls on 09/26, the first returned an empty body and the next two returned 535,125.
- **Coverage.** Lee yes. Collier and Hendry no, by design.

### leepa_comp_sales

- **Source.** LeePA layer 23 (`leepa_comp_sales/constants.py:15`), partitioned by SaleYear x SaleMonth (`resources.py:157-225`).
- **Fields.** 14 attribute fields are requested (`constants.py:32-47`). OBJECTID is not stored and SHAPE is deliberately skipped, which the registry records as "we pull 15 of" the layer's 16 fields (`cadence_registry.yaml:938`, a registry claim). The table has 16 data columns plus `_dlt_load_id` and `_dlt_id`.
- **Geography.** Lee only.
- **Cadence.** `cadence_days: 365` (`:904`). Cron March 1 (`leepa-comparable-sales-annual.yml:23`).
- **Live, 09/26.**
  - 108,848 rows. All 22 loads on 07/22/2026, 19:17 to 19:19 UTC.
  - `sale_month` spans 2024-01 to 2026-07; 2026-07 holds only 837 rows.
  - By year: 2024 46,630 · 2025 40,329 · 2026 21,889.
  - 92,625 distinct folios. 75,746 rows with bedrooms > 0. 108,848 rows with a parsed price.
- **Source now.**
  - Run 35518297483, a Fedora dry run on 09/20, logged "114,650 rows fetched / 114,650 canonical", with partitions 2026-07 3,231 · 2026-08 2,889 · 2026-09 418.
  - My `returnCountOnly` on 09/26 returned 114,919.
  - Source ahead of lake: 114,919 − 108,848 = 6,071 rows.
  - Per-partition `returnCountOnly` on 09/26 (second Opus): `SaleYear=2026 AND SaleMonth=7` 3,234 · `SaleMonth=8` 2,960 · `SaleMonth=9` 609. The layer grew 269 rows in the six days since the 09/20 dry run (114,919 − 114,650).
- **Coverage.** Lee only.

### lee_parcels

- **Source.** FDOR Statewide Parcel Centroid FeatureServer, `CO_NO=46` (`lee_parcels/constants.py:19-26`), fetched with `returnIdsOnly` + `objectIds` batches of 250 (`resources.py:305-383`).
- **Fields.** 102 of the layer's 120 (`constants.py:34-49`; layer `?f=json` returned 120 fields on 09/26).
- **Geography.** Lee.
- **Cadence.** `cadence_days: 365`, `dispatch_only: true` (`:1045`, `:1051`).
- **Live, 09/26.**
  - 556,083 rows, all distinct parcel_id. 112 loads, 07/18/2026 20:50 to 21:01 UTC.
  - `assessment_year` = 2025 on every row. Newest sale month (`sale_yr1`/`sale_mo1`) 2025-06. `co_no` has one distinct value, 46.
  - `phy_zipcd` non-null on all 556,083 rows.
- **Source now.**
  - `CO_NO=46` count 556,100 (my probe).
  - Layer `editingInfo.dataLastEditDate` = 1780974574367 ms, which decodes to 06/09/2026 03:09 UTC.
  - FDOR's own portal holds `Lee 46 Preliminary NAL 2026.zip`: HEAD returned 200, Content-Length 43,316,780, Last-Modified 07/27/2026. Contents were not profiled.
- **Coverage.** Lee.

### collier_parcels

- **Source.** Same FDOR layer, `CO_NO=21` (`collier_parcels/constants.py:37-43`), fetched by OBJECTID keyset with 2,000-row pages (`resources.py:329-376`).
- **Fields.** 102 of 120.
- **Geography.** Collier.
- **Cadence.** `cadence_days: 365` (`:1023`), but the cron runs monthly on the 20th (`collier-parcels-annual.yml:8`).
- **Live, 09/26.**
  - 290,973 rows: 290,391 loaded 09/20/2026 plus 582 loaded 06/06/2026. All 582 of those have NULL `assessment_year`.
  - `assessment_year` 2025 on the rest. Newest sale month 2025-06. One `co_no` value, 21.
- **Source now.**
  - `CO_NO=21` count 364,827 features (my probe).
  - The FDOR portal holds `Collier 21 Preliminary NAL 2026.zip`: HEAD 200, 19,586,857 bytes, Last-Modified 07/27/2026. I downloaded and profiled it on 09/26:
    - one CSV, `NAL21P202602.csv`
    - 297,635 rows, 297,635 unique PARCEL_ID
    - `ASMNT_YR` = 2026 on all rows
    - 165 columns
    - newest sale months 2026-04 2,402 · 2026-05 2,051 · 2026-06 797
- **Coverage.** Collier.

### County coverage across the family

- Lee: `leepa`, `leepa_comp_sales`, `lee_parcels`.
- Collier: `collier_parcels`.
- Hendry: none. FDOR `CO_NO=36` returned a count of 35,717 on 09/26, and `Hendry 36 Preliminary NAL 2026` is listed in the 2026P folder (crawl4ai, 09/26). Second Opus: HEAD 200, 2,532,335 bytes, Last-Modified 07/27/2026.
- FDOR portal state (second Opus, SharePoint REST `GetFolderByServerRelativeUrl('.../Tax Roll Data Files/NAL')/Folders` and `/Files`, 09/26): folder 2026P holds 66 files including Lee, Collier and Hendry; folder 2026F (the FINAL roll) exists and holds exactly one file, `Citrus 19 Final NAL 2026.zip`, modified 09/23/2026. Final 2026 rolls are landing now, county by county; Lee and Collier are not there yet.

## 3. What is working

- **leepa**
  - The value, use-code, sale and strap join is guarded against the NULL-clobber shape. When the fabric fetch fails while stored straps exist, `resources.py:298-311` raises `FillRateCollapseError`.
  - 36 unit tests pass (35 in `ingest/tests/pipelines/leepa/test_resources.py`, 1 in `test_dry_run.py`):

    ```
    ingest/.venv/Scripts/python.exe -m pytest -q ingest/tests/pipelines/leepa ingest/tests/pipelines/collier_parcels
    ```

    That command returned "39 passed in 1.05s", which includes collier's 3.
  - The cross-source agreement contracts pass today, per my SQL on 09/26:
    - A1 same-event mismatch is 442 of 50,202, or 0.88%, under the 2.5% line (`quality_registry.yaml:473-495`).
    - A3 coverage floor: 50,202 is at least 40,000 (`:517-531`).
  - The daily doctor rates `leepa` FRESH / OK / PASS on freshness, volume and content (run 36259690113). Its overall row is still yellow, because the run column is NO_RUNS_IN_WINDOW (P-8).
- **leepa_comp_sales**
  - The fetch works from the Fedora runner. Run 35518297483 was a `workflow_dispatch` dry run on runner `fedora-swfl-local`, green, 15:02:04 to 15:03:53 (1 min 49 s). All partition guards passed and comp_id was "114,616 distinct / 114,650 rows".
  - The dry run is genuinely read-only: `pipeline.py:12-44` calls no dlt.
  - It has a live consumer: `comp-source-lake.ts` via `lee_comp_sales_v`.
- **lee_parcels**
  - The 07/18 real run 29658034150 landed. Dispatch, green, 87 min 42 s, log line "lee_parcels: merged 556100 parcels into data_lake.lee_parcels".
  - The table has 556,083 unique parcels. 556,100 − 556,083 = 17 duplicate PARCEL_IDs, collapsed by the merge.
  - The `returnIdsOnly` + `objectIds` fetch correctly treats a 200-body error as a failure (`resources.py:354-370`).
- **collier_parcels**
  - Scheduled runs green on 07/20 (29750019226), 08/20 (32371536841) and 09/20 (35520622150). Each logged "merged 364000 parcels".
  - The 06/20 run (27873716538) is green but could not be verified: its log returns HTTP 410 and it ran only about 3 minutes, which sits inside the window the `constants.py` header says the old layer "silently no-op'd".
  - The doctor rates `collier_parcels` green.
- **Reachability.** GHA reaches both hosts. The daily liveness probe on `ubuntu-latest` read LeePA L10/L12 and the FDOR `CO_NO=21` count LIVE (run 36259690113).

## 4. Problems

### P-1. collier_parcels drops the last 827 features of every run

- **Severity:** blocks a served number (Collier parcel count and SOH gap inputs).
- **Symptom.**
  - Every run from 07/20 through 09/20 logs "collier_parcels: merged 364000 parcels", while the source count is 364,827. 364,827 − 364,000 = 827.
  - Reproduced read-only on 09/26. I sorted the 364,827 ids from `returnIdsOnly`, took the 364,000th OBJECTID (2274627), and sent the pipeline's exact keyset query:

    ```
    where=(CO_NO=21) AND OBJECTID>2274627&orderByFields=OBJECTID ASC&resultRecordCount=2000
    ```

    It returned HTTP 200 with body `{'code': 400, 'message': 'Cannot perform query. Invalid query parameters.'}` and 0 features. The previous page returned 2,000 features with `exceededTransferLimit` true.
- **Root cause.** `ingest/pipelines/collier_parcels/resources.py:363-365` reads `data.get("features", [])` from the error body as an empty page and ends the walk. `assert_vs_canonical` passes because its floor is 0.9 (`ingest/lib/guards.py:179-189`).
- **Consequence.**
  - The 827 tail features are 793 unique parcel ids. I fetched them by `objectIds`.
  - Of those 793, 582 exist in the lake only as 06/06/2026 rows with NULL `assessment_year`, meaning they have never received the 07/18 widen. The other 211 are refreshed through other pages.
- **First seen.** 07/20/2026, the first run logging 364000.

### P-2. The same soft-error swallow is in the shared ArcGIS paginator (RULE 0.5c scope: 5 sites)

- **Severity:** blocks a served number whenever it triggers; latent today for leepa and leepa_comp_sales.
- **Sites.**
  - `ingest/lib/arcgis_paginator.py:37`, `:78` and `:134`: each reads `.get("features", [])` from a possible error body.
  - `ingest/lib/arcgis_paginator.py:161`: `arcgis_count` returns `int(resp.json().get("count", 0))`, so a soft 400 yields 0. Then `guards.py:185` (`if canonical > 0 and ...`) silently skips the volume guard.
- **Why it matters for leepa.** LeePA layer 12 intermittently 400s on `returnCountOnly` (`probe_source_liveness.py:97`); my own layer-12 count probe on 09/26 came back with an empty body. In that state the leepa canonical guard at `leepa/resources.py:285-286` is a no-op.
- **Not affected.** `leepa_comp_sales` calls `arcgis_count` at `resources.py:185` (global), `:196` (per partition, where `if expected == 0: continue` would silently skip a partition whose count soft-400s) and `:328`. Every one of those is backstopped by the partition-sum equality at `:218-224`, which raises when the partitions cover fewer rows than the global count, and by `assert_min_rows` at `:331`. `_distinct_values` at `:153` is backstopped the same way. `lee_parcels/resources.py:362-363` is already correct.
- **Sites the first draft missed (second-Opus scope pass, `grep -rn "arcgis_count(\|assert_vs_canonical(\|paginate_arcgis[a-z_]*(" ingest/pipelines/{leepa,leepa_comp_sales,lee_parcels,collier_parcels}/*.py`).**
  - `leepa/resources.py:264-269`: layers 9 (use codes) and 10 (last sale) are fetched with the OFFSET walk `paginate_arcgis_tabular`, the method the code's own comment at `:245-246` says truncated layer 12 at 40,000 on this host. The only check is `if not rows` (`:266`). There is no count guard for either layer. `_join_leepa` fills a missing folio with NULL (`resources.py:99-100`, `use_by_folio.get(folio) or {}`), and the tier-2 write is a merge on folioid (`:199`, described as delete+insert at `:293`), so a truncated L10 would null `last_sale_*` on every parcel past the cut with every guard green. Latent today: the 07/11 load holds `use_code` on 548,798 of 548,798 rows and `last_sale_date` on 528,505 (SQL, 09/26), so that run did not truncate.
  - `leepa/resources.py:185-186`: the FabricParcels volume guard uses the same `arcgis_count` → 0 → skipped shape as `:285-286`.
- **Other families affected.** The shared paginator is imported by 6 pipelines (`grep -rlE "paginate_arcgis|arcgis_count" ingest/pipelines`): collier_parcels, fdot, lee_parcels, lee_planned_developments, leepa and leepa_comp_sales. fdot and lee_planned_developments are affected but not mine.

### P-3. The served sold medians carry a false "as of" and a false window

- **Severity:** blocks a served number (label is wrong).
- **Symptom.**
  - `brains/properties-collier-value.md:47` serves "Collier homes-only sold median (recorded deeds, as of 09/18/2026)" and "sales recorded 2024+".
  - `brains/properties-lee-value.md:53` serves "as of 09/19/2026" and "recorded 2024+".
  - The live views are a rolling 1-year window anchored on `data_through`. `pg_get_viewdef` on `data_lake.collier_sold_median_by_zip` shows `d.sale_date > (a_1.data_through - '1 year'::interval)`.
  - Live `data_through`: Collier 2025-06-01, Lee 2026-06-01 (SQL, 09/26).
- **Root cause.**
  - `refinery/sources/collier-sold-median-source.mts:114` and `refinery/sources/leepa-sold-median-source.mts:122` set `as_of: fetched_at.slice(0, 10)`.
  - The fact text says "2024+" at `properties-collier-value.mts:337, 510, 604` and `properties-lee-value.mts:502, 808, 855` (`grep -noF "2024+"` on both packs, 09/26: three sites each; the first draft named only `:337` for Collier). Each served brain carries the string four times (`grep -c "2024+" brains/properties-{collier,lee}-value.md`).
  - The `data_through` column (`docs/sql/20260714_sold_median_recency_window.sql:24-27`, which itself notes Collier "~12 MONTHS behind") is built but not wired into the label.
- **First seen.** 07/14/2026, when the recency window replaced "2024+" in SQL but not in the pack text.

### P-4. collier_parcels and lee_parcels read a source that lags FDOR's own publication

- **Severity:** blocks a consumer from current data (Collier sold median 12 months behind; SOH gap on the 2025 roll).
- **Symptom.**
  - The ArcGIS layer's `dataLastEditDate` is 06/09/2026 and our 09/20 Collier pull is all `ASMNT_YR` 2025.
  - FDOR posted the 2026 preliminary NAL for Collier and Lee on 07/27/2026. Both HEAD 200. The Collier file profiles to sales through 2026-06.
- **Root cause.** `COLLIER_CADASTRAL_URL` and `LEE_CADASTRAL_URL` point at the FloridaGIO centroid layer (`collier_parcels/constants.py:37`, `lee_parcels/constants.py:19`), a republisher of FDOR, not FDOR's portal.
- **First seen.** 09/26/2026, this audit. It was implied by `docs/sql/20260714_sold_median_recency_window.sql:27`.

### P-5. leepa has never completed on any scheduler

- **Severity:** blocks a consumer from current data (Lee sold median `data_through` 2026-06-01 while L10 serves 2026-7 3,250, 2026-8 3,006 and 2026-9 630 sales, §2).
- **Symptom.**
  - Last 15 runs (`gh run list --workflow leepa-parcels-annual.yml --limit 15`): 5 runs, all cancelled, on 05/26 (3 dispatches), 06/15 and 07/15 (schedule).
  - The newest red, 29411674653, is classified by `.github/scripts/classify-cron-failure.mjs` `classifyTermination` as `{"klass":"TIMEOUT","reason":"Run hit its ceiling: 90.3 min elapsed against timeout-minutes: 90 ..."}`. Its log line is `##[error]The operation was canceled.`
  - Lake loads: 05/18 and 07/11 only, both from outside Actions (no green run exists).
- **Timeouts.** Four of the five runs were cancelled at about 30 minutes (for example 26455991329, created 14:54:09, updated 15:24:31) and only the newest at 90 (created 11:27:12, updated 12:57:30), matching the header at `leepa-parcels-annual.yml:9-12`: a monthly retry cron (`0 10 15 * *`) was tried from 05/30 and reverted on 07/15 because it "never once completed on GHA".
- **Root cause.** The job did not finish in 90 minutes on `ubuntu-latest`. The workflow has routed to Fedora since `SWFL_LOCAL_RUNNER_READY=true` (set 09/20, `gh variable list`; `leepa-parcels-annual.yml:28`), but no leepa run of any kind has executed there. The run also spends time first on the unused layer-0 offset walk (`resources.py:28`, 65,984 features, my count on 09/26).
- **First seen.** 05/26/2026.

### P-6. leepa_comp_sales is annual against a monthly-growing layer

- **Severity:** blocks a consumer from current data (beds/baths comps for 2026-07 onward).
- **Symptom.** The lake's max month is 2026-07 with 837 rows. The source has 3,234 rows for 2026-07 (09/26 probe) and 2,889 for 2026-08 (run 35518297483). The source is ahead by 6,071 rows.
- **Root cause.** `leepa-comparable-sales-annual.yml:23` (cron March 1) and `cadence_registry.yaml:904`.
- **First seen.** 07/22/2026, the only load.

### P-7. The freshness probe reads a dead schema literal for leepa

- **Severity:** cosmetic (understates freshness).
- **Symptom.** Replicating `check_freshness._fetch_max_freshness` locally on 09/26 gives `leepa max_freshness= 2026-05-18`, while the table's newest `_dlt_load_id` is 07/11/2026.
- **Root cause.** `cadence_registry.yaml:818` sets `dlt_schema_name: leepa_parcels_tier2`. The code names pipelines `leepa_t2_<hex>` (`leepa/resources.py:221`), and `_dlt_loads` holds 440 distinct `leepa_t2_%` schemas. The comment at `:824-825` about `tier1_inventory` is stale.
- **First seen.** 07/11/2026, the first load under random names.

### P-8. Doctor noise: permanent yellow rows for this family

- **Severity:** cosmetic, but it trains the operator to ignore the family.
- **lee_parcels content FAIL.** Doctor run 36259690113 shows content FAIL because the A2 `_watch` contract returns 473,382 by design (`quality_registry.yaml:497-514`, my SQL 09/26). `ingest/scripts/doctor.py:142-147` counts any warn-severity FAIL as yellow.
- **NO_RUNS_IN_WINDOW.** It hits `leepa`, `leepa_comp_sales` and `lee_parcels`: 23 of 78 doctor rows in that run carry it. Why the targeted backfill (`doctor.py:520-560`, cap 40) did not promote these three is NOT verified: my local replication of `collect_gh` timed out at 115 s.
- **Stale incident issue.** Issue #125 "[cron-failure:leepa-parcels-annual] TIMEOUT" has been open since 07/15. `log-cron-incident.mjs:131,145` closes only on the next scheduled success, which for a March-1 cron is 03/01/2027.
- **Per-failure GitHub filing still wired (second Opus).** Three family workflows are on the `workflow_run` listener: `.github/workflows/log-cron-incident.yml:25` ("Collier parcels annual (FDOR cadastral)"), `:49` ("LeePA comparable sales annual"), `:50` ("LeePA parcels annual"). Every failed run of these comments on the sticky issue `vars.CRON_INCIDENT_ISSUE_NUMBER` = 44 (`gh variable list`; header of `log-cron-incident.yml:3-4`) and opens a `[cron-failure:<workflow>]` issue, deduplicated only while one is still open (`log-cron-incident.mjs:220-228`). "Lee parcels annual (FDOR cadastral)" is not on the list. No `cron_incident_*` check for this family is open today (`node scripts/check.mjs list`, 09/26).
- **First seen.** 07/15/2026 (#125).

### P-9. Written claims that contradict the code or the lake (X verified, Y needs review)

- **Consumer claim.**
  - Claim: `docs/standards/data-inventory.md:53` and `:156-167` say `leepa_comparable_sales` has "zero downstream consumer" and is "cron-fed".
  - Verified: `comp-source-lake.ts:59,220` reads `lee_comp_sales_v`, and `docs/sql/20260804_lee_comp_sales_v_pool.sql:53` joins the table.
  - Also verified: the cron has never run on schedule.
- **Layer-0 claim.**
  - Claim: `ingest/scripts/probe_source_liveness.py:55-58` says the leepa pipeline "never fetches" layer 0.
  - Verified: `leepa/pipeline.py:12` → `resources.py:28` fetches it first.
- **Skipped-OBJECTIDs claim.**
  - Claim: `cadence_registry.yaml:1067` says 17 OBJECTIDs were "unservable ... logged + skipped".
  - Verified: run 29658034150 logged 0 "unservable" lines and "merged 556100". The 17 are duplicate PARCEL_IDs.
- **Runner claim.**
  - Claim: the header of `leepa-comparable-sales-annual.yml:6-12` says the fetch "has never landed on a GitHub runner" and gives no Fedora route.
  - Verified: the Fedora dry run 35518297483 fetched all 114,650 rows.
- **Lee dry-run gap.** Lee has no dry-run parity with the real path. `leepa/pipeline.py:39-48` uses `paginate_arcgis_tabular` (offset) for L12, which is the method `leepa/resources.py:245-246` and the paginator docstring (`arcgis_paginator.py:99-102`) say truncates at 40,000. The real run uses keyset for L12 only (`resources.py:247`); for L9 and L10 it uses the same offset walk as the dry run (`resources.py:265`), unguarded (P-2). A dry run therefore cannot prove the real L12 path.

### P-10. Two pipelines have zero pipeline tests

- **Severity:** blocks nothing today, but no guard exists.
- **Evidence.** `ls ingest/tests/pipelines` shows no `leepa_comp_sales` or `lee_parcels` directory. Test counts: collier_parcels 3, leepa 36, leepa_comp_sales 0, lee_parcels 0.

## 5. What is missing

- **vs source_ceiling.**
  - **leepa.** LeePA layers left unpulled (`cadence_registry.yaml:836`, a registry claim):
    - 21 Delinquent Tax Advertising (10,964 rows per the registry): a seller-stress signal
    - 11 Qualified Sales Ratios
    - 19 Non CT Sales
    - 22 Cert of Title Sales (foreclosure deeds)
    - FabricParcels fields DORCode, CondoName, Zoning, AVMNBHD, the unit/condo block and plat Book/Page
  - **leepa_comp_sales.** Nothing beyond geometry (`:938`).
  - **lee_parcels and collier_parcels.**
    - The 18 excluded fields are deliberate (PII and ArcGIS internals, `:1073`, `:1039`).
    - The real gap is VINTAGE: the 2026 preliminary roll is on FDOR's portal (P-4).
    - The NAL flat file carries 165 columns against the layer's 120. I did not diff the extra 45 by name, so which ones are useful is unverified.
- **vs consumers.**
  - The Collier sold median needs sales after 2025-06. Only the NAL flat file has them (2026-01..2026-06 in the Collier 2026P profile).
  - The Lee sold median and `lee_comp_sales_v` need `leepa` sales after 2026-06. The source has 3,250 rows for 2026-7, 3,006 for 2026-8 and 630 for 2026-9 (§2).
- **vs data-roots.** `docs/standards/data-roots.md:125-135` lists the four parcel tables and records KEEP BOTH as ratified (`:134`). There is no conflict: the family already matches one-root-per-concept. The T10 trap (`:120`) is month grain, and this plan keeps month grain.
- **Geography.** Hendry: no parcel table, although FDOR serves `CO_NO=36` (35,717 features) and the Hendry 2026P NAL. No Hendry value pack exists to consume it. Under the brain-first rule (`ingest/CLAUDE.md`, "no Tier-2 table without its consuming brain's PackDefinition"), this is PARKED, not built.
- **Monitoring.** The liveness probe (`probe_source_liveness.py:62-106`) does not cover `lee_parcels` (`CO_NO=46`), layer 23 or FabricParcels. No check compares source vintage to lake vintage for any pipeline in the family. That is the `registry_source_ceiling_no_freshness_field` gap (open check).

## 6. Verdict per pipeline

- **leepa — REPAIR.** It has never completed on a scheduler (0 green of 5), and the lake (newest sale month 2026-06) is three months of sales behind a source that serves 2026-7, 2026-8 and 2026-9. Number that flips it: one green non-dry run on `fedora-swfl-local` landing at least the L12 source count (555,179 on 09/26).
- **leepa_comp_sales — IMPROVE.** The code is sound and the Fedora fetch is proven (1 min 49 s), but the cadence is wrong for a monthly layer. Number: lake max `sale_month` within one month of the source's newest partition.
- **lee_parcels — IMPROVE.** The data is correct for the 2025 roll and the fetch is correct, but it is a vintage behind FDOR's portal and has 0 tests. Number: lake `max(assessment_year)` = 2026.
- **collier_parcels — REPAIR.** It silently drops 827 features every run, holds 582 stale rows, and feeds a sold median whose data ends 2025-06. Number: `select count(*) from data_lake.collier_parcels where assessment_year is null` returns 0 after a run logging "merged 364827".

## 7. The plan

Items 1–9 are DO. Items 10–11 are ASK-FIRST. The parked item is not counted.

1. **DO. Repair the Collier pagination** (P-1)
   - Where: `ingest/pipelines/collier_parcels/resources.py:329-376`. Replace the keyset walk with the `returnIdsOnly` + `objectIds` batching already proven for the same layer in `lee_parcels/resources.py:309-383`. At minimum, raise when `"error" in data`.
   - Test first: `test_keyset_soft_400_tail_is_not_end_of_data` in `ingest/tests/pipelines/collier_parcels/test_resources.py`.
   - Lane D. Effort S.
   - Proof: `pytest -q ingest/tests/pipelines/collier_parcels`, then after the 10/20 scheduled run, log "merged 364827 parcels" and `select count(*) from data_lake.collier_parcels where assessment_year is null` = 0.
   - Unblocks: the 582 stale rows refresh by merge (no delete needed) and the Collier parcel count is true.
2. **DO. Close the shared soft-error shape** (P-2, all 5 sites in one pass)
   - Where: `ingest/lib/arcgis_paginator.py:37`, `:78`, `:134` raise on `"error" in data`, because a soft 400 on a PAGE is never end-of-data. `arcgis_count` at `:161` retries with backoff and then returns an explicit "unavailable" (None), never 0. Callers treat unavailable as: log it LOUD, then enforce `assert_min_rows(expected_rows_min)` from the registry (`:819`, `:909`, `:1026`, `:1055`). That is neither a silent skip nor a hard fail. This matters because LeePA layer 12's count is intermittently unavailable (`probe_source_liveness.py:97`), and a hard raise there would make item 4 unrunnable.
   - Same pass, the two leepa sites P-2 adds: `leepa/resources.py:264-269` gets a count guard on L9 and L10 (`assert_vs_canonical` against `arcgis_count` with the same unavailable-count fallback), or moves both layers to `paginate_arcgis_keyset` like L12 at `:247`; and `:185-186` (fabric) gets the same unavailable-count handling as `:285-286`.
   - Tests in `ingest/tests/lib/`. Run the fdot and lee_planned_developments suites too, since they share the root.
   - Lane D. Effort S.
   - Proof: `ingest/.venv/Scripts/python.exe -m pytest -q ingest/tests` green.
   - Unblocks: every ArcGIS volume guard in 6 pipelines actually guards.
3. **DO. Make the leepa run lean and its dry run honest** (P-5, P-9)
   - Where: remove the layer-0 fetch and archive from `leepa/pipeline.py:11-12` and `resources.py:26-34` (no reader). Change the `--dry-run` branch (`pipeline.py:23-50`) to call the real `paginate_arcgis_keyset(LEEPA_JUST_VALUE_URL)` count path and the fabric count, never the offset walk.
   - Lane D. Effort S.
   - Proof: `pytest -q ingest/tests/pipelines/leepa`, then a Fedora dry-run dispatch whose log prints a keyset L12 total of at least 555,179.
   - Unblocks: item 4.
4. **DO. Run leepa monthly on Fedora** (P-5, P-7)
   - Where:
     - `leepa-parcels-annual.yml:14`: cron to monthly, e.g. `0 13 5 * *`.
     - `:29`: raise `timeout-minutes` for the self-hosted path.
     - `cadence_registry.yaml:816`: `cadence_days: 31`.
     - `:822-823`: drop the 540/730 SLA.
     - `:818`: replace `dlt_schema_name` with `freshness_column: _dlt_load_id` on the existing `count_table`, the same shape as `leepa_comp_sales` at `:907`.
     - `:824-825`: delete the stale comment.
   - Then the next session dispatches once after items 2–3 land. This is the pipeline's own guarded merge (`resources.py:298-311`), not a new write shape.
   - History to respect: a monthly cron was already tried (05/30–07/15) and reverted because it never completed on GHA (`leepa-parcels-annual.yml:9-12`). That failure was the hosted runner's timeout, not the cadence. Do not re-enable the monthly cron until the one Fedora dispatch above is green; rewrite that header comment in the same commit.
   - Lane D. Effort S.
   - Proof: `gh run list --workflow leepa-parcels-annual.yml --limit 1 --json conclusion,createdAt` shows success on `fedora-swfl-local`, and `select max(last_sale_date) from data_lake.leepa_parcels` is at least 2026-07-01.
   - Unblocks: the Lee sold median, `lee_comp_sales_v` recency, `parcel_community_pd` coordinates for new parcels, and closing #125.
5. **DO. Run leepa_comp_sales monthly on Fedora** (P-6)
   - Where:
     - `leepa-comparable-sales-annual.yml:23`: monthly, the day after leepa.
     - `cadence_registry.yaml:904`: `cadence_days: 31`.
     - `:911-912`: drop the SLA.
     - Rewrite the header `:6-17` to cite run 35518297483.
   - Lane D. Effort S.
   - Proof: `select max(sale_month), count(*) from data_lake.leepa_comparable_sales` shows at least 2026-08 and at least 114,650 rows.
   - Unblocks: beds/baths on current comps (`comp-source-lake.ts`).
6. **DO. Add the missing pipeline tests** (P-10)
   - Where:
     - `ingest/tests/pipelines/leepa_comp_sales/test_resources.py`: `_comp_id` stable across OBJECTID change, `"$245,000"` parses, partition-sum mismatch raises, bedrooms floor raises.
     - `ingest/tests/pipelines/lee_parcels/test_resources.py`: a soft-400 batch halves, a lone soft-400 is logged and skipped, a lone transport error raises.
   - Lane D. Effort S.
   - Proof: `pytest -q ingest/tests/pipelines/leepa_comp_sales ingest/tests/pipelines/lee_parcels` shows N passed.
   - Unblocks: item 2 can be changed safely.
7. **DO. Add the source-ahead-of-lake signal** (§8 design)
   - Where:
     - `ingest/scripts/probe_source_liveness.py`: a new per-entry marker. Add entries for `lee_parcels` (`CO_NO=46`), layer 23 and FabricParcels, which the probe does not cover today.
     - A `source_ahead:` block on each of the four registry entries.
     - An open/auto-close sync modelled on `check_freshness.sync_gap_checks` (`ingest/scripts/check_freshness.py:646`).
     - `source_ahead_` added to `_TABLE_CHECK_PREFIXES` (`ingest/scripts/doctor.py:312`).
   - Lane D (runs inside `freshness-probe-daily.yml` on `ubuntu-latest`). Effort M.
   - Proof: `python -m ingest.scripts.probe_source_liveness` prints one AHEAD/OK line per family pipeline, and `node scripts/check.mjs list` shows `source_ahead_<name>` rows open exactly while the gap exists.
   - Unblocks: closes `registry_source_ceiling_no_freshness_field` for these four entries.
8. **DO. Delete the family's doctor noise** (P-8)
   - Where:
     - `doctor.py:135-150`: contracts on the `_watch` convention (`quality_registry.yaml:497`) report a number, never FAIL.
     - Map NO_RUNS_IN_WINDOW to green for entries with `dispatch_only: true` (`cadence_registry.yaml:1051`), after diagnosing why the `collect_gh` backfill did not promote them. That diagnosis is part of this item, because it could not be verified in-session.
     - Issue #125 auto-closes on the first monthly scheduled success once item 4 lands (`log-cron-incident.mjs:131-145`). No code change is needed for that.
     - After item 7 is live, remove the three family names from the `log-cron-incident.yml` listener (`:25`, `:49`, `:50`). A failed run leaves the lake stale, which the family's one signal (`source_ahead_<slug>`) already catches, so the listener's per-failure comment on issue #44 and its `[cron-failure:...]` issue are duplicate noise for this family. `gh run list` and `classify-cron-failure.mjs` keep the failure evidence.
   - Lane D. Effort S.
   - Proof: the next doctor run shows `lee_parcels`, `leepa` and `leepa_comp_sales` green and #125 closed; `grep -nE "LeePA|Collier parcels" .github/workflows/log-cron-incident.yml` returns nothing.
9. **DO. Correct the written claims** (P-9)
   - Where:
     - `docs/standards/data-inventory.md:53`, `:156-167`
     - `cadence_registry.yaml:1067` (17 = duplicate PARCEL_IDs)
     - `probe_source_liveness.py:55-58` (moot after item 3; delete the sentence)
     - `wiki/pipeline-census.md:78-79` (routing is Fedora now)
     - Add a `source_last_edit` note to both FDOR `source_ceiling` blocks: layer `dataLastEditDate` 06/09/2026 and NAL 2026P Last-Modified 07/27/2026.
     - Add `raw_landing_class: free_refetchable` to all four entries (public ArcGIS, no vendor cost). In the same commit, remove their four grandfathered lines from `.claude/hooks/lib/coverage-ratchet-baseline.json:14,38,40,41`: Gate 11 (`.claude/hooks/check-prepush-gate.mjs:476-484`) lets that baseline only shrink.
   - Lane D. Effort S.
   - Proof: `git diff --stat` touches those files only.
10. **ASK-FIRST. Serve the true vintage on both sold medians** (P-3)
    - Where:
      - `collier-sold-median-source.mts:114` and `leepa-sold-median-source.mts:122`: set `as_of` from the view's `data_through`.
      - Fact text `properties-collier-value.mts:335-337, 510, 604` and `properties-lee-value.mts:500-502, 808, 855` (all six "2024+" sites): replace "recorded 2024+" with the 12-month window ending at `data_through`, rendered at month grain ("through June 2025", data-roots T10).
    - Lane D. Effort S.
    - Proof: after the next leaf rebuild, `grep -n "sold median" brains/properties-collier-value.md` shows the vintage month.
    - Why ASK-FIRST: it changes served `key_metrics` text and the `as_of` semantics (RULE 1).
11. **ASK-FIRST. Add an FDOR NAL flat-file lane for the 2026 roll, Collier and Lee** (P-4)
    - Where: a `--source nal` mode in `ingest/pipelines/collier_parcels/` and `lee_parcels/`.
      - Fetch `<County> <co> Preliminary NAL <Y>.zip` from the FDOR portal path verified above.
      - Drop OWN_*/FIDU_* exactly as today.
      - Map the same 102 columns, plus a `roll_stage` column (P/F) so the §8 signal can see a final roll supersede a preliminary one, and merge on `parcel_id`.
      - Profile the Lee zip before building; only its HEAD is verified.
    - Runs on Fedora, archiving each zip under `SWFL_RESEARCH_ROOT=/srv/swfl/research`. The portal NAL folder listed only 2026F and 2026P on 09/26 (crawl4ai), so a superseded vintage may not stay downloadable.
    - Timing fact for the decision (second Opus, §2): 2026F already exists and began filling on 09/23 (Citrus only). If the operator does not want preliminary values overwriting certified ones, the same lane can take `<County> <co> Final NAL 2026.zip` the day Lee and Collier appear in 2026F; the `source_ahead` `fdor_nal_vintage` kind in §8 is what tells us.
    - Two download attempts of the Collier 2026P zip from this Windows box on 09/26 were cut off mid-transfer (3,471,155 and then 5,965,510 of 19,586,857 bytes). GitHub API calls from the same box aborted in the same minutes, so the cause may be local, not FDOR. Either way the lane needs resume-and-length-check logic (`Content-Length` versus bytes on disk) before it unzips.
    - Lane D. Effort M.
    - Proof: `select max(assessment_year) from data_lake.collier_parcels` returns 2026, and `select distinct data_through from data_lake.collier_sold_median_by_zip` returns 2026-06-01.
    - Why ASK-FIRST: it changes the `data_lake` write shape. Preliminary 2026 values overwrite certified 2025 values and can move again before final.

Parked, not counted: `hendry_parcels`. Blocked by the brain-first rule until a Hendry consumer pack exists (§5).

## 8. Checks and balances

Design rule: one signal per pipeline. It fires only when the source the pipeline actually reads holds newer data than the lake AND the lake's newest load is older than the entry's `cadence_days`. That second condition keeps a monthly pipeline from opening and closing a row every cycle between runs. It auto-closes when the lake catches up, and it never files a GitHub issue.

**Mechanism.** It uses existing seams only.

- **The probe.** `ingest/scripts/probe_source_liveness.py` already runs daily in `freshness-probe-daily.yml` and imports each pipeline's constants (`:43-53`). Each entry gains a `source_ahead` marker. The result is written through a `sync_source_ahead_checks` that mirrors `check_freshness.sync_gap_checks` (`ingest/scripts/check_freshness.py:646`):
  - It opens `public.checks` key `source_ahead_<table slug>` when the probe fires.
  - It closes the row with evidence when the probe clears.
  - It respects a human `dropped` state.
- **The doctor.** Today it surfaces only ledger keys with the prefixes in `_TABLE_CHECK_PREFIXES` (`ingest/scripts/doctor.py:312`: `quality_fail_`, `schema_drift_`, `contract_fail_`), and it never writes (`doctor.py:17-18`). Item 7 adds `source_ahead_` to that tuple, so the doctor line for each table shows the open row. I did not verify what the ops coverage page reads, so this plan claims only the doctor line.
- **Nothing else.** The new signal files no `log-cron-incident` issue and adds no label. The existing listener that does file one for three family workflows (`log-cron-incident.yml:25,49,50`, P-8) is taken off this family in item 8.

**The registry field, per entry, and what it reads today (lake newest load from the §2 SQL, age as of 09/26):**

- **leepa**
  - Field: `source_ahead: {kind: arcgis_next_month_count, url: LEEPA_LAST_SALE_URL, where: "DoS='{y}-{m}'", lake_sql: "select max(last_sale_date) from data_lake.leepa_parcels"}`. `{m}` is unpadded, verified: `DoS='2026-07'` returns 0 and `DoS='2026-7'` returns 3,250.
  - Today: source is ahead (lake 2026-06; source 2026-7 = 3,250, 2026-8 = 3,006, 2026-9 = 630), and the newest load 07/11 is 77 days old against `cadence_days` 31 after item 4. FIRES.
- **leepa_comp_sales**
  - Field: `source_ahead: {kind: arcgis_next_month_count, url: LEEPA_COMP_SALES_URL, where: "SaleYear={y} AND SaleMonth={m}", lake_sql: "select max(sale_month) from data_lake.leepa_comparable_sales"}`.
  - Today: source is ahead (lake 2026-07; 2026-08 = 2,889 in run 35518297483 and 2,960 on the 09/26 probe), and the newest load 07/22 is 66 days old against 31 after item 5. FIRES.
- **lee_parcels**
  - Field: `source_ahead: {kind: arcgis_layer_edit, url: LEE_CADASTRAL_URL, lake_sql: "select to_timestamp(max(_dlt_load_id::numeric)) from data_lake.lee_parcels"}`. It fires when the layer's `editingInfo.dataLastEditDate` is later than the lake's newest load, and that load is older than 365 days. It uses layer metadata, not a `CO_NO=46` query, because `returnDistinctValues` on `ASMNT_YR` soft-400s on this layer (my probe, 09/26).
  - Today: layer edited 06/09/2026, lake loaded 07/18/2026. Does NOT fire. That is correct: the source this pipeline reads has not moved.
- **collier_parcels**
  - Field: same kind, `url: COLLIER_CADASTRAL_URL`.
  - Today: layer edited 06/09/2026, lake loaded 09/20/2026. Does NOT fire.
- **If item 11 is approved**, both FDOR entries switch to `kind: fdor_nal_vintage`, keyed on `(assessment_year, stage)` where stage is P or F, stored per row. The signal then fires when the portal holds a newer year OR the same year at a later stage. That way, 2026F superseding 2026P is caught instead of the check waiting for 2027P. The `stage` column is part of item 11's write shape.

Day one: two of four fire, the two LeePA legs, and both are genuinely stale. The FDOR vintage gap is not hidden. It is P-4, and it waits on the operator's item-11 decision, not on an alarm that could never close.

**Kept as-is.**

- `check_freshness.py` load-age, retuned by item 4 and item 5 to `cadence_days: 31` for the two monthly LeePA pipelines.
- `expected_rows_min` volume floors (`:819`, `:909`, `:1026`, `:1055`).
- The three agreement contracts on `lee_parcels` (`quality_registry.yaml:473-531`).
- `assert_vs_canonical` / `assert_min_rows` in-run guards. These become real guards after item 2.
- `classify-cron-failure.mjs` for run failures.

**Noise deleted.**

- Issue #125 (open since 07/15), closed by the first monthly scheduled success.
- The `lee_parcels` content-FAIL yellow from the A2 `_watch` contract (item 8).
- The NO_RUNS_IN_WINDOW yellow on three family rows (item 8, and items 4 and 5 by making two of them monthly).
- The 540/730-day `freshness_sla` on `leepa` (`:822-823`) and `leepa_comp_sales` (`:911-912`), a 1.5–2-year alarm on a monthly source that can never fire in time.
- The three family names on the `log-cron-incident.yml` listener (`:25` Collier parcels, `:49` LeePA comparable sales, `:50` LeePA parcels), which comment on sticky issue #44 on every failed run (item 8).

**Added.** One `source_ahead` field per entry, as above, plus the `source_ahead_` prefix in `doctor.py:312`. Nothing else.

## 9. Box placement

- **leepa: moves to the Fedora runner, where it is already routed** (`leepa-parcels-annual.yml:28`: `runs-on` resolves to `["self-hosted","swfl-local"]` when `vars.SWFL_LOCAL_RUNNER_READY == 'true'`, else `ubuntu-latest`; the variable is `true` since 2026-09-20T06:06:19Z per `gh variable list`, and runner `fedora-swfl-local` is online with labels `self-hosted,Linux,X64,swfl-local` per `gh api repos/:owner/:repo/actions/runners`, 09/26).
  - Why: the full pull did not finish inside 90 minutes on `ubuntu-latest` (5/5 cancelled, the newest classified TIMEOUT at 90.3 min). Fedora has no minute cost, and its timeout is ours to set (item 4).
  - Residential IP is NOT shown to be needed: the GHA liveness probe reads LeePA fine (run 36259690113).
  - Python note: GHA asks for 3.13 (`:45`), while Fedora uses the 3.12 venv (`:37-39`). The comp-sales dry run proved that venv.
- **leepa_comp_sales: moves to the Fedora runner, where it is already routed** (`leepa-comparable-sales-annual.yml:37`, the same `runs-on: [self-hosted, swfl-local]` expression gated by `SWFL_LOCAL_RUNNER_READY`; `timeout-minutes: 90` at `:38`).
  - Why: proven there, run 35518297483, 1 min 49 s. It runs on the same box and cadence as leepa, so one host serves both LeePA legs.
- **lee_parcels: stays on GHA `ubuntu-latest` for the ArcGIS lane.**
  - Why: FDOR/ArcGIS Online is reachable from GHA (run 29658034150 green, 87 min 42 s, under its 150-minute timeout, `lee-parcels-annual.yml:21`), and nothing needs a residential IP.
  - If item 11 is approved, the NAL lane runs on Fedora, because it needs the SSD archive.
- **collier_parcels: stays on GHA `ubuntu-latest`** (runs of 14–26 min against a 45-minute timeout). Same NAL note as `lee_parcels`.
- **Already on the box that should not be:** nothing from this family.

## 10. Compute lane per LLM leg

None. The grep proves it:

```
grep -rniE "anthropic|claude|ANTHROPIC_API_KEY|openai|refinery|llm|RunBudget" ingest/pipelines/leepa ingest/pipelines/leepa_comp_sales ingest/pipelines/lee_parcels ingest/pipelines/collier_parcels .github/workflows/leepa-parcels-annual.yml .github/workflows/leepa-comparable-sales-annual.yml .github/workflows/lee-parcels-annual.yml .github/workflows/collier-parcels-annual.yml --include=*.py --include=*.yml
```

The only match is a comment, `ingest/pipelines/leepa_comp_sales/constants.py:18` ("...FULL-SCOPE-FIRST, CLAUDE.md").

Both consuming packs are deterministic: `refinery/packs/properties-lee-value.mts:54` and `:964-965`, and `refinery/packs/properties-collier-value.mts:58` and `:693-694` ("This pack runs no synthesis agent (skipSynthesisAgent)").

The `source_ahead` signal in item 7 is Lane D and needs no model.

## 11. Double-check log

I re-read the file top to bottom and re-verified each numbered claim against its command or file. Each entry is claim · verifier · result.

1. Registry lines `leepa` 809, `leepa_comp_sales` 897, `collier_parcels` 1019, `lee_parcels` 1041 · `grep -n -E "^\s*- name: (leepa|...)" ingest/cadence_registry.yaml` · verified.
2. leepa 548,798 rows, newest load 07/11/2026, 199 loads, strap 547,972, lat 547,724, zip 548,323, variant 24, sale dates 1900-01-01..2026-06-01 · the §2 SQL · verified.
3. last_sale_amount non-null 528,502 · SQL `count(last_sale_amount)` · verified.
4. comp sales 108,848 rows, 22 loads on 07/22, months 2024-01..2026-07, 2026-07 = 837, years 46,630/40,329/21,889, folios 92,625, beds>0 75,746 · SQL · verified.
5. Comp dry run 35518297483 on `fedora-swfl-local`, 114,650 fetched, 1 min 49 s · `gh run view 35518297483 --log` (Runner name line, 15:02:04 → 15:03:53) · verified.
6. L23 count 114,919 on 09/26; 6,071 ahead · curl `returnCountOnly` → 114,919 − 108,848 = 6,071 · verified.
7. lee_parcels 556,083 rows, all distinct, 112 loads, `assessment_year` 2025 only, newest sale 2025-06 · SQL · verified.
8. `CO_NO=46` 556,100 · `CO_NO=21` 364,827 · `CO_NO=36` 35,717 · curl `returnCountOnly` · verified.
9. Layer dataLastEditDate 06/09/2026 · `?f=json` editingInfo, decoded with Python · verified.
10. collier_parcels 290,973 = 290,391 (09/20) + 582 (06/06, null `assessment_year`) · SQL grouped by load date · verified.
11. 827 dropped = 364,827 − 364,000; soft-400 body at OBJECTID>2274627 · Python probe replay · verified.
12. 793 unique tail parcels; 582 match the 06/06 rows; 211 refreshed 09/20 · objectIds fetch + SQL `parcel_id in (...)` · verified.
13. Collier 2026P: 297,635 rows, `ASMNT_YR` 2026, 165 columns, sales through 2026-06 (797) · downloaded zip profile · verified.
14. Lee 2026P HEAD 200, 43,316,780 bytes, 07/27/2026 · curl -I · verified. Its contents are NOT verified, and the plan says so.
15. Collier 2026P HEAD 19,586,857 bytes, 07/27/2026 · curl -I · verified.
16. `data_through` Collier 2025-06-01, Lee 2026-06-01; the live view uses a 1-year window · SQL + `pg_get_viewdef` (the literal is `'1 year'::interval`) · verified.
17. Served labels "as of 09/18/2026" / "09/19/2026" and "2024+" · grep of `brains/properties-*-value.md` and packs `:337`, `:502` · verified.
18. `as_of: fetched_at.slice(0, 10)` at `collier-sold-median-source.mts:114` and `leepa-sold-median-source.mts:122` · grep · verified.
19. leepa 5 runs, all cancelled; newest TIMEOUT 90.3 min · `gh run list` + `classifyTermination` · verified.
20. Collier runs green 06/20, 07/20, 08/20, 09/20; each of the last three logged "merged 364000" · `gh run list` + logs · verified. The 06/20 log returned HTTP 410, so could-not-verify, and §3 says so.
21. lee_parcels real run 29658034150 "merged 556100", 0 "unservable" lines; 29647370528 was a dry run · logs · verified.
22. Tests: 39 passed (leepa 36, collier 3); comp and lee_parcels 0 · pytest `--co` + `ls ingest/tests/pipelines` · verified.
23. A1 442/50,202 = 0.88%; A3 50,202; A2 473,382 · SQL · verified.
24. Doctor 78 rows, 23 NO_RUNS_IN_WINDOW; `lee_parcels` content FAIL; `collier_parcels` green · run 36259690113 log grep · verified.
25. The reason backfill did not promote NO_RUNS_IN_WINDOW · local `collect_gh` replication timed out (exit 124) · could-not-verify, and item 8 carries the diagnosis.
26. L10 535,125; L12 555,179 (doctor line); L0 65,984; FabricParcels 564,734; `DoS='2026-7'` 3,250 · curl + doctor log · verified. My own L12 count returned empty (could-not-verify at source, cited to the doctor).
27. `_dlt_loads` 440 `leepa_t2_%` schemas; the probe reads 2026-05-18 for leepa · SQL + `_fetch_max_freshness` replication · verified.
28. 6 pipelines share the ArcGIS paginator · grep · verified.
29. Issue #125 open since 07/15 · `gh issue list` · verified.
30. `SWFL_LOCAL_RUNNER_READY` true, runner online · `gh variable list`, `gh api .../actions/runners` · verified.
31. No LLM legs · §10 grep · verified.
32. KEEP BOTH ratified · `docs/standards/data-roots.md:134` · verified. Correction applied: the line was first cited as 130.

33. Cited line numbers (`leepa_comp_sales/constants.py:15,32`, `collier_parcels/resources.py:329`, registry `:938,:1039`, data-roots `:134`, `leepa/resources.py:245-246`) · `grep -n` on each file · corrected. The first draft carried off-by-N lines taken from a concatenated `cat -n`, and sections 2, 4, 5 and 7 now carry the grep-verified lines.

34. P-2 said LeePA layer 12's count 400'd "for my probe" · my probe's output was an empty body, not a 400 · corrected: P-2 now says "came back with an empty body".
35. §8 first draft: FDOR signals keyed to the NAL portal would fire forever if item 11 is declined, and the LeePA signal would open and close every month · re-read against the brief's "auto-closes" rule · corrected: FDOR signals are now keyed to the layer they read (`dataLastEditDate`), both signals are gated on load age greater than `cadence_days`, and day-one fires are now 2, not 4.
36. Item 2 first draft hard-raised on an unavailable count, which would block leepa (L12 count intermittency, `probe_source_liveness.py:97`) · corrected: an unavailable count now falls back to `assert_min_rows(expected_rows_min)` with a loud log.
37. Item 4 and §9 claimed a 6-hour hosted-runner cap that I had not verified in-session · corrected: the sentence is deleted; the plan says only that the timeout is ours to raise on the self-hosted path.
38. The doctor reads `public.checks` only by prefix · `ingest/scripts/doctor.py:305-318` · verified. Item 7 adds the prefix. The ops coverage page's reader was not verified, and §8 no longer claims it.
39. Gate 11 grandfathers all four entries without `raw_landing_class` · `.claude/hooks/lib/coverage-ratchet-baseline.json:14,38,40,41` · verified. Item 9 now shrinks the baseline in the same commit.
40. No YAML or JSON reader of the layer-0 archive prefix · `grep -rn "leepa/parcels" --include=*.yaml --include=*.yml --include=*.json .` returned nothing · verified.
41. Load ages 77 days (leepa, from 07/11) and 66 days (comp sales, from 07/22) as of 09/26 · date arithmetic, and the latter matches `check_tier2_entry` `age_days: 66` · verified.

Entries 42–60 were added by the second Opus, which re-ran the command for each one on 09/26.

42. Registry `expected_rows_min` 493,918 / 90,000 / 261,000 / 500,475 at `:819`, `:909`, `:1026`, `:1055` · `sed -n` on each line · verified.
43. `cadence_days: 365` at `:816`, `:904`, `:1023`, `:1045`; `dispatch_only: true` at `:1051`; `dlt_schema_name: leepa_parcels_tier2` at `:818`; SLA 540/730 at `:822-823`, `:911-912` · `sed -n` · verified.
44. Crons `0 13 1 3 *` (`leepa-parcels-annual.yml:14`, `leepa-comparable-sales-annual.yml:23`), `0 12 20 * *` (`collier-parcels-annual.yml:8`), none on `lee-parcels-annual.yml`; timeouts 90 / 90 / 150 / 45 · `grep -n "cron\|timeout-minutes"` · verified.
45. `leepa_comparable_sales` has 16 data columns plus `_dlt_load_id` and `_dlt_id`; `leepa_parcels` has 22 columns · `information_schema.columns` · verified.
46. `count(sale_price)` = 108,848 on `leepa_comparable_sales`; month counts 2026-05 3,695 · 2026-06 3,476 · 2026-07 837 · SQL · verified.
47. `lee_parcels` 112 distinct `_dlt_load_id`, `phy_zipcd` non-null 556,083, one `co_no` · SQL · verified.
48. `collier_parcels` loads: 06/06/2026 582 rows (582 NULL `assessment_year`), 09/20/2026 290,391 rows (0 NULL) · SQL grouped by load date · verified.
49. Collier keyset soft-400: `where=(CO_NO=21) AND OBJECTID>2274627` returns HTTP 200 with `{"error":{"code":400,"message":"Cannot perform query. Invalid query parameters.",...}}`; `returnCountOnly` on the same where returns 827; the 364,000th sorted id is 2274627 · curl + Python replay · verified.
50. 827 tail features = 793 unique PARCEL_ID; 582 match 06/06 NULL rows, 211 match 09/20 rows · `objectIds` fetch + SQL `parcel_id in (...)` · verified.
51. L0 65,984 · L12 555,179 · L23 114,919 · FabricParcels 564,734 · `CO_NO=21` 364,827 · `CO_NO=46` 556,100 · `CO_NO=36` 35,717 · layer fields 120 · `dataLastEditDate` 06/09/2026 03:09:34 UTC · curl `returnCountOnly` and `?f=json` · verified.
52. L10 `DoS` 2026-6 3,541 · 2026-7 3,250 · 2026-8 3,006 · 2026-9 630 · 2026-07 (padded) 0 · curl · verified; 2026-8 and 2026-9 are new and corrected §2, §4, §5, §6, §8.
53. L23 2026-7 3,234 · 2026-8 2,960 · 2026-9 609 on 09/26; run 35518297483 partitions 2026-06 3,598 · 2026-07 3,231 · 2026-08 2,889 · 2026-09 418; "114,650 rows fetched / 114,650 canonical"; "114,616 distinct / 114,650 rows (34 collapse on merge)"; job 15:02:04 → 15:03:53 on `fedora-swfl-local` · curl + `gh run view --log` · verified.
54. `lee_parcels` run 29658034150 job 19:33:55 → 21:01:37 (87 min 42 s), "merged 556100", 0 "unservable"; dry run 29647370528 "556100 parcels (server count 556100)" · `gh run view --json jobs` + `--log` · verified.
55. Collier runs 29750019226 (14:17 → 14:34), 32371536841 (12:57 → 13:23), 35520622150 (15:46 → 16:00), each "merged 364000 parcels"; 27873716538 (14:14 → 14:17) · `gh run list` + `--log` · verified. "14–26 min" matches.
56. Doctor run 36259690113: 78 rows (61 table, 10 tier-1-duckdb, 5 tier-1, 2 view), 23 NO_RUNS_IN_WINDOW, `lee_parcels` content FAIL, `collier_parcels` green; the run itself concluded `failure` on unrelated rows (`swfl_inc`, `listing_week`, `listing_lifecycle`) · `gh run view --log` · verified.
57. FDOR 2026P Lee 43,316,780 bytes, Collier 19,586,857, Hendry 2,532,335, all Last-Modified 07/27/2026; 2026F holds only `Citrus 19 Final NAL 2026.zip` (09/23/2026) · curl -I + SharePoint REST · verified.
58. Tests: 39 passed in 0.75 s; `--co` 36 (leepa), 3 (collier_parcels); no test imports `ingest.pipelines.lee_parcels` or `ingest.pipelines.leepa_comp_sales` · pytest + grep · verified.
59. A1 442 / 50,202, A2 473,382, A3 50,202 · not re-run by the second Opus (thresholds 0.025 and 40,000 re-read at `quality_registry.yaml:482` and `:523`) · thresholds verified, counts carried from the first Opus.
60. Collier 2026P profile (297,635 rows, 165 columns, `ASMNT_YR` 2026, sale months 2026-04 2,402 · 2026-05 2,051 · 2026-06 797) · second-Opus download aborted twice mid-transfer · could-not-re-verify; carried from the first Opus.

## 12. Questions for the operator

1. Item 11: may the Collier and Lee parcel tables take FDOR's 2026 PRELIMINARY roll from the NAL flat files? This overwrites certified 2025 values with preliminary 2026 values that can change again before final. It would move the Collier sold median from sales ending 06/2025 to sales ending 06/2026. The alternative is to wait for the FINAL roll: FDOR's 2026F folder started filling on 09/23/2026 (one county so far, Citrus). No date for Lee or Collier is published; the §8 `fdor_nal_vintage` signal would say when they land.
2. Item 10: may both sold medians state the data's own month (for example, "12 months through June 2025") as their "as of", in place of the build date? This changes served text on two leaf brains.

## 13. Second-Opus verification

Run 09/26/2026 by the second Opus. Every command in the file was re-run (`gh run list` for the four workflows, `gh run view --log` / `--json jobs` for every cited run id, read-only Bun.SQL from a scratchpad script with `default_transaction_read_only = on`, curl `returnCountOnly` / `?f=json` / HEAD against LeePA, FloridaGIO and FDOR, pytest on the family suites) and every cited `path:line` was opened.

**Claims checked: 229.** Tally by kind: registry name and field lines 30 · workflow YAML lines 12 · run ids and their log lines 20 · live SQL figures 38 · live source counts and metadata 16 · code `path:line` citations 42 · doc, config and served-brain citations 31 · consumer entries 27 · doctor-run figures 5 · issue, variable and runner facts 4 · test counts 4.

**Corrections (applied in the section where each appears):**

1. leepa source lead: "lake one month behind, source serves 2026-7" → the source serves 2026-7 3,250, 2026-8 3,006 and 2026-9 630, so the lake (max 2026-06) is three months behind → curl `DoS='2026-8'` / `'2026-9'` on L10, 09/26. Fixed in §2, P-5, §5, §6, §8.
2. P-2 scope: "5 sites" → also `leepa/resources.py:264-269` (L9/L10 fetched by the offset walk with no count guard, only `if not rows`) and `:185-186` (fabric count → 0 skips the guard) → `grep -rn "arcgis_count(\|assert_vs_canonical(\|paginate_arcgis[a-z_]*("` over the four pipeline dirs. Fixed in P-2 and item 2.
3. P-2 comp-sales backstop: "backstopped by `assert_min_rows` at `:331`" → the per-partition `arcgis_count` at `:196` (with `if expected == 0: continue`) is backstopped by the partition-sum equality at `:218-224`, and `:331` second → `leepa_comp_sales/resources.py:157-225`.
4. P-9 dry-run gap: "the real run uses keyset" → keyset for L12 only (`resources.py:247`); L9 and L10 use the offset walk (`:265`).
5. P-3 and item 10: Collier "2024+" at `:337` only → `:337`, `:510`, `:604` → `grep -noF "2024+" refinery/packs/properties-collier-value.mts`.
6. Consumer: `lib/listings/property-tax-history.ts` listed as a reader of `leepa_parcels` and `collier_parcels` → it reads only `steadyapi_tax_history_v` (`:143`, `:179`); the table names are in a comment (`:12`).
7. Consumer: `refinery/sources/active-listings-residential-source.mts` listed as a `collier_parcels` reader → comment only (`:34`).
8. Consumer: `lib/assistant/comp-rank.ts` listed as a `lee_parcels` reader → comments only (`:24,27,40,67,203`).
9. Consumer: `ingest/pipelines/lee_deed_official_records/normalize.py` listed as a `lee_parcels` reader → it parses the strap that joins to the table and never reads it (`:11`, `:106`).
10. Consumers missed: `app/r/source/_tables.ts` (via `parcel_subdivision_v`), views `collier_parcels_summary` / `collier_parcels_zip_summary` (read by `collier-parcels-source.mts:29-30`), and dark views `collier_parcels_city_summary` / `lee_parcels_city_summary` (no reader) → `pg_depend` query on the four tables + Grep of `refinery lib app components`.
11. `ingest/scripts/doctor.py:311` → `:312` for `_TABLE_CHECK_PREFIXES` → `grep -n` (item 7, §8 twice).
12. §8 "No `log-cron-incident` issue" left the existing per-failure filing standing → three family workflows sit on the listener (`log-cron-incident.yml:25,49,50`), which comments on sticky issue #44 (`CRON_INCIDENT_ISSUE_NUMBER`) every failed run and opens a deduplicated `[cron-failure:...]` issue (`log-cron-incident.mjs:220-228`); now in P-8, item 8 and the §8 noise-to-delete list.
13. §9 did not name the runs-on label for the two Fedora moves → added the `["self-hosted","swfl-local"]` expression gated by `vars.SWFL_LOCAL_RUNNER_READY`, the variable's set time, and the live runner labels (`gh variable list`, `gh api .../actions/runners`).
14. §3 "doctor rates leepa FRESH / OK / PASS" read as green → the row is overall yellow on NO_RUNS_IN_WINDOW (doctor run 36259690113 line for `leepa`).

**Unverifiable (carried from the first Opus, marked in §11):**

- Collier 2026P profile (297,635 rows, 165 columns, sale months through 2026-06): two downloads from this box aborted mid-transfer (5,965,510 of 19,586,857 bytes). HEAD, size and date are verified.
- Lee 2026P contents: same download failure; still unprofiled, as the first Opus said.
- A1 / A2 / A3 contract counts (442, 473,382, 50,202): not re-run; thresholds re-read.
- Why the doctor backfill did not promote NO_RUNS_IN_WINDOW: not re-attempted; item 8 still carries the diagnosis.
- Collier run 27873716538 (06/20) log: not re-fetched; the first Opus reported HTTP 410.
- How many comments issue #44 carries for this family: `gh issue view 44 --json comments` failed twice on a dropped connection.
- `data_lake.lee_comp_sales_v` row count: statement timeout.

**Gaps filled:** L10 already serves 2026-8 and 2026-9 (§2); the lake's June is partial (1,383 vs 3,541, §2); the L10 count is intermittent from this box too (§2); L23 partitions on 09/26 (§2); the FDOR 2026F folder began filling 09/23 (Citrus only) and Hendry 2026P HEAD (§2, item 11, §12 Q1); the reverted 05/30–07/15 monthly cron on leepa (P-5, item 4); NAL download needs resume and a length check (item 11); the two unguarded LeePA offset walks (P-2, item 2); the listener noise (P-8, item 8, §8); dark derived views (§1).

**Coverage check:** all four pipelines appear in §2, §3, §4, §6, §7, §8 and §9. §10 grep re-run over the four pipeline dirs and four workflow YAMLs for `anthropic|claude|ANTHROPIC|openai|refinery`: one hit, the comment at `leepa_comp_sales/constants.py:18`, already in §10. No LLM leg.

**Credit-suggestion count: 0.** `grep -niE "credit|top up|top-up|console balance|api key|funding"` on this file returned no lines before the second Opus's edits; the sentences this section adds use the word only in the grep pattern itself.
