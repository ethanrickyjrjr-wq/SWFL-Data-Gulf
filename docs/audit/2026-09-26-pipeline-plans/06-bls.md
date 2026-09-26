# 06 bls — pipeline plan (09/26/2026)

Family 06 is the five BLS registry entries: bls_ppi, bls_laus, bls_qcew, bls_oews_swfl and bls_oews_swfl_tier1. They run on four workflows and feed three brains: cre-swfl, macro-swfl and labor-demand-swfl. All three feed master. All four ingest workflows are green on their latest run, and every one is a deterministic public-API fetch with no model in the ingest or in any served number. The one model touchpoint is downstream: cre-swfl's triage and synthesis agents read the 12 PPI fragments as context (§10, plan item 16). The headline is a served wrong number. bls_qcew's consumer treats the second-newest quarter in the table as "prior year". The table now holds four non-contiguous quarters, so www.swfldatagulf.com/r/macro-swfl currently shows Lee private-sector wage "YoY" as +4.86% when the true same-quarter figure is +1.49%, Collier as +10.52% against a true +4.08%, and both counties' employment direction as "rising" when the true YoY is negative. Every monitor reports it green. Verdicts: bls_qcew REPAIR, bls_ppi / bls_laus / bls_oews_swfl IMPROVE (mostly cron timing against the real BLS release calendars), bls_oews_swfl_tier1 RETIRE (ASK-FIRST). Nothing in this family belongs on the Fedora box.

## 1. Scope

Five pipelines (registry names, `ingest/cadence_registry.yaml`), four workflow files, four landing places, three consumer brains.

- bls_ppi — registry `ingest/cadence_registry.yaml:499`. Workflow `.github/workflows/ingest-bls-ppi.yml`. Lands Tier-1 Parquet `lake-tier1/macro/bls_ppi/{YYYY-MM}.parquet` (`ingest/pipelines/bls_ppi/pipeline.py:37`) plus a `data_lake._tier1_inventory` row. Consumer `refinery/sources/bls-ppi-source.mts:137` → `refinery/packs/cre-swfl.mts:42,2144` → master (`refinery/packs/master.mts:290`, critical).
- bls_oews_swfl_tier1 — registry `ingest/cadence_registry.yaml:528`. Workflow `.github/workflows/bls-oews-annual.yml`, shared with bls_oews_swfl. Lands NDJSON `lake-tier1/labor/bls_oews_swfl/{YYYY}.ndjson` (`ingest/pipelines/bls_oews_swfl/pipeline.py:39-40,63-74`). Consumer: none. Only the writer's own docstring names the path (`_RESEARCH/audits/2026-07-18-data-consolidation/P7-corpse-deletelist.md:238-241`). My grep for `labor/bls_oews` over refinery/lib/app/scripts/components returned no reader either.
- bls_laus — registry `ingest/cadence_registry.yaml:633`. Workflow `.github/workflows/bls-laus-monthly.yml`. Lands `data_lake.bls_laus` (dlt merge, `ingest/pipelines/bls_laus/resources.py:44-49`). Consumer `refinery/sources/bls-laus-source.mts` → `refinery/packs/macro-swfl.mts:11,675` → master (`master.mts:293`, critical). Operator-run corridor tools also read it: `refinery/tools/build-corridor-fact-pack.mts:140,485`, `refinery/tools/run-corridor-character-preview.mts:208-222` and `refinery/tools/verify-corridor-chart-blocks.mts:94-108`.
- bls_qcew — registry `ingest/cadence_registry.yaml:653`. Workflow `.github/workflows/bls-qcew-quarterly.yml`. Lands `data_lake.bls_qcew` (dlt merge, `ingest/pipelines/bls_qcew/resources.py:51-56`). Consumer `refinery/sources/bls-qcew-source.mts` → `refinery/packs/macro-swfl.mts:13,676` → master (`master.mts:293`, critical).
- bls_oews_swfl — registry `ingest/cadence_registry.yaml:705`. Workflow `.github/workflows/bls-oews-annual.yml`. Lands `data_lake.bls_oews_swfl` (dlt merge, `ingest/pipelines/bls_oews_swfl/resources.py:130-135`). Consumer `refinery/sources/bls-oews-source.mts` → `refinery/packs/labor-demand-swfl.mts:9,288` → master (`master.mts:306`, non-critical).

Count: 5 pipelines, 4 workflows, 3 Postgres tables plus 2 Storage prefixes, 3 consumer brains, and 1 pipeline with no consumer (bls_oews_swfl_tier1).

Checked non-readers (second-Opus grep, 09/26: `grep -rln --include=*.mts --include=*.ts --include=*.tsx --include=*.mjs --include=*.js "<table>" refinery/sources refinery/packs lib app refinery/tools refinery/lib scripts components`). `lib/` and `app/` return no hit for any of the five. `refinery/packs/macro-florida.mts:399` names bls_laus only in a TTL comment. `scripts/graphify-app-nodes.mjs:601` names it only in a comment. `scripts/lake-probe.mts:17` lists bls_qcew in an operator row-count probe, and no brain consumes that output. `scripts/notion-sync.mjs` holds label strings (P11). None of these is a consumer.

## 2. What is being brought in

Live queries were run 09/26/2026 with Bun.SQL, read-only, using the connection approach of `scripts/apply-fdic-sod-view.mts:15-27`. The exact SQL is given inline at each point.

### bls_ppi
- Source: BLS Public Data API v2 POST `https://api.bls.gov/publicAPI/v2/timeseries/data/` (`ingest/pipelines/bls_ppi/constants.py:34`), keyed with `BLS_API_KEY` when present (`resources.py:14,21-22`).
- Fields: series_id, year, period, period_name, value (`resources.py:40-47`). BLS footnotes (including "Preliminary.") are dropped.
- Geography: national. These are industry indexes with no county grain. There are 12 series, NAICS 236/238 nonresidential building (`constants.py:14-27`). The window is a rolling 10 years (`constants.py:30-32`).
- Cadence: registry 30 days (`cadence_registry.yaml:503`). Cron `0 14 16 * *` (`ingest-bls-ppi.yml:7`).
- Live volume: run 35131931002 logged `bls_ppi: 1392 rows fetched.` and `uploaded 1392 rows to lake-tier1/macro/bls_ppi/2026-09.parquet`. That is 12 series × 116 months.
- Freshness: `select id, vintage, byte_size, pack_id, max_period_end, updated_at from data_lake._tier1_inventory where path ilike '%bls%'` returned 5 PPI files, 2026-05 through 2026-09. The newest is `updated_at 2026-09-16T18:03:50Z`, `byte_size 9468`, `pack_id null`, `max_period_end null`.
- Source check 09/26: an API POST for PCU236211236211 returned latest `2026 M08 205.766` with the footnote "Preliminary. All indexes are subject to monthly revisions up to four months after original publication." The source is publishing and the lake holds its newest month.
- County coverage: not applicable (national series).

### bls_laus
- Source: the same BLS API v2 POST. One request per area, 4 measure series each (`ingest/pipelines/bls_laus/resources.py:66-77`).
- Fields: id, series_id, area_fips, measure_code, measure_label, year, period, period_name, value, footnote_codes (first footnote only, `resources.py:102-103`), `_ingested_at` (`resources.py:16-28`).
- Geography: FL state (12000), Lee (12071) and Collier (12021) (`constants.py:25-37`). Hendry is not pulled.
- Cadence: registry 30 days (`cadence_registry.yaml:637`). Cron `0 13 25 * *` (`bls-laus-monthly.yml:12`). Window: current year minus 2 through current year (`pipeline.py:8-21`).
- Live: `select count(*), max(_ingested_at), min(year*100+substr(period,2)::int), max(year*100+substr(period,2)::int), string_agg(distinct area_fips, ',') from data_lake.bls_laus` returned `376 | 2026-09-25T17:48:51Z | 202401 | 202608 | 12000,12021,12071`.
- By area (`... group by area_fips`): 12000 has 128 rows to 202608, 12021 has 124 rows to 202607, and 12071 has 124 rows to 202607.
- Null values (`select ... where value is null`): 12 rows, all `2025 M10`, footnote_codes `X`. The BLS API returns 2025-M10 as `-` with footnote "Data unavailable due to the 2025 lapse in appropriations." This is a source gap, not ours.
- Source check 09/26: API LAUCN120710000000003 latest is `2026 M07 5.2 Preliminary.`, which matches the table's 202607.
- County coverage: Lee yes, Collier yes, Hendry no.

### bls_qcew
- Source: the BLS QCEW open-data CSV slice `https://data.bls.gov/cew/data/api/{year}/{qtr}/area/{fips}.csv` (`ingest/pipelines/bls_qcew/constants.py:1`), with a contact User-Agent (`constants.py:11`) and no key.
- Fields: 14 data columns plus `_source_url` and `_ingested_at` (`resources.py:11-28`). Filtered to industry_code "10" (all industries) with all ownership codes (`resources.py:74`).
- Geography: FL 12000, Lee 12071 and Collier 12021 (`constants.py:14-18`). Hendry is not pulled.
- Cadence: registry 90 days (`cadence_registry.yaml:657`). Cron `0 13 9 2,5,8,11 *` (`bls-qcew-quarterly.yml:8`). Each run fetches exactly 2 quarters: the latest detected quarter and the same quarter one year back (`pipeline.py:71-75`).
- Live: `select count(*), max(_ingested_at), min(year||'Q'||qtr), max(year||'Q'||qtr), string_agg(distinct area_fips, ',') from data_lake.bls_qcew` returned `64 | 2026-09-20T17:26:38Z | 2024Q3 | 2026Q1 | 12000,12021,12071`.
- By quarter (`group by year, qtr, area_fips`): the table holds 2024Q3, 2025Q1, 2025Q3 and 2026Q1, with 6 rows for FL and 5 each for Lee and Collier in every quarter. 2024Q3 and 2025Q3 were ingested 2026-05-26 and 2025Q1 and 2026Q1 on 2026-09-20. 2024Q4, 2025Q2 and 2025Q4 are absent.
- Columns (`information_schema.columns`): id, area_fips, own_code, industry_code, agglvl_code, size_code, year, qtr, qtrly_estabs, month1_emplvl, month2_emplvl, month3_emplvl, total_qtrly_wages, avg_wkly_wage, _source_url, _ingested_at, _dlt_load_id, _dlt_id. The three phantom `*_title` columns are gone, so `migrations/20260920_bls_qcew_drop_phantom_title_columns.sql` has been applied.
- Source check: the crawl4ai read of `https://www.bls.gov/schedule/news_release/cew.htm` (lines 233-237) shows Q3 2025 released Mar 10 2026, Q4 2025 Jun 02 2026, Q1 2026 Aug 28 2026 and Q2 2026 due Dec 02 2026. The lake holds the newest published quarter, 2026Q1.
- County coverage: Lee yes, Collier yes, Hendry no. BLS publishes Hendry: `curl .../2026/1/area/12051.csv` returned 200 with 916 rows.

### bls_oews_swfl
- Source: the BLS OEWS metro zip `https://www.bls.gov/oes/special-requests/oesm{YY}ma.zip` (`ingest/pipelines/bls_oews_swfl/constants.py:15`, `resources.py:70-76`).
- Fields: 15 columns (`resources.py:29-45`). From the file the pipeline keeps TOT_EMP, JOBS_1000, LOC_QUOTIENT, H_MEDIAN and A_MEDIAN for O_GROUP='major' rows only (`resources.py:88`).
- Geography: MSA 15980 (Cape Coral-Fort Myers, which is Lee) and MSA 34940 (Naples-Marco Island, which is Collier) (`constants.py:18-21`).
- Cadence: registry 365 days (`cadence_registry.yaml:709`). Cron `0 14 15 5 *` (`bls-oews-annual.yml:7`). The year is hard-coded: `CURRENT_OEWS_YEAR = 2025` (`constants.py:26`) and dispatch default `"2025"` (`bls-oews-annual.yml:13`).
- Live: `select count(*), max(_ingested_at), min(ref_year), max(ref_year), string_agg(distinct area_code, ',') from data_lake.bls_oews_swfl` returned `220 | 2026-07-14T17:36:27Z | 2021 | 2025 | 15980,34940`. That is 22 rows per MSA per year for 2021-2025 (`group by ref_year, area_code`).
- dlt: `select schema_name, max(inserted_at), count(*) from data_lake._dlt_loads where schema_name in (...) and status=0 group by 1` returned bls_oews_swfl `2026-07-14T17:36:28Z` (6 loads).
- Source check: crawl4ai of `https://www.bls.gov/oes/tables.htm` shows "May 2025" as the newest release (line 202). A live GET of `oesm25ma.zip` returned 200, 39,932,338 bytes, `Last-Modified: Fri, 15 May 2026 13:24:05 GMT`.
- County coverage: Lee and Collier (single-county MSAs, per P6 research `_RESEARCH/audits/2026-07-18-data-consolidation/P6-master-doublevotes.md:91`). Hendry is not in any MSA. The same zip's BOS file lists FL nonmetro areas 1200003 "South Florida nonmetropolitan area" and 1200006 "North Florida nonmetropolitan area". I did not verify which of those Hendry belongs to.

### bls_oews_swfl_tier1
- Source, fields, geography and cadence: identical to bls_oews_swfl, since it is the same run (`pipeline.py:63-74` writes Tier-1 before the dlt write at `:77-84`).
- Live: `data_lake._tier1_inventory` has 5 rows `lake-tier1/labor/bls_oews_swfl/2021..2025.ndjson`. Byte sizes run 19,828 to 20,055, `pack_id labor-demand-swfl`, newest `updated_at 2026-07-14T17:35:52Z`.
- County coverage: same as bls_oews_swfl.

## 3. What is working

### bls_ppi
- `gh run list --workflow ingest-bls-ppi.yml --limit 15` returned 8 runs: 7 success and 1 failure. The newest green is 35131931002 (schedule, 09/16/2026, 66 s by startedAt/updatedAt). Scheduled greens: 27639279982 (06/16), 31952775445 (08/16) and 35131931002 (09/16).
- `--dry-run` is genuinely read-only: `pipeline.py:30-34` returns before `upload_parquet`.
- Tests: `ingest/.venv/Scripts/python.exe -m pytest -q ingest/tests/pipelines/bls_laus ingest/tests/pipelines/bls_ppi ingest/tests/pipelines/bls_qcew` gave `36 passed, 1 skipped`. The skip is the live integration test at `ingest/tests/pipelines/bls_ppi/test_pipeline.py:5`. `bun test refinery/sources/bls-ppi-source.test.mts refinery/packs/labor-demand-swfl.test.mts refinery/packs/macro-swfl-fdic.test.mts` gave `13 pass, 0 fail`.
- The consumer maps 8 of 12 series deterministically (`refinery/packs/cre-swfl.mts:1572-1608`). The mislabel from the 07/11 ledger (`docs/audit/2026-07-11-pipeline-problems/02-known-problems-ledger.md:91`) was fixed in commit 0559c370 and broadened in 0e2ec85e (`git log -- ingest/pipelines/bls_ppi`).

### bls_laus
- `gh run list --workflow bls-laus-monthly.yml --limit 15` returned 6 runs, all 6 success. The newest is 36169356789 (schedule, 09/25/2026, 68 s), with 4 scheduled greens in a row (06/25, 07/25, 08/25, 09/25).
- The table matches the source's newest month (Lee 202607, confirmed by API above).
- The consumer anchors YoY correctly to Lee's newest month and the same month one year back (`refinery/sources/bls-laus-source.mts:158-160`).
- Dry-run is read-only (`pipeline.py:48-57` lists the resource, no dlt). Tests are in the pytest run above (`ingest/tests/pipelines/bls_laus/test_dry_run.py`, `test_resources.py`).

### bls_qcew
- `gh run list --workflow bls-qcew-quarterly.yml --limit 15` returned 6 runs: 4 success, 2 failure. The newest green is 35525818513 (workflow_dispatch, 09/20/2026, 79 s). Its log shows `if [ "false" = "true" ]` then `Ingesting BLS QCEW: 2026-Q1 + 2025-Q1 for 3 areas... BLS QCEW pipeline complete.`, which is a real write, not a dry run.
- The 08/09 quarter-detection failure is fixed in code: commits f2d1bfb3 and 962e2d9e (09/20) add the contact UA, a per-probe error string (`pipeline.py:33-65`) and an honored `--dry-run` (`pipeline.py:92-112`).
- The phantom-column migration has landed (see the column list in §2).
- Tests: `ingest/tests/pipelines/bls_qcew/test_pipeline.py`, `test_resources.py` (inside the 36 passed above).

### bls_oews_swfl
- `gh run list --workflow bls-oews-annual.yml --limit 15` returned 2 runs, both success. 29353788560 (dispatch, dry-run) logged `bls_oews_swfl dry-run: 44 rows for 2025.`. 29354318367 (dispatch, 07/14/2026, 136 s) logged `Tier-2 complete -- 44 rows for 2025 -> data_lake.bls_oews_swfl`.
- Dry-run is proven read-only by 29353788560 and `pipeline.py:55-61`.
- The newest release (May 2025) is in the table. No suppressed employment today: `select ref_year, area_code, count(*) filter (where tot_emp is null), sum(tot_emp) from data_lake.bls_oews_swfl group by 1,2` returned 0 nulls in all 10 groups.
- Consumer test: `refinery/packs/labor-demand-swfl.test.mts`, inside the 13 bun passes.

### bls_oews_swfl_tier1
- It writes on every real OEWS run: run 29354318367 logged `Tier-1 uploaded -> lake-tier1/labor/bls_oews_swfl/2025.ndjson (19,828 bytes)`.
- The doctor lists it `FRESH | NOT_APPLICABLE | NO_CONTRACT | GREEN` (freshness-probe-daily run 36259690113, doctor step).

## 4. Problems

P1 — bls_qcew: the served "YoY" compares Q1 with Q3, and the direction flips.
- Symptom: `curl -s https://www.swfldatagulf.com/r/macro-swfl` contains `4.86` (8 hits), `10.52` (6), `2025-Q3` (22) and `+4.9% YoY` (3). `brains/macro-swfl.md:160-161` shows `"label": "Lee County Private-Sector Avg Weekly Wage YoY % (2026-Q1 vs 2025-Q3)", "value": 4.86`. `:198-199` shows Collier `10.52`. `:219` and `:238` show employment `"direction": "rising"`. `:61` has the conclusion "Private-sector wages in Lee County ran $1,230/wk in 2026-Q1 (+4.9% YoY)".
- Evidence: `select area_fips, year, qtr, avg_wkly_wage, month3_emplvl from data_lake.bls_qcew where own_code='5' and area_fips in ('12071','12021') order by 1,2,3` returned Lee 2025Q1 1212/277093, 2025Q3 1173/264065, 2026Q1 1230/275732 and Collier 2025Q1 1373/162996, 2025Q3 1293/151229, 2026Q1 1429/161740. Running `python -c "r=lambda a,b: round((a-b)/b*100,2); print(r(1230,1173), r(1230,1212), r(275732,264065), r(275732,277093), r(1429,1293), r(1429,1373), r(161740,151229), r(161740,162996))"` gives: Lee wage served 4.86 vs true 1.49, Lee employment served 4.42 vs true -0.49, Collier wage served 10.52 vs true 4.08, Collier employment served 6.95 vs true -0.77. With the ±1.0 threshold at `refinery/packs/macro-swfl.mts:142-146`, true employment is "stable" in both counties. The page serves "rising".
- Root cause: `refinery/sources/bls-qcew-source.mts:111-113` sets prior = `qtrs[qtrs.length - 2]`, the second-newest quarter present. That is only correct if the table holds exactly the latest quarter and the same quarter a year back. It does not hold that: dlt `write_disposition="merge"` (`ingest/pipelines/bls_qcew/resources.py:53`) keeps every quarter ever loaded, and the 05/26 and 09/20 runs loaded different quarter pairs. Tests stay green because the fixture holds exactly two quarters. `python -c "...json.load(open('refinery/__fixtures__/bls-qcew.sample.json'))..."` returned 30 records in quarters `(2024,'3'),(2025,'3')`.
- Same shape elsewhere (RULE 0.5c scope): `refinery/sources/bls-oews-source.mts:147-149` also takes `years[1]` as prior. It is correct today because 2021-2025 are contiguous, but it will be wrong the first time a survey year is skipped. `bls-laus-source.mts:158-160` is correct (explicit year-1). Count: 2 sites, 1 live.
- Severity: blocks a served number (macro-swfl key_metrics and the conclusion, a critical master input at `master.mts:293`).
- First seen: 09/20/2026. Runs 35490124930 and 35525818513 added the 2025Q1/2026Q1 pair to a table already holding 2024Q3/2025Q3. It has been served since brain v39: `git show 525da974:brains/macro-swfl.md` (daily rebuild, 09/20/2026 09:24 UTC, token `SWFL-7421-v39-20260920`) already carries `4.86` and `2025-Q3`, and v40/v41 (commit 8853f7c0, 09/22) carry them too. The live file is v41 (`brains/macro-swfl.md:1`).

P2 — bls_qcew: the cron misses every release by about two months, and the table has holes.
- Symptom: 2024Q4, 2025Q2 and 2025Q4 are absent (§2 by-quarter query). The cron `0 13 9 2,5,8,11 *` rests on the comment "release ~day 6-7 of Feb/May/Aug/Nov" (`bls-qcew-quarterly.yml:6`), but the BLS calendar (cew.htm lines 234-237) gives Mar 10, Jun 02, Aug 28 and Dec 02. `python` date math: days from release to the next cron fire are 60 (Q3-25), 68 (Q4-25), 73 (Q1-26) and 69 (Q2-26).
- Root cause: the cron slot at `bls-qcew-quarterly.yml:8` doesn't match the release calendar, plus the fixed 2-quarter fetch at `pipeline.py:75`. A missed or failed run (08/09) means that quarter is never fetched. 2025Q4 (released Jun 02) was never loaded.
- Severity: blocks a consumer. Once P1 is fixed, the YoY pair for a given quarter can be missing and go null.
- First seen: 08/09/2026, run 31316526508, `RuntimeError: BLS QCEW: could not find latest available quarter within 6 back-steps` (issue #176, classifier label `UNKNOWN`). The commit f2d1bfb3 message states the 08/09 cause is "UNPROVEN - all quarters 200 today with or without UA".

P3 — bls_laus: the cron lands county data 23-28 days after BLS publishes it.
- Symptom: county LAUS ships with the metro release, not the state release the cron comment cites (`bls-laus-monthly.yml:6-10`). The crawl4ai read of `https://www.bls.gov/schedule/news_release/metro.htm` (lines 241-245) gives Sep 02, Sep 30, Oct 28, Dec 02 and Dec 30, all Wednesdays (`python strftime('%a')`). Against the day-25 cron: July data 23 days late, August 25, September 28, October 23.
- Root cause: `bls-laus-monthly.yml:12` is aimed at the state-release calendar (laus.htm). The previous day-4 cron was actually closer for counties.
- Served consequence, verified 09/26: `brains/macro-swfl.md:43,61,75` serve `2026-M06`. The lake has held Lee 202607 since the 09/25 run (§2 by-area query), and BLS published July on 09/02 (metro.htm line 241). The page therefore trails the publisher by two layers: the cron, then the macro-swfl rebuild (v41 was built 09/22). The cron fixes in items 4, 5 and 8 move only the lake. Their proofs query `data_lake`, not the page, and the page follows only when macro-swfl is rebuilt (item 2's route).
- Severity: blocks a consumer (macro-swfl reads a month stale for most of each month).
- First seen: the 05/27/2026 cron change (`docs/standards/pipeline-freshness.md:87` table row "Fixed 2026-05-27").

P4 — bls_laus / macro-swfl: the October 2025 source gap will produce a silent "neutral" vote.
- Symptom: 12 rows at 2025-M10 are null (§2). When 2026-M10 becomes the reference month (county release Dec 02 2026, metro.htm line 244), `yoyDelta(rate, null)` returns null (`bls-laus-source.mts:98-101`). `lausDirection(null)` returns "stable" (`macro-swfl.mts:135-136`), and the FL fallback is also null (same footnote X on 12000). So macro-swfl would vote neutral at magnitude 0 (`macro-swfl.mts:580-581,657`) with no caveat.
- Root cause: `macro-swfl.mts:135-136` treats "no comparison possible" the same as "no change".
- Severity: blocks a served number for one reference month (the direction of a critical master input).
- First seen: this audit, from the 12 null rows plus the source footnote. It has not fired yet.

P5 — bls_ppi: the cron misses late-month releases and there is no retry.
- Symptom: run 29512259305 (07/16/2026) failed with `requests.exceptions.ReadTimeout: HTTPSConnectionPool(host='api.bls.gov', port=443): Read timed out. (read timeout=30)` at `resources.py:24` (issue #127, classifier `TRANSIENT`, closed). Separately, the PPI calendar (ppi.htm lines 233-245) shows releases on Jan 30, Feb 27 and Mar 18 2026. `python` date math puts those at 17, 17 and 29 days before the day-16 cron picks them up.
- Root cause: `resources.py:24-30` makes a single `requests.post` with no retry. The cron `ingest-bls-ppi.yml:7` assumes "~15th".
- Severity: cosmetic most months, and blocks a consumer (stale by up to a month) in late-release months.
- First seen: 07/16/2026 (run list).

P6 — bls_ppi: the consumer takes MAX across vintages, not the newest vintage.
- Symptom: each monthly run writes a new file holding the full 10-year window (`pipeline.py:37`). The reader takes `MAX(value)` per (series, year, period) across every file (`refinery/sources/bls-ppi-source.mts:137-143`). BLS revises for up to four months (API footnote above). A downward revision therefore leaves the stale higher pre-revision value in place, including for the 6-month-back comparator used in direction (`bls-ppi-source.mts:120-133`).
- Root cause: `bls-ppi-source.mts:139`. The comment at `:17-19` says MAX is "deterministic", but it isn't "latest".
- Measured 09/26 by the second Opus. A read-only GET of the 5 files (`{SUPABASE_URL}/storage/v1/object/lake-tier1/macro/bls_ppi/2026-0{5..9}.parquet`, pyarrow) compared MAX against the newest file per (series, year, period). Result: `keys 1392 max!=newest 33`, all in 2026-M04..M07 (M04 7, M05 8, M06 9, M07 9), across 11 of the 12 series. Example: PCU23822X23822X 2026-M06 newest 182.396 vs MAX 182.603.
- Served impact today is 0. The headline month M08 exists only in the 2026-09 file, and today's 6-back direction comparator is M02, which is not in the differing set (`bls-ppi-source.mts:120-133`). From reference month 2026-M10 the comparator becomes M04, where 7 series hold the stale MAX. The deltas are about 0.02-0.1%, far inside the ±2% direction band, so no served direction flips on today's data.
- Severity: cosmetic today (0 served values differ), latent from ref 2026-M10.
- First seen: design, 07/17/2026 broadening (0e2ec85e).

P7 — bls_oews_swfl: the 2027 cron will re-pull 2025 and never 2026.
- Symptom: on a scheduled run the workflow passes no `--year` (`bls-oews-annual.yml:53-57`, inputs empty on schedule). `main()` defaults to `CURRENT_OEWS_YEAR = 2025` (`constants.py:26`, `pipeline.py:93-97`). The registry depends on a human remembering to bump it (`cadence_registry.yaml:541,717`). The cron also fires only once a year (`bls-oews-annual.yml:7`). The May 2025 zip's `Last-Modified` was 15 May 2026 13:24 GMT, only 36 minutes before a 14:00 UTC fire, so one late publish loses a whole year.
- Root cause: `constants.py:26` together with `bls-oews-annual.yml:7,13`.
- Severity: blocks a consumer from 05/2027 (labor-demand-swfl stays on May 2025).
- First seen: this audit (the code has been in this shape since d05b501c, 05/30/2026).

P8 — bls_oews_swfl: every year's zip is downloaded twice.
- Symptom: `pipeline.py:46` downloads to count and archive, then `resources.py:138` downloads again for the dlt resource. That is 2 × 39,932,338 bytes per year. If BLS replaces the file between the two GETs, Tier-1 and Tier-2 can disagree.
- Severity: cosmetic.

P9 — bls_oews_swfl_tier1: an archive nobody reads.
- Symptom: zero readers (§1). The registry claims a reader it does not have: `consuming_pack: labor-demand-swfl` (`cadence_registry.yaml:530`), and the writer stamps `pack_id="labor-demand-swfl"` on every inventory row (`ingest/pipelines/bls_oews_swfl/pipeline.py:71`, live rows in §2). The code shows labor-demand-swfl reads only the Postgres table (`refinery/packs/labor-demand-swfl.mts:288` → `bls-oews-source.mts`). Consumer verified none, registry claim needs review. The entry also drifts on its own, for example `expected_rows_min: 198` at `cadence_registry.yaml:536` (corrected from `:535` by the second Opus, `sed -n 533,537p`) on a tier-1 lane, where the volume check is skipped per the registry header at `:30`.
- Severity: cosmetic. First seen: P7 corpse list, 07/18/2026.

P10 — monitoring shows false green for the whole family.
- Symptom: freshness-probe-daily run 36259690113 (09/26) doctor table shows `bls_laus | table | FRESH | OK | NO_CONTRACT | GREEN`, the same for bls_oews_swfl and bls_qcew, and `tier-1 | FRESH | NOT_APPLICABLE | NO_CONTRACT | GREEN` for bls_ppi and bls_oews_swfl_tier1 (`gh run view 36259690113 --log | grep -i bls_`). bls_qcew is green while P1 serves wrong numbers and P2 leaves quarter holes.
- Root cause: freshness is load time (`_dlt_loads`), not source period (`ingest/scripts/check_freshness.py:241-290`). Volume floors are loose (`expected_rows_min: 28` against 64 rows at `cadence_registry.yaml:660`). There is no content contract, so Content reads NO_CONTRACT in `ingest/scripts/doctor.py:135-141`.
- Severity: blocks a served number (it is the reason P1 went unseen). First seen: 09/26/2026 (this audit).

P11 — stale claims in registry, docs and citations. The tables and code are verified; these statements need review.
- `cadence_registry.yaml:640,644` says LAUS has 328 rows (live 376). `:660,664` says QCEW has 32 (live 64). `:641` says "Verified: MAX(inserted_at) = 2026-05-25", and `:661` says "2026-05-18".
- `docs/standards/data-inventory.md:113-114` says 364 and 32.
- `docs/standards/data-roots.md:1615` says QCEW holds "latest quarter + same quarter prior-year" (live: 4 quarters). The master citations are stale: `:1585` cites master 283 (live 290), `:1601` cites 299 (live 306), and `:1609` and `:1617` cite 286 (live 293). `:1609` and `:1617` also cite `macro-swfl.mts:537`, where the live `sources:` block is at `:673`. `:1585` cites `cre-swfl.mts:2125`, where the live sources block runs to `blsPpiSource` at `:2144` (`sed -n 1580,1620p docs/standards/data-roots.md | grep -o -E "(master|macro-swfl|labor-demand-swfl|cre-swfl)\.mts:[0-9]+"`).
- `refinery/sources/bls-qcew-source.mts:267` citation says ".json" and "merge-tracked 2 quarters". The pipeline uses .csv and the table holds 4 quarters.
- `scripts/notion-sync.mjs:1341` says "data_lake.bls_qcew — Brain: sector-credit-swfl" (the real consumer is macro-swfl).
- `wiki/pipeline-census.md:63` says QCEW "broken since 08/09". Dispatches on 09/20 are green.
- Severity: cosmetic, except the served citation string (P1 family).

P12 — noise: GitHub issue #176 stays open after the fix.
- Symptom: `gh issue list --label cron-failure --state all --search "bls OR ..."` shows #176 `[cron-failure:bls-qcew-quarterly] UNKNOWN` OPEN since 08/09.
- Root cause: auto-resolve fires only on a scheduled or push success (`.github/workflows/log-cron-incident.yml` maybe_auto_resolve `if:`). The fix was proven by dispatch, and the next scheduled QCEW run is 11/09.
- Severity: cosmetic.

P13 — bls_laus / macro-swfl: the served YoY citation names the wrong prior-year month (found by the second Opus).
- Symptom: `brains/macro-swfl.md:132` serves `"citation": "BLS LAUS LAUCN120710000000003, YoY delta (prior-year 2026-M06 → 2026-M06) = +0.8pp"`. The prior-year month is 2025-M06.
- Root cause: `refinery/packs/macro-swfl.mts:410` interpolates `${refMonth}` on both sides of the arrow. The math is right, since `bls-laus-source.mts:159` uses `refYear - 1`. Only the label is wrong.
- Scope (RULE 0.5c): `grep -n -E '\$\{refMonth\}|prior.*\$\{|\$\{.*[Pp]rior'` over macro-swfl, labor-demand-swfl, cre-swfl, `refinery/sources/bls-*.mts` and `build-corridor-fact-pack.mts` found 1 site with this shape. The QCEW labels at `macro-swfl.mts:442,478` use `qcew.prior_quarter` and become right with item 1.
- Severity: cosmetic, but it is a served citation string. First seen: this audit.

## 5. What is missing

- bls_qcew vs source_ceiling (`cadence_registry.yaml:667-671`): the same CSV carries industry-sector detail. The 2026Q1 slices returned `12071 1977 rows; industry_code==10: 5`, `12021 1802 rows; 5` and `12051 916 rows; 5`, with 42 columns each. We keep 5 rows per county, plus 6 for FL. Missing quarters 2024Q4, 2025Q2 and 2025Q4 all return 200 at the source (`curl .../2024/4/area/12071.csv` 200 351937, `2025/2` 200 352053, `2025/4` 200 351105). History back to 2014Q1 is available (`2014/1` 200 331992). Hendry (12051) is published and not pulled.
- bls_qcew vs consumer: government own_codes 1/2/3 are stored, but only own_code 5 and 0 are read (`bls-qcew-source.mts:123-125`). Sector detail has no consumer today. Landing it without one would create a dark root, and landing it before the consumer filters `industry_code='10'` would break P1's fix, because the consumer queries by area only (`bls-qcew-source.mts:176-179`).
- bls_laus vs source_ceiling: the registry says "None of these publish finer than what we already pull" (`cadence_registry.yaml:648`) and `wiki/pipeline-census.md:170` lists LAUS as a vendor ceiling. That needs review: Hendry is published (API LAUCN120510000000003 returned `2026 M07 6.0`) and not pulled. History before 2024 is outside our window (`pipeline.py:19-20`). I did not verify how far back the API goes live.
- bls_oews_swfl vs the source's own ceiling (registry `:724-725` names only CES/SAE): the May 2025 MSA file has 32 columns. We drop EMP_PRSE, PCT_TOTAL, PCT_RPT, H_MEAN, A_MEAN, MEAN_PRSE, the H_PCT10/25/75/90 and A_PCT10/25/75/90 percentiles, ANNUAL and HOURLY. We drop the detailed occupations: `groupby(['AREA','O_GROUP'])` gave 15980 detailed 436 / major 22 / total 1 and 34940 detailed 350 / major 22 / total 1. We also drop the 'total' row, and the consumer rebuilds total employment by summing the majors (`bls-oews-source.mts:114-117`).
- CES/SAE monthly nonfarm employment (the registry ceiling at `cadence_registry.yaml:548,725`) is verified live. API `SMU12159800000000001` returned `2026 M08 311.3` and `SMU12349400000000001` returned `2026 M08 174.5`. That is the only BLS employment series for Lee and Collier that is current to August 2026. QCEW stops at 2026Q1 and LAUS county at M07. Not pulled.
- bls_ppi vs source_ceiling: FD construction and materials indexes are named in the registry (`:520-523`). I did not re-verify them this pass. The "Preliminary." flag is available from the source (verified in the API response) and dropped at `resources.py:40-47`, so cre-swfl cannot say "preliminary".
- Consumers that should exist and do not: bls_oews_swfl_tier1 has no reader (P9). The PPI school series 236222 is ingested and unconsumed (`cadence_registry.yaml:512-515`). Its old check `bls_ppi_school_series_no_consumer` is gone in the 09/15 bankruptcy and is not resurrected here.
- Our research already names the QCEW sector gap. `_RESEARCH/data-and-ingest/2026-09-18-data-access-and-outcome-feasibility.md:63` lists the historical QCEW area/industry files as the candidate for construction, retail, accommodation/food and transportation context. `_RESEARCH/INDEX.md:472` (the 08/02 greenfield restaurants scout) names QCEW NAICS 722 as a backup source. `docs/handoff/2026-07-11-reliable-sources-findings.md` has 0 BLS hits (`grep -n -i "bls\|qcew\|laus"`), and the 07/11 known-problems ledger holds one BLS row (`:91`, fixed, §3).
- Adjacent copy in another family: `_RESEARCH/data-and-ingest/2026-07-22-lake-wire-map.md:58,126` records `fred_laus_alfred` as a Tier-1 LAUS vintage parquet with zero pack consumers. It belongs to the FRED family, and this plan does not act on it.
- data-roots: the P6 research item DUP-2, which employment authority is the headline (QCEW county count vs OEWS survey estimate), is still `[NEEDS-SIGN-OFF]` (`_RESEARCH/audits/2026-07-18-data-consolidation/P3-authority-ratification.md:184`).

## 6. Verdict per pipeline

- bls_ppi: IMPROVE. The data is current and correct at the headline. The cron misses late releases (up to 29 days) and one timeout killed a month's run. It becomes REPAIR if a newest-file-vs-MAX comparison shows any served cre-swfl PPI value differing from the newest vintage (count > 0). Measured 09/26: 0 served, with 33 stored keys differing (P6).
- bls_laus: IMPROVE. The data is complete and the consumer math is correct, but the cron serves counties 23-28 days behind the publisher, and the Oct-2025 gap will produce a silent neutral vote. It becomes GOOD ENOUGH when the days between BLS county release and landed row are ≤ 7 for three consecutive releases.
- bls_qcew: REPAIR. Served numbers on the live macro-swfl page are wrong (Lee wage "YoY" 4.86 vs 1.49, employment direction inverted), three quarters are missing, and the cron is about two months off the calendar. It becomes GOOD ENOUGH when the number of areas whose latest quarter has no same-quarter-prior-year row is 0 and the served label reads "2026-Q1 vs 2025-Q1".
- bls_oews_swfl: IMPROVE. It is correct today, but the hard-coded year means the 05/15/2027 run re-pulls 2025. It becomes GOOD ENOUGH when `max(ref_year)` = 2026 in `data_lake.bls_oews_swfl` by 07/01/2027 with no code edit.
- bls_oews_swfl_tier1: RETIRE (ASK-FIRST). It has zero readers, and the source zips stay published at bls.gov (tables.md lists May 2024 and May 2025 zips at lines 204-220). P7 (07/18) said "low-value defer, do NOT cron-disable". This plan agrees not to disable the shared cron and differs only in dropping the Tier-1 write inside it, which P7's item (b) already named (`P7-corpse-deletelist.md:248`). It is kept if any reader of `labor/bls_oews_swfl` appears (grep count > 0).

## 7. The plan

The order is a dependency chain. Items 1 → 2 → 3 must go in that order. Backfilling first does not help, because with contiguous quarters "second-newest" becomes Q4 vs Q1, which is still wrong.

1. DO — Fix the prior-period lookup in both connectors (P1 plus its same-shape twin).
   - Where: `refinery/sources/bls-qcew-source.mts:111-113` sets prior to the row with `year = latest.year - 1 AND qtr = latest.qtr`, or null if absent. Add `.eq("industry_code","10")` to the three queries at `:176-179` so later sector rows can never leak in. Correct the citation at `:267` (".csv", "same quarter prior year"). `refinery/sources/bls-oews-source.mts:147-149` sets prior to `latestYear - 1` or null.
   - Failing test first: new `refinery/sources/bls-qcew-source.test.mts` named `computeAreaSummary pairs same quarter prior year when table holds non-contiguous quarters`. Feed it the live-shaped 4-quarter rows (2024Q3, 2025Q1, 2025Q3, 2026Q1, own_code 5) and assert Lee `avg_wkly_wage_yoy_pct === 1.49`, `employment_yoy_pct === -0.49` and `prior_quarter === "2025-Q1"`. Extend `refinery/__fixtures__/bls-qcew.sample.json` to four quarters. Add the equivalent OEWS test for a gap year.
   - Lane D. Effort S.
   - Proof: `bun test refinery/sources/bls-qcew-source.test.mts` is red before the change and green after. `REFINERY_SOURCE=live bun refinery/sources/bls-qcew-source.mts` prints `"prior_quarter": "2025-Q1"`.
   - Unblocks: a correct served number. The metric names and shape are unchanged; only the values and label text are corrected.
2. DO — Rebuild macro-swfl alone.
   - Where, primary path: the route that produced the live v40/v41. Run `bun refinery/cli.mts macro-swfl --target-only`, then commit `brains/macro-swfl.md`. This is recorded in commit 8853f7c0's SESSION_LOG hunk ("wrote brains/macro-swfl.md v40"; the commit message says "brain rebuilt v41").
   - Alternative: a `daily-rebuild.yml` dispatch with `pack_id=macro-swfl` (`.github/workflows/daily-rebuild.yml:15-18,141`). Never `master --force`. I did not verify whether that dispatch trips the "hard HOLD" exit (`daily-rebuild.yml:228-229`) that has kept the chain red, so it is the fallback, not the plan.
   - Lane D. Effort S.
   - Proof: `curl -s https://www.swfldatagulf.com/r/macro-swfl | grep -c -E "4\.86|10\.52|2025-Q3"` returns 0, and `grep -n "2026-Q1 vs 2025-Q1" brains/macro-swfl.md` returns hits.
   - Unblocks: closes P1 on the served surface. Master absorbs it when the nightly chain is unstalled, which is outside this family.
3. DO — QCEW fetches a rolling window of the last 8 published quarters every run (P2).
   - Where: `ingest/pipelines/bls_qcew/pipeline.py:71-75` and the dry-run twin at `:104-105`. Walk back 8 quarters from `_find_latest_quarter()`. This fills 2024Q4, 2025Q2 and 2025Q4 on the first run, re-reads the BLS revision window every run, and keeps the same columns and the same merge key (`resources.py:31-39`), so the write shape is unchanged.
   - Test: `test_run_requests_eight_quarters` in `ingest/tests/pipelines/bls_qcew/test_pipeline.py`.
   - Lane D. Effort S.
   - Proof: `select count(distinct year||'Q'||qtr) from data_lake.bls_qcew where area_fips='12071' and (year*10+qtr::int) >= 20243` returns 7 (2024Q3 through 2026Q1). Afterwards set `expected_rows_min` (`cadence_registry.yaml:660`) to 90% of the post-run `count(*)` and `confirmed_total.value` (`:664`) to the count.
   - Unblocks: YoY pairs always present, and the P10 contract can go green.
   - A backfill to 2014Q1 is skipped: no consumer reads a long series. Add it when one does (the source serves it, verified 200).
4. DO — QCEW cron to `0 13 3,12 * *` (P2).
   - Where: `bls-qcew-quarterly.yml:5-8` (comment cites `https://www.bls.gov/schedule/news_release/cew.htm`) and the row in `docs/standards/pipeline-freshness.md` §3.
   - Slot check: in the flattened `node scripts/schedule-catalog.mjs` cron list (82 lines), no job fires at exactly 13:00 on day 3 or day 12. census_vip, the old day-12 occupant, was retired 08/11 per `cadence_registry.yaml:553-556`. The daily `17 13 * * *` tripwire-hourly.yml also runs in the 13:00 hour. It touches no BLS table, so it is no conflict. (Corrected by the second Opus: the first draft said "no other job at 13:xx".)
   - Lag by python date math: 2 days (Q3, Mar 10 → Mar 12), 1 (Q4, Jun 02 → Jun 03), 6 (Q1, Aug 28 → Sep 03), 1 (Q2, Dec 02 → Dec 03). Today's lags are 60/68/73/69.
   - Lane D. Effort S.
   - Proof: `node scripts/schedule-catalog.mjs | grep -A3 bls-qcew` shows the new cron, and on 12/03/2026 `select max(year||'Q'||qtr) from data_lake.bls_qcew` returns `2026Q2`.
5. DO — LAUS cron to `0 13 * * 4` (weekly, Thursday) (P3).
   - Where: `bls-laus-monthly.yml:4-12` (comment cites `https://www.bls.gov/schedule/news_release/metro.htm`) and the pipeline-freshness §3 row.
   - Slot check: no Thursday job in the flattened catalog (grep for `* * 4` returned nothing).
   - The metro releases from July 2026 on (metro.htm lines 239-245) fall on Wednesdays at 10:00 AM ET (14:00 UTC under EDT), so Thursday 13:00 UTC lands them about 23 hours later. Earlier 2026 releases were not all Wednesdays. January 2026 data came out Thu Apr 16 (line 235, `python strftime`), an hour after the 13:00 UTC run, and waited until Apr 23, which is 7 days. That is still inside the ≤7-day GOOD ENOUGH bar in §6, so no second weekly slot is needed. Each run is 3 POSTs (`resources.py:66-77`), and the merge is idempotent (`resources.py:44-49`).
   - Lane D. Effort S.
   - Proof: after 09/30/2026, `select max(year*100+substr(period,2)::int) from data_lake.bls_laus where area_fips='12071'` returns 202608 by 10/01/2026.
6. DO — Caveat the source gap in macro-swfl instead of casting a silent neutral vote (P4).
   - Where: `refinery/packs/macro-swfl.mts:350-356,575-581`. When the prior-year same-month rate is null and the source footnote is X, push a caveat naming "BLS published no October 2025 county data (lapse in appropriations)" and say the direction is not computable. Do not map it to "stable".
   - Failing test first: `macro-swfl emits a source-gap caveat when prior-year LAUS month is null`.
   - Lane D. Effort S. Must land before 12/02/2026 (metro.htm line 244).
   - Proof: `bun test refinery/packs/macro-swfl*.test.mts`.
7. DO — One shared retry session and contact UA for all four BLS fetchers (P5, and the robots policy).
   - Where: lift `_session()` from `ingest/duckdb_pipelines/usgs/fetch.py:20-36` into `ingest/lib/` and use it at `bls_ppi/resources.py:24`, `bls_laus/resources.py:77`, `bls_qcew/pipeline.py:42` + `resources.py:69`, and `bls_oews_swfl/resources.py:74`. Send the `BLS_HEADERS` contact UA (`bls_qcew/constants.py:7-11`) on the api.bls.gov POSTs too.
   - The helper needs a parameter, not a verbatim lift. The usgs Retry is `allowed_methods=("GET",)` (`fetch.py:33-34`), and urllib3 does not retry a method outside that list. Lifted as-is, it would not retry the PPI and LAUS POSTs, which is exactly where the 07/16 ReadTimeout hit (`bls_ppi/resources.py:24`). The shared helper must take `allowed_methods` and the BLS callers must pass `("GET", "POST")`. The BLS timeseries POST is a read, so retrying it is safe. `test_ppi_retries_read_timeout` must drive a POST, not a GET. (Correction by the second Opus.)
   - Lane D. Effort S.
   - Proof: `ingest/.venv/Scripts/python.exe -m pytest -q ingest/tests/pipelines/bls_*` stays green, plus a new test `test_ppi_retries_read_timeout` that patches the adapter.
8. DO — PPI cron to `0 14 * * 4` (weekly, Thursday) and record the newest period (P5, and the P10 signal).
   - Where: `ingest-bls-ppi.yml:4-7`. Pass `max_period_end` to `upsert_inventory_row` at `ingest/pipelines/bls_ppi/pipeline.py:39-46`. The kwarg already exists (`ingest/lib/tier1_inventory.py:81`).
   - Format: an ISO date `YYYY-MM-DD` giving the last day of the newest observation month. The column is `text` (`information_schema.columns` returned `text`), and redfin already writes this format (`select id, max_period_end ... where max_period_end is not null` returned `lake-tier1/market/redfin_swfl.parquet | 2026-08-31`). Any other format, such as `2026-M08`, makes the §8 contract's `::date` cast throw. The probe records that as SKIP, and a SKIP never opens a check.
   - Weekly re-runs overwrite the same `{YYYY-MM}.parquet` (`pipeline.py:37`), which is safe: `upload_parquet` goes through `_upload_bytes` with `"x-upsert": "true"` (`ingest/lib/storage_uploader.py:17-26,59-64`).
   - Slot check: no weekday-specific Thursday job exists in the catalog. LAUS takes 13:00 and PPI 14:00. The daily `0 14 * * *` freshness-probe-daily.yml shares the PPI minute. It only reads `_tier1_inventory`, so at worst the PPI contract sees the previous week's row for one day. Harmless, but not "no job". (Corrected by the second Opus.)
   - Lag: the late 2026 releases (Jan 30, Feb 27, Mar 18) drop from 17/17/29 days to at most 7.
   - Lane D. Effort S.
   - Proof: `select max_period_end from data_lake._tier1_inventory where id like 'lake-tier1/macro/bls_ppi/%' order by updated_at desc limit 1` returns non-null.
9. DO — PPI reader takes the newest vintage (P6).
   - Where: add an opt-in `filename: true` to the parquet view at `refinery/sources/duckdb-source.mts:169` (`read_parquet(url, filename=true)`). In `refinery/sources/bls-ppi-source.mts:137-143`, keep rows from the lexically greatest filename per (series, year, period) instead of `MAX(value)`.
   - Lane D. Effort S.
   - Proof: `bun test refinery/sources/bls-ppi-source.test.mts` with a new two-vintage case where the older file is higher.
10. DO — OEWS detects the latest published year itself and runs monthly April-July (P7, P8).
    - Where: replace `CURRENT_OEWS_YEAR` (`ingest/pipelines/bls_oews_swfl/constants.py:23-26`) with a probe that HEADs `oesm{YY}ma.zip` for current year minus 1 and back-steps once (the QCEW probe shape, `bls_qcew/pipeline.py:13-65`). A 200 whose content-type is not a zip counts as missing, the lesson already written at `bls_qcew/pipeline.py:44-47`. Drop the `"2025"` dispatch default (`bls-oews-annual.yml:13`). Download once per year and pass the bytes to the resource (`pipeline.py:46`, `resources.py:136-141`). Cron becomes `0 14 15 4-7 *`. In the flattened catalog, day 15 at 14:00 is used only by this workflow and the daily `0 14 * * *` freshness-probe-daily.yml, which reads and does not conflict. redfin-monthly and faf5 sit at 13:00.
    - Tests: first-ever OEWS ingest tests under `ingest/tests/pipelines/bls_oews_swfl/` (probe back-step, parse of a 3-row xlsx fixture, suppression markers).
    - Lane D. Effort M.
    - Proof: `ingest/.venv/Scripts/python.exe -m pytest -q ingest/tests/pipelines/bls_oews_swfl`. On 07/01/2027, `select max(ref_year) from data_lake.bls_oews_swfl` returns 2026.
11. DO — The checks-and-balances contracts in §8 (P10).
    - Where: `ingest/quality/quality_registry.yaml`.
    - Lane D. Effort S.
    - Proof: `ingest/.venv/Scripts/python.exe -m ingest.scripts.check_data_quality --dry-run` lists the four contracts, all PASS today (PPI's only after item 8 writes `max_period_end`). A negative control per contract goes in `ingest/tests/scripts/`, beside `test_check_freshness.py`: the QCEW SQL against a fixture missing the prior-year quarter returns 1.
    - Order: the PPI contract lands after item 8. The QCEW and LAUS contracts can land any time with the §8 thresholds (300 / 120 days). Under today's QCEW cron the QCEW contract fires in the weeks before each landing. That is P2 being reported: BLS has published and we have not landed. So land item 4 first unless you want P2 surfaced through the checks row.
12. DO — Registry and doc hygiene (P11).
    - Where: add `raw_landing_class: free_refetchable` to bls_ppi, bls_laus, bls_qcew and bls_oews_swfl, and delete their four lines from `.claude/hooks/lib/coverage-ratchet-baseline.json:3-7` (the Gate 11 ratchet only shrinks). All four are public BLS endpoints with no vendor cost and full re-fetch on every run. QCEW and OEWS are keyless. PPI and LAUS send the free BLS registration key when present (`bls_ppi/resources.py:14,22`, `bls_laus/resources.py:75`), so the comment says "free registration key", not "keyless" (second-Opus correction). Update the counts and comments at `cadence_registry.yaml:640-644,660-664`, `docs/standards/data-inventory.md:113-116`, `docs/standards/data-roots.md:1585-1617` (master 283/299/286 → 290/306/293, `macro-swfl.mts:537` → `:673`, `cre-swfl.mts:2125` → `:2144`) and `scripts/notion-sync.mjs:1335,1341`. Correct `wiki/pipeline-census.md:63`. Replace the "update CURRENT_OEWS_YEAR" comments at `cadence_registry.yaml:541,717` once item 10 lands.
    - Lane D. Effort S.
    - Proof: `node .claude/hooks/check-prepush-gate.mjs` passes Gate 11 on the push, and `grep -c '"bls_' .claude/hooks/lib/coverage-ratchet-baseline.json` returns 1 (only the tier-1 entry remains until item 13).
13. ASK-FIRST — Retire bls_oews_swfl_tier1 (P9).
    - Where: remove the Tier-1 upload at `ingest/pipelines/bls_oews_swfl/pipeline.py:63-74`, the registry entry `cadence_registry.yaml:528-548` and its ratchet line, and the Storage prefix `lake-tier1/labor/bls_oews_swfl/` (5 objects). The cron stays.
    - It is ASK-FIRST because it deletes Storage objects.
    - Lane D. Effort S.
    - Proof: `select count(*) from data_lake._tier1_inventory where id like 'lake-tier1/labor/bls_oews_swfl/%'` returns 0 and doctor no longer lists the dataset.
14. DO — Close the noise (P12).
    - Where: close issue #176 with the evidence "fixed by f2d1bfb3/962e2d9e; real-write dispatch 35525818513 green 09/20/2026".
    - Lane D. Effort S.
    - Proof: `gh issue view 176 --json state` returns CLOSED.
15. ASK-FIRST — New served employment lines: CES/SAE monthly MSA payrolls, QCEW sector detail (construction / leisure / health), and Hendry LAUS/QCEW.
    - These are new key_metrics (pack output shape) and new rows or a new table, so they need his word.
    - Precondition for sector detail: item 1's `industry_code='10'` filter is live.
    - Lane D. Effort M each.
    - Proof: a consumer pack names each new metric in the same PR, as Gate 12 requires for a new table.
16. DO (coordinate with the CRE family, whose file this is) — Keep the 12 PPI fragments out of cre-swfl's two model legs (§10).
    - Where: `refinery/packs/cre-swfl.mts:710-727` (`creFitScore`). Return 0 for `fragment.source_id === "bls_ppi_construction"` (`bls-ppi-source.mts:30`). Fit 0 drops them at `refinery/stages/2-triage.mts:34`, before `runTriageAgent` (`:40-44`) and `runSynthesisAgent` (`3-synthesis.mts:26-28`). The PPI key_metrics are unaffected because `creCorpusSummary` receives `allFragments`, not the triaged set (`3-synthesis.mts:65`, `cre-swfl.mts:734,792-796`).
    - Unverified: whether stage 4 or the orphan check keys the PPI source citation off the triaged set. The proof below checks that.
    - Lane D. Effort S.
    - Proof: a test in `refinery/packs/cre-swfl.test.mts` asserts `creFitScore(<bls_ppi_construction fragment>) === 0`. A rebuilt `brains/cre-swfl.md` still carries the 8 PPI key_metrics and the BLS PPI citation (`grep -c "BLS PPI industry data" brains/cre-swfl.md` returns 8 today and must return 8 after).
    - Unblocks: the PPI numbers stop being model input anywhere, whatever lane the CRE family picks for its own legs.
17. DO — Fix the LAUS prior-year citation label (P13).
    - Where: `refinery/packs/macro-swfl.mts:410`. Render `${refYear - 1}-${refPeriod} → ${refMonth}`. The LAUS summary already carries the reference month, so the prior-year label derives from it with no new field.
    - Failing test first: `macro-swfl LAUS YoY citation names the prior-year month`.
    - Lane D. Effort S.
    - Proof: `bun test refinery/packs/macro-swfl*.test.mts`, and after item 2's rebuild `grep -c "prior-year 2025-" brains/macro-swfl.md` is ≥ 1.

## 8. Checks and balances

Design rule: one signal per pipeline, and it fires only when a served number would be wrong or a consumer would read stale data. Every signal is a `sql_expectation` content contract (`ingest/quality/contracts.py:438-459`) with `severity: error, locus: probe, policy: report` in `ingest/quality/quality_registry.yaml`. The daily probe (`freshness-probe-daily.yml:52-56` runs `check_data_quality`) opens exactly one `public.checks` row per failing contract under project `data-quality`, key `contract_fail_<table>_<name>`. It auto-closes that row the day the condition clears (`ingest/scripts/check_data_quality.py:339-432`, prefix `contract_fail_` at `:60`). It files no GitHub issue at all. Doctor turns the three tier-2 datasets red on a failing contract (`ingest/scripts/doctor.py:135-141,368`), which is where the ops site `/coverage` reads.

The thresholds follow from BLS's publication lag. The rule is one rule: a signal fires only when a full release has been missed. The threshold is the worst normal age of the newest landed period just before the next one lands (worst publication lag + one period + the longest wait for the next cron run), plus a margin. The second Opus corrected the QCEW (260 → 300) and LAUS (110 → 120) thresholds, which were below that worst case on the 2026 calendar.

- bls_qcew: contract `bls_qcew_latest_has_yoy_pair` on `data_lake.bls_qcew`. It counts the areas among 12071/12021 whose latest own_code-5 quarter has no row for the same quarter a year earlier, plus 1 if the latest quarter ended more than 300 days ago:
  - `failing_rows_sql`: `WITH l AS (SELECT area_fips, max(year*10+qtr::int) k FROM data_lake.bls_qcew WHERE own_code='5' AND area_fips IN ('12071','12021') GROUP BY 1) SELECT (SELECT count(*) FROM l WHERE NOT EXISTS (SELECT 1 FROM data_lake.bls_qcew b WHERE b.area_fips=l.area_fips AND b.own_code='5' AND b.year*10+b.qtr::int = l.k-10)) + (SELECT count(*) FROM l WHERE make_date((l.k/10)::int, ((l.k%10)*3)::int, 1) + interval '1 month' - interval '1 day' < now() - interval '300 days')`. The `::int` casts are required because `year` is bigint and `qtr` is varchar (`information_schema.columns`).
  - Run read-only on 09/26/2026 with 300, this SQL returned `failing 0`. A negative control that hides the 2025Q1 rows returned `2`, one per county, so it fires when a pair is missing.
  - Why 300 days: the cew.htm lags from quarter end to release are 161 (Q3-25), 153 (Q4-25), 150 (Q1-26) and 155 (Q2-26) days. On item 4's day-3/day-12 grid, the worst normal age of the newest landed quarter's end is 255 days on the real 2026 calendar: Q2-25 ended 06/30/2025, and Q3-25 lands 03/12/2026. It is 277 days if a 161-day release slips to a day-13, which waits for the next day-3 (python date math). 300 leaves a 23-day margin, and one missed release pushes the age past 340.
  - The first draft's 260 had 5 days of margin on the 2026 calendar and a negative margin on a slipped release. Its reasoning, "one missed release plus a cron slot is under 260", was wrong. Under today's Feb/May/Aug/Nov day-9 cron the age reaches 313 before a landing (06/30/2025 → 05/09/2026), so the contract fires then. That fire is P2 being caught, not a false alarm.
  - Today it passes: 2026Q1 has its 2025Q1 pair, and 2026Q1 ended 179 days ago (python date math, 03/31 → 09/26). This contract guards the data side (P2 holes and a missed release). P1 was a code defect on complete data, so no data contract could have caught it. Its guard is the named failing test in plan item 1. Stating that plainly is better than pretending one probe covers both.
- bls_laus: contract `bls_laus_county_month_lag` on `data_lake.bls_laus`. It counts county areas whose newest non-null rate month ended more than 120 days ago:
  - `failing_rows_sql`: `SELECT count(*) FROM (SELECT area_fips, max(make_date(year::int, substr(period,2)::int, 1)) m FROM data_lake.bls_laus WHERE measure_code='03' AND value IS NOT NULL AND area_fips IN ('12071','12021') GROUP BY 1) t WHERE t.m + interval '1 month' < now() - interval '120 days'`
  - Why 120: the longest 2026 month-end-to-release gap on metro.htm is January 2026 → Thu Apr 16 (75 days). The newest landed month before that release was December 2025, and `m + 1 month` = 01/01/2026.
    - With item 5's Thursday 13:00 UTC cron, the 10:00 ET (14:00 UTC) release misses that day's run and lands Apr 23. The age is then 112 days, so the first draft's 110 would have fired.
    - Under today's day-25 cron it lands Apr 25 at age 114 (python date math).
    - 120 clears both with 6-8 days of margin. In a normal month under today's cron the age peaks near 85 (Aug data: 08/01 → 10/25), and it passes 120 only after a whole release is missed.
  - Re-run read-only on 09/26/2026 with 120, it returned `0`. A negative control that caps the data at 202604 returned `2`.
- bls_oews_swfl: contract `bls_oews_year_present` on `data_lake.bls_oews_swfl`. It fails if, from July 1 of year Y, `max(ref_year) < Y-1`:
  - `failing_rows_sql`: `SELECT count(*) FROM (SELECT max(ref_year) m FROM data_lake.bls_oews_swfl) t WHERE t.m < extract(year from now())::int - 1 - CASE WHEN extract(month from now()) < 7 THEN 1 ELSE 0 END`
  - It passes today (2025 ≥ 2026 − 1). Run read-only on 09/26/2026 it returned `0`.
- bls_ppi: contract `bls_ppi_newest_month_lag`, keyed under `data_lake._tier1_inventory`. PPI has no Postgres table, so doctor cannot attach it. The checks row is the signal. It fails if the newest file's `max_period_end` (written by plan item 8) is more than 100 days old:
  - `failing_rows_sql`: `SELECT count(*) FROM (SELECT max_period_end FROM data_lake._tier1_inventory WHERE id LIKE 'lake-tier1/macro/bls_ppi/%' ORDER BY updated_at DESC LIMIT 1) t WHERE t.max_period_end IS NULL OR t.max_period_end::date < now() - interval '100 days'`
  - Run read-only today it returns `1`, because `max_period_end` is null on every PPI row. That is why this contract lands only after item 8, never before. Why 100: the longest gap in the ppi.htm calendar is November 2025 data released Jan 14, 2026, which is 74 days from month start (python date math). The weekly cron adds at most 7, giving 81 < 100. The other late months were Dec 2025 (60) and Jan 2026 (57).
  - Second-Opus check on the contract's own basis (age of the previous month's `max_period_end` at landing): October 2025 ended 10/31. November lands Thu 01/15/2026 at the 14:00 UTC run, after the 08:30 ET release, and the age is 76 days. Under today's day-16 cron the worst is 78 (Nov 30 → Feb 16). Both are under 100, so the threshold stands.
- bls_oews_swfl_tier1: its one signal is the existing doctor freshness row. `bls_oews_swfl_tier1 | tier-1 | FRESH | NOT_APPLICABLE | NO_CONTRACT | GREEN` reads the inventory prefix `lake-tier1/labor/bls_oews_swfl/` (`cadence_registry.yaml:534-535`) and is already live (run 36259690113). Nothing new is added: it has no reader, so no served number can go wrong. The row goes away with the entry when item 13 retires it. (Second-Opus correction: the first draft said "no signal", and the brief requires exactly one per pipeline.)

Run failures keep the existing path. `log-cron-incident.yml` lists all four workflows (`:18-20,78`), keeps exactly one open issue per workflow (`.github/scripts/log-cron-incident.mjs:218-229` dedups on `[cron-failure:<workflow>]`) and one `cron_incident_*` check, and closes both on the next scheduled green. That is one issue per incident, not per run.

Noise to delete:
- GitHub issue #176 (item 14).
- The false greens themselves are not deleted. They stop being false once the contracts exist.
- No labels and no per-run issues to remove. None exist for this family: `gh issue list --label cron-failure --state all --search "bls OR BLS OR qcew OR laus OR ppi OR oews"` returned only #127 (closed) and #176.
- The feed issue #44 ("Cron incident feed (do not close)") takes one comment per failure and one per auto-resolve (`.github/scripts/log-cron-incident.mjs:117,142`). This family contributed 1 of 386 comments since 09/10: `gh api "repos/{owner}/{repo}/issues/44/comments?since=2026-09-10T00:00:00Z" --paginate` returned only `2026-09-16 ✅ ingest-bls-ppi auto-resolved`. That is not per-run noise for BLS, and #44 is family 19's surface.
- No open check belongs to this family: `node scripts/check.mjs list` (21 open) has no bls/qcew/laus/ppi/oews key.
- The workflow color is not the signal. freshness-probe-daily.yml failed its last 5 runs (`gh run list --workflow freshness-probe-daily.yml --limit 5`) because the doctor step is gating and other families are red (run 36259690113: data-quality step success, doctor step failure). The BLS signal is the `contract_fail_*` checks row, which the non-gating data-quality step writes before doctor runs.

One failure mode can kill a signal silently. `run_content_contracts` turns any SQL error into status SKIP (`check_data_quality.py:168-179`), and SKIP opens no check. A contract that SKIPs is therefore a dead signal. After item 11 lands, the executor confirms every one of the four reads PASS or FAIL, never SKIP, in the `--dry-run` output.

No new registry field is needed. `freshness_sla` is not added, because it measures load time, the P10 blind spot. The existing `max_period_end` column carries PPI.

## 9. Box placement

- bls_ppi: stays on GHA `ubuntu-latest`. It is a public keyless-capable API that is not behind a WAF: scheduled greens 35131931002, 31952775445 and 27639279982 were all fetched from GitHub datacenter IPs. It runs 66 s. It needs no SSD archive, no browser and no model. The one red was a read timeout, which the retry in item 7 fixes. A residential IP does not.
- bls_laus: stays on GHA `ubuntu-latest`. Same API, 4 scheduled greens in a row from datacenter IPs, 68 s, no archive, browser or model.
- bls_qcew: stays on GHA `ubuntu-latest`. The 08/09 red's cause is recorded as unproven (commit f2d1bfb3 message) and 09/20 datacenter runs are green. If the per-probe error string (`bls_qcew/pipeline.py:62-65`) ever shows `=403`, the move is one line: `runs-on: [self-hosted, swfl-local]` gated by `SWFL_LOCAL_RUNNER_READY`. Not now.
- bls_oews_swfl: stays on GHA `ubuntu-latest`. The ~40 MB zip downloads fine from datacenter IPs (run 29354318367, 136 s). An archive copy on `/srv/swfl` has no reader, the same finding as P9, so the SSD is not a reason.
- bls_oews_swfl_tier1: same workflow as bls_oews_swfl, so it stays on GHA until retired.
- Already on the box and shouldn't be: none from this family. `grep -rln "swfl-local" .github/workflows` lists dbpr-sirs-monthly, ingest-collier-official-records, ingest-crexi-listings, leepa-comparable-sales-annual, leepa-parcels-annual and runner-smoke, and no BLS workflow.
- Hermes `no_agent` on Spectre: not needed. Nothing here requires state or a schedule that GHA lacks.

## 10. Compute lane per LLM leg

This family has no LLM legs. Proof, as a bare count grep:

```
grep -c -i -E "anthropic|claude|ANTHROPIC_API_KEY|openai|refinery|ollama|llm" .github/workflows/ingest-bls-ppi.yml .github/workflows/bls-laus-monthly.yml .github/workflows/bls-qcew-quarterly.yml .github/workflows/bls-oews-annual.yml ingest/pipelines/bls_ppi/*.py ingest/pipelines/bls_laus/*.py ingest/pipelines/bls_qcew/*.py ingest/pipelines/bls_oews_swfl/*.py
grep -c -i -E "anthropic|claude|openai|ollama|messages\.create|generateText" refinery/sources/bls-ppi-source.mts refinery/sources/bls-laus-source.mts refinery/sources/bls-qcew-source.mts refinery/sources/bls-oews-source.mts refinery/packs/macro-swfl.mts refinery/packs/labor-demand-swfl.mts refinery/packs/cre-swfl.mts
```

Every file returned `:0` (4 workflows, 16 pipeline files, 4 connectors, 3 packs). The second Opus re-ran `grep -rn -i -E "anthropic|claude|openai|refinery"` over the 4 workflow YAMLs and the 4 pipeline dirs: no match (grep exit 1). The 4 dirs hold exactly 16 `.py` files (`ls`). macro-swfl and labor-demand-swfl both declare `skipSynthesisAgent: true` (`macro-swfl.mts:682`, `labor-demand-swfl.mts:293`), so every number in this family is deterministic end to end. The PPI fragments are the exception: they are model input in cre-swfl (see below), though the numbers served from them are not model output. None of the plan items above adds a model, and none needs Lane M, C or L.

Three adjacent legs touch this family's data or runs but are owned by other families. They are listed so the second reviewer does not count them as missed:
- `heal-cron-failure.yml` L2 "diagnose". It fires on failures of all four BLS workflows (`.github/workflows/heal-cron-failure.yml:22-24,80`). Its current auth is the `ANTHROPIC_API_KEY` secret (`:191`, corrected from `:94` by the second Opus), and the job is gated by `vars.CRON_HEAL_DIAGNOSE_ENABLED != 'false'` (`:172`). This family needs no model to diagnose its failures: the deterministic classifier already labelled both observed reds (#127 `TRANSIENT`, #176 `UNKNOWN`), and after f2d1bfb3 the QCEW error names every probe and status (`bls_qcew/pipeline.py:62-65`). Re-routing the leg (to Lane M, or turning it off with `CRON_HEAL_DIAGNOSE_ENABLED`) is family 19's call.
- The cre-swfl Stage-2 triage agent and Stage-3 synthesis agent (`refinery/stages/2-triage.mts:40-44` → `runTriageAgent`, and `refinery/stages/3-synthesis.mts:26-28` → `refinery/agents/synthesis-agent.mts:100-114`). They are the CRE family's legs. Second-Opus correction: the first draft said "PPI numbers do not pass through it", which is wrong for the fragments.
  - The fragments reach both agents. cre-swfl declares neither `skipTriageAgent` nor `skipSynthesisAgent` (`grep -n -E "skipTriageAgent|skipSynthesisAgent" refinery/packs/cre-swfl.mts` returned nothing). `creFitScore` falls through to the default 6 for the 12 `bls_ppi_construction` fragments (`cre-swfl.mts:722-726`, source id at `bls-ppi-source.mts:30`, one fragment per series at `:159-177`). They pass the fit filter (`2-triage.mts:34`) and go to the triage agent. Their composite is at least (6 + 0) × 1.5 = 9 (trust tier 1, `refinery/types/scoring.mts:11`), which clears `COMPOSITE_CUTOFF = 6` (`scoring.mts:31`; cre-swfl sets no `compositeCutoff`), so they sit in the triaged set the synthesis agent reads.
  - The served PPI key_metrics are still deterministic, built from `allFragments` by `creCorpusSummary` (`3-synthesis.mts:65`, `cre-swfl.mts:792-796,1572-1608`).
  - Runtime artifact could-not-verify: the only local `.refinery-cache/cre-swfl/stage-2-triage.json` is dated 06/16/2026, before PPI was wired into cre-swfl (07/17), and holds 0 PPI fragments.
  - Redesign so the leg needs no model for PPI: plan item 16 (fit 0), Lane D. This family takes no position on which lane the CRE family uses for its own legs.
- The corridor-character synthesizer (`refinery/tools/synthesize-corridor-character.mts:8,35`). It is operator-run with no workflow (`grep -rln` over `.github/workflows` found none), and it is the corridor family's leg. The bls_laus figure reaches it through the deterministic `build-corridor-fact-pack.mts:485-555`, so the number is fixed before any model sees it. If it is re-run, the permitted lane is an interactive Max session (Lane M).

## 11. Double-check log

I re-read the file top to bottom. Each claim below is followed by the command or file that verifies it and the result.

- Registry name lines 499/528/633/653/705: `grep -n -E "bls_(ppi|laus|qcew|oews)" ingest/cadence_registry.yaml`. Verified.
- Registry field lines (workflow/consuming_pack/lane/cadence_days/expected_rows_min at 500-504, 529-533/535, 634-640, 654-660, 706-712): targeted grep with awk line filter. Verified.
- PPI run list is 8 runs, 7 green / 1 red, red 29512259305 ReadTimeout at resources.py:24: `gh run list ... ingest-bls-ppi.yml` and `gh run view 29512259305 --log-failed | sed -n 650,680p`. Verified.
- LAUS 6/6 green, newest 36169356789: `gh run list`. Verified.
- QCEW 6 runs, 4 green / 2 red. 31316526508 is the back-steps error. 26455959048 (05/26 dispatch) was a `psycopg2.OperationalError: could not translate host name`, a credential/host misconfiguration fixed the same day by 26457913819. It is not in §4 because it was a one-off secret issue already resolved. Verified.
- QCEW 09/20 runs were real writes: `gh run view ... --log | grep 'if \[ "'` shows `"false" = "true"`, and output from `run()`. Verified.
- OEWS 2 runs, dry-run 44 rows, real 44 rows: `gh run view 29353788560/29354318367 --log`. Verified.
- Run durations of 66/68/79/136 s: `gh run view --json startedAt,updatedAt`. Verified.
- LAUS 376 rows, 202401-202608, 12 nulls at 2025-M10 footnote X: the SQL shown in §2. Verified.
- QCEW 64 rows, quarters 2024Q3/2025Q1/2025Q3/2026Q1: SQL in §2. Verified.
- OEWS 220 rows, 22 per MSA per year: SQL in §2. Verified.
- `_tier1_inventory` rows (5 PPI + 5 OEWS) and PPI max_period_end null: SQL in §2. Verified.
- Served wrong values on the live page: `curl -s https://www.swfldatagulf.com/r/macro-swfl` then grep counts 8/6/22/3. Verified.
- Python-derived served-vs-true values: the one-liner in P1, re-run with output `4.86 1.49 4.42 -0.49 10.52 4.08 6.95 -0.77`. Verified.
- Employment direction is "stable" under true values: `macro-swfl.mts:142-146` thresholds ±1.0 against -0.49/-0.77. Verified.
- Fixture holds 2 quarters / 30 records: the python read of `refinery/__fixtures__/bls-qcew.sample.json`. Verified.
- Connector prior-quarter line: I first wrote `:110-112` and corrected it to `:111-113` after `sed -n 103,112p` showed `const qtrs` at 111. Corrected in §4 and §7.
- OEWS same-shape site `bls-oews-source.mts:147-149`: `sed -n 146,151p`. Verified.
- Master edges 290/293/306: `grep -n` in `refinery/packs/master.mts`. Verified. data-roots' 283/286/299 is recorded as needing review in P11.
- Brief's "master last rebuilt 08/19": `git log -1 -- brains/master.md` returns 08/14/2026 and `head -1 brains/master.md` shows token `SWFL-7421-v140-20260814`. Verified: the repo's master is from 08/14/2026, and the brief's 08/19 is not supported. Not relied on in this plan.
- BLS release calendars (QCEW, LAUS metro, PPI) and the derived lags 60/68/73/69, 23/25/28/23, 17/17/29 and 2/1/6/1: crawl4ai files cew.md / metro.md / ppi.md plus the python date script. Verified.
- Release weekdays (all 2026 metro releases fall on Wednesdays): python strftime. Verified.
- Cron slots free (Thursday; day 3/12 at 13h; day 15 at 14h used only by OEWS): the flattened `node scripts/schedule-catalog.mjs` list of 82 cron lines, grepped. Corrected by the second Opus. The daily `17 13 * * *` (tripwire-hourly) and `0 14 * * *` (freshness-probe-daily) run on every day, including Thursdays, days 3/12 and day 15. There are no exact-minute conflicts on a BLS table. The wording is fixed in items 4, 8 and 10.
- QCEW backfill URLs 2024Q4/2025Q2/2025Q4/2014Q1 return 200: curl. Verified.
- QCEW ceiling of 1977/1802/916 rows vs 5 kept: curl plus python csv count. Verified.
- Hendry LAUS published (M07 6.0): API POST. Verified.
- CES/SAE MSA series current to 2026-M08: API POST. Verified.
- OEWS zip columns (32), detailed/major/total counts and Last-Modified 15 May 2026 13:24 GMT: python download and inspect. Verified.
- Hendry's OEWS nonmetro membership: could not verify. Stated as such in §2.
- LAUS API history depth beyond the 24-month window: could not verify live. Stated as such in §5.
- PPI MAX-vs-newest served difference today: verified by the second Opus (read-only Storage GET of 5 parquets): 33 of 1392 keys differ, 0 served values differ. Updated in P6 and §6.
- The content-contract path (check row open, auto-close, no GitHub issue): read `check_data_quality.py:139-185,339-432` and `doctor.py:135-141`. Verified.
- log-cron-incident dedups to one open issue per workflow: `log-cron-incident.mjs:218-229`. Verified.
- Tests are 36 passed / 1 skipped (pytest) and 13 pass (bun): both commands re-run. Verified. The OEWS ingest test count of 0: `find ingest/tests -path "*bls*"` lists no oews dir. Verified.
- LLM grep all zeros: the bare `grep -c` output. Verified. My first attempt piped through `head`, so its exit code was meaningless. I replaced it with the bare count.
- heal-cron-failure lines 22-24/80/94: `grep -n` on the YAML. 22-24 and 80 verified. `:94` was corrected to `:191` (key) and `:172` (gate) by the second Opus: `grep -n -E "ANTHROPIC|CRON_HEAL_DIAGNOSE_ENABLED" .github/workflows/heal-cron-failure.yml`.
- The day-15 14:00 slot claim for OEWS: the catalog grep shows `0 13 15 * * redfin-monthly`, `0 13 15 3 * faf5-annual` and `0 14 15 5 * bls-oews-annual`. Corrected by the second Opus: freshness-probe-daily's daily `0 14 * * *` also fires then (read-only, no conflict).
- QCEW 260-day threshold arithmetic (quarter end → release 161/153/150/155 days): python date math at write time. Verified: Sep 30 → Mar 10 = 161, Dec 31 → Jun 02 = 153, Mar 31 → Aug 28 = 150, Jun 30 → Dec 02 = 155. The lags are right, but the threshold was corrected to 300 by the second Opus: the worst normal age at landing is 255-277, not the lag alone.

- §8 QCEW contract "would fail today": wrong. The SQL, re-run read-only, returned `failing 0`. Corrected in §8 to "passes today", with the reasoning that P1 is a code defect guarded by item 1's test. Plan item 11's proof ("FAIL before item 3") was corrected to match.
- §8 QCEW contract SQL as first written lacked `::int` casts (`make_date(bigint, ...)` fails). Corrected to the version that ran, and a negative control was added (returned 2).
- §8 LAUS and OEWS contracts: SQL re-run read-only, both returned 0. Verified. The LAUS threshold 110 was corrected to 120 by the second Opus: January 2026 data landed at age 112 under the proposed cron. PPI contract returned 1 today (null `max_period_end`). Verified, and the dependency on item 8 is stated.
- §8 PPI threshold basis first said "February's data, 45 days, the latest". Wrong: ppi.htm shows November 2025 data on Jan 14, 2026, which is 74 days (python). Corrected in §8.
- Registry line citations re-read with `sed -n`: 645→644, 665→664 (LAUS/QCEW confirmed_total), 649→648 (LAUS ceiling), 668-672→667-671 (QCEW ceiling), 720-724→724-725 and 545,722→548,725 (CES/SAE ceiling), 550-553→553-556 (census_vip retirement). All corrected in §4, §5, §7.
- `docs/standards/pipeline-freshness.md:84`→`:87` (LAUS row, `grep -n`). Corrected.
- `bls-laus-source.mts:152-157`→`:158-160` (prior-year lines, `sed -n 154,162p`). Corrected in §3 and §4.
- `bls-qcew-source.mts:125-127`→`:123-125` (findRow own codes) and `:175-179`→`:176-179` (the three queries). Corrected in §5 and §7.
- `bls-qcew-source.mts:267` citation string: `sed -n 264,268p`. Verified.

- Item 8's `max_period_end` format: `information_schema` returned `text`, and redfin's row reads `2026-08-31`. Verified. Item 8 now names ISO `YYYY-MM-DD`, corrected from the vague "newest year-period", which would have let the contract SKIP.
- Item 2's rebuild route: `git show 8853f7c0 -- SESSION_LOG.md` shows the live v40/v41 came from `bun refinery/cli.mts macro-swfl --target-only`, not from a `daily-rebuild` dispatch. Corrected: item 2 now leads with that route. Whether the GHA `pack_id` dispatch trips the hard HOLD is could-not-verify.
- The weekly PPI overwrite is safe: `storage_uploader.py:17-26,59-64` shows `x-upsert: true`. Verified.

Tally (first Opus): 50 claim lines checked (`awk` count of this section's bullets). 17 corrections (listed above, applied in place). 5 could-not-verify (Hendry nonmetro membership, LAUS API depth, PPI vintage difference, the brief's 08/19 master date, and whether a `pack_id=macro-swfl` dispatch trips the hard HOLD). All are stated in place. The second Opus resolved two of the five (PPI vintage difference, master date), so 3 remain.

Second-Opus re-verification lines. Each is a command re-run on 09/26/2026 and its result.
- Run lists, 15-limit, all four workflows: PPI 8 runs (7 success, 1 failure 29512259305), LAUS 6/6 success, QCEW 6 runs (4 success, 2 failure: 31316526508, 26455959048), OEWS 2/2 success (`gh run list --workflow <file> --limit 15 --json databaseId,status,conclusion,createdAt,event`). Verified.
- 35490124930 (09/20 04:50) was a real write: `gh run view 35490124930 --log` shows `if [ "false" = "true" ]` and `Ingesting BLS QCEW: 2026-Q1 + 2025-Q1 for 3 areas`. Verified.
- Durations 66/68/79/136 s: `gh run view <id> --json startedAt,updatedAt` for 35131931002/36169356789/35525818513/29354318367. Verified.
- LAUS 376 rows, 202401-202608, areas 12000/12021/12071; per-area 128/124/124, max 202608/202607/202607; 12 nulls = 4 per area at 2025-M10, footnote X: Bun.SQL read-only. Verified.
- QCEW 64 rows, 2024Q3/2025Q1/2025Q3/2026Q1, 6/5/5 rows per quarter-area, ingest times 2026-05-26T15:53 and 2026-09-20T17:26; own_code 5 wages and employment exactly as P1 quotes; `year` bigint, `qtr` varchar; 18 columns, no `*_title`: Bun.SQL. Verified.
- OEWS 220 rows, 2021-2025, 15980/34940, 0 null tot_emp in 10 groups: Bun.SQL. Verified.
- `_tier1_inventory`: 5 PPI rows (byte_size 3185/3216/9315/9406/9468, newest 2026-09-16T18:03:50Z, all `max_period_end` null) and 5 OEWS rows (19,828-20,055 bytes, pack_id labor-demand-swfl, newest 2026-07-14T17:35:52Z); `max_period_end` type text: Bun.SQL. Verified.
- `_dlt_loads`: bls_laus max 2026-09-25T17:48:52Z (6), bls_oews_swfl 2026-07-14T17:36:28Z (6), bls_qcew 2026-09-20T17:26:44Z (5). Verified.
- The four §8 contract SQLs as first written returned 0/0/0/1. With the corrected thresholds, QCEW 300 → 0 (negative control 2) and LAUS 120 → 0 (negative control 2). Verified.
- Served page: `curl -s https://www.swfldatagulf.com/r/macro-swfl` counts `4.86` 8, `10.52` 6, `2025-Q3` 22, `+4.9% YoY` 3. `brains/macro-swfl.md:160-161,198-199,219,238,61` as quoted. Verified.
- P1 arithmetic one-liner: `4.86 1.49 4.42 -0.49 10.52 4.08 6.95 -0.77`. Verified. Employment direction uses `wageDirection(...employment_yoy_pct)` (`macro-swfl.mts:498,516`) with the ±1.0 band at `:142-146`. Verified.
- QCEW fixture: `records` holds 30 rows in (2024,'3'),(2025,'3'). Verified.
- Calendars re-crawled with crawl4ai (`C:\Users\ethan\crawl4ai-venv\Scripts\python.exe`, `AsyncWebCrawler.arun`): cew.htm lines 233-237, metro.htm 233-245, ppi.htm 233-245, oes/tables.htm 202 ("May 2025") and 215 ("May 2024"). All dates quoted in P2/P3/P5/§8 match. Verified.
- All derived day counts (60/68/73/69, 23/25/28/23, 17/17/29, 161/153/150/155, 2/1/6/1, 179, 57, 74/60/57, 75) re-computed with python `datetime.date`. Verified.
- BLS API POST 09/26: LAUCN120510000000003 `2026 M07 6.0 Preliminary.`, LAUCN120710000000003 `2026 M07 5.2`, 2025-M10 `-` with the lapse footnote, SMU12159800000000001 `2026 M08 311.3`, SMU12349400000000001 `2026 M08 174.5`, PCU236211236211 `2026 M08 205.766` with the four-month revision footnote. Verified.
- QCEW slices: `2024/4`, `2025/2`, `2025/4`, `2014/1` for 12071 return 200 with 351937/352053/351105/331992 bytes; 2026Q1 rows 1977/1802/916 (42 columns, 5 with industry_code 10) for 12071/12021/12051; `2026/2` returns 404 (not yet published). Verified.
- OEWS zip: HEAD `Content-Length: 39932338`, `Last-Modified: Fri, 15 May 2026 13:24:05 GMT`; `MSA_M2025_dl.xlsx` has 32 columns; 15980 detailed 436 / major 22 / total 1, 34940 detailed 350 / major 22 / total 1. Verified.
- Tests: `36 passed, 1 skipped` (pytest) and `13 pass, 0 fail` (bun). Verified. No `bls_oews_swfl` test dir under `ingest/tests/pipelines`. No connector test for `bls-qcew-source` or `bls-laus-source`; `macro-swfl-fdic.test.mts` covers LAUS only as a fixture fragment (`:6-21`). Verified.
- Every code file:line in §1-§7 re-opened with `sed -n` / `grep -n`: connectors, packs, master edges 290/293/306, pipeline and resources lines, workflow cron/runs-on/timeout lines, `storage_uploader.py:58-64`, `duckdb-source.mts:169`, `tier1_inventory.py:81`, `check_data_quality.py:139-184,339-432`, `contracts.py:438-459`, `doctor.py:133-141`, `freshness-probe-daily.yml:52-56`. Verified, except the corrections listed in §13.
- Registry lines 499/528/633/653/705 and field lines: `grep -n` / `sed -n`. Verified except `:535` → `:536`.
- Commits f2d1bfb3, 962e2d9e, 0559c370, 0e2ec85e, d05b501c, 8853f7c0: `git log -1`. Subjects and dates match. The f2d1bfb3 body says "UNPROVEN". Verified.
- Research citations `P7-corpse-deletelist.md:236-248`, `P3-authority-ratification.md:184`, `P6-master-doublevotes.md:91`, known-problems ledger `:91`: `sed -n`. Verified.
- `swfl-local` workflows: 6 (`grep -rln "swfl-local" .github/workflows`), none BLS. Verified.
- Issues: #176 OPEN since 08/09, #127 CLOSED 07/16. Verified.

## 12. Questions for the operator

1. Which employment number is the headline for Lee and Collier? This is the open P6/P3 sign-off DUP-2 (`P3-authority-ratification.md:184`): QCEW county count (exact, quarterly, currently wrong on the page until item 1) or OEWS survey estimate (annual, votes in master). Tied to it: do you want CES/SAE monthly payrolls (current to August 2026, verified) and QCEW sector detail as new served lines (item 15)? Each is a new metric on a brain and needs your word.
2. May I delete the Storage prefix `lake-tier1/labor/bls_oews_swfl/` (5 small NDJSON files, no reader) and drop the bls_oews_swfl_tier1 registry entry (item 13)?

## 13. Second-Opus verification

Claims checked: 74 double-check lines (the first Opus's 50 plus 24 re-verification groups added in §11; `awk` count of the §11 bullets). Every command the file cites was re-run: the gh run lists and logs, Bun.SQL read-only against the lake, the served-page curl, the python arithmetic, the crawl4ai calendars, the BLS API POSTs, the QCEW CSV curls and the OEWS zip. Every file:line was re-opened with `sed -n` / `grep -n`. Each contract SQL was re-run with a negative control.

Corrections (15, each applied in place in the section named):
- P1 first served: "served since brain v41" was wrong. It was served since v39 (`git show 525da974:brains/macro-swfl.md` carries 4.86 and 2025-Q3; daily rebuild 09/20/2026 09:24 UTC). §4 P1.
- P6: "could not verify whether any served value differs" was wrong. Measured: 33 of 1392 stored keys differ (2026-M04..M07, 11 series) and 0 served values differ; M04 becomes the comparator from ref 2026-M10. Read-only Storage GET plus pyarrow. §4 P6, §6, §11.
- Item 7: the usgs `_session()` lifted as-is would not retry the PPI/LAUS POSTs, because it is `allowed_methods=("GET",)` (`ingest/duckdb_pipelines/usgs/fetch.py:33-34`). The helper must take `allowed_methods` and the BLS callers must pass `("GET","POST")`. §7 item 7.
- §10: "PPI numbers do not pass through" the cre-swfl agent was wrong for the fragments. All 12 PPI fragments reach the triage agent and the synthesis agent: fit 6 (`cre-swfl.mts:722-726`), composite ≥ 9 vs cutoff 6 (`scoring.mts:11,31`), no skip flags. The served key_metrics stay deterministic (`3-synthesis.mts:65`). §10, new plan item 16.
- §10: the heal-cron-failure API-key line is `:191`, not `:94`, and the gate is `:172`. §10, §11.
- §8 QCEW threshold 260 → 300. The worst normal age at landing is 255 on the 2026 calendar and 277 on a slipped release; the old reasoning sentence was wrong. SQL re-run: 0 today, negative control 2. §8.
- §8 LAUS threshold 110 → 120. January 2026 data (Thu 04/16, 14:00 UTC) lands 04/23 under the proposed Thursday 13:00 cron at age 112, so 110 would fire. SQL re-run: 0 today, negative control 2. §8.
- §8 bls_oews_swfl_tier1 "no signal" → its one signal is the existing doctor freshness row (inventory prefix), retired with item 13. §8.
- Registry claim `consuming_pack: labor-demand-swfl` for bls_oews_swfl_tier1 (`cadence_registry.yaml:530`) and the writer's `pack_id` (`bls_oews_swfl/pipeline.py:71`) name a reader that does not exist. Code shows none. §4 P9.
- `expected_rows_min: 198` is at `cadence_registry.yaml:536`, not `:535` (`sed -n 533,537p`). §4 P9.
- P10 doctor rows: the tier-1 datasets read `NOT_APPLICABLE`, not `OK` (`gh run view 36259690113 --log`). §4 P10.
- P11 data-roots: `:1601` cites master 299, and `:1609/:1617` cite 286 (not `:1585,1609,1617` = 283/286/299). `macro-swfl.mts:537` → `:673` and `cre-swfl.mts:2125` → `:2144` were also stale. Item 12's range is widened to `:1585-1617`. §4 P11, §7 item 12.
- Slot claims: "no other job at 13:xx on day 3/12", "no Thursday job" and "day 15 14:00 used only by OEWS" were wrong. The daily `17 13 * * *` tripwire-hourly and `0 14 * * *` freshness-probe-daily also run then, and neither touches a BLS write. `node scripts/schedule-catalog.mjs`. §7 items 4, 8, 10; §11.
- Item 5 "lands about 23 hours later" held only for Wednesday releases. Thu 04/16/2026 waited 7 days, which is still inside the ≤7-day bar. §7 item 5.
- Item 12 "keyless public BLS endpoints" → PPI and LAUS send the free BLS registration key (`bls_ppi/resources.py:14,22`, `bls_laus/resources.py:75`). §7 item 12.

Unverifiable (3):
- Hendry's OEWS nonmetro area. The BOS file parse in this pass targeted the MSA file only.
- LAUS API history depth before the 2024 window. No pre-2024 live POST was run.
- Whether a `daily-rebuild.yml` dispatch with `pack_id=macro-swfl` trips the hard HOLD. Checking it needs a dispatch, which is not allowed.
- One more item is partial rather than unverifiable: the §10 runtime artifact proving PPI fragments inside a cre-swfl triage run. The only local `.refinery-cache/cre-swfl/stage-2-triage.json` (06/16/2026) predates the 07/17 PPI wiring. The code path is verified.

Gaps filled:
- P3 served consequence: the page serves 2026-M06 while the lake has held M07 since 09/25 (`brains/macro-swfl.md:43,61,75`). The cron fixes reach the page only through a macro-swfl rebuild.
- New P13 plus plan item 17: the LAUS YoY citation reads "prior-year 2026-M06 → 2026-M06" (`macro-swfl.mts:410`, `brains/macro-swfl.md:132`). 1 same-shape site.
- New plan item 16: PPI fragments are removed from cre-swfl's two model legs by setting fit 0 (Lane D, coordinated with the CRE family).
- §1 checked non-readers: `macro-florida.mts:399`, `graphify-app-nodes.mjs:601`, `lake-probe.mts:17`, `notion-sync.mjs`; `lib/` and `app/` have 0 hits.
- §5 research citations: `2026-09-18-data-access-and-outcome-feasibility.md:63`, `_RESEARCH/INDEX.md:472`, `2026-07-22-lake-wire-map.md:58,126` (fred_laus_alfred, FRED family); 0 BLS hits in `docs/handoff/2026-07-11-reliable-sources-findings.md`.
- §8 noise: the #44 feed took 1 BLS comment of 386 since 09/10; 0 open BLS checks; the probe workflow is red daily from the gating doctor step, so the checks row, not the workflow color, is the signal.
- Item 11 ordering against items 4/5/8 made explicit.
- §11 extended with 24 re-verification lines, and the master-date line resolved (08/14/2026 verified).

Coverage check: bls_ppi, bls_laus, bls_qcew, bls_oews_swfl and bls_oews_swfl_tier1 each appear in §2, §3, §4, §6, §7, §8 and §9 (awk section slice plus `grep -c` per name: every count ≥ 1; bls_oews_swfl_tier1 is 1 or 2 in each). Section 8 now names exactly one signal per pipeline, all on existing seams (four `sql_expectation` contracts plus the doctor freshness row), and no per-run GitHub issue filing: `log-cron-incident.mjs:218-229` dedups to one issue per workflow.

Credit-suggestion count: 0. `grep -n -i -E "credit|top.?up|console balance|api key funding|billing"` on this file found one pre-existing hit before §13, at P11: the brain name `sector-credit-swfl`, which is not a funding suggestion. Nothing was deleted or rerouted. The §10 mention of the heal leg's current `ANTHROPIC_API_KEY` auth states the current auth, as the brief requires, and routes the leg to Lane M or off.
