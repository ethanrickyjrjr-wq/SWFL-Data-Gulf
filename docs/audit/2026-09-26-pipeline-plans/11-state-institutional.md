# 11 state-institutional — pipeline plan (09/26/2026)

Family 11 covers six registry pipelines: two FL Department of Revenue tax series (fl_dor_tdt, fl_dor_sales_tax), FBI/FDLE property crime (fdle_crime_swfl), the FGCU RERI monthly indicators scrape (fgcu_reri_indicators), LCPA airport statistics (rsw_airport_monthly) and the parked SBA 7(a) FOIA franchise pipeline (sba_foia_franchise_outcomes). The headline is simple. Every monthly pipeline in this family runs green while its source period is stuck or skipping months. The daily freshness probe calls all five FRESH because every upsert rewrites `inserted_at`. RSW's discovery bug is already fixed in code (commit 76a8c999, 09/18), and a read-only dry-run today finds the July 2026 PDFs; it lands on the 10/08 cron. The two DOR series are stalled at the source: files last modified 04/20 and 03/05, and newer data demonstrably exists elsewhere. FGCU fires before RERI publishes, so the June and July reports never landed; they are recoverable only from RERI's archive PDFs. FDLE is current, but it serves a Lee rate that silently dropped Cape Coral. SBA's source URLs all 404, and the pipeline has never run. Verdicts: fl_dor_tdt REPAIR, fl_dor_sales_tax REPAIR, fdle_crime_swfl IMPROVE, fgcu_reri_indicators REPAIR, rsw_airport_monthly IMPROVE, sba_foia_franchise_outcomes RETIRE (ASK-FIRST). No pipeline in this family makes an LLM call.

Connection note for every SQL block below: run it through a throwaway Bun script that copies the Bun.SQL credential approach in `scripts/apply-fdic-sod-view.mts:10-30` (reads `.dlt/secrets.toml`). All queries were run on 09/26/2026 and are read-only.

## 1. Scope

Six pipelines. Registry entries, workflows, tables and consumers:

- fl_dor_tdt: `ingest/cadence_registry.yaml:1224`. Workflow `.github/workflows/fl-dor-tdt-monthly.yml`, code `ingest/pipelines/fl_dor_tdt/pipeline.py`, table `public.fl_dor_tdt_collections`. Consumer chain: `refinery/sources/tourism-tdt-source.mts`, then pack `refinery/packs/tourism-tdt.mts`, then master (`refinery/packs/master.mts:234` sources[], `:295` input_brains[]). Also read by `app/r/source/_tables.ts` and `refinery/lib/methodology-registry.mts`.
- fl_dor_sales_tax: `ingest/cadence_registry.yaml:1247`. Workflow `fl-dor-sales-tax-monthly.yml`, code `ingest/pipelines/fl_dor_sales_tax/pipeline.py`, table `public.fl_dor_sales_tax`. Consumer chain: `refinery/sources/fl-dor-sales-tax-source.mts`, then `refinery/packs/sector-credit-swfl.mts`, then master (`master.mts:233`, `:294`).
- fdle_crime_swfl: `ingest/cadence_registry.yaml:1268`. Workflow `fdle-crime-quarterly.yml`, code `ingest/pipelines/fdle_crime_swfl/pipeline.py` + `cde.py`. Writes table `public.fdle_crime_swfl` and a Tier-1 NDJSON per year (`data_lake._tier1_inventory` paths `crime/2024/...`, `crime/2025/...`). Consumer chain: `refinery/sources/fdle-crime-source.mts`, then `refinery/packs/safety-swfl.mts`, then master (`master.mts:244`, `:305`).
- fgcu_reri_indicators: `ingest/cadence_registry.yaml:1361`. Workflow `fgcu-reri-monthly.yml`, code `ingest/pipelines/fgcu_reri_indicators/pipeline.py`, table `public.fgcu_reri_indicators`. Consumer chain: `refinery/sources/fgcu-reri-source.mts`, then `refinery/packs/fgcu-reri.mts`. It is NOT a master input: master dropped it 07/18 (`master.mts:257-262`, `:336-337`), and it survives as a standalone brain at `/api/b/fgcu-reri`.
- rsw_airport_monthly: `ingest/cadence_registry.yaml:1471`. Workflow `rsw-airport-monthly.yml`, code `ingest/pipelines/rsw_airport_monthly/pipeline.py`, table `public.rsw_airport_monthly`. Consumer chain: `refinery/sources/rsw-airport-source.mts`, then `refinery/packs/rsw-airport.mts`, then master (`master.mts:248`, `:309`). Also read by `lib/charts/airport-series.ts`, `lib/charts/gallery-loaders.ts` and `app/charts/page.tsx`.
- sba_foia_franchise_outcomes (not_yet_running): `ingest/cadence_registry.yaml:2341`. Workflow `franchise-outcomes-quarterly.yml` (schedule commented out, lines 4-15), code `ingest/duckdb_pipelines/franchise_outcomes/pipeline.py`. Target is Parquet `lake-tier1/franchise/sba_foia_franchise_county.parquet` plus `..._zip_approx.parquet`. Consumer chain: `refinery/sources/franchise-source.mts` (fixture by default, `REFINERY_FRANCHISE_SOURCE`), then `refinery/packs/franchise-outcomes.mts`, then master (`master.mts:228`, `:289`).

Consumer grep:

```
grep -rln "<table>" refinery lib app scripts components | grep -v -E "\.test\.|__tests__|/tests/"
```

Every table has a live reader. There is no DARK ROOT in this family. The stale-consumer case is fgcu-reri: its brain has not been rebuilt since 07/12 (section 4, P6).

## 2. What is being brought in

- fl_dor_tdt. Source: FL DOR Form 3 workbook, sheet "Tourist Development Tax" only (`pipeline.py:49-50`), at `F3FY{fy}.xlsx`. Fields: county, county_fips, period, collections_usd, source_url (`returns_filed` exists but is never written, `pipeline.py:203-210`). Geography: Lee and Collier. Cadence: 20th of each month (`fl-dor-tdt-monthly.yml:9`); `--current` requests FY now-1 and now (`pipeline.py:314`).
  - Live data: 666 rows; Lee 334 (07/01/1998 to 04/01/2026), Collier 332 (07/01/1998 to 02/01/2026); MAX(inserted_at) 09/20/2026.
  - Hendry: 0 rows.
  - Lee 03/2026 and 04/2026 carry `source_url = https://www.leeclerk.org/home/showpublisheddocument/328`, inserted 05/15/2026 (section 4, P3).

```
select county, count(*), min(period), max(period), max(inserted_at) from public.fl_dor_tdt_collections group by rollup(county);
select county, period::date, collections_usd, source_url, inserted_at from public.fl_dor_tdt_collections where period >= '2025-07-01' order by county, period;
```

- fl_dor_sales_tax. Source: FL DOR Form 10 workbook `F10_txsales_cy{SS}{EE}.xlsx`, one sheet per county. Fields: county, county_code, kind_code, business_type, period, taxable_sales_usd. Cadence: 15th of each month (`fl-dor-sales-tax-monthly.yml:7`).
  - Live data: 40,140 rows (Lee 21,013, Collier 19,127); periods 01/01/2002 to 12/01/2025; 83 distinct kind_codes; MAX(inserted_at) 09/15/2026.
  - Hendry: 0 rows.

```
select county, count(*), min(period), max(period), max(inserted_at), count(distinct kind_code) from public.fl_dor_sales_tax group by rollup(county);
```

- fdle_crime_swfl. Source: FBI Crime Data Explorer API (`constants.py:117`), per-agency `summarized/agency/{ORI}/property-crime`, summed to county with the participated population as the denominator (`cde.py:116-172`). Fields: county, data_year, total_property_crimes, population (the COVERED population), property_crime_per_1k. burglary, larceny_theft, motor_vehicle_theft and arson are null in all 8 rows. Cadence: quarterly, 1st of Jan/Apr/Jul/Oct (`fdle-crime-quarterly.yml:11`).
  - Live data: 8 rows, Lee and Collier for 2022-2025, MAX(inserted_at) 07/01/2026.
  - Lee rates per 1k: 10.00, 10.19, 9.06, 7.98.
  - Collier rates per 1k: 7.73, 7.03, 6.67, 4.84.
  - Hendry: 0 rows.

```
select county, data_year, total_property_crimes, population, property_crime_per_1k, inserted_at from public.fdle_crime_swfl order by county, data_year;
select count(*), count(burglary), count(larceny_theft) from public.fdle_crime_swfl;   -- 8, 0, 0
```

- fgcu_reri_indicators. Source: the RERI homepage "Southwest Florida Economic Outlook" block, fetched with crawl4ai (`pipeline.py:267-269`, `ingest/lib/crawl_client.py`). Fields: report_month, indicator, county, reference_period_label, reference_period_end, pct_change (YoY percent only, never levels). Cadence: 5th of each month (`fgcu-reri-monthly.yml:8`).
  - Live data: 17 rows in exactly two report months. 05/01/2026 has 10 rows, including home prices for lee/collier/charlotte. 08/01/2026 has 7 rows with no home prices. MAX(inserted_at) 09/05/2026.
  - County values are swfl/lee/collier/charlotte. Charlotte is out of scope and is not coverage. Hendry: 0 rows.

```
select report_month, count(*), string_agg(indicator||'/'||county, ',' order by indicator), max(inserted_at) from public.fgcu_reri_indicators group by report_month order by report_month;
```

- rsw_airport_monthly. Source: the LCPA reports page. The five PDFs (enplanements, deplanements, total_passengers, aircraft_operations, total_freight_lbs) are parsed with pdfplumber (`pipeline.py:293`). Fields: report_month, airport_code (RSW only), metric, value, yoy_pct_change. Cadence: 8th of each month (`rsw-airport-monthly.yml:8`).
  - Live data: 2,580 rows, 516 per metric, 05/01/1983 to 04/01/2026 for every metric; MAX(inserted_at) 09/08/2026.
  - Geography: the airport is in Lee. The data is not county-cut.

```
select metric, count(*), min(report_month), max(report_month), max(inserted_at) from public.rsw_airport_monthly group by rollup(metric);
```

- sba_foia_franchise_outcomes. Intended source: three SBA 7(a) FOIA CSVs (`franchise_outcomes/constants.py:31-40`), filtered by DuckDB to Lee and Collier franchise rows and written as Tier-1 Parquet.
  - Live data: none. `gh run list --workflow franchise-outcomes-quarterly.yml` returns zero runs.
  - `data_lake._tier1_inventory` has no franchise path. Only the two crime paths match:

```
select path, vintage, updated_at from data_lake._tier1_inventory where path ilike '%franchise%' or path ilike '%crime%';
```

  - The brain serves the fixture placeholder "Awaiting first live SBA FOIA data load — no figures published" (committed snapshot `brains/franchise-outcomes.md:35`, refined 07/03/2026).

## 3. What is working

- fl_dor_tdt: 4 of 4 runs green: 35514996047 (09/20), 32359083303 (08/20), 29741528449 (07/20), 27870409461 (06/20). Run 35514996047 printed "Parsed 16 rows ... Upserted 16 rows" for FY2026 and "SKIP: FY2027 Form 3 not found". The parser reads every month present in the file. The FY-position dating (`pipeline.py:92-103`) is sound. Tests: 0.
- fl_dor_sales_tax: 4 of 4 green: 34988875668 (09/15), 31882013185 (08/15), 29414802975 (07/15), 27560296646 (06/15). Run 34988875668 printed "Lee: 1944 rows parsed. Collier: 1776 rows parsed. Upserted 3720 rows" for each of the two pairs. Tests: 0.
- fdle_crime_swfl: 1 of 1 green: 28526483952 (07/01).
  - The run landed 2025 annual data within 6 months of year end. Log: "CDE Lee 2025: 4967 offenses / 622,446 covered pop = 7.98/1k (2 agencies)".
  - The coverage-shift guard (`refinery/packs/safety-swfl.mts:250-268`) fired correctly: the committed snapshot `brains/safety-swfl.md:47-48` shows direction neutral, magnitude 0.
  - Collier 2025 is a real, complete year: a CDE probe (below) shows Collier Sheriff reporting all 12 months of 2025 (sum 1,884).
  - Tests: 0.
- fgcu_reri_indicators: 3 of 3 green: 33978472293 (09/05), 31023293818 (08/05), 27027003275 (06/05). Each run parsed and upserted rows; the 08/05 run's printed rows carry report_month 2026-08-01. Tests: 0.
- rsw_airport_monthly: 6 green and 1 red in the window.
  - The discovery fix (commit 76a8c999, 09/18) works on HEAD. A read-only dry-run today discovered all five July PDFs under `www.flylcpa.com/app/uploads/2026/08/`, parsed 519 rows per metric (2,595 total), and printed max_observation_month 2026-07-01 for every metric, ending with "--dry-run, skipping DB write" (`pipeline.py:569`). The dry-run is read-only by code: `run()` returns at `:569-571` before `upsert_rows`.

```
env -u DESTINATION__POSTGRES__CREDENTIALS ingest/.venv/Scripts/python.exe -m ingest.pipelines.rsw_airport_monthly.pipeline --dry-run
```

  - Tests: 8 passed.

```
ingest/.venv/Scripts/python.exe -m pytest ingest/tests/pipelines/rsw_airport_monthly -q   # 8 passed in 0.49s
```

- sba_foia_franchise_outcomes: nothing runs. The only test passes (`ingest/duckdb_pipelines/franchise_outcomes/test_dry_run.py`, 1 passed), and it only proves `--dry-run` skips `run()`. The consumer is empty-tolerant and publishes no invented figures.

Run evidence command, per workflow:

```
gh run list --workflow <file> --limit 15 --json databaseId,status,conclusion,createdAt,event
```

## 4. Problems

P1. Green-but-frozen: the freshness seam cannot see a source stall (all 5 tables).
- Symptom: freshness-probe run 36259690113 (09/26) printed FRESH for all five tables, with every Health column green except rsw (yellow, a doctor window artifact):
  - "| `fl_dor_tdt` | table | FRESH | OK | NO_CONTRACT | GREEN | 🟢 green |"
  - "| `rsw_airport_monthly` | table | FRESH | OK | NO_CONTRACT | NO_RUNS_IN_WINDOW | 🟡 yellow |"
- Meanwhile the source-period ages today are: TDT Lee 178 days and Collier 237 days, sales tax 299 days, RSW 178 days for every metric, FGCU 56 days.
- Root cause: `ingest/scripts/check_freshness.py:254` defaults `freshness_column` to `inserted_at`, and every upsert rewrites it: `fl_dor_tdt/pipeline.py:209`, `fl_dor_sales_tax/pipeline.py:286`, `fgcu_reri_indicators/pipeline.py:292`, `rsw_airport_monthly/pipeline.py:474`, `fdle_crime_swfl/pipeline.py:426`. `expected_rows_min` cannot catch a stall either, because upsert tables never shrink.
- Severity: blocks a served number (every consumer reads stale while ops shows green).
- First seen: this audit, 09/26/2026.

```
select county, current_date - max(period)::date from public.fl_dor_tdt_collections group by county;   -- Lee 178, Collier 237
select county, current_date - max(period)::date from public.fl_dor_sales_tax group by county;         -- 299, 299
select metric, current_date - max(report_month)::date from public.rsw_airport_monthly group by metric; -- 178 x5
select current_date - max(report_month)::date from public.fgcu_reri_indicators;                        -- 56
```

P2. RSW has served April 2026 since at least 06/14 while May, June and July were published.
- Symptom (run 34261730727, 09/08): "rsw_airport_monthly [enplanements]: pattern not found; using fallback URL: https://s3.wasabisys.com/cdn.flylcpa.com/app/uploads/2024/11/21144941/RSW-Enplanement-Passengers.pdf". The same happened for all five metrics, followed by "upserted 2580 rows".
- Root cause: the old regex accepted only `s3.wasabisys.com`, while LCPA now links `www.flylcpa.com/app/uploads/...` (09/18 research `_RESEARCH/data-and-ingest/2026-09-18-data-access-and-outcome-feasibility.md:18-26`). This is fixed on HEAD by 76a8c999 (`pipeline.py:175-229`) and proven by the dry-run in section 3.
- Remaining defect: the legacy fallback is still on by default (`discover_pdf_url(..., allow_fallback=True)` at `:216`, called at `:501`). A `fallback_observed` state (`:528`) still upserts and exits 0, so the next page change reproduces a silent stall. `run()` also keeps going when a single metric fails (`:499-535`), so one metric can freeze alone.
- Severity: blocks a served number. Committed snapshot `brains/rsw-airport.md:52`: "LCPA Aviation April 2026 — RSW 1,152,669 total passengers". Live crawl4ai of the reports page today lists `.../2026/08/Total-Passengers-July-2026.pdf`, and the dry-run proves 2026-07.
- First seen: 2,580 rows was already the count on 06/14 (registry `:1478` comment), and every run since has re-upserted 516 rows per metric.

P3. TDT source stall, with a mislabeled served number.
- Symptom: the DOR files have not changed since spring:

```
curl -sI "https://floridarevenue.com/dataPortal/GTA/Form%203/F3FY2026.xlsx"   # 200, Last-Modified: Mon, 20 Apr 2026 15:14:09 GMT
curl -sI "https://floridarevenue.com/dataPortal/GTA/Form%203/F3FY2027.xlsx"   # 404
```

- Our table therefore ends at Collier 02/2026. Lee's 03/2026 and 04/2026 rows did not come from DOR. They came from `https://www.leeclerk.org/home/showpublisheddocument/328`, inserted 05/15/2026. That is an unregistered second writer: `git log --all -S "showpublisheddocument/328"` returns nothing, and no code in this repo writes that URL (grep for `leeclerk.org` hits only the lee_deed pipeline and docs).
- Newer data exists:
  - The RERI homepage today reads "Tourist Tax Revenues / Up 13.6 percent from June 2025 to June 2026" (crawl4ai of `https://www.fgcu.edu/cob/reri/`).
  - The Lee Clerk "Tourist Development Tax Collections.pdf" returns Last-Modified: Wed, 09 Sep 2026 08:31:52 GMT through crawl4ai. curl gets 403 on the same URL.
- Second defect, in the served number: `refinery/packs/tourism-tdt.mts:336,356,738` label the latest month "Lee + Collier combined" even when `county_count` is 1. The committed snapshot `brains/tourism-tdt.md:59` reads "SWFL TDT collections (Lee + Collier combined) for 2026-04 (shoulder season): $9.03M". The table's 04/2026 row is Lee only (9,028,029.34). The caveat at `tourism-tdt.mts:767-769` is present in the snapshot (`grep -c "reflects only 1 of 2" brains/tourism-tdt.md` returns 1), but the headline contradicts it.
- The trailing-12 figure ($89.00M through 2026-04, `brains/tourism-tdt.md:39`) spans two Lee-only months. [INFERENCE] It is understated by the missing Collier March and April.
- Severity: blocks a served number.
- First seen: the source stall per Last-Modified 04/20/2026; the Lee Clerk rows 05/15/2026.

P4. Sales tax source stall, plus a year-pair defect that will hide 2026 data.
- Symptom: the table ends 12/2025. `F10_txsales_cy2425.xlsx` returns Last-Modified: Thu, 05 Mar 2026. `F10_txsales_cy2627.xlsx` returns 404, and so does the portal's "Most Recent Month (preliminary)" link `https://www.floridarevenue.com/taxes/tables/f10_current.xlsx` (crawl4ai of `dataPortal/Pages/otr2.aspx`, then curl -sI).
- Newer data exists: RERI today reads "Taxable Sales / Down 13.0 percent from March 2025 to March 2026".
- Root cause (code): `current_year_pair()` (`fl_dor_sales_tax/pipeline.py:61-76`) pins the pair to the prior calendar year, so `--current` (`:393-395`) requests only cy2223 and cy2425 for all of 2026. It will not request cy2627 until January 2027, even after DOR posts it.
- Research already recorded the unresolved current route (`_RESEARCH/data-and-ingest/2026-09-18-data-access-and-outcome-feasibility.md:41-47`).
- Severity: blocks a served number. Committed snapshot `brains/sector-credit-swfl.md:125`: "Taxable Sales by Business Type (Lee + Collier combined, 2025-12".
- First seen: 03/05/2026 (source Last-Modified). The registry already recorded 40,140 rows on 05/31 (`:1254`), and the count is unchanged.

P5. FGCU cron fires before RERI publishes, so report months are lost for good.
- Symptom: only report months 2026-05 and 2026-08 exist.
  - No run exists for 07/05. `gh run list` shows none. The GitHub API shows 55 other scheduled runs that day (`gh api "repos/{owner}/{repo}/actions/runs?created=2026-07-05&event=schedule"`); cause not determined.
  - The 09/05 run re-wrote the August rows, because RERI posted "Regional Economic Indicators: September 2026 Report _September 09, 2026_" (homepage crawl today).
- Root cause: the homepage shows one month at a time (registry `:1368-1373`), and the cron at `fgcu-reri-monthly.yml:8` fires on the 5th. A publish after the 5th, or a dropped schedule, loses that month permanently.
- Recoverable: the archive PDFs exist.

```
curl -s -o /dev/null -w "%{http_code} %{size_download}" https://www.fgcu.edu/cob/reri/files/rei/indicators2026{06,07,08,09}.pdf   # all 200, 851,561-873,272 bytes
```

- Second defect: the September homepage phrases home prices as "Up between 2.5 and 11.1 percent from July 2025 to July 2026." That sentence has no " in " and matches neither branch (`pipeline.py:186`, `_SIMPLE_RE` at `:61-65`), so home prices are dropped again. This is the regression the 08/02 registry comment named (`:1368-1373`).
- Severity: blocks a consumer (months missing, home prices missing).
- First seen: 07/05/2026 (the missing run). The homepage never shows old months, so without item 6 they stay lost.

P6. fgcu-reri brain is expired and nothing rebuilds it.
- Symptom: committed snapshot `brains/fgcu-reri.md` has refined_at 2026-07-12T04:18:08Z and expires 2026-08-11T04:18:08Z. It still serves "YoY, 2026-05" facts (`:36-38`), although August rows landed on 08/05.
- Root cause: `daily-rebuild.yml:141` defaults `PACK` to master, and master no longer reaches fgcu-reri (`master.mts:257-262`). The standalone brain lost its only rebuild path when it was dropped on 07/18.
- Severity: blocks a consumer (`/api/b/fgcu-reri`).
- First seen: 08/11/2026 (expiry).
- Caveat: `brains/*.md` are committed snapshots. The swfl MCP returned 429 this session, so served bytes were not fetched.

P7. FDLE Lee rate silently changed geography and includes a partial year.
- Symptom: Lee's covered population fell from 867,715 (2024, 3 agencies) to 622,446 (2025, 2 agencies), per the run 28526483952 log.
  - A CDE probe shows Cape Coral PD with participated_population 0 and no offenses for 2025.
  - For 2024, Cape Coral reported only 10 months (01-2024 to 10-2024, sum 1,809), yet it was counted with its full-year covered population of 235,076.

```
curl -s "https://api.usa.gov/crime/fbi/cde/summarized/agency/FL0360200/property-crime?from=01-2024&to=12-2024&API_KEY=DEMO_KEY"
curl -s "https://api.usa.gov/crime/fbi/cde/summarized/agency/FL0360200/property-crime?from=01-2025&to=12-2025&API_KEY=DEMO_KEY"
curl -s "https://api.usa.gov/crime/fbi/cde/agency/byStateAbbr/FL?API_KEY=DEMO_KEY"   # LEE roster incl. FL0360200 Cape Coral PD
```

- Root cause: `cde.py:139` counts an agency if `participated > 0` without checking month completeness. `safety-swfl.mts:442-452` asserts "Lee coverage is near-complete from 2022", which is false for 2025.
- The committed snapshot `brains/safety-swfl.md:51` states "SWFL property crime: 6.8 ... (2025 UCR), -18.7% YoY. Lee (8.0/1k) ...". Direction is suppressed to neutral, but the conclusion text still prints the suppressed YoY.
- [INFERENCE] The Lee 2024 rate is understated by roughly two months of Cape Coral offenses.
- Severity: blocks a served number.
- First seen: 07/01/2026 (2025 rows); 06/06/2026 (2024 method).

P8. SBA source is gone and the pipeline has never run.
- Symptom: all three `asof-260331` CSV URLs (`constants.py:31-40`) return 404, and so do the `asof-260630` variant, the citation page `https://data.sba.gov/en/dataset/7-a-504-foia` (`constants.py:44`) and `https://data.sba.gov/dataset/7-a-504-foia` (crawl4ai status 404 on each).
- The crawl4ai'd dataset index `https://data.sba.gov/dataset` lists 10 slugs (ppp-foia, rrf-foia, ...) and no 7(a) FOIA dataset.
- The pipeline has zero runs ever. The schedule has been commented out since 07/14 (`franchise-outcomes-quarterly.yml:4-15`).
- Severity: blocks a consumer. The brain is a master input (`master.mts:228`, `:289`) publishing a placeholder.
- First seen: never ran. The known-problems ledger tracked "franchise_foia_first_run" (`docs/audit/2026-07-11-pipeline-problems/02-known-problems-ledger.md:61`, `:182-184`).

P9. Stale claims in the docs and registry (cosmetic, but they mislead the next agent).
- Registry `:1480` says "Scrapes via Firecrawl"; the code uses crawl4ai (`rsw_airport_monthly/pipeline.py:238-243`). data-roots' own RSW note already flagged it.
- `docs/standards/data-roots.md:1690` says fgcu-reri feeds master at `master.mts:329`; `master.mts:257-262,336` shows it was dropped. The 07/22 wire map is right (`_RESEARCH/data-and-ingest/2026-07-22-lake-wire-map.md:70`).
- Registry `:1275` says "6 rows expected"; the table has 8.
- Registry `:1286-1290` source_ceiling, `docs/standards/data-inventory.md:105` and `data-roots.md:51` say the FDLE city and offense breakdown is "already computed, then discarded". The FIBRS parser did compute it (`pipeline.py:139-260`), but the live CDE path does not: `cde.py:21-24` leaves the four offense columns null, and the breakdown needs sibling endpoints (new calls).
- Registry `:2344-2347` `known_drift: parked_but_scheduled` points at check `sba_franchise_parked_but_live`, which is not in the 21-open list (`node scripts/check.mjs list`). Its condition has been false since the schedule was commented out 07/14.
- The registry says RERI yields 8 indicators; the parser yields 7 single-value rows plus 0-3 home-price rows.
- `docs/standards/data-roots.md:1661,1669,1677` cite master edges at `master.mts:288`, `:287` and `:302`. `grep -n` on `master.mts` shows the input_brains entries at `:295` (tourism-tdt), `:294` (sector-credit-swfl) and `:309` (rsw-airport). This is line drift; the edges themselves exist.

P10. Zero tests for four of six pipelines.
- fl_dor_tdt, fl_dor_sales_tax, fdle_crime_swfl and fgcu_reri_indicators have no tests. `ls ingest/tests/pipelines/` shows only `rsw_airport_monthly`, and `grep -rl` over `ingest/tests` hits none of these modules.
- Severity: blocks nothing today; it is why P4, P5 and P7 were never caught.

## 5. What is missing

- fl_dor_tdt
  - Missing vs the consumer: a current Lee and Collier month. The fresher Lee route (the Lee Clerk TDT PDF) is proven to exist but is not ingested. Collier's equivalent route has not been checked.
  - Missing vs source_ceiling (`:1241-1245`): the same workbook's other six sheets (Local Option Sales Tax, Conv & Tourist Impact, three Local Option Fuel Tax sheets). These are free and already downloaded. The operator should not be asked about them; they are DO once the source is current.
  - `returns_filed` is never populated (`pipeline.py:203-210`).
- fl_dor_sales_tax
  - Missing: the current publication route for 2026 months. The vendor ceiling is otherwise complete per registry `:1262-1266`.
- fdle_crime_swfl
  - Missing: violent crime entirely. The table has property columns only.
  - Missing: the per-offense property breakdown (null in 8 of 8 rows) and city-level rates. Both need new CDE calls, not a "stop discarding" change.
  - Missing: a completeness rule (12 reported months) before an agency counts toward the rate.
- fgcu_reri_indicators
  - Missing: report months 2026-06, 2026-07 and 2026-09. The PDFs are live, but no PDF parser exists.
  - Missing: index levels (only YoY pct is kept).
  - Missing vs source_ceiling (`:1386-1390`): the 5 untouched dashboard categories.
  - Missing: a rebuild path for its brain.
- rsw_airport_monthly
  - Missing: 05/2026 to 07/2026 (lands on 10/08 if the fix holds), Page Field (source_ceiling `:1491`), and a fail-loud rule on fallback.
  - Missing: retained raw PDFs on the cron path. Only the 09/18 one-off archive exists: `ssh fedora "find /srv/swfl/research -maxdepth 4 -iname '*rsw*'"` shows `archive-20260918/{raw,manifests,exports,metadata}/rsw_lcpa_monthly`.
- sba_foia_franchise_outcomes
  - Missing: the source itself.
- Hendry (12051): absent from every family table (0 rows by the county filters above). FDLE, TDT and sales tax all publish Hendry for free. The operator's scope makes Hendry a minor addition, so this is noted, not planned.

## 6. Verdict per pipeline

- fl_dor_tdt: REPAIR. The pipeline is fine; its source route is dead and the served headline mislabels a Lee-only month as combined. The number that would flip it to GOOD ENOUGH: Collier MAX(period) at or after 2026-06-01 on the next run.
- fl_dor_sales_tax: REPAIR. The source route is unknown and the code will not request cy2627 in 2026. The number that would change the verdict: any 2026 period in `public.fl_dor_sales_tax`.
- fdle_crime_swfl: IMPROVE. It is current (2025 landed 07/01), but the Lee 2025 rate covers a different geography and the 2024 rate includes a 10-month agency. The number that would change the verdict: Cape Coral PD 2025 participated_population > 0 in CDE.
- fgcu_reri_indicators: REPAIR. The timing loses months and the brain is expired. The number that would change the verdict: 4 consecutive report months present after the cron moves and the PDF backfill lands.
- rsw_airport_monthly: IMPROVE. The code fix is proven by dry-run; it needs the cron landing, fail-loud on fallback, and raw retention. The number that would change the verdict: MAX(report_month) = 2026-07-01 or later after run 10/08. If it is still 2026-04-01, the verdict becomes REPAIR.
- sba_foia_franchise_outcomes: RETIRE (ASK-FIRST). The source is 404 everywhere crawled and the pipeline has never run. The number that would change the verdict: one live 7(a) FOIA CSV URL returning 200 with Lee or Collier franchise rows.

## 7. The plan

Ordered. Lane D unless stated. Every item is code or registry. None dispatches, pushes or writes data_lake. Each proof command runs after the change lands.

1. DO. Make the RSW fallback fail loud.
   - What: in `run()`, treat `fallback_observed` as a failure for the upsert path. Skip that metric's upsert, and exit 1 after writing the rest.
   - Where: `ingest/pipelines/rsw_airport_monthly/pipeline.py:499-535` and `:573-578`.
   - Effort: S.
   - Proof: a new test in `ingest/tests/pipelines/rsw_airport_monthly/test_pipeline.py` feeding empty markdown asserts exit code 1 and no upsert call. `pytest ingest/tests/pipelines/rsw_airport_monthly -q` shows 9 passed.
   - Unblocks: a future LCPA page change can never again serve a frozen month green.
2. DO. Add one source-period contract per table (the section 8 design).
   - Where: `ingest/quality/quality_registry.yaml`, five `sql_expectation` blocks (locus probe, policy report, severity error).
   - Effort: S.
   - Proof: `python -m ingest.scripts.check_data_quality --dry-run` shows 4 FAIL (tdt, sales tax, rsw, fgcu) and 1 PASS (fdle) today.
   - Unblocks: the stall class becomes visible without any issue.
3. DO. Verify the 10/08 RSW landing.
   - What: after the scheduled run, run the RSW period query from P1.
   - Effort: S.
   - Proof: `select min(m) from (select max(report_month) m from public.rsw_airport_monthly group by metric) x;` returns 2026-07-01 or later. The rsw contract from item 2 auto-closes.
   - Unblocks: NORTH STAR #1 (TERRA) is closed on production evidence.
4. DO. Retain raw RSW PDFs on the cron path with one job owner.
   - What: switch `rsw-airport-monthly.yml` to the gated form already used at `.github/workflows/ingest-collier-official-records.yml:31` (`runs-on: ${{ vars.SWFL_LOCAL_RUNNER_READY == 'true' && fromJSON('["self-hosted","swfl-local"]') || 'ubuntu-latest' }}`). Add a first step `python -m ingest.pipelines.rsw_airport_monthly.pipeline --capture-local` with `SWFL_RESEARCH_ROOT=/srv/swfl/research`, guarded by `if: vars.SWFL_LOCAL_RUNNER_READY == 'true'`, so a fall back to `ubuntu-latest` skips the capture (no `/srv/swfl` there, and `resolve_capture_root` raises without a root, `ingest/lib/research_capture.py:50-52`) and the upsert step still runs.
   - Effort: S.
   - Proof: `ssh fedora "find /srv/swfl/research/raw/rsw_lcpa_monthly -newer /srv/swfl/research/archive-20260918 -name '*.pdf'"` lists the 10/08 files (layout `raw/<source_id>/<sha[:2]>/<sha>-<name>` per `research_capture.py:118`), and `gh run view <id>` shows both steps green.
   - Unblocks: publication-vintage history for the Sol forecast (NORTH STAR #2-3).
5. DO. Move the FGCU cron after RERI's observed publish day.
   - What: change `0 14 5 * *` to `0 14 12 * *`.
   - Where: `.github/workflows/fgcu-reri-monthly.yml:8`.
   - Effort: S.
   - Proof: `node scripts/schedule-catalog.mjs | grep -i reri` shows the 12th, and the October run writes report_month 2026-10.
   - Unblocks: no more lost months.
6. DO. Add an FGCU PDF parse path and backfill 2026-06, 2026-07 and 2026-09.
   - What: add `--report YYYYMM`. Fetch `files/rei/indicators{YYYYMM}.pdf` and parse the same 8 indicators, with per-county home prices, using pdfplumber (already in `ingest/requirements.txt:41`).
   - Where: `ingest/pipelines/fgcu_reri_indicators/pipeline.py`.
   - Effort: M.
   - Proof: `--dry-run --report 202609` prints 7 or more rows, including home_prices rows. After the operator's dispatch, `select report_month, count(*) ... group by 1` shows 5 months.
   - Unblocks: fixes P5's lost months and the home-price regression.
7. DO. Fix the sales-tax year-pair window.
   - What: `--current` requests prior, current and next pair. The existing 404 SKIP (`pipeline.py:315-316`) already handles a missing file.
   - Where: `ingest/pipelines/fl_dor_sales_tax/pipeline.py:61-76,393-395`.
   - Effort: S.
   - Proof: `--dry-run` prints `pairs=[(2022, 2023), (2024, 2025), (2026, 2027)]`, plus a new unit test on the pair list.
   - Unblocks: cy2627 is picked up the month DOR posts it.
8. DO. Discover the current DOR routes for Form 3 and Form 10.
   - What: crawl4ai the DOR data portal and the Office of Tax Research pages, find where 2026 months now live, and file the finding under `_RESEARCH/data-and-ingest/` plus the INDEX line.
   - Effort: S.
   - Proof: a 200 URL whose Lee sheet holds a 2026 month. RERI's June TDT and March taxable-sales figures prove such data exists.
   - Unblocks: items 9 and 7 become useful.
9. ASK-FIRST. Switch Lee TDT provenance to the Lee Clerk PDF, or to the route item 8 finds.
   - What: add a Lee leg that fetches `https://www.leeclerk.org/home/showpublisheddocument/328` with crawl4ai (curl gets 403), parses it, and upserts with its own source_url.
   - Where: `ingest/pipelines/fl_dor_tdt/`.
   - Effort: M.
   - Proof: Lee MAX(period) at or after 2026-06-01.
   - ASK-FIRST because it changes the provenance of a served number.
10. ASK-FIRST. Decide the fate of the two Lee Clerk rows (03/2026 and 04/2026, inserted 05/15/2026) written by an unknown writer: keep and document, or delete and re-ingest through item 9. This is a data write.
11. ASK-FIRST. Fix the tourism-tdt headline and trailing sum.
   - What: when `county_count < 2`, label the latest month "Lee only" and compute trailing 12 over both-county months.
   - Where: `refinery/packs/tourism-tdt.mts:336,356,738`.
   - Effort: S.
   - Proof: rebuild with `pack_id=tourism-tdt`; `brains/tourism-tdt.md` no longer says "combined" for a one-county month.
   - ASK-FIRST because it changes a served key_metric label.
12. DO. Stop counting partial-year agencies at full-year population in FDLE.
   - What: count an agency-month only when that month's participated_population is > 0, and pro-rate the agency's covered population by reported months / 12. Keep the annual December bucket shape (LCSO 2024) as a full year. This avoids dropping an agency with a genuine zero-offense month; a Marco Island month check was attempted and returned OVER_RATE_LIMIT on DEMO_KEY, so the zero-month case is unverified.
   - Where: `ingest/pipelines/fdle_crime_swfl/cde.py:132-142`.
   - Effort: S.
   - Proof: a new `ingest/tests/pipelines/fdle_crime_swfl/test_cde.py` feeding Cape Coral's 10-month 2024 shape pro-rates its covered population to 10/12. A read-only dry-run is allowed only after checking `pipeline.py` dry-run skips both the Postgres and Storage writes; the docstring claims it does, but that is unverified here.
   - Unblocks: a correct Lee 2024 rate on the next `--year 2024` dispatch.
13. ASK-FIRST. Correct the safety-swfl text.
   - What: drop the stale "near-complete from 2022" caveat, name the agencies dropped each year, and stop printing a YoY in the conclusion when `swflRosterShift` is true.
   - Where: `refinery/packs/safety-swfl.mts:442-452` and the conclusion builder.
   - Effort: S.
   - Proof: rebuild with `pack_id=safety-swfl`; the conclusion has no "-18.7% YoY".
   - ASK-FIRST because it is served output.
14. ASK-FIRST. Give fgcu-reri a rebuild path or retire it.
   - Option A: after item 6, append a step to `fgcu-reri-monthly.yml` that calls `daily-rebuild.yml` with `pack_id=fgcu-reri` (never master, never `--force`).
   - Option B: retire `/api/b/fgcu-reri`.
   - Effort: S.
   - Proof: `grep refined_at brains/fgcu-reri.md` shows a date after the next ingest.
15. ASK-FIRST. Retire sba_foia_franchise_outcomes.
   - What: remove the franchise-outcomes edges `master.mts:228` and `:289` in one commit, delete the registry block `:2330-2365`, and keep the pipeline code in git history.
   - Alternative: re-source it if the operator knows the new SBA 7(a) FOIA location.
   - Effort: S.
   - Proof: `node scripts/schedule-catalog.mjs` has no franchise row, and Gate 10 passes.
16. DO. Registry and doc hygiene for P9.
   - What: fix `cadence_registry.yaml:1480` (Firecrawl) and `:1275` (6 rows); delete `:2344-2347` known_drift; correct the FDLE ceiling text at `:1286-1290`, `data-inventory.md:105` and `data-roots.md:51,1690`.
   - Effort: S.
   - Proof: `grep -n "Scrapes via Firecrawl" ingest/cadence_registry.yaml` is empty, and Gate 10 passes.
17. DO. Add parser tests where none exist.
   - What: one pure test per pipeline. TDT: `parse_fy_excel` on a 2-county in-memory workbook. Sales tax: the pair list. FGCU: `parse_indicators` on the September markdown, including "Up between". FDLE: item 12.
   - Where: `ingest/tests/pipelines/<name>/`.
   - Effort: M.
   - Proof: `pytest ingest/tests/pipelines -q` shows the new files passing.
18. DO. Pull the free violent-crime series and the per-offense property split for Lee and Collier.
   - What: use the CDE summarized endpoints. The current rate is one call per agency-year, so this roughly doubles the calls (one extra call per agency-year for violent crime).
   - Where: `fdle_crime_swfl/cde.py`, plus violent columns via an idempotent migration that is additive to a public table.
   - Effort: M.
   - Proof: `select count(burglary) from public.fdle_crime_swfl` > 0.
   - Unblocks: the source_ceiling for real.

Second-review lane: Lane C. Once items 1, 6, 7 and 12 land, run `codex` as an independent reviewer of those diffs. Verify the flags live with `codex --help` first. This is review only; nothing unattended.

## 8. Checks and balances

Design: one signal per pipeline. Each signal is a `sql_expectation` content contract in `ingest/quality/quality_registry.yaml` (locus probe, policy report, severity error). It is evaluated daily by `ingest/scripts/check_data_quality.py:139-183`, which runs inside freshness-probe-daily. The builder executes the SQL as written after a read-only assertion (`ingest/quality/contracts.py:447-453`). A FAIL opens exactly one `public.checks` row, keyed `contract_fail_<table>_<name>` (`check_data_quality.py:335-336`, INSERT at `:382-397`), and the row auto-closes when the condition clears (`:407-428`). No GitHub issue is involved.

Production evidence for the open path: `public.checks` holds `contract_fail_data-lake-listing-state_listing_state_home_price_floor`, created 07/12/2026 by this probe. That is the only `contract_fail_%` row ever (`select count(*) from public.checks where check_key like 'contract_fail_%'` returns 1). It was dropped on 08/12/2026 and stays dropped, because `:405` never re-opens a `dropped` row, even though that contract still fails (probe run 36259690113: "22 failing rows"). The auto-close path for contracts is code-read only; no contract check has ever auto-closed in production. The rule for these five is therefore: never `--drop` a `contract_fail_` check. Close it by fixing the data, or it goes silent forever. The runner is table-key agnostic (it runs the raw SQL), so `public.*` tables work.

Why not the other seams:
- The freshness-probe-daily workflow has been red for 6 straight days for reasons outside this family. Run 36259690113 failed on `listing_lifecycle` and `swfl_inc` rows. A workflow conclusion therefore signals nothing; the check row is the signal.
- Flipping `freshness_column` to the period column (`check_freshness.py:254`) is rejected. With cadence_days 30 and tolerance 2.0-2.5, the thresholds are 60-75 days, and normal publication lag already exceeds that for TDT and sales tax, so the ops `/coverage` page would sit red permanently.
- `freshness_column` stays `inserted_at`, and its meaning is restated honestly as "the job ran".

Proposed thresholds. Each is derived from observed publication lag, with the arithmetic shown per pipeline; none is a measured SLA. Each fires today only where the data is really stuck (verified by running all five SQLs read-only, section 11).

- fl_dor_tdt, contract `tdt_source_period_lag`.
  - Lag arithmetic: the workflow comment says the 20th of month M captures M-2 (`fl-dor-tdt-monthly.yml:6-8`), so the worst normal age before the next capture is about 110 days. The registry says Collier lags Lee by about 2 months (`:1233-1234`), so Collier gets 60 more.
  - Today: Lee 178 and Collier 237, so it fires.

```
SELECT CASE WHEN bool_or((county='Lee' AND current_date - mp > 120) OR (county='Collier' AND current_date - mp > 180)) THEN 1 ELSE 0 END
FROM (SELECT county, max(period)::date mp FROM public.fl_dor_tdt_collections GROUP BY county) t
```

- fl_dor_sales_tax, contract `sales_tax_source_period_lag`.
  - Lag arithmetic: "~45-day lag" (`fl-dor-sales-tax-monthly.yml:6`) with a capture on the 15th puts the worst normal age at about 105 days.
  - Today: 299, so it fires.

```
SELECT CASE WHEN max(age) > 120 THEN 1 ELSE 0 END FROM (SELECT current_date - max(period)::date age FROM public.fl_dor_sales_tax GROUP BY county) t
```

- fdle_crime_swfl, contract `fdle_data_year_lag`.
  - Lag arithmetic: 2025 data landed on the 07/01/2026 run, so year Y is expected by about October of Y+1.
  - Today: max 2025 against a required 2024, so it passes.

```
SELECT CASE WHEN max(data_year) < extract(year FROM current_date - interval '9 months')::int - 1 THEN 1 ELSE 0 END FROM public.fdle_crime_swfl
```

- fgcu_reri_indicators, contract `reri_report_month_lag`.
  - Lag arithmetic: once the cron moves to the 12th (item 5), report month M is captured by the 12th of M and the worst normal age is about 42 days. The threshold of 50 allows 8 days for a late post. If RERI posts after the 12th, the capture gets the previous month and this fires. That is intended: the homepage shows one month only, so a missed month is lost unless the PDF backfill (item 6) runs.
  - Today: 56, so it fires.

```
SELECT CASE WHEN current_date - max(report_month)::date > 50 THEN 1 ELSE 0 END FROM public.fgcu_reri_indicators
```

- rsw_airport_monthly, contract `rsw_metric_period_lag`.
  - Why the minimum over metrics: `run()` keeps the other metrics when one fails (`pipeline.py:499-535`), so a single metric can freeze alone.
  - Lag arithmetic: July data sits under `/app/uploads/2026/08/`, so the publication lag is at least one month. With a capture on the 8th, the worst normal age is about 99 days. The August PDFs were not on the page as of 09/26 (crawl4ai, section 4 P2), so the lag can stretch toward two months; the threshold therefore gets one month of grace, 130 days.
  - Today: 178, so it fires.

```
SELECT CASE WHEN current_date - min(mp) > 130 THEN 1 ELSE 0 END FROM (SELECT max(report_month)::date mp FROM public.rsw_airport_monthly GROUP BY metric) t
```

- sba_foia_franchise_outcomes: no signal while it is parked. This is stated explicitly, not an oversight. If item 15 goes the re-source way, add a Tier-1 check on `data_lake._tier1_inventory.max_period_end` at that point.

Red runs are already covered, with no change needed. All five live workflows are listed in `log-cron-incident.yml:16-97`, so a red run opens or reopens `cron_incident_<workflow>` and auto-closes on the next green scheduled run (`log-cron-incident.mjs:156,173`). `classify-cron-failure.mjs` classifies correctly: RSW's only red run, 27156970463 (06/08), classifies as `{"klass":"MISSING_DEP","signal":"pdfplumber"}` from its log line "RuntimeError: pdfplumber not installed", and `ingest/requirements.txt:41` has since carried `pdfplumber>=0.10`.

Noise to delete:
- Registry `:2344-2347` `known_drift: parked_but_scheduled` for SBA. Its schedule has been commented out since 07/14, and the named check is not in the open list.
- The per-incident GitHub issue that `log-cron-incident.mjs:257` creates on top of the check and the sticky issue #44 comment (`gh variable list` shows `CRON_INCIDENT_ISSUE_NUMBER 44`). This family has none open today: `gh issue list --label cron-failure --state all` filtered to family titles returns only #105, which is corridor-pulse, not this family. The recommendation is cross-cutting, so it is handed to family 19: keep the check and the sticky comment, drop the per-incident issue.
- The yellow `NO_RUNS_IN_WINDOW` for rsw in the doctor. It is a backfill-cap artifact (`ingest/lib/gh_runs.py:130`, `ingest/scripts/doctor.py:553`) while the workflow has a green 09/08 run. It is cosmetic; do not chase it.
- `expected_rows_min` on these five entries is kept only as a table-wipe guard. It is documented as unable to detect a stall, and it is never alerted on.

## 9. Box placement

The runner is live: `gh api repos/{owner}/{repo}/actions/runners` shows `fedora-swfl-local online self-hosted,Linux,X64,swfl-local`, and `SWFL_LOCAL_RUNNER_READY=true` was set 09/20. The open check `fedora_runner_not_registered_smoke_owed` is therefore stale; that is family 19's to close.

- fl_dor_tdt: the DOR leg stays on GHA `ubuntu-latest`. It is a plain HTTPS xlsx: curl returned 200 with no WAF, and run 35514996047 took 74 seconds end to end (startedAt 13:57:07Z, updatedAt 13:58:21Z via `gh run view 35514996047 --json startedAt,updatedAt`). The proposed Lee Clerk leg (item 9) starts on the Fedora runner. Reason: curl gets 403 (WAF shape), while a crawl4ai browser fetch from a residential IP gets 200. A GHA-IP fetch is untested; move it back to GHA only if a GHA run proves 200.
- fl_dor_sales_tax: stays on GHA. Plain HTTPS xlsx, 1.2 MB, no WAF.
- fdle_crime_swfl: stays on GHA. It is a keyed public API (api.data.gov), needs no browser, and is quarterly.
- fgcu_reri_indicators: stays on GHA. crawl4ai works there (3 of 3 green), and the PDF archive returns 200 to curl.
- rsw_airport_monthly: moves to the Fedora runner (item 4). Reason: it needs the SSD archive (`SWFL_RESEARCH_ROOT=/srv/swfl/research`) so one job both upserts and retains the raw PDFs. That is NORTH STAR #4's "one job owner per source". There is no Hermes duplicate: `systemctl --user list-timers` on fedora shows no RSW timer, only the one-off `archive-20260918` capture. The GHA fallback stays via the `SWFL_LOCAL_RUNNER_READY` gate. The SSD's backup and reboot tests are still untested, so the lake write remains primary.
- sba_foia_franchise_outcomes: stays where it is (dispatch-only, parked) pending item 15. If it is re-sourced, its 50-200 MB CSVs (`pipeline.py:6-7`) are a Fedora SSD candidate for vintage retention.
- Already on the box that should not be: nothing from this family. The fedora user timers (loopholewatch, market-*, scout, datawatch, toolwatch and others) belong to other projects or families.

## 10. Compute lane per LLM leg

None. There is no LLM call in this family's ingest, workflows, packs or sources. The grep:

```
grep -rn -i -E "anthropic|claude|openai|ANTHROPIC_API_KEY|refinery|llm|gpt|ollama" ingest/pipelines/fl_dor_tdt ingest/pipelines/fl_dor_sales_tax ingest/pipelines/fdle_crime_swfl ingest/pipelines/fgcu_reri_indicators ingest/pipelines/rsw_airport_monthly ingest/duckdb_pipelines/franchise_outcomes .github/workflows/fl-dor-tdt-monthly.yml .github/workflows/fl-dor-sales-tax-monthly.yml .github/workflows/fdle-crime-quarterly.yml .github/workflows/fgcu-reri-monthly.yml .github/workflows/rsw-airport-monthly.yml .github/workflows/franchise-outcomes-quarterly.yml --include=*.py --include=*.yml
grep -rn -i -E "anthropic|callClaude|messages\.create|llm" refinery/packs/{tourism-tdt,sector-credit-swfl,safety-swfl,fgcu-reri,rsw-airport,franchise-outcomes}.mts refinery/sources/{tourism-tdt-source,fl-dor-sales-tax-source,fdle-crime-source,fgcu-reri-source,rsw-airport-source,franchise-source}.mts
```

The first grep's only hits are two comments in `franchise_outcomes/constants.py:11,53` naming a refinery file path. The second returns nothing. `ingest/lib/crawl_client.py` (used by FGCU and RSW) mentions Anthropic only in its docstring history (`:13`). `fetch_page_markdown` (`:287`) is the zero-LLM crawl4ai path.

All planned work stays in Lane D: fetch, parse, count and compare. Nothing needs a model. The brain-level narrative bake for these brains is a cross-family leg that is already parked and owned outside this family (`narrative-bake.yml`); it is not planned here. Local models (Lane L) have no role: every figure here is numeric extraction.

## 11. Double-check log

I re-read the file top to bottom and re-ran every numbered claim against its source. Each entry gives the claim, the command or file that verifies it, and the result.

- 666 TDT rows; Lee 334 to 04/01/2026; Collier 332 to 02/01/2026. Rollup query, section 2. Verified.
- Lee 03/2026 and 04/2026 rows come from leeclerk.org, inserted 05/15/2026. FY2026 row query. Verified.
- `git log -S` for the Lee Clerk URL is empty. `git log --all --oneline -S "showpublisheddocument/328"` printed nothing. Verified.
- F3FY2026 Last-Modified 04/20/2026; F3FY2027 404. curl -sI. Verified.
- cy2425 Last-Modified 03/05/2026; cy2627 404; f10_current 404. curl -sI. Verified.
- Sales tax: 40,140 rows, Lee 21,013, Collier 19,127, max period 12/01/2025, 83 kinds. Query. Verified.
- FDLE: 8 rows, and the rates listed. Query. Verified. Offense columns 0 of 8 non-null: count query. Verified.
- FDLE covered populations 867,715 and 622,446, with 3 and 2 agencies. `gh run view 28526483952 --log`. Verified.
- Cape Coral 2024: 10 months, sum 1,809, participated 235,076; 2025: participated 0. DEMO_KEY CDE calls. Verified.
- Collier Sheriff 2025: 12 months, sum 1,884. DEMO_KEY call. Verified.
- FGCU: 17 rows in months 05 and 08. Query. Verified. The 08/05 run printed 2026-08-01 rows: `gh run view 31023293818 --log`. Verified.
- RERI September report posted 09/09/2026; the home-price phrasing "Up between 2.5 and 11.1 percent". crawl4ai of the homepage. Verified.
- indicators202606 to 202609 PDFs return 200. curl. Verified.
- RSW: 2,580 rows, 516 per metric, 05/1983 to 04/2026. Query. Verified.
- RSW dry-run: 519 per metric, 2,595 total, max 2026-07-01 for all five. Local dry-run output. Verified.
- RSW red run 27156970463 = MISSING_DEP pdfplumber. `classify()` on the log tail. Verified.
- Run counts:
  - TDT 4 of 4 green, sales tax 4 of 4, FDLE 1 of 1, FGCU 3 of 3, RSW 6 green and 1 red, SBA 0 runs. gh run list. Verified.
- 55 scheduled runs on 07/05. `gh api ...created=2026-07-05&event=schedule` returned total_count 55. Verified. The cause of the missing FGCU run is could-not-verify, and the file says so.
- Source-period ages 178, 237, 299, 178, 56. Age queries. Verified (as of 09/26/2026; they grow daily).
- The five section 8 contract SQLs, run read-only through the Bun.SQL script, return tdt 1, sales tax 1, fdle 0, fgcu 1 and rsw 1 (at threshold 130). That matches item 2's proof of 4 FAIL and 1 PASS. Verified.
  - Correction applied in section 8: the RSW threshold was first drafted at 105 days. On re-read, the August PDFs were still absent on 09/26, so the publication lag is not reliably one month, and 105 would false-fire. It is now 130.
- Freshness probe 36259690113 shows FRESH or GREEN rows for all five. Saved log grep. Verified.
- The freshness probe was red 6 of 6 runs from 09/21 to 09/26. `gh run list --workflow freshness-probe-daily.yml --limit 6`. Verified.
- Upsert lines rewrite inserted_at: `tdt:209`, `sales:286`, `fgcu:292`, `rsw:474`, `fdle:426`. grep -n. Verified.
  - Correction applied: a review note during drafting gave `rsw:472`; `grep -n inserted_at` shows 474, and the file uses 474.
- `check_freshness.py:254` defaults to inserted_at. Read. Verified.
- `check_data_quality.py:139-183` runs raw contract SQL; `:335-336` builds the key. Read. Verified.
- Auto-close at `check_data_quality.py:407-423`. `sed -n 405,424p` shows the "Auto-close" comment at 407 and the `UPDATE public.checks SET state='done'` at 423. Verified.
- master line numbers 228/233/234/244/248/257-262/289/294/295/305/309/336. grep -n on `master.mts`. Verified.
  - Discrepancy, not a correction of this file: data-roots cites `master.mts:288`, `:287` and `:302` for tourism-tdt, sector-credit and rsw-airport, but grep shows the input_brains lines are `295`, `294` and `309`. This file uses the grep values; data-roots line drift joins P9.
- Committed brain snapshots (refined_at and expires, the tdt headline, the safety conclusion, the RSW April line, the franchise placeholder). grep on `brains/*.md`. Verified as committed snapshots only. Served bytes: could-not-verify (the swfl MCP returned 429).
- `daily-rebuild.yml:141` defaults to master. Read. Verified.
- SBA: 404 for asof-260331, asof-260630 and both dataset pages; the dataset index lists 10 slugs, none of them 7(a) FOIA. curl and crawl4ai. Verified. Pagination beyond page 1 rendered the same 10 slugs, so a 7(a) dataset hidden behind JS pagination is could-not-verify, and the file words it as "no 7(a) FOIA dataset on the crawled index".
- The runner is online, and `SWFL_LOCAL_RUNNER_READY` was set 09/20. gh api and gh variable list. Verified.
- No RSW job exists on fedora; the archive-20260918 RSW capture exists. ssh read-only. Verified.
- Hendry 0 rows in 4 tables. Union count query. Verified. RSW is not county-cut and SBA has no table, so neither was counted.
- Tests: RSW 8 passed, SBA 1 passed, 0 for the other four. pytest, ls and grep. Verified.
- Registry line numbers 1224, 1247, 1268, 1361, 1471, 2341, 1275, 1478, 1480, 2347. grep -n. Verified.
  - Corrections applied in sections 4, 5 and 7 after `sed -n` on the registry. known_drift is `:2344-2347` (was 2345-2348). The FDLE source_ceiling is `:1286-1290` (was 1281-1286 and 1268-1290). The TDT ceiling is `:1241-1245` (was 1239-1243). The sales-tax ceiling is `:1262-1266` (was 1261). The FGCU ceiling is `:1386-1390` (was 1382-1386). The SBA block is `:2330-2365` (was 2330-2372; 2367 starts the AirDNA block).
- tourism-tdt label lines 336, 356, 738 and the caveat 767-769. grep -n. Verified.
- safety-swfl guard `:250-268` and caveat `:442-452`. sed read. Verified.
- rsw `:216` (allow_fallback), `:501` (the call), `:528` (fallback_observed), `:564` and `:569` (capture and dry-run returns). grep -n. Verified.
  - Corrections applied after `grep -n "^def "` on the RSW pipeline. `parse_pdf` is at `:293` (was 338). The discovery fix spans `:175-229` (was 163-229). The crawl_client import is `:238-243` (was 238-241). The run() metric loop is `:499-535` (was 495-531 and 503-521). The sales-tax SKIP is `:315-316` (was 315-317). The FDLE agency loop is `cde.py:132-142` (was 130-142). The log-cron-incident workflow list is `:16-97` (was 16-96).
- FGCU cron `:8`; home-price branch `:186`. grep -n. Verified. `_SIMPLE_RE` at `:61-65`: read. Verified.
- `ingest/requirements.txt:41` pdfplumber. grep -n. Verified.
- Every "[INFERENCE]" tag marks arithmetic or judgment, not a measured value: the Lee 2024 understatement and the TDT trailing-12 understatement. Left as inference on purpose.
- FDLE `--dry-run` read-only claim: could-not-verify. Item 12 says so explicitly.
- Wording corrections applied on re-read, because three sentences overstated the evidence:
  - The opening said no pipeline had advanced "in months", but FGCU advanced to report month 2026-08 on 08/05. It now says "stuck or skipping months".
  - The opening said FGCU "permanently lost" June and July, but P5 shows the PDFs return 200. It now says they are recoverable from the archive PDFs.
  - P2 said April was served "for five months". The earliest evidence of the 2,580-row plateau is 06/14 (registry `:1478`), so it now says "since at least 06/14".
- `contracts.py:447-453` executes the raw SQL after `assert_read_only`. Read. Verified.
- Contract SQL results: tdt 1, sales tax 1, fdle 0, fgcu 1, rsw 1. Re-run in two batches because the first batch timed out after three results. Verified.
- The data-quality check path in production. `select ... from public.checks where check_key like 'contract_fail_%'` finds 1 row ever (created 07/12/2026, dropped 08/12/2026). Open path verified. Auto-close path could-not-verify in production (code read only).
  - Correction applied in section 8: it first asserted open and auto-close as fact. It now separates the proven open path from the code-read auto-close, and adds the never-drop rule from `:405`.
- Correction applied to item 4: the first draft hard-pinned `[self-hosted, swfl-local]` and gave a guessed archive path. It now uses the gated form at `ingest-collier-official-records.yml:31`, guards the capture step for the `ubuntu-latest` fallback, and cites the layout at `research_capture.py:118`.
- Correction applied to item 12: the first draft's rule ("all 12 months non-zero") would drop an agency with a genuine zero month. It is now month-level participation with pro-rating. The Marco Island month probe returned OVER_RATE_LIMIT on DEMO_KEY: could-not-verify.
- Correction applied to item 18: "well inside quota" was unsourced and is deleted.
- Correction applied to section 9: "runs in under a minute" was wrong. Run 35514996047 took 74 seconds (`gh run view --json startedAt,updatedAt`).

## 12. Questions for the operator

- SBA franchise-outcomes: retire it, removing the master edge and the registry block, or do you know where SBA moved the 7(a) FOIA files? Every URL crawled today, and the dataset page, is 404. This is product shape: the brain is a master input that has served a placeholder since 07/03.
- fgcu-reri: keep it as a standalone brain with its own monthly rebuild, or retire `/api/b/fgcu-reri`? It has been expired since 08/11 because master dropped it on 07/18, and the RERI series duplicates primaries we already own. This is product shape.
- Lee TDT provenance: may Lee's served TDT come from the Lee Clerk's own collections PDF (Last-Modified 09/09/2026; its latest month is not yet parsed) instead of DOR Form 3 (frozen since 04/20/2026)? Lee self-administers, so the Clerk is the primary source. It changes the citation on a served number. The same answer settles what to do with the two rows an unknown writer put there on 05/15.
