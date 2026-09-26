# 12 dbpr — pipeline plan (09/26/2026)

Family 12 is the Florida DBPR group: six registry pipelines across five workflows and six tables. They are dbpr_press_releases, dbpr_public_notices, dbpr_sirs_submissions (pinned to the Fedora runner), fl_dbpr_licenses and fl_dbpr_applicants (one workflow for both), and dbpr_re_licensees (a dark root).

The verdict is that two are broken where it counts:
- The public-notices parser has returned zero SWFL notices every week since 08/10/2026. DBPR changed the index page markup. Three live Lee notices are missing from the table, and the run still reports green (P1).
- The contractor-license counts served by licenses-swfl include 960 "Current/Active" rows that are no longer in DBPR's current extract. The served Lee 6,620 and Collier 3,405 equal the current rows plus exactly those stale rows (P2). 1,173 of the 1,226 rows missing from the extract expired on 08/31/2026. That is a renewal-deadline lapse wave, and the served "headline" lapse rate of 0.5% cannot see it by construction.

The other four ingests work, but three carry a claim that is wrong or a guard that cannot see:
- The registry says the press-release source "went quiet 02/07/2025". The newest release is 08/19/2026 (P9).
- Applicants freshness read green through two red months (P3).
- SIRS has not really written since 08/06/2026 (P6).

Both LLM legs can be deleted or made deterministic. No model lane is needed.

## 1. Scope

Six pipelines, five workflow files, six tables plus one view, and three consumer brains. All three brains feed master.

- dbpr_press_releases: registry `ingest/cadence_registry.yaml:1441`.
  - Workflow: `.github/workflows/dbpr-press-releases-weekly.yml`.
  - Pipeline dir: `ingest/pipelines/dbpr_press_releases/`.
  - Table: `public.dbpr_press_releases`.
  - Consumer: `refinery/sources/dbpr-press-releases-source.mts` → `refinery/packs/news-swfl.mts` → master (modifier edge, `refinery/packs/master.mts:310`).
- dbpr_public_notices: registry `ingest/cadence_registry.yaml:1584`.
  - Workflow: `.github/workflows/dbpr-public-notices-weekly.yml`.
  - Pipeline dir: `ingest/pipelines/dbpr_public_notices/`.
  - Table: `public.dbpr_public_notices`.
  - Consumer: `refinery/sources/dbpr-public-notices-source.mts` → news-swfl → master.
- dbpr_sirs_submissions: registry `ingest/cadence_registry.yaml:1496`.
  - Workflow: `.github/workflows/dbpr-sirs-monthly.yml`.
  - Pipeline dir: `ingest/pipelines/dbpr_sirs/`.
  - Table: `data_lake.dbpr_sirs_submissions`.
  - Consumer: `refinery/sources/dbpr-sirs-source.mts` → `refinery/packs/condo-sirs-swfl.mts` → master (input edge, `refinery/packs/master.mts:335`).
- fl_dbpr_licenses: registry `ingest/cadence_registry.yaml:1532`.
  - Workflow: `.github/workflows/ingest-fl-dbpr-licenses.yml`.
  - Pipeline dir: `ingest/pipelines/fl_dbpr_licenses/`.
  - Table: `data_lake.fl_dbpr_licenses`.
  - Consumer: `refinery/sources/fl-dbpr-licenses-source.mts` → `refinery/packs/licenses-swfl.mts` → master (input edge, `refinery/packs/master.mts:334`).
- fl_dbpr_applicants: registry `ingest/cadence_registry.yaml:1558`.
  - Runs in the same workflow and the same pipeline run as fl_dbpr_licenses. It is the applicants resource, `write_disposition="replace"` (`ingest/pipelines/fl_dbpr_licenses/resources.py:296`).
  - Table: `data_lake.fl_dbpr_applicants`.
  - Consumer: the same source file → licenses-swfl → master.
- dbpr_re_licensees: registry `ingest/cadence_registry.yaml:1612`, `consuming_pack: none`.
  - Workflow: `.github/workflows/ingest-dbpr-re-licensees.yml`.
  - Pipeline dir: `ingest/pipelines/dbpr_re_licensees/`.
  - Table: `public.dbpr_re_licensees`, plus view `public.new_re_agents` (`docs/sql/20260711_dbpr_re_licensees.sql:56`).
  - Consumer: none. A repo-wide Grep for `dbpr_re_licensees|new_re_agents` over non-markdown files hits only the ingest code, SQL, generated types, hooks and the identity tool. Nothing under `app/`, `lib/` or `refinery/` reads it. DARK ROOT, confirmed.

Registry fields, all six `lane: tier-2`:
- dbpr_press_releases: `cadence_days: 7`, `tolerance_multiplier: 3.0`, `freshness_column: scraped_at`, `expected_rows_min: 135` (`cadence_registry.yaml:1441-1451`).
- dbpr_public_notices: 7, 3.0, `freshness_column: last_seen_at`, `expected_rows_min: 1` (`:1584-1592`).
- dbpr_sirs_submissions: 30, 2.0, `freshness_column: scraped_at`, `expected_rows_min: 50` (`:1496-1503`).
- fl_dbpr_licenses: 30, 2.0, `dlt_schema_name: fl_dbpr_licenses`, `count_table`, `expected_rows_min: 5000` (`:1532-1540`).
- fl_dbpr_applicants: 30, 2.0, `dlt_schema_name: fl_dbpr_licenses` (shared), `expected_rows_min: 7800`, labelled PLACEHOLDER (`:1558-1566`).
- dbpr_re_licensees: 7, 3.0, `freshness_column: last_seen_at`, `expected_rows_min: 15000` (`:1612-1620`).

Source ceilings:
- Press releases: one feed, exhaustive (`:1466`).
- Notices: unknown whether the PDFs carry discrete penalty or statute fields (`:1607`).
- SIRS: the full QIX column set is already mapped (`:1527`).
- Licenses: 2 of 35 boards, and address columns are dropped (`:1556`).
- Applicants: 6 unused columns, including Address 1/2/3 (`:1579`).
- RE licensees: no email or phone in the file (`:1634`).

## 2. What is being brought in

Live numbers were read 09/26/2026 through a read-only Bun.SQL session. The connection approach is copied from `scripts/apply-fdic-sod-view.mts:15-27`, with `SET SESSION default_transaction_read_only = on`. The throwaway lives in the scratchpad and is never committed. Each query is shown with its result on the line after the fence.

dbpr_press_releases
- Source: `https://www2.myfloridalicense.com/press-releases/`, pages 1-2 weekly (`ingest/pipelines/dbpr_press_releases/constants.py:8`), fetched with crawl4ai 0.9.0 (`ingest/requirements.txt:19`).
- Fields: source_url, title, published_date, body_text. The LLM fills summary, topics, affected_industries, geographic_mentions and is_swfl_relevant (`enricher.py:25-75`).
- Geography: releases are statewide. Lee/Collier relevance is recomputed in-pack from geographic_mentions (`refinery/packs/news-swfl.mts:29-32`, `:130-146`).
- Live:
  ```
  select count(*), max(scraped_at), min(published_date), max(published_date), count(*) filter (where summary is null), count(*) filter (where is_swfl_relevant), count(*) filter (where published_date is null) from public.dbpr_press_releases;
  ```
  Result: 152, 2026-09-21T15:28:21Z, 2016-01-22, 2026-08-19, 0, 24, 6.
- Counties: not a county-grain table. Lee and Collier are matched from text in the pack. Hendry is not matched by the pack (core scope only).
- Source still publishes: yes. The 09/26 crawl4ai crawl of the page shows "August 19, 2026" on its newest release (crawl line 27).

dbpr_public_notices
- Source: `https://www2.myfloridalicense.com/public-notices/`. That is the index page plus one PDF per notice (`pipeline.py:32`, `:37-42`).
- Fields, all regex-parsed (`parse.py:27-90`): pdf_url, respondent_name, county, case_number, all_case_numbers, violation_type, industry and response_deadline. pdf_summary comes from the LLM.
- Geography: the scrape keeps 7 counties (`parse.py:4`). The pack keeps Lee and Collier only (`news-swfl.mts:94`).
- Live:
  ```
  select count(*), max(last_seen_at), max(scraped_at), min(response_deadline), max(response_deadline), count(*) filter (where pdf_summary is null) from public.dbpr_public_notices;
  select county, count(*) from public.dbpr_public_notices group by 1;
  ```
  Result: 14, 2026-07-27T12:49Z, 2026-07-20T12:09Z, 2026-06-01, 2026-08-10, 0. By county: Lee 5, Sarasota 5, Manatee 3, Collier 1.
- Counties: Lee 5 and Collier 1 are coverage. Hendry has 0 rows. The Sarasota and Manatee rows are out of scope, not coverage.
- Source still publishes: yes. The 09/26 crawl shows 55 notice PDFs statewide, 3 of them Lee (P1).

dbpr_sirs_submissions
- Source: the two DBPR SIRS Qlik apps, pulled over the QIX websocket (`ingest/pipelines/dbpr_sirs/pipeline.py:40-53`, `qix.py`).
- Fields: database_period, project_type, project_name, association_name, city, zip, county, dbpr_id and result_truncated.
- Geography: a statewide pull, filtered to LEE and COLLIER (`pipeline.py:35`).
- Live:
  ```
  select count(*), max(scraped_at), min(scraped_at) from data_lake.dbpr_sirs_submissions;
  select database_period, county_normalized, count(*) from data_lake.dbpr_sirs_submissions group by 1,2;
  ```
  Result: 1366, 2026-08-06T20:15:09Z, 2026-06-08T12:00:01Z. By period and county: july_2025_plus COLLIER 404, july_2025_plus LEE 260, pre_july_2025 COLLIER 354, pre_july_2025 LEE 348.
- Counties: Lee and Collier. Hendry has 0 rows (filtered at `pipeline.py:35`).
- Source still publishes: yes. The July-2025-plus app grew from 4,181 engine rows (run 31127278359, 08/06) to 4,267 (run 35493240512, 09/20).

fl_dbpr_licenses
- Source: DBPR bulk extract CSVs for board 06 (Construction) and board 08 (Electrical). Lee (county code 46) and Collier (21) are filtered at ingest.
- Fields: 12 columns (`ingest/pipelines/fl_dbpr_licenses/resources.py:70-83`). No address columns.
- Live:
  ```
  select count(*), max(_ingested_at), min(original_licensure_date), max(original_licensure_date) from data_lake.fl_dbpr_licenses;
  select county, board_number, count(*) from data_lake.fl_dbpr_licenses group by 1,2;
  ```
  Result: 12795, 2026-09-20T04:36:47Z, 1972-10-04, 2026-09-18. By county and board: Collier 06 3858, Collier 08 428, Lee 06 7699, Lee 08 810.
- Counties: Lee and Collier. Hendry has 0 rows (not in the county filter).
- Source still publishes: yes. max(original_licensure_date) is 2026-09-18, two days before the 09/20 load.

fl_dbpr_applicants
- Source: `constr_app.csv` (15 columns), Lee and Collier. It lands in the same run as licenses.
- Fields: occupation_code, first/last name, city/state/zip, county_code, county, phone (`resources.py:85-99`).
- Live:
  ```
  select count(*), max(_ingested_at) from data_lake.fl_dbpr_applicants;
  select county, count(*) from data_lake.fl_dbpr_applicants group by 1;
  ```
  Result: 8855, 2026-09-20T04:36:51Z. By county: Collier 2737, Lee 6118. This matches the run log of 35489537652: "Applicants: dlt replace complete — 8855 rows".
- Counties: Lee and Collier. Hendry has 0 rows.
- Source still publishes: yes. The file row count moved across the three latest runs: 104,020 on 08/05, 104,354 on 09/05, 104,549 on 09/20 (run logs 31003259921, 33968117027, 35489537652).

dbpr_re_licensees
- Source: `RE_rgn7.csv`, weekly (`ingest/pipelines/dbpr_re_licensees/pipeline.py:3`).
- The 09/21 run log (35632280304) reads "51961 total rows in extract" and "kept 30407 Lee/Collier individual rows (Lee 18197 / Collier 12210)".
- Live:
  ```
  select count(*), max(last_seen_at), min(first_seen_at), max(as_of_date), max(original_license_date), count(*) filter (where email is not null) from public.dbpr_re_licensees;
  select county_name, count(*) from public.dbpr_re_licensees group by 1;
  select count(*) from public.new_re_agents;
  ```
  Result: 30545, 2026-09-21T17:30:03Z, 2026-07-13T14:10:11Z, 2026-09-21, 2026-09-21, 0. By county: Collier 12255, Lee 18290. View: 357.
- Counties: Lee and Collier. Hendry has 0 rows (only Lee and Collier are kept, `constants.py:16`).
- Source still publishes: yes. max(original_license_date) is 2026-09-21, the day of the last run.

## 3. What is working

Run counts come from `gh run list --workflow <file> --limit 15 --json databaseId,status,conclusion,createdAt,event`.

dbpr_press_releases
- 15 runs: 14 success, 1 skipped (30812529442, 08/03).
- Newest green: 35618957635 (09/21). Its log shows "parsed 13 unique articles from 2 pages", "upserted 13 rows" and "0 un-enriched rows".
- The 08/19/2026 release is in the table and enriched.
- Newest red: none in the last 15 runs.
- Tests: 0 in the pipeline dir. The consumer pack tests pass (below).

dbpr_public_notices
- 15 runs: 13 success, 1 skipped (30815035542, 08/03), 1 failure (27557476514, 06/15, before the 07/05 re-enable).
- The fetch path works from GHA. Run 30267388098 (07/27) found 4 SWFL notices and upserted 4.
- Newest red: 27557476514 (06/15). Its cause was not re-derived this session. The blind greens since 08/10 are the real defect (P1).
- Tests: 23 parser tests pass (`ingest/.venv/Scripts/python.exe -m pytest -q ingest/pipelines/dbpr_public_notices/test_parse.py`). They pass only against the old markup (P1).

dbpr_sirs_submissions
- 13 runs exist in total: 10 success, 2 failure (26742451014 on 06/01, 27548968643 on 06/15), 1 cancelled (33506639728 on 09/01).
- The QIX pull works from the Fedora box. Dry run 35493240512 (09/20) logged "pre_july_2025: 6086 engine rows (6086 reported) … 710 SWFL", "july_2025_plus: 4267 engine rows (4267 reported) … 679 SWFL" and "would upsert 1389 rows".
- Last real write: 31127278359 (08/06), "upserted 1413 rows".
- Newest red: 33506639728 (09/01), cancelled after 24 hours in queue. It opened check `cron_incident_dbpr_sirs_monthly` through log-cron-incident run 33628879010 (09/02), log line "opened/reopened check cron_incident_dbpr_sirs_monthly". Before that, 27548968643 (06/15): the retired Firecrawl scraper got HTTP 402 on both apps, before the QIX rewrite.
- Tests: 6 pass (`ingest/pipelines/dbpr_sirs/test_pipeline.py`).

fl_dbpr_licenses and fl_dbpr_applicants
- 10 runs exist: 7 success, 3 failure (26737829191 on 06/01, 31003259921 on 08/05, 33968117027 on 09/05).
- Repaired 09/20 by `docs/sql/20260920_dbpr_staging_repair.sql`. Proven by dispatch run 35489537652: "11665 license rows, 8855 applicant rows".
- Newest red: 33968117027 (09/05). Issue #172, opened for the identical 08/05 failure, carries the classifier label `SCHEMA_DRIFT`. Log line from both runs: `relation "data_lake_staging.fl_dbpr_applicants" does not exist`.
- Tests: 10 pass (`ingest/tests/pipelines/fl_dbpr_licenses/test_resources.py`).
- The in-pipeline applicant volume guard exists (`resources.py:233`, floors at `:64-66`).

dbpr_re_licensees
- 12 runs exist: 9 success, 1 skipped (30822020923), 2 cancelled (29747928723 on 07/20, 30273914780 on 07/27).
- 8 straight scheduled greens, 08/10 through 09/21.
- Newest red: 30273914780 (07/27), cancelled at the old 15-minute timeout. The workflow comment calls it TIMEOUT_KILL with 0 rows landed (`ingest-dbpr-re-licensees.yml:23-27`).
- The volume guards live in the pipeline (`pipeline.py:135-141`).
- Tests: 23 pass (21 in `test_parse.py`, 2 in `test_dry_run.py`).

All pipeline tests in one command, 62 passed:
```
ingest/.venv/Scripts/python.exe -m pytest -q ingest/pipelines/dbpr_public_notices/test_parse.py ingest/pipelines/dbpr_re_licensees/ ingest/pipelines/dbpr_sirs/test_pipeline.py ingest/tests/pipelines/fl_dbpr_licenses/test_resources.py -p no:cacheprovider
```

Consumer packs, 23 passed:
```
bun test refinery/packs/news-swfl.test.mts refinery/packs/licenses-swfl.test.mts refinery/packs/condo-sirs-swfl.test.mts
```

Freshness probe, 09/26 (`python -m ingest.scripts.check_freshness --dry-run --sla-dry-run`): dbpr_public_notices is the only family row alerting, "2026-07-27 | 61 | 7d | 21d | STALE". The other five read FRESH. The doctor lines in run 36259690113 agree: notices yellow, five green.

Security: `public.dbpr_re_licensees` has RLS on, no policies, and no anon/authenticated grants. `new_re_agents` has no anon/authenticated grants. Checked 09/26 via `pg_class.relrowsecurity`, `information_schema.role_table_grants` and `pg_policies`. Clean.

## 4. Problems

P1. The notices parser is blind to the live page. Every weekly run since 08/10 finds 0 SWFL notices.
- Symptom: "[dbpr-notices] found 0 SWFL notices on index page" in runs 31381200763 (08/10), 32019591499, 32716707623, 33418612423, 34137841627, 34865931041 and 35623040755 (09/21). Run 30267388098 (07/27) found 4.
- The live page: a crawl4ai 0.9.0 crawl on 09/26 shows "**Lee County✓**" followed by three Lee PDFs: Lee-2026017261, Lee-2026024255 and Lee-2026025655.
- The parser on that page: the pipeline's own `parse_index_markdown` returns 0. Prefixing the bold county lines with `##### ` makes it return 4 (Lee, Lee, Lee, Manatee).
- The table:
  ```
  select pdf_url from public.dbpr_public_notices where pdf_url ilike '%Lee-2026017261%' or pdf_url ilike '%Lee-2026024255%' or pdf_url ilike '%Lee-2026025655%';
  ```
  Result: [] (none of the three).
- Root cause: `ingest/pipelines/dbpr_public_notices/parse.py:104-105`. The county-header regex requires a leading markdown heading (`^#+\s+`). The live page renders county names as bold or plain lines with no heading. The test fixture still uses `##### Lee County` (`test_parse.py:78`), so the suite stays green.
- Header-based assignment is fragile even with a looser regex. I tested `^\s*(?:#+\s+)?\*{0,2}([A-Za-z .'-]+?)\s*(?:County|COUNTY)\s*[✓✔]?\*{0,2}\s*$` against the saved crawl:
  - It matched 64 headers and 4 SWFL notices.
  - It mis-assigned 9 non-SWFL PDFs. "**Miami Dade✓**" has no "County" word, so 5 Miami-Dade PDFs landed under Martin. "**Out of State✓**" sent 4 PDFs to Washington.
  - The PDF filename carries the county instead. Every one of the 55 URLs has the shape `/public-notices/<County>-<case>.pdf`, and by prefix 4 are SWFL (Lee 3, Manatee 1).
- Origin: the local crawl4ai matches the pin (0.9.0, pinned 06/22 per `git log -S` on `ingest/requirements.txt`, commit 8274bf8a). [INFERENCE] So DBPR's HTML changed, not our tooling, sometime between 07/27 and 08/10.
- The run stays green because `pipeline.py:95-97` exits 0 on "no SWFL notices this week".
- Severity: blocks a served number. news-swfl dbpr_notices_lee_90d and its siblings read an old table: 5 Lee rows, all with deadlines on or before 08/10. The live Lee notices are absent.
- First seen: 08/10/2026 (run 31381200763).

P2. Served active contractor-license counts include rows no longer in DBPR's extract, and the lapse rate cannot see lapses.
- Symptom:
  ```
  select county_code, (_ingested_at >= '2026-09-20') in_latest, count(*) from data_lake.fl_dbpr_licenses where primary_status='C' and secondary_status='A' group by 1,2;
  ```
  Result: 21 false 314, 21 true 3091, 46 false 646, 46 true 5974. The served brain says "Active: Lee 6,620, Collier 3,405" (`brains/licenses-swfl.md:38`, 09/20). That is 5,974 + 646 and 3,091 + 314, exactly.
- The latest load `1789879007.172162` holds 11,569 rows. 1,226 rows sit on older load ids (`select _dlt_load_id, count(*) from data_lake.fl_dbpr_licenses group by 1`).
- Why they left the file:
  ```
  select expiration_date, count(*) from data_lake.fl_dbpr_licenses where _dlt_load_id <> (select max(_dlt_load_id) from data_lake.fl_dbpr_licenses) group by 1 order by 2 desc;
  ```
  Result: 2026-08-31 1173, 2028-08-31 46, null 3, 2024-08-31 2, 2027-08-31 2. In the latest load, 9,602 rows carry 2028-08-31.
  - So 1,173 licenses hit the 08/31/2026 expiry and dropped out of DBPR's file. The renewed ones moved to 2028-08-31. Removal by DBPR is proven by the missing rows. [INFERENCE] The mechanism is the biennial renewal deadline.
  - Board 06 file rows fell from 270,168 (run 31003259921, 08/05) to 260,247 (run 35489537652, 09/20).
- Root cause: `resources.py:167-168` is `write_disposition="merge"` on license_number with no delete. The consumer counts every row (`refinery/sources/fl-dbpr-licenses-source.mts:85-96`). The served lapse rate is non-"C" rows over all rows (counts at `fl-dbpr-licenses-source.mts:108-119`, ratio at `refinery/packs/licenses-swfl.mts:53`), so a license that disappears instead of flipping status is never counted as lapsed. The lapse rate stays at 0.5% through a 1,173-license expiry wave. `brains/licenses-swfl.md:27` calls that rate "the headline signal".
- Severity: blocks a served number. licenses_active_lee is overstated by 646 and licenses_active_collier by 314. licenses_lapse_rate_swfl misses the 08/31 lapse wave.
- First seen: 08/05/2026. That load (1785930850.0594614) still owns 1,098 rows.

P3. Applicants freshness read green through two red months.
- Symptom: runs 31003259921 (08/05) and 33968117027 (09/05) died with `relation "data_lake_staging.fl_dbpr_applicants" does not exist`. Applicants stayed on 07/05 data until 09/20 (`docs/sql/20260920_dbpr_staging_repair.sql`: "Last successful applicants load was 07/05/2026").
- Meanwhile `data_lake._dlt_loads` has status-0 rows for schema `fl_dbpr_licenses` on 08/05 and 09/05, the licenses half of the same failed runs:
  ```
  select load_id, status, inserted_at from data_lake._dlt_loads where schema_name='fl_dbpr_licenses' and inserted_at >= '2026-07-01';
  ```
- Root cause:
  - `cadence_registry.yaml:1564` gives applicants `dlt_schema_name: fl_dbpr_licenses`.
  - `ingest/scripts/check_freshness.py:273-279` reads `MAX(inserted_at) FROM _dlt_loads WHERE schema_name = …`, so the licenses load stands in for applicants.
  - The volume floor (7,800) also passed, because the replace never ran and the old 8,769 rows stayed.
- Severity: blocks a consumer from knowing it reads stale data.
- First seen: 08/05/2026. The staging defect is fixed; the detection hole is not.

P4. The press-release LLM leg can silently undercount served numbers.
- `ingest/pipelines/dbpr_press_releases/enricher.py:164-165` catches each row's exception, prints "WARNING: enrichment failed", and the run stays green.
- The row keeps geographic_mentions NULL. The pack maps it to no county (`news-swfl.mts:130-139`), so dbpr_swfl_releases_90d drops it until a later run succeeds.
- Severity: blocks a served number, latent. Today 0 of 152 rows are un-enriched.
- First seen: not yet fired.

P5. SIRS continues past a failed app.
- `ingest/pipelines/dbpr_sirs/pipeline.py:146-150` catches a failed QIX pull for one app and continues. The other app upserts, scraped_at bumps, and the run is green with half the data.
- Severity: blocks a served number, latent. condo-sirs-swfl counts by period (`refinery/sources/dbpr-sirs-source.mts:69-72`).
- First seen: not fired. Both apps logged a pull in the 08/06 run (31127278359) and the 09/20 run (35493240512).

P6. SIRS has not written since 08/06/2026.
- The 09/01 scheduled run 33506639728 was cancelled after 24 hours in queue. The job started 2026-09-01T12:14:56Z and completed 2026-09-02T12:14:56Z (`gh run view 33506639728 --json jobs`). The Fedora runner did not go live until 09/20.
- The check that run opened (`cron_incident_dbpr_sirs_monthly`, above) is not in the 21 open checks on 09/26 (`node scripts/check.mjs list`).
- The 09/20 run 35493240512 was a dry run ("dry_run=True"). The brief lists it as proven. It proves the pull, not a write.
- Next scheduled run: cron `0 7 1 * *` (`dbpr-sirs-monthly.yml:6`), 10/01 07:00 UTC.
- The freshness threshold is 30 × 2.0 = 60 days from 08/06, so 10/05. Not stale yet.
- Severity: the consumer reads 08/06 data. condo-sirs-swfl was last rebuilt 09/15 (commit 9f0bd151).
- First seen: 09/01/2026.

P7. Merge-without-delete, the same shape as P2, in two more places.
- SIRS: the upsert at `pipeline.py:116-135` never deletes. The pre-July app fell from 6,284 engine rows (run 31127278359) to 6,086 (run 35493240512). Whether removed SWFL rows sit in the table can only be measured after a real write. could-not-verify.
- RE licensees: 138 rows are not in the latest run.
  ```
  select (last_seen_at >= '2026-09-21') in_latest, primary_status, count(*) from public.dbpr_re_licensees group by 1,2;
  ```
  Result: false Current 130, false Invol Inactive 8. No served reader, so cosmetic.

P8. RE licensees runtime is close to its ceiling.
- Job durations from `gh run view <id> --json jobs`:
  - 34873803101 (09/14): 36m40s.
  - 35632280304 (09/21): 26m04s.
  - 32727328681 (08/24): 35m14s.
- The timeout is 45 minutes (`ingest-dbpr-re-licensees.yml:28`).
- The upsert is one `cur.execute` per row over about 30k rows (`pipeline.py:149-153`). The download/upsert split is NOT measured: stdout is buffered, and every line prints at 17:55:01 in 35632280304.
- Severity: would block the table if a run crosses 45 minutes. No served reader today.
- First seen: 07/20/2026 (the 15-minute kills).

P9. Registry, doc and code claims that are wrong. X verified, Y needs review.
- Press releases: the registry note says "the SOURCE went quiet: newest DBPR release is dated 02/07/2025" (`cadence_registry.yaml:1460`, `:1466`; `docs/standards/data-roots.md:1917`, `:1919`). The live page shows "August 19, 2026", and table max(published_date) is 2026-08-19. The source is alive. This is a live instance of open check `registry_source_ceiling_no_freshness_field` (`node scripts/check.mjs list`): the ceiling records no newest-record date, so nobody re-read it.
- Notices model: the registry note (`:1601`) and `data-roots.md:1929` say the summary moved to Haiku. But `summarize.py:8` defaults to `claude-sonnet-4-6`, and `pipeline.py:112` passes no model. Commit 1a29bd7d (07/05) switched the DBPR distill to Sonnet by operator decree, so the registry text, the doc text and the stale comment at `summarize.py:6-7` are all wrong.
- SIRS schedule: the registry comment says "first Monday of month" (`:1518`). The workflow cron is `0 7 1 * *`, the 1st of the month.
- SIRS truncation: the registry comment says "result_truncated=true on all rows is expected" (`:1516-1517`). Live: 1,365 false, 1 true (`select result_truncated, count(*) from data_lake.dbpr_sirs_submissions group by 1`).
- RE first run: the registry reads "First run: <fill in after Task 7's live run>" (`:1627`). min(first_seen_at) is 2026-07-13T14:10:11Z.
- `dbpr-sirs-monthly.yml:24-31` still describes the retired Windows venv.
- `wiki/pipeline-census.md:126` cites dbpr_re_licensees at `:1558`. The entry now starts at `:1612`.
- Master: the brief says master last rebuilt 08/19. The committed `brains/master.md` is v140, dated 08/14 (commit 667ddc9e). Either way it predates every fix here.
- Severity: cosmetic, but the press-release claim hid a live source.

P10. Stale incident noise.
- Open issues #98, #99, #100 and #101 are four `[cron-failure:dbpr-sirs-monthly]` issues dated 06/22. Each is marked RESOLVED (lines 24-26) or FLAKE (lines 27-28) in `docs/cron-rebuild-failures.md`.
- #172 is `[cron-failure:ingest-fl-dbpr-licenses] SCHEMA_DRIFT`. It was fixed 09/20.
- Auto-close fires only on a SCHEDULED green (`.github/scripts/log-cron-incident.mjs:131`), and it closes one issue per green (`:283-293`, `--limit 1`). So the 10/01 SIRS green closes one of the four, and the 10/05 licenses green closes #172.
- Severity: cosmetic.

## 5. What is missing

- dbpr_press_releases: nothing more is available from the source (`cadence_registry.yaml:1466`, re-read live 09/26). What is missing is a deterministic classifier (P4).
- dbpr_public_notices:
  - County assignment from the PDF filename, plus a guard that the page parsed at all (P1).
  - Discrete penalty or statute fields: still unconfirmed (`:1607`). No PDF was parsed this session. could-not-verify.
  - pdf_summary is read by the source (`dbpr-public-notices-source.mts:88`, `:110`) but used by no pack: `rg -n pdf_summary refinery/packs/news-swfl.mts` hits nothing. It is carried for nothing.
- dbpr_sirs_submissions:
  - The source ceiling is reached (`:1527`).
  - The filer universe is missing. The pack's own caveat says absence means nothing without a registry of SWFL 3-story-plus condos (`brains/condo-sirs-swfl.md` scope line). That is a data-roots gap, not a pull here.
- fl_dbpr_licenses:
  - 2 of 35 boards are pulled (`:1556`). The Community Association Managers board is the named complement to SIRS.
  - Street address columns 5-10 of `CONSTRUCTIONLICENSE_1.csv` are dropped (`resources.py:70-83` has none), so there is no ZIP grain.
  - There is no "in current extract" read, which causes P2. There is also no lapse measure that counts licenses leaving the file.
- fl_dbpr_applicants:
  - Six unused columns in `constr_app.csv`, including Address 1/2/3 and Occupation Description (`:1579`).
  - Its own freshness column (P3).
- dbpr_re_licensees:
  - A consumer.
  - Email, which is not in the source. Only a Chapter 119 records request can supply it (`:1634`).
- Hendry (12051): every table in this family has 0 Hendry rows. Whether DBPR carries Hendry license rows that we filter out: could-not-verify this session.

## 6. Verdict per pipeline

- dbpr_press_releases: IMPROVE.
  - Reason: the ingest is healthy, but served county matching depends on an unattended LLM leg that fails silently (P4), and the registry calls the source dead (P9).
  - The number that changes it: rows with `summary IS NULL AND body_text IS NOT NULL` older than 7 days. 0 today. 1 or more makes it REPAIR.
- dbpr_public_notices: REPAIR.
  - Reason: the parser returns 0 on a live page that holds 3 Lee notices (P1).
  - The number that changes it: SWFL notices the pipeline returns on the live page versus SWFL PDFs by filename prefix. 0 versus 4 on 09/26. Equal makes it GOOD ENOUGH.
- dbpr_sirs_submissions: IMPROVE.
  - Reason: the right box and a working pull, but no write since 08/06, and a one-app failure is swallowed (P5, P6).
  - The number that changes it: max(scraped_at) after the 10/01/2026 07:00 UTC run. On or after 10/01, plus P5 fixed, makes it GOOD ENOUGH. Still 2026-08-06 makes it REPAIR.
- fl_dbpr_licenses: REPAIR.
  - Reason: 960 stale "Current/Active" rows are in the served active counts, and the lapse rate is blind to 1,173 licenses that expired 08/31 (P2).
  - The number that changes it: rows the consumer counts that are not in the latest load. 960 today. 0 makes it GOOD ENOUGH for the active counts.
- fl_dbpr_applicants: IMPROVE.
  - Reason: the data is right today (8,855, equal to the run log), but its freshness reads another table's load (P3).
  - The number that changes it: the probe's last_run for fl_dbpr_applicants read from `data_lake.fl_dbpr_applicants._ingested_at` rather than from `_dlt_loads`.
- dbpr_re_licensees: IMPROVE.
  - Reason: it lands cleanly every week into a table nothing reads, at 81% of its timeout (36m40s of 45m on 09/14).
  - The number that changes it: job duration. 45 minutes or more makes it REPAIR. Under 15 minutes after batching makes it GOOD ENOUGH as ingest. Keeping the dark root is a question for the operator (section 12).

## 7. The plan

Ordered. No item files an issue or dispatches a workflow. Each item is a code or registry change that then waits for the next scheduled run. A served number moves only after a leaf rebuild. The last committed rebuilds are news-swfl 09/15 (9f0bd151), condo-sirs-swfl 09/15 (9f0bd151) and licenses-swfl 09/20 (525da974). Master is older than all of them (P9).

1. DO. Take the notice county from the PDF filename, and guard that the page parsed.
   - What:
     - In `parse_index_markdown` (`parse.py:93-124`), collect every PDF link on the page. Take the county from the filename prefix (`/public-notices/<County>-<case>.pdf`, up to the first `-` followed by digits) instead of from the heading above it. Keep SWFL filtering on that prefix.
     - In `pipeline.py`, before line 95, exit 1 when the page yields 0 PDF links statewide. There were 55 on 09/26. [INFERENCE] An empty statewide index is implausible, so zero means the page shape changed.
     - Add a fixture from the 09/26 live shape to `test_parse.py`, covering `**Lee County✓**`, `**Miami Dade✓**` and `**Out of State✓**`. The failing tests are named `test_county_from_pdf_prefix_not_heading` and `test_zero_pdf_links_is_a_shape_break`.
   - Where: `ingest/pipelines/dbpr_public_notices/parse.py`, `pipeline.py`, `test_parse.py`.
   - Lane D, effort S.
   - Proof:
     - `ingest/.venv/Scripts/python.exe -m pytest -q ingest/pipelines/dbpr_public_notices/test_parse.py`.
     - The next Monday log reads "found N SWFL notices" with N ≥ 1 while Lee has notices.
     - This query returns 1:
       ```
       select count(*) from public.dbpr_public_notices where pdf_url ilike '%Lee-2026025655%'
       ```
   - Unblocks: news-swfl dbpr_notices_* metrics, once `pack_id=news-swfl` rebuilds.
2. DO. Delete the notices summary leg.
   - What:
     - Remove the `summarize_notice` call (`pipeline.py:112`) and delete `summarize.py`.
     - Keep the column. From now on rows write NULL, and the upsert COALESCE (`pipeline.py:74`) keeps the 14 existing summaries.
     - Drop `ANTHROPIC_API_KEY` from `dbpr-public-notices-weekly.yml:43`.
   - Lane D, effort S.
   - Proof: `rg -n -i "anthropic" ingest/pipelines/dbpr_public_notices .github/workflows/dbpr-public-notices-weekly.yml` returns nothing.
   - Unblocks: the notices job needs no model and no model secret.
3. DO. Replace the press-release Sonnet enrichment with deterministic classification.
   - What:
     - `refinery/sources/dbpr-press-releases-source.mts:99-104` also selects title and body_text.
     - The pack runs `coreCountyForMentions` (`news-swfl.mts:119-128`) over [title, body_text] instead of the LLM's geographic_mentions.
     - topics and affected_industries come from a keyword map over the same fixed 10-tag list the LLM uses (`enricher.py:42-44`).
     - Then delete `enricher.py`, the auto-enrich call (`pipeline.py:209-211`) and `ANTHROPIC_API_KEY` (`dbpr-press-releases-weekly.yml:51`).
   - Gate before deleting: a one-off read-only comparison on all 146 dated rows (152 minus 6 undated). The deterministic county must match the county the pack derives from the stored LLM geographic_mentions. Report the disagreement count in the PR.
   - Where: the source and pack files above, and `ingest/pipelines/dbpr_press_releases/`.
   - Lane D, effort M.
   - Proof:
     - `bun test refinery/packs/news-swfl.test.mts` passes, including a new test named for the failure mode, `release_with_null_mentions_still_counted`.
     - `rg -n -i anthropic ingest/pipelines/dbpr_press_releases` returns nothing.
   - Fallback, only if the comparison disagrees on a row inside the 90-day served window: keep an unattended classifier on Lane M (`claude -p` on the Fedora runner, `CLAUDE_CODE_OAUTH_TOKEN`). That moves the enrich step to `runs-on: [self-hosted, swfl-local]`.
   - Unblocks: closes P4 and removes the last model dependency in the family. It reaches served numbers on the next `pack_id=news-swfl` rebuild.
4. DO. Count only the current extract for active licenses.
   - What: in `refinery/sources/fl-dbpr-licenses-source.mts:83-126`, filter every active, new-license and CBC count to the latest `_dlt_load_id` of the licenses table. Read it once with `select max(_dlt_load_id)`.
   - Metric names stay the same. On today's data, the values drop by 646 (Lee) and 314 (Collier).
   - Lane D, effort S.
   - Proof:
     - `bun test refinery/packs/licenses-swfl.test.mts` passes, with a fixture test named `license_absent_from_latest_extract_not_counted_active`.
     - A `pack_id=licenses-swfl` rebuild (operator dispatch or the next daily rebuild) shows Lee 5,974 and Collier 3,091 against the 09/20 load.
   - Unblocks: correct licenses_active_lee and licenses_active_collier. It does NOT fix the lapse rate; see item 14.
5. DO. Give applicants its own freshness and a real floor.
   - What:
     - Add `freshness_table: data_lake.fl_dbpr_applicants` and `freshness_column: _ingested_at` to the entry at `cadence_registry.yaml:1558`. `check_freshness.py:253` resolves freshness_table before dlt_schema_name.
     - Replace the PLACEHOLDER `expected_rows_min: 7800` with 7969, which is 90% of the live 8,855.
   - Lane D, effort S.
   - Proof:
     - `python -m ingest.scripts.check_freshness --dry-run --sla-dry-run` reads fl_dbpr_applicants last_run 2026-09-20 from its own table.
     - `pytest -q ingest/tests/scripts/test_check_freshness.py` stays green.
   - Unblocks: a failed applicants replace shows as STALE within 60 days instead of never. It also arms the item 10 contract's floor.
6. DO. Make SIRS fail loud on a half pull.
   - What: in `ingest/pipelines/dbpr_sirs/pipeline.py:146-150`, record the failed period, upsert the good app's rows, then `sys.exit(1)` if any app failed. Add `test_one_app_failure_exits_nonzero`, with `fetch_app_matrix` mocked to raise for one app.
   - Lane D, effort S.
   - Proof: `pytest -q ingest/pipelines/dbpr_sirs/test_pipeline.py`.
   - Unblocks: a half pull opens `cron_incident_dbpr_sirs_monthly` instead of passing green.
7. DO. Watch the 10/01 SIRS run, then measure P7 on SIRS.
   - What: after the 10/01 07:00 UTC scheduled run on fedora-swfl-local, run:
     ```
     gh run list --workflow dbpr-sirs-monthly.yml --limit 1
     ```
     ```
     select count(*) filter (where scraped_at::date < '2026-10-01') from data_lake.dbpr_sirs_submissions
     ```
     The second count is the rows the source no longer lists. If it is above 0, apply the item 4 latest-scrape filter in `refinery/sources/dbpr-sirs-source.mts:61-72`.
   - Lane D, effort S.
   - Proof: max(scraped_at) ≥ 2026-10-01.
   - Unblocks: fresh condo-sirs-swfl counts, and a proven first real write from the Fedora box.
8. DO. Batch the RE licensees upsert and time it.
   - What: replace the per-row loop (`ingest/pipelines/dbpr_re_licensees/pipeline.py:149-153`) with `cur.executemany(UPSERT_SQL, rows)`, which psycopg 3 pipelines. Print UTC timestamps with `flush=True` before and after the download and the upsert.
   - Lane D, effort S.
   - Proof: the next Monday run's job duration (`gh run view <id> --json jobs --jq '.jobs[]|.startedAt,.completedAt'`) is under 15 minutes, and the log shows the split.
   - Unblocks: headroom under the 45-minute ceiling, and a measured answer to where the time goes.
9. DO. Correct the claims in P9.
   - Where:
     - `cadence_registry.yaml`: the press note `:1460` and ceiling `:1466`, the notices note `:1601`, SIRS `:1516-1518`, RE `:1627`.
     - `docs/standards/data-roots.md:1917`, `:1919`, `:1929`.
     - The `dbpr-sirs-monthly.yml:24-31` comment.
     - `wiki/pipeline-census.md:126`.
     - Add an `as_of` newest-record date to the press-release source_ceiling. That is the fix shape `registry_source_ceiling_no_freshness_field` asks for.
   - Lane D, effort S.
   - Proof:
     - `rg -n "02/07/2025|Haiku" ingest/cadence_registry.yaml docs/standards/data-roots.md` has no DBPR hits.
     - `bun ingest/tools/check-registry-identity.mts --static` exits 0.
   - Unblocks: nobody plans on a dead press-release source again. It is one instance toward closing `registry_source_ceiling_no_freshness_field`.
10. DO. Add the three content contracts in section 8: press releases, licenses, applicants.
    - Where: `ingest/quality/quality_registry.yaml`.
    - Lane D, effort S.
    - Proof: `python -m ingest.scripts.check_data_quality --dry-run` lists the three with status PASS on today's data.
    - Ordering: none of the three fires on landing today. There are 0 un-enriched press rows. Licenses' latest load is Lee 7,681 ≥ 6,144 and Collier 3,888 ≥ 3,110, at age 6 days. Applicants are 8,855 ≥ 7,969, at age 6 days.
    - Unblocks: one auto-closing check per table when a served number would go wrong or stale.
11. DO. Close stale issues #98, #99 and #100 with a comment pointing at `docs/cron-rebuild-failures.md:24-28`. Leave #101 and #172 to auto-close on the 10/01 and 10/05 scheduled greens.
    - Lane D, effort S.
    - Proof: `gh issue list --state open --search "dbpr in:title" --json number` shows only #101 and #172 until those greens land.
    - Unblocks: the open-issue list for this family shows only live incidents.
12. ASK-FIRST. Pull the dropped address columns into license and applicant data. This changes data_lake write shape: new columns on `data_lake.fl_dbpr_licenses` and `data_lake.fl_dbpr_applicants`.
    - What: add `CONSTRUCTIONLICENSE_1.csv` columns 5-10 and `constr_app.csv` Address 1/2/3 to the dlt column maps (`resources.py:70-99`).
    - Lane D, effort M.
    - Proof: `select count(*) filter (where zip is not null) from data_lake.fl_dbpr_licenses` returns a count above 0.
    - Unblocks: ZIP-grain license counts.
13. ASK-FIRST. Add the Community Association Managers board as a third license board. This is new data_lake scope.
    - Lane D, effort M.
    - Proof: `select board_number, count(*) from data_lake.fl_dbpr_licenses group by 1` shows the new board.
    - Unblocks: pairing managers with SIRS filers.
14. ASK-FIRST. Redefine licenses_lapse_rate_swfl. This is a key_metric change.
    - What: define lapsed as "present in the previous load, absent from the latest". Compute it in `fl-dbpr-licenses-source.mts` from the two newest `_dlt_load_id` values. It needs no new data. The 1,173 rows with expiry 2026-08-31 are the first wave it would show.
    - Lane D, effort S.
    - Proof: a licenses-swfl test named `license_leaving_extract_counts_as_lapsed`, then a rebuild whose lapse rate reflects the 08/31 wave.
    - Unblocks: the "headline signal" measures real lapses.

Count: 11 DO, 3 ASK-FIRST.

## 8. Checks and balances

Design rule: ONE signal per pipeline, on existing seams only. It fires only when a served number would be wrong or stale, auto-closes when green, and never files a GitHub issue per run.

The workhorse seam is the content contract in `ingest/quality/quality_registry.yaml`: type `sql_expectation`, `locus: probe`, `severity: error`.
- `check_data_quality.sync_quality_checks` (`ingest/scripts/check_data_quality.py:339-369`) opens one `contract_fail_<table>_<name>` row in public.checks under project data-quality. It auto-closes the row when the SQL returns no rows.
- `freshness-probe-daily.yml:52-56` runs it daily.
- Contracts split `schema.table` generically (`ingest/quality/contracts.py:348`, `check_data_quality.py:86`, `:256`), so public.* tables work mechanically.
- No public.* key exists in that registry yet (`grep -n "^  public\." ingest/quality/quality_registry.yaml` returns nothing). The press-release contract would be the first.

The one signal per pipeline:
- dbpr_press_releases: contract `dbpr_press_releases_served_window` on public.dbpr_press_releases. The SQL returns a row when either condition holds:
  - max(scraped_at) is older than 21 days (cadence 7 × tolerance 3, `cadence_registry.yaml:1445-1446`);
  - a row the served window depends on is unusable. Until item 3 lands, that means `summary IS NULL AND body_text IS NOT NULL` and scraped more than 7 days ago. That is the enricher's own "un-enriched" test (`enricher.py:126-132`), past the one retry a weekly run gets. After item 3 it means `body_text IS NULL` on a row published in the last 90 days, because the pack classifies from body text.

  It does NOT fire on a statewide release that names no Lee or Collier place. That is a correct zero, not a defect.
- dbpr_public_notices: the in-pipeline shape guard from item 1 (0 PDF links statewide exits 1).
  - A red scheduled run goes through the existing `log-cron-incident.yml` path. That opens the dedup'd `cron_incident_dbpr_public_notices_weekly` check and closes it on the next scheduled green (`log-cron-incident.mjs:130-145`).
  - No contract: a legitimately quiet SWFL week writes no rows, so a table-age contract would false-fire.
  - Change `tolerance_multiplier` at `cadence_registry.yaml:1589` from 3.0 to 8.0. That keeps the doctor's table-age yellow off legitimately quiet stretches, now that the guard carries the real signal.
- dbpr_sirs_submissions: the scheduled-run status through the same cron-incident path, plus the item 6 exit.
  - The box-off case is covered, with evidence. The 09/01 queued-then-cancelled run 33506639728 produced log-cron-incident run 33628879010 on 09/02, which "opened/reopened check cron_incident_dbpr_sirs_monthly".
  - The existing 60-day freshness row stays. No new contract.
- fl_dbpr_licenses: contract `fl_dbpr_licenses_current_extract` on data_lake.fl_dbpr_licenses. It returns a row when either condition holds:
  - max(_ingested_at) is older than 40 days (monthly cadence plus a 10-day slip);
  - the latest load holds under 6,144 Lee rows or under 3,110 Collier rows.

  Those floors are 80% of the latest load, Lee 7,681 and Collier 3,888:
  ```
  select county, count(*) from data_lake.fl_dbpr_licenses where _dlt_load_id = (select max(_dlt_load_id) from data_lake.fl_dbpr_licenses) group by 1
  ```
  80% and not 90%, because matched rows fell 8.7% from 12,552 (run 31003259921) to 11,455 (run 33968117027) in one renewal month.
- fl_dbpr_applicants: contract `fl_dbpr_applicants_landed` on data_lake.fl_dbpr_applicants. It returns a row when max(_ingested_at) is older than 40 days or count(*) is under 7,969. During the two-month failure it would have opened on 08/14 (07/05 + 40 days), where P3 hid everything.
- dbpr_re_licensees: no new signal. The in-pipeline floors (`pipeline.py:135-141`) already turn a collapse red, and that goes through cron-incident. Nothing reads the table, so nothing more is warranted until a consumer exists.

Noise to delete:
- GitHub issues #98, #99 and #100 (item 11).
- The issue half of `log-cron-incident.mjs` (`openIncidentIssue`, `:217-281`). That is a cross-family question for family 19; the check half is the signal this plan relies on.
- Keep `known_drift` `dbpr_sirs_proxy_deliberately_unwired` (`cadence_registry.yaml:1509-1511`). It is a declaration, not an alert.

Nothing here adds a label, a per-run issue or a new workflow.

## 9. Box placement

The runner facts come from `docs/superpowers/handoffs/2026-09-20-runner-live-what-is-next.md:8-14` and the brief.

- dbpr_press_releases: stays on GHA `ubuntu-latest`.
  - Reason: the crawl4ai fetch works from a datacenter IP. 14 of 15 runs were green, and 35618957635 fetched both pages. That job ran 5m56s (15:26:36 → 15:32:32, `gh run view 35618957635 --json jobs`). No WAF, no archive, no local model.
  - If the item 3 fallback (Lane M) is ever used, the enrich step moves to the Fedora runner, because `claude -p` needs the box's Max login.
- dbpr_public_notices: stays on GHA `ubuntu-latest`.
  - Reason: the index and the PDFs fetch from GHA; 07/27 run 30267388098 upserted 4. The job ran 1m51s (35623040755). With the summary leg deleted, it needs nothing the box has.
- dbpr_sirs_submissions: stays on the Fedora runner (`runs-on: [self-hosted, swfl-local]`, `dbpr-sirs-monthly.yml:21`).
  - Reason: DBPR's Qlik host drops GitHub datacenter IPs (`dbpr-sirs-monthly.yml:17-20`), and the QIX harvest drives a real browser through Playwright (`pipeline.py:16-17`). Both are listed reasons.
  - It is already correctly placed. The first scheduled run on the box is 10/01.
- fl_dbpr_licenses and fl_dbpr_applicants: stay on GHA `ubuntu-latest`.
  - Reason: plain CSV downloads from www2.myfloridalicense.com. The job ran 1m06s (04:35:48 → 04:36:54, 35489537652).
- dbpr_re_licensees: stays on GHA `ubuntu-latest`.
  - Reason: no listed reason applies. There is no WAF (8 straight greens), and a job under 37 minutes is nowhere near 6 hours. The ceiling pressure comes from our per-row upsert (P8), and a box move does not fix that. Re-decide only if item 8 fails to bring the run under 15 minutes.
- Already on the box but should not be: nothing in this family.
- SSD archive: not needed. The table itself, keyed by `_dlt_load_id` and last_seen_at, carries the history that items 4, 7 and 14 need.

## 10. Compute lane per LLM leg

Grep proof, run 09/26:
```
rg -n -i "anthropic|claude|openai|ANTHROPIC_API_KEY|messages\.create|ollama|refinery" ingest/pipelines/dbpr_press_releases ingest/pipelines/dbpr_public_notices ingest/pipelines/dbpr_sirs ingest/pipelines/fl_dbpr_licenses ingest/pipelines/dbpr_re_licensees .github/workflows/dbpr-press-releases-weekly.yml .github/workflows/dbpr-public-notices-weekly.yml .github/workflows/dbpr-sirs-monthly.yml .github/workflows/ingest-fl-dbpr-licenses.yml .github/workflows/ingest-dbpr-re-licensees.yml refinery/sources/dbpr-press-releases-source.mts refinery/sources/dbpr-public-notices-source.mts refinery/sources/dbpr-sirs-source.mts refinery/sources/fl-dbpr-licenses-source.mts refinery/packs/news-swfl.mts refinery/packs/condo-sirs-swfl.mts refinery/packs/licenses-swfl.mts
```
```
rg -n "import anthropic|messages\.create|web_search|anthropic" ingest/lib/crawl_client.py
```

The first grep finds model calls only in `enricher.py` and `summarize.py`. The second hits only a comment at `crawl_client.py:13`, so the shared fetch path makes no model call. SIRS, licenses, applicants and RE licensees have no LLM leg.

Two legs:

1. Press-release enrichment, `ingest/pipelines/dbpr_press_releases/enricher.py:89`.
   - Call: `client.messages.create`, model `claude-sonnet-4-6` (`constants.py:57`), up to 10 rows per run (`constants.py:58`).
   - Output: summary, topics, affected_industries, geographic_mentions, is_swfl_relevant.
   - Served use: topics, affected_industries and geographic_mentions feed the pack (`news-swfl.mts:130-146`). summary and is_swfl_relevant are unused; the pack recomputes relevance (`:29-32`).
   - Current auth: repo secret ANTHROPIC_API_KEY (`dbpr-press-releases-weekly.yml:51`).
   - Evidence it last worked: all 152 rows have a summary, including the 08/19/2026 release.
   - Replacement: Lane D. The deterministic county match and keyword topics (item 3) need no model.
   - Fallback: Lane M (`claude -p` on the Fedora runner with the operator's Max login), only if the item 3 comparison gate fails. The operator's standing decision, recorded once for this family: these pipelines are internal, so the Max plan is a permitted lane for an unattended leg.
2. Notice summary, `ingest/pipelines/dbpr_public_notices/summarize.py:21`.
   - Call: `client.messages.create`, default model `claude-sonnet-4-6` (`:8`), one call per SWFL notice (`pipeline.py:112`).
   - Output: pdf_summary. No pack reads it.
   - Current auth: repo secret ANTHROPIC_API_KEY (`dbpr-public-notices-weekly.yml:43`), which `anthropic.Anthropic()` reads from the environment.
   - Replacement: none needed. Delete the leg (item 2). The structured fields are already regex-parsed (`parse.py:27-90`).

Local models (Lane L) and Codex (Lane C) have no leg here. Codex is the named second reviewer of the item 3 diff if a second vendor is wanted.

## 11. Double-check log

I re-read this file top to bottom. For each numbered claim: the claim, what verifies it, and the status.

- Registry line numbers 1441, 1496, 1532, 1558, 1584, 1612. Checked with `grep -n` and `sed -n 1435,1645p ingest/cadence_registry.yaml`. Verified.
- Registry cadence, tolerance, freshness columns and floors. Same `sed` output. Verified.
- Registry cited lines 1601, 1607, 1516-1518, 1527, 1556, 1579, 1589, 1627, 1634, 1445-1446, 1509-1511. Re-grepped for each quoted phrase. Corrected: the first draft had 1600, 1605, 1515, 1528, 1588 and 1444-1445.
- Workflow runners, crons, timeouts and secrets. `cat -n` of the five workflow files. Verified.
- Press releases: 15 runs, 14 success, 1 skipped. `gh run list`. Verified.
- Notices: 15 runs, 13 success, 1 skipped, 1 failure. `gh run list`. Verified. Recount: 7 blind greens (08/10 to 09/21) plus 6 earlier greens is 13.
- SIRS: 13 runs, 10 success, 2 failure, 1 cancelled. `gh run list` returned only 13 rows. Verified.
- Licenses: 10 runs, 7 success, 3 failure. `gh run list`. Verified.
- RE licensees: 12 runs, 9 success, 1 skipped, 2 cancelled. `gh run list`. Verified.
- Notices found 0 on 08/10, 08/17, 08/24, 08/31, 09/07, 09/14 and 09/21. `gh run view <id> --log` grepped for "found N SWFL". Verified.
- The three live Lee PDFs, and their absence from the table. The crawl file plus SQL returning []. Verified.
- Current parser returns 0 on the live markdown and 4 with prefixed headers. The `parse_index_markdown` run in `ingest/.venv`. Verified.
- Looser regex: 64 headers, 4 SWFL, 9 mis-assigned (5 Miami-Dade under Martin, 4 Out of State under Washington). Throwaway `rx.py` over the saved crawl. It printed 10 mismatches; 1 (St. Lucie) was my own prefix-normalization artifact. Verified.
- Filename prefix over 55 PDFs gives SWFL 4 (Lee 3, Manatee 1). A Python `Counter` over the URLs. Verified.
- Corrected: the first draft's notices guard floor was "60 county headers", set against `grep -c "County"`. Section 6, item 1 and section 8 now use the filename prefix and a 0-PDF-links guard.
- crawl4ai is 0.9.0 locally and pinned since 8274bf8a (06/22). The version module plus `git log -S`. Verified.
- Press table: 152 rows, max scraped 09/21, max published 2026-08-19, 0 un-enriched, 24 relevant, 6 undated. SQL. Verified. 152 − 6 = 146 dated rows for the item 3 gate. Corrected: the first draft's 180-day gate covered only 1 row.
- Newest release on the page is "August 19, 2026". Crawl file line 27. Verified.
- Notices table: 14 rows, max last_seen 07/27, county split. SQL. Verified.
- SIRS table: 1,366 rows, max scraped 08/06, period/county split, 1,365 false and 1 true truncated. SQL. Verified.
- SIRS 09/20 was a dry run with 1,389 rows, and 08/06 upserted 1,413 with pre-July at 6,284 and July-plus at 4,181. `gh run view --log`. Verified.
- SIRS box-off case opened `cron_incident_dbpr_sirs_monthly`. `gh run view 33628879010 --log`. Verified. Corrected: the first draft asserted coverage without this evidence.
- Licenses: 12,795 rows, latest load 11,569, older 1,226. SQL. Verified. 12,795 − 11,569 = 1,226.
- Status breakdown sums. 960 + 255 + 3 + 1 + 3 + 4 = 1,226. Verified.
- Active counts versus the served brain. 5,974 + 646 = 6,620 and 3,091 + 314 = 3,405, against `brains/licenses-swfl.md:38`. Verified. 646 + 314 = 960.
- Expiry of absent rows: 1,173 at 2026-08-31, and 9,602 of the latest load at 2028-08-31. SQL. Verified. The mechanism stays [INFERENCE].
- Lapse rate formula: non-C count over all rows. Read `fl-dbpr-licenses-source.mts:108-119` and `licenses-swfl.mts:53`. Verified.
- Board 06 file rows 270,168 (08/05) and 260,247 (09/20). Run logs. Verified.
- Applicants 8,855 (Lee 6,118, Collier 2,737), staging 8,855, file rows 104,020 / 104,354 / 104,549. SQL plus three run logs. Verified. 7,969 = floor(0.9 × 8,855).
- `_dlt_loads` status-0 rows for fl_dbpr_licenses on 08/05 and 09/05. SQL. Verified. The freshness resolution order is at `check_freshness.py:253-279`. Verified.
- RE: 30,545 rows, county split, 357 in the view, 0 emails, 138 not in latest, max original_license_date 2026-09-21. SQL. Verified. 130 + 8 = 138, and 30,545 − 30,407 = 138.
- RE durations 36m40s, 26m04s, 35m14s. `gh run view --json jobs`. Corrected: the first draft had 25m58s for 35632280304. 36m40s / 45m = 81%.
- Press 5m56s, notices 1m51s, licenses 1m06s. `gh run view --json jobs`. Verified.
- Tests: 23 + 2 + 21 + 6 + 10 = 62 passed, and 23 pack tests passed. pytest `--collect-only`, the runs, and `bun test`. Verified.
- Consumer chain to master (news-swfl modifier `:310`; licenses-swfl and condo-sirs-swfl input `:334-335`). `grep -n refinery/packs/master.mts`. Verified.
- Leaf rebuild commits 9f0bd151 (09/15) and 525da974 (09/20); `brains/master.md` v140 at 667ddc9e (08/14). `git log -1 -- brains/<id>.md`. Verified. The brief's 08/19 master date needs review.
- pdf_summary is unused by the pack. `rg -n pdf_summary refinery/packs/news-swfl.mts` hit nothing. Verified.
- Notices model is Sonnet in code while the registry says Haiku. `summarize.py:8` plus the subject of commit 1a29bd7d. Verified.
- Auto-close fires only on schedule and closes one issue per green. `log-cron-incident.mjs:131`, `:283-293`. Verified.
- Open issues #98 to #101 and #172. `gh issue list --state open --search "dbpr OR sirs OR licensee"`. Verified.
- Security (RLS, policies, grants). SQL. Verified.
- No open DBPR check, and `registry_source_ceiling_no_freshness_field` is open. `node scripts/check.mjs list`. Verified.
- Contract count. Corrected: the first draft said "four contracts" in item 10. Section 8 defines three, now stated.
- Press contract condition. Corrected: the first draft's "no county classification" would false-fire on every statewide release. It now uses the enricher's un-enriched test, then body_text IS NULL.
- Licenses contract floors. Corrected: the first draft had unmeasured 5,000 and 2,500. Now 6,144 and 3,110, which are 80% of the SQL latest-load 7,681 and 3,888. 7,681 + 3,888 = 11,569. The 8.7% drop is (12,552 − 11,455) / 12,552.
- Item 4's "truthful lapse rate" claim. Corrected: item 4 fixes only the active counts, and the lapse definition moved to ASK-FIRST item 14.
- Code line cites for coreCountyForMentions and the licenses counts. Re-read both files. Corrected: `news-swfl.mts:121-130` to `:119-128`, lapse lines `:109-113` to `:108-119`, item 4 range `:85-107` to `:83-126`.
- Hendry presence in DBPR source files. could-not-verify.
- Notices PDF discrete penalty fields. could-not-verify.
- SIRS rows removed at the source. could-not-verify until the 10/01 write.

## 12. Questions for the operator

1. dbpr_re_licensees lands about 30k Lee and Collier agent records weekly into a table nothing reads. Its only planned reader, outreach, is parked by your 07/16 word. Pick one:
   - keep it running dark as-is;
   - let a leaf brain read it as an aggregate-only signal (new RE licenses per month by county, no names) as a possible early indicator;
   - park the cron until outreach is back.
2. Items 12 and 13 change what lands in data_lake: the license and applicant address/ZIP columns, and the Community Association Managers board. Yes or no on each.
3. Item 14 redefines licenses_lapse_rate_swfl as "left DBPR's file since the last load". Today's 0.5% cannot see the 1,173 licenses that expired 08/31/2026. Yes or no.
