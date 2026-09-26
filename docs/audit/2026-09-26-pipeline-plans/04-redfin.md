# 04 redfin — pipeline plan (09/26/2026)

Family 04 is the Redfin Data Center monthly files. It is seven pipelines that pull four public S3 CSV families (ZIP housing market, the ZIP seller-stress trio, county housing market, city housing market) into four Tier-1 parquets and three Tier-2 tables. Those feed four leaf brains (housing-swfl, seller-stress-swfl, properties-lee-value, properties-collier-value) plus the desk hero and the metro charts. Verdict: the family works. All seven landed data through 08/31/2026 this cycle, and every leaf brain rebuilt on it between 09/15 and 09/21. Three things need fixing. (1) The seller-stress trio has no content-freshness gate, so a frozen vendor file would re-land green forever. That is the exact 06/02/2026 freeze shape that already bit four siblings. (2) The city sold series has been a 3-month rolling median since the 08/10 retarget, but the desk still labels it "monthly". (3) The checks-and-balances chain misclassifies every guard this family raises as UNKNOWN, routes it to a dead model leg, and posted the 09/15 diagnosis on the wrong issue. No leg in this family needs a model. Nothing needs to move to the Fedora box.

How every number below was produced. SQL goes through a throwaway Bun.SQL runner: a copy of `scripts/apply-fdic-sod-view.mts:10-30` (creds from `.dlt/secrets.toml`) that runs `await sql.unsafe(<query>)` for each query shown, from the repo root. Tier-1 parquets were read with `ingest/.venv/Scripts/python.exe` + duckdb httpfs, S3 creds loaded by `ingest.lib.env_local.load_env_local()` (never printed). Vendor facts came from `curl -sI` / `curl -r 0-4000` against `https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_data_center/<path>`, and from crawl4ai (`C:\Users\ethan\crawl4ai-venv\Scripts\python.exe`) on `https://www.redfin.com/news/data-center/downloads/`. All of it ran 09/26/2026. `graphify query "redfin pipeline"` was run first (227 nodes, truncated to 42).

## 1. Scope

Seven pipelines (count: 7, per `docs/audit/2026-09-26-pipeline-plans/00-FAMILIES.md:31-38`), seven workflow files, seven storage targets.

- redfin_swfl: registry `ingest/cadence_registry.yaml:276`, workflow `.github/workflows/redfin-monthly.yml`, code `ingest/duckdb_pipelines/redfin_swfl/`, target `s3://lake-tier1/market/redfin_swfl.parquet`, consumer `refinery/sources/housing-source.mts:112` feeding pack housing-swfl
- redfin_price_drops: registry `:304`, workflow `redfin-price-drops-monthly.yml`, code `ingest/duckdb_pipelines/redfin_price_drops/`, target `s3://lake-tier1/market/redfin_price_drops.parquet`, consumer `refinery/sources/stress-price-drops-source.mts:30` feeding pack seller-stress-swfl
- redfin_contract_cancellations: registry `:321`, workflow `redfin-contract-cancellations-monthly.yml`, target `.../redfin_contract_cancellations.parquet`, consumer `refinery/sources/stress-cancellations-source.mts` feeding seller-stress-swfl
- redfin_delistings_relistings: registry `:338`, workflow `redfin-delistings-relistings-monthly.yml`, target `.../redfin_delistings_relistings.parquet`, consumer `refinery/sources/stress-delistings-source.mts` feeding seller-stress-swfl
- redfin_collier: registry `:940`, workflow `redfin-collier-monthly.yml`, code `ingest/pipelines/redfin_collier/`, table `data_lake.redfin_collier_market`. Consumers: `refinery/sources/collier-market-source.mts:147` (pack properties-collier-value), `lib/email/market-context.ts:208-214` (direct read, known debt per `_RESEARCH/audits/2026-07-18-data-consolidation/P8-bypass-and-zombie.md:192-200`), and view `realtor_redfin_median_overlap`
- redfin_lee: registry `:962`, workflow `redfin-lee-monthly.yml`, code `ingest/pipelines/redfin_lee/`, table `data_lake.redfin_lee_market`. Consumers: `refinery/sources/lee-market-source.mts:153` (pack properties-lee-value), `lib/email/market-context.ts`, and the same overlap view
- redfin_city_swfl: registry `:984`, workflow `redfin-city-swfl-monthly.yml`, code `ingest/pipelines/redfin_city_swfl/`, table `data_lake.redfin_city_swfl`. Consumers: `lib/desk/loaders.ts:174` (desk hero SOLD anchor), `lib/charts/gallery-loaders.ts:204`, view `data_lake.redfin_metro_sold_pivoted` (`docs/sql/20260718_redfin_metro_sold_pivoted.sql`, read by `app/charts/page.tsx:231`, `lib/charts/gallery-loaders.ts:249` and `app/r/zip-report/[zip]/page-data.ts:52`; `lib/charts/series.ts:18` only names it in a docblock and defines the series keys, it does not read it — corrected by the second Opus), and view `data_lake.realtor_redfin_median_overlap` (read by no lib/app/refinery file — `rg -n realtor_redfin_median_overlap refinery/sources refinery/packs lib app` returns nothing; its only readers are the quality contract `ingest/quality/quality_registry.yaml:555-610` and the doctor)

Master takes all four leaf brains as inputs (`refinery/packs/master.mts:239-251`, `:300-330`). No dark root: 28 non-test lib/app files read the four leaf brains:

```
rg -l -i "seller-stress-swfl|housing-swfl|properties-lee-value|properties-collier-value" lib app --glob '!**/*.test.*' --glob '!**/fixtures/**' | wc -l   # 28
rg -l -i "seller-stress-swfl|housing-swfl|properties-lee-value|properties-collier-value" components --glob '!**/*.test.*' | wc -l   # 3 more (second Opus)
```

No lib/app/components/scripts file reads the four Tier-1 parquets directly (`rg -l "lake-tier1/market/redfin" lib app components scripts --glob '!**/*.test.*'` returns only `scripts/notion-sync.mjs`, a label string). The pack-side REST provenance URLs (`refinery/packs/properties-collier-value.mts:218`, `refinery/packs/properties-lee-value.mts:678`) also filter `property_type=eq.All%20Residential`.

## 2. What is being brought in

Vendor side (verified live 09/26/2026). The downloads page carries "Updated Monthly · Last Updated: Sep 3, 2026" (crawl4ai). Second-Opus re-crawl (`C:\Users\ethan\crawl4ai-venv\Scripts\python.exe` + `AsyncWebCrawler().arun("https://www.redfin.com/news/data-center/downloads/")`, lines containing "pdated"): that dated stamp appears on 2 cards, not on four; 14 cards carry a cadence stamp ("Updated Monthly" 10, "Updated Quarterly" 4). The per-file date is therefore taken from the in-file column below, which covers all six files. The in-file `LAST UPDATED` column reads `"2026-09-03"` on the first data row of all six files we pull (`curl -r 0-4000`). S3 object Last-Modified and size, from `curl -sI`:

- housing_market/monthly/all_zips.csv: Mon, 21 Sep 2026 18:23:22 GMT, 1,332,087,509 bytes
- housing_market/monthly/all_counties.csv: Mon, 21 Sep 2026 18:19:09 GMT, 147,358,373 bytes
- housing_market/monthly/all_cities.csv: Mon, 21 Sep 2026 18:21:42 GMT, 1,125,777,571 bytes
- price_drops/monthly/all_zips.csv: Thu, 17 Sep 2026 11:52:00 GMT, 673,644,316 bytes
- contract_cancellations/monthly/all_zips.csv: Thu, 17 Sep 2026 11:48:17 GMT, 561,785,726 bytes
- delistings_relistings/monthly/all_zips.csv: Thu, 17 Sep 2026 11:49:30 GMT, 664,368,724 bytes
- legacy redfin_market_tracker/county_market_tracker.tsv000.gz: still serves 200 at Tue, 02 Jun 2026 18:16:13 GMT, which is the frozen object the county pair was retargeted off on 09/17

The source still publishes. The 09/21 republish came after our 09/18 and 09/20 pulls. For the fields we store, it changed nothing on Lee or Collier: streaming the live all_counties.csv and diffing it against the lake gave `Lee County, FL {"same":176,"diff":0,"missing":0}` and `Collier County, FL {"same":176,"diff":0,"missing":0}` on median_sale_price, homes_sold and months_of_supply. This is a scratchpad rev.py plus diff.mts run, which is a streaming csv filter on REGION NAME plus the SQL `select period_end::text, median_sale_price, homes_sold, months_of_supply from data_lake.redfin_<county>_market where property_type='All Residential'`. The diff covers only those 3 fields × 352 rows. Nothing wider was checked.

Tier-1 parquets, read with this duckdb query (the `pq.py` scratch script) for each of the four files:

```
SELECT count(*), count(distinct zip_code), min(period_end), max(period_end), max(ingested_at), count(distinct metro) FROM read_parquet('s3://lake-tier1/market/<name>.parquet');
SELECT metro, count(distinct zip_code), count(*) FROM read_parquet(...) GROUP BY 1;
SELECT datediff('day', CAST(period_begin AS DATE), CAST(period_end AS DATE)) d, count(*) FROM read_parquet(...) GROUP BY 1;
```

- redfin_swfl: all 50 vendor columns, mapped as-written (`ingest/duckdb_pipelines/redfin_swfl/pipeline.py:156-220`). ZIP grain, FREQUENCY "Rolling 3 Months" (live header row). 20,592 rows, 126 ZIPs, period_end 2012-03-31 to 2026-08-31, ingested 2026-09-20T04:50:42Z. Window spans are 88–91 days on every row (88:1301, 89:3077, 90:4262, 91:11952). Metro split: Cape Coral, FL metro area 39 ZIPs; Naples, FL metro area 22; North Port, FL metro area 52; Punta Gorda, FL metro area 13. The filter is METRO substring (`ingest/lib/swfl_metros.py:19-24`), not county. Hendry is excluded by design (`swfl_metros.py:13-16`). The North Port and Punta Gorda metros sit outside the Lee+Collier scope. The site audit already flagged this (`_RESEARCH/audits/2026-07-18-site-audit.md:526-532`). Consumers scope it down: seller-stress core scope is Lee+Collier = 57 ZIPs (`refinery/packs/seller-stress-swfl.mts:177`), and housing-swfl serves "55 ZIP snapshots, data through 2026-08-31" (`brains/housing-swfl.md:37`).
- redfin_price_drops: 18 vendor columns (`redfin_price_drops/pipeline.py:113-130`): 5 id columns (PERIOD BEGIN, PERIOD END, FREQUENCY, REGION NAME, METRO), 12 value columns (4 metrics — price drops, average size of drop, percent of actives with a drop, homes sold with a drop — each as level, MoM and YoY) and LAST UPDATED, plus `ingested_at`. Corrected by the second Opus: the first draft said "12 vendor fields plus MoM/YoY". 20,592 rows, 126 ZIPs, period_end 2012-03-31 to 2026-08-31, ingested 2026-09-15T19:58:27Z. Every value column is VARCHAR in the parquet (DESCRIBE), and the consumer casts it (`stress-price-drops-source.mts:9-13`).
- redfin_contract_cancellations: 20,592 rows, 126 ZIPs, same period range, ingested 2026-09-15T20:43:26Z, value columns VARCHAR
- redfin_delistings_relistings: 20,592 rows, 126 ZIPs, same period range, ingested 2026-09-15T21:49:22Z, value columns VARCHAR
- Trio county coverage (second Opus, same pq.py `GROUP BY metro` query on each of the three parquets): each shows the identical split as redfin_swfl — Cape Coral metro 39 ZIPs, Naples metro 22, North Port metro 52, Punta Gorda metro 13 — and 0 Hendry rows (Hendry has no MSA, `ingest/lib/swfl_metros.py:13-16`). The trio lands Lee + Collier plus Charlotte/Sarasota spillover; the pack scopes to the 57 core ZIPs (`refinery/packs/seller-stress-swfl.mts:177`), and the served brain reads "52 ZIPs scored (3 suppressed)" (`brains/seller-stress-swfl.md:39`).
- Real parquet sizes (second Opus, `SELECT sum(total_compressed_size) FROM parquet_metadata(...)`): redfin_swfl 1,298,730 bytes, price_drops 290,046, contract_cancellations 112,771, delistings_relistings 191,213.
- Tier-1 inventory, `select path, vintage::text, byte_size, updated_at::text, source_etag, source_last_modified, max_period_end::text from data_lake._tier1_inventory where path like 'market/redfin%'`: redfin_swfl vintage 2026-09-20, source_last_modified "Sat, 12 Sep 2026 11:50:45 GMT", max_period_end 2026-08-31. The three stress rows have vintage 2026-09-15 with source_etag, source_last_modified and max_period_end all null.

Tier-2 tables. Scope is county- or city-exact on the parsed REGION cell (`redfin_lee/resources.py:93-109`, `redfin_city_swfl/resources.py:112-131`). Ten columns are kept (`_KEEP`, `redfin_lee/resources.py:38-49`). YoY is converted from percent to a fraction at ingest (`:54`).

```
select property_type, count(*)::int n, min(period_end)::text, max(period_end)::text from data_lake.redfin_lee_market group by 1;   -- and _collier_market, redfin_city_swfl (+ count(distinct region))
select schema_name, count(*)::int, max(inserted_at)::text from data_lake._dlt_loads where schema_name in ('redfin_lee','redfin_collier','redfin_city_swfl') group by 1;
select property_type, (period_end - period_begin)::int span_days, count(*)::int from data_lake.redfin_lee_market group by 1,2;
```

- redfin_lee_market: 704 rows total. "All Residential" has 176 rows, 2012-01-31 to 2026-08-31, windows of 27–30 days. That matches the vendor's "Monthly" county FREQUENCY. Four legacy per-type rows (Condo/Co-op, Multi-Family (2-4 Unit), Single Family Residential, Townhouse) have 132 rows each and are frozen at 2026-05-31. The last dlt load was 2026-09-18 17:00:44 UTC (5 loads). Coverage: Lee only.
- redfin_collier_market: 801 rows. "All Residential" has 176 rows, 2012-01-31 to 2026-08-31. The four legacy per-type rows total 625 (157/154/157/157), frozen at 2026-05-31. The last load was 2026-09-18 15:26:43 UTC (4 loads). Coverage: Collier only.
- redfin_city_swfl: 421,130 rows, 183 MB (`pg_total_relation_size`). "All Residential" has 160,594 rows across 952 regions, 2012-01-31 to 2026-08-31. Four legacy per-type classes hold 260,536 rows, all frozen at or before 2026-05-31. Region check: 0 rows outside ", FL". 917 regions have a 2026-08-31 All Residential row. The last load was 2026-09-18 17:29:38 UTC (5 loads). Hendry is covered at city grain: LaBelle, FL has 175 All Residential rows and Clewiston, FL has 176, both through 2026-08-31.
- Latest served values (All Residential, period_end 2026-08-31): Lee median_sale_price 358,799, yoy 0.005, homes_sold 1,678. Collier 617,932, yoy 0.004, homes_sold 724. Cape Coral 379,749, Fort Myers 324,785, Naples 1,204,203.

Cadence: all seven are monthly. The crons run on the 15th (13:00, 17:00, 18:00, 19:00 UTC) for the four ZIP files and on the 18th (12:00, 13:00, 14:00 UTC) for county and city (the seven YAMLs, `cron:` lines).

## 3. What is working

Runs (`gh run list --workflow <file> --limit 15 --json databaseId,status,conclusion,createdAt,event`):

- redfin-monthly.yml: 9 runs listed, 6 green / 3 red / 0 cancelled. Newest green is 35490122939 (09/20, workflow_dispatch; the SESSION_LOG records "rows loaded: 20,592 across 126 ZIP codes"). Newest scheduled green is 31887155897 (08/15). Newest red is 35001233771 (09/15, schema drift, see P4). The two 05/26 reds are the old checkout@v6 incident, resolved (`docs/cron-rebuild-failures.md:59`).
- redfin-price-drops-monthly.yml: 5 runs, 5 green, newest 35016641291 (09/15)
- redfin-contract-cancellations-monthly.yml: 5 runs, 5 green, newest 35021255288 (09/15)
- redfin-delistings-relistings-monthly.yml: 5 runs, 5 green, newest 35027654368 (09/15)
- redfin-lee-monthly.yml: 8 runs, 6 green / 1 red / 1 cancelled. Newest green is 35371707779 (09/18, schedule). The red is 32144353358 (08/18): `ContentStaleError: [content-guard] redfin_lee: newest content date 2026-05-31 is 79d old (> 55d max)`, which the classifier maps to CONTENT_STALE. That was the guard working on the frozen legacy object. The cancel is 35302343815, a 09/18 dispatch superseded one minute later by green 35302434655.
- redfin-collier-monthly.yml: 6 runs, 3 green / 2 red / 1 cancelled. Newest green is 35362346844 (09/18, schedule). Reds are 32136507622 (08/18, same ContentStaleError) and 29645074782 (07/18, `psycopg2.OperationalError: ... port 5432 failed: timeout expired`).
- redfin-city-swfl-monthly.yml: 4 runs, 4 green, newest 35374031365 (09/18)
- Wall clock of the newest green per workflow (`gh run view <id> --json createdAt,updatedAt`): swfl 1m24s, price drops 1m24s, cancellations 1m23s, delistings 1m20s, lee 1m07s, collier 1m06s, city 6m24s. The timeout ceilings are 30 / 30 / 30 / 30 / 30 / 30 / 45 minutes.

Guards that exist and fired correctly:

- redfin_swfl has a content gate at 40d (`pipeline.py:61`, `:227-233`) and a MIN_ROWS floor (`:54`). Its SQL column references fail loudly on a vendor rename, and did on 09/15. It also has a SOURCE-UNCHANGED ETag note (`:93-113`).
- redfin_lee, redfin_collier and redfin_city_swfl each have a header staleness tripwire at 35d (`redfin_lee/resources.py:197-201`, commit 77032240), a header-has-columns guard (`:137`, commit 6c077dae), and a content gate at 55d (`:215-216`). Lee and Collier add a per-run MIN_ROWS 150 floor (`redfin_lee/constants.py:41`, `resources.py:204-211`). City adds a desk-hero landing guard (`redfin_city_swfl/resources.py:242-245`) and twin-row dedupe (`:178-196`).
- The 08/18 Lee/Collier reds were caught by these guards and fixed by the 09/17 retarget (c6be4669). The 09/15 swfl red was fixed by e2a0dfb2 and proven green by dispatch 35490122939.

Tests. The 33 pytest cases pass:

```
ingest/.venv/Scripts/python.exe -m pytest -q ingest/tests/pipelines/redfin_city_swfl ingest/tests/pipelines/redfin_collier ingest/tests/pipelines/redfin_lee ingest/tests/pipelines/test_redfin_siblings_renamed_column.py ingest/duckdb_pipelines/redfin_swfl ingest/duckdb_pipelines/redfin_price_drops ingest/duckdb_pipelines/redfin_contract_cancellations ingest/duckdb_pipelines/redfin_delistings_relistings -p no:cacheprovider
# 33 passed in 1.47s
```

Per file (`--collect-only`): the stress trio has 1 each (a dry-run test only). redfin_swfl has 1 dry-run test plus 6 mapping tests, city 8, collier 6, lee 6, and the siblings-renamed-column test 3. Pack tests: `bun test refinery/packs/seller-stress-swfl.test.mts refinery/packs/properties-lee-value.test.mts refinery/packs/properties-collier-value.test.mts` gives 53 pass / 0 fail, and `bun test refinery/packs/housing-swfl.test.mts` gives 15 pass / 0 fail.

Downstream freshness. The `refined_at` frontmatter line 5 of each brain reads housing-swfl 2026-09-21T10:23:26Z, seller-stress-swfl 2026-09-15T23:58:18Z, properties-lee-value 2026-09-19T04:26:15Z and properties-collier-value 2026-09-18T04:26:28Z. Lee and Collier carry 2026-08-31 periods (`brains/properties-lee-value.md:51`, `brains/properties-collier-value.md:40`). So the leaves did rebuild on this cycle's data, even though the brief says daily-rebuild is stalled. Master: `brains/master.md:5` reads `refined_at: 2026-08-14T04:30:21Z`. That 08/14 date is verified. The brief's "08/19" needs review. Either way master has not absorbed this cycle.

Cross-vendor sanity. The overlap view is live and agrees: `select * from data_lake.realtor_redfin_median_overlap` gives delta_pct Cape Coral -1.3, Fort Myers 2.5, Lee 0.3, Collier 2.4, and Naples -48.6 (the documented definitional split, `ingest/quality/quality_registry.yaml:547-551`). The contract SQL at `quality_registry.yaml:563-610`, run live, returns B1 mismatch 0, B3 coverage 0 and B2 Naples watch 1. The B2 watch is warn-only and designed to stay non-zero. The doctor's FAIL on that view is therefore B2 by design, not a broken decision surface. The switch of the city series to 3-month windows did not break agreement.

Registry identity. `bun ingest/tools/check-registry-identity.mts --live` shows no RED for any of the seven, only `action_major_behind` WARNs.

## 4. Problems

P1. The seller-stress trio is blind to a frozen source.
- Symptom: the three inventory rows show `source_etag: null, source_last_modified: null, max_period_end: null` (query in §2). The only guard is `if row_count == 0: ... sys.exit(1)` (`ingest/duckdb_pipelines/redfin_price_drops/pipeline.py:142-144`; the same check sits at `redfin_contract_cancellations/pipeline.py:134` and `redfin_delistings_relistings/pipeline.py:142`, per `grep -n "row_count == 0"`, and none of the three files calls `assert_` or passes `max_period_end`). The daily probe reads only `_tier1_inventory.updated_at` for tier-1 (`ingest/cadence_registry.yaml:14-16`), and that value advances on every run.
- Root cause: the trio was built 06/14 (f326752b), before the 07/05 content-guard pass (cdf97542) and the 07/17 swfl retarget. The 09/20 header arm (77032240) was wired into Lee, Collier and City only.
- Severity: blocks a served number. If Redfin freezes these objects the way it froze the legacy dumps on 06/02 (`cadence_registry.yaml:284-292`), seller-stress-swfl keeps serving the old window with green crons.
- First seen: 06/14/2026 (build). The exposure is still open today.

P2. The city sold series is labeled "monthly" but is a 3-month rolling median.
- Symptom: the live header row of all_cities.csv reads `"2026-09-03","Rolling 3 Months","2026-06-01","2026-08-31",...`. In the lake, every cape_coral All Residential row spans 88–91 days (`select property_type, (period_end - period_begin)::int, count(*) from data_lake.redfin_city_swfl where area='cape_coral' group by 1,2`: 88:11, 89:26, 90:36, 91:101). Meanwhile the served text reads "Closed-sale median (monthly)" (`lib/desk/loaders.ts:619`) and "— monthly" (`app/desk/_components/DeskHero.tsx:378`). The code comments at `lib/desk/loaders.ts:125` and `lib/charts/gallery-loaders.ts:171`, and the view header at `docs/sql/20260718_redfin_metro_sold_pivoted.sql:3`, say the same. Before the retarget the city rows were monthly: the leftover legacy per-type rows span 27–30 days in the same query.
- Root cause: the 08/10 retarget (9b020426) moved to housing_market/monthly/all_cities.csv, which is "monthly" in path only. The county file is truly "Monthly" (live header). The merge rewrote every hero-city history row, so the series shows no visible break.
- Scope, second Opus (RULE 0.5c; `rg -n "monthly" lib/desk/loaders.ts app/desk/_components/DeskHero.tsx lib/charts/gallery-loaders.ts lib/charts/series.ts app/charts/page.tsx`): the first draft named 2 served sites; there are 5 on the city sold path, all in the desk. `lib/desk/loaders.ts:619` (label "Closed-sale median (monthly)"), `:652` (rebase windowNote "`${n}` monthly closed-sale medians per city since…"), `:778` (deltaNote "vs. MM/YYYY (monthly)"), `:827` (hero windowNote, same wording as :652) and `app/desk/_components/DeskHero.tsx:378`. The `:778` deltaNote is worse than a label: it presents the gap between two overlapping 3-month windows (Jun–Aug vs May–Jul, 2 of 3 months shared) as a month-over-month change. `:868` is the ZHVI fallback path and is correctly monthly. The docs root also says it: `docs/standards/data-roots.md:515` "monthly city-grain SOLD price".
- Severity: blocks a served number, meaning its label and its delta caption, on the desk hero. Corrected by the second Opus: the first draft said the /charts metro line also states the wrong window. It does not. The /charts panel is titled "Median Sale Price" with subtitle "Cape Coral · Fort Myers · Naples (city)" (`lib/charts/gallery-loaders.ts:240-249`) and states no window.
- First seen: 08/10/2026 local (run 31448652778, created 2026-08-11T01:13:46Z; retarget commit 9b020426 dated 2026-08-10 13:11 -0400).

P3. Frozen and mixed-window rows are left inside the three Tier-2 tables.
- Symptom: Lee has 528 and Collier 625 per-type rows frozen at 2026-05-31. City has 260,536 per-type rows frozen at or before 2026-05-31, plus 1,355 short-window (under 60 day) All Residential rows in 694 regions, spanning 2012-01-31 to 2025-09-30, mixed into the 3-month series. The query is `select count(*), count(distinct region), min(period_end), max(period_end) from data_lake.redfin_city_swfl where property_type='All Residential' and (period_end - period_begin) < 60`.
- Root cause: dlt `merge` on PK (region, period_end, property_type) (`redfin_lee/resources.py:159-163`) never deletes keys the new feed stopped emitting.
- Severity: cosmetic today. Every reader filters `property_type = 'All Residential'`: `lee-market-source.mts:153`, `collier-market-source.mts:147`, `lib/email/market-context.ts:213`, `lib/desk/loaders.ts:176`, `lib/charts/gallery-loaders.ts:206`, and both views. The hero trio has no short-window rows (the cape_coral span query above shows only 88–91 day spans). It becomes a served error the first time a consumer reads a per-type row or a non-hero city.
- First seen: 08/10/2026 (city) and 09/17/2026 (county, c6be4669).

P4. The 09/15 schema-drift red is resolved, but its check stays open.
- Symptom: run 35001233771: `_duckdb.BinderException: Binder Error: Referenced column "MEDIAN DAYS ON MARKET MOM (%)" not found in FROM clause!`. Check `cron_incident_redfin_monthly` is open ("11d untouched", `node scripts/check.mjs list`).
- Root cause: vendor relabel from (%) to (DAYS). Fixed at `redfin_swfl/pipeline.py:181-182` (e2a0dfb2) and proven green by 35490122939. Auto-resolve only fires on a scheduled green (`.github/scripts/log-cron-incident.mjs:131`), and the next scheduled run is 10/15.
- Severity: cosmetic (ledger noise).
- First seen: 09/15/2026.

P5. The failure classifier cannot name any guard this family raises.
- Symptom: `node -e "import('./.github/scripts/classify-cron-failure.mjs').then(m=>console.log(m.classify(<text>).klass))"` returns UNKNOWN for the BinderException line, for `ingest.lib.guards.ContentContractError: redfin_lee: header is missing ...`, for `ingest.lib.guards.VolumeGuardError: redfin_lee: returned 3 rows, below MIN_ROWS=150`, and for `psycopg2.OperationalError: ... timeout expired`. Only `ContentStaleError` classifies (CONTENT_STALE, `:157`). The real 09/15 log tail also classifies UNKNOWN.
- Root cause: the SCHEMA_DRIFT regex covers Postgres wording only (`.github/scripts/classify-cron-failure.mjs:119-121`), with no DuckDB binder pattern and no guard class names. UNKNOWN sets `needsLlm` true (`:261-263`), which routes the failure to the model leg in P12.
- Severity: blocks a consumer, where the consumer is the incident chain. Every red in this family arrives unclassified.
- First seen: 07/18/2026 (issue #135, "UNKNOWN" for a psycopg timeout) and 09/15/2026.

P6. The incident-issue dedupe is fuzzy and misroutes.
- Symptom: the 09/15 logger run 35001370945 printed `incident issue already open for redfin-monthly; not duplicating`, but no redfin-monthly issue existed. The heal run 35001370894 then printed `L2: posted diagnosis on issue #183`, which is the redfin-lee CONTENT_STALE issue.
- Root cause: `gh issue list --label "cron-failure" --state open --search "[cron-failure:redfin-monthly] in:title"` (`log-cron-incident.mjs:222-227`) is a tokenized search. It matched the open `[cron-failure:redfin-lee-monthly]` title, which contains every token. The same query today returns `[]`. Scope: the same search string appears at 3 sites (`grep -n 'in:title' .github/scripts/*.mjs`). They are the dedupe (`log-cron-incident.mjs:224`), the auto-close (`log-cron-incident.mjs:286`) and the heal comment target (`heal-cron-failure.mjs:322`). The auto-close site can therefore close a sibling's issue: a scheduled green of one Redfin workflow can close another Redfin workflow's open issue.
- It already did (second Opus): `gh issue view 135 --json comments` shows the Collier incident issue #135 (`[cron-failure:redfin-collier-monthly] UNKNOWN`, 07/18) closed at 2026-08-15T13:27:00Z with "Auto-resolved: next scheduled run succeeded .../actions/runs/31887155897". Run 31887155897 is redfin-monthly (ZIP), not Collier. Collier's own next run, 32136507622 on 08/18, was red. The same tokenized search today, `gh issue list --label cron-failure --state closed --search "[cron-failure:redfin-monthly] in:title"`, returns #183 (Lee), #182 (Collier) and #135 (Collier) and no redfin-monthly issue.
- Severity: cosmetic for data. For checks-and-balances it means a wrong issue, a hidden incident, a misfiled diagnosis, and a proven wrong close.
- First seen: 08/15/2026 (the #135 wrong close). Corrected by the second Opus from 09/15/2026.

P7. The DOM-unit check is fixed but still open.
- Symptom: `redfin_dom_yoy_unit_days_not_pct` is open ("6d untouched"). The consumer now maps `median_dom_yoy_days: toNum(raw.median_dom_yoy_pct)` with no ÷100 (`refinery/sources/housing-source.mts:100`, commit 992beef9 09/20). The served brain carries day deltas (`brains/housing-swfl.md:246` `"median_dom_yoy_days": -3`; 54 occurrences). `_ASSISTANT/SCRATCHPAD.md:34-35` says close it "when REST is up", and REST is up today.
- Severity: cosmetic (ledger noise).
- First seen: opened 09/20/2026.

P8. redfin_swfl's volume floor is stale.
- Symptom: `MIN_ROWS = 6_000` (`redfin_swfl/pipeline.py:54`), where the comment dates the value to a 10,072-row pull. Live healthy pulls are 20,592 rows (§2), so a pull truncated by 70% still passes.
- Root cause: the source now carries history back to 2012-03-31. The registry still says "since 2019" (`cadence_registry.yaml:297`).
- Severity: blocks a served number (potential: a truncated pull is served as whole).
- First seen: 08/15/2026. Corrected by the second Opus from 09/20/2026. `gh run view 31887155897 --log | grep -o "rows loaded: [0-9,]* across [0-9]* ZIP codes"` prints "rows loaded: 20,474 across 126 ZIP codes", so the floor was already under 30% of a healthy pull on the 08/15 scheduled run. The 07/15 run 29424896137 printed "rows loaded: 67,536 across 124 ZIP codes", which was the legacy feed before the 07/16 retarget.

P9. Registry and docs carry stale numbers and one false alarm.
- confirmed_total 10,072 (`cadence_registry.yaml:295`), 9,955 ×3 (`:317`, `:334`, `:351`), 782 (`:958`) and 660 (`:980`). Live counts are 20,592 / 20,592 / 801 / 704.
- File-size comments: "~660 MB" at `redfin-monthly.yml:8`, `redfin_swfl/pipeline.py:10` and `cadence_registry.yaml:288`; "333 MB" at `cadence_registry.yaml:312`, "278 MB" at `cadence_registry.yaml:329`, "328 MB" at `cadence_registry.yaml:346`; "~536 MB" at `redfin_city_swfl/constants.py:30` and `cadence_registry.yaml:1003`. Live sizes are in §2. (Second Opus: the first draft left the three registry lines unqualified and missed :288 and :1003.)
- Stale code comment: `ingest/duckdb_pipelines/redfin_swfl/pipeline.py:178-180` still says the consumer's ÷100 "was always wrong — fixing that is a consumer-side change". That fix landed in 992beef9 (09/20).
- `docs/standards/data-inventory.md:72` still says redfin_city_swfl is "pack=none, landed & unread". `wiki/pipeline-census.md:60-62` still calls the 09/15 break "unresolved".
- `.github/workflows/ci.yml:96` says redfin_city_swfl is "genuinely RED" in registry identity. The live run shows only a WARN.
- Severity: cosmetic, but this class of error already cost a session (the correction note at `cadence_registry.yaml:299`).
- First seen: 07/30/2026 and later.

P10. The inventory byte_size field is one column chunk.
- Symptom: `_tier1_inventory.byte_size` reads 893 for price_drops. `SELECT sum(total_compressed_size) FROM parquet_metadata(...)` returns 290,046 for the same file, and redfin_swfl reads 609 against 1,298,730.
- Root cause: `SELECT total_compressed_size FROM parquet_metadata('{target}') LIMIT 1` (`redfin_swfl/pipeline.py:282-284`; `redfin_price_drops/pipeline.py:150-152` and its two siblings).
- Severity: cosmetic (ops size figures).
- First seen: 06/14/2026 (build).

P11. The doctor paints all seven yellow every day.
- Symptom: doctor run 36259690113 (09/26) shows each of the seven as `FRESH | ... | NO_CONTRACT | NO_RUNS_IN_WINDOW | 🟡 yellow`. NO_CONTRACT contributes green (`ingest/scripts/doctor.py:137-141`), so the yellow comes from NO_RUNS_IN_WINDOW (`:157`).
- Root cause: verified by reconstruction (second Opus; the first draft had it as could-not-verify). `collect_gh` reads a 500-run window, then backfills at most 40 workflows (`doctor.py:516-547`). The backfill list covers every workflow `fetch_workflows(limit=200)` returns (`ingest/lib/gh_runs.py` `summarize_runs` loops `workflows_by_file`), and `workflows_needing_backfill` returns it `sorted(...)` (`gh_runs.py:194-199`). Reconstruction on 09/26:
  ```
  gh workflow list --all --limit 200 --json id,path,state          # 115 workflows
  gh run list --limit 500 --json workflowDatabaseId,createdAt       # 44 distinct workflows; oldest run 2026-09-21T01:14:13Z
  # workflows with zero runs in the window: 71 (67 active); sorted by file name, the 40th is leepa-parcels-annual.yml
  # and the seven redfin-*.yml files sit at positions 53-59
  ```
  The cap plus the alphabetical order means the seven never get a backfill call, so they stay NO_RUNS_IN_WINDOW. The window I rebuilt is a few hours older than the doctor's own (run at 17:37Z), so positions can shift by a few, but not by 13.
- Severity: cosmetic (noise that buries real yellows).
- First seen: at least 09/26/2026.

P12. The heal-chain model leg fires on this family's reds and is dead.
- Symptom: heal run 35001370894 printed `triage: class=UNKNOWN should_retry=false needs_llm=true` and then `Haiku diagnosis failed (non-fatal): 400 ... credit balance is too low ...`.
- Root cause: `.github/scripts/heal-cron-failure.mjs:213-238` calls `client.messages.create` with `ANTHROPIC_API_KEY` for UNKNOWN / SCHEMA_DRIFT / DATA_EMPTY. The workflow listens to all seven Redfin workflows (`.github/workflows/heal-cron-failure.yml:60-66`).
- Severity: cosmetic for data. It is a dead leg in the balance chain (see §10).
- First seen: 09/15/2026 (for this family).

P13. The seller-stress brain dates its window by its start.
- Symptom: `brains/seller-stress-swfl.md:39` reads "latest period = 2026-06-01" for the Jun–Aug window ending 2026-08-31. The pack keys on `period_begin` (`stress-price-drops-source.mts:37`).
- Severity: cosmetic. A reader takes it as June data. The consumer-side as-of rule is already documented (`_RESEARCH/audits/2026-07-18-site-audit.md:519-522`).
- First seen: 06/14/2026.

P14. The workflows pin Python 3.13 while the repo pins 3.12.
- Symptom: `python-version: "3.13"` in all seven YAMLs, against the repo pin in `ingest/CLAUDE.md` (3.12 at `.python-version`).
- Severity: cosmetic. No crawl4ai is used here and every run is green.
- First seen: 05/26/2026 (47318490). Corrected by the second Opus. `git log -S'python-version: "3.13"' -- .github/workflows/redfin-monthly.yml` returns 47318490 (05/26). 245b2364 (06/08) only bumped `actions/setup-python@v5` → `@v6`.

P15. Served provenance text still says "TSV" after the 09/17 CSV retarget (second Opus, new).
- Symptom: `grep -c "free public TSV" brains/properties-lee-value.md brains/properties-collier-value.md` returns 5 and 5. The source has been `housing_market/monthly/all_counties.csv`, a plain CSV, since c6be4669 (09/17).
- Root cause: citation strings at `refinery/packs/properties-lee-value.mts:684`, `refinery/packs/properties-collier-value.mts:223`, `refinery/sources/lee-market-source.mts:207` and `refinery/sources/collier-market-source.mts:204` were not touched by the retarget.
- Severity: cosmetic (served provenance names the wrong file format; the numbers are right).
- First seen: 09/18/2026 (first brain rebuild after the retarget; `sed -n 5p brains/properties-collier-value.md` reads refined_at 2026-09-18T04:26:28Z).

## 5. What is missing

- Hendry County market rows. The live all_counties.csv carries 176 "Hendry County, FL" rows (rev.py Counter). We pull 0. Scope names Hendry (12051) as a minor addition (root `CLAUDE.md` SCOPE). City grain already covers it: LaBelle has 175 rows and Clewiston 176, both through 2026-08-31, with no reader.
- Property-type split at county grain. property_types/monthly/all_counties.csv exists: FREQUENCY "Monthly", 385,414,872 bytes, Last-Modified 09/21/2026 (curl). The domain rules say condos and single-family homes are different markets (`memory: project_real-estate-domain-rules`). Our per-type county rows are frozen at 05/31 and no consumer asks for them today.
- A true monthly sold median near the hero cities. housing_market/monthly/all_metros.csv is FREQUENCY "Monthly" and 45,892,377 bytes (curl). It is the only monthly-cadence option for the desk. City grain has no monthly file: property_types/monthly/all_cities.csv is also "Rolling 3 Months" (curl header).
- County-grain seller stress. price_drops/monthly/all_counties.csv exists (73,862,793 bytes, Last-Modified 09/17/2026). Second Opus filled the unchecked two with `curl -sI`: contract_cancellations/monthly/all_counties.csv is 200, 61,940,213 bytes, Last-Modified Thu, 17 Sep 2026 11:46:29 GMT, and delistings_relistings/monthly/all_counties.csv is 200, 73,393,223 bytes, Last-Modified Thu, 17 Sep 2026 11:48:20 GMT. All three county stress files exist. The lake holds seller stress at ZIP grain only, and a county file would also give Hendry a stress read (the ZIP files carry 0 Hendry rows, §2).
- Registry source_ceiling blocks. The stress trio, redfin_lee and redfin_collier have none (`cadence_registry.yaml:304-353`, `:940-982`). The downloads page shows 14 dataset cards with update stamps (crawl4ai), which means a real ceiling exists and is unrecorded. None of these entries carries a source-period field either, which is the open check `registry_source_ceiling_no_freshness_field`.
- A content contract. None of the three Tier-2 tables appears in `ingest/quality/quality_registry.yaml` (grep `redfin` matches only the overlap view at `:531-610`).
- Consumers that should exist: none are required. There is no dark root in this family (§1). The city table's other 949 FL regions (952 All Residential regions minus the 3 hero cities, region count query in §2) are read by nobody (`wiki/pipeline-census.md:122`), by design (`redfin_city_swfl/constants.py:5-8`, operator directive 07/12).

## 6. Verdict per pipeline

- redfin_swfl: IMPROVE. All guards exist, but the volume floor covers only 29% of a healthy pull (6,000 / 20,592, P8). The verdict flips to REPAIR if the 10/15 scheduled run is red, and to GOOD ENOUGH once MIN_ROWS ≥ 18,000.
- redfin_price_drops: IMPROVE. The data is correct through 08/31, but a frozen source would pass silently (P1). The number that changes it: `_tier1_inventory.max_period_end` non-null and ≤ 40 days old on every green run.
- redfin_contract_cancellations: IMPROVE, for the same reason and with the same number (P1).
- redfin_delistings_relistings: IMPROVE, for the same reason and with the same number (P1).
- redfin_collier: GOOD ENOUGH. It is fully guarded, the 176 served rows match the live 09/21 file 176/176, and it is fresh to 08/31. It flips to REPAIR if any reader of `property_type <> 'All Residential'` appears (count today: 0) or if the newest period_end exceeds 55 days.
- redfin_lee: GOOD ENOUGH, for the same reasons and with the same number.
- redfin_city_swfl: REPAIR. The served "monthly" label is wrong (P2). It flips to GOOD ENOUGH once none of the 5 served sites (`lib/desk/loaders.ts:619, :652, :778, :827` and `app/desk/_components/DeskHero.tsx:378`, widened by the second Opus) describes this series as monthly; item 4's proof command counts them. That remains true while all_cities.csv FREQUENCY stays "Rolling 3 Months".

## 7. The plan

Items are ordered by what unblocks the most. Every lane is D (deterministic). No item needs a model.

1. DO. Close the two ledger rows that are already fixed (P4, P7).
   - What:
     ```
     node scripts/check.mjs close redfin_dom_yoy_unit_days_not_pct --evidence "992beef9 09/20; housing-source.mts:100 maps median_dom_yoy_days with no /100; brains/housing-swfl.md:246 serves -3 days (refined 09/21)"
     node scripts/check.mjs close cron_incident_redfin_monthly --evidence "root cause fixed e2a0dfb2; dispatch 35490122939 green 09/20, rows 20,592; next scheduled 10/15"
     ```
   - Where: the `public.checks` ledger. Lane D (interactive session). Effort S.
   - Proof: `node scripts/check.mjs list | grep -c redfin` returns 0.
   - Unblocks: ledger truth. If the 10/15 run reds, the logger's reopen path recreates the check (`log-cron-incident.mjs:152-156`).

2. DO. Give the stress trio the same guards redfin_swfl has (P1).
   - What: in each `pipeline.py`, after the row count (`redfin_price_drops/pipeline.py:136-144` and the siblings), replace the `== 0` check with `assert_min_rows(row_count, 18_000, label=...)` and `assert_content_fresh(MAX(period_end), 40, label=...)` from `ingest.lib.guards`. The swfl pattern is at `redfin_swfl/pipeline.py:223-233`. Also pass `max_period_end=` and the HEAD's `source_etag` / `source_last_modified` into `upsert_inventory_row`, which already accepts them (`ingest/lib/tier1_inventory.py:80-81`).
   - The 40d gate matches redfin_swfl's reasoning at `:56-61`: a normal run on 10/15 sees a 15-day-old window (10/15 vs 09/30), and one missed cycle puts it at 45 days (10/15 vs 08/31).
   - History says the new month is out by the 15th. The brains in git advanced one window after every 15th run that was followed by a rebuild. seller-stress-swfl went "latest period = 2026-03-01" on 06/14, then 2026-04-01 on 07/18, then 2026-06-01 on 09/15. housing-swfl went "data through 2026-06-30" on 07/17, then 2026-07-31 on 09/15 (the 08/15 pull; the 09/15 run was the schema red), then 2026-08-31 on 09/20. Command: `git log --format='%h %ad' --date=short -- brains/<id>.md` then `git show <sha>:brains/<id>.md | grep -o -E "latest period = [0-9-]*|data through [0-9-]*"`. The margin is thin: this cycle's ZIP object was stamped 09/12. If a CONTENT_STALE red ever clears on a dispatch within days, move the cron to the 18th like the county and city jobs.
   - Side finding: seller-stress-swfl had no rebuild between 07/18 and 09/15 (same log), so it served the Apr–Jun window for about two months. That staleness came from the rebuild stall, not from ingest.
   - Add one pytest per pipeline modeled on `redfin_swfl/test_pipeline_mapping.py`.
   - Where: `ingest/duckdb_pipelines/redfin_{price_drops,contract_cancellations,delistings_relistings}/pipeline.py`. Lane D. Effort S.
   - Proof: the pytest command in §3 shows 3 new passing tests. After 10/15, `select path, max_period_end from data_lake._tier1_inventory where path like 'market/redfin_%'` shows no nulls.
   - Unblocks: the trio's verdict flips to GOOD ENOUGH, and each gets a real signal in §8.

3. DO. Raise redfin_swfl's floor (P8).
   - What: `MIN_ROWS = 18_000` at `redfin_swfl/pipeline.py:54` (18,000 / 20,592 = 87%). Update the comment and the registry text "since 2019" (`cadence_registry.yaml:297`).
   - Lane D. Effort S.
   - Proof: `pytest -q ingest/duckdb_pipelines/redfin_swfl` is green, and the 10/15 log shows `rows loaded:` ≥ 18,000.
   - Unblocks: the redfin_swfl verdict.

4. DO. Fix the city label (P2), all 5 served sites in one pass (widened by the second Opus from 2).
   - What: `lib/desk/loaders.ts:619` becomes "Closed-sale median (3-month rolling)". `:652` and `:827` windowNotes become "`${n}` rolling 3-month closed-sale medians per city since…". `:778` deltaNote becomes "vs. prior 3-month window ending MM/YYYY" (the two windows overlap, so it is not a month-over-month change). `app/desk/_components/DeskHero.tsx:378` "— monthly" becomes "— 3-month rolling". Leave `:868` alone (ZHVI path, correctly monthly).
   - Coupled edit, do not miss it: `app/desk/_components/DeskHero.tsx:438` branches on `hero.windowNote.toLowerCase().includes("monthly")` to pick the "% since start" caption. Rewording the windowNotes flips that caption to "day 0" unless line 438 is changed in the same edit (test for the new wording, or better, carry an explicit field on the hero instead of string-sniffing).
   - Correct the comments at `lib/desk/loaders.ts:125-126`, `lib/charts/gallery-loaders.ts:171` and `docs/sql/20260718_redfin_metro_sold_pivoted.sql:3`, the city registry summary (`cadence_registry.yaml:1011`, which says "Monthly true-sold median") and `docs/standards/data-roots.md:515` ("monthly city-grain SOLD price").
   - Lane D. Effort S.
   - Proof: `rg -n "median \(monthly\)|— monthly|monthly closed-sale|\(monthly\)" lib/desk app/desk` returns only the ZHVI deltaNote at `lib/desk/loaders.ts:868`, then `bunx next build` and render /desk (the verify skill), checking that the "% since start" caption still reads "Change since the window opened".
   - Unblocks: the city verdict moves to GOOD ENOUGH. A truly monthly line would need the metro file, which is item 11.

5. DO (shared file; coordinate with whoever owns the incident chain). Teach the classifier this family's failure shapes (P5).
   - What: add to `.github/scripts/classify-cron-failure.mjs`:
     - `Binder Error: Referenced column "…" not found` and `ContentContractError` → SCHEMA_DRIFT
     - `VolumeGuardError` → DATA_EMPTY
     - `psycopg2.OperationalError[^\n]*timeout expired` → TRANSIENT
   - Each suggestedAction names the guard.
   - Lane D. Effort S.
   - Proof: the `node -e` classify commands in P5 print SCHEMA_DRIFT / SCHEMA_DRIFT / DATA_EMPTY / TRANSIENT, plus new cases in `.github/scripts/classify-cron-failure.test.mjs`.
   - Unblocks: correct classes on the check rows. It does not by itself stop the model call (see §10).

6. DO. Refresh the registry truth (P9) and add the content-age backstop.
   - What:
     - Update `confirmed_total` to the live counts with as_of 09/26/2026, and fix the file-size comments.
     - Add `freshness_table: data_lake.redfin_<x>` plus `freshness_column: period_end` to `redfin_lee` (`:962`), `redfin_collier` (`:940`) and `redfin_city_swfl` (`:984`). The daily probe then ages CONTENT, not load time; the resolution order puts freshness_table first (`ingest/scripts/check_freshness.py:251-272`). At 31d × 2.0 = 62d, a healthy month peaks at 47 days (10/17 vs 08/31) and one missed cycle peaks at 78 days (11/17 vs 08/31).
     - Add source_ceiling blocks for the trio, Lee and Collier naming the unpulled files from §5.
     - Fix `docs/standards/data-inventory.md:72-74`, `wiki/pipeline-census.md:60-62,73-75` and the stale `.github/workflows/ci.yml:96` comment.
     - Fix the served "free public TSV" provenance (P15) at `refinery/packs/properties-lee-value.mts:684`, `refinery/packs/properties-collier-value.mts:223`, `refinery/sources/lee-market-source.mts:207` and `refinery/sources/collier-market-source.mts:204`, and the stale comment at `redfin_swfl/pipeline.py:178-180` (second Opus). Proof for this sub-item: `rg -n "public TSV" refinery` returns nothing, and after the next leaf rebuild `grep -c "free public TSV" brains/properties-lee-value.md` returns 0.
   - Lane D. Effort S.
   - Proof: `ingest/.venv/Scripts/python.exe -m pytest -q ingest/tests/test_cadence_registry_spine.py`, `bun ingest/tools/check-registry-identity.mts --static`, then the next doctor run showing these three as FRESH off period_end.
   - Unblocks: the §8 backstop, and stops future sessions re-deriving stale counts.

7. DO. Fix the inventory byte_size (P10).
   - What: `SELECT sum(total_compressed_size) FROM parquet_metadata(...)` in the four Tier-1 pipelines (`redfin_swfl/pipeline.py:282-284`, `redfin_price_drops/pipeline.py:150-152` and siblings).
   - Lane D. Effort S.
   - Proof: after 10/15, `select path, byte_size from data_lake._tier1_inventory where path like 'market/redfin_%'` shows six-figure-plus values.
   - Unblocks: correct /ops size figures.

8. DO (shared files). Make the incident-issue lookup exact at all 3 sites (P6).
   - What: at `log-cron-incident.mjs:224` (dedupe), `log-cron-incident.mjs:286` (auto-close) and `heal-cron-failure.mjs:322` (comment target), ask for `--json number,title --limit 50` and keep only titles that `startsWith(INCIDENT_TAG)`, instead of trusting the tokenized search's first hit.
   - Lane D. Effort S.
   - Proof: `gh issue list --label cron-failure --state open --search "[cron-failure:redfin-monthly] in:title" --json number,title` filtered by the prefix returns nothing while a `[cron-failure:redfin-lee-monthly]` issue is open; `node .github/scripts/log-cron-incident.mjs --mode=record-failure --dry-run` prints the exact-match decision.
   - Unblocks: no hidden incidents, no misfiled diagnosis, no wrong close. Whether to create issues at all is item 13.

9. DO (shared file). Remove the doctor's permanent yellow on monthly workflows (P11).
   - What: the second Opus reconstructed the cause (P11: 71 zero-in-window workflows, the seven Redfin files at sorted positions 53-59, cap 40). Print `len(need)` against `max_backfill` in `ingest/scripts/doctor.py:537-547` once to confirm on the doctor's own window, then either raise the cap above the zero-in-window count, or treat "no run in the 500-run window but the last run green within cadence_days × tolerance" as GREEN using the registry `cadence_days` it already loads. Do not keep the alphabetical order as the rationing rule: it starves every workflow after "l".
   - Lane D. Effort S.
   - Proof: the next doctor run shows the seven Redfin rows green.
   - Unblocks: a doctor summary where yellow means something.

10. ASK-FIRST. Collapse seven workflows into four. This is the operator's 09/17 question, recorded at `_ASSISTANT/SCRATCHPAD.md:361`.
    - What:
      - Make one county pipeline that downloads all_counties.csv once and writes Lee and Collier. Today two jobs pull the same 147,358,373-byte file, and the code is identical except for names (`diff ingest/pipelines/redfin_lee/resources.py ingest/pipelines/redfin_collier/resources.py`).
      - Make one parametrized stress pipeline and workflow for the trio. The three `pipeline.py` files differ only in URL, column map and names (`diff ingest/duckdb_pipelines/redfin_price_drops/pipeline.py ingest/duckdb_pipelines/redfin_contract_cancellations/pipeline.py`, and the same against delistings).
      - Keep the tables and registry entries; only the `workflow:` fields change.
    - Why ask first: it is a refactor over more than 5 files (RULE 1 ASK-FIRST). The case for it: every retarget or guard pass so far missed a sibling (county pair missed twice, `cadence_registry.yaml:953-954`; the trio missed the 07/05 and 09/20 guard passes, P1). One code path ends that class of miss.
    - Lane D. Effort M.
    - Proof: `node scripts/schedule-catalog.mjs | grep -ci redfin` shows 4 workflows, and the pytest suite in §3 stays green.
    - Unblocks: item 12 at zero marginal cost.

11. ASK-FIRST. Dispose of the frozen and mixed-window rows (P3).
    - Option (a): delete `property_type <> 'All Residential'` rows from the three tables, plus the 1,355 short-window All Residential city rows. That is a data_lake write.
    - Dependency for (a), found by the second Opus: the registry row floors are met today only because of the frozen rows. `expected_rows_min` is 594 for Lee (`cadence_registry.yaml:969`), 700 for Collier (`:947`) and 350,000 for City (`:996`), while the live All Residential counts are 176, 176 and 160,594 (a.sql in §11). After (a) the probe's `check_volume_entry` (`ingest/scripts/check_freshness.py:431-470`, plain `count(*)` on `count_table`) would flag all three LOW_VOLUME. `count_filter` cannot rescue it: it is read only by `assert_landed.py` (`cadence_registry.yaml:78-79`). So (a) must lower the floors in the same change: 158 for Lee and Collier (90% of 176), and 143,315 for City (90% of 159,239 = 160,594 − 1,355).
    - Option (b): keep per-type rows alive by also pulling property_types/monthly/all_counties.csv (monthly) for Lee and Collier.
    - Lane D. Effort S for (a), M for (b).
    - Proof: `select property_type, max(period_end) from data_lake.redfin_lee_market group by 1` shows no 2026-05-31 stragglers.
    - Unblocks: future consumers can read the tables without a trap. This is question 1 in §12.

12. ASK-FIRST. Add Hendry County market rows (§5).
    - What: widen the county pull to "Hendry County, FL" (176 rows live), either into a new `data_lake.redfin_hendry_market` table or into a widened county table after item 10.
    - Why ask first: a new data_lake table needs its consuming brain in the same PR (`ingest/CLAUDE.md` brain-first).
    - Lane D. Effort S after item 10, M alone.
    - Proof: `select count(*) from data_lake.<table> where region='Hendry County, FL'` ≥ 150.
    - Unblocks: Hendry market figures. This is question 2 in §12.

13. ASK-FIRST. Stop creating a GitHub issue per incident, and keep the check as the only record (§8).
    - What: drop the `gh issue create` path in `openIncidentIssue` (`.github/scripts/log-cron-incident.mjs:217-257`) and the per-failure comment on sticky issue #44 (`postComment`, `:204-214`).
    - Why ask first: this is global across every family, not just Redfin. Each created issue is also added to GitHub Projects board 3 (`gh project item-add 3`, `log-cron-incident.mjs:266`), so removing issue creation empties whatever that board shows. The operator's "not 500 GitHub issues" covers the spam; it does not clearly cover retiring the board.
    - Lane D. Effort S.
    - Proof: on the next red, `gh issue list --label cron-failure --state open` gains nothing while `node scripts/check.mjs list` shows the `cron_incident_*` row.
    - Unblocks: one signal per fault. This is question 5 in §12.

Not planned, with reasons:
- A monthly raw-vintage archive on the Spectre SSD: the 09/21 republish changed 0 of 352 Lee+Collier rows on our fields (§2), so the evidence does not justify it. Revisit only if S2 needs point-in-time Redfin inputs.
- Renaming the parquet column median_dom_yoy_pct: cosmetic, and the consumer already maps it correctly (`housing-source.mts:100`).
- Moving the trio's cron off the 15th: the 09/15 run already held 2026-08-31, so the 09/17 Last-Modified is a republish, not a late first publish.
- The Python 3.13 pin (P14): green, and nothing depends on 3.12 here.

## 8. Checks and balances

The one signal per pipeline is the check row `cron_incident_<workflow-slug>` in `public.checks`. For this family the keys are `cron_incident_redfin_monthly`, `_redfin_price_drops_monthly`, `_redfin_contract_cancellations_monthly`, `_redfin_delistings_relistings_monthly`, `_redfin_lee_monthly`, `_redfin_collier_monthly` and `_redfin_city_swfl_monthly`. The key shape is taken from the live `cron_incident_redfin_monthly` (built by `cronIncidentCheckKey(workflowName)`, `.github/scripts/log-cron-incident.mjs:56`).

Per pipeline, one line each (second Opus made this explicit):
- redfin_swfl: `cron_incident_redfin_monthly`. It fires on the content gate (40d), the volume floor (after item 3), a vendor rename (DuckDB binder error) or a crash. It is live and working today; it is open now only because it cannot auto-close on a dispatch (item 1).
- redfin_price_drops: `cron_incident_redfin_price_drops_monthly`. The key exists and the listener covers the workflow, but it cannot fire on a frozen source until item 2 lands; today only a zero-row pull or a crash turns it red. No interim signal is added; item 2 is the fix.
- redfin_contract_cancellations: `cron_incident_redfin_contract_cancellations_monthly`. Same state as price_drops, same fix (item 2).
- redfin_delistings_relistings: `cron_incident_redfin_delistings_relistings_monthly`. Same state as price_drops, same fix (item 2).
- redfin_lee: `cron_incident_redfin_lee_monthly`. It fires on the 35d header tripwire, the 55d content gate, MIN_ROWS 150 or the header-columns check. It is live and it fired correctly on 08/18 (run 32144353358).
- redfin_collier: `cron_incident_redfin_collier_monthly`. Same guards as Lee; it fired correctly on 08/18 (run 32136507622).
- redfin_city_swfl: `cron_incident_redfin_city_swfl_monthly`. It fires on the 35d header tripwire, the 55d content gate, the header-columns check or the desk-hero landing guard (`redfin_city_swfl/resources.py:227-251`). It is live; it has had no red in its 4 runs.

- How it opens: `.github/workflows/log-cron-incident.yml` listens to all seven by display name (`:58-64`). On a red run it opens or reopens the check (`log-cron-incident.mjs:152-156`, observed "opened/reopened check cron_incident_redfin_monthly" in run 35001370945).
- How it auto-closes: on the next scheduled green, `maybeResolve` → `closeIncidentCheck` runs `check.mjs close ... --evidence "next scheduled run succeeded <url>"` (`log-cron-incident.mjs:129-145`, `:164-178`). The known gap is that a green DISPATCH does not close it (`:131`), so a hand-verified fix is closed by hand (plan item 1).
- Why it fires only when a served number would be wrong: a run in this family goes red only through a content guard (content age, volume floor, header columns, desk-hero regions) or a real crash. Every guard asserts the data a consumer would serve. That holds only after plan items 2 and 3. Today the trio can go stale without a red (P1), so the trio has no signal yet.
- No issue per run: this family does not need the GitHub issue that `openIncidentIssue` also creates. Its lookup misfired on 09/15 (P6), and it duplicates the check. Plan item 8 makes the lookup exact now; plan item 13 (ASK-FIRST, because issues also feed Projects board 3) removes the issue.

The backstop is silent and opens no check. The daily probe plus doctor (`.github/workflows/freshness-probe-daily.yml` → `ingest/scripts/doctor.py`) shows a row per pipeline on `https://swfldatagulf-ops.vercel.app/coverage`. After plan item 6 the three Tier-2 rows age `period_end` (content), not `_dlt_loads.inserted_at`. The probe does not open checks for STALE pipelines: `check_freshness.sync_gap_checks` handles city-pulse corridor gaps only (`ingest/scripts/check_freshness.py:646-705`). That is correct here, because it keeps the probe from becoming a second signal for the same fault. The probe workflow itself is red every day on `listing_lifecycle` (run 36259690113), so its conclusion carries no signal for this family. Only its rows do.

Registry fields, named:
- `freshness_table` + `freshness_column: period_end` on redfin_lee, redfin_collier and redfin_city_swfl (item 6).
- `expected_rows_min` is 594 for Lee (`cadence_registry.yaml:969`), 700 for Collier (`:947`) and 350,000 for City (`:996`). Those are cumulative-table floors. The per-run floor lives in code (MIN_ROWS 150), which is why both exist (`redfin_lee/constants.py:36-41`). Correction by the second Opus: the first draft said these "stay as is". They are met today only by the frozen per-type rows. The live All Residential counts are 176 / 176 / 160,594 (a.sql, §11), so the probe's volume row measures dead rows, not the feed. Leave them while the frozen rows stay. If item 11(a) deletes the frozen rows, lower them in the same change to 158 / 158 / 143,315 (arithmetic in item 11). `count_filter` is no substitute, because only `assert_landed.py` reads it (`cadence_registry.yaml:78-79`).
- No `nightly: true`, because these are monthly jobs (`cadence_registry.yaml:62-69`).
- `freshness_sla.error_after_days` stays unset. The probe run is red daily for other reasons, so exit-code gating adds no signal.

Noise to delete:
- Check `redfin_dom_yoy_unit_days_not_pct` (fixed) and check `cron_incident_redfin_monthly` (fixed): item 1.
- GitHub issue creation per incident for these workflows. The concrete thing to delete is the mechanism, not old issues: #135, #182 and #183 were per-failure issues and all three are already CLOSED (`gh issue view <n> --json state,closedAt`: 08/15, 09/18, 09/18), and `gh issue list --label cron-failure --state all --search "redfin in:title"` shows no open Redfin issue. The mechanism is `openIncidentIssue` (`log-cron-incident.mjs:218-257`), its `cron-failure` label as a Redfin incident carrier, and the Projects board 3 add (`:266`). The misfiled heal comment on #183 and the wrong close of #135 (P6) are the proof it is noise: items 8 and 13.
- The per-failure comment on sticky issue #44 (`postComment`, `log-cron-incident.mjs:204-214`; observed `issues/44#issuecomment-5684897603` on 09/15). The check carries the same fact: item 13.
- The doctor's daily NO_RUNS_IN_WINDOW yellow on all seven: item 9.
- The registry-identity `action_major_behind` WARN, printed seven times for this family on every CI push. Its own fix text says "do NOT mass-bump", so it is a warning with no action. Delete the class or print it once per repo, not once per pipeline.
- The stale "genuinely RED" note for redfin_city_swfl at `.github/workflows/ci.yml:96`: item 6.
- The heal-chain model narrative on this family's reds: §10.

Nothing to add beyond the guards in items 2 and 3. No new workflow, table or label.

## 9. Box placement

All seven stay on GHA `ubuntu-latest` (`runs-on: ubuntu-latest` in every YAML). None of the reasons that count applies:
- WAF or residential IP: the source is a public S3 bucket. HEAD and ranged GET returned 200 from this box, and every GHA run downloaded the full file (e.g. "download complete: 1332.1 MB" in 35001233771).
- Job over 6 h: the longest newest-green run is 6m24s (city).
- Browser: none.
- Local model: none.
- SSD archive: the vintage archive is not justified by evidence (§7 not-planned). The largest single download is 1,332,087,509 bytes, which fits a GHA runner (proven).

Per pipeline, placement and reason (second Opus made this explicit):
- redfin_swfl: stays on GHA `ubuntu-latest` (`redfin-monthly.yml:25`). Public S3 download of 1,332,087,509 bytes, finished in 1m24s on the newest green (35490122939); no WAF, no browser, no model, far under 6 h.
- redfin_price_drops: stays on GHA `ubuntu-latest` (`redfin-price-drops-monthly.yml:22`). Public S3, 673,644,316 bytes, 1m24s (35016641291).
- redfin_contract_cancellations: stays on GHA `ubuntu-latest` (`redfin-contract-cancellations-monthly.yml:22`). Public S3, 561,785,726 bytes, 1m23s (35021255288).
- redfin_delistings_relistings: stays on GHA `ubuntu-latest` (`redfin-delistings-relistings-monthly.yml:22`). Public S3, 664,368,724 bytes, 1m20s (35027654368).
- redfin_lee: stays on GHA `ubuntu-latest` (`redfin-lee-monthly.yml:22`). Public S3, 147,358,373 bytes, 1m07s (35371707779).
- redfin_collier: stays on GHA `ubuntu-latest` (`redfin-collier-monthly.yml:22`). Same file as Lee, 1m06s (35362346844).
- redfin_city_swfl: stays on GHA `ubuntu-latest` (`redfin-city-swfl-monthly.yml:23`). Public S3, 1,125,777,571 bytes, 6m24s (35374031365), the longest in the family and well under its 45-minute timeout.

GHA is free while the repo is public (brief §Compute lanes). Nothing from this family is on the Fedora box today (`grep -rln "swfl-local" .github/workflows` lists no redfin file), and nothing on the box should come here. Corrected by the second Opus: the first draft said the runner hosts dbpr-sirs, crexi and collier records. The same grep also shows `leepa-comparable-sales-annual.yml:37` and `leepa-parcels-annual.yml:28` gated to it, plus `runner-smoke.yml`. None of them is in this family. If a Redfin job ever has to move (for example a vintage archive to `SWFL_RESEARCH_ROOT=/srv/swfl/research`), the pattern to copy is the gate expression at `leepa-parcels-annual.yml:28`: `runs-on: ${{ vars.SWFL_LOCAL_RUNNER_READY == 'true' && fromJSON('["self-hosted","swfl-local"]') || 'ubuntu-latest' }}`. No move is planned.

## 10. Compute lane per LLM leg

There is no LLM call in this family's code. The call-site grep over the seven workflows and the three pipeline dirs returns nothing:

```
rg -n -i "anthropic|ANTHROPIC_API_KEY|messages\.create|claude -p|openai|ollama|codex" .github/workflows/redfin-*.yml ingest/duckdb_pipelines/redfin_price_drops ingest/duckdb_pipelines/redfin_contract_cancellations ingest/duckdb_pipelines/redfin_delistings_relistings ingest/duckdb_pipelines/redfin_swfl ingest/pipelines/redfin_lee ingest/pipelines/redfin_collier ingest/pipelines/redfin_city_swfl
```

The consuming packs are deterministic too. properties-collier-value is "Pure deterministic — no synthesis agent" (`refinery/packs/properties-collier-value.mts:58`). The seller-stress and housing packs compute z-scores and medians in TS (`seller-stress-swfl.mts:195-280`, `housing-swfl.mts:495-510`). Second Opus, stronger proof: all four packs set `skipSynthesisAgent: true` (`housing-swfl.mts:613`, `seller-stress-swfl.mts:602`, `properties-lee-value.mts:951`, `properties-collier-value.mts:680`).

The brief's wider grep (`anthropic|claude|ANTHROPIC|openai|refinery`) over the same seven YAMLs, the seven pipeline dirs and the Redfin test dirs, re-run by the second Opus:

```
rg -n -i "anthropic|claude|openai|refinery|ollama|codex|messages\.create" .github/workflows/redfin-*.yml ingest/duckdb_pipelines/redfin_* ingest/pipelines/redfin_* ingest/tests/pipelines/redfin_* ingest/tests/pipelines/test_redfin_siblings_renamed_column.py
```

It returns 5 hits, all `refinery` in comments that point at the deterministic consumer: `redfin_swfl/pipeline.py:15`, `:178`, `redfin_swfl/constants.py:15`, `:16` and `redfin_swfl/test_pipeline_mapping.py:7`. None is an LLM call. Lane: not applicable (no leg). There are 0 anthropic, claude, openai, ollama or codex hits.

One adjacent leg is not in family code but fires on this family's reds: the heal-chain narrative, `.github/scripts/heal-cron-failure.mjs:213-238`.
- What it does: a Haiku call that writes DIAGNOSIS / LIKELY CAUSE / HUMAN ACTION from the log tail.
- Auth today: `ANTHROPIC_API_KEY` (`.github/workflows/heal-cron-failure.yml:186-191`). It is dead: 09/15 heal run 35001370894 returned `400 ... credit balance is too low` and posted its fallback onto the wrong issue (P6).
- When it runs: `needsLlm` is true for UNKNOWN, SCHEMA_DRIFT and DATA_EMPTY (`classify-cron-failure.mjs:261-263`). So plan item 5 alone does not stop the call; it only turns UNKNOWN into SCHEMA_DRIFT or DATA_EMPTY, which still call.
- Replacement lane for this family: D, no model. Every red this family can produce is one of our own guards or a DuckDB or Postgres error with a fixed shape. After item 5 the classifier's deterministic suggestedAction already names the fix, and the narrative adds nothing.
- Recommendation to the heal-chain owner's plan: skip the narrative when the classifier matched a named guard class. Keep a narrative only for true UNKNOWN. If the owner keeps any unattended narrative, the only unattended model lane is M (`claude -p` on the Fedora runner with the Max login, per the operator's standing decision that these legs are internal), and that choice belongs to that plan.
- A zero-code lane-D route exists, noted by the second Opus. `haikuDiagnose` returns null and posts the deterministic diagnosis only when `ANTHROPIC_API_KEY` is unset (`heal-cron-failure.mjs:214-216`). Dropping the env line at `.github/workflows/heal-cron-failure.yml:191` therefore parks the dead leg with no script change. That is a shared file across every family, so it is the heal-chain owner's decision, not this plan's item.

## 11. Double-check log

I re-read the file top to bottom. Each numbered claim is listed with the command or file that verifies it and the outcome.

Key to the scratch names below. Each name is a file of queries run through the Bun.SQL runner described at the top; the queries are reproduced here so they can be re-run.

```
-- a.sql
select property_type, count(*)::int, min(period_end)::text, max(period_end)::text from data_lake.redfin_lee_market group by 1;       -- same for redfin_collier_market
select property_type, count(*)::int, count(distinct region)::int, min(period_end)::text, max(period_end)::text from data_lake.redfin_city_swfl group by 1;
select schema_name, count(*)::int, max(inserted_at)::text from data_lake._dlt_loads where schema_name in ('redfin_lee','redfin_collier','redfin_city_swfl') group by 1;
-- b.sql
select path, vintage::text, byte_size, updated_at::text, source_etag, source_last_modified, max_period_end::text from data_lake._tier1_inventory where path like 'market/redfin%';
select count(*) from data_lake.redfin_city_swfl where region not like '%, FL';
select period_end::text, median_sale_price, median_sale_price_yoy, homes_sold from data_lake.redfin_lee_market where property_type='All Residential' and period_end >= '2026-03-01';   -- same for collier; city with area in the hero trio
select count(*) from data_lake.redfin_city_swfl; select count(*) from data_lake.redfin_lee_market; select count(*) from data_lake.redfin_collier_market;
-- c.sql
select _dlt_load_id, count(*)::int from data_lake.redfin_city_swfl group by 1;   -- same for lee, collier
-- d.sql
select region, max(period_end)::text, count(*)::int from data_lake.redfin_city_swfl where property_type='All Residential' and region in ('LaBelle, FL','Clewiston, FL', ...) group by 1;
select count(*), count(distinct region), min(period_end), max(period_end) from data_lake.redfin_city_swfl where property_type='All Residential' and (period_end - period_begin) < 60;
select count(distinct region) from data_lake.redfin_city_swfl where property_type='All Residential' and period_end='2026-08-31';
-- e.sql / f.sql
select * from data_lake.realtor_redfin_median_overlap;   -- then the three failing_rows_sql bodies at ingest/quality/quality_registry.yaml:563-610
```

pq.py is the duckdb block in §2. rev.py streams `housing_market/monthly/all_counties.csv` with `requests` + `csv`, keeping `REGION TYPE = 'County'` rows for Lee, Collier and Hendry. diff.mts compares those rows to the lake with `select period_end::text, median_sale_price, homes_sold, months_of_supply from data_lake.redfin_<county>_market where property_type='All Residential'`.

1. 7 pipelines / 7 workflows. `grep -n "name: redfin" ingest/cadence_registry.yaml` shows lines 276, 304, 321, 338, 940, 962 and 984, and `ls .github/workflows | grep -i redfin` shows 7. Verified.
2. Registry line numbers `:276 :304 :321 :338 :940 :962 :984`. Same grep. Verified.
3. 28 lib/app files read the four brains. Re-ran the `rg -l ... | wc -l` in §1 and got 28. Verified.
4. S3 Last-Modified and sizes for the 6 files plus the legacy file. The `curl -sI` loop output. Verified (09/26 run).
5. "Last Updated: Sep 3, 2026" on the page, and in-file LAST UPDATED "2026-09-03". The crawl4ai run and the `curl -r 0-4000` output. Verified.
6. 09/21 republish changed 0 of 176 Lee and 0 of 176 Collier rows on 3 fields. rev.py plus diff.mts output `{"same":176,"diff":0,"missing":0}` ×2. Verified. The claim is scoped to 3 fields × 352 rows.
7. Hendry has 176 rows in all_counties.csv. rev.py Counter. Verified.
8. Parquets are 20,592 rows / 126 ZIPs / 2012-03-31..2026-08-31 each. pq.py output. Verified.
9. Metro ZIP split 39/22/52/13. pq.py output. Verified. Corrected in §2: first drafted as Lee/Collier counts, now stated as metro-label counts with the 57-ZIP core from `seller-stress-swfl.mts:177`.
10. Span distribution 88:1301 / 89:3077 / 90:4262 / 91:11952. pq.py output. Verified.
11. Stress value columns are VARCHAR. pq.py DESCRIBE output. Verified.
12. Inventory rows (vintages, nulls, swfl source_last_modified 09/12). b.sql output. Verified.
13. Lee 704 = 176 + 4×132, Collier 801 = 176 + 625, City 421,130 = 160,594 + 260,536. a.sql, b.sql and the per-type sums (62,559+21,952+126,417+49,608 = 260,536). Verified by arithmetic.
14. 1,355 short-window All Residential rows in 694 regions, 2012-01-31..2025-09-30. d.sql output, and it matches 160,594 − 159,239 from the load-id query. Verified.
15. Last dlt loads 09/18 (lee 17:00:44, collier 15:26:43, city 17:29:38). a.sql output. Verified.
16. LaBelle 175 / Clewiston 176 rows through 08/31. d.sql output. Verified.
17. Latest served values (Lee 358,799 etc.). b.sql output. Verified.
18. Run counts per workflow (9/5/5/5/8/6/4) and green/red/cancelled splits. The `gh run list` output. Verified.
19. Wall-clock durations. `gh run view --json createdAt,updatedAt` output, subtracted by hand. Verified.
20. 09/15 BinderException text. `gh run view 35001233771 --log-failed`. Verified.
21. The 08/18 ContentStaleError and 07/18 psycopg timeout texts. `gh run view` on 32144353358, 32136507622 and 29645074782. Verified.
22. Classifier returns UNKNOWN for 4 shapes and CONTENT_STALE for 1. The `node -e` classify runs. Verified.
23. The logger dedupe misfire and the misfiled #183 comment. Logs of 35001370945 and 35001370894. Verified.
24. Heal leg 400 on the credit wall. Log of 35001370894. Verified (quoted by shape only).
25. 33 pytest pass; per-file counts. pytest run plus `--collect-only`. Verified.
26. 53 + 15 bun tests pass. The bun test runs. Verified.
27. Brain refined_at dates. `grep -n refined_at brains/*.md` output. Verified. Master reads 08/14 against the brief's 08/19; logged as needs review.
28. The DOM fix is live (992beef9; brain line 246). `git log` on housing-source.mts plus the `grep -n median_dom_yoy_days brains/housing-swfl.md`. Verified.
29. Overlap view deltas and contract results B1 0 / B2 1 / B3 0. e.sql and f.sql output. Verified.
30. Registry identity shows no RED for the seven. check-registry-identity `--live` output filtered for redfin. Verified.
31. Doctor rows yellow NO_RUNS_IN_WINDOW. Log of 36259690113. Verified. The cause is could-not-verify, and §4 P11 is marked that way.
32. `sync_gap_checks` handles corridors only. `ingest/scripts/check_freshness.py:646-705`. Verified.
33. Auto-resolve fires on a schedule only. `log-cron-incident.mjs:131`. Verified.
34. The city header is "Rolling 3 Months", county "Monthly", metros "Monthly", property_types cities "Rolling 3 Months". `curl -r` header reads. Verified.
35. Served labels "Closed-sale median (monthly)" and "— monthly". `lib/desk/loaders.ts:619` and `app/desk/_components/DeskHero.tsx:378` opened. Verified.
36. redfin_swfl MIN_ROWS 6,000 at `:54`, content gate 40 at `:61`. File opened. Verified.
37. byte_size 893 vs 290,046, and 609 vs 1,298,730. b.sql and pq.py `sum(total_compressed_size)`. Verified.
38. property_types/monthly/all_counties.csv is 385,414,872 bytes; all_metros.csv 45,892,377; price_drops all_counties 73,862,793. curl HEAD. Verified.
39. 14 dataset cards on the downloads page. Crawl4ai "Last Updated" lines, counted 14. Verified.
40. The "healthy content age about 47d on the day before the 18th cron" math (10/17 − 08/31). Arithmetic. Verified. Corrected from a first-draft 48d.
41. "No dark root". §1 consumer grep plus the direct-read files opened. Verified.
42. The stress-trio cron move was dropped. The parquet `ingested_at` 09/15 already held 2026-08-31 (pq.py). Corrected: the first draft proposed a cron move and it was removed from §7.

43. The file:line citations into `ingest/pipelines/redfin_lee/resources.py`, `redfin_lee/constants.py` and `redfin_city_swfl/resources.py`. `grep -n` on each symbol (`_KEEP`, `assert_header_has(idx`, `@dlt.resource`, `assert_advanced(`, `MIN_ROWS = `, `def dedupe_city_rows`, the desk-hero `missing =` line). Corrected: the first draft cited line numbers from a concatenated `cat -n` of three files (e.g. `:220` for the header guard, which is actually `:137`). All 13 such citations in §2, §3, §4 P3 and §8 now carry the real local lines.
44. Proof-command files exist: `ingest/tests/test_cadence_registry_spine.py`, `.github/scripts/classify-cron-failure.test.mjs` and `scripts/schedule-catalog.mjs`, checked with `ls`. Verified.
45. §10 call-site grep returns nothing. Re-ran the `rg` in §10 and got exit 1 with no output. Verified.

46. The 15th-of-month runs picked up the new window every observed month (06, 07, 08 via housing, 09). The `git log` plus `git show ... | grep -o` command in §7 item 2, with output as quoted there. Verified.
47. The tokenized issue search appears at 3 sites. `grep -n 'in:title' .github/scripts/*.mjs` gives `log-cron-incident.mjs:224`, `:286` and `heal-cron-failure.mjs:322`. Verified.
48. Issues feed Projects board 3. `log-cron-incident.mjs:266` `gh project item-add 3`. Verified. Corrected: the first draft had "stop creating issues" as DO/S inside item 8. It is now split into item 8 (exact match, DO) and item 13 (remove issues, ASK-FIRST), with §8 updated.

Corrections applied above: #9 (§2 metro wording), #40 (§7 item 6 figure), #42 (§7 not-planned), #43 (line numbers) and #48 (item 8 split). 5 corrections in all.

Rows 49-78 were added by the second Opus. They cover numbers the first log did not list, each re-run on 09/26/2026.

49. Cron slots 15th 13:00 / 17:00 / 18:00 / 19:00 UTC and 18th 12:00 / 13:00 / 14:00 UTC, plus timeouts 30 ×6 and 45. `grep -nE "cron:|timeout-minutes" .github/workflows/redfin-*.yml`. Verified.
50. All seven `runs-on: ubuntu-latest`, and all seven `python-version: "3.13"`. Same grep. Verified.
51. Run ids and dates for 35490122939, 35001233771, 31887155897, 35016641291, 35021255288, 35027654368, 35371707779, 35302434655, 35302343815, 32144353358, 35362346844, 32136507622, 29645074782, 35374031365 and 31448652778. `gh run list --workflow <file> --limit 15 --json databaseId,conclusion,createdAt,event`. Verified. 31448652778 was created 2026-08-11T01:13:46Z (08/10 local).
52. Wall clocks 1m24s / 1m24s / 1m23s / 1m20s / 1m07s / 1m06s / 6m24s. `gh run view <id> --json createdAt,updatedAt`. Verified.
53. "download complete: 1332.1 MB" in 35001233771. `gh run view 35001233771 --log | grep -o "download complete[^\r]*"`. Verified.
54. Commit dates: 9b020426 08/10, e2a0dfb2 09/20, c6be4669 09/17, 77032240 09/20, 6c077dae 09/20, f326752b 06/14, cdf97542 07/05, 992beef9 09/20. `git log -1 --format='%h %ad %s' --date=iso <sha>`. Verified.
55. 245b2364 as the Python 3.13 first-seen. `git show 245b2364 -- .github/workflows/redfin-monthly.yml` shows only setup-python v5→v6, and `git log -S'python-version: "3.13"'` returns 47318490 (05/26). Corrected in P14.
56. `.python-version` is 3.12 at root and in `ingest/`. `cat .python-version; ls ingest/.python-version; grep -n 3.12 ingest/CLAUDE.md` (line 55). Verified.
57. Registry floors 594 (`:969`), 700 (`:947`), 350,000 (`:996`); confirmed_total 10,072 (`:295`), 9,955 (`:317`, `:334`, `:351`), 782 (`:958`), 660 (`:980`). `nl -ba ingest/cadence_registry.yaml`. Verified.
58. Live table totals 704 / 801 / 421,130 and All Residential 176 / 176 / 160,594, with 952 regions and 917 at 2026-08-31. Bun.SQL a.sql and b.sql. Verified.
59. 1,355 short-window All Residential city rows in 694 regions. Re-run with aliased columns. Anyone re-running the P3 / d.sql text as written should alias it (`count(*)::int n, count(distinct region)::int r`), because an unaliased pair collapses to one JSON key under Bun.SQL and shows only 694. The second Opus's first run hit exactly that. Verified.
60. Hero-trio city spans: cape_coral, fort_myers and naples each 174 All Residential rows, span 88-91 days. `select area, count(*), min(period_end-period_begin), max(...) ... group by 1`. Verified.
61. 18,000 / 20,592 = 87% and 6,000 / 20,592 = 29%. Arithmetic. Verified.
62. 55 ZIP snapshots (`brains/housing-swfl.md:37`), 57 core ZIPs (`seller-stress-swfl.mts:177`), 52 scored with 3 suppressed (`brains/seller-stress-swfl.md:39`). `sed -n` on each line. Verified.
63. 20,474 rows on the 08/15 swfl run and 67,536 / 124 ZIPs on the 07/15 run. `gh run view <id> --log | grep -o "rows loaded: ..."` on 31887155897 and 29424896137. Verified; P8 first-seen corrected to 08/15.
64. 20,592 rows on the 09/15 price-drops run. Same grep on 35016641291. Verified.
65. Trio parquets: 20,592 rows / 126 ZIPs / metro split 39/22/52/13 / VARCHAR value columns / compressed sizes 290,046, 112,771 and 191,213. Second-Opus pq.py re-run (duckdb httpfs, creds via `load_env_local()`). Verified.
66. Two county stress files: 61,940,213 and 73,393,223 bytes, both Last-Modified 09/17. `curl -sI`. Verified (gap filled in §5).
67. The six in-file LAST UPDATED values of "2026-09-03", and FREQUENCY "Rolling 3 Months" for the ZIP and city files and "Monthly" for the county and metro files. `curl -s -r 0-6000 <url> | sed -n 2p`. Verified.
68. Downloads-page stamps. Second-Opus crawl4ai shows the "Last Updated: Sep 3, 2026" stamp on 2 cards and 14 cadence stamps (10 Monthly, 4 Quarterly). Corrected in §2.
69. Consumer list. `rg -n <table> refinery/sources refinery/packs lib app scripts components`. `lib/charts/series.ts` is not a reader; the real third reader is `lib/charts/gallery-loaders.ts:249`. Corrected in §1. The overlap view has no lib/app reader. Verified.
70. 3 components files read the four brains. `rg -l ... components | wc -l`. Verified (added to §1).
71. The served "monthly" sites on the city sold path: `lib/desk/loaders.ts:619, :652, :778, :827`, `DeskHero.tsx:378`, plus the `DeskHero.tsx:438` coupling. `rg -n monthly` plus reading `loaders.ts:606-875`. Corrected in P2 and item 4.
72. /charts states no window. `lib/charts/gallery-loaders.ts:240-249` has title "Median Sale Price". Corrected in P2.
73. #135 was closed 08/15 by redfin-monthly run 31887155897. `gh issue view 135 --json comments`. Verified; P6 upgraded.
74. #135, #182 and #183 are CLOSED. `gh issue view <n> --json state,closedAt`. Verified; §8 noise list corrected.
75. The doctor's 23 NO_RUNS_IN_WINDOW rows and 2 RED rows in 36259690113. `gh run view 36259690113 --log > doc.log; grep -c NO_RUNS_IN_WINDOW; grep -E "\| RED \|"`. Verified.
76. The doctor cap mechanism: 115 workflows, 71 with zero runs in the last 500, Redfin at sorted positions 53-59, the 40th being leepa-parcels-annual.yml. The `gh workflow list` / `gh run list` reconstruction in P11. Verified by reconstruction; P11 upgraded from could-not-verify.
77. "free public TSV" appears 5× in each county brain. `grep -c`. Verified (new P15).
78. The runner-gated workflows also include `leepa-comparable-sales-annual.yml:37` and `leepa-parcels-annual.yml:28`. `grep -rln swfl-local .github/workflows`. Corrected in §9.

## 12. Questions for the operator

1. The frozen per-type rows (P3, plan item 11): delete them (a data_lake write), or keep single-family / condo / townhouse county splits alive by also pulling Redfin's monthly property-type county file? Nothing reads them today. The choice is whether condo-vs-house county figures are a product we want.
2. Hendry (plan item 12): Redfin publishes 176 months of Hendry County figures free. Do you want Hendry county market rows in the lake? That means a table plus a consuming brain, per the brain-first rule.
3. The seven-to-four consolidation (plan item 10) answers your 09/17 "6 crons on redfin" question. It is a refactor over more than 5 files, so it needs your go.
4. `docs/standards/data-roots.md:515-516` slates the Redfin city pull for retirement after the realtor cutover and your sign-off. The overlap view agrees within 2.5% on the four comparable rows today (§3), and the cutover check `realtor_redfin_overlap_cutover` is not in the open ledger (`node scripts/check.mjs list`). Is the cutover still the plan, or does the city pull stay?
5. Incident issues (plan item 13): the check row already records every red and auto-closes. Can the logger stop opening a GitHub issue per incident, given that those issues are what feed Projects board 3?

## 13. Second-Opus verification

Run on 09/26/2026 by the second Opus. I re-ran the commands, opened every cited file:line, re-queried the live tables (Bun.SQL runner copied from `scripts/apply-fdic-sod-view.mts:10-27` into the scratchpad) and the four parquets (duckdb httpfs), re-ran HEAD and range GETs against the Redfin bucket, re-crawled the downloads page with crawl4ai, and re-ran the 33 pytest cases (33 passed) and the 53 + 15 bun pack tests (0 fail).

Claims checked: 78. That is the 48 rows of the first log, all re-run, plus rows 49-78 added to §11.

Corrections (what was wrong → what is right → evidence):
1. §1: `lib/charts/series.ts` was listed as a reader of `redfin_metro_sold_pivoted` → it only names the view in a docblock; the readers are `app/charts/page.tsx:231`, `lib/charts/gallery-loaders.ts:249` and `app/r/zip-report/[zip]/page-data.ts:52` → `rg -n redfin_metro_sold_pivoted lib app`.
2. §2: the "Last Updated: Sep 3, 2026" stamp was said to appear on four cards → it appears on 2; 14 cards carry cadence stamps (10 Monthly, 4 Quarterly) → crawl4ai re-crawl of the downloads page.
3. §2: price_drops was "12 vendor fields plus MoM/YoY" → 18 vendor columns: 5 id + 12 value (4 metrics × level/MoM/YoY) + LAST UPDATED → `redfin_price_drops/pipeline.py:113-130`.
4. §4 P2 and §7 item 4: 2 served "monthly" sites → 5 (`loaders.ts:619, :652, :778, :827`, `DeskHero.tsx:378`). Also found: the `:778` deltaNote presents overlapping windows as month-over-month, and `DeskHero.tsx:438` string-sniffs "monthly", a coupled edit → `rg -n monthly` plus reading `loaders.ts:606-875`.
5. §4 P2: "the /charts metro line states the wrong window" → the /charts panel states no window ("Median Sale Price") → `lib/charts/gallery-loaders.ts:240-249`.
6. §4 P6: a sibling wrong close "can" happen, first seen 09/15 → it did happen: #135 (Collier) was auto-closed 08/15 by redfin-monthly run 31887155897 → `gh issue view 135 --json comments`.
7. §4 P8: first seen 09/20 → 08/15, when the scheduled run loaded 20,474 rows → `gh run view 31887155897 --log`.
8. §4 P9: registry size-comment lines were unqualified, and :288 and :1003 were missed → qualified as `cadence_registry.yaml:288/:312/:329/:346/:1003` → `nl -ba ingest/cadence_registry.yaml`.
9. §4 P11: the root cause was could-not-verify and the cap was an inference → verified by reconstruction: 71 of 115 workflows had zero runs in the last 500, and the sorted backfill list puts Redfin at positions 53-59, past cap 40 → `gh workflow list` / `gh run list` plus `gh_runs.py:194-199`.
10. §4 P14: first seen 06/08 (245b2364) → 05/26 (47318490); 245b2364 only bumped setup-python → `git log -S'python-version: "3.13"'`.
11. §8 registry fields: `expected_rows_min` "stays as is" → the floors 594 / 700 / 350,000 are met only by frozen per-type rows (live All Residential 176 / 176 / 160,594). Item 11(a) must lower them to 158 / 158 / 143,315, and `count_filter` cannot substitute → `cadence_registry.yaml:947,969,996,78-79` plus a.sql.
12. §8 noise list: #135, #182 and #183 were listed as noise to delete → all three are already CLOSED, so the noise to delete is the mechanism (`openIncidentIssue`, the #44 per-failure comment, the Projects board 3 add) → `gh issue view <n> --json state,closedAt`.
13. §9: the runner was said to host dbpr-sirs, crexi and collier records → `leepa-comparable-sales-annual.yml:37` and `leepa-parcels-annual.yml:28` are also gated to it; none is Redfin → `grep -rln swfl-local .github/workflows`.

Unverifiable claims (why):
- None of the vendor-diff claims ended up unverifiable. The 09/21-republish diff and "Hendry has 176 rows" were re-run: a scratchpad rev.py (requests stream plus csv on REGION TYPE = County) printed `{"Lee County, FL": 176, "Collier County, FL": 176, "Hendry County, FL": 176}`, and diff.mts against the lake printed `Lee County, FL {"same":176,"diff":0,"missing":0}` and `Collier County, FL {"same":176,"diff":0,"missing":0}`. Both verified.
- The first Opus's SESSION_LOG attribution for 35490122939. The SESSION_LOG line exists (`SESSION_LOG.md:294`) and the run is green, but I did not open that run's log for its row count. Row 64 shows the same 20,592 on the 09/15 price-drops run.

Gaps filled:
- P15 (new): served provenance says "free public TSV" 5× in each county brain, stale since the 09/17 CSV retarget. It is folded into item 6.
- §5: the unchecked county seller-stress files exist (61,940,213 and 73,393,223 bytes, 09/17).
- §2: trio county coverage (39/22/52/13 metro split, 0 Hendry) and real parquet sizes for all four.
- §8: one explicit signal line per pipeline. The trio's key exists but cannot fire on a frozen source until item 2.
- §9: one explicit placement-plus-reason line per pipeline, and the gate expression to copy if a job ever moves.
- §10: the brief's wider grep (5 hits, all `refinery` comments), `skipSynthesisAgent: true` in all four packs, and the zero-code park route for the dead heal leg (`heal-cron-failure.mjs:214-216`, the owner's decision).
- §1: 3 components files also read the four brains; the overlap view has no app reader; no direct parquet reader exists outside refinery.
- §4 P9: the stale consumer comment at `redfin_swfl/pipeline.py:178-180`.
- §7 item 11: the floor dependency above.

Credit-suggestion count: 0. `grep -n -i -E "credit|top up|top-up|topup|console balance|api key funding|fund|billing"` over this file finds 3 mentions of "credit" (P12 symptom, §10 auth line, §11 row 24). All three quote the 09/15 heal log to show the leg is dead. None of them is a suggestion. The dead leg is routed to lane D (skip the narrative for named guard classes, or the zero-code unset route) or to lane M if the heal-chain owner keeps a narrative. Outside this paragraph, the second Opus's text adds no hits.

Grade: PASS-WITH-CORRECTIONS. The plan's structure, verdicts and item order stand. All 13 corrections are applied in the sections where the claims appear.
