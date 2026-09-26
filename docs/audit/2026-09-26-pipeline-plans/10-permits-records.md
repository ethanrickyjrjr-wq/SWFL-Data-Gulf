# 10 permits-records — pipeline plan (09/26/2026)

Family 10 covers building permits and official records for Lee (12071) and Collier (12021). It has five registry entries:

- `lee_permits`: Lee Accela scrape, weekly.
- `collier_permits`: Collier monthly Issued XLSX.
- `mhs_permits_swfl`: annual MHS Data Book PDF of commercial permits.
- `collier_official_records`: Collier Clerk COR search, daily, all doc types.
- `lee_deed_official_records`: Lee Clerk LandMarkWeb, under `not_yet_running:`. The load is automated; the fetch is manual.

None of them covers Hendry (12051).

Verdict: the plumbing mostly runs green, but three served numbers are wrong or cannot be read today. The fixes cost no money: every geocoder in the family is the free Census batch service (`lee_permits/geocoder.py:3`, `mhs_permits_swfl/geocode.py:35`, `collier_permits/geocoder.py:1`).

- **Commercial permits brain overcounts.** `permits-commercial-swfl` serves "412 permits totaling $2.91B". 69 of those rows are stale output from an older extractor, and ON CONFLICT DO NOTHING never removed them.
- **The permit z-score reflects gaps, not the market.** `permits-swfl` serves "Naples z = 2.77, bullish". The z-score is computed against baseline windows that are empty because the data is missing: 11 of 13 are empty for Collier and 10 of 13 for Lee. It is not a market reading.
- **The Lee permit feed is a fixed-size sample, not a census.** Accela returns 11 pages every time, whatever the date window. The weekly cursor then throws away most of what it fetched.

Two record feeds have quieter defects:

- Collier official records stopped capturing parcel IDs after 08/12/2026.
- The Lee deed load re-merges the same 28,186 rows every day. Nothing new has landed since 08/12/2026, and the re-merge caused one statement-timeout red.

Per-pipeline verdicts: `lee_permits` REPAIR · `collier_permits` IMPROVE · `mhs_permits_swfl` REPAIR · `collier_official_records` IMPROVE · `lee_deed_official_records` PARK (keep the fetch parked, fix the load trigger).

How the SQL in this file was run: every query was run read-only. The runner is a throwaway Bun.SQL script that copies the connection block in `scripts/apply-fdic-sod-view.mts:10-30`. It sets `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` and a 90 s statement timeout, and it was never committed. Each query is written out in full below so it can be re-run through the same approach. Q-numbers are referenced later.

## 1. Scope

There are 5 pipelines, 5 workflow files, 5 lake tables and 4 consumer packs. Registry line numbers are from `grep -n "name: <n>" ingest/cadence_registry.yaml`.

- **`lee_permits`**
  - Registry: `ingest/cadence_registry.yaml:1179`.
  - Workflow: `.github/workflows/lee-permits-weekly.yml`.
  - Table: `data_lake.lee_building_permits`.
  - Consumer: `permits-swfl` (`refinery/sources/permits-source.mts` into `refinery/packs/permits-swfl.mts`).
  - `permits-swfl` feeds master (`refinery/packs/master.mts:241`, edge `:302`) and `cre-swfl`, per `docs/standards/data-roots.md:1398`.
  - Side reader: `refinery/tools/build-corridor-fact-pack.mts:670,741`.
- **`collier_permits`**
  - Registry: `:1200`.
  - Workflow: `.github/workflows/collier-permits-monthly.yml`.
  - Table: `data_lake.collier_building_permits`.
  - Consumer: `permits-swfl` (`refinery/sources/collier-permits-source.mts`).
- **`mhs_permits_swfl`**
  - Registry: `:1879`.
  - Workflow: `.github/workflows/ingest-mhs-permits-swfl.yml`.
  - Table: `data_lake.mhs_permits_swfl`, plus the lookup `data_lake.mhs_jurisdiction_xwalk`.
  - Consumer: `permits-commercial-swfl` (`refinery/sources/mhs-permits-source.mts`), which feeds master (`master.mts:263`, edge `:340`).
- **`collier_official_records`**
  - Registry: `:1155`.
  - Workflow: `.github/workflows/ingest-collier-official-records.yml`.
  - Table: `data_lake.collier_official_records`.
  - Consumer: `collier-official-records-swfl` (`refinery/sources/collier-official-records-source.mts`). It is NOT a master input, and nothing rebuilds it on a schedule (see §4 P9).
- **`lee_deed_official_records`** (not_yet_running, registry `:2459`)
  - Workflow: `.github/workflows/ingest-lee-deed-official-records.yml`.
  - Table: `data_lake.lee_deed_official_records`.
  - Consumers:
    - `lee-deed-records-swfl` (`refinery/sources/lee-deed-records-source.mts`).
    - Views `data_lake.lee_records_addressed_v` and `data_lake.lee_deed_purchase_financing_v`, per Q15. The second view is read by `refinery/lib/deed-financing-classifier.mts`.
  - It is not a master input. The comment at `master.mts:385` says it is "moot while its table is empty", but the table has 28,186 rows (Q13).
- **Served surfaces.**
  - `lib/zip-dossier.ts:98,103,209,213` lists all four brains.
  - `lib/zip-report/assemble.ts:38,86` reads `permits-swfl` and `permits-commercial-swfl`.
  - `lib/assistant/chart-for-question.ts:107` reads `permits-swfl`.
  - Found with `rg -n "permits-swfl|permits-commercial-swfl|collier-official-records-swfl|lee-deed-records-swfl" refinery/packs/master*.mts refinery/packs/index.mts app lib --glob '!*.test.*'`.
- **Not a consumer, despite matching the grep.** `lib/listings/property-permits.ts` only names the county tables in a comment (`:17`). It reads `steadyapi_property_permits_v`.

Q15:
```
select view_schema, view_name, table_name from information_schema.view_table_usage where table_name in ('lee_building_permits','collier_building_permits','mhs_permits_swfl','collier_official_records','lee_deed_official_records')
```

## 2. What is being brought in

**`lee_permits`**
- **Source.** Lee County Accela Citizen Access, `https://aca-prod.accela.com/LEECO/` (`ingest/pipelines/lee_permits/scraper.py:403-406`, module `Permitting`). It is scraped with crawl4ai UndetectedAdapter. The list view is followed by a sequential CapDetail enrichment for issue date, valuation and type (`scraper.py:1-45`).
- **Fields.** permit_id, issued_date, permit_type_raw, permit_description_raw, bucket, address, zip_code, lat, lon, corridor, declared_value_usd, status (`lee_permits/pipeline.py:173-190`).
- **Geography.** Unincorporated Lee only in practice. Q3 finds 0 of 339 addresses containing "CAPE CORAL", which is consistent with the LEECO host serving only the county's own jurisdiction. The open check `lee_permits_cape_coral_coverage_gap` asks exactly this.
- **Cadence.** Mondays 11:00 UTC (`lee-permits-weekly.yml:5`). The registry has cadence_days 7 and expected_rows_min 5 (`cadence_registry.yaml:1183-1186`).
- **Live figures (Q1).** 339 rows. MAX(_loaded_at) is 09/21/2026 16:56 UTC. issued_date runs 02/25/2026 to 09/21/2026.
  - Null counts: declared_value_usd 284, permit_type_raw 82, lat 61, zip_code 2.
  - By month (Q2): Feb 13, Mar 75, Apr none, May 11, Jun 189, Jul 15, Aug 10, Sep 26.
  - 94 rows carry issued_date 06/16/2026, the first-load fallback date (Q4).
- **Coverage.** Lee yes. Collier no. Hendry no.

Q1:
```
select count(*) as n, max(_loaded_at), min(issued_date), max(issued_date), count(distinct permit_id), count(*) filter (where zip_code is null) as null_zip, count(*) filter (where declared_value_usd is null) as null_value, count(*) filter (where permit_type_raw is null or permit_type_raw='') as null_type, count(*) filter (where lat is null) as null_lat from data_lake.lee_building_permits
```
Q2:
```
select date_trunc('month', issued_date)::date as m, count(*) from data_lake.lee_building_permits group by 1 order by 1
```
Q3:
```
select count(*) filter (where address ilike '%CAPE CORAL%') as cape_addr, count(*) filter (where zip_code is not null) as with_zip, count(*) as n, count(distinct zip_code) as zips from data_lake.lee_building_permits
```
Q4:
```
select issued_date, count(*) from data_lake.lee_building_permits where issued_date between '2026-06-10' and '2026-06-20' group by 1
```

**`collier_permits`**
- **Source.** Collier County "Monthly Building Permit Reports", Issued series XLSX (`cadence_registry.yaml:1219-1221`). The listing is fetched with crawl4ai (`ingest/pipelines/collier_permits/fetcher.py`). Geocoding goes through the Census batch geocoder (`collier_permits/geocoder.py:1,93`).
- **Fields.** 23 mapped columns (Q0 column list): permit number, value, type, status, site address, property_id, dates, SF, units, owner and contractor detail, lat/lon, corridor, bucket, zip_code.
- **Cadence.** Cron on the 15th at 12:00 UTC (`collier-permits-monthly.yml:13-14`). It loads the previous calendar month (`collier_permits/pipeline.py:151-155`).
- **Live figures (Q5).** 14,181 rows. MAX(_loaded_at) is 09/15/2026 16:36 UTC. date_issued runs 04/01/2026 to 08/31/2026.
  - Only 3 source files are loaded (Q6): 2026-4 (4,750 rows), 2026-7 (4,746), 2026-8 (4,685).
  - Null zip_code 7,777. Null lat 7,566.
- **Source ceiling, live 09/26/2026.** 77 Issued XLSX files are published, running from 2020-01 to 2026-08, and May and June 2026 are among them. Command: `ingest/.venv/Scripts/python.exe -c "from ingest.pipelines.collier_permits.fetcher import discover_issued_reports; r=discover_issued_reports(); print(len(r), r[-1].year, r[-1].month, r[0].year, r[0].month)"` printed `77 2020 1 2026 8`. That makes 74 published months missing.
- **Coverage.** Collier only.

Q5:
```
select count(*), max(_loaded_at), min(date_issued), max(date_issued), count(distinct permit_number), count(*) filter (where zip_code is null) as null_zip, count(*) filter (where lat is null) as null_lat, count(distinct source_file) as files from data_lake.collier_building_permits
```
Q6:
```
select source_file, count(*), max(_loaded_at) from data_lake.collier_building_permits group by 1 order by 3 desc
```

**`mhs_permits_swfl`**
- **Source.** The Maxwell, Hendry & Simmons 2026 Market Trends Data Book PDF (`refinery/sources/mhs-permits-source.mts:41-42`). A crawl4ai fetch on 09/26/2026 of `https://mhsappraisal.com/market-trends-2026/` returned status 200. The same PDF, `2026-Market-Trends-Report-Magazine-Version-All-Permits.pdf`, is still the current one. The next book is expected ~March 2027 (`cadence_registry.yaml:1888`, first_expected_by 2027-03-13).
- **Fields.** jurisdiction, calendar_year, issued_date, asset_class, project_address, project_name, permit_value_usd, building_sf, plus stamped submarket_slug and zip_code.
- **Cadence.** Annual cron on March 20 (`ingest-mhs-permits-swfl.yml:6`).
- **Live figures (Q7).** 412 rows. MAX(_ingested_at) is 07/14/2026. issued_date runs 01/02/2025 to 12/24/2025. There is 1 calendar year, 215 rows have a zip, and 412 rows are `verified=false` (Q8).
- **By county (Q9):** Lee 283, Collier 110, Charlotte 19. All 19 Charlotte rows are stale duplicates (§4 P1).

Q7:
```
select count(*), max(_ingested_at), min(issued_date), max(issued_date), count(distinct calendar_year), count(*) filter (where zip_code is not null) as with_zip from data_lake.mhs_permits_swfl
```
Q8:
```
select verified, count(*) from data_lake.mhs_permits_swfl group by 1
```
Q9:
```
select x.county, count(*) from data_lake.mhs_permits_swfl m left join data_lake.mhs_jurisdiction_xwalk x on x.raw_jurisdiction=m.jurisdiction group by 1
```

**`collier_official_records`**
- **Source.** Collier Clerk COR Access document search, `https://cor.collierclerk.com/search/document` (`cadence_registry.yaml:1176`). All doc types are pulled with no filter (`collier_official_records/pipeline.py:1-11`).
- **Fields.** 9 grid columns into record_date, grantors[], grantees[], doc_type, instrument_number, book_type, book, page, page_count, legal_description, parcel_ids[] (`normalize.py:5-9,110-120`).
- **Cadence.** Daily at 11:37 UTC, for yesterday only (`ingest-collier-official-records.yml:17`; `pipeline.py:54-56`).
- **Live figures (Q10).** 26,132 rows, all with distinct instrument numbers. record_date runs 07/13/2026 to 09/25/2026. The newest load is 09/26/2026 15:04 UTC. There are 36 distinct doc types; the registry says 37 (`cadence_registry.yaml:1170`).
- **Top doc types (Q11):** NC 6,308, DEED 4,523, AFFID 2,482, SATIS 2,209, MTGE 2,056.
- **Coverage.** Collier only.

Q10:
```
select count(*), min(record_date), max(record_date), count(distinct instrument_number), max(to_timestamp(split_part(_dlt_load_id,'.',1)::bigint)), count(distinct doc_type), count(*) filter (where parcel_ids is null or jsonb_array_length(parcel_ids)=0) as no_parcel from data_lake.collier_official_records
```
Q11:
```
select doc_type, count(*) from data_lake.collier_official_records group by 1 order by 2 desc limit 15
```

**`lee_deed_official_records`**
- **Source.** Lee Clerk LandMarkWeb, `https://or.leeclerk.org/LandMarkWeb/` (`cadence_registry.yaml:2479`).
- **Fetch.** Manual. Akamai blocks every unattended method tried (`ingest/pipelines/lee_deed_official_records/README.md:130-154`). The per-day procedure is at `README.md:181-198`, and `sync_all_exports.py` holds the Export-button sweep (`sync_all_exports.py:1-12`).
- **Load.** GHA re-merges every committed `raw/*.json` (`resources.py:1-19`). `ls ingest/pipelines/lee_deed_official_records/raw | wc -l` returns 22 files, the newest `2026-08-11.json`. `git log -1 -- raw/` returns `46706166 2026-08-12`.
- **Fields.** 20 decoded columns plus parcel_strap and grantors_complete/grantees_complete (Q0 column list).
- **Live figures (Q13).** 28,186 rows. record_date runs 07/13/2026 to 08/11/2026. MAX(_ingested_at) is 09/26/2026 14:59 UTC, which the daily re-merge bumps; it is not a sign of new content.
  - DEED rows: 5,353.
  - parcel_strap filled: 12,409.
  - consideration_usd > 0: 8,201 (Q14).
  - DEED rows with consideration_usd > 100: 3,229 (Q14).
- **Coverage.** Lee only.

Q13:
```
select count(*), min(record_date), max(record_date), count(distinct internal_doc_id), max(_ingested_at), count(*) filter (where doc_type='DEED') as deeds, count(*) filter (where parcel_strap is not null) as with_strap from data_lake.lee_deed_official_records
```
Q14:
```
select count(*) filter (where consideration_usd > 0) as pos, count(*) filter (where doc_type='DEED' and consideration_usd > 100) as deed_priced from data_lake.lee_deed_official_records
```

Q0, the column list used above:
```
select table_name, string_agg(column_name||':'||data_type, ', ' order by ordinal_position) from information_schema.columns where table_schema='data_lake' and table_name in ('lee_building_permits','collier_building_permits','mhs_permits_swfl','collier_official_records','lee_deed_official_records','mhs_jurisdiction_xwalk') group by table_name
```

## 3. What is working

Run evidence comes from `gh run list --workflow <file> --limit 15 --json databaseId,status,conclusion,createdAt,event`. Green is not the same as landed. The 06/29/2026 lee-permits green (28380780880) sat inside the dry-run branch bug window documented at `lee-permits-weekly.yml:8-13`, and it wrote nothing.

- **`lee_permits`**
  - Runs: 13 success, 1 skipped (30818783225, 08/03), 1 failure (28798608078, 07/06). The newest green is 35627576690 on 09/21/2026.
  - Every scheduled green since 07/13/2026 landed at least one row, by load day (Q12): 07/13 1, 07/20 10, 07/27 3, 08/10 3, 08/17 1, 08/24 2, 08/31 4, 09/07 5, 09/14 15, 09/21 6.
  - CapDetail fetch-health has been 100% since the sequential-fetch fix. `gh run view 35627576690 --log | grep fetch-health` shows `lee_permits: 101/101 fetched (100%)`.
  - The content guard is in place: `assert_content_fresh(..., 14)` at `lee_permits/pipeline.py:220-222`, and `raise_on_failed_jobs()` at `:214`.
  - Tests: `ingest/.venv/Scripts/python.exe -m pytest -q --co ingest/pipelines/lee_permits` collects 53, and all pass (see below).

  Q12:
  ```
  select to_timestamp(split_part(_dlt_load_id,'.',1)::bigint)::date as load_day, count(*) from data_lake.lee_building_permits group by 1 order by 1 desc limit 12
  ```

- **`collier_permits`**
  - Runs: 11 in total, of which 6 success and 5 failure. The newest green is 34995831657, the 09/15/2026 scheduled run, which landed the August file (Q6). The prior scheduled green is 31885273282 on 08/15/2026, which landed July.
  - The datacenter IP clears the Akamai wall: run 31565435973 per `collier-permits-monthly.yml:5-6`.
  - Guards: `assert_min_rows(...4477)` at `collier_permits/pipeline.py:99` and `assert_content_fresh(..., 75)` at `:105`.
  - Tests: 53 collected, all pass.

- **`mhs_permits_swfl`**
  - Runs: 2, both success on 07/14/2026. 29353808258 was the dry run, which logged `Would insert 343`. 29354353838 was live, which logged `Extracted 343 permit rows` and `Inserted 131 new rows` (`gh run view 29354353838 --log | grep -E "Extracted|Inserted"`).
  - The source is live and unchanged (§2).
  - The crosswalk and zip stamping run inside the pipeline (`mhs_permits_swfl/pipeline.py:135-141`).
  - Tests: 0 in `ingest/pipelines/mhs_permits_swfl` (`pytest --co` prints `no tests collected`). `refinery/packs/permits-commercial-swfl.test.mts` passes in fixture mode.

- **`collier_official_records`**
  - Runs: 13 success, 2 failure. The newest green is 36250668840 on 09/26/2026.
  - It ran on `fedora-swfl-local`. `gh run view 36250668840 --log | grep "Runner name"` shows `Runner name: 'fedora-swfl-local'`.
  - The weekend empty-grid crash is fixed. Commit 8c5f8a5a (09/20/2026 02:08:50 -0400) skips the `k-grid-norecords` row (`resources.py:33-36`). Every scheduled run since 09/20 is green.
  - Every weekday from 07/13 to 09/25 has at least 200 rows except two days (Q16): 09/07 (0) and 09/21 (16).
  - The page ceiling is loud, not a silent truncation (`scraper.py:123-126`). There is also `raise_on_failed_jobs()` at `pipeline.py:35`.
  - Tests: 14 collected, all pass.

- **`lee_deed_official_records`**
  - Runs: 14 success, 1 failure (35748008748, 09/22/2026). The newest green is 36250332948 on 09/26/2026.
  - The load is idempotent: a merge on internal_doc_id (`resources.py:9-13`) with `raise_on_failed_jobs()` at `pipeline.py:33`.
  - Party-list elision is flagged rather than hidden (`README.md:84`). The 08/12 research found the parcel join through `lee_parcels.parcel_id` and built `lee_records_addressed_v` (`_RESEARCH/INDEX.md:341-352`).
  - Tests: 15 collected, all pass.

- **Test runs, 09/26/2026.**
  - `ingest/.venv/Scripts/python.exe -m pytest -q -p no:cacheprovider ingest/pipelines/lee_permits ingest/pipelines/collier_permits ingest/pipelines/collier_official_records ingest/pipelines/lee_deed_official_records` printed `135 passed, 1 warning`.
  - `REFINERY_SOURCE=fixture bun test` over the 8 family refinery tests printed `65 pass 0 fail`: permits-swfl, permits-commercial-swfl, collier-official-records-swfl, lee-deed-records-swfl, permits-source, permit-windows, permit-jurisdiction-aliases and deed-financing-classifier.

Q16:
```
with d as (select generate_series('2026-07-13'::date,'2026-09-25'::date,'1 day')::date as day) select d.day, coalesce(c.n,0) from d left join (select record_date, count(*) n from data_lake.collier_official_records group by 1) c on c.record_date=d.day where extract(isodow from d.day)<6 and coalesce(c.n,0)<200
```

## 4. Problems

**P1. The commercial-permits brain double-counts 2025 commercial permits.** Severity: blocks a served number.
- **Symptom.** `brains/permits-commercial-swfl.md:37` (v13, refined 07/19/2026) serves "412 permits totaling $2.91B …". `:58` has `"value": 412` and `:77` has `"value": 2914807745`.
  - Q17 finds 330 distinct (address, date, value) tuples worth $2,595,574,192, against 412 rows worth $2,914,807,745.
  - Q18 finds 82 rows ingested 07/14 that each share address and date with a row ingested 06/09. The 80 matching 06/09 rows carry $316,933,553. Treat that as a proxy for the inflation, not an exact figure.
  - The twins sit in different jurisdictions. Q19 shows Cape Coral paired with Bonita Springs 37 times and Unincorporated Charlotte paired with Naples 16 times, among others.
- **Root cause.**
  - `ingest/pipelines/mhs_permits_swfl/pipeline.py:79` is `ON CONFLICT (id) DO NOTHING`. A re-extract adds rows but never retires rows the new extractor no longer emits.
  - The row id includes jurisdiction (`extract.py:160,198`, `make_row_id(jurisdiction, …)`). The 07/14 multi-jurisdiction fix therefore minted new ids for re-assigned permits.
  - Run 29354353838 extracted 343 and inserted 131. So 412 − 343 = 69 rows in the table come from no current extract.
  - The reader has no dedupe: `refinery/sources/mhs-permits-source.mts:135-140` does a plain select, and the pack sums every row (`permits-commercial-swfl.mts:123-125`).
- **First seen.** 07/14/2026 (run 29354353838). Served since v13 on 07/19/2026.

Q17:
```
select count(*), sum(v) from (select distinct on (project_address, issued_date, permit_value_usd) permit_value_usd as v from data_lake.mhs_permits_swfl) t
```
Q18:
```
select count(*), sum(permit_value_usd) from data_lake.mhs_permits_swfl a where a._ingested_at::date='2026-06-09' and exists (select 1 from data_lake.mhs_permits_swfl b where b._ingested_at::date='2026-07-14' and a.project_address=b.project_address and a.issued_date=b.issued_date)
```
Q19:
```
select a.jurisdiction, b.jurisdiction, count(*) from data_lake.mhs_permits_swfl a join data_lake.mhs_permits_swfl b on a.project_address=b.project_address and a.issued_date=b.issued_date and a.id<>b.id and a._ingested_at::date='2026-06-09' and b._ingested_at::date='2026-07-14' group by 1,2 order by 3 desc
```

**P2. The permits-swfl z-scores mostly measure missing data.** Severity: blocks a served number.
- **Symptom.** `brains/permits-swfl.md:49-53` (v43, 09/15/2026) serves "direction": "bullish", magnitude 0.918, and "SWFL-weighted z = 2.76 … Lee z = 0.97, Naples z = 2.77".
  - For that build's `now` (09/15/2026 23:52 UTC), Q20 counts the 13 baseline windows:
    - Collier: 11 of the 13 windows hold 0 permits because the data is absent. Only 04/22–05/20 (1,258) and 03/25–04/22 (3,492) have rows.
    - Lee: 10 of the 13 are empty. Only three have rows: 05/20–06/17 (200, of which 94 are the fallback-dated 06/16 rows, Q4), 02/25–03/25 (75) and 01/28–02/25 (13).
  - The current 90-day window holds Collier 9,431 and Lee 45, measured against today's table (Q21).
- **Root cause.**
  - `refinery/lib/permit-windows.mts:27-39` generates 13 fixed windows and never clips them to a county's observed coverage. `countPermitsInWindow` (`:41-54`) returns 0 for any window before the data starts, and `computeZScore` (`:66-78`) treats those zeros as real history.
  - The caveat meant to warn about this reports a span, not coverage. `permits-swfl.mts:215-231` computes (latest − earliest)/30, so it printed "Collier z-scores are based on 5 months of data" (`brains/permits-swfl.md` caveats) when only 3 months are present (Q6).
  - The underlying gap is P3.
- **First seen.** Collier has had data only since 05/27/2026 (April file, Q6), and this has been served in every build since. The ledger has noted Lee's short history since June (`docs/audit/2026-07-11-pipeline-problems/02-known-problems-ledger.md:92`).

Q20:
```
with n as (select timestamptz '2026-09-15T23:52:12Z' as now), w as (select i, (select now from n) - interval '90 days' - (i*28) * interval '1 day' as e from generate_series(0,12) i) select i, (e - interval '28 days')::date, e::date, (select count(*) from data_lake.collier_building_permits c where c.date_issued >= (e - interval '28 days') and c.date_issued < e) as collier_n, (select count(*) from data_lake.lee_building_permits l where l.issued_date >= (e - interval '28 days') and l.issued_date < e) as lee_n from w order by i
```
Q21:
```
select (select count(*) from data_lake.collier_building_permits where date_issued >= timestamptz '2026-09-15T23:52:12Z' - interval '90 days' and date_issued < timestamptz '2026-09-15T23:52:12Z'), (select count(*) from data_lake.lee_building_permits where issued_date >= timestamptz '2026-09-15T23:52:12Z' - interval '90 days' and issued_date < timestamptz '2026-09-15T23:52:12Z')
```

**P3. Collier permits hold 3 of 77 published months, including a May–June 2026 hole.** Severity: blocks a served number, via P2.
- **Symptom.** Q6 finds source files 2026-4, 2026-7 and 2026-8 only. Meanwhile `discover_issued_reports()` returned 77 months, from 2020-01 to 2026-08 (§2).
- **Root cause.**
  - The run loads exactly one month, the previous calendar month (`collier_permits/pipeline.py:151-155`). The cron was off until 08/12 (`collier-permits-monthly.yml:4-10`), so May and June were never requested.
  - `_fallback_latest` (`pipeline.py:59-78`) can load an older month when the requested one is not yet out. The requested month is then never retried, so the gap-making path still exists.
- **First seen.** The May file was due ~06/15/2026. The research already recorded the June XLSX as live on 08/12 (`_RESEARCH/INDEX.md:428-429`).

**P4. The Lee Accela search returns a fixed ~100-row page set whatever the date window.** Severity: blocks a served number (Lee's share of permits-swfl).
- **Symptom.**
  - In 7 of 7 observations, pagecount was 11:
    - Five cron runs (`gh run view <id> --log | grep -E "pagecount|enriching"`): 35627576690 (102 rows), 34870507114 (104), 34142372757 (89), 33421602395 (94), 32721521284 (97).
    - Two read-only dry-runs on 09/26/2026 with `ingest/.venv/Scripts/python.exe -m ingest.pipelines.lee_permits.pipeline --dry-run --start S --end E`. A 1-day window (09/24–09/24) returned `pagecount=11`, 102 rows. A 55-day window (08/01–09/25) returned `pagecount=11`, 89 rows. The dry-run is read-only by code: `pipeline.py:246-257` returns before `run_pipeline`.
  - The cursor then keeps only rows at or after its start. Of about 100 enriched rows a week, the load days in Q12 kept 2–15.
- **Root cause.** The General Search result set does not narrow with the date window. The README already calls the date filter inert (`ingest/pipelines/lee_permits/README.md` "Known limitations"). The incremental cursor (`pipeline.py:139-145`, `on_cursor_value_missing="exclude"` with the lag-adjusted start) discards enriched rows whose issued_date is older than the start. That shape was recorded as `lee_permits_issued_date_cursor_window_mismatch` (`02-known-problems-ledger.md:92`), a check dropped 08/12; it is cited here, not resurrected.
- **Whether the Accela portal has a hard vendor cap:** could-not-verify. Only the observed invariance is claimed.
- **First seen.** 06/16/2026, the first load, "11 pages, 94 rows" (`lee_permits/README.md`).

**P5. 94 Lee rows carry the fallback issued_date 06/16/2026.** Severity: blocks a served number, via P2's Lee baseline.
- **Symptom.** Q4 returns `2026-06-16: 94`.
- **Root cause.** The first load stamped a fallback date before the 07/03 fix. The ledger says they "can't be corrected via the normal flow" (`02-known-problems-ledger.md:92`), because the cursor never re-reaches them.
- **First seen.** 06/16/2026.

**P6. Collier official records have captured no parcel IDs since 08/12/2026.** Severity: blocks a consumer that should exist. No code reads parcel_ids today: `rg -n "parcel_ids" refinery lib app scripts docs/sql` returned nothing.
- **Symptom.** Q22 finds 939 of 12,441 rows loaded 08/12 carry parcel IDs. Every daily load after that has 0 of 13,691. For DEED rows it is 871 of 2,230 before 08/12 and 0 of 2,293 after (Q23). The research counted on that 39% deed parcel route (`_RESEARCH/INDEX.md:351`).
- **Root cause: could-not-verify.** The parser reads cell 9 (`normalize.py:118`). The 08/12 backfill and the cron path share one scraper, and the only commits to the pipeline are 47ec04c9 (08/12) and 8c5f8a5a (09/20).
  - My read-only probe from the Windows box, run to inspect cell 9 live, was inconclusive. The first attempt raised `page 2 of 24 did not advance`. The second returned 1 page and 0 rows.
  - The proof command is in §7 item 9, to be run on the Fedora box.
- **First seen.** The 08/13/2026 load (Q22).

Q22:
```
select to_timestamp(split_part(_dlt_load_id,'.',1)::bigint)::date, count(*) filter (where parcel_ids is not null and jsonb_array_length(parcel_ids)>0), count(*) from data_lake.collier_official_records group by 1 order by 1
```
Q23:
```
select (record_date >= '2026-08-12') as post, count(*), count(*) filter (where jsonb_array_length(parcel_ids)>0) from data_lake.collier_official_records where doc_type='DEED' group by 1
```

**P7. A partial Collier official-records day is never re-fetched.** Severity: blocks a served number, the trailing-30d velocity in `collier-official-records-swfl`.
- **Symptom.** Q16 finds 09/21/2026 holds 16 rows, where every other non-holiday weekday holds at least 200. The 16 rows came from run 35748661727 on fedora-swfl-local, which logged `pipeline complete: 2026-09-21..2026-09-21`.
- **Root cause.** The window defaults to yesterday only (`collier_official_records/pipeline.py:54-56`). The pipeline has no check comparing rows landed against the grid's own total.
- **First seen.** 09/22/2026.

**P8. The Lee deed load re-merges 28,186 unchanged rows every day. On 09/22 it hit a statement timeout.** Severity: cosmetic (noise), but it produces a red and wasted compute.
- **Symptom.** Run 35748008748: `psycopg2.errors.QueryCanceled: canceling statement due to statement timeout` inside dlt `load.py`. raw/ has not changed since 46706166 (08/12/2026), yet the daily cron ran green 14 times in the last 15.
- **Root cause.** The cron at `ingest-lee-deed-official-records.yml:37-38` fires daily, and the resource re-reads every raw file (`resources.py:1-19`).
- **First seen.** The 09/22/2026 red. The pattern has been running since the cron enabled on 08/12.

**P9. The two record-level brains never rebuild, and both are stale by design today.** Severity: blocks a served number.
- **Symptom.**
  - `brains/collier-official-records-swfl.md:4-7` is v2 from 08/12/2026, with ttl 86400. It serves "12,441 documents loaded (through 2026-08-11)" while the table holds 26,132 through 09/25 (Q10).
  - `brains/lee-deed-records-swfl.md` is v1 from 08/12/2026.
  - `rg -n "collier-official-records-swfl|lee-deed-records-swfl" .github/` returns nothing, and the daily rebuild builds `pack_id || 'master'` (`daily-rebuild.yml:141`).
  - Neither pack is a master input (§1). `brains/_build-report.json` (09/22 master build) lists 41 outcomes and neither id is among them.
- **Second defect in waiting.** Lee deed trailing-30d metrics would read 0 if the brain were rebuilt now. The source windows off build time (`refinery/sources/lee-deed-records-source.mts:79-107`), the data ends 08/11, and the pack's caveats (`refinery/packs/lee-deed-records-swfl.mts:114-150`) carry no "latest record is N days old" guard.
- **First seen.** 08/13/2026, one TTL after v2.

**P10. The permits-swfl build failed on 09/22 on the PostgREST schema cache.** Severity: blocks a consumer, transient.
- **Symptom.** `brains/_build-report.json` has `permits-swfl … "degraded" … "selectAllPaged: query failed (rows 0-999) — Could not query the database for the schema cache. Retrying."`, and lastGood is 09/15.
- **Root cause.** The DB REST outage the brief records for 09/21. It was not restarted here.
- **First seen.** 09/22/2026.

**P11. collier_permits drops dlt job failures silently, and property_id is stored as a float string.** Severity: blocks a consumer (the parcel join).
- **Symptom.**
  - `collier_permits/pipeline.py:133` is `pipeline.run(permits_resource(rows))` with no `load_info.raise_on_failed_jobs()`. Its siblings have it: `lee_permits/pipeline.py:214`, `collier_official_records/pipeline.py:35`, `lee_deed_official_records/pipeline.py:33`.
  - property_id holds values like `40175160000.0` (Q24). A straight join to `collier_parcels.parcel_id` (for example `00051560007`) matches 0 rows. With `lpad(split_part(property_id,'.',1),11,'0')` it matches 12,371 of 14,181 (Q25). That would recover a ZIP for 6,052 of the 7,777 null-zip rows. Of the 12,371 joined rows, 6,052 have no zip, so there is nothing to compare. That leaves 6,319 comparable: 6,230 verified, 89 need review (geocoded zip differs from `phy_zipcd`), and 6,052 recoverable.
- **Root cause.** `pipeline.py:97` calls `pd.read_excel(..., header=1)` with no dtype, so numeric IDs become floats. `normalizer.py:53-57` `_to_str` then stringifies the float, which `normalizer.py:111` stores.
- **First seen.** 05/27/2026, the April load.

Q24:
```
select property_id from data_lake.collier_building_permits where property_id is not null limit 3
```
Q25:
```
select count(*), count(*) filter (where b.zip_code is null), count(*) filter (where b.zip_code is not null and b.zip_code <> p.phy_zipcd) from data_lake.collier_building_permits b join data_lake.collier_parcels p on p.parcel_id = lpad(split_part(b.property_id,'.',1),11,'0')
```

**P12. Registry, catalog and citation text contradict the code.** Severity: cosmetic, but misleading to the next agent. X verified, Y needs review:
- **collier_permits.** `cadence_registry.yaml:1203-1204` says `dispatch_only: true # cron deliberately commented out`, and `docs/standards/data-inventory.md:101` says "DISPATCH-ONLY". The code says otherwise: the schedule is live at `collier-permits-monthly.yml:13-14`, and scheduled runs 31885273282 and 34995831657 ran. The workflow is verified; the registry and inventory need review.
- **lee_deed.** The registry note at `:2468` says "cron still COMMENTED". The cron is enabled at `ingest-lee-deed-official-records.yml:20-38`. The workflow is verified.
- **lee_deed known_drift.** `known_drift` at `:2462-2463` points at check `lee_deed_load_parked_but_scheduled`, which the ledger shows as `dropped` on 08/12/2026:
  ```
  select check_key, state, resolved_at::date from public.checks where check_key ilike '%deed%'
  ```
- **mhs.** The registry note at `:1890` says 281 rows and 184 with a zip. Live is 412 and 215 (Q7).
- **Citation text.** Five served citation or diagnostic strings still say Firecrawl: `refinery/sources/permits-source.mts:25`, `refinery/sources/collier-permits-source.mts:29`, `refinery/packs/permits-swfl.mts:521,530,662`. This is open check `source_citations_say_firecrawl`.
- **Lee deed caveat.** The caveat at `lee-deed-records-swfl.mts:133` cites check `lee_deed_median_consideration_metric`, which the ledger shows dropped on 08/12.

**P13. The failure classifier routes this family's reds to UNKNOWN, which sends them to the L2 model leg.** Severity: cosmetic, but noise.
- **Symptom.** I ran the repo classifier, `classify()` from `.github/scripts/classify-cron-failure.mjs:42`, on the last 200 lines of `gh run view <id> --log-failed`. That tail size matches `fetchLogTail` in `.github/scripts/lib/cron-run.mjs:24`.
  - 35748008748 (statement timeout): UNKNOWN.
  - 34872217510 (empty grid): DATA_EMPTY.
  - 35493363031 (empty grid): UNKNOWN.
  - 28798608078 (Accela `HTTP 429`, then the content guard): CONTENT_STALE.
  - 31562954092 (`ValueError: Invalid URL`, `ingest/lib/crawl_client.py:177`): UNKNOWN.
  - `needsLlm` returns true for UNKNOWN and DATA_EMPTY (`classify-cron-failure.mjs:261-263`).
- **Root cause.** The TRANSIENT regex at `classify-cron-failure.mjs:199` has no `statement timeout|QueryCanceled`, and no class exists for a scrape-shape change (`expected \d+ <td> cells`).
- **Per-run issue history for this family.** Each is closed now. Found with `gh issue list --state all --search "permits OR official-records OR lee-deed in:title"`.
  - Collier official records: #180 (08/16), #186 (08/23), #192 (08/30), #198 (09/06), #202 (09/13), #206 (09/20). All UNKNOWN, one per weekend, for one bug.
  - Lee deed: #220 (09/22).
  - Lee permits: #107 (07/06) and #89 (06/15).

## 5. What is missing

- **`lee_permits`**
  - Vs the consumer: `permits-swfl` needs a county-wide issuance count. The feed is a fixed-size sample (P4), and the Lee side contributes 333 of the corpus's 14,514 rows (`brains/permits-swfl.md:39`).
  - Vs the source ceiling (`cadence_registry.yaml:1194-1197`): Lee ArcGIS publishes a 2003–2025 new-construction history. That is open check `lee_permits_arcgis_history_backfill`. It is a different series (RES and COM only, frozen March 2025) and must never be blended into the Accela baseline.
  - Also on the same ArcGIS org, unpulled: code enforcement (93,976 rows, live 09/18), ZoningCases (8,017, live), MobileHomeLots (live 09/20). Counts are per the registry note, `:1195`.
  - Geography: Cape Coral, Fort Myers, Bonita, Estero, Sanibel and Fort Myers Beach run their own portals. The research concluded "SKIP" for the city portals (`docs/handoff/2026-07-11-reliable-sources-findings.md:258-260`), so incorporated Lee is structurally absent.
  - Valuation is null on 284 of 339 rows (Q1).
- **`collier_permits`**
  - 74 of 77 published Issued months are missing (P3).
  - The Applied-series XLSX is published on the same page. It is a leading indicator (`cadence_registry.yaml:1219`) and is unpulled because it needs a composite key.
  - Parcel-join geography is unused (P11).
  - The open check `collier_permits_cityview_vs_xlsx` (whether CityView is fresher than the XLSX) is unanswered.
- **`mhs_permits_swfl`**
  - Field-complete per `cadence_registry.yaml:1900`.
  - Missing: any human review. 0 of 412 rows are `verified` (Q8).
  - Missing: a test suite. 0 tests.
- **`collier_official_records`**
  - Parcel IDs since 08/12 (P6).
  - History before 07/13/2026: the index depth of COR Access is not stated in the registry. Could-not-verify.
  - Doc-type labels beyond the UI multiselect, per the source ceiling at `cadence_registry.yaml:1174`.
  - A rebuild path for its brain (P9).
- **`lee_deed_official_records`**
  - Every business day since 08/11/2026. The fetch is manual and has not run.
  - Doc-type ranking for later pulls is in `_RESEARCH/INDEX.md:353-356`.
  - The source index reaches back to 2010 (`README.md:200-205`); pulled is 07/13–08/11 only.
- **Data-roots.** `docs/standards/data-roots.md:87` names `lee_deed_official_records.record_date` as the only day-grain sale date, and it is 46 days behind. The collier_permits header in data-roots (the "dispatch_only" line in the permits-cre batch) is stale (P12).
- **Hendry.** No pipeline in this family touches 12051.

## 6. Verdict per pipeline

- **`lee_permits`: REPAIR.** The feed is a fixed ~100-row sample and the cursor discards most of it (P4). 94 rows carry a fake date (P5).
  - The number that changes the verdict: pagecount under a record-type-filtered, 1-day search. Below 11 means the cap can be split, and the verdict becomes IMPROVE. If it stays at 11, Lee's permits-swfl cells are served as an explicitly labelled sample.
- **`collier_permits`: IMPROVE.** The pipeline works and is green. The gap is history and geography (P3, P11), and it feeds P2.
  - The number: distinct `source_file` months in the table, 3 today (Q6). At 15 or more contiguous months, the verdict becomes GOOD ENOUGH.
- **`mhs_permits_swfl`: REPAIR.** The served count and value are inflated by 69 stale rows (P1).
  - The number: rows not produced by the current extractor. 69 today (412 − 343) should be 0.
- **`collier_official_records`: IMPROVE.** It is green daily on Fedora, but parcel IDs have been 0 since 08/12 (P6), partial days never heal (P7), and its brain is frozen (P9).
  - The number: DEED rows recorded after 08/12 that carry a parcel ID. 0 of 2,293 today (Q23); it should match the pre-08/12 rate of 871 of 2,230.
- **`lee_deed_official_records`: PARK.** Keep the fetch parked; move the load from a daily cron to an on-push trigger (P8), and guard the pack against serving a trailing-30d zero (P9).
  - The number: an unattended fetch probe from the Fedora box that returns the search grid instead of `errors.edgesuite.net` Access Denied. That changes the verdict to IMPROVE (automate).

## 7. The plan

Items are in order. Lanes are as defined in the brief: D = deterministic, M = Max plan, C = Codex, L = local. None of these items needs a model.

1. **Collier permits: load every published month missing from the table.** (DO, lane D on GHA `ubuntu-latest`, effort M)
   - Where: `ingest/pipelines/collier_permits/pipeline.py`.
   - What:
     - Replace the single `_previous_month()` target with the set difference between `discover_issued_reports()` (`fetcher.py`) and `select distinct source_file`. Cap it at N months per run so each run stays under the 30-minute timeout (`collier-permits-monthly.yml:33`).
     - Retire the `_fallback_latest` month-skip path (`pipeline.py:59-78`).
     - Before the real backfill, dispatch one read-only dry run for `--month 2020-01`: `gh workflow run collier-permits-monthly.yml -f month=2020-01 -f dry_run=true`. The dry-run branch at `pipeline.py:157-169` stops before geocode and the dlt write. It only prints the row count, which you compare by hand to the 4,477 floor at `pipeline.py:41`; that floor is calibrated to 2026 volume.
     - Both guards in `run_pipeline` raise rather than warn: `assert_min_rows` (`pipeline.py:99`, raising `VolumeGuardError` at `ingest/lib/guards.py:198-201`) and `assert_content_fresh(newest_issued, 75)` (`pipeline.py:105`, raising `ContentStaleError` at `guards.py:152-165`).
     - As written, the content guard would abort every backfill month older than 75 days: May 2026 and every month back to 2020.
     - So the change must apply `assert_content_fresh` only to the newest published month, and make the row floor per-year (or per-month from the published file size) before any real backfill runs.
     - Order: 2025-06 through 2026-06 first (the 13 months that fill P2's baseline and the May–June hole), then back to 2020-01.
   - Proof:
     ```
     select count(distinct source_file) from data_lake.collier_building_permits
     ```
     Target is 77 or more.
   - Unblocks: P2 (Collier z), P3.

2. **Collier permits: keep property_id as a string and back-fill ZIP from parcels.** (DO, lane D, effort S)
   - Where:
     - `collier_permits/pipeline.py:97`: read the Property ID column as str.
     - `collier_permits/normalizer.py:53-57,111`: never stringify a float.
     - `collier_permits/pipeline.py:112-120`: when the geocoder gives no in-scope zip, take `collier_parcels.phy_zipcd` on the padded parcel id. Keep geocoder-vs-parcel disagreements, 89 today (Q25), as a logged count, not a silent override.
   - Also add `load_info.raise_on_failed_jobs()` at `pipeline.py:133`.
   - The re-runs in item 1 re-merge April, July and August with the fix.
   - Proof:
     ```
     select count(*) filter (where zip_code is null) from data_lake.collier_building_permits
     ```
     This must drop from 7,777. Also, `select property_id … limit 3` should show no `.0`.
   - Unblocks: ZIP-grain Collier cells in permits-swfl (`permits-swfl.mts:937-940` says Collier has no populated zip today) and P11.

3. **MHS: make re-extraction replace a calendar year atomically.** (ASK-FIRST, because it changes the data_lake write shape; lane D; effort S)
   - Where: `ingest/pipelines/mhs_permits_swfl/pipeline.py:54-85`.
   - What: in one transaction, `DELETE … WHERE source_name='mhs_databook' AND calendar_year=%s`, then insert the fresh extract. Add the first test file, `ingest/pipelines/mhs_permits_swfl/test_pipeline.py`. It should fail when a re-extract that changes a row's jurisdiction leaves the old row behind.
   - Proof:
     ```
     select count(*) from data_lake.mhs_permits_swfl where calendar_year=2025
     ```
     Expect 343 after one re-run of `ingest-mhs-permits-swfl.yml` with year 2025.
   - Unblocks: P1 permanently.

4. **MHS: one-time removal of the 69 stale 2025 rows, then a forced rebuild of the commercial brain.** (ASK-FIRST, because it is a destructive data_lake write; lane D; effort S)
   - What: item 3's re-run does the removal. Then dispatch daily-rebuild with `pack_id=permits-commercial-swfl` and force true, never `master --force`. Without force the brain reads `skipped-fresh`, because its ttl is 31,536,000 s (`brains/permits-commercial-swfl.md:7`).
   - Proof: `grep -n '"value": 412' brains/permits-commercial-swfl.md` returns nothing. The metric `commercial_permits_count` equals the Q7 count.
   - Unblocks: the served number in P1, zip-report and zip-dossier.

5. **permits-swfl: clip baseline windows to observed coverage and fix the coverage caveat.** (ASK-FIRST, because the key_metrics values change; lane D; effort M)
   - Where: `refinery/lib/permit-windows.mts:27-78` and `refinery/packs/permits-swfl.mts:215-231,279-330`.
   - What:
     - Drop any historical window that starts before the county's first observed date, or that falls in a month with no source file.
     - Compute z only when at least 6 windows remain; otherwise emit no z for that county. The 6 reuses the pack's own `COLLIER_SHORT_BASELINE_MONTHS = 6` (`permits-swfl.mts:50`).
     - Count distinct months for the caveat.
     - Add a failing test first, named for the failure: "zero-by-absence windows inflate z".
   - Proof:
     ```
     REFINERY_SOURCE=fixture bun test refinery/lib/permit-windows.test.mts refinery/packs/permits-swfl.test.mts
     ```
     Then the next v44 conclusion no longer reads "Naples z = 2.77" off 2 populated windows.
   - Unblocks: P2. Item 1 alone removes most of the Collier artifact, so do item 1 first.

6. **Lee permits: split the search under the ~100-row result set, keep every enriched row, and re-date the 94 fallback rows.** (DO, lane D, effort L)
   - Step 1, probe:
     - Add a record-type argument to `fetch_permit_pages` in `ingest/pipelines/lee_permits/scraper.py`. It would set the General Search "Record Type" control, whose selector must be read live first.
     - Run `--dry-run --start D --end D` for one type on one day.
     - Proof: the log prints `pagecount=` below 11.
   - Step 2, build (only if the probe passes):
     - Sweep types × days.
     - Stop the cursor from excluding enriched rows older than its start. The merge on permit_id (`pipeline.py:132-137`) already makes an overlap idempotent.
     - Re-fetch CapDetail for the 94 permit_ids dated 06/16 through the same merge.
   - Proof:
     ```
     select count(*) from data_lake.lee_building_permits where issued_date='2026-06-16'
     ```
     This must fall from 94. Load-day counts (Q12) must rise above 15.
   - Unblocks: P4, P5, and a real Lee half of permits-swfl.

7. **Registry and doc truth pass.** (DO, lane D, effort S)
   - Remove `dispatch_only: true` and its comment from collier_permits (`cadence_registry.yaml:1203-1204`).
   - Correct the lee_deed note (`:2468`) and delete its `known_drift` line (`:2462-2463`).
   - Update the mhs note (`:1890`).
   - Update `docs/standards/data-inventory.md:101` and the collier_permits header in `docs/standards/data-roots.md`.
   - Fix the five Firecrawl strings (P12). That closes check `source_citations_say_firecrawl` for this family's sites.
   - Correct the stale "moot while its table is empty" comment at `master.mts:385`.
   - Remove the dropped-check reference in the caveat at `lee-deed-records-swfl.mts:133`.
   - Proof: `rg -n "dispatch_only|Firecrawl" ingest/cadence_registry.yaml refinery/sources/permits-source.mts refinery/sources/collier-permits-source.mts refinery/packs/permits-swfl.mts` returns only intended hits. Also run `node scripts/schedule-catalog.mjs` and the Gate 10 check.

8. **Collier official records: trailing re-pull window plus a per-day completeness check.** (DO, lane D on Fedora where it already runs, effort S)
   - Where: `collier_official_records/pipeline.py:54-56` (default start today − 7, end yesterday; the merge on instrument_number makes the overlap free) and `scraper.py:66,119`.
   - What: parse the pager's total-items figure next to `parse_total_pages`, and raise when the normalized rows for a day fall short of it.
   - Proof:
     ```
     select count(*) from data_lake.collier_official_records where record_date='2026-09-21'
     ```
     Expect at least 200 after the next run.
   - Unblocks: P7.

9. **Collier official records: find why parcel IDs stopped after 08/12.** (DO, lane D, effort S; the root cause is could-not-verify today)
   - Proof command, on the Fedora box (read-only; `pipeline.py:58-65` returns before any write):
     ```
     ssh fedora 'cd ~/actions-runner/_work/SWFL-Data-Gulf/SWFL-Data-Gulf && ~/swfl-runner-venv/bin/python -m ingest.pipelines.collier_official_records.pipeline --dry-run --start 2026-09-24 --end 2026-09-24'
     ```
     Then diff cell 9 of a DEED row against the markup captured in `collier_official_records/test_normalize.py`.
   - Fix at `normalize.py:118` or `scraper.py`. Then re-pull 08/12 through today through the merge.
   - Proof: Q23 post-08/12 `with_parcel` above 0.
   - Unblocks: P6, and the 39% deed-to-parcel route in `_RESEARCH/2026-08-12-deed-parcel-strap-join-fix.md`.

10. **Lee deed: load on push, not on a daily cron.** (DO, lane D on GHA, effort S)
    - Where: `.github/workflows/ingest-lee-deed-official-records.yml:37-38`. Replace `schedule` with `on: push: paths: ["ingest/pipelines/lee_deed_official_records/raw/**"]` and keep `workflow_dispatch`.
    - Update the registry note to match.
    - Proof: `gh run list --workflow ingest-lee-deed-official-records.yml --limit 5` shows no new `schedule` events after the change.
    - Unblocks: P8, and removes a red class.

11. **Lee deed and Collier records packs: never serve a trailing-window zero off stale data.** (DO for the caveat, lane D, effort S)
    - Where: `refinery/packs/lee-deed-records-swfl.mts:114-150` and `collier-official-records-swfl.mts:82-95`.
    - What: when `latest_record_date` is more than 7 days before build time, add a caveat that names the date and states the trailing-30d figures cover the loaded span, not the calendar window.
    - Suppressing or renaming the metric itself is part of the item-12 decision (key_metrics).
    - Proof: a fixture test with the latest date 08/11 asserts the caveat text.

12. **Give the two record-level brains a rebuild path.** (ASK-FIRST, because it changes master's inputs or the rebuild schedule; lane D, effort S)
    - Either add both as non-critical `input` edges in `master.mts` (the same shape as `home-values-swfl` at `:383-390`), or give each its own scheduled `pack_id=<brain-id>` rebuild.
    - Proof: `refinery_at` in `brains/collier-official-records-swfl.md` advances past 08/12.
    - Unblocks: P9.

13. **Lee deed unattended-fetch probe from the residential IP.** (DO, lane D on Fedora, effort S)
    - What: one read-only crawl4ai UndetectedAdapter GET of the LandMarkWeb search page from `fedora-swfl-local`. This is the same adapter that clears Collier's Akamai (`collier-permits-monthly.yml:5-6`).
    - Stop rule: stop at the first `errors.edgesuite.net` Access Denied, record it in the README "Delivery mechanism" section, and try nothing further.
    - Whether the 07/20 crawl4ai attempt used UndetectedAdapter is not recorded (`README.md:134`), so this is new evidence, not a repeat.
    - Proof: the probe prints the page title and whether the search form is present.
    - Unblocks: the PARK verdict in either direction.

14. **Classifier patterns for this family's reds.** (DO, lane D, effort S; the owner seam is family 19)
    - What: add `statement timeout|QueryCanceled|DatabaseTransientException` to the TRANSIENT regex at `classify-cron-failure.mjs:199`, and add one deterministic class for `expected \d+ <td> cells|did not advance`. Include a test in `classify-cron-failure.test.mjs` using the two quoted log lines.
    - Proof: re-classify the saved tails for 35748008748, 35493363031 and 34872217510. None returns UNKNOWN or DATA_EMPTY.
    - Unblocks: removes this family's L2 model trigger (§10).

15. **Collier Applied series.** (ASK-FIRST, because it needs a new composite primary key permit_number+series on `data_lake.collier_building_permits`, a data_lake write shape; lane D; effort M)
    - What: load the Applied XLSX from the same page (`cadence_registry.yaml:1219`).
    - Proof:
      ```
      select _ingest_metadata__series, count(*) from data_lake.collier_building_permits group by 1
      ```
      This shows `applied`.

16. **Lee ArcGIS March-2025 history as its own table, never blended.** (DO, lane D, effort M, open check `lee_permits_arcgis_history_backfill`)
    - Low priority. It only matters if a long Lee history is wanted, and the series differs from Accela.
    - Proof: the table count matches the layer's own count read at load time.

Counts: 11 DO (1, 2, 6, 7, 8, 9, 10, 11, 13, 14, 16) and 5 ASK-FIRST (3, 4, 5, 12, 15).

## 8. Checks and balances

The design rule is one signal per pipeline. Each signal fires only when a served number would be wrong or a consumer would read stale data, auto-closes when green, and is never a per-run GitHub issue.

- **The seam, as the code runs it today.**
  - `ingest/scripts/check_freshness.py` reads the registry. `_fetch_max_freshness` (`:240-300`) resolves freshness three ways:
    - `freshness_table` gives MAX(freshness_column).
    - `dlt_schema_name` gives `_dlt_loads.inserted_at`, which is LOAD freshness, not content.
    - `count_table` gives MAX(freshness_column).
  - A tier-2 row is STALE when `age_days > int(cadence_days * tolerance_multiplier)` (`:495-516`).
  - `freshness_sla` is opt-in (`:25-31`). An `error_after_days` breach makes the probe exit 1 (`check_sla_violations`, `:768-790`). A `warn_after_days` breach only logs.
  - `ingest/scripts/doctor.py:1-21` joins freshness, volume, content and gh run status into one line per dataset, and the ops `/coverage` page shows that line.
  - The doctor is gating. `freshness-probe-daily.yml:64-71` runs `doctor --cron --fail-on red`, so any red dataset turns the single probe job red.
  - That red folds into the probe's one existing incident: check `cron_incident_freshness_probe_daily` (open) and issue #110 (open since 07/12). It is never a per-pipeline issue.
  - `sync_gap_checks` (`:646`) handles city_pulse corridor gaps only and plays no part here.

Per pipeline, the ONE signal is the dataset's doctor line on `/coverage`. Each goes red only when content is stale past the registry rule, and goes green on the next fresh load. No `error_after_days` is added anywhere, so no second exit-1 path is created.

- **`lee_permits`: content freshness on issued_date.** Registry change at `cadence_registry.yaml:1179-1187`:
  - Replace the effective `dlt_schema_name` freshness with `freshness_table: data_lake.lee_building_permits` and `freshness_column: issued_date`.
  - The existing rule `cadence_days: 7 × tolerance_multiplier: 3.0` (`:1183-1184`) gives 21 days. The pipeline's own 14-day `assert_content_fresh` (`pipeline.py:222`) already turns the run red earlier.
  - A stalled scrape then reads STALE on the doctor line, instead of FRESH off a load row.
- **`collier_permits`: content freshness on date_issued.**
  - `freshness_table: data_lake.collier_building_permits`, `freshness_column: date_issued`.
  - The existing rule `30 × 2.0` (`:1206-1207`) gives 60 days. Content normally lags about 45 days before the next mid-month load: August content with a max of 08/31 is 45 days old on 10/15.
  - Month gaps stop being possible by construction once item 1 loads every missing month, so gaps need no separate alarm.
- **`mhs_permits_swfl`: keep the existing annual probe unchanged.** `freshness_table` + `_ingested_at` + `first_expected_by: 2027-03-13` (`:1885-1888`).
  - The double-count cannot be caught by freshness. Item 3 removes it at the write, and that test is its guard.
- **`collier_official_records`: content freshness on record_date.**
  - `freshness_column: record_date` in place of `_dlt_load_id` (`:1164-1165`).
  - Raise `tolerance_multiplier` from 3.0 to 5.0 (`:1161`). With `cadence_days: 1` (`:1160`) that gives 5 days, so a weekend plus a holiday Monday (the Q16 09/07 pattern) does not read STALE.
  - Item 8's per-day completeness check turns a partial day into a red run inside the pipeline, not a new alert.
- **`lee_deed_official_records`: no probe while parked.** The registry keeps it under `not_yet_running:`, and `check_freshness.run_probe` reads only `pipelines:` (`:723`).
  - The one signal is at the served surface instead: item 11's staleness caveat names the latest record date. When a real fetch cadence exists, graduate it with `freshness_column: record_date`, as the registry comment at `:2456-2457` already specifies.

Noise to delete (existing):

- **Two whole-table `expected_rows_min` floors that can never fire.**
  - The volume check counts the whole table (`check_freshness.py:430-489`).
  - `lee_permits` has `expected_rows_min: 5` (`:1186`) against 339 rows.
  - `collier_official_records` has `expected_rows_min: 100` (`:1162`) against 26,132.
  - Set them to 90% of the live count as a truncation tripwire, per the registry's own 90% convention (for example `:1140`). That gives 305 for lee_permits (from Q1's 339) and 23,518 for collier_official_records (from Q10's 26,132). Or delete them.
- **The `known_drift` entry pointing at the dropped check** `lee_deed_load_parked_but_scheduled` (`:2462-2463`).
- **Incident issues from flapping failures.** The history is in P13: six Collier-records issues for one bug in six weekends.
  - How the filer works, from the code: on each failure `log-cron-incident.mjs` `recordFailure` (`:66-128`) does three things.
    - Reopens the check `cron_incident_<workflow>` (`:57-58`, `:150-156`).
    - Comments on the sticky feed issue #44.
    - Opens one `[cron-failure:<workflow>]` issue, but only if none is already open for that workflow (dedup at `:219-230`).
  - The next scheduled green closes the issue and the check (`:129`, `:283-296`). So it is one issue per incident, not per run.
  - The six Collier issues are six incidents: red on each weekend, green on each weekday.
  - `docs/cron-rebuild-failures.md` is no longer written by the bot (`log-cron-incident.mjs:3-5`).
  - There is no per-workflow issue toggle. The only switch is the global `CRON_INCIDENT_LOGGER_ENABLED` (`log-cron-incident.yml:121`, the job gate; sticky issue number 44 is `vars.CRON_INCIDENT_ISSUE_NUMBER` per `gh variable list`). Removing a name from the trigger list (`log-cron-incident.yml:24,47,79,88,90`) would drop its check as well as its issue.
  - Decision: keep all five names on the logger, because the check is the right durable, self-closing record. Delete the noise at its causes instead:
    - the weekend crash (fixed 8c5f8a5a);
    - the no-op deed re-merge (item 10);
    - UNKNOWN classifications (item 14).
  - If family 19 adds a per-workflow manifest field that suppresses issue creation, these five are candidates.
  - Take the five names out of `.github/workflows/heal-cron-failure.yml:27,50,81,88,90` once item 14 lands, since there is no L2 leg to feed.
  - `gh issue list --label cron-failure --state open` shows 21 open issues today, none for this family. Nothing needs closing now.
- **The daily no-op Lee deed re-merge** (item 10).
- **The stale caveat reference** to dropped check `lee_deed_median_consideration_metric` (`lee-deed-records-swfl.mts:133`).

What NOT to add: no new check keys and no per-run issues. The four open family checks stay as they are: `lee_permits_arcgis_history_backfill`, `lee_permits_cape_coral_coverage_gap`, `collier_permits_cityview_vs_xlsx` and `source_citations_say_firecrawl` (`node scripts/check.mjs list`). Close them only with the work in items 7 and 16 and the answers to those two tasks.

## 9. Box placement

- **`lee_permits`: move to the Fedora runner, gated, when item 6's sweep lands. Until then, stay on GHA `ubuntu-latest`.**
  - Reason 1, WAF: the datacenter-IP 429 history. Run 28798608078 logged `Blocked by anti-bot protection: HTTP 429 Too Many Requests` on CapDetail.
  - Reason 2, runtime: one week's enrichment already takes about 9 minutes (log timestamps 16:47:09 to 16:55:53 in run 35627576690). A type × day sweep multiplies requests against a 30-minute job ceiling (`lee-permits-weekly.yml:28`).
  - Use the same gated `runs-on` expression and self-hosted venv steps as `ingest-collier-official-records.yml:31,40-56`, so `SWFL_LOCAL_RUNNER_READY=false` falls back to the cloud.
- **`collier_permits`: stays on GHA `ubuntu-latest`.**
  - Datacenter IP is proven green: 31565435973, 31885273282, 34995831657.
  - The job is under 30 minutes, needs no browser beyond crawl4ai-setup, needs no SSD, and needs no local model. The item-1 backfill also runs there, capped per run.
  - The runbook already flags "whether Collier permits needs Fedora at all" as needs-review (`_ASSISTANT/2026-09-15-fedora-runner-runbook.md:54-55`). The evidence says no.
- **`mhs_permits_swfl`: stays on GHA `ubuntu-latest`.** Annual PDF, pdfplumber, no WAF, well under 6 hours.
- **`collier_official_records`: stays where it is, on the Fedora runner, gated.**
  - It does not strictly need the residential IP. Scheduled GHA-hosted runs were green before the 09/20 flip, for example 34989882940 on 09/15 and 35115815483 on 09/16.
  - Keeping it there costs nothing, and the fallback is the same one variable.
  - Risk: the box's backup and reboot test is untested, per the brief's standing facts. A box outage shows up as a scheduled red that the fallback flip clears.
- **`lee_deed_official_records`: the load stays on GHA `ubuntu-latest`.** It reads committed files, needs no IP, and after item 10 runs only on push.
  - The fetch stays human-in-a-real-browser (`README.md:146-154`) until item 13's Fedora probe answers. If it passes, the fetch becomes a Fedora job on the gated expression.
- **Already on the box that should not be:** nothing in this family.

## 10. Compute lane per LLM leg

The grep that proves the pipelines, workflows and consumer packs make no model call:

```
rg -n -i "anthropic|claude|openai|ANTHROPIC_API_KEY|llm|refinery|ollama|gpt" ingest/pipelines/lee_permits ingest/pipelines/collier_permits ingest/pipelines/mhs_permits_swfl ingest/pipelines/collier_official_records ingest/pipelines/lee_deed_official_records .github/workflows/lee-permits-weekly.yml .github/workflows/collier-permits-monthly.yml .github/workflows/ingest-mhs-permits-swfl.yml .github/workflows/ingest-collier-official-records.yml .github/workflows/ingest-lee-deed-official-records.yml --glob '!raw/**'
```

The only hits are comments, names inside fixtures and deed party names. The ones that matter:
- `lee_deed_official_records/README.md:146-153` (claude-in-chrome as the manual fetch).
- `collier_official_records/pipeline.py:10` ("No LLM calls in this pipeline").

```
rg -n -i "anthropic|messages\.create|claude-|openai|generateText|callModel|llm" refinery/packs/permits-swfl.mts refinery/packs/permits-commercial-swfl.mts refinery/packs/collier-official-records-swfl.mts refinery/packs/lee-deed-records-swfl.mts refinery/sources/permits-source.mts refinery/sources/collier-permits-source.mts refinery/sources/mhs-permits-source.mts refinery/sources/collier-official-records-source.mts refinery/sources/lee-deed-records-source.mts
```

No model calls. The only hits are a comment at `permits-commercial-swfl.mts:169` and function names in `permits-swfl.mts`.

Legs that touch this family:

- **Leg 1: the Lee deed manual fetch.**
  - What: pulls a LandMarkWeb day through a real browser, today via claude-in-chrome in an interactive session (`README.md:146-154`).
  - Current auth: the operator's interactive Max session (lane M, interactive, the Issue 001 pattern).
  - Can it need no model? Yes. The operator clicks the Export button in his own Chrome, then runs `python ingest/pipelines/lee_deed_official_records/sync_all_exports.py` and pushes raw/. That sweep is deterministic (`sync_all_exports.py:1-12`), and item 10's on-push load finishes it. Preferred lane: D.
- **Leg 2: `heal-cron-failure.yml` L2 diagnosis.** Cross-cutting; family 19 owns it.
  - What: fires on failures of all five family workflows (`heal-cron-failure.yml:27,50,81,88,90`) when `needsLlm(klass)` is true (`classify-cron-failure.mjs:261-263`). It calls `claude-haiku-4-5` through the SDK (`heal-cron-failure.mjs:218-231`).
  - Current auth: repo secret `ANTHROPIC_API_KEY` (`heal-cron-failure.yml:191`). This plan proposes no change to that auth; the lane decision for the leg as a whole belongs to family 19's plan.
  - For this family the leg is not needed:
    - `heal-cron-failure.mjs:214-215` already posts a deterministic-only diagnosis when no key is present.
    - Item 14 makes every observed family red classify deterministically.
    - Item 14 plus removing the five names from the heal list (§8) takes this family off the leg entirely. Replacement lane: D.
- **Leg 3: brain rebuilds of the four family packs.** Deterministic producers; the grep above shows no model call in these packs or sources. Refinery-wide model stages, such as the narrative bake, are family 16's. Lane D.
- **Lane L: no leg.** Nothing here extracts, counts or grades with a model, and none should.

## 11. Double-check log

I re-read the plan top to bottom and re-ran each numbered claim against its source. Format: claim · verifying command or file · result.

- Registry lines 1155/1179/1200/1879/2459 · `grep -n "name: <n>" ingest/cadence_registry.yaml` · verified.
- lee_permits 339 rows; max load 09/21 16:56; issued 02/25..09/21; null value 284, type 82, lat 61, zip 2 · Q1 · verified. It was corrected from the registry comment's "333" (`cadence_registry.yaml:1188`, as of 09/20), which is superseded by the 09/21 load of 6 rows (Q12).
- Lee month counts 13/75/11/189/15/10/26 with no April · Q2 · verified.
- 94 rows dated 06/16 · Q4 · verified.
- 0 CAPE CORAL addresses · Q3 · verified. I first drafted a ZIP-list version of this claim and replaced it with the address test, because the ZIP list came from memory.
- collier_permits 14,181; 3 files at 4,750 / 4,746 / 4,685; null zip 7,777; null lat 7,566 · Q5, Q6 · verified.
- 77 published months, 2020-01..2026-08 · `discover_issued_reports()` run live 09/26 · verified.
- property_id join 12,371; recoverable 6,052; disagree 89 · Q25 · verified. The agreement split is corrected. My first draft said "12,282 verified", which wrongly counted the 6,052 null-zip rows as agreements. The correct split is 6,230 verified out of 6,319 comparable (12,371 − 6,052 = 6,319; 6,319 − 89 = 6,230). I corrected an earlier plain-`lpad` measurement of 11,398, which truncated the `.0` suffix wrongly, to the `split_part` form.
- MHS 412 rows; 215 with zip; 0 verified; county split Lee 283 / Collier 110 / Charlotte 19 · Q7, Q8, Q9 · verified.
- MHS 343 extracted, 131 inserted · `gh run view 29354353838 --log` · verified.
- MHS 330 tuples / $2,595,574,192 vs $2,914,807,745 · Q17 plus the all-rows sum · verified.
- MHS 80 old twins / $316,933,553 and 82 new twins · Q18 plus the reverse query · verified.
- The 19 Charlotte rows are all stale twins · Q19 (Charlotte→Naples 16, Punta Gorda→Naples 3) · verified.
- Served "412 permits totaling $2.91B" · `brains/permits-commercial-swfl.md:37-39,58,77` · verified.
- permits-swfl served z 2.76 / Naples 2.77 / Lee 0.97 / bullish / "5 months" caveat · `brains/permits-swfl.md:49-53` plus the caveats block · verified.
- Baseline empty windows: Collier 11 of 13, Lee 10 of 13; current window Collier 9,431 and Lee 45 · Q20, Q21 · corrected. My first draft said Lee 9 of 13. Q20 shows Lee zero in windows i1, i2 and i5–i12, and rows only in i0 (200), i3 (75) and i4 (13). Fixed in the headline paragraph and in P2. Lee's 45 is measured against today's table, which includes rows loaded after the 09/15 build (Q12 09/21 load); stated as such.
- Accela pagecount 11 in 7 of 7; row counts 102/104/89/94/97, plus the dry-runs at 102 and 89 · run logs plus the two dry-run commands · verified.
- Lee rows written per load day · Q12 · verified.
- Collier records 26,132 rows, 36 doc types, 07/13..09/25 · Q10 · verified.
- Only 09/07 and 09/21 under 200 among weekdays · Q16 · verified.
- Parcel fill 939 of 12,441, then 0 of 13,691 · Q22, plus a period-split query · verified.
- DEED 871/2,230 vs 0/2,293 · Q23 · verified.
- Collier parcel regression root cause · could-not-verify. The Windows probe was inconclusive, as stated in P6.
- Lee deed 28,186 rows; DEED 5,353; strap 12,409; 07/13..08/11; raw 22 files, last commit 08/12 · Q13, `ls raw | wc -l`, `git log -1 -- raw/` · verified.
- consideration > 0: 8,201; deed > 100: 3,229 · Q14 · verified.
- Run tallies: lee 13/1 skipped/1 red; collier permits 11 runs, 6 success and 5 failure; mhs 2 of 2; collier records 13/2; lee deed 14/1 · `gh run list … --limit 15` output · verified.
- The fix 8c5f8a5a at 06:08:50 UTC landed after red 35493363031 at 06:06:20 UTC · `git log -1 --format="%ad"` plus the run createdAt · verified.
- Classifier results UNKNOWN / DATA_EMPTY / UNKNOWN / CONTENT_STALE / UNKNOWN · `classify()` over 200-line `--log-failed` tails · verified.
- The tail size matches production (`cron-run.mjs:24`) · verified.
- Issues #180/#186/#192/#198/#202/#206/#220/#107/#89 · `gh issue list --state all --search …` · verified.
- 21 open cron-failure issues, none for the family · `gh issue list --label cron-failure --state open` · verified.
- Test counts 53/53/14/15/0, 135 passed; bun 65 pass across 8 files · pytest and bun runs · verified.
- Build report 09/22: permits-swfl degraded on the schema cache, 41 outcomes · `brains/_build-report.json` · verified.
- No `.github` reference to the two record brains · `rg` returned nothing · verified.
- MHS source page live, same PDF · crawl4ai fetch 09/26 · verified.
- Collier records ran GHA-hosted before 09/20 · `gh api repos/{owner}/{repo}/actions/runs/<id>/jobs --jq '.jobs[] | "\(.runner_name) \(.labels|join(","))"'` returns `GitHub Actions 1000011793 ubuntu-latest` for 34989882940 and `GitHub Actions 1000011977 ubuntu-latest` for 35115815483, and `fedora-swfl-local self-hosted,swfl-local` for 36250668840. `gh variable list` shows `SWFL_LOCAL_RUNNER_READY true 2026-09-20T06:06:19Z` · verified. My first draft listed this as could-not-verify; it was upgraded after these calls.
- 90% floors 305 and 23,518 · arithmetic on Q1 (339 × 0.9 = 305.1) and Q10 (26,132 × 0.9 = 23,518.8), rounded down · verified.

- Item 1's backfill would pass the existing guards · `ingest/lib/guards.py:152-165` (`ContentStaleError`) and `:198-201` (`VolumeGuardError`), called at `collier_permits/pipeline.py:99,105` · corrected. My first draft assumed only the row floor mattered and said the dry-run "checks" it. Both guards raise, the 75-day content guard would abort every older month, and the dry-run branch (`pipeline.py:157-169`) only prints a count. Item 1 was rewritten.
- §8 mechanism · `.github/scripts/log-cron-incident.mjs:3-5` (the md ledger is no longer bot-written), `:57-58,66-128,129,150-156,219-230,283-296`; `check_freshness.py:495-516` (STALE rule), `:646` (`sync_gap_checks` is city_pulse only), `:768-790` (the SLA error exits 1); `freshness-probe-daily.yml:64-71` (doctor gating) · corrected. My first draft said to "keep the ledger row in docs/cron-rebuild-failures.md", said gap checks would track these pipelines, proposed `error_after_days` values, and proposed a per-workflow issue stop that has no knob. §8 was rewritten on the code as it runs.
- Every family geocoder is the free Census batch service · `lee_permits/geocoder.py:3,18`, `mhs_permits_swfl/geocode.py:35`, `collier_permits/geocoder.py:1,93` · verified.
- Collier records `tolerance_multiplier` 3.0 and `cadence_days` 1 · `sed -n 1160,1161p ingest/cadence_registry.yaml` · verified.
- Lee permits 7 × 3.0 and Collier permits 30 × 2.0 · `sed -n 1183,1184p` and `sed -n 1206,1207p` · verified.

Corrections applied above: 32 in total.
- 3 first-pass: the Lee row count, the Cape Coral test method, the Collier join form.
- 25 file:line citations whose numbers had drifted. The corrected numbers are in the sections above; check each with `sed -n <line>p`.
- 4 second-pass: the Lee empty-window count 9 → 10, the P11 agreement split, the item-1 guards and dry-run wording, the §8 mechanism.

One claim first logged as could-not-verify is now verified: the runner for two Collier records runs. One stays could-not-verify: the Collier parcel regression root cause.

## 12. Questions for the operator

1. **Lee deed fetch.** Do you want to spend one interactive session a week clicking LandMarkWeb Export for the missed business days? The deterministic `sync_all_exports.py` plus the item-10 on-push load does the rest. Or does it stay parked until item 13's Fedora probe answers? It is your time; the cost is 46 days of missing day-grain sale dates so far.
2. **MHS cleanup (items 3–4).** Approve deleting and replacing the 2025 `mhs_permits_swfl` rows, so the served count moves from 412 to the 343 the current extractor produces.
3. **permits-swfl z math (item 5).** Approve changing how the Collier and Lee z are computed (clipped baselines, and no z below 6 populated windows). It changes served key_metrics values.
4. **Record-level brains (item 12).** Should `collier-official-records-swfl` and `lee-deed-records-swfl` become non-critical master inputs, or get their own rebuild schedule outside master?
5. **Collier Applied series (item 15).** Approve a composite key (permit_number + series) on `data_lake.collier_building_permits` to add the leading-indicator series.
