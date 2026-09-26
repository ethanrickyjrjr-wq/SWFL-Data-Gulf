# 05 weather-env — pipeline plan (09/26/2026)

Family 05 covers hurricanes, storms, water, rainfall and flood insurance. It has five registry pipelines: `hurdat2_fl`, `storm_history_swfl`, `usgs`, `noaa_ghcn_rainfall` and `fema`. All five run deterministic Python on GHA `ubuntu-latest`. None makes an LLM call. They feed three brains: env-swfl, hurricane-tracks-fl and storm-history-swfl. All three brains are marked skipTriageAgent and skipSynthesisAgent.

The verdict is that two pipelines face a vendor deadline and are quietly heading for failure:

- FEMA's endpoint is removed on 10/15/2026, and the pipeline exits 0 even when it lands nothing.
- USGS WaterServices is decommissioned in Q1 2027.

One pipeline is a full hurricane season behind its source (HURDAT2). One is capped at 2025 by a hardcoded year (storm events). Rainfall works but serves a number with no baseline.

Verdicts:
- fema: REPAIR
- hurdat2_fl: REPAIR
- usgs: REPAIR
- storm_history_swfl: IMPROVE
- noaa_ghcn_rainfall: IMPROVE

Nothing in this family needs the Fedora box. Nothing in this family needs a model.

## 1. Scope

Count: 5 pipelines, 5 workflow files, 4 Tier-1 Parquet objects plus 2 `data_lake` tables, 3 consumer brains plus 3 non-brain readers.

- `hurdat2_fl`
  - Registry: `ingest/cadence_registry.yaml:355`, lane tier-1-duckdb, cadence_days 365, tolerance 1.5.
  - Workflow: `.github/workflows/hurdat2-annual.yml`.
  - Code: `ingest/duckdb_pipelines/hurdat2_fl/`.
  - Writes: `s3://lake-tier1/environmental/hurdat2_fl.parquet` and one `data_lake._tier1_inventory` row.
  - Consumer: `refinery/packs/hurricane-tracks-fl.mts:35` (HURDAT2_PARQUET_PATH).
- `storm_history_swfl`
  - Registry: `ingest/cadence_registry.yaml:374`, lane tier-1-duckdb, cadence_days 30, tolerance 2.0.
  - Workflow: `.github/workflows/storm-history-monthly.yml`.
  - Code: `ingest/duckdb_pipelines/storm_history_swfl/`.
  - Writes: `s3://lake-tier1/environmental/storm_events_swfl.parquet`.
  - Consumer: `refinery/sources/storm-history-source.mts:36`, which feeds `refinery/packs/storm-history-swfl.mts`.
- `usgs`
  - Registry: `ingest/cadence_registry.yaml:393`, lane tier-1-duckdb, cadence_days 30, tolerance 2.0.
  - Workflow: `.github/workflows/usgs-monthly.yml`.
  - Code: `ingest/duckdb_pipelines/usgs/`.
  - Writes: `usgs_water_swfl.parquet` and `usgs_water_swfl_sites.parquet`.
  - Consumer: `refinery/sources/usgs-water-source.mts:42-43`, which feeds env-swfl metric `swfl_sw_stage_caloosahatchee_ft`.
- `noaa_ghcn_rainfall`
  - Registry: `ingest/cadence_registry.yaml:1639`, lane tier-2, cadence_days 30, tolerance 2.0, expected_rows_min 6.
  - Workflow: `.github/workflows/noaa-ghcn-rainfall-monthly.yml`.
  - Code: `ingest/pipelines/noaa_ghcn_rainfall/`.
  - Writes: `data_lake.noaa_ghcn_rainfall`.
  - Consumer: `refinery/sources/noaa-ghcn-rainfall-source.mts:26`, which feeds env-swfl metric `swfl_rainfall_annual_in`.
- `fema`
  - Registry: `ingest/cadence_registry.yaml:787`, lane tier-2, cadence_days 90, tolerance 2.0, expected_rows_min 403542, count_table `data_lake.fema_nfip_claims`.
  - Workflow: `.github/workflows/fema-nfip-quarterly.yml`.
  - Code: `ingest/pipelines/fema/`.
  - Writes: `data_lake.fema_nfip_claims`, plus a Tier-1 cold CSV.gz in `raw-tabular-cold/fema/nfip_claims/`.
  - Brain consumers:
    - `refinery/sources/fema-nfip-source.mts:53-55`, which reads the table plus views `fema_nfip_county_year` and `fema_nfip_zip_window_agg` and feeds env-swfl.
    - `refinery/packs/hurricane-tracks-fl.mts:151-154` (cross-tier DuckDB join).
  - Non-brain readers:
    - `lib/demo/live-loaders.ts:153` (live count filtered to core FIPS).
    - `refinery/tools/build-corridor-fact-pack.mts:776`.
    - `lib/charts/hurricane-series.ts:105`, a hardcoded snapshot pulled once from this table.

No consumer is missing. Every table in the family has a reader, so there is no DARK ROOT here. The weak case is USGS: 2 of its 4 parameters are fetched and never read (see §4 P14).

## 2. What is being brought in

The Tier-1 figures below come from a read-only DuckDB probe of each Parquet over S3. The probe script was a throwaway in the scratchpad, never committed. It used the S3 credentials from the dlt secret, loaded the same way as `scripts/apply-fdic-sod-view.mts:10-30`.

### hurdat2_fl

- Source: NOAA NHC HURDAT2 Atlantic best-track. The index at `https://www.nhc.noaa.gov/data/hurdat/` is scraped by `_latest_hurdat2_url` (`ingest/duckdb_pipelines/hurdat2_fl/pipeline.py:58`).
- Fields: storm_id, name, year, obs date and time, record_id, status, lat, lon, max_wind_kt, min_pressure_mb, Saffir category.
- Geography: every storm that ever touched the FL bounding box, with its full track kept (`pipeline.py:151`).
- Cadence: cron `0 13 1 6 *`, June 1 only (`hurdat2-annual.yml:9`).
- Live contents:
  - Probe: `select count(*), count(distinct storm_id), min(storm_year), max(storm_year) from read_parquet('s3://lake-tier1/environmental/hurdat2_fl.parquet')`.
  - Result: 13,907 rows, 447 storms, 1851 to 2024.
- Freshness:
  - Query: `select id, vintage, updated_at from data_lake._tier1_inventory where id like 'lake-tier1/environmental/%'`.
  - Result: vintage `1851-2024`, updated_at 06/01/2026 18:33Z, source file `hurdat2-1851-2024-040425.txt`.
- County coverage: this is basin-level track data. The consumer computes distance to the Lee, Collier and Hendry centroids (`hurricane-tracks-fl.mts:58` onward).

### storm_history_swfl

- Source: NOAA NCEI Storm Events "details" CSVs (`ingest/duckdb_pipelines/storm_history_swfl/constants.py:5`).
- Fields: every CSV column, via `SELECT *` over `read_csv_auto` (`pipeline.py:108-117`).
- Geography: county rows for LEE, COLLIER and CHARLOTTE, plus hazard-type zone rows (`constants.py:15`, `constants.py:20-28`).
- Years: 1996 to `YEAR_RANGE_END = 2025` (`constants.py:7`).
- Cadence: cron `0 14 10 * *`.
- Live contents:
  - Probe: `select count(*), min(BEGIN_YEARMONTH), max(BEGIN_YEARMONTH) from read_parquet('.../storm_events_swfl.parquet')`.
  - Result: 1,106 rows, from 199602 to 202510.
- Freshness: inventory updated_at 09/10/2026 17:22Z (same inventory query as hurdat2_fl).
- County coverage:
  - Probe: `group by regexp_extract(CZ_NAME,'(LEE|COLLIER|CHARLOTTE|HENDRY)'), CZ_TYPE`.
  - Lee: 451 county rows plus 28 zone rows.
  - Collier: 348 county rows plus 60 zone rows.
  - Charlotte: 192 county rows plus 27 zone rows. Charlotte is out of scope and is filtered at `refinery/sources/storm-history-source.mts:51`.
  - Hendry: 0 rows.

### usgs

- Source: USGS WaterServices `/nwis/dv` and `/nwis/site` (`ingest/duckdb_pipelines/usgs/constants.py:38`).
- What it requests: `stateCd=FL` statewide (`constants.py:5`), `siteStatus=active` (`fetch.py:80`), and 4 parameter codes: 72019, 62610, 00065, 00045.
- Backfill: 2000 to the current year, re-fetched in full on every run (`pipeline.py:100`, `pipeline.py:113`).
- Cadence: cron `0 13 10 * *`.
- Live contents:
  - Probe: `select count(*), min(obs_date), max(obs_date), count(distinct site_no) from read_parquet('.../usgs_water_swfl.parquet')`.
  - Result: 4,744,886 rows, 01/01/2000 to 09/18/2026, 583 sites.
- Rows by parameter:
  - 00065 gage height: 4,276,293 rows, 562 sites.
  - 00045 precipitation: 466,547 rows, 121 sites.
  - 72019 depth to water: 2,046 rows from 1 site, last reading 08/31/2005.
  - 62610 groundwater above NAVD88: 0 rows.
- Freshness: inventory updated_at 09/20/2026 05:09Z.
- County coverage:
  - Sites Parquet: 861 sites, all state_cd '12'. Of those, 29 have county_cd 071 (Lee), 31 have 021 (Collier) and 20 have 051 (Hendry).
  - Joining daily readings to those three counties gives 170,208 rows, all 00065, from 23 sites.
  - The consumer's Caloosahatchee filter (`huc_cd LIKE '03090205%'`, `usgs-water-source.mts:180`) matches 22 catalog sites. 7 of them have 00065 readings on the latest date, 09/18/2026.

### noaa_ghcn_rainfall

- Source: GHCN-Daily `by_year` CSVs on AWS Open Data (`ingest/pipelines/noaa_ghcn_rainfall/constants.py:6`).
- Fields: PRCP only.
- Stations: 4 anchor stations (`constants.py:17`). Two are in Lee (Page Field, RSW) and two in Collier (Naples Muni, Naples COOP).
- Window: a rolling 3 years (`constants.py:40`). A station-year lands only with at least 300 QC-passing days (`constants.py:36`).
- Cadence: cron `0 14 5 * *`.
- Live contents (`select * from data_lake.noaa_ghcn_rainfall order by year, station_id`): 6 rows, 3 stations times 2024 and 2025.
- Rows:
  - 2024: Page Field 80.46 in over 366 days; RSW 57.92 in over 314 days; Naples Muni 65.96 in over 362 days.
  - 2025: 38.26 in, 39.16 in and 41.73 in, each over 365 days.
- Freshness: `_ingested_at` 09/05/2026 16:20Z. `_dlt_loads` shows loads on 06/05, 07/05, 08/05 and 09/05/2026.
- County coverage: Lee and Collier. Hendry has no station.

### fema

- Source: OpenFEMA `https://www.fema.gov/api/open/v2/FimaNfipClaims` (`ingest/pipelines/fema/constants.py:1`).
- Filter and fields: `state eq 'FL'`, with a 16-field `$select` (`resources.py:200-214`).
- Write: `replace` into `data_lake.fema_nfip_claims` (`resources.py:161`), staging-swapped (`resources.py:176`).
- Cadence: cron `0 13 5 1,4,7,10 *`.
- Live contents:
  - Query: `select count(*), min(date_of_loss), max(date_of_loss), count(distinct _dlt_load_id), max(_dlt_load_id) from data_lake.fema_nfip_claims`.
  - Result: 448,425 rows, date_of_loss 01/01/1978 to 05/31/2026, 1 load (`1784083386.742025`).
- Freshness: `_dlt_loads` places that load at 07/15/2026 04:09Z.
- County coverage (`group by county_code`):
  - 12071 Lee: 48,455 rows, latest loss 04/10/2026.
  - 12021 Collier: 14,761 rows, latest loss 04/26/2026.
  - 12051 Hendry: 132 rows, latest loss 09/26/2024.
  - The three counties total 63,348 of 448,425 rows (14.1%).

## 3. What is working

"Green" below comes in three kinds: a real landing, a dry run, and a run that exited 0 without landing anything.

### hurdat2_fl

Runs: `gh run list --workflow hurdat2-annual.yml --limit 15`.
- Total: 4 runs, 2 green and 2 red.
- Real landing: 26774116273 on 06/01/2026 (scheduled, about 1m16s). The inventory row matches it (06/01/2026 18:33Z).
- Newest red: 26457898517 on 05/26/2026. The log line is `KeyError: 'SUPABASE_S3_ENDPOINT'`. That is the secret-not-wired class, resolved per `docs/cron-rebuild-failures.md:58`.
- Tests:
  - `ingest/duckdb_pipelines/hurdat2_fl/test_parse_hurdat2.py`: 9 tests.
  - Plus a 4-module dry-run guard, `ingest/tests/duckdb_pipelines/test_dry_run_flag_honored.py`: 8 tests.
- Dry-run: honored since commit 4ef6c071 (09/20/2026). The parser also survives the typos in NHC's 09/12/2026 release (same commit).

### storm_history_swfl

Runs: 10 in total, 8 green and 2 red.
- Real landings: 34507606815 (09/10/2026, scheduled, "staged rows: 1,106 (hurricane/TS: 62)"), 31400086559 (08/10) and 29106417648 (07/10).
- Dry run: 35493242865 on 09/20/2026, which printed "--dry-run, writing to a temp dir".
- Newest red: 26457889327 on 05/26/2026, `KeyError: 'SUPABASE_S3_ENDPOINT'`, same resolved class.
- Row guards: `assert_min_rows` at `pipeline.py:125-126`.
- Tests: 11 in `ingest/tests/duckdb_pipelines/storm_history_swfl`.
- Consumer: the brain was refined 09/15/2026 (`brains/storm-history-swfl.md:5`).

### usgs

Runs: 9 in total, 6 green and 3 red.
- Real landing: 35490402310 on 09/20/2026 (about 13 min). Log: "daily rows loaded: 4,744,886", "sites loaded: 861". The inventory matches (09/20/2026 05:09Z).
- Dry run: 35490123910 on 09/20/2026, which printed "--dry-run".
- Newest red: 34503836892 on 09/10/2026. The log line is `requests.exceptions.HTTPError: 503 Server Error: for url: https://waterservices.usgs.gov/nwis/dv/?stateCd=FL&parameterCd=72019...`.
  - Retry and backoff were added afterwards (`ingest/duckdb_pipelines/usgs/fetch.py:20-36`, commit f2d1bfb3).
- Tests: 40 in `ingest/tests/duckdb_pipelines/usgs`.
- Consumer: env-swfl, refined 09/20/2026 (`brains/env-swfl.md:5`), serves 3.14 ft "latest reading (2026-09-18)".

### noaa_ghcn_rainfall

Runs: 4 in total, 4 green.
- Real landings: 33977468020 (09/05/2026, about 5 min), 31022436341, 28744984449 and 27027050184. Each has a matching `_dlt_loads` row.
- Dry-run: read-only by code. The `--dry-run` branch never builds a dlt pipeline (`ingest/pipelines/noaa_ghcn_rainfall/pipeline.py:37-54`).
- Tests: 15 in `ingest/tests/pipelines/noaa_ghcn_rainfall`.
- Consumer: env-swfl serves 39.72 in for 2025. That equals the mean of the 3 station rows: (38.26 + 39.16 + 41.73) / 3.

### fema

Runs: 9 in total, 2 exited 0, 3 cancelled, 4 failed.
- Real landing: 27480901331 on 06/13/2026 (about 5m36s). Log: "fetched 448,425 rows", "reported_zipcode non-null rate: 99.7%", "Tier 2 load complete".
- Exited 0 but landed nothing: 30766166374 on 08/02/2026. Log: "FEMA API 503 at skip=0, retry 5/5 in 300s..." then "WARNING: NFIP Claims failed — 503 Server Error ... Skipping."
- The current table load, 07/15/2026 04:09Z (`_dlt_loads` load_id 1784083386.742025), has no matching GHA run in the last 15. Load verified; origin needs review. It was most likely the local restore after the 07/14 incident.
- Cancelled: 29359639709 on 07/14. The fetch completed ("fetched 448,425 rows") and the run was then killed during "Promoting 448,425 rows to Tier 2". That kill is why `insert-from-staging` now exists (`resources.py:169-176`).
- Newest failure: 26460309695 on 05/26/2026. Its log has expired (HTTP 410). `docs/cron-rebuild-failures.md:65` records the 05/26 class as `SSL: UNEXPECTED_EOF_WHILE_READING`.
- What works in the code:
  - Shape guards on zip and flood-zone null rates (`resources.py:124-157`).
  - Volume floors (`resources.py:261-264`).
  - A staging-swap replace.
- Tests: 20 in `ingest/tests/pipelines/fema`.

### Test run

Command:
`ingest/.venv/Scripts/python.exe -m pytest -q ingest/duckdb_pipelines/hurdat2_fl/test_parse_hurdat2.py ingest/tests/duckdb_pipelines/storm_history_swfl ingest/tests/duckdb_pipelines/usgs ingest/tests/duckdb_pipelines/test_dry_run_flag_honored.py ingest/tests/pipelines/fema ingest/tests/pipelines/noaa_ghcn_rainfall`

Result: 103 passed in 4.50s.

## 4. Problems

### P1. FEMA source endpoint is deprecated and will be removed 10/15/2026

- Symptom: a live GET to the v2 endpoint returned `"depDate":"2026-10-15T00:00:00.000Z"`, "Data is frozen as of 06/01/2026", `depNewUrl .../nfip-redacted-claims-v3`.
  - Command: `curl 'https://www.fema.gov/api/open/v2/FimaNfipClaims?$top=1&$count=true&$filter=countyCode eq '12071' or ...'`.
- Root cause: `ingest/pipelines/fema/constants.py:1` still points at v2.
- Severity: blocks a served number. env-swfl and hurricane-tracks-fl can never get a claim newer than 06/01/2026. After 10/15 there is no fetch at all.
- First seen: 08/02/2026, in our own research (`_RESEARCH/data-and-ingest/2026-08-02-greenfield-scout-reliable-apis.md:54-76`). No plan item was ever opened.
- The replacement works as of today:
  - `https://www.fema.gov/api/open/v3/NfipClaims` answered 200.
  - FL count: 448,618 (`$filter=state eq 'FL'&$count=true`).
  - 3-county count: 63,401. The newest date_of_loss is 08/23/2026.
  - A `$top=10000` FL page returned 200 in 14.3s (4,493,463 bytes).
  - The v3 data page (crawl4ai) says "Last Data Refresh: 09-09-2026" and "Update Frequency R/P1M".

### P2. FEMA pipeline exits 0 when the fetch fails

- Symptom: run 30766166374 (08/02/2026) concluded success. Its log shows a 503 at skip=0 and then "Skipping."
- Root cause:
  - `ingest/pipelines/fema/pipeline.py:12-15` wraps the entire ingest in `except Exception` and prints a warning.
  - `ingest/pipelines/fema/resources.py:255-256` returns silently when zero rows come back.
- Severity: blocks detection. Every failure is invisible to log-cron-incident, heal-cron and the doctor's run-status.
- First seen: 08/02/2026 (that run).

### P3. Two latent traps in the v3 migration

- Symptom 1: v3 returns the key `NfipClaims` (live probe). `resources.py:239` reads `data.get("value") or data.get("FimaNfipClaims", [])`, so a URL-only swap yields an empty first page. P2 then turns that into a green run that lands zero.
- Symptom 2: the v3 `id` is an integer (live probe returned `"id":7729927`). v2 ids were strings, and `resources.py:72` passes `raw.get("id")` straight into a column pinned as text.
- Severity: would block the served number after migration. Found in this pass.

### P4. FEMA staleness does not go red until 01/11/2027

- Root cause: the tier-2 threshold is `int(cadence * tolerance)` (`ingest/scripts/check_freshness.py` in `check_tier2_entry`, the same formula as `:362-363`). That is 90 x 2 = 180 days from the 07/15/2026 load.
- Severity: blocks detection. The freshness probe calls the table FRESH for 3 months after the source is gone.

### P5. HURDAT2 lake is one season behind the source

- Symptom: NHC's index lists `hurdat2-1851-2025-091226.txt` (published 09/12/2026). The inventory still says vintage `1851-2024`.
- Root cause:
  - The workflow is a June-1-only cron (`hurdat2-annual.yml:9`). Its comment assumes NHC publishes in March or April. This year it published in September.
  - Commit 4ef6c071 (09/20/2026) fixed the parser against the new file, but no real run was dispatched. `gh run list` shows no run after 06/01.
- Severity: blocks a served number. hurricane-tracks-fl's landfall counts, closest-pass and per-storm NFIP exposure omit the 2025 season. The next scheduled refresh is 06/01/2027.
- First seen: 09/20/2026 (that commit).

### P6. hurricane-tracks-fl brain has not been rebuilt since 07/15/2026

- Symptom: `brains/hurricane-tracks-fl.md:4` reads `refined_at: 2026-07-15T06:52:19Z`, ttl 31536000.
- Root cause: `daily-rebuild.yml` last ran on 08/12/2026 (`gh run list --workflow daily-rebuild.yml --limit 5`). Family 16 owns that stall.
- Severity: blocks a consumer. Fixing P5 is not live until this brain rebuilds.

### P7. HURDAT2 staleness does not go red until 11/30/2027

- Root cause: 365 x 1.5 = 547 days from 06/01/2026 (`check_freshness.py:362-363`, `:418`).
- Severity: blocks detection.

### P8. Storm events are capped at 2025 by a hardcoded year

- Symptom: NCEI publishes `StormEvents_details-ftp_v1.0_d2026_c20260918.csv.gz`, which holds events 202601 to 202606. It has 20 county rows for Lee, Collier and Hendry (DuckDB probe of that file). The Parquet stops at 202510.
- Root cause: `ingest/duckdb_pipelines/storm_history_swfl/constants.py:7` sets `YEAR_RANGE_END = 2025` and says "bump annually". `pipeline.py:90` filters the index to that range.
- Severity: blocks a served number. The storm-history-swfl 10-year counts miss 2026.
- First seen: this pass.

### P9. Storm events have no Hendry rows

- Symptom: 0 Hendry rows in the Parquet.
- Root cause:
  - `constants.py:15` lists LEE, COLLIER and CHARLOTTE.
  - The zone regex (`constants.py:41`) only matches `COASTAL|INLAND <county>`, but NCEI names the Hendry zone bare `HENDRY`. The 2026 file shows `('HENDRY','Z',...)` rows, and 2025 has 4 C rows and 5 Z rows for Hendry.
  - The consumer also gates on `["LEE", "COLLIER"]` (`storm-history-source.mts:51`).
- Severity: scope. Hendry is an in-scope minor county.
- First seen: the ledger flagged the opposite leak, Charlotte (`docs/audit/2026-07-11-pipeline-problems/02-known-problems-ledger.md:89`).

### P10. Registry and data-roots misstate the storm-events gap

- The claim: `ingest/cadence_registry.yaml:388` and `docs/standards/data-roots.md` (storm_history_swfl DATA AVAILABLE) say the allowlist "silently excludes Flood and Waterspout".
- What is verified: the Parquet holds Flood (74 county rows) and Waterspout (58 county rows) (event-type probe). That part of the claim needs review.
- The real gap: `Flood` is absent from the consumer's `MAJOR_EVENT_TYPES` (`storm-history-source.mts:52-58`).
- Also, data-roots says Charlotte was "removed 07/07/2026". The ingest still pulls it (`constants.py:15`); only the consumer drops it.
- Severity: cosmetic, but it misdirects the next person.

### P11. Tier-1 inventory byte sizes are wrong

- Symptom:
  - Inventory says storm is 797 bytes; the real sum over `parquet_metadata` is 177,514.
  - Inventory says usgs daily is 2,112 bytes; the real sum is 8,564,272.
- Root cause: `SELECT total_compressed_size ... LIMIT 1` reads one column chunk, not the file (`storm_history_swfl/pipeline.py:132`, `usgs/pipeline.py:162`, `usgs/pipeline.py:175`). hurdat2 does this correctly with `SUM` (`hurdat2_fl/pipeline.py:167`).
- Severity: cosmetic. It is visible anywhere inventory sizes are quoted.

### P12. USGS WaterServices is being decommissioned

- Symptom: the crawl4ai fetch of `https://waterservices.usgs.gov/` says "WaterServices will be decommissioned in early 2027".
- The blog `https://waterdata.usgs.gov/blog/api-waterservices-decom/` (updated 09/15/2026) says:
  - "decommissioned in the first quarter of 2027".
  - "We will not begin any intentional degradation of these services before August 2026".
  - Campaign 3 runs "November 2026 through February 2027".
- The 09/10/2026 503 fits the degradation window, but that is an inference.
- Root cause: `ingest/duckdb_pipelines/usgs/constants.py:38` points at `waterservices.usgs.gov/nwis`.
- Severity: blocks a served number (the Caloosahatchee stage) when the service is shut off.
- Replacement: the migration guide names `https://api.waterdata.usgs.gov/ogcapi/v1/collections/daily` and `/monitoring-locations`. A v1 `daily` probe returned 200. More than a few queries per hour need a free api.data.gov key. The keys doc's example header is `X-RateLimit-Limit: 1000`.

### P13. USGS has no volume floor

- Root cause:
  - `usgs/pipeline.py:126-130` counts rows and then `COPY`s over the Parquet whatever the count.
  - `check_freshness.py:451` skips volume checks for tier-1 lanes.
- Severity: blocks a served number. A partial pull, such as one parameter answering empty, silently replaces 4.7M rows, and freshness still reads FRESH.

### P14. USGS pulls far more than it serves, and the registry overstates what lands

- What the pipeline pulls: 4,744,886 statewide rows every month.
- What the consumer reads: only 00065 at the Caloosahatchee HUC. That is 7 sites on the latest date.
- Dead parameters:
  - 72019 is 1 site that ended 08/31/2005.
  - 62610 is 0 rows.
- Doc claims that are wrong (X verified, Y needs review):
  - The registry says "4 parameters extracted" and "Same 60 USGS sites" (`cadence_registry.yaml:403-408`).
  - data-roots says "~580 USGS SWFL sites". The 583 is the statewide site count.
- Also, `siteStatus=active` (`fetch.py:80`) drops the history of deactivated sites on every full rewrite. That follows from the code; the effect was not measured.
- Severity: efficiency and documentation.

### P15. Issue #200 stays open after the fix landed

- Symptom: `gh issue list` shows #200 `[cron-failure:usgs-monthly] UNKNOWN · USGS SWFL Tier 1 monthly — 2026-09-10` still OPEN.
- Root causes:
  - The classifier's TRANSIENT regex (`.github/scripts/classify-cron-failure.mjs:199`) has no 5xx or "Service Unavailable" pattern, so a vendor 503 falls to UNKNOWN (`:214-217`). UNKNOWN routes to the heal-cron model narrative and gets no L0 retry.
  - Auto-resolve only fires on a scheduled success (`log-cron-incident.mjs:131`). The 09/20 real landing was a dispatch, so #200 waits for 10/10.
  - Check `usgs_monthly_real_run_confirm` is still open (`node scripts/check.mjs list`), although this pass verified the 09/20 landing.
- Severity: noise.

### P16. The rainfall number has no baseline, and a thin station-year counts as complete

- Symptoms:
  - The table holds 6 rows covering only 2024 and 2025 (the rolling window at `constants.py:40`).
  - env-swfl serves "39.72 in (2025)" with no normal to compare against.
  - RSW's 2024 total (57.92 in over 314 days) clears the 300-day floor. The two full-year Lee and Collier stations read 80.46 in and 65.96 in that year.
- Severity: product thinness. Nothing is wrong, but the number is weak.

### P17. GHCN downloads about 3.4 GB each month to read 4 stations

- The files, by `curl -sI` Content-Length:
  - `by_year/2024.csv`: 1,336,457,184 bytes.
  - `2025.csv`: 1,261,318,513 bytes.
  - `2026.csv`: 818,788,575 bytes.
- All three are read into memory as `resp.text` (`ingest/pipelines/noaa_ghcn_rainfall/resources.py:76`).
- The same publisher's per-station service answered live with data through 09/22/2026: `https://www.ncei.noaa.gov/access/services/data/v1?dataset=daily-summaries&stations=USW00012835&dataTypes=PRCP&...`.
- Severity: fragility and efficiency.

### P18. FEMA pulls all of FL although every consumer filters to 3 counties

- The three counties are 63,348 of 448,425 rows (14.1%).
- Readers that filter to the core counties:
  - `fema-nfip-source.mts:69`.
  - `hurricane-tracks-fl.mts:153`.
  - `lib/demo/live-loaders.ts:153-155`.
- Two runs were killed by timeouts (07/05 and 07/14) on the full-state pull.
- Severity: efficiency. It is mitigated by the 90-minute ceiling (`fema-nfip-quarterly.yml:33`).

Problems counted: 18.

## 5. What is missing

### hurdat2_fl

- The 2025 season is available at the source and not in the lake (P5).
- The 16 wind-radii and RMW fields per observation are discarded at parse time. The file is already downloaded, so keeping them costs nothing (`cadence_registry.yaml:369`, `wiki/pipeline-census.md:164`).
- No consumer needs the radii today. Hold them until a surge or exposure metric asks.

### storm_history_swfl

- The 2026 year file (P8).
- Hendry (P9).
- `Flood` in the consumer's major-event set (P10).
- The Parquet already carries every CSV column (deaths, injuries, crop damage, episode and event narratives). Nothing more is needed from the source.

### usgs

- Discharge (00060), water temperature, salinity and DO/pH are free at the same call (`cadence_registry.yaml:405`) and unpulled.
- 62610 and 72019 are effectively dead as configured. Groundwater comes from a separate Lee WellMonitor connector (`usgs-water-source.mts` header).
- The consumer should read what the pipeline fetches, or the pipeline should stop fetching it (plan item 11).

### noaa_ghcn_rainfall

- History before 2024. Page Field's record starts in 1892 (`constants.py:13`). A 1991–2020 normal needs about 35 station-years per station.
- Year-to-date 2026 rainfall. The partial year is dropped by the 300-day floor.
- TMAX and TMIN are in the same files at zero extra cost (`cadence_registry.yaml:1666`).
- A Hendry station.

### fema

- The v3 endpoint (P1).
- Residential Penetration Rates are a hardcoded snapshot (`refinery/sources/fema-nfip-source.mts:171`), not a pipeline.
- Policies-in-Force and the Community Status Book are unpulled (`cadence_registry.yaml:804`).
- v3 adds fields such as `nfipCommunityName` (v3 page crawl).

### Consumers that should exist and do not

- The storm-timeline deliverable frame is built but parked, waiting for a `storm_timeline` detail table (`docs/standards/data-roots.md`, fema NOTES).
- Neither consumer is required by this plan.

### A related FEMA surface with no registry entry

- env-swfl also calls the FEMA NFHL flood layer live on every build (`refinery/sources/env-swfl-source.mts`, per data-roots fema NOTES).
- That surface has no registry entry, so check_freshness does not watch it.
- This family does not own it. It is listed so the second Opus does not count it as missed.

## 6. Verdict per pipeline

- `fema`: REPAIR.
  - Reason: the endpoint is removed on 10/15/2026, and the pipeline hides failures behind exit 0.
  - Number that would change the verdict: a v3 landing with a 3-county count of at least 63,401 and `max(date_of_loss)` on or after 08/23/2026.
- `hurdat2_fl`: REPAIR.
  - Reason: a season behind the source, with no scheduled catch-up until 06/01/2027.
  - Number that would change the verdict: inventory vintage `1851-2025`.
- `usgs`: REPAIR.
  - Reason: working today on a service with a published Q1 2027 shutdown and possible degradation before then. It also has no volume floor.
  - Number that would change the verdict: one green scheduled run against `api.waterdata.usgs.gov`.
- `storm_history_swfl`: IMPROVE.
  - Reason: green monthly, but blind to 2026 and to Hendry.
  - Number that would change the verdict: Parquet `max(BEGIN_YEARMONTH)` at 202606 or later, with more than 0 Hendry rows.
- `noaa_ghcn_rainfall`: IMPROVE.
  - Reason: reliable (4 of 4 green), but serves an annual total with no normal.
  - Number that would change the verdict: rows with `year < 2024` above 0 (a baseline exists).

## 7. The plan

Items are ordered by deadline. Every lane below is Lane D unless stated otherwise. The Codex second review (Lane C, `codex review`, present in codex-cli 0.157.0) applies to items 1, 2 and 10 before merge.

1. FEMA fail-loud. DO.
   - What: delete the `try/except Exception` swallow (`ingest/pipelines/fema/pipeline.py:12-15`), and make `resources.py:255-256` raise on zero rows instead of returning.
   - Lane: D. Effort: S.
   - Proof:
     - A new test asserts `main([])` raises when `_fetch_all_nfip_claims` raises: `ingest/.venv/Scripts/python.exe -m pytest -q ingest/tests/pipelines/fema`.
     - Next, a forced failure shows up in `gh run list --workflow fema-nfip-quarterly.yml` as `failure`.
   - Unblocks: every FEMA signal in §8.
2. FEMA v2 to v3 migration. DO. It must land before the 10/05/2026 cron and the 10/15/2026 removal.
   - What:
     - `constants.py:1` becomes `https://www.fema.gov/api/open/v3/NfipClaims`.
     - `resources.py:239` reads `data.get("NfipClaims")`.
     - `resources.py:72` becomes `str(raw.get("id"))`.
     - Keep `state eq 'FL'` and the 16-field `$select`. All 16 names appear on the v3 page. The 403,542 floor stays valid against v3's 448,618.
     - Update `cadence_registry.yaml:787-805` (source_url, confirmed_total).
   - Lane: D, plus a Lane C review. Effort: M.
   - Proof:
     - Dispatch with `dry_run=true` (read-only by code, `pipeline.py:24-32`), then a real dispatch.
     - Then run `select county_code, count(*), max(date_of_loss) from data_lake.fema_nfip_claims where county_code in ('12071','12021','12051') group by 1` and expect a sum of at least 63,401 and a max of 08/23/2026 or later.
   - Unblocks: P1, P3, and fresh claims for env-swfl and hurricane-tracks-fl.
3. FEMA cadence to monthly. DO.
   - What: v3 publishes monthly. Change the cron at `fema-nfip-quarterly.yml:6` to `0 13 5 * *`, and set `cadence_days: 30` at `cadence_registry.yaml:791`. Change the cron only. Keep the file name, because the incident check key is derived from it (`.github/scripts/lib/cron-run.mjs:11-17`, used by `log-cron-incident.mjs:56`). Keep the `name:` field, because `log-cron-incident.yml` and `heal-cron-failure.yml` match workflows by that string.
   - Lane: D. Effort: S.
   - Proof: `node scripts/schedule-catalog.mjs | grep -i fema`, and `python ingest/scripts/check_freshness.py` shows threshold 60 for fema.
   - Unblocks: P4.
4. HURDAT2 catch-up and monthly self-probe. DO.
   - What:
     - Dispatch `hurdat2-annual.yml` for real now. The parser fix is already on main (4ef6c071).
     - Change the cron to `0 13 1 * *`. The run itself is the source probe, because `_latest_hurdat2_url` always takes the newest file. Cost is one index GET plus one file download per month; the full run took about 1m16s on 06/01 (26774116273).
     - Set `cadence_days: 30` at `cadence_registry.yaml:359`.
     - Add a floor before the `COPY` at `pipeline.py:151`, not after it (the current `row_count` at `:170-173` is read after the overwrite). Count the filtered set with `SELECT count(*) FROM hurdat_raw WHERE storm_id IN (<same FL-bbox subquery>)`, then call `assert_min_rows(n, 12500, ...)`. 12,500 is about 90% of today's 13,907.
     - Change the cron only. Keep the file name `hurdat2-annual.yml` and `name: HURDAT2 FL annual`, for the same reasons as item 3.
   - Lane: D. Effort: S.
   - Proof: `select vintage, updated_at from data_lake._tier1_inventory where id='lake-tier1/environmental/hurdat2_fl.parquet'` returns `1851-2025`.
   - Unblocks: P5 and P7.
5. Rebuild hurricane-tracks-fl. DO, after item 4.
   - What: `gh workflow run daily-rebuild.yml -f pack_id=hurricane-tracks-fl`. This is one brain only: never `master --force`.
   - Lane: D. Effort: S.
   - Proof: `brains/hurricane-tracks-fl.md` shows `refined_at` after 09/26/2026 and a vintage citing `hurdat2-1851-2025-091226.txt`.
   - Dependency: family 16 owns the daily-rebuild stall. If the workflow is blocked, rebuild locally and commit the brain.
   - Unblocks: P6.
6. Storm events include the current year automatically. DO.
   - What:
     - `constants.py:7` becomes `YEAR_RANGE_END = datetime.now(timezone.utc).year`, with VINTAGE derived from it.
     - `_list_noaa_urls` already takes the newest compile date per year (`pipeline.py:56`). Two-digit year parsing in the consumer already maps 26 to 2026 (`storm-history-source.mts:181-184`).
   - Lane: D. Effort: S.
   - Proof: DuckDB `select max(BEGIN_YEARMONTH) from read_parquet('s3://lake-tier1/environmental/storm_events_swfl.parquet')` returns 202606 or later.
   - Unblocks: P8.
7. Storm events land Hendry. DO.
   - What: add `HENDRY` to `constants.py:15`, and widen the zone regex at `constants.py:41` to `^((COASTAL|INLAND) )?(LEE|COLLIER|HENDRY)( COUNTY)?$`. Leave Charlotte, since the consumer already filters it.
   - Lane: D. Effort: S.
   - Proof: `select count(*) from read_parquet(...) where CZ_NAME like '%HENDRY%'` returns more than 0.
   - Unblocks: item 8.
8. Consumer counts Hendry. ASK-FIRST, because served key_metric values change.
   - What: add `"HENDRY"` to `SWFL_COUNTIES` at `refinery/sources/storm-history-source.mts:51`. Separately, decide whether `Flood` joins `MAJOR_EVENT_TYPES` (`:52-58`).
   - Lane: D. Effort: S.
   - Proof: `bun test refinery/sources/storm-history-source.test.mts`, then a `pack_id=storm-history-swfl` rebuild.
9. USGS volume floor. DO.
   - What: before `COPY usgs_daily` (`usgs/pipeline.py:130`), fail if `daily_count` is under 90% of the previous Parquet's `count(*)`. Read the previous count with the same DuckDB connection, and use `ingest/lib/guards.py` `assert_vs_canonical`, as fema already does.
   - Lane: D. Effort: S.
   - Proof: a new unit test with a mocked empty parameter raises `VolumeGuardError`, run with `pytest -q ingest/tests/duckdb_pipelines/usgs`.
   - Unblocks: P13.
10. USGS migration to the Water Data OGC API. DO once the key exists (see §12). Target: before 11/01/2026, when Campaign 3 starts.
    - What:
      - Rewrite `usgs/fetch.py` against `https://api.waterdata.usgs.gov/ogcapi/v1/collections/daily` and `/monitoring-locations`.
      - Map fields per the migration guide: `monitoring_location_number` to site_no, `parameter_code`, `statistic_id`, `county_code`, `hydrologic_unit_code`.
      - Pass the key via the `X-Api-Key` header from a new GHA secret.
      - Keep the Parquet schema identical, so `usgs-water-source.mts` does not change.
      - Replace the 27-year full refetch with an incremental last-N-days pull merged into the existing Parquet, if the paging math under the rate limit requires it. Measure it first with one dry run.
    - Lane: D, plus a Lane C review. Effort: L.
    - Proof: a green scheduled run with the inventory `source_url` on api.waterdata.usgs.gov, and env-swfl's `swfl_sw_stage_caloosahatchee_ft` date within 3 days of the run.
    - Unblocks: P12.
11. Narrow the USGS pull to what is served. ASK-FIRST, because the stored lake scope shrinks.
    - What: fetch only HUC 03090205 plus county_code 071, 021 and 051, and drop parameters 72019 and 62610. Groundwater has its own connector.
    - Lane: D. Effort: S, folded into item 10.
    - Proof: the Parquet row count drops from 4,744,886 to the scoped count, and the served stage value is unchanged on the same date.
12. Fix inventory byte sizes. DO.
    - What: replace `LIMIT 1` with `SUM(total_compressed_size)` at `storm_history_swfl/pipeline.py:132`, `usgs/pipeline.py:162` and `usgs/pipeline.py:175`.
    - Lane: D. Effort: S.
    - Proof: the inventory byte_size for storm is on the order of 177,514, not 797.
    - Unblocks: P11.
13. Classify vendor 5xx as TRANSIENT. DO. The file is owned by family 19; this family supplies the failure shape.
    - What: add `50[234] Server Error|Service Unavailable|Bad Gateway|Gateway Time-?out` to the regex at `.github/scripts/classify-cron-failure.mjs:199`. A vendor 503 then gets the L0 retry and never reaches the model narrative.
    - Lane: D. Effort: S.
    - Proof: a classifier test fed the 09/10 log line `requests.exceptions.HTTPError: 503 Server Error` returns `TRANSIENT`: `node --test .github/scripts/`.
    - Unblocks: part of P15.
14. Close the stale noise. DO.
    - What:
      - `gh issue close 200 --comment "Landed by run 35490402310 on 09/20/2026: inventory updated_at 09/20/2026 05:09Z, parquet max obs_date 09/18/2026, 4,744,886 rows"`.
      - `node scripts/check.mjs close usgs_monthly_real_run_confirm --evidence "<same>"`.
    - Lane: D. Effort: S.
    - Proof: `gh issue view 200 --json state` returns CLOSED, and `node scripts/check.mjs list` shows the key gone.
15. Correct the docs. DO.
    - What:
      - Rewrite storm `source_ceiling` (`cadence_registry.yaml:388`): Flood and Waterspout do land, and the gap is the consumer's major set plus Hendry.
      - Rewrite usgs `confirmed_total` and `source_ceiling` (`:403-408`): 2 live parameters, statewide, 23 sites in the 3 counties with data.
      - Fix the fema comment at `:796`. It cites `inserted_at`, which the table does not have; freshness keys on `_dlt_loads`.
      - Add matching lines to `docs/standards/data-roots.md` (usgs, storm_history_swfl, fema) and to `docs/standards/data-inventory.md:126` (fema source now v3).
    - Lane: D. Effort: S.
    - Proof: `git diff --stat` on the three files, and a `grep -n "Waterspout" ingest/cadence_registry.yaml` that no longer says "excludes".
16. GHCN per-station fetch plus history backfill. DO. The row shape is unchanged; the table gains older years.
    - What:
      - Replace the 3 global `by_year` downloads (`resources.py:62-76`) with 4 per-station requests to `https://www.ncei.noaa.gov/access/services/data/v1?dataset=daily-summaries&stations=<id>&dataTypes=PRCP&format=csv`. Same publisher, verified live.
      - Request `includeAttributes=true&units=metric`. The service then returns `PRCP_ATTRIBUTES` as `mflag,qflag,sflag,obstime` in millimetres, so the existing Q-flag drop and 300-day floor carry over unchanged. Divide by 25.4, not 254.
      - Keep the 300-day floor and the merge disposition.
      - Backfill station-years from 1991 once.
    - Lane: D. Effort: M.
    - Proof:
      - Parity first: each station's 2025 total must equal the current rows (38.26, 39.16, 41.73 in), with day_count 365. One station has already been checked: a live pull for USW00012835 over 2025 with Q-flagged days dropped gave 365 days and 38.26 in, matching the lake row.
      - Then `select min(year), count(*) from data_lake.noaa_ghcn_rainfall` returns 1991 or near it, with more than 6 rows.
      - `pytest -q ingest/tests/pipelines/noaa_ghcn_rainfall` stays green.
    - Unblocks: P16 and P17.
17. Rainfall anomaly metric. ASK-FIRST, because it adds a key_metric to env-swfl's output.
    - What: add `swfl_rainfall_vs_normal_pct` and a year-to-date line in `refinery/sources/noaa-ghcn-rainfall-source.mts` and `refinery/packs/env-swfl.mts`.
    - Lane: D. Effort: M.
    - Proof: `bun test refinery/packs/env-swfl.test.mts`, then a `pack_id=env-swfl` rebuild.
18. FEMA Residential Penetration Rates as a pipeline. ASK-FIRST, because it creates a new `data_lake` table.
    - What: a second small resource in `ingest/pipelines/fema/` pulls `https://www.fema.gov/api/open/v1/NfipResidentialPenetrationRates` for the 3 counties. `fema-nfip-source.mts:171` then reads the table instead of the hardcoded map.
    - Lane: D. Effort: M.
    - Proof: `select * from data_lake.fema_nfip_penetration_rates where county_fips in ('12071','12021','12051')`.

Totals: 14 DO (items 1–7, 9, 10, 12–16) and 4 ASK-FIRST (items 8, 11, 17, 18).

## 8. Checks and balances

Design rule: one signal per pipeline, using existing seams only. A signal fires only when a served number would be wrong or stale, and auto-closes on green.

The incident issue is one per workflow, not one per run. `log-cron-incident.mjs:217-227` searches for an open `[cron-failure:<wf>]` issue and comments on it instead of creating another. Nothing in this family files an issue per run today, and nothing below adds one.

### fema

- Signal: the run's own exit code (after item 1) feeds the existing `log-cron-incident` → `cron_incident_fema_nfip_quarterly` check.
- It auto-closes on the next scheduled green (`log-cron-incident.mjs:143-173`).
- Registry change: `cadence_days: 30` (item 3). The freshness probe then goes STALE 60 days after the last `_dlt_loads` row, not 180. No new field is needed.
- The existing guards are enough to protect the served number: the zip and flood-zone null-rate guards (`resources.py:124-157`), `expected_rows_min: 403542`, and `assert_vs_canonical` at 0.95.

### hurdat2_fl

- Signal: the existing tier-1 freshness on `_tier1_inventory.updated_at`, with `cadence_days: 30` and `tolerance_multiplier: 2.0` (item 4).
- The monthly run always re-reads NHC's newest file, so "stale" now also means "a newer vintage went unread for 60 days".
- The volume floor sits inside the pipeline, because `check_freshness.py:451` skips tier-1 volume.

### storm_history_swfl

- Signal: the existing tier-1 freshness (30 x 2), plus the in-pipeline `assert_min_rows` floors (`pipeline.py:125-126`). Both already exist.
- The only change: item 6 removes the manual year bump that could not be monitored.

### usgs

- Signal: the existing tier-1 freshness (30 x 2), plus the new in-pipeline floor (item 9). A partial pull then fails the run instead of silently replacing the Parquet.
- Vendor 5xx gets one L0 retry (item 13) before any check opens.

### noaa_ghcn_rainfall

- Signal: the existing tier-2 freshness on `_dlt_loads` (30 x 2), plus `expected_rows_min: 6` on `count_table`. Both already exist and are correct.
- The per-station DROP warning (`resources.py:123-143`) stays a log line. It is not a signal, by design (`cadence_registry.yaml:1653-1660`).

### Noise to delete

- Issue #200 and check `usgs_monthly_real_run_confirm` (item 14).
- The UNKNOWN classification path for vendor 5xx (item 13). It currently draws a model narrative on this family's 503s.

### What not to add

- No new workflow, label, checks key or issue type.
- The ops coverage page (`https://swfldatagulf-ops.vercel.app/coverage`) reads the same registry freshness. It was not opened this session, so this plan makes no claim about what it shows.

## 9. Box placement

All five stay on GHA `ubuntu-latest`. None is on the Fedora box today (`runs-on: ubuntu-latest` at `hurdat2-annual.yml:23`, `storm-history-monthly.yml:23`, `usgs-monthly.yml:22`, `noaa-ghcn-rainfall-monthly.yml:23`, `fema-nfip-quarterly.yml:20`), and none should move.

- `hurdat2_fl`
  - Why it stays: a federal open file with no WAF; the 06/01 run fetched from GHA fine. It ran about 1m16s.
  - No browser, SSD or local model needed.
- `storm_history_swfl`
  - Why it stays: the NCEI open index was read from GHA without trouble. It ran about 1m44s (run 34507606815).
- `usgs`
  - Why it stays: about 13 min (35490402310), far under 6 h.
  - The OGC API rate limit is per api.data.gov key, not per IP, so a residential IP buys nothing.
- `noaa_ghcn_rainfall`
  - Why it stays: about 5 min (33977468020). After item 16 it downloads kilobytes, not about 3.4 GB. The SSD archive is not needed.
- `fema`
  - Why it stays: about 5m36s on its last full landing (27480901331).
  - The 503s at skip=0 on 08/02 were FEMA-side: the same URL family answered 200 from this Windows box today, and our 08/02 research saw v3 503 as well. A residential IP is not shown to help.
  - The 90-minute ceiling fits GHA.

Nothing already on the box belongs to this family.

## 10. Compute lane per LLM leg

### Grep proof that the family's own code has no model call

Command:

```
grep -rniE "anthropic|claude|ANTHROPIC_API_KEY|openai|refinery|llm|ollama" ingest/duckdb_pipelines/hurdat2_fl ingest/duckdb_pipelines/storm_history_swfl ingest/duckdb_pipelines/usgs ingest/pipelines/noaa_ghcn_rainfall ingest/pipelines/fema .github/workflows/hurdat2-annual.yml .github/workflows/storm-history-monthly.yml .github/workflows/usgs-monthly.yml .github/workflows/noaa-ghcn-rainfall-monthly.yml .github/workflows/fema-nfip-quarterly.yml --include=*.py --include=*.yml | grep -v /tests/
```

Result: three hits, all the word "refinery" in paths and comments. The hits are at `storm_history_swfl/make_fixture.py:1`, `:16` and `noaa_ghcn_rainfall/resources.py:170`. There are zero model calls.

The `anthropic` and `openai` packages in `ingest/requirements.txt` are installed on every run, but they are package installs, not calls.

### Consumer brains

- `refinery/packs/env-swfl.mts:1332-1333`, `refinery/packs/hurricane-tracks-fl.mts:622-623` and `refinery/packs/storm-history-swfl.mts:362-363` set `skipTriageAgent: true` and `skipSynthesisAgent: true`.
- The stages honor those flags at `refinery/stages/2-triage.mts:40` and `refinery/stages/3-synthesis.mts:26`.
- Building these brains therefore calls no model.

### The one model leg this family triggers

This leg does not live in the family:

- What: `heal-cron-failure.mjs --mode=diagnose` writes a Haiku narrative on any failure classified UNKNOWN (`.github/scripts/heal-cron-failure.mjs:7`, `:214-231`; `heal-cron-failure.yml:191`).
- Current auth: the ANTHROPIC_API_KEY secret, with a deterministic-diagnosis fallback when the key is absent (`heal-cron-failure.mjs:214-215`).
- Replacement for this family: none needed. Item 13 makes this family's only observed UNKNOWN shape (a vendor 503) deterministic TRANSIENT, so the leg stops firing for family 05.
- The leg's lane for the other families belongs to family 19.

## 11. Double-check log

Each numbered claim was re-verified this session; the command or file for each is listed.

### How the queries were run

- SQL: a read-only Bun.SQL script in the scratchpad, never committed. It used the dlt Postgres credentials in the same pattern as `scripts/apply-fdic-sod-view.mts:10-30`, with `default_transaction_read_only = on`.
- Parquet: a read-only DuckDB script in the scratchpad, using the S3 keys from the dlt secret.

### Run tallies and landings

- hurdat2: 4 runs, 2 green and 2 red. Command: `gh run list --workflow hurdat2-annual.yml --limit 15 --json ...`. Verified.
- storm: 10 runs, 8 green and 2 red; 35493242865 is a dry run. Command: `gh run list` plus `gh run view 35493242865 --log`. Verified.
- usgs: 9 runs, 6 green and 3 red; 35490123910 is a dry run and 35490402310 is real. Command: `gh run view <id> --log | grep`. Verified.
- ghcn: 4 runs, all green. Command: `gh run list`. Verified.
- fema: 9 runs, 2 success (one of which landed nothing), 3 cancelled and 4 failed. Command: `gh run list` plus `gh run view 30766166374 --log`. Verified.
  - Correction applied in §3: the first draft counted 30766166374 as working. It is now listed as "exited 0 but landed nothing".

### Row counts and freshness

- FEMA 448,425 rows, one load, 07/15/2026:
  - `select count(*), min(date_of_loss), max(date_of_loss), count(distinct _dlt_load_id), max(_dlt_load_id) from data_lake.fema_nfip_claims`
  - `select load_id, schema_name, inserted_at from data_lake._dlt_loads where schema_name in ('fema_nfip_tier2','noaa_ghcn_rainfall','tier1_inventory') order by inserted_at desc limit 12`
  - Verified.
- FEMA 3-county rows 48,455 + 14,761 + 132 = 63,348. This matches the frozen v2 source count of 63,348 (`$count=true` probe). Verified.
- GHCN 6 rows and 39.72 = the 3-station 2025 mean: `select * from data_lake.noaa_ghcn_rainfall` plus `brains/env-swfl.md` metric value. Verified.
- HURDAT2: 13,907 rows, 447 storms, 1851–2024. DuckDB `read_parquet` probe. Verified.
- Storm: 1,106 rows, 199602–202510, with the county and event-type splits. DuckDB probe. Verified.
- USGS: 4,744,886 rows, 583 sites, the per-parameter split, 170,208 rows in the 3 counties, and 7 Caloosahatchee sites on 09/18/2026. DuckDB probe.
  - Correction: the first probe used 5-digit county codes and returned an empty set. It was re-run with state_cd '12' plus 3-digit county_cd.
- Inventory rows (vintages, updated_at, byte sizes 797 and 2112): `select id, vintage, byte_size, updated_at from data_lake._tier1_inventory where id like 'lake-tier1/environmental/%'`. Verified.
- True Parquet sizes 177,514 and 8,564,272: `select sum(total_compressed_size) from parquet_metadata(...)`. Verified.

### Source-side facts

- NHC `hurdat2-1851-2025-091226.txt` exists: `curl -s https://www.nhc.noaa.gov/data/hurdat/ | grep -oE 'hurdat2-...'`. Verified.
- NCEI 2026 file `c20260918`, 202601–202606, 20 core-county rows, Hendry zone name `HENDRY`: `curl` of the index plus a DuckDB `read_csv_auto` of that file. Verified.
- FEMA v2 deprecation 10/15/2026 and frozen as of 06/01/2026: `curl ...v2/FimaNfipClaims?$top=1...` metadata. Verified.
- FEMA v3 endpoint, monthly refresh, all 16 fields present, FL count 448,618, 3-county count 63,401, newest loss 08/23/2026, id an integer, key `NfipClaims`: crawl4ai of `nfip-redacted-claims-v3` plus `curl ...v3/NfipClaims`. Verified.
- USGS decommission Q1 2027, no degradation before August 2026, Campaign 3 from 11/2026 to 02/2027: crawl4ai of `waterservices.usgs.gov` and the decommission blog. Verified.
- USGS v1 `daily` returns 200, and the key header example is 1000: `curl -w %{http_code}` plus a crawl4ai of the keys doc. Verified.
  - Correction: the first probe used `/v0/`. This file now cites the v1 URL named in the migration guide.
- GHCN file sizes (2024, 2025, 2026) and NCEI per-station data through 09/22/2026: `curl -sI`, and `curl ... | tail -2`. Verified.
  - Correction: the first draft only had 2025 and 2026. 2024 was added.

### Code and doc facts

- Stale-after dates:
  - FEMA 01/11/2027 and HURDAT2 11/30/2027: `check_freshness.py:362-363` formula, plus a Python date calculation.
  - storm 11/09/2026, usgs 11/19/2026 and ghcn 11/04/2026 were computed the same way and are not used as claims above.
  - Verified.
- Issue dedupe is one per workflow: `log-cron-incident.mjs:217-227`. Verified.
- Auto-resolve only on a schedule: `log-cron-incident.mjs:131`. Verified.
- TRANSIENT regex lacks 5xx: `classify-cron-failure.mjs:199`. Verified.
- 103 tests pass (9 + 11 + 40 + 8 + 20 + 15): `pytest -q` plus a per-path `--collect-only`. Verified.
- All code `file:line` citations: re-derived with a per-file `grep -n`.
  - Correction: the first draft used line numbers from a multi-file `cat -n`, offset by the earlier files' lengths. Every citation in §2–§7 now carries per-file numbers, for example FEMA's swallow at `pipeline.py:12-15`, not 11-18.
- hurricane-tracks-fl was refined 07/15/2026: `sed -n 1,12p brains/hurricane-tracks-fl.md`. Verified.
- daily-rebuild last ran 08/12/2026: `gh run list --workflow daily-rebuild.yml --limit 5`. Verified.
- The FEMA 07/15 load has no GHA run: the FEMA run list has no run between 07/14 and 08/02. Could not verify its origin; marked "origin needs review".
- The FEMA 05/26 failure class: the log expired (HTTP 410). Could not verify from the log; cited `docs/cron-rebuild-failures.md:65` instead.

- Registry and resources citations after the first write: re-checked with `grep -n` on `ingest/cadence_registry.yaml`, `ingest/pipelines/fema/resources.py` and `ingest/pipelines/noaa_ghcn_rainfall/resources.py`. Corrected 6 citations: fema guards to `:124-157`, the usgs registry block to `:403-408`, the ghcn ceiling to `:1666`, the fema ceiling to `:804`, the fema comment to `:796`, and the ghcn drop warning to `resources.py:123-143` with the floor note at `:1653-1660`.
- A HURDAT2 download size in plan item 4 was never measured, because the log expired. Replaced it with the measured run time.

- Plan item 4's HURDAT2 floor: the first draft placed it before the inventory upsert, but `row_count` is read after the `COPY` overwrite (`hurdat2_fl/pipeline.py:151`, `:170-173`). Corrected to count before `COPY`.
- Plan item 13's regex: the first draft's `50[234]` would match comma-formatted counts such as "1,502 rows", and a false TRANSIENT auto-retries real defects (`classify-cron-failure.mjs:193-197`). Corrected to wording-keyed `50[234] Server Error|...`, which matches both family logs (`503 Server Error:` from USGS, `503 Server Error: Service Unavailable` from FEMA).
- Plan item 3's rename option: removed. The incident key is derived from the file name (`.github/scripts/lib/cron-run.mjs:11-17`), and both watch lists match on `name:`.
- GHCN per-station parity: `curl '...access/services/data/v1?dataset=daily-summaries&stations=USW00012835&dataTypes=PRCP&startDate=2025-01-01&endDate=2025-12-31&format=csv&includeAttributes=true&units=metric'`, with Q-flagged days dropped, gives 365 days and 38.26 in. That equals the lake row. Verified.

Totals: 36 claims checked (the top-level bullets in this section minus the 2 method bullets), 10 corrections applied (the fema green, the usgs county codes, the usgs v0/v1 URL, the GHCN 2024 size, the per-file line numbers, the registry/resources citations, the unmeasured HURDAT2 size, the HURDAT2 floor order, the classifier regex, the rename option), 2 could not be verified (the FEMA 07/15 origin and the 05/26 FEMA log).

## 12. Questions for the operator

1. A free USGS Water Data API key is required for the WaterServices migration (item 10). api.data.gov emails the key to whoever signs up at `https://api.waterdata.usgs.gov/signup`. Which address should own it? Once you have it, set it with `gh secret set USGS_WATERDATA_API_KEY`.
2. The USGS lake copy is statewide, 4,744,886 rows, while the product serves one Caloosahatchee number from 7 gauges. Should the stored copy shrink to Lee, Collier, Hendry and the Caloosahatchee basin during the migration (item 11)? Or do you want the statewide water history kept for a future product?
