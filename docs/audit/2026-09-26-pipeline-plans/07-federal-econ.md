# 07 federal-econ — pipeline plan (09/26/2026)

Family 07 covers six federal and state statistical feeds: census_cbp (County Business Patterns), census_acs (ACS 5-year by ZCTA), fdic_bankfind (FDIC Summary of Deposits plus the branch and bank directories), fhfa (FHFA House Price Index), faf5 (FHWA/ORNL Freight Analysis Framework) and fdot (FDOT AADT traffic counts). All six are free public APIs or files. All six run on GHA `ubuntu-latest` and none of them calls a model on the ingest side.

Verdict: the ingest code is sound. It has guarded replaces, volume floors and green tests, and three of the six land on schedule every month. The family's real defect is one shape repeated at 10 code sites: **the data vintage is pinned by hand in code**. The monthly cron re-lands the same old year, `_dlt_loads` reads FRESH, and nobody notices that the source has moved on. On 09/26/2026 that shape leaves us serving stale data in three places:

- CBP is one vintage behind (we serve 2022; 2023 is live on the Census API).
- ACS is two vintages behind (we serve 2022; 2023 and 2024 are live).
- FHFA is one quarter behind (we serve 2026Q1; the source has 2026Q2).

Two consumer-side breaks matter more than any ingest problem:

- **macro-florida, the CBP consumer, has not rebuilt since 07/19/2026.** Its triage stage still calls a model and dies on the credit wall every night. The same shape hits macro-us.
- **The Collier FHFA metric has never been served live.** The vendor does not publish purchase-only HPI for the Naples MSA, and a fixture invents those rows so the tests stay green.

FAF5's current code path has never had a real green run in Actions.

Per-pipeline verdicts: census_cbp IMPROVE, census_acs IMPROVE, fdic_bankfind GOOD ENOUGH, fhfa IMPROVE, faf5 REPAIR, fdot GOOD ENOUGH.

## 1. Scope

Six pipelines, all under `pipelines:` in `ingest/cadence_registry.yaml`. The registry line numbers come from `grep -n "name: <p>" ingest/cadence_registry.yaml`.

- **census_cbp**
  - Registry: `ingest/cadence_registry.yaml:730`
  - Workflow: `.github/workflows/census-cbp-annual.yml`
  - Code: `ingest/pipelines/census_cbp/`
  - Table: `data_lake.census_cbp_fl`, plus the view `data_lake.census_cbp_fl_agg_by_naics` (`docs/sql/20260623_census_cbp_fl_agg_by_naics_view.sql`)
  - Consumer: `refinery/sources/macro-florida-cbp-source.mts` → pack `macro-florida`, which feeds master (`refinery/packs/master.mts:231,292`, `critical: true`), macro-swfl (`refinery/packs/macro-swfl.mts:674`) and sector-credit-swfl (`refinery/packs/sector-credit-swfl.mts:723`)
- **census_acs**
  - Registry: `:751`
  - Workflow: `.github/workflows/census-acs-annual.yml`
  - Code: `ingest/pipelines/census_acs/`
  - Table: `data_lake.census_acs_zcta`
  - Consumers: `lib/zip-report/census-acs-rows.ts:51`, `lib/zip-summary/load.ts`, `lib/email/market-context.ts:162`. These read live at request time; no brain sits in between.
- **fdic_bankfind**
  - Registry: `:673`
  - Workflow: `.github/workflows/fdic-bankfind-annual.yml`
  - Code: `ingest/pipelines/fdic_bankfind/`
  - Tables: `data_lake.fdic_sod`, `data_lake.fdic_locations`, `data_lake.fdic_institutions`, plus the view `data_lake.fdic_sod_county_year_v`
  - Consumer: `refinery/sources/fdic-deposits-source.mts:28` → pack `macro-swfl` (`refinery/packs/macro-swfl.mts:94-129`)
- **fhfa**
  - Registry: `:1112`
  - Workflow: `.github/workflows/fhfa-hpi-quarterly.yml`
  - Code: `ingest/pipelines/fhfa/`
  - Table: `data_lake.fhfa_hpi`
  - Consumer: `refinery/sources/fhfa-hpi-source.mts` → packs `properties-lee-value` and `properties-collier-value`, both in master (`master.mts:239-240,300-301`)
- **faf5**
  - Registry: `:415`. This is the tier-1 lane; there is no Postgres table.
  - Workflow: `.github/workflows/faf5-annual.yml`
  - Code: `ingest/scripts/faf5_to_parquet.py`, plus the constants in `ingest/pipelines/faf5/constants.py`
  - Storage: Parquet in bucket `lake-tier1` under `faf5/…`, with pointer rows in `data_lake._tier1_inventory`
  - Consumer: `refinery/sources/faf5-source.mts` → pack `logistics-swfl` (`master.mts:236,297`)
- **fdot**
  - Registry: `:1133`
  - Workflow: `.github/workflows/fdot-aadt-annual.yml`
  - Code: `ingest/pipelines/fdot/`
  - Table: `data_lake.fdot_aadt_fl`, plus the views `data_lake.fdot_aadt_county_year` (consumed) and `data_lake.fdot_aadt_swfl_yearly` (a corpse)
  - Raw CSV archive: `raw-tabular-cold/fdot_aadt/<date>.csv.gz`
  - Consumers: `refinery/sources/fdot-source.mts` → `traffic-swfl`; `refinery/sources/fdot-freight-source.mts` → `logistics-swfl-nowcast`; `refinery/tools/build-corridor-fact-pack.mts`

Count: 6 pipelines, 6 workflows, 7 base tables plus 1 storage prefix, 7 consumer packs, 3 `lib/` surfaces and 1 refinery tool. The code-consumer grep that produced the list:

```
for t in census_cbp_fl census_acs_zcta fdic_sod fdic_locations fdic_institutions fdic_sod_county_year_v fhfa_hpi fdot_aadt_fl "faf5/" faf_flows; do rg -l --no-ignore-vcs -g '!*.md' -g '!graphify-out/**' -g '!_RESEARCH/**' -g '!docs/**' "$t" refinery lib app scripts ingest components; done
```

The second Opus re-ran this grep over `refinery lib app components scripts`. It found no reader beyond the list above. The other hits it returned are not data readers:

- `scripts/lake-probe.mts`, a diagnostic listing
- `scripts/notion-sync.mjs` and `scripts/write_ops_cities.py`, hard-coded status labels. The FHFA line in `notion-sync.mjs` is wrong; see P10.
- `scripts/check-zip-scope-gate.mjs:36`, a pre-push scope guard that names `census_acs_zcta`
- `scripts/apply-fdic-sod-view.mts`, the view's DDL applier
- `refinery/lib/paginate.mts:91`, a comment
- `refinery/vocab/brain-vocabulary.json`, the vocabulary
- `refinery/__scratch__/probe-faf5.mts`, a scratch probe

`app/` has no direct reader. The ACS routes read through `lib/zip-report` and `lib/zip-summary`.

## 2. What is being brought in

All SQL below is read-only. It was run through Bun.SQL using the connection approach in `scripts/apply-fdic-sod-view.mts:15-27` (credentials from `.dlt/secrets.toml`) with `SET SESSION default_transaction_read_only = on`. The queries, re-runnable as written:

```
SELECT COUNT(*), MAX(ingested_at), MIN(year), MAX(year), COUNT(DISTINCT fips_county), COUNT(*) FILTER (WHERE fips_county IN ('071','021','051')) FROM data_lake.census_cbp_fl;
SELECT COUNT(*), MAX(ingested_at), MIN(acs_year), MAX(acs_year), COUNT(*) FILTER (WHERE median_household_income IS NULL) FROM data_lake.census_acs_zcta;
SELECT county_fips, county_name, COUNT(*) FROM data_lake.census_acs_zcta GROUP BY 1,2 ORDER BY 3 DESC;
SELECT COUNT(*), MAX(ingested_at), MIN(year), MAX(year) FROM data_lake.fdic_sod;
SELECT stcntybr, COUNT(*), MAX(year) FROM data_lake.fdic_sod GROUP BY 1 ORDER BY 1;
SELECT (SELECT COUNT(*) FROM data_lake.fdic_locations), (SELECT COUNT(*) FROM data_lake.fdic_institutions);
SELECT * FROM data_lake.fdic_sod_county_year_v WHERE year >= 2023 ORDER BY county_fips, year;
SELECT COUNT(*), MAX(_ingested_at), MIN(yr), MAX(yr) FROM data_lake.fhfa_hpi;
SELECT place_name, hpi_flavor, COUNT(*) FROM data_lake.fhfa_hpi WHERE hpi_type='traditional' AND frequency='quarterly' AND level='MSA' AND place_name IN ('Naples-Marco Island, FL','Cape Coral-Fort Myers, FL') GROUP BY 1,2 ORDER BY 1,2;
SELECT COUNT(*), MIN(yearx), MAX(yearx), COUNT(DISTINCT county), to_timestamp(MAX(_dlt_load_id::double precision)) FROM data_lake.fdot_aadt_fl;
SELECT county, yearx, COUNT(*) FROM data_lake.fdot_aadt_fl WHERE county IN ('Lee','Collier','Hendry') GROUP BY 1,2 ORDER BY 1,2;
SELECT id, updated_at, vintage FROM data_lake._tier1_inventory WHERE id LIKE 'lake-tier1/faf5/%' OR id LIKE 'raw-tabular-cold/fdot_aadt/%' ORDER BY updated_at DESC;
SELECT schema_name, MAX(inserted_at), COUNT(*) FROM data_lake._dlt_loads WHERE status=0 AND schema_name IN ('census_cbp','census_acs','fdic_bankfind','fhfa_hpi','fdot_aadt_tier2') GROUP BY 1;
```

### census_cbp

- **What it pulls:**
  - Source: the Census CBP API `api.census.gov/data/{year}/cbp`, with key `CENSUS_API_KEY` (`ingest/pipelines/census_cbp/resources.py:41-45`).
  - Fields: NAICS2017, NAICS2017_LABEL, ESTAB, EMP, PAYANN and NAME, for every Florida county (`resources.py:39,41`).
  - Years: 2017-2022, hard-coded at `resources.py:10`.
- **Cadence:** a monthly cron (`census-cbp-annual.yml:8`, `0 10 15 * *`) against a registry cadence of 365 days.
- **Live table:**
  - 255,563 rows, MAX(ingested_at) 09/15/2026 14:32 UTC, years 2017-2022.
  - 67 distinct counties.
  - 14,849 rows are Lee (071), Collier (021) or Hendry (051).
- **SWFL coverage:** all three core counties are present in every year 2017-2022. Per-year row counts for 2022: Lee 1,181, Collier 1,070, Hendry 291.
- **Freshness caveat:** "fresh" here means the pipeline ran on 09/15. The newest data year is 2022.

### census_acs

- **What it pulls:**
  - Source: the Census ACS 5-year API, `acs/acs5`, one call per ZIP code tabulation area (ZCTA), using the in-scope ZIP list at `fixtures/swfl-zip-county.json` (`ingest/pipelines/census_acs/resources.py:18,81-94`).
  - Variables: 12 raw variables (`constants.py:22-35`), from which 8 covariates are derived.
  - Vintage: 2022, set at `constants.py:17`.
- **Cadence:** cron on the 15th of Nov, Dec and Jan (`census-acs-annual.yml:10`).
- **Live table:** 100 rows, MAX(ingested_at) 07/14/2026, acs_year 2022 only. Median household income is NULL in 5 rows (suppressed by Census).
- **SWFL coverage:**
  - The in-scope core is 60 ZCTAs: Lee 35, Collier 22, Hendry 3.
  - The other 40 are Sarasota 24, Charlotte 13 and Glades 3. Those counties are not real coverage under the 07/07/2026 scope lock; they land because the fixture lists them.

### fdic_bankfind

- **What it pulls:**
  - Source: the FDIC BankFind Suite API `api.fdic.gov/banks`, which needs no key (`ingest/pipelines/fdic_bankfind/constants.py:2`).
  - `/sod` is filtered on the branch county STCNTYBR (`resources.py:40-41`). `/locations` is filtered on STCNTY. `/institutions` is pulled by CERT batch.
  - Every vendor field is kept as written.
- **Cadence:** a monthly cron (`fdic-bankfind-annual.yml:9`, `0 11 20 * *`) against a registry cadence of 365 days.
- **Live table:**
  - `fdic_sod`: 10,759 rows, MAX(ingested_at) 09/22/2026 16:08 UTC, years 1994-2026.
  - Branch county split: 12071 has 6,160 rows, 12021 has 4,297, 12051 has 302, each running through 2026.
  - `fdic_locations`: 298 rows. `fdic_institutions`: 199 rows.
- **SWFL coverage:** all three counties are present. Newest-year rollup from `fdic_sod_county_year_v`:
  - Lee 2026: 162 branches, 34 banks, deposits of 21,115,545 thousand USD
  - Collier 2026: 126 branches, 37 banks, 19,159,773
  - Hendry 2026: 5 branches, 3 banks, 685,788

### fhfa

- **What it pulls:**
  - Source: `https://www.fhfa.gov/hpi/download/monthly/hpi_master.json` (`ingest/pipelines/fhfa/constants.py:1`), which holds every HPI series.
  - It keeps 11 columns (`resources.py:10-25`).
- **Cadence:** cron on the 8th of Jan, Apr, Jul and Oct (`fhfa-hpi-quarterly.yml:7`) against a registry cadence of 90 days.
- **Live table:** 184,817 rows, MAX(_ingested_at) 07/08/2026, yr 1975-2026.
- **SWFL series:**
  - The Cape Coral-Fort Myers MSA (15980) has all-transactions (179 rows), expanded-data (141) and purchase-only (141), each through 2026 period 1.
  - The Naples-Marco Island MSA (34940) has all-transactions (168) and expanded-data (141). It has **no purchase-only series**.
- **Coverage:** MSA grain only. Hendry has no MSA index.

### faf5

- **What it pulls:**
  - Source: ORNL's `FAF5.7.1.zip` (`ingest/pipelines/faf5/constants.py:2`).
  - It keeps flow rows whose origin or destination is one of the five Florida zones (`constants.py:6`, `faf5_to_parquet.py:86-90`).
  - Measures: tons, value and ton-miles for 2017-2024, plus forecasts for 2030-2050 (`constants.py:9`).
- **Cadence:** cron on 03/15 each year (`faf5-annual.yml:8`).
- **Live storage (`_tier1_inventory`):**
  - `lake-tier1/faf5/year=2020..2024/faf_flows.parquet`, updated 05/20/2026.
  - Two dated directories, `faf5/2026-05-19/` and `faf5/2026-05-20/`. Each holds a full wide `faf_flows.parquet` plus the two lookups (`faf_zone_lookup`, `faf_sctg_lookup`). The consumer reads its lookups from the 05-19 directory (`refinery/sources/faf5-source.mts:23`, `FAF5_VINTAGE = "2026-05-19"`).
  - All 11 inventory rows carry `source_url = https://faf.ornl.gov/faf5/Data/Download_Files/FAF5.7.1.zip` (`SELECT id, source_url, vintage FROM data_lake._tier1_inventory WHERE id LIKE 'lake-tier1/faf5/%'`). Their `vintage` column holds a date or a year, never the FAF version.
- **Coverage:** no county grain. SWFL sits undifferentiated inside zone 129, "Remainder of Florida" (`registry:427`). The consumer filters on `dms_dest=129` with `trade_type=1`.

### fdot

- **What it pulls:**
  - Source: the FDOT MapServer layer `gis.fdot.gov/.../FTO/fto_PROD/MapServer/7` (`ingest/pipelines/fdot/constants.py:1`), bounded by a statewide bounding box (`resources.py:112`).
  - It keeps 24 fields and drops the geometry (`resources.py:20-38`).
- **Cadence:** a monthly cron (`fdot-aadt-annual.yml:8`) against a registry cadence of 365 days.
- **Live table:**
  - 103,662 rows, yearx 2021-2025, 67 counties, last load 09/15/2026 14:46 UTC.
  - The year column lands as `yearx`, not `year_`: dlt normalizes the trailing underscore, and the consumers already read `yearx` (`fdot-source.mts:68`).
- **SWFL coverage:**
  - 2025 segments: Lee 534, Collier 215, Hendry 68.
  - Lee plus Collier = 749, which matches the 749 segments in the 08/02 restaurants scout (`_RESEARCH/INDEX.md:469`).

## 3. What is working

### census_cbp

- **Runs:** `gh run list --workflow census-cbp-annual.yml --limit 15` returned only 8 runs: 6 green, 2 red, 0 cancelled.
- **Newest green:** 34982220418 (schedule, 09/15/2026). It was a real load: the log reads "census_cbp_fl establishment_count non-zero rate: 100.0% (255,563/255,563)" and "Load package 1789482749.927894 is LOADED and contains no failed jobs".
- **Monthly loads landed:** the scheduled runs of 06/15, 07/15, 08/15 and 09/15 each left a `_dlt_loads` row (schema census_cbp, 10 successful loads in total).
- **Guards:**
  - A volume floor plus a non-zero ESTAB rate check run before the replace (`resources.py:78-87`).
  - The replace uses insert-from-staging (`pipeline.py:20`).
- **Tests:** 9 tests (`ingest/tests/pipelines/census_cbp/`), part of the 39 passed in `ingest/.venv/Scripts/python.exe -m pytest -q ingest/tests/pipelines/census_cbp ingest/tests/pipelines/faf5 ingest/tests/pipelines/fdic_bankfind ingest/tests/pipelines/fdot ingest/tests/pipelines/fhfa` (39 passed in 1.01s).

### census_acs

- **Runs:** 2 runs exist, both green, both dispatch:
  - 29354332608 on 07/14/2026 was a real load. Its log reads "census_acs_zcta: 100 ZCTAs, ACS 5-year 2022 … Load package 1784050528.4462504 is LOADED".
  - 29353796366 was a dry-run.
- **No scheduled run yet:** the first is 11/15/2026.
- **Suppression handling is correct:** negative sentinels become NULL, never zero (`resources.py:30-40`).
- **The consumer labels the vintage honestly:** "U.S. Census ACS 5-year (2018–2022)" (`lib/zip-summary/load.ts:40-44`).

### fdic_bankfind

- **Runs:** 1 run, 35755967549 on 09/22/2026. It was a green **dry-run**: the log prints "fdic_bankfind dry-run: first sod row". It does not count as a landing.
- **Real load:** the only real load was local, `_dlt_loads` fdic_bankfind at 09/22/2026 16:08:44 UTC.
- **Guards:** a partial-page guard against `meta.total` (`resources.py:85-89`), required-field guards (`constants.py:17-19`) and min-rows floors (`resources.py:117-125`). SOD merges by id and never wipes history (`resources.py:139`).
- **Served:** the consumer pack is served live. The macro-swfl frontmatter from `curl -s https://www.swfldatagulf.com/api/b/macro-swfl | sed -n 1,6p` shows `refined_at: 2026-09-26T04:26:02Z`, and the page carries the `fdic_lee_*` and `fdic_collier_*` metrics.
- **Consumer completeness rule:** the consumer serves a year only when its branch count is at least 80% of the prior year's (`fdic-deposits-source.mts:21-31,84`).
- **Tests:** 10 pytest tests (`test_pipeline.py` 2 + `test_resources.py` 8), plus the consumer tests `refinery/packs/macro-swfl-fdic.test.mts` and `refinery/sources/fdic-deposits-source.test.mts`.

### fhfa

- **Runs:** 3 runs, all green.
- **Newest green:** 28953913464 (schedule, 07/08/2026), a real load at `_dlt_loads` fhfa_hpi 07/08/2026 15:18:56.
- **Lee metric is served:** the properties-lee-value frontmatter (`curl … /api/b/properties-lee-value`) shows `refined_at: 2026-09-19T04:26:15Z` and carries `fhfa_cape_coral_msa_yoy_pct`.
- **Tests:** 1 pytest test (`fhfa/test_dry_run.py`), plus `properties-lee-value.test.mts` and `properties-collier-value.test.mts`.

### faf5

- **Served:** the consumer is served. The logistics-swfl frontmatter shows `refined_at: 2026-09-15T23:57:26Z`, and the pack is deterministic (`logistics-swfl.mts:341-342`).
- **The data is at the source's current version.** A crawl4ai fetch of `https://faf.ornl.gov/faf5/` on 09/26/2026 still lists "FAF5.7.1 Regional database for 2017-2024", and the page is dated "August 15, 2025".
- **Nothing proves the pipeline works in Actions.** Tests: 0 (the directory `ingest/tests/pipelines/faf5/` holds only `__init__.py`).

### fdot

- **Runs:** 6 runs: 5 green, 0 red, 1 cancelled.
- **Newest green:** 34983321273 (schedule, 09/15/2026), a real load. Its log reads "fdot_aadt_fl aadt non-null rate: 100.0% (103,662/103,662)", and the load landed in `_dlt_loads` at 09/15/2026 14:47:29.
- **Real loads landed** on 05/18, 07/03, 07/15, 08/15 and 09/15 (5 successful `_dlt_loads` rows for fdot_aadt_tier2).
- **Raw copies:** a raw CSV is archived on each run (`_tier1_inventory` ids `raw-tabular-cold/fdot_aadt/2026-06-15 … 2026-09-15`).
- **Past incident closed:** the 06/15 timeout that emptied the table (`docs/cron-rebuild-failures.md:20`) was fixed by raising the timeout to 40 minutes (`fdot-aadt-annual.yml:23-26`) and moving to insert-from-staging (`resources.py:101`).
- **Tests:** 19 pytest tests (`test_resources.py` 18 + `test_dry_run.py` 1), plus the consumer tests `fdot-source.test.mts`, `traffic-swfl.test.mts` and `logistics-swfl-nowcast.test.mts`.

### Consumer suite

```
bun test refinery/packs/macro-florida.test.mts refinery/packs/macro-swfl-fdic.test.mts refinery/packs/properties-lee-value.test.mts refinery/packs/properties-collier-value.test.mts refinery/packs/traffic-swfl.test.mts refinery/packs/logistics-swfl-nowcast.test.mts refinery/sources/fdic-deposits-source.test.mts refinery/sources/fdot-source.test.mts refinery/sources/macro-florida-cbp-source.test.mts
```

It returned "118 pass, 0 fail, Ran 118 tests across 9 files".

## 4. Problems

### P1. macro-florida has not rebuilt since 07/19/2026; the triage leg dies on the credit wall every night

- **Symptom:** in nightly-chain run 36217671353 (09/26/2026):
  - "[refinery] upstream macro-florida: stale (expired 2026-08-18) — rebuilding"
  - then "BUILD FAILED — pack=macro-florida status=missing failureClass=deterministic (will NOT self-heal)"
  - then a `400` from the model SDK whose message is the credit wall (`400 credit balance too low`)
  - then "macro-florida: MISSING (deterministic) — downstream packs will build against a HOLE"
- **Served state:** `curl -s https://www.swfldatagulf.com/api/b/macro-florida | sed -n 1,6p` shows `refined_at: 2026-07-19T02:28:39Z` with `ttl_seconds: 2592000`. That is 69 days old against a 30-day TTL.
- **Root cause:**
  - `refinery/packs/macro-florida.mts:408` sets `skipSynthesisAgent: true` but not `skipTriageAgent: true`.
  - So `refinery/stages/2-triage.mts:40-45` calls `runTriageAgent`, which is `refinery/agents/triage-agent.mts` with `TRIAGE_MODEL = "claude-haiku-4-5"` (`refinery/agents/anthropic.mts:6`).
  - The key comes from `daily-rebuild.yml:122`, which `nightly-chain.yml:205` calls.
  - The call does no work for this pack. `compositeCutoff: 0` and `fitScore: 8` (`macro-florida.mts:406-407`), with every `TYPE_MULTIPLIER` positive (`refinery/types/scoring.mts:10-16`), mean every fragment is kept whatever the model scores it.
- **Same shape (scope count 2 of 2):** `refinery/packs/macro-us.mts:227` has the same flags, and macro-us is macro-florida's upstream. The same run logged "BUILD FAILED — pack=macro-us status=missing", and `/api/b/macro-us` shows `refined_at: 2026-07-30T06:59:47Z`.
  - Enumeration command: loop over `refinery/packs/*.mts` for files containing "skipSynthesisAgent: true" without "skipTriageAgent: true". It returned exactly these two.
- **Severity:** blocks a consumer. macro-florida is a `critical: true` input to master (`master.mts:292`), and the served CBP facts are frozen at the 07/19 build.
- **First seen:**
  - Earliest sampled failing run: 35181726422 (09/17/2026).
  - Expiry date from the refinery log line: 08/18/2026.
  - It is not on the open check `llm_legs_parked_credit_wall`, which lists four other legs (`node scripts/check.mjs list`).

### P2. CBP one vintage behind: 2022 is served while 2023 is live

- **Symptom:**
  - `MAX(year)=2022` in `census_cbp_fl`.
  - The served macro-florida fact reads "Florida CBP 2022: top sectors by establishment count …".
  - `curl -s -o /dev/null -w "%{http_code}" https://api.census.gov/data/2023/cbp.json` returns 200 (metadata `"temporal": "2023/2023"`), and `…/data/2024/cbp.json` returns 404.
  - A keyed data call returns 1,187 rows for Lee with the pipeline's exact field list: `https://api.census.gov/data/2023/cbp?get=NAICS2017,NAICS2017_LABEL,ESTAB,EMP,PAYANN,NAME&for=county:071&in=state:12&key=<elided>`.
- **Root cause:** `CBP_YEARS = [2017, …, 2022]` is hard-coded at `ingest/pipelines/census_cbp/resources.py:10`. There is also a duplicate at `constants.py:2`. The pipeline does not import it, but the test does: `ingest/tests/pipelines/census_cbp/test_resources.py:5` reads `from ingest.pipelines.census_cbp.constants import CBP_YEARS`. So the test checks the duplicate, not the list the pipeline actually uses.
- **Latent trap:** `resources.py:48-50` answers any non-200 year with `continue`. A new year that returns 400 because a NAICS variable was renamed would vanish silently, since the 230,006 floor (`:18`) only catches losing an existing year.
- **Severity:** blocks a served number being current. The number is not wrong, because the year is labelled.
- **First seen:** 09/26/2026, this audit.

### P3. The CBP citation link is broken in every served CBP metric

- **Symptom:**
  - The served macro-florida page carries 5 citation URLs of the form `api.census.gov/data/2022/cbp?get=NAICS2022,ESTAB` (counted with `grep -o "api.census.gov/data/[0-9]*/cbp?get=[A-Z0-9,]*" | sort | uniq -c`).
  - With a key, that URL returns HTTP 400 "error: unknown variable 'NAICS2022'".
  - Keyless, it returns 302 to `missing_key.html`.
- **Root cause:** `refinery/packs/macro-florida.mts:280` hard-codes `NAICS2022`, while the data uses NAICS2017 (`resources.py:37`).
- **Severity:** cosmetic for the number, but it breaks provenance. A reader who clicks the citation lands on an error.
- **First seen:** 09/26/2026.

### P4. ACS two vintages behind: 2022 is served while 2024 is live

- **Symptom:**
  - `MAX(acs_year)=2022`.
  - `…/data/2023/acs/acs5.json` and `…/data/2024/acs/acs5.json` both return 200; `…/data/2025/acs/acs5.json` returns 404.
  - A keyed 2024 call returns `["ZCTA5 33901","24481","51816","33901"]` for B01003_001E and B19013_001E.
- **Root cause:**
  - `ACS_LATEST_YEAR = 2022` at `ingest/pipelines/census_acs/constants.py:17`.
  - The registry itself calls it "a MANUAL one-line bump per vintage" (`ingest/cadence_registry.yaml:762`).
  - The code comment disagrees. `constants.py:16` says "the GHA cron bumps this one line", but nothing in `census-acs-annual.yml` edits the file. The registry line is verified; the code comment needs correcting (item 4 replaces it).
- **Severity:** blocks a served number being current. ZIP report and email numbers are 2018-2022 estimates, correctly labelled.
- **First seen:** 09/26/2026.

### P5. Collier's FHFA metric has never been served live; a fixture invents the vendor rows

- **Symptom:**
  - Live query: Naples-Marco Island has all-transactions and expanded-data only, with no purchase-only rows.
  - The source agrees. The 09/26 fetch of `hpi_master.json` (60,272,522 bytes, 186,011 rows) lists purchase-only quarterly for 15980 and FL, and nothing for 34940.
  - The served properties-collier-value (`refined_at: 2026-09-23T04:26:05Z`) carries no `fhfa_naples*` metric. Its only FHFA trace is citation `s03`.
- **Root cause:**
  - `refinery/sources/fhfa-hpi-source.mts:175-183` filters purchase-only.
  - `properties-collier-value.mts:315,477` emit only `if (fhfa?.naples_msa)`.
  - `refinery/__fixtures__/fhfa-hpi.sample.json:1589-1640` contains Naples purchase-only rows that the vendor does not publish, so the tests pass.
  - `docs/standards/data-roots.md:1231` claims the route is live. It also names the wrong ingest path, `ingest/pipelines/fhfa_hpi/pipeline.py` (`:1226`), when the real one is `ingest/pipelines/fhfa/pipeline.py`.
- **Severity:** blocks a consumer. Collier's value brain has no price-index benchmark, and the brain cites a source it does not use.
- **First seen:** 09/26/2026, this audit. The fixture predates it.

### P6. The FHFA cron fires about six weeks after each quarterly release

- **Symptom:**
  - The lake's latest period is 2026Q1.
  - The 09/26 source fetch carries 2026Q2 for 15980, 34940 and FL.
  - A crawl4ai fetch of `https://www.fhfa.gov/data/hpi` shows quarterly releases on the last Tuesday of Feb, May, Aug and Nov (for example "Tuesday, November 24 … 2026Q3").
  - The 2026Q2 packet is already linked.
- **Root cause:** `fhfa-hpi-quarterly.yml:7` is `0 13 8 1,4,7,10 *`, so the next run is 10/08/2026.
- **Severity:** a consumer reads a stale quarter.
- **First seen:** 09/26/2026.

### P7. FAF5 has never landed from Actions on the current code path, and its dry-run is a no-op

- **Symptom:**
  - 4 runs: 3 red on 05/26/2026 on the retired dlt path. The classifier returns `SCHEMA_DRIFT` on 26459292357 and 26457902767 ("relation data_lake.faf_sctg_lookup does not exist").
  - 26455970691 was not a transient DNS blip. Its log reads `could not translate host name "aws-0-<us-east-1>.pooler.supabase.com" to address`: the Postgres credential secret held a literal template placeholder at the time. `classify()` returns `UNKNOWN` on that log (`node -e "import('./.github/scripts/classify-cron-failure.mjs')…"` on the `gh run view 26455970691 --log-failed` output). UNKNOWN is the class that routes to the heal L2 model leg (§10 Leg 2).
  - 1 green, 27491047049, which is a dry-run whose log reads "Dry run — skipping write."
  - `docs/cron-rebuild-failures.md:35` marks the incident RESOLVED on the strength of that green. X verified: the old path is retired. Y needs review: the new path has never been exercised in Actions.
- **Root cause:**
  - `faf5_to_parquet.py:110-112` returns before downloading anything when run as a dry-run.
  - The script still builds an unused `dlt.pipeline` (`:125-129`).
  - The version URL and years are pinned in 5 places: `faf5/constants.py:2` (URL), `constants.py:9` (FAF5_YEARS), `faf5_to_parquet.py:50` (HISTORICAL_YEARS), `refinery/sources/faf5-source.mts:23` (FAF5_VINTAGE) and `:33` (HISTORICAL_YEARS).
  - The script prints manual paste instructions (`faf5_to_parquet.py:188-196`).
- **Severity:** blocks the next vintage. Today's number is fine, because 5.7.1 is current.
- **First seen:** 05/26/2026 (run list).

### P8. FDOT's consumer year is pinned by hand

- **Symptom:** `LATEST_FDOT_YEAR = 2025` at `refinery/sources/fdot-source.mts:50` and at `fdot-freight-source.mts:62`. When 2026 AADT lands, both consumers will keep serving 2025 until someone edits two files.
- **Root cause:** a manual constant, the same shape as P2, P4 and P7.
- **Severity:** a future stale read. Today the lake's MAX(yearx)=2025 equals the constant.
- **First seen:** 09/26/2026.

### P9. Freshness monitoring measures landing, never vintage

- **Symptom:** the landing times all look healthy:
  - `_dlt_loads` shows census_cbp last good at 09/15/2026 and fdot_aadt_tier2 at 09/15/2026, so both read FRESH.
  - But the CBP data year is 2022, the ACS year is 2022 and the FHFA quarter is 2026Q1.
  - The doctor agrees with the landing clock. Today's freshness-probe run 36259690113 prints all six rows as `FRESH | OK | NO_CONTRACT | GREEN` (`gh run view 36259690113 --log | grep -E "census_cbp|census_acs|fdic_bankfind|fhfa|faf5|fdot"`). So on the ops surface, three stale vintages read green today.
- **Root cause:**
  - `ingest/scripts/check_freshness.py:274-279` reads `MAX(inserted_at) FROM data_lake._dlt_loads` by schema name.
  - None of the six registry entries has a `freshness_sla` or any vintage field.
  - The manual-vintage shape sits at **10 sites across 4 pipelines**:
    - cbp: `resources.py:10` and `constants.py:2`
    - acs: `constants.py:17`
    - faf5: the 5 sites listed in P7
    - fdot: the 2 sites listed in P8
- **Severity:** blocks every stale-number alarm for the family.
- **First seen:** 09/26/2026.

### P10. Stale or wrong registry and doc claims

Registry, found with `grep -n` on `ingest/cadence_registry.yaml`:

- `:1119,1124` say FHFA confirmed 133,226 rows, but the live count is 184,817. The floor of 119,903 is now 65% of live, so a 30% partial pull would pass.
- `:1148` says FDOT is "statewide filtered to Lee/Collier", but the table holds 67 counties unfiltered.
- `:1120` (FHFA) and `:1142` (FDOT) both read "Verified: MAX(inserted_at) = 2026-05-18". The live `_dlt_loads` maxima are 07/08/2026 (fhfa_hpi) and 09/15/2026 (fdot_aadt_tier2). This is the same stale-confidence shape as `:739`.
- `:424` says "data_lake.faf_flows is a cache", but no `faf%` table exists in data_lake (information_schema query).
- `:739` reads "Verified: MAX(inserted_at) = 2026-05-20"; the live value is 09/15/2026.
- `:758`: the ACS floor is 90 in the registry but 80 in code (`census_acs/constants.py:43`).

Code:

- `fhfa/resources.py:41,72` say "~13 MB"; the 09/26 download was 60,272,522 bytes.
- `fhfa/pipeline.py:8` prints "~133k records"; the source has 186,011 rows and the table has 184,817.
- `scripts/notion-sync.mjs:1223` says `data_lake.fhfa_hpi` feeds "housing-swfl + master". The real readers are properties-lee-value and properties-collier-value (`fhfa-hpi-source.mts`, registry `:1114`).

Severity: cosmetic, apart from the FHFA floor, which weakens a guard.

### P11. Corpse view still present

- `data_lake.fdot_aadt_swfl_yearly` still exists (information_schema query).
- It was marked "DELETE — safest [NEEDS-SIGN-OFF]" on 07/18 (`_RESEARCH/audits/2026-07-18-data-consolidation/P7-corpse-deletelist.md:30,116-127`), and nothing reads it (`_RESEARCH/audits/2026-07-18-data-consolidation/P4-unmapped-tables.md:151-162`).
- Severity: cosmetic.

### P12. The classifier's signal text is wrong on the CBP timeout

- **Symptom:** `classify()` on the log tail of 26459317423 returns `{"klass":"TRANSIENT","signal":"429",…}`. The real cause is "HTTPSConnectionPool(host='api.census.gov', port=443): Read timed out. (read timeout=60)".
- **Root cause:** the signal regex at `.github/scripts/classify-cron-failure.mjs:204` contains a bare `429` with no word boundary. It matches the fractional-seconds timestamp `15:53:43.3442955Z` that sits earlier in the log. The class decision at `:199` uses `\b429\b` and is correct.
- **Severity:** cosmetic, since the class is right. The file is shared across families.
- **First seen:** 05/26/2026.

### P13. Dark root inside fdic_bankfind

- `fdic_locations` (298 rows) and `fdic_institutions` (199 rows) land with no reader.
- This is already tracked as the open check `fdic_directories_no_consumer` (`node scripts/check.mjs list`); cited, not re-derived.
- Severity: blocks nothing.

## 5. What is missing

### census_cbp

- **Against the source ceiling:** the registry ceiling names the Census Building Permits Survey (`registry:746`). Research already holds a live BPS fetch: county rows for Jan 2010 and Jul 2026 (`_RESEARCH/INDEX.md:320`, `2026-09-18-data-access-and-outcome-feasibility.md`).
- **Against the source:** the 2023 vintage (P2). ZIP-grain Business Patterns (ZBP) is unpulled. The bizform scout confirmed that CBP has county and ZIP grain (`_RESEARCH/INDEX.md:494`).
- **Missing consumer:** 14,849 Lee, Collier and Hendry rows land, but nothing reads county grain.
  - macro-florida sums all 67 counties (`docs/sql/20260623_census_cbp_fl_agg_by_naics_view.sql:5-27`).
  - macro-swfl already serves county establishment counts from BLS QCEW, so a county CBP read would add only 6-digit NAICS detail. That is a product call (§12).

### census_acs

- **Against the source ceiling:** SAIPE, Nonemployer Statistics and Population Estimates (`registry:770`).
- **Against the source:** the 2023 and 2024 vintages (P4).
- **Tests:** there is no `ingest/tests/pipelines/census_acs/` at all (listing of `ingest/tests/pipelines/`).

### fdic_bankfind

- **Against the source ceiling:** `/history`, `/failures`, `/summary`, `/demographics` and `/financials` (`registry:700`).
- **Missing consumers:** the directory tables (P13).
- **Hendry is computed but not served:**
  - The source builds a Hendry rollup (`refinery/sources/fdic-deposits-source.mts:36,111`), but macro-swfl emits only Lee and Collier (`refinery/packs/macro-swfl.mts:568-569`, the two `pushDeposits` calls).
  - The served page carries `fdic_lee_*` and `fdic_collier_*` and no `fdic_hendry_*` (`curl -s https://www.swfldatagulf.com/api/b/macro-swfl | grep -o 'fdic_[a-z]*_[a-z_]*' | sort -u`).
  - The lake has the data: Hendry 2026 shows 5 branches and 685,788 thousand USD.
  - Adding a metric changes key_metrics, so this is ASK-FIRST (§12 question 4), not a DO item.
- **Proof of a real GHA write:** the first scheduled real write happens on 10/20/2026.

### fhfa

- **Against the source ceiling:** county- and ZIP-level annual HPI (`registry:1128`).
- **Against the consumer:** a Naples series the consumer can actually use (P5). The North Port and Punta Gorda MSAs are queried (`fhfa-hpi-source.mts:15,35-38`), but they sit outside the three-county scope.

### faf5

- **Against the source ceiling:** transport mode, which we never read, so every freight number we serve is mode-blind (`registry:430`; also `docs/standards/data-roots.md:282`).
- **Also on the ORNL page but unpulled:**
  - the High/Low forecast bands (`FAF5.7.1_HiLoForecasts.zip`, 406MB)
  - the State database
  - the 1997-2012 reprocessed state file
  - Experimental County-Level Estimates, the only route to a Lee or Collier grain
- **Unused years:** FAF5_YEARS covers 2017-2019, but no year partition is written for them (`faf5_to_parquet.py:50`).
- **Tests:** zero.

### fdot

- **Against the source ceiling:** 1 of 1,586 FDOT ArcGIS layers is pulled. Crash and fatality data, the bridge inventory, the 5-Year Work Program and others are not (`registry:1150`, `docs/standards/data-inventory.md:223`).
- **Continuous-count stations** (daily grain) are "still unproven" and behind a guest CAPTCHA (`_RESEARCH/INDEX.md:319-320`). A future browser job would belong on Fedora (§9), but no plan item here builds it.

## 6. Verdict per pipeline

- **census_cbp — IMPROVE.**
  - The ingest is healthy, but it is one vintage behind, its citation link is broken, and its only consumer brain has been dead since 07/19.
  - Number that changes the verdict: `SELECT MAX(year) FROM data_lake.census_cbp_fl` reaching 2023 while the served macro-florida `refined_at` is under 30 days old → GOOD ENOUGH.
- **census_acs — IMPROVE.**
  - Two vintages behind on a live, request-time surface, with zero ingest tests.
  - Number: `SELECT MAX(acs_year) FROM data_lake.census_acs_zcta` = 2024 → GOOD ENOUGH.
- **fdic_bankfind — GOOD ENOUGH.**
  - 10,759 rows, 1994-2026, all three counties, served in macro-swfl as of 09/26.
  - Number: the conclusion of the first scheduled real run on 10/20/2026 (`gh run list --workflow fdic-bankfind-annual.yml --limit 1`). Anything but success → REPAIR.
- **fhfa — IMPROVE.**
  - Lee is served. Collier's metric is dark, and the cron trails each release by weeks.
  - Number: the count of served `fhfa_naples*` metrics on `/api/b/properties-collier-value`. At 1 or more, or with the operator choosing "no Collier FHFA" in §12 → GOOD ENOUGH.
- **faf5 — REPAIR.**
  - The data is at the source version, but the pipe has never landed from Actions: its dry-run does nothing and five pins need hand edits.
  - Number: one real green `faf5-annual.yml` run that leaves a `_tier1_inventory` row stamped that day.
- **fdot — GOOD ENOUGH.**
  - Five real loads (05/18, 07/03, 07/15, 08/15, 09/15 in `_dlt_loads`), the 2025 vintage current, guards proven.
  - Number: `SELECT MAX(yearx) FROM data_lake.fdot_aadt_fl` exceeding `LATEST_FDOT_YEAR` (2025) while the constant stays put → IMPROVE. Plan item 8 removes that risk.

## 7. The plan

Ordered by what unblocks served numbers first. Lanes are defined in the brief (D = deterministic, M = Max plan, C = Codex, L = local).

### Item 1. Remove the dead triage call from macro-florida and macro-us — DO

- **What:**
  - Write a failing test first, named for the failure mode: `refinery/packs/macro-florida.test.mts` gets "macro-florida never calls the triage agent (credit-wall hole)", asserting `skipTriageAgent === true`. Do the same for macro-us in a new file, `refinery/packs/macro-us.test.mts`; none exists today (`ls refinery/packs/macro-us.test.mts` fails).
  - Then add `skipTriageAgent: true` at `refinery/packs/macro-florida.mts:408` and `refinery/packs/macro-us.mts:227`. That is 2 of 2 sites for this shape.
- **Behavior:** unchanged. The cutoff is 0 and every multiplier is positive (§4 P1).
- **Where:** those two packs and their tests.
- **Lane:** D. No model at all.
- **Effort:** S.
- **Proof:**

```
bun test refinery/packs/macro-florida.test.mts refinery/packs/macro-us.test.mts
gh run view <next nightly-chain id> --log | grep -E "pack=macro-(florida|us) status|BUILD FAILED — pack=macro-(florida|us)"
curl -s https://www.swfldatagulf.com/api/b/macro-florida | sed -n 3,6p
```

- **Unblocks:** macro-florida and macro-us are served again, which removes a `critical: true` hole under master and under macro-swfl and sector-credit-swfl. It also removes one unattended LLM leg (§10).

### Item 2. CBP vintage discovery, 2023 landed, loud failure on a renamed variable — DO

- **What:**
  - In `ingest/pipelines/census_cbp/resources.py`, replace the hard-coded `CBP_YEARS` (`:10`) with discovery: probe `https://api.census.gov/data/{y}/cbp.json` upward from 2017 until the first 404.
  - For each discovered year, read `…/data/{y}/cbp/variables.json` and pick the `NAICS20xx` variable present there. No NAICS variable is a hard error.
  - Change `:48-50` so a non-200 for a **discovered** year raises instead of `continue`.
  - Repoint `ingest/tests/pipelines/census_cbp/test_resources.py:5` at the discovery function in `resources.py`, then delete the duplicate `constants.py`. Deleting it first breaks test collection, because that line imports `CBP_YEARS` from it.
  - After the first land, reset `_MIN_ROWS` (`:18`) and `expected_rows_min` (`registry:737`) to 90% of the landed count.
  - Tests: discovery stops at 404; a missing NAICS variable raises; the existing floor tests stay green.
- **Lane:** D.
- **Effort:** M.
- **Proof:**

```
ingest/.venv/Scripts/python.exe -m pytest -q ingest/tests/pipelines/census_cbp
SELECT MAX(year), COUNT(*) FROM data_lake.census_cbp_fl;   -- expect 2023
```

- **Unblocks:** the 2023 CBP numbers, and every future vintage without a code edit.

### Item 3. Fix the CBP citation link — DO

- **What:** at `refinery/packs/macro-florida.mts:280`, cite `https://api.census.gov/data/${s.year}/cbp.html` (returns 200 keyless) and name the NAICS variable in the citation text. Keyed data URLs cannot be followed by a reader. Add a test that the URL has no `get=` parameter.
- **Lane:** D.
- **Effort:** S.
- **Proof:**

```
curl -s -o /dev/null -w "%{http_code}" https://api.census.gov/data/2022/cbp.html   # 200
bun test refinery/packs/macro-florida.test.mts
```

- **Unblocks:** provenance on 5 served citations.

### Item 4. ACS vintage discovery plus a first test suite — DO

- **What:**
  - Make `ACS_LATEST_YEAR` (`ingest/pipelines/census_acs/constants.py:17`) a floor, not the answer. At run time, probe `…/data/{y}/acs/acs5.json` upward from it and use the newest year that returns 200. Log the chosen year.
  - Create `ingest/tests/pipelines/census_acs/` with tests for `_num` suppression→NULL, `_moved_pct`, vintage discovery stopping at 404, and the 80-row floor.
  - Align the registry floor (`:758`) and the code floor (`constants.py:43`) to one value.
  - The consumer labels are already derived from `acs_year` (`lib/zip-summary/load.ts:41-44`, `lib/email/market-context.ts:167`), so there is no consumer change.
- **Lane:** D.
- **Effort:** M.
- **Proof:**

```
ingest/.venv/Scripts/python.exe -m pytest -q ingest/tests/pipelines/census_acs
SELECT DISTINCT acs_year FROM data_lake.census_acs_zcta;   -- expect 2024 after the next run
```

- **Unblocks:** ZIP report and email demographics move from 2018-2022 to 2020-2024.

### Item 5. Move the FHFA cron to follow the release — DO

- **What:**
  - Change `fhfa-hpi-quarterly.yml:7` to `0 13 6 3,6,9,12 *`. Day 6 has no other job: `node scripts/schedule-catalog.mjs` lists day-4/5 jobs only (fema-nfip, fgcu-reri, fl-dbpr-licenses, market-aggregates-details, noaa-ghcn, realtor-geo-trends).
  - The new slot lands 6 to 12 days after FHFA's last-Tuesday-of-Feb/May/Aug/Nov quarterly release. From the crawled calendar: 11/24/2026 → 12/06, 02/23/2027 → 03/06, 05/25/2027 → 06/06, 08/31/2027 → 09/06.
  - Update the comment at `:5-6`.
  - **Sequencing trap:** the current cron's next run is 10/08/2026, and that run would pick up 2026Q2. The new cron's first run after today is 12/06/2026. If the edit lands before 10/08 and nothing else happens, 2026Q2 arrives two months later than it would have. So land the edit after the 10/08 run succeeds, or follow it with one `workflow_dispatch` (a real run, not `dry_run`). That dispatch is prescribed here and not performed by this audit.
- **Lane:** D.
- **Effort:** S.
- **Proof:**

```
node scripts/schedule-catalog.mjs | grep -A4 fhfa-hpi-quarterly
```

- **Unblocks:** the stale quarter (P6). Lee's served HPI is current within about two weeks of each release.

### Item 6. Make the FHFA fixture vendor-true and stop citing a source with no metric — DO (tests and fixture)

- **What:**
  - Replace the invented Naples purchase-only rows at `refinery/__fixtures__/fhfa-hpi.sample.json:1589-1640` with the vendor's real shape: Naples all-transactions and expanded-data only.
  - Add the test "naples has no purchase-only series → no fhfa_naples metric" in `properties-collier-value.test.mts`.
  - Fix `docs/standards/data-roots.md:1226,1231` (path, and the route marked not-live), following that file's own append rules.
  - The citation-list change on the served brain belongs with item 7.
- **Lane:** D.
- **Effort:** S.
- **Proof:**

```
bun test refinery/packs/properties-collier-value.test.mts
```

- **Unblocks:** a test suite that tells the truth.

### Item 7. Decide Collier's FHFA number — ASK-FIRST

This changes collier-value's key_metrics (CLAUDE.md RULE 1).

- **Option A:** serve Naples-Marco Island **all-transactions** (168 rows live, through 2026 period 1), labelled as such. All-transactions includes refinance appraisals. Change `fhfa-hpi-source.mts:175-183` to fall back per MSA and carry the flavor in the label.
- **Option B:** drop FHFA from the Collier brain, citation included.
- **Lane:** D.
- **Effort:** S.
- **Proof:**

```
curl -s https://www.swfldatagulf.com/api/b/properties-collier-value | grep -o "fhfa_naples[a-z_]*" | sort -u
```

- **Unblocks:** P5. See §12.

### Item 8. Derive FDOT's latest year from the data — DO

- **What:**
  - Replace `LATEST_FDOT_YEAR = 2025` at `refinery/sources/fdot-source.mts:50` and `fdot-freight-source.mts:62` (2 of 2 sites) with `MAX(year)` read from `data_lake.fdot_aadt_county_year`. The fixture mode keeps a fixture constant.
  - The Ian baseline (2022) stays fixed.
  - Tests: the latest year follows the data, and the 5-year window shifts with it.
- **Lane:** D.
- **Effort:** M.
- **Proof:**

```
bun test refinery/sources/fdot-source.test.mts refinery/packs/traffic-swfl.test.mts refinery/packs/logistics-swfl-nowcast.test.mts
```

- **Unblocks:** 2026 AADT is served the month it lands.

### Item 9. Make FAF5 runnable and self-versioning — DO

- **What (DO):**
  - In `ingest/scripts/faf5_to_parquet.py`:
    - The dry-run (`:110-112`) must download, parse and run the floor check, printing row counts with no upload.
    - Delete the unused `dlt.pipeline` (`:125-129`).
    - Discover the newest regional mid-range zip from `https://faf.ornl.gov/faf5/`: the link text is "Regional database for …(mid-range estimates only)" and the file is `FAF5.x.y.zip`. Derive `FAF5_YEARS` and `HISTORICAL_YEARS` from that file's column headers, not constants.
    - Keep writing the discovered zip URL into `_tier1_inventory.source_url`. The script already does this at `:140` and `:157`, and all 11 rows carry `FAF5.7.1.zip` today, so the item 10 signal reads the version from there. Leave `vintage` as it is: the year rows write `str(year)` at `:156`, so that column can never hold a version.
  - In `refinery/sources/faf5-source.mts`, derive the year list from the inventory (`id LIKE 'lake-tier1/faf5/year=%'`) instead of the constants at `:23,33`.
  - Change `faf5-annual.yml:8` to monthly at `0 13 17 * *`. Day 17 has no job in `node scripts/schedule-catalog.mjs`; day 16 has `ingest-bls-ppi.yml` at `0 14 16 * *`. The script exits 0 without uploading when the discovered version equals the landed one.
  - Add tests in `ingest/tests/pipelines/faf5/`: version discovery from a saved page, the header→years parse, and the floor.
- **Lane:** D.
- **Effort:** M.
- **Before the first real run from Actions:** copy the five `lake-tier1/faf5/year=*/faf_flows.parquet` objects aside, for example to `lake-tier1/faf5/_backup-<date>/`. The run overwrites them in place (`faf5_to_parquet.py:147-162`); with the copy, the run can be reverted in under 5 minutes, which keeps this item off the ASK-FIRST list.
- **Proof:**

```
gh run list --workflow faf5-annual.yml --limit 1 --json conclusion,event
SELECT id, updated_at, vintage FROM data_lake._tier1_inventory WHERE id LIKE 'lake-tier1/faf5/%' ORDER BY updated_at DESC LIMIT 8;
```

- **Unblocks:** P7, and the next FAF release lands without a hand edit.

### Item 10. The vintage-lag signal (design in §8) — DO, after items 8 and 9

- **What:**
  - Add a `vintage:` block to the six registry entries.
  - Teach `ingest/scripts/check_freshness.py` to read each entry's lake max, run its keyless source probe (FHFA uses its calendar threshold), and report AHEAD, EQUAL or PROBE_ERROR.
  - Sync one `vintage_lag_<name>` check per pipeline through the same open/auto-close code as `sync_gap_checks` (`check_freshness.py:646-712`).
  - Tests go in `ingest/tests/scripts/`.
- **Lane:** D.
- **Effort:** M.
- **Proof:**

```
python -m ingest.scripts.check_freshness --dry-run | grep -i vintage
node scripts/check.mjs list | grep vintage_lag_
```

On today's lake, this should list census_cbp, census_acs and fhfa as lagging.

- **Unblocks:** P9. The next stale vintage is caught without an audit.

### Item 11. Registry and doc hygiene — DO

- **What:**
  - Correct `registry:424,739,1120,1142,1148`.
  - Fix the "~133k records" print at `fhfa/pipeline.py:8`, and the FHFA consumer line at `scripts/notion-sync.mjs:1223`.
  - Reset FHFA `confirmed_total` to the live 184,817 and the floor to 166,335 (184,817 × 0.9 = 166,335.3), both at `registry:1119,1124` and at `fhfa/resources.py:80`.
  - Fix the "~13 MB" comments at `fhfa/resources.py:41,72`.
  - Add a correcting entry on top of `docs/cron-rebuild-failures.md` for row 35: the 06/14 "success" was a no-op dry-run.
- **Lane:** D.
- **Effort:** S.
- **Proof:**

```
grep -n "133226\|faf_flows is a cache\|filtered to Lee/Collier" ingest/cadence_registry.yaml   # expect nothing
ingest/.venv/Scripts/python.exe -m pytest -q ingest/tests/test_cadence_registry_spine.py
```

- **Unblocks:** guard strength, and honest maps.

### Item 12. Word-boundary the classifier signal — DO

- **What:** change the bare `429` at `.github/scripts/classify-cron-failure.mjs:204` to `\b429\b`, matching `:199`. Add a test fixture containing a timestamp with `…3442955Z`.
- **Scope:** this file is shared. Tell family 19 so the change lands once.
- **Lane:** D.
- **Effort:** S.
- **Proof:**

```
node --test .github/scripts/classify-cron-failure.test.mjs
```

(or the file's existing test runner)

- **Unblocks:** honest incident rows.

### Item 13. Drop the corpse view — ASK-FIRST (schema drop)

- **What:** `DROP VIEW IF EXISTS data_lake.fdot_aadt_swfl_yearly;`, per `P7-corpse-deletelist.md:116-127`, run as an idempotent migration with the row count logged.
- **Lane:** D.
- **Effort:** S.
- **Proof:**

```
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='data_lake' AND table_name='fdot_aadt_swfl_yearly';   -- 0
```

### Item 14. Watch FDIC's first scheduled real write — DO (observe only)

- **What:** on or after 10/20/2026, confirm the scheduled run is green and that `_dlt_loads` has a fdic_bankfind row that day.
- **Lane:** D.
- **Effort:** S.
- **Proof:**

```
gh run list --workflow fdic-bankfind-annual.yml --limit 1 --json conclusion,createdAt,event
SELECT MAX(inserted_at) FROM data_lake._dlt_loads WHERE schema_name='fdic_bankfind' AND status=0;
```

### Totals

14 items. 12 are DO: 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12 and 14. 2 are ASK-FIRST: 7 and 13. Item 10 ships after items 8 and 9 (see §8).

## 8. Checks and balances

### The design rule

One signal per pipeline. It fires only when a served number is behind the source or a consumer would read a stale vintage, and it closes itself when the vintage catches up. No GitHub issue is filed per run.

### The mechanism: extend two existing seams, add no new gate

- **Seam 1, the registry.** Each entry gets a `vintage:` block, read by `ingest/scripts/check_freshness.py`, which already runs daily from `freshness-probe-daily.yml` (`0 14 * * *`).
- **Seam 2, the checks ledger.** The probe opens and auto-closes `vintage_lag_<pipeline>` checks with the same code shape as `sync_gap_checks`. That code inserts on a new gap, re-opens a check marked `done` if the gap returns, never re-flags a human `dropped`, and auto-closes with `resolved_by='freshness-probe (auto)'` (`check_freshness.py:646-712`).
- **Not a pipeline gate.** This is post-hoc observability. It adds no pre-materialization step, so it stays inside RULE 3 C2.
- **No exit code.** The signal must not use `freshness_sla.error_after_days`. That path makes the check_freshness step exit 1 (`check_freshness.py:1044-1045`), which would redden that step every day a vintage lags.
- **Read the signal in the ledger, not in the workflow conclusion.** `freshness-probe-daily.yml` has already concluded `failure` on each of its last 10 scheduled runs, 09/17 through 09/26 (`gh run list --workflow freshness-probe-daily.yml --limit 10`). In run 36259690113 the only failed step is "doctor (pipeline health — gating)" (`python -m ingest.scripts.doctor --cron --fail-on red`, `freshness-probe-daily.yml:71`). The check_freshness step itself passes. The open check `cron_incident_freshness_probe_daily` and issue #110 track that red, and it belongs to family 19.
- **The doctor is the third seam, and it is blind here.** The doctor (`ingest/scripts/doctor`) prints all six family rows as `FRESH | OK | NO_CONTRACT | GREEN` in run 36259690113 (see P9). The vintage checks do not feed the doctor's `--fail-on red`. Keeping them out of that gate is deliberate: a vintage lag is a check to act on, not a reason to fail the daily probe.

### The integer-year trap

Do not point `freshness_column` at an integer year column. `_to_date` (`check_freshness.py:214-219`) raises `ValueError` on an int. It is called after `_fetch_max_freshness`'s try/except has closed (the except is at `:307`, the call at `:318`), so the error escapes to `run_probe`. There, the per-entry backstop (`:726-745`) catches it and reports that entry as MISCONFIGURED. The rest of the probe survives, but the pipeline loses its landing-freshness row. The `vintage:` block therefore needs its own evaluator, which turns year, quarter or June-30 values into a date and leaves `freshness_column` alone.

### What the signal compares

A calendar threshold alone would fire when the vendor is late, not when we are behind. For example, if Census published 2024 CBP after an arbitrary date, the alarm would go off while we were current. So the evaluator compares **the newest vintage in the lake** against **the newest vintage the source offers today**, using one cheap keyless probe per pipeline.

- The check opens when the source is ahead of the lake and auto-closes when the lake catches up.
- There is no grace window, by design. With a working pipeline, an open check lasts at most one cron interval. If it lasts longer, the pipeline is broken.
- If a probe cannot reach the source (network error, 5xx, an unparseable body), the result is `PROBE_ERROR` in the probe summary. It never closes an open check and never opens a new one. An unreachable source must not read as "not ahead", because that would be a false pass, which never self-heals (check-signal skill).

### Registry values, one per pipeline

Every probe below was run keyless on 09/26/2026.

- **census_cbp:**
  - Config: `vintage: {table: data_lake.census_cbp_fl, column: year, source_probe: census_dataset, probe_url: "https://api.census.gov/data/{next}/cbp.json"}`, where `{next}` is the lake max plus 1.
  - A 200 means the source is ahead. Today `/data/2023/cbp.json` returns 200 and `/data/2024/cbp.json` returns 404, so the check opens: the lake is at 2022. It closes once 2023 lands (item 2).
- **census_acs:**
  - Config: `vintage: {table: data_lake.census_acs_zcta, column: acs_year, source_probe: census_dataset, probe_url: "https://api.census.gov/data/{next}/acs/acs5.json"}`.
  - Today `/data/2023/acs/acs5.json` returns 200, so the check opens: the lake is at 2022. `/data/2025/acs/acs5.json` returns 404, so it closes once 2024 lands (item 4).
- **fdic_bankfind:**
  - Config: `vintage: {table: data_lake.fdic_sod, column: year, source_probe: json_max, probe_url: "https://api.fdic.gov/banks/sod?filters=STCNTYBR:12071&fields=YEAR&sort_by=YEAR&sort_order=DESC&limit=1&format=json", json_path: "data[0].data.YEAR"}`.
  - Today the probe returns `"YEAR":2026`, which equals the lake max of 2026, so the check stays closed. That is the negative test.
- **fhfa:**
  - This is the one calendar exception. The source file is 60,272,522 bytes, too heavy for a daily probe, and FHFA publishes a fixed release calendar (crawled from `fhfa.gov/data/hpi`).
  - Config: `vintage: {table: data_lake.fhfa_hpi, year_column: yr, period_column: period, grain: quarter_end, where: "place_id='15980' AND hpi_flavor='purchase-only' AND frequency='quarterly'", max_lag_days: 165}`.
  - 165 days sits past the release (quarter end plus about 55 days) and past item 5's new cron (quarter end plus about 68 days), so a fire means we missed a scheduled release.
  - 06/30 + 165 = 12/12, which clears the Q3 release (11/24) and the cron (12/06). Today, 2026Q1 gives 03/31 + 165 = 09/12, so the check is open, correctly: 2026Q2 is published.
- **faf5:**
  - Config: `vintage: {table: data_lake._tier1_inventory, column: source_url, extract: "FAF5\\.[0-9]+\\.[0-9]+\\.zip", where: "id LIKE 'lake-tier1/faf5/year=%'", source_probe: html_regex, probe_url: "https://faf.ornl.gov/faf5/", regex: "FAF5\\.[0-9]+\\.[0-9]+\\.zip"}`.
  - It compares the newest regional zip named on the page with the zip named in the landed rows' `source_url`. It must not read the `vintage` column, which holds `2020`…`2024` for the year rows and `2026-05-19` / `2026-05-20` for the dated rows (§2), so it never holds a version.
  - Today the page names `FAF5.7.1.zip`. The regex matches only the bare regional file, not the `_State`, `_HiLoForecasts` or `_access` variants (`curl -s https://faf.ornl.gov/faf5/ | grep -o "FAF5\.[0-9]*\.[0-9]*[A-Za-z_]*\.zip"` lists 8 files, and 1 of them matches). All 11 landed rows carry `…/FAF5.7.1.zip`, so the check stays closed.
- **fdot:**
  - Config: `vintage: {table: data_lake.fdot_aadt_fl, column: yearx, source_probe: json_max, probe_url: "https://gis.fdot.gov/arcgis/rest/services/FTO/fto_PROD/MapServer/7/query?where=1%3D1&outStatistics=%5B%7B%22statisticType%22%3A%22max%22%2C%22onStatisticField%22%3A%22YEAR_%22%2C%22outStatisticFieldName%22%3A%22maxy%22%7D%5D&f=json", json_path: "features[0].attributes.maxy"}`.
  - Today the probe returns `maxy: 2025`, which equals the lake max of 2025, so the check stays closed.

### The consumer-pin gap, and why item 10 is ordered after items 8 and 9

A lake-vs-source signal goes green when new data lands, even if a consumer still pins the old year. The places this happens:

- FDOT: `fdot-source.mts:50` and `fdot-freight-source.mts:62`
- FAF5: `faf5-source.mts:23,33`

Items 8 and 9 make those consumers derive the year from the lake, so item 10 ships after them. Until then, those two pins are the known uncovered path. CBP (the SQL view takes `MAX(year)`), ACS (the label comes from `acs_year`), FDIC (the view takes the newest complete year) and FHFA (the newest period) have no consumer pin.

### What this signal does not cover

P1 is not covered. A consumer brain can expire in place: macro-florida sat past its TTL from 08/18 to 09/26 while the lake was fine. The refinery already prints `"<pack>: MISSING (deterministic)"` every night (run 36217671353). Turning that line into one auto-closing check per MISSING pack belongs to the refinery and nightly-chain owner (family 19), not this family.

### Checklist result (check-signal skill)

- **Polarity:** the signal goes red when the source offers a vintage the lake lacks.
- **Already true?** Yes, for census_cbp, census_acs and fhfa. Those are real present defects that items 2, 4 and 5 clear, not stale conditions.
- **Negative test:** fdic_bankfind (2026 = 2026), fdot (2025 = 2025) and faf5 (5.7.1 = 5.7.1) all stay closed today.
- **Fallback path:** an unreachable probe is `PROBE_ERROR`, never a pass.
- **Behavior, not text:** the signal compares live vendor state with lake state, never a registry comment.
- **Served bytes:** it compares against the lake, which the consumers read. The consumer pins are handled by ordering item 10 after items 8 and 9.

### What already covers a run that fails outright

- **Per-run failure:** `log-cron-incident.yml` appends a row and comments on the one sticky issue (`vars.CRON_INCIDENT_ISSUE_NUMBER`, `log-cron-incident.yml:3-6`). It also does more than that:
  - On a failure it opens one `cron_incident_<workflow>` check (`log-cron-incident.mjs:56`) and one `[cron-failure:<workflow>] <CLASS> · …` issue labelled `cron-failure` (`openIncidentIssue`, `log-cron-incident.mjs:218-281`).
  - The issue is de-duplicated per workflow, not per run.
  - It closes only when the next **scheduled** run succeeds (`closeIncidentIssue`, `:283-297`). A dispatch success does not close it.
  - For this family that means a red FAF5 run (cron 03/15 only) keeps its issue open for up to 12 months, and a red ACS run keeps it until the next Nov-Jan window.
  - Today zero `cron-failure` issues are open for the six workflows (`gh issue list --label cron-failure --state open`).
  - All six workflows are on the incident logger's list and on heal's list (grep of the workflow display names).
  - Keep this path as it is. It is per-workflow and self-closing. Its one weakness here, the long dwell on annual crons, is a family 19 knob (auto-resolve on a green dispatch), not something to rebuild for this family.
- **Floor:** `expected_rows_min` plus `count_table` via `check_volume_entry` (`check_freshness.py:431-489`) stays as it is.
- **`assert_landed.py`:** not needed for these six. Each pipeline guards its own replace before writing (`census_cbp/resources.py:78`, `census_acs/resources.py:124`, `fdic_bankfind/resources.py:117-125`, `fhfa/resources.py:80`, `fdot/resources.py:122`, `faf5_to_parquet.py:117`).
- **Ops site:** `https://swfldatagulf-ops.vercel.app/coverage` should show the `vintage_lag_*` checks through the checks feed it already reads. I did not open the ops repo, so whether it renders new check keys without a change is could-not-verify.

### Noise to delete

- **Stale confidence lines in the registry** (`:739`, `:1119/1124`, `:1148`, `:424`). They read as verification and are not (item 11).
- **The L2 LLM diagnosis leg on these six workflows** (`heal-cron-failure.yml:186-192`).
  - The deterministic classifier classifies 4 of this family's 5 recorded reds: TRANSIENT on both CBP read-timeouts (26455961452, 26459317423) and SCHEMA_DRIFT on two FAF5 runs (26459292357, 26457902767).
  - The fifth, FAF5 26455970691 (a placeholder host in the credential secret), comes back UNKNOWN, and UNKNOWN is exactly what triggers the L2 leg.
  - The fix is a deterministic rule rather than a model call. Add `could not translate host name` with a `<…>` placeholder in the host to the classifier as a config-error class. That is the family 19 file, landing together with item 12.
  - When no key is set, `heal-cron-failure.mjs:214-215` already posts a deterministic-only diagnosis.
  - The shared switch `CRON_HEAL_DIAGNOSE_ENABLED` belongs to family 19; recommend it to them rather than editing it here.
- **The false RESOLVED on FAF5** (`docs/cron-rebuild-failures.md:35`): correct it with a new top entry (item 11).
- **Nothing to close** in `node scripts/check.mjs list` for this family. `fdic_directories_no_consumer` is a real dark root. `llm_legs_parked_credit_wall` should not gain macro-florida or macro-us, because item 1 removes those legs rather than parking them.
- **Related open check, not closeable here:** `registry_source_ceiling_no_freshness_field` ("73 source_ceiling blocks record a count, none record the source's last-edit / newest-record date"). Item 10's `vintage:` block gives six of those entries a live, probe-checked newest-vintage reading. That check spans the whole registry, so it stays open; item 10 is the pattern it can copy.

### What not to add

- No new workflow.
- No issue-per-run label.
- No second freshness probe.
- No per-pipeline Slack or email.

## 9. Box placement

All six stay on GHA `ubuntu-latest`. None meets any of the four reasons to move:

- a WAF or residential-IP need
- a job over 6 hours
- a need for the SSD archive
- a need for a browser or a local model

Evidence per pipeline:

- **census_cbp — stays on ubuntu-latest.**
  - The keyed Census API answers GHA IPs (run 34982220418 is green).
  - Run 34982220418 took 2m54s: created 14:31:27, load 14:34:21 per `_dlt_loads`.
  - The raw data is refetchable for free, so there is nothing to archive.
- **census_acs — stays.**
  - Run 29354332608 took 1m45s: created 17:34:28, loaded 17:36:13.
  - The per-ZCTA calls are keyed and not WAF-blocked.
- **fdic_bankfind — stays.**
  - The keyless API answered from GHA (dry-run 35755967549 fetched 10,759 SOD rows).
  - That run took 1m07s: created 16:43:11, updated 16:44:18.
  - The registry already classes it `free_refetchable` (`registry:677`).
- **fhfa — stays.**
  - Run 28953913464 took 1m36s: created 15:17:20, load 15:18:56.
  - The file is 60,272,522 bytes, trivial for a hosted runner.
- **faf5 — stays.**
  - A 291MB zip (ORNL page) fits a hosted runner and a 30-minute timeout (`faf5-annual.yml:23`).
  - Keeping a copy of each FAF version on the Fedora SSD would only matter if ORNL withdrew old versions. The page still hosts every 5.7.1 file, so there is no reason to move.
- **fdot — stays.**
  - Run 34983321273 took 6m13s: created 14:41:16, load 14:47:29.
  - The ArcGIS layer is public and answers GHA IPs.
  - The 40-minute timeout (`fdot-aadt-annual.yml:26`) leaves headroom.

Anything already on the box that should not be: none from this family. All six workflows declare `runs-on: ubuntu-latest` (`census-cbp-annual.yml:22`, `census-acs-annual.yml:24`, `fdic-bankfind-annual.yml:23`, `fhfa-hpi-quarterly.yml:21`, `faf5-annual.yml:22`, `fdot-aadt-annual.yml:22`). No `SWFL_LOCAL_RUNNER_READY` gate is involved.

Future candidate, not in this plan: FDOT continuous-count stations sit behind a guest CAPTCHA (`_RESEARCH/INDEX.md:319`). If they are ever built, that job needs a browser and belongs on the Fedora runner.

## 10. Compute lane per LLM leg

### Ingest side: zero LLM calls

The grep, run 09/26/2026:

```
rg -n -i "anthropic|claude|openai|ANTHROPIC_API_KEY|refinery|ollama|llm" ingest/pipelines/census_cbp ingest/pipelines/census_acs ingest/pipelines/fdic_bankfind ingest/pipelines/fhfa ingest/pipelines/fdot ingest/pipelines/faf5 ingest/scripts/faf5_to_parquet.py .github/workflows/census-cbp-annual.yml .github/workflows/census-acs-annual.yml .github/workflows/fdic-bankfind-annual.yml .github/workflows/fhfa-hpi-quarterly.yml .github/workflows/faf5-annual.yml .github/workflows/fdot-aadt-annual.yml
```

It returned three lines, none of them calls:

- two `print`/docstring mentions of the path `refinery/sources/faf5-source.mts` (`faf5_to_parquet.py:8,188`)
- the word "CLAUDE.md" in a comment (`fdic_bankfind/constants.py:4`)

The consumer-source grep:

```
rg -n -i "anthropic|runTriageAgent|runSynthesisAgent|openai|callClaude|messages\.create" refinery/sources/macro-florida-cbp-source.mts refinery/sources/fdic-deposits-source.mts refinery/sources/fhfa-hpi-source.mts refinery/sources/fdot-source.mts refinery/sources/fdot-freight-source.mts refinery/sources/faf5-source.mts lib/zip-summary/load.ts lib/zip-report/census-acs-rows.ts
```

It returned nothing (exit 1). Six of the seven consumer packs set both `skipTriageAgent: true` and `skipSynthesisAgent: true`:

- `macro-swfl.mts:682-683`
- `properties-lee-value.mts:950-951`
- `properties-collier-value.mts:679-680`
- `traffic-swfl.mts:431-432`
- `logistics-swfl.mts:341-342`
- `logistics-swfl-nowcast.mts:690-691`

### Leg 1: the macro-florida triage stage, plus the same leg on macro-us, its upstream

- **What it does:** it scores each fragment's content with `claude-haiku-4-5` (`refinery/agents/anthropic.mts:6`, called from `refinery/stages/2-triage.mts:42`). For these two packs the score changes nothing, because the cutoff is 0 (§4 P1).
- **Current auth:** an API key passed at `daily-rebuild.yml:122`. It is dead on the credit wall, run 36217671353.
- **Replacement lane:** Lane D, no model. Set `skipTriageAgent: true` (item 1). The leg is deleted, not re-routed. `bakedAreaRead()` is not relevant because this is scoring, not prose.

### Leg 2: the heal-cron-failure L2 diagnosis

- **What it does:** it fires on a red run of any of the six workflows when the deterministic classifier returns UNKNOWN. It writes an LLM narrative comment (`heal-cron-failure.yml:186-192` → `.github/scripts/heal-cron-failure.mjs:218-231`, model `claude-haiku-4-5`).
- **Current auth:** API key (`heal-cron-failure.yml:191`).
- **Status:** could-not-verify. Of the last 30 heal runs, 27 were skipped and 3 succeeded, with no failed run to read (`gh run list --workflow heal-cron-failure.yml --limit 30`).
- **Replacement lane:** Lane D for this family.
  - The classifier resolves 4 of this family's 5 recorded reds deterministically.
  - The fifth, FAF5 26455970691 (a placeholder host in the credential secret), classifies UNKNOWN, which is a live trigger path for this leg. The Lane D fix is a classifier rule for that config-error shape (§8 noise list), not a model.
  - The script already falls back to a deterministic-only diagnosis without a key (`heal-cron-failure.mjs:214-215`).
  - If a narrative is still wanted for UNKNOWN shapes, the permitted route is Lane M: an unattended `claude -p` on the Fedora runner under the operator's Max login (`CLAUDE_CODE_OAUTH_TOKEN`).
  - These pipelines are internal and not customer-facing, so Max is an allowed lane per the operator's standing decision.
  - Owner: family 19 (cross-cutting). Named here because it fires on this family's workflows.

### Legs this family should never grow

Vintage discovery, citation URLs, the FDOT latest-year choice and FAF5 version discovery are all deterministic HTTP or parse work (items 2, 3, 4, 8, 9). Lane L (local models) and Lane C (Codex) have no role in the numbers.

Lane C is useful for one thing here: the independent second reviewer of the item 2, 4 and 9 diffs, because those change what lands in `data_lake`.

## 11. Double-check log

Every numbered claim was re-run after drafting, with the SQL batch, the `gh run list` calls, the curl probes and the `grep -n` citations. Entries are: claim · check · result.

### Registry and workflow facts

- Registry lines census_cbp 730, census_acs 751, fdic_bankfind 673, fhfa 1112, faf5 415, fdot 1133 · `grep -n "name: <p>" ingest/cadence_registry.yaml` · verified.
- Registry `:424`, `:681`, `:737`, `:739`, `:758`, `:762`, `:1119`, `:1124`, `:1140`, `:1148` · `grep -n` of each quoted string · verified.
- All six workflows use `runs-on: ubuntu-latest`, with the cron lines quoted · `cat -n` of the six YAMLs · verified.
- The `runs-on` lines cited in §9 (cbp :22, acs :24, fdic :23, fhfa :21, faf5 :22, fdot :22), plus the timeouts faf5 :23 and fdot :26 · `grep -n "runs-on\|timeout-minutes"` · verified.

### Run history

- Run counts per workflow: CBP 8 (6 green / 2 red), ACS 2 (2 / 0), FDIC 1 (dry-run), FHFA 3 (3 / 0), FAF5 4 (1 dry-run no-op / 3 red), FDOT 6 (5 / 0 / 1 cancelled) · the six `gh run list … --limit 15` calls · verified. Fewer than 15 exist for every workflow.
- Green runs that were real loads · `gh run view --log` for 34982220418 (LOADED), 29354332608 (LOADED) and 34983321273 (non-null line), plus `_dlt_loads` times for all three · verified.
- FDIC run 35755967549 and FAF5 run 27491047049 were dry-runs · the logs read "fdic_bankfind dry-run: first sod row" and "Dry run — skipping write." · verified.
- CBP 05/26 red cause "Read timed out. (read timeout=60)" · `gh run view 26459317423 --log-failed` · verified.
- Classifier TRANSIENT with signal "429"; the timestamp `…3442955Z` at log line 18 · `classify()` plus `grep -n 429` · verified.

### Live tables

- `census_cbp_fl`: 255,563 rows, max year 2022, 67 counties, 14,849 SWFL rows; 2022 Lee 1,181, Collier 1,070, Hendry 291 · SQL · verified.
- `census_acs_zcta`: 100 rows, year 2022, 5 NULL incomes; Lee 35, Collier 22, Hendry 3, Sarasota 24, Charlotte 13, Glades 3 · SQL · verified.
- Arithmetic: 35+22+3 = 60 and 24+13+3 = 40 · arithmetic · verified.
- `fdic_sod`: 10,759 rows, 1994-2026, county split 6,160 / 4,297 / 302; locations 298, institutions 199; 2026 rollup values · SQL · verified.
- `fhfa_hpi`: 184,817 rows, 1975-2026; Naples has no purchase-only; Cape Coral has 179 / 141 / 141 · SQL · verified.
- `fdot_aadt_fl`: 103,662 rows, 2021-2025, 67 counties; Lee 534, Collier 215, Hendry 68 for 2025 · SQL · verified.
- Arithmetic: 534 + 215 = 749 · arithmetic · verified.
- FAF5 inventory dates · SQL · verified.

### Source probes

- Census metadata: 2023 cbp 200, 2024 cbp 404, 2023 and 2024 acs5 200, 2025 acs5 404 · curl · verified.
- Keyed CBP 2023 NAICS2017 call returned 1,187 rows; the NAICS2022 call returned 400 · bun fetch with the key elided · verified.
- `hpi_master.json` fetch: 60,272,522 bytes, 186,011 rows, latest 202602 for 15980 / 34940 / FL, purchase-only absent for 34940 · curl plus a bun parse · verified.
- FHFA release dates · crawl4ai of `fhfa.gov/data/hpi` · verified.
- FAF5.7.1 still current, page dated 08/15/2025 · crawl4ai of `faf.ornl.gov/faf5/` · verified.

### Served brains

- macro-florida refined 07/19/2026; macro-swfl 09/26; collier-value 09/23; lee-value 09/19; traffic, logistics and nowcast 09/15; macro-us 07/30 · curl of `/api/b/<id>` frontmatter · verified.
- The brief says master was last rebuilt 08/19 · `/api/b/master` shows `refined_at: 2026-08-14T04:30:21Z` · **could-not-verify the brief's 08/19**. The served master is from 08/14. The brief's line "daily-rebuild stalled" also needs review: leaf packs rebuild nightly inside nightly-chain (served refined_at dates above). Master is the one being held.
- 5 served CBP citations with NAICS2022 · `grep -o | uniq -c` · verified.

### Code claims

- macro-florida failure line, with the credit wall as its cause · `gh run view 36217671353 --log` · verified.
- macro-us failure in the same run · verified.
- Only macro-florida and macro-us skip synthesis but not triage · loop over `refinery/packs/*.mts` · verified.
- `2-triage.mts:40-45`, `scoring.mts:10-16` (all positive), `macro-florida.mts:406-408`, `macro-us.mts:225-227` · `grep -n` / `sed -n` · verified.
- `check_freshness.py:214-219` (`_to_date`, corrected from 216-221 by the second Opus), `:274-279` (the `_dlt_loads` path), `:646-712` (`sync_gap_checks`) · `sed -n` · verified.
- Draft claim: an int `freshness_column` would blank the whole daily probe · re-read of `run_probe` (`check_freshness.py:714-750`) · **corrected**. The per-entry backstop at `:726-745` reports only that entry as MISCONFIGURED. The try/except in `_fetch_max_freshness` ends at `:307` and `_to_date` is called at `:318`. The §8 trap paragraph was rewritten.
- The exit-1 line for SLA errors · `grep -n "if sla_errors and not"` · **corrected** from `:1045-1046` to `:1044-1045`; §8 updated.
- The census_cbp threshold date, 12/31/2023 + 1,095 days · python `date + timedelta` · **corrected** from 12/31/2026 to 12/30/2026; §8 updated.
- Item 1's proof named `refinery/packs/macro-us.test.mts` as if it existed · `ls` · **corrected**. The file must be created; item 1 updated.
- Draft §8 used calendar thresholds for all six pipelines · review against the brief's rule (fire only when we are behind the source) · **corrected**. Five pipelines now use a keyless source probe and FHFA keeps a calendar threshold. The now-unused dates (1,095, 760, 480, 730 and 640 days) were removed from §8.
- The source probes return FDIC `YEAR` 2026 and FDOT `maxy` 2025 · curl of the two probe URLs · verified.
- The FHFA dates 09/12 and 12/12, and 69 days since 07/19 · python `date + timedelta` · verified.
- Draft item 9 proposed cron day 16 without checking it · schedule catalog filtered to days 16 and 17 · **corrected**. Day 16 holds `ingest-bls-ppi.yml`, day 17 is free, and item 9 now says day 17.
- Draft item 9 left the first FAF5 run ASK-FIRST and asked the operator about it · **corrected**. The copy-aside step makes it revertable in under 5 minutes, so it is DO; the question was dropped and the counts recounted.
- Draft §1 said "7 consumer packs or surfaces" · recount of §1 · **corrected** to 7 packs, 3 `lib/` surfaces and 1 tool.
- macro-us's output does not read `content_score` or `composite` · `grep -n "content_score\|composite" refinery/packs/macro-us.mts refinery/packs/macro-florida.mts` returns only the `compositeCutoff: 0` lines · verified. macro-us is FRED-fed and outside this family, so tell its owner so the fix lands once.
- `.github/scripts/classify-cron-failure.test.mjs` exists (item 12's proof) · `ls .github/scripts` · verified.
- Registry ceiling citations in §5 · `grep -n` of each ceiling summary · **corrected** four line numbers: CBP 747 → 746, ACS 768-770 → 770, FDIC 697 → 700, FDOT 1151 → 1150. The cited `:427`, `:430`, `:677` and `:1128` were verified.
- FDOT loads were first called "monthly" and listed from 07/03 · `_dlt_loads` rows for fdot_aadt_tier2 · **corrected**. There are 5 loads (05/18, 07/03, 07/15, 08/15, 09/15), and 05/18 and 07/03 were not cron-day loads; §3 and §6 updated.
- Research citations `_RESEARCH/INDEX.md:319-320,469,494` and `data-roots.md:282` · `sed -n` · verified.
- `faf5_to_parquet.py:110-112`, `:125-129`, `:147-162`, `:188-196`, `:50` · `cat -n` · verified.
- `faf5-source.mts:23,33`, `fdot-source.mts:50`, `fdot-freight-source.mts:62`, `macro-florida.mts:280`, `fhfa-hpi-source.mts:175-183`, `properties-collier-value.mts:315,477` · `grep -n` · verified.
- The fixture's Naples purchase-only rows at 1589-1640 · `grep -n` · verified. The first row is at 1588-1592; the purchase-only flavor lines are at 1589, 1601, 1613, 1625 and 1637.
- Manual-vintage site count of 10 across 4 pipelines: cbp 2 (`resources.py:10`, `constants.py:2`), acs 1, faf5 5, fdot 2 · recount against the cited lines · verified.

### Tests

- 39 pytest tests pass; per-file counts 1 / 8 / 2 / 8 / 1 / 18 / 1 · pytest `--co` · verified.
- CBP was counted as "9 tests" · recount · verified (1 + 8).
- FDOT has 19 tests · verified (18 + 1).
- FDIC has 10 tests · verified (2 + 8).
- 118 bun tests pass across 9 files · bun test · verified.

### Arithmetic and schedule

- FHFA floor 184,817 × 0.9 = 166,335.3 · arithmetic · verified.
- The old floor, 119,903 / 184,817, is 64.9% · arithmetic · verified ("65%").
- Durations 2m54s, 1m45s, 1m07s, 1m36s, 6m13s · timestamp subtraction · verified.
- 12/31/2023 → 09/26/2026 = 1,000 days · computed as 366 + 365 + 268 + 1 · verified.
- 12/31/2022 → 09/26/2026 = 1,365 days · verified.
- 03/31 + 165 = 09/12 and 06/30 + 165 = 12/12 · verified.
- Day 6 has no other job in the schedule catalog · `node scripts/schedule-catalog.mjs` filtered to days 4-6 · verified.

### Could not verify

- The ops `/coverage` rendering of new check keys: the ops repo was not opened.
- Whether the heal L2 leg is live or dead: no failed heal run exists to read.

### Summary

61 log entries checked, 10 corrected in place, 3 could-not-verify: the brief's master date of 08/19, the ops /coverage rendering, and the heal L2 status.

## 12. Questions for the operator

1. **Collier's price-index benchmark.** FHFA does not publish a purchase-only index for Naples-Marco Island. Should the Collier value brain serve the Naples **all-transactions** index, labelled as including refinance appraisals, or should it serve no FHFA number and drop the citation? (Item 7.) This is product shape: it changes a served metric.
2. **Drop the corpse view `data_lake.fdot_aadt_swfl_yearly`?** It was marked delete-safest on 07/18 and nothing reads it. (Item 13.) This is a schema change.
3. **CBP at county grain.** 14,849 Lee, Collier and Hendry CBP rows land every month and nothing reads them. Should macro-swfl gain 6-digit-NAICS establishment counts next to its QCEW numbers, or should CBP stay a statewide denominator only? This adds served metrics, so it is a product call.
4. **Hendry bank deposits.** The FDIC rollup already computes Hendry: 2026 shows 5 branches, 3 banks and 685,788 thousand USD in `fdic_sod_county_year_v`, and the source builds it at `fdic-deposits-source.mts:111`. macro-swfl serves only Lee and Collier (`macro-swfl.mts:568-569`). Should Hendry's three `fdic_hendry_*` metrics be served? That changes key_metrics, so it is ASK-FIRST. If yes, the build is one `pushDeposits("hendry", …)` line plus a test.

## 13. Second-Opus verification

Run 09/26/2026 by the second Opus for family 07. Every command below was re-run in this session. The SQL went through a read-only Bun.SQL script in the scratchpad (connection copied from `scripts/apply-fdic-sod-view.mts:15-27`, with `SET SESSION default_transaction_read_only = on`). `graphify query "federal-econ pipeline"` ran first.

### Claims checked: 268

Grouped by lane, each group re-run or re-opened this session:

- **22 registry line citations.**
  - The six `name:` lines (730, 751, 673, 1112, 415, 1133).
  - Lines 424, 427, 430, 677, 681, 700, 737, 739, 746, 758, 762, 770, 1119, 1124, 1128, 1148 and 1150.
  - Method: `grep -n` / `sed -n`.
- **14 workflow facts.** Six cron lines, six `runs-on: ubuntu-latest` lines, and the timeouts at faf5 :23 and fdot :26. Method: `grep -n "cron\|runs-on\|timeout-minutes"`.
- **17 run-history facts.**
  - Six run counts: CBP 8 (6 green / 2 red), ACS 2 / 0, FDIC 1, FHFA 3 / 0, FAF5 1 / 3, FDOT 5 / 0 / 1 cancelled.
  - Four newest-green ids: 34982220418, 29354332608, 28953913464, 34983321273.
  - Two dry-run log lines: 35755967549 "fdic_bankfind sod 12071: 6,160 rows", and 27491047049 "Dry run — skipping write."
  - The five red causes: two CBP read-timeouts, two FAF5 `faf_sctg_lookup does not exist`, and one FAF5 placeholder host.
  - Method: `gh run list --limit 15` and `gh run view --log-failed`.
- **4 classifier facts.** `classify()` gives TRANSIENT/"429" on 26459317423 and SCHEMA_DRIFT on 26459292357. The regexes sit at `:199` (`\b429\b`) and `:204` (bare `429`).
- **60 live-table numbers.**
  - census_cbp_fl: 255,563 rows; 09/15 14:32; 2017-2022; 67 counties; 14,849 SWFL rows; 2022 counts 1,181 / 1,070 / 291.
  - census_acs_zcta: 100 rows; 07/14; 2022; 5 NULL incomes; 35 / 22 / 3 / 24 / 13 / 3.
  - fdic_sod: 10,759 rows; 09/22 16:08; 1994-2026; 6,160 / 4,297 / 302. Locations 298, institutions 199. The 2026 rollup matches all 9 values.
  - fhfa_hpi: 184,817 rows; 07/08; 1975-2026; series counts 179 / 141 / 141 / 168 / 141; max period 2026Q1.
  - fdot_aadt_fl: 103,662 rows; 2021-2025; 67 counties; load 09/15 14:46; 2025 counts 534 / 215 / 68.
  - `_tier1_inventory` dates for FAF5 and the FDOT raw archive.
  - `_dlt_loads`: census_cbp 10 loads, fdot_aadt_tier2 5 (05/18, 07/03, 07/15, 08/15, 09/15), fhfa_hpi 2, census_acs 2, fdic_bankfind 1.
  - information_schema: no `faf%` table exists, and `fdot_aadt_swfl_yearly` exists as a VIEW.
- **17 source probes.**
  - Census status codes: 2023 cbp 200, 2024 cbp 404, 2023 and 2024 acs5 200, 2025 acs5 404, 2022 cbp.html 200, and the keyless NAICS2022 URL 302.
  - FDIC probe: `YEAR` 2026. FDOT probe: `maxy` 2025.
  - The ORNL page (fetched with curl, because crawl4ai hit its 60s navigation timeout on faf.ornl.gov): `FAF5.7.1.zip`, "August 15, 2025", and "Regional database for 2017-2024".
  - `hpi_master.json`: 60,272,522 bytes, 186,011 rows, latest period 2026Q2 for 15980 and 34940, and no purchase-only series for 34940.
  - The FHFA release calendar, via crawl4ai of `fhfa.gov/data/hpi`: "Tuesday, November 24 … 2026Q3".
- **13 served-brain facts.**
  - Nine `refined_at` values: macro-florida 07/19, macro-us 07/30, macro-swfl 09/26, lee-value 09/19, collier-value 09/23, logistics, traffic and nowcast 09/15, master 08/14.
  - 5 citations with `NAICS2022`. 0 `fhfa_naples*` metrics. `fhfa_cape_coral_msa_yoy_pct` is present. The `fdic_lee_*` and `fdic_collier_*` metrics are present.
- **38 ingest-code line citations.** These cover census_cbp, census_acs, fdic_bankfind, fhfa, fdot and the faf5 script and constants, at every file:line quoted in §2-§5, §7 and §8. Method: `cat -n` / `sed -n`.
- **30 refinery and workflow line citations.** These cover P1's root-cause lines, the fhfa, fdot and faf5 consumer pins, the master, macro-swfl and sector-credit input edges, `fdic-deposits-source.mts:28,84`, the six packs' skip flags, `daily-rebuild.yml:122` and `nightly-chain.yml:205`.
- **7 check_freshness.py ranges.**
- **4 heal / log-cron-incident facts.** `heal-cron-failure.yml:186-192` and `:191`, `heal-cron-failure.mjs:214-215`, and `log-cron-incident.yml:3-6`.
- **11 test facts.**
  - pytest: "39 passed in 0.92s", with per-file counts 1 / 8 / 2 / 8 / 1 / 18 / 1.
  - bun: "118 pass, 0 fail, Ran 118 tests across 9 files".
  - There is no `ingest/tests/pipelines/census_acs/`, and `faf5/` holds only `__init__.py`.
- **12 research and doc citations.** `P7-corpse-deletelist.md:30,116`, `P4-unmapped-tables.md:151`, `_RESEARCH/INDEX.md:319,320,469,494`, `data-roots.md:282,1226,1231` and `cron-rebuild-failures.md:20,35`.
- **3 schedule facts.** Day 6 and day 17 are free, and day 16 is `ingest-bls-ppi.yml` (the schedule catalog filtered by day-of-month).
- **3 checks-ledger facts.** 21 open; `llm_legs_parked_credit_wall` names four other legs; `fdic_directories_no_consumer` is open.
- **7 remaining facts.**
  - The fixture's Naples purchase-only lines at 1589, 1601, 1613, 1625 and 1637.
  - `lib/zip-summary/load.ts:40-44`, `lib/email/market-context.ts:162,167` and `lib/zip-report/census-acs-rows.ts:51`.
  - The CBP view SQL takes `MAX(year)` (`:5-8`).
  - Heal runs: 27 skipped and 3 success in the last 30.
- **2 LLM greps.** Re-run over the six pipeline dirs, the faf5 script, the six workflows, and the consumer sources plus `lib/email/market-context.ts` and `refinery/tools/build-corridor-fact-pack.mts`. The only hits are the 3 non-call lines already listed in §10.
- **4 durations.** 2m54s, 1m45s, 1m36s and 6m13s: `createdAt` from `gh run list` against the `_dlt_loads` `inserted_at`.

### Corrections (applied in place)

1. **CBP `constants.py` is not dead** (P2 and item 2).
   - Wrong: "nothing imports it" and "delete the dead constants.py".
   - Right: `ingest/tests/pipelines/census_cbp/test_resources.py:5` imports `CBP_YEARS` from it. Item 2 now repoints that test before deleting the file.
   - Evidence: `rg -n "census_cbp.constants" ingest`.
2. **FAF5 run 26455970691** (P7).
   - Wrong: "a DNS failure".
   - Right: the host was the literal placeholder `aws-0-<us-east-1>.pooler.supabase.com` in the credential secret, and `classify()` returns UNKNOWN.
   - Evidence: `gh run view 26455970691 --log-failed`, plus `classify()` on that log.
3. **The classifier's coverage** (§8 noise list, §10 Leg 2).
   - Wrong: "the classifier already resolves this family's recorded failures deterministically".
   - Right: 4 of 5. The fifth is UNKNOWN, a live trigger for the heal L2 model leg. The Lane D fix is a classifier rule, noted for family 19 alongside item 12.
   - Evidence: `classify()` on all five red logs.
4. **FAF5 vintage signal** (§8 and item 9).
   - Wrong: the evaluator compared the page's zip name with `_tier1_inventory.vintage`, and item 9 would write the version there. That column holds `2020`…`2024` and `2026-05-19` / `2026-05-20`, and `faf5_to_parquet.py:156` writes `str(year)`, so the "stays closed today" negative test was false as configured.
   - Right: the evaluator reads the zip name out of `source_url`. All 11 rows carry `…/FAF5.7.1.zip`, and the script already writes it at `:140,:157`.
   - Evidence: `SELECT id, source_url, vintage FROM data_lake._tier1_inventory WHERE id LIKE 'lake-tier1/faf5/%'`.
5. **FAF5 storage layout** (§2).
   - Wrong: "Lookups under faf5/2026-05-19/ and faf5/2026-05-20/".
   - Right: each dated directory also holds a full `faf_flows.parquet`, for 11 inventory rows in all.
   - Evidence: the same query.
6. **Incident issues** (§8, "Per-run failure").
   - Wrong: "comments on the one sticky issue … never opens an issue per run", which is incomplete.
   - Right: it also opens one de-duplicated `[cron-failure:<workflow>]` issue and one `cron_incident_<workflow>` check per failing workflow. Only the next scheduled success closes them, so a red annual FAF5 run keeps its issue open up to 12 months. Zero are open for the six today.
   - Evidence: `log-cron-incident.mjs:56,218-281,283-297`, and `gh issue list --label cron-failure --state open`.
7. **`_to_date` location** (§8 trap paragraph, §11).
   - Wrong: `check_freshness.py:216-221`.
   - Right: `:214-219`.
   - Evidence: `sed -n 214,222p ingest/scripts/check_freshness.py`.
8. **Item 5's timing** (item 5).
   - Wrong: the cron "lands one to two weeks after" each release, and landing it at any time was treated as unblocking P6.
   - Right: it lands 6 to 12 days after (11/24 → 12/06, 02/23 → 03/06, 05/25 → 06/06, 08/31 → 09/06). Landing it before the 10/08 run delays 2026Q2 until 12/06, so the edit lands after 10/08 or is followed by one real dispatch.
   - Evidence: crawl4ai of `fhfa.gov/data/hpi`, and `fhfa-hpi-quarterly.yml:7`.
9. **The freshness probe's health** (§8).
   - Wrong: the probe was implied to be a healthy daily seam.
   - Right: `freshness-probe-daily.yml` concluded failure on each of its last 10 scheduled runs, 09/17-09/26. The failing step is the doctor's `--fail-on red` gate; the check_freshness step passes. The signal must be read in the checks ledger.
   - Evidence: `gh run list --workflow freshness-probe-daily.yml --limit 10`, and the job-step view of 36259690113.
10. **Stale claims P10 missed** (P10, item 11).
    - Wrong: the list was incomplete.
    - Right: added registry `:1120` and `:1142` ("Verified: MAX(inserted_at) = 2026-05-18", while live is 07/08 and 09/15), `fhfa/pipeline.py:8` ("~133k records"), and `scripts/notion-sync.mjs:1223` (names housing-swfl + master as the FHFA consumers).
    - Evidence: `sed -n`, plus the `_dlt_loads` query.
11. **The ACS vintage bump** (P4).
    - Wrong: the code comment `census_acs/constants.py:16` says "the GHA cron bumps this one line".
    - Right: nothing in `census-acs-annual.yml` edits it. The registry `:762` "MANUAL" line is the true one, recorded as "X verified, Y needs review".
    - Evidence: `grep -n "sed \|git commit\|contents: write" .github/workflows/census-acs-annual.yml` (only the `:8` MANUAL note matches).

### Unverifiable claims

- **The keyed Census data calls** in P2 and P4: CBP 2023 Lee returning 1,187 rows, the keyed NAICS2022 call returning 400, and the ACS 2024 ZCTA 33901 values. Not re-run, because the key lives only in secret stores and this pass did not read one. The keyless metadata probes that carry the conclusion (2023 CBP live, 2024 ACS live) were re-run and hold.
- **The FDIC dry-run duration of 1m07s.** The run's `updatedAt` was not fetched. The log's last pipeline line is at 16:44:14, which is consistent.
- **Whether ops `/coverage` renders new check keys.** The ops repo was not opened, same as the first pass.
- **Whether the heal L2 leg is live or dead.** There are 27 skipped and 3 success runs and no failed run to read. The UNKNOWN trigger path now exists, per correction 3.
- **The ORNL page via crawl4ai.** It timed out at 60s. Its content was verified with curl instead, which is a weaker lane for a page that could render client-side. The zip names and dates came through in the raw HTML.

### Gaps filled

- The doctor is now named in §8 as a seam. In run 36259690113 it rates all six pipelines `FRESH | OK | NO_CONTRACT | GREEN`, which is also added as direct evidence under P9.
- **Hendry FDIC is computed but not served:** `fdic-deposits-source.mts:36,111` against `macro-swfl.mts:568-569`. Added to §5 and as §12 question 4 (ASK-FIRST, because it changes key_metrics).
- The related open check `registry_source_ceiling_no_freshness_field` is added to §8. Item 10 is the pattern it can copy; this family cannot close it.
- The consumer-grep non-reader hits are listed in §1. No reader was missed and no claimed reader is absent.
- A classifier rule for the placeholder-host config error is added (§8 noise list, §10 Leg 2) as the Lane D route off the L2 model leg.
- Coverage check: every section 2, 3, 4, 6, 7, 8 and 9 names all six pipelines (census_cbp, census_acs, fdic_bankfind, fhfa, faf5, fdot).
  - §4 has a problem for each pipeline: P2/P3 cbp, P4 acs, P13 fdic, P5/P6 fhfa, P7 faf5, P8/P11 fdot.
  - §9 gives every pipeline a placement and a reason. No move to Fedora is proposed, so no `SWFL_LOCAL_RUNNER_READY` gate or runs-on label applies.
  - §8 gives every pipeline exactly one named `vintage_lag_<name>` signal on the existing check_freshness + checks-ledger seams, and files no issue per run.

### Credit-suggestion count: 0

`grep -n -i "credit\|top up\|top-up\|console balance\|api key\|billing\|purchase credits"` over sections 1-12 returns 11 lines. Every one describes the existing wall, or the key a leg currently reads, or is part of the pack name "sector-credit-swfl". None proposes, prices or hints at adding funds. The legs on the wall are rerouted to Lane D (item 1 deletes the triage call; the heal fallback) or to Lane M, the Max-plan `claude -p` on the Fedora runner.
