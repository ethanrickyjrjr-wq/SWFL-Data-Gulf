# 02 demand-signals — pipeline plan (09/26/2026)

Family 02 covers five registry entries: the two daily probes that write `data_lake.daily_truth` (`live_search_daily_median_asking`, `live_search_daily_mortgage`), the monthly realtor.com geo-median pull (`realtor_geo_trends`), the monthly DataForSEO keyword-volume pull (`swfl_search_demand`), and the parked AirDNA short-term-rental slot (`airdna_str_swfl`). Verdict: one pipeline is healthy (mortgage). One is serving a wrong number right now: the /desk "Live asking median" has shown the same frozen inventory median, stamped with today's date, since 08/16. That one needs repair. One is dead and should be retired (realtor geo, vendor OUT by his word, green-but-empty on 09/04). One is blocked on a vendor account balance, which is his money call (search demand, 402 on 09/02). One stays parked (AirDNA). No pipeline in this family makes a model call.

## 1. Scope

Five pipelines. Registry lines are from `grep -n "name: <x>\b" ingest/cadence_registry.yaml`:

- `live_search_daily_median_asking` at `ingest/cadence_registry.yaml:122`. Workflow `live-search-daily.yml` (`:123`), called only from `nightly-chain.yml:147-151`, because its own cron was retired 07/12 (`live-search-daily.yml:4-11`). Table `data_lake.daily_truth`. Consumers:
  - the freshness-pulse brain (`ingest/cadence_registry.yaml:124`, read via `refinery/sources/daily-truth-source.mts:37`)
  - /desk (`lib/desk/loaders.ts:98`)
  - the charts gallery (`lib/charts/gallery-loaders.ts:180`)
  - the asking-price-trend concoction (`lib/concoctions/defs/asking-price-trend.ts:50`)
- `live_search_daily_mortgage` at `ingest/cadence_registry.yaml:172`. Same workflow (`:173`) and same table. Consumers: freshness-pulse (`:174`) and /desk (`lib/desk/loaders.ts:113`, `:974-987`).
  - The charts gallery does NOT read mortgage: its only `daily_truth` read filters `.eq("metric_key", "median_asking_price")` (`lib/charts/gallery-loaders.ts:180-183`), and a Grep for `mortgage` in that file returns nothing. (Corrected by the second Opus; the first draft listed the gallery here.)
  - Downstream of the brain, not the table: `lib/signals/change-evaluator.ts:84` keys on the freshness-pulse output slug `freshness_mortgage_30yr_fixed_pct` to write a per-$100K payment consequence. It reads the brain's output, so a stale mortgage row reaches it only through a freshness-pulse rebuild.
- `realtor_geo_trends` at `ingest/cadence_registry.yaml:2211`. Workflow `realtor-geo-trends-monthly.yml` (`:2212`), table `data_lake.realtor_geo_medians` (`:2217`), `consuming_pack: none` (`:2213`). The only reader in the repo is the `data_lake.realtor_redfin_median_overlap` view and its quality contract (`ingest/quality/quality_registry.yaml:555`). A Grep for `realtor_redfin_median_overlap|realtor_geo_medians` outside *.md files hits only registry, ingest, workflow and SQL files, with zero hits in `app/`, `lib/` or `refinery/`. That makes it a DARK ROOT.
- `swfl_search_demand` at `ingest/cadence_registry.yaml:1846`. Workflow `swfl-search-demand-monthly.yml` (`:1847`), table `public.swfl_search_demand` (`:1852`), `consuming_pack: none` (`:1848`). Its one reader is the manual operator tool `refinery/tools/search-demand.mts:1-16`, run on demand; nothing schedules it.
  - The brief calls this a DARK ROOT, and `data-roots.md:213` calls it "LIVE via a non-brain surface". Both are true: the reader exists, but nothing runs it on a clock.
- `airdna_str_swfl` at `ingest/cadence_registry.yaml:2376`, under `not_yet_running:` (`:2329`). `workflow: none` (`:2377`), `parked: true` (`:2384`). The declared consumer is `investor-zip-swfl`, which hardcodes `str_revenue_est_monthly: null` (`refinery/packs/investor-zip-swfl.mts:245-246`). There is no pipeline code: a Grep for `airdna` in `.github/workflows`, `ingest/pipelines` and `ingest/duckdb_pipelines` returned nothing.

## 2. What is being brought in

Read-only query runner: a throwaway `bun` script in the scratchpad, using the connection approach from `scripts/apply-fdic-sod-view.mts:15-27`, SELECT only. Everything marked "SQL" below came from it on 09/26/2026.

live_search_daily_median_asking

- Source: our own inventory, not an outside source. It is the median `list_price` over `data_lake.listing_active_homes` (`ingest/pipelines/live_search/engine.py:162-182`). That view is `listing_state` filtered to `api_feed`, active, for-sale, Lee+Collier, non-land, price >= 20k (`docs/sql/20260712_listing_active_homes_authority.sql:20-28`).
- Fields: one row per city per day: metric_key, area, period (= run date, `engine.py:105`), value, source_url, anomaly flag.
- Geography: three cities (`ingest/cadence_registry.yaml:153`). Cape Coral and Fort Myers are in Lee (12071), Naples is in Collier (12021). Hendry (12051) is none.
- Live rows, from SQL `select metric_key, area, count(*), count(value), min(period), max(period), max(retrieved_at) from data_lake.daily_truth group by 1,2`:
  - cape_coral: 72 rows, 70 non-null
  - fort_myers: 72 rows, 72 non-null
  - naples: 72 rows, 72 non-null
  - periods run 07/12/2026 to 09/26/2026, and max retrieved_at is 09/26/2026 09:24 UTC
- The upstream inventory is frozen:
  - SQL `select max(scraped_at) from data_lake.listing_state where source_name='api_feed'` returned 08/14/2026 04:28 UTC.
  - Per city, SQL on `listing_active_homes` gives medians Cape Coral 399200, Fort Myers 325000, Naples 650000, all with max scraped_at 08/14/2026.
  - SQL `select area, count(distinct value), min(period), max(period), count(*) from data_lake.daily_truth where metric_key='median_asking_price' and value is not null and period >= '2026-08-15' group by area` returned exactly 1 distinct value per city from 08/15 to 09/26:
    - Cape Coral: 41 daily rows
    - Fort Myers: 43 daily rows
    - Naples: 43 daily rows
    - 41 + 43 + 43 = 127

live_search_daily_mortgage

- Source: FRED `MORTGAGE30US` (`ingest/cadence_registry.yaml:195`), in api mode (`engine.py:145-159`). Period = FRED observation date. One row per weekly observation. Each day only the NEWEST observation is fetched (`"sort_order": "desc", "limit": 1` in `_fred_latest`, `engine.py:145-159`) and upserted (`ON CONFLICT ... retrieved_at=now()` at `ingest/pipelines/live_search/pipeline.py:22-34`). Older rows keep the retrieved_at of the last day they were newest: SQL shows period 06/18 retrieved 06/25, period 09/17 retrieved 09/24, period 09/24 retrieved 09/26.
- Geography: national rate, stored as area `swfl` (`:194`).
- Live, from SQL `select period, value, retrieved_at from data_lake.daily_truth where metric_key='mortgage_30yr_fixed' order by period`:
  - 15 rows, all non-null
  - weekly periods 06/18/2026 to 09/24/2026 with no gap; the latest is 7.03, retrieved 09/26/2026
- Source freshness: a crawl4ai fetch of `https://fred.stlouisfed.org/series/MORTGAGE30US` on 09/26 printed "Updated: Sep 24, 2026 11:02 AM CDT" and "Next Release Date: Oct 1, 2026". We hold the newest observation.

realtor_geo_trends

- Source: realtor.com `/neighborhood-market-trends` via SteadyAPI, 3 anchor properties (`realtor-geo-trends-monthly.yml:3-7`, `ingest/pipelines/market_aggregates/pipeline.py:139-175`).
- Fields: median list, sold, DOM and ppsqft per city, county and neighborhood block (`ingest/cadence_registry.yaml:2221`).
- Live, from SQL `select captured_date, level, count(*), count(median_sold_price), string_agg(distinct county, ',') from data_lake.realtor_geo_medians group by 1,2`:
  - 18 rows: 9 captured 07/18/2026 and 9 captured 08/04/2026, nothing since
  - counties present: Lee and Collier; Hendry none
  - the neighborhood rows have 1 of 2 and 0 of 1 sold medians per capture
- Source: SteadyAPI is OUT permanently on his word (`_ASSISTANT/SCRATCHPAD.md:492`, 09/15/2026).

swfl_search_demand

- Source: DataForSEO Google Ads search volume (`ingest/pipelines/swfl_search_demand/constants.py:15-17`). 275 seeds × 3 locations: Fort Myers metro, Naples metro, state FL (`constants.py:38-42`, `ingest/cadence_registry.yaml:1865`).
- Fields: keyword, avg_monthly_searches, competition, cpc, a 12-month array.
- Live, from SQL `select captured_month, location, count(*), count(avg_monthly_searches), max(inserted_at) from public.swfl_search_demand group by 1,2`:
  - 2,475 rows in total, newest inserted_at 08/02/2026 17:03 UTC
  - real data months are 04/2026, 05/2026 and 06/2026, each with 152 non-null rows per location
  - 1,107 rows have a NULL volume (SQL `count(*) filter (where avg_monthly_searches is null)`)
- Coverage: the two metros are Lee and Collier markets. No Hendry target.
- Source freshness:
  - The endpoint is reachable and gated on our account: it answered 402 on 09/02 (run 33672286964), not a timeout or 404.
  - The vendor lags about two months: the 08/02 run's newest real month is 06/2026 (SQL above).
  - Whether a newer month is published now cannot be checked without a billed call. Even `--dry-run` bills (P7).

airdna_str_swfl

- Nothing is brought in.
- The 09/26 crawl4ai fetch of `https://www.airdna.co/pricing` (HTTP 200) printed:
  - Free: $0
  - Market Research: "$125 / month", or "$34/ month billed $400 annually"
  - dynamic pricing: "$20/month per listing"
- The registry's price text (`ingest/cadence_registry.yaml:2369`, `:2385`, `:2388`, `:2392`, verified 06/11) no longer matches this page. The page is verified 09/26; the registry lines need review. Whether a Market Research plan exports a SWFL ZIP-level file is not verified.

## 3. What is working

- The live-search leg itself runs green every night. `gh run view <id> --json jobs` over the last 15 `nightly-chain.yml` runs (09/19 08:51 UTC to 09/26 09:24 UTC) shows "ingest · live search / run success" in 15 of 15. Newest example: job 108378684140 in run 36232679167.
- The row gate reads both live_search entries correctly by metric. `gh run view --job 108378910402 --log` printed:
  - "`live_search_daily_median_asking` — **LANDED** — 214 rows >= floor 1"
  - "`live_search_daily_mortgage` — **LANDED** — 15 rows >= floor 1"
  - 214 matches SQL 70+72+72 non-null asking rows.
- The mortgage series is complete and current: 15 weekly periods with no gap (SQL above), and FRED's own page matches our newest period.
- The anomaly and range machinery works. It stored a NULL with a reason instead of a guess on the two DB-unreachable days: SQL shows cape_coral 09/21 and 09/22 value NULL, status_reason "lake: no active home rows for city (view empty or DB unreachable)".
- Tests, run 09/26 with `ingest/.venv/Scripts/python.exe -m pytest -q -p no:cacheprovider <path>`:
  - `ingest/pipelines/live_search/tests`: 9 passed
  - `ingest/tests/test_cadence_registry_live_search.py`: 2 passed
  - `ingest/tests/scripts/test_assert_landed.py`: 16 passed
  - `ingest/pipelines/swfl_search_demand`: 12 passed
  - `ingest/tests/pipelines/market_aggregates`: 16 passed
  - `bun test refinery/tools/search-demand.test.mts refinery/packs/freshness-pulse.test.mts`: 22 pass, 0 fail
- swfl_search_demand landed green twice. `gh run list --workflow swfl-search-demand-monthly.yml --limit 15` shows 28610554610 (07/02) success and 30757977334 (08/02) success.
- realtor_geo_trends landed real rows once on a scheduled run: 30927939651 (08/04) success, with 9 rows in SQL for 08/04. The 07/18 first run does not appear in `gh run list`, which shows only 2 runs. Its 9 rows exist in SQL, so the run that wrote them could not be verified from gh.
- Incident dedup already works: one issue per workflow, not per run. `.github/scripts/log-cron-incident.mjs:228` logs "incident issue already open ... not duplicating" and auto-closes on the next green run (`:283`).

## 4. Problems

P1. The /desk "Live asking median" is a frozen number dated today.
- Symptom:
  - SQL shows one unchanging value per city on every non-null row from 08/15 to 09/26: Cape Coral 399200 (41 rows), Fort Myers 325000 (43), Naples 650000 (43). Inventory max scraped_at is 08/14/2026.
  - SQL `count(*) where metric_key='median_asking_price' and value is not null and period > (select max(scraped_at)::date + 1 from data_lake.listing_active_homes)` = 124 rows.
- Root cause, in two parts:
  - `ingest/pipelines/live_search/engine.py:162-182` takes the median with no check on inventory age, and `engine.py:105` stamps period = today.
  - `lib/desk/loaders.ts:782-793` renders it as "Live asking median" with `asOf: mdY(liveAsking.period)`, which reads 09/26/2026.
  - The inventory stopped because the listings legs are parked by his word. That is the premise, not the defect.
- Severity: blocks a served number (live /desk).
- First seen: 08/16/2026 (first period more than 2 days past the 08/14 scrape, SQL).

P2. The gate and the doctor cannot see P1 or a dead mortgage feed.
- Freshness is table-wide:
  - `ingest/scripts/check_freshness.py:241-273` runs `MAX(freshness_column)` over the whole `daily_truth` with no `count_filter`.
  - `ingest/scripts/assert_landed.py:67-72` reuses it for `last_run`.
  - The volume count is all-time (`assert_landed.py:75-120`, no date scope).
  - `rg -n "count_nonnull|count_filter" ingest/scripts/check_freshness.py ingest/scripts/doctor.py` returns nothing.
- Evidence: the doctor, run 09/26 with `python -m ingest.scripts.doctor --json` (read-only per `doctor.py:17-20`), reports:
  - `live_search_daily_median_asking` freshness FRESH, age 0 days, volume landed 294
  - `live_search_daily_mortgage` volume landed 294, which is the whole table: SQL 216 + 63 + 15
- Consequence: if FRED died, the NULL row still bumps `retrieved_at`, and the 15 historic non-null rows keep the floor met, so the gate reads LANDED forever. The `assert_landed.py:13-16` docstring claims `count_filter` unmasks the twins; that is true for the count only, not for freshness.
- Severity: blocks a consumer (a stale served number is never caught).
- First seen: this audit, 09/26.

P3. realtor_geo_trends goes green while writing nothing, against a vendor that is OUT.
- Symptom: `gh run view 33900241402 --log` printed "[warn] geo_trends anchor 'Cape Coral' (pid 6748540406) returned no rows", the same for Fort Myers and Naples, then "[done] geo_trends rows=0 dry_run=False". The job conclusion was success. SQL shows no 09/04 rows.
- Root cause: `ingest/pipelines/market_aggregates/resources.py:192-193` turns any non-200 into empty rows without logging the status code. The code therefore does not tell us whether 09/04 was a 429 or something else, and I do not claim which.
- The cron `realtor-geo-trends-monthly.yml:17` (`"0 14 4 * *"`) fires again 10/04/2026 14:00 UTC against SteadyAPI.
- Severity: blocks a consumer (the Redfin-cutover decision it existed for can no longer be made).
- First seen: 09/04/2026, run 33900241402.

P4. swfl_search_demand dead on a vendor account balance.
- Symptom: `gh run view 33672286964 --log-failed` printed "location metro:cape-coral-fort-myers ('Fort Myers,Florida,United States') failed: 402 Client Error: Unknown for url: https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live", the same for the other 2 locations, then "RuntimeError: swfl_search_demand: every location returned 0 rows".
- Cause: DataForSEO account balance (a separate vendor, not a code bug). Already recorded in `wiki/pipeline-census.md:76-77`.
- Severity: blocks a consumer (the operator digest reads a table stuck at 06/2026 data).
- First seen: 09/02/2026.

P5. The DataForSEO 402 is misclassified and was routed to a model.
- Running `classify()` from `.github/scripts/classify-cron-failure.mjs:42` on the 09/02 log tail returned "DATA_EMPTY | returned 0 | needsLlm= true | retry= false".
- The only 402 branch is Anthropic-specific (`:71-88`, keyed on `billing_error`), so a vendor 402 falls to DATA_EMPTY (`:166-176`). `needsLlm` (`:261-263`) then sends it to the model narrative at `.github/scripts/heal-cron-failure.mjs:218-231`.
- Issue #196 ("[cron-failure:swfl-search-demand-monthly] DATA_EMPTY", opened 09/02, still OPEN per `gh issue list --label cron-failure --state all`) carries a model-written diagnosis comment and a "dead/changed URL" suggested action that is wrong for a billing 402.
- Severity: cosmetic, but it is misrouted work.
- First seen: 09/02/2026.

P6. The search-demand NULL rows pollute later months.
- `ingest/pipelines/swfl_search_demand/providers.py:80` falls back to the run month (`fetched_at[:7] + "-01"`) when a keyword has no monthly data. The 123 no-volume keywords per location therefore land in the fetch month and collide with a later real month.
- SQL: captured_month 07/2026 and 08/2026 hold 123 rows per location with 0 non-null; 06/2026 holds 275 rows with 152 non-null.
- `expected_rows_min: 742` (`ingest/cadence_registry.yaml:1853`) counts `count(*)` all-time. 2,475 >= 742 can never fail, and the doctor shows "landed 2475, min_rows 742".
- Severity: blocks a consumer (the digest's month buckets and the floor are both wrong).
- First seen: 06/03/2026, the first run (SQL: 06/2026 NULL rows inserted 06/03).

P7. `--dry-run` on swfl_search_demand still bills DataForSEO.
- `pipeline.py:130` calls `provider.fetch` before the dry-run branch at `pipeline.py:160`, and the workflow input says "Dry run — fetch and print rows" (`swfl-search-demand-monthly.yml:15`).
- Nobody may use it as a free probe.
- Severity: cosmetic (a cost trap).
- First seen: this audit.

P8. The served citation describes a retired engine.
- `refinery/sources/daily-truth-source.mts:180` says "from a grounded live search (Gemini grounded → Firecrawl failsafe)". The engine has been deterministic FRED plus lake median since 07/12 (`engine.py:1-20`).
- This is one of the files under the open check `source_citations_say_firecrawl` (`node scripts/check.mjs list`).
- Severity: cosmetic, but wrong provenance.
- First seen: 07/12/2026.

P9. Noise rows in `daily_truth`.
- 63 NULL rows of the retired `median_sale_price` (SQL: 21 per city, 06/21 to 07/12, 0 non-null).
- They inflate the doctor's 294. Severity: cosmetic. First seen: 07/12/2026 (retirement date, `ingest/cadence_registry.yaml:116-121`).

P10. The live-search leg runs twice a day.
- The last 15 chain runs alternate `repository_dispatch` at 04:23 UTC and `schedule` at about 09:20 UTC (the `gh run list --workflow nightly-chain.yml` output above).
- The second run re-upserts the same keys (`pipeline.py:29`), so there is no data harm. Severity: cosmetic. This is the chain's owner's call, not this family's.

P11. Doc drift.
- `docs/standards/data-inventory.md:150` says daily_truth holds 259 rows; the doctor on 09/26 says 294.
- `docs/standards/data-roots.md:75` and `:516` still call the realtor parallel run LIVE.
- The AirDNA prices at `ingest/cadence_registry.yaml:2369`, `:2385`, `:2388`, `:2392` and `docs/standards/data-inventory.md:177` do not match the 09/26 crawl.
- Severity: cosmetic.

## 5. What is missing

live_search_daily_median_asking
- An upstream-age guard: the engine never asks how old the inventory is (P1).
- The ceiling (`ingest/cadence_registry.yaml:167-170`) allows more cities and active-count or median-DOM per city as config-only additions.
  - These would all compute off the same frozen inventory while listings stay parked, so adding them now adds zero truth. Not planned.

live_search_daily_mortgage
- `MORTGAGE15US` is in the same FRED release (`ingest/cadence_registry.yaml:207`). The FRED page crawled 09/26 links it as a related series. It is not pulled.
- The freshness-pulse metric list is fixed at four keys (`refinery/packs/freshness-pulse.mts:109`), so adding one is a key_metrics change. That is ASK-FIRST per RULE 1.

realtor_geo_trends
- Nothing worth adding; the vendor is OUT.
- The Redfin sold root stays the served sold median (`docs/standards/data-roots.md:75`).

swfl_search_demand
- Per `ingest/cadence_registry.yaml:1867-1869`, `competition_index`, `low_top_of_page_bid`, `high_top_of_page_bid` and `spell` come in the same response and are not stored.
- There is no scheduled reader: the digest is manual.
- Months 07/2026 onward are missing (P4).
- No Hendry location.

airdna_str_swfl
- Everything is missing by his decision (07/05/2026, `ingest/cadence_registry.yaml:2384`).
- If he ever raises it, rule 9 applies: three live-searched alternatives go on `wiki/tool-discovery.md` before adoption. The 06/11 registry note says "no free source exists" (`:2392`), and that has not been re-searched.

Across the family
- One signal per pipeline that fires only when a served number is wrong. None exists today (section 8).

## 6. Verdict per pipeline

- `live_search_daily_median_asking`: REPAIR. It serves the 08/14 inventory median as 09/26's number on /desk. The number that flips it to GOOD ENOUGH is 0 rows from the P1 SQL (non-null asking rows dated more than 1 day after inventory max scraped_at; today 124).
- `live_search_daily_mortgage`: GOOD ENOUGH. 15 of 15 weekly periods are present and match FRED's own page. It would become IMPROVE if its newest non-null period ever falls more than 10 days behind (today 0 failing rows).
- `realtor_geo_trends`: RETIRE. The vendor is OUT by his word, the last run wrote 0 rows while green, and nothing in `app/`, `lib/` or `refinery/` reads the table. The verdict would change only if he reverses the SteadyAPI decision.
- `swfl_search_demand`: PARK. It is dead on a DataForSEO account balance (402 on 09/02), which is his money decision (Q1). The number that flips it to IMPROVE is one green monthly run landing 07/2026 data.
- `airdna_str_swfl`: PARK. His 07/05 decision stands. The number that flips it is a subscription he chooses to buy.

## 7. The plan

Ordered. Each item gives what, where, lane, effort, proof, and what it unblocks.

1. DO. Add an upstream-age guard to lake mode.
   - Where: `ingest/pipelines/live_search/engine.py:162-182`. Return `max(scraped_at)` from the same query as the median. When `current_date - max(scraped_at)::date > 1`, return `_null_row(cfg, area, "lake: inventory frozen since <date>")`. This is a calendar-day rule, so the guard, the item 3 contract and the item 2 cut all mean the same thing. The null row already exists at `engine.py:96-100`.
   - Add a failing test first in `ingest/pipelines/live_search/tests/test_engine.py`, named for the failure mode: frozen inventory is never served as today.
   - Lane D. Effort S.
   - Proof: `ingest/.venv/Scripts/python.exe -m pytest -q ingest/pipelines/live_search/tests`, then after the next chain run `select period, value, status_reason from data_lake.daily_truth where metric_key='median_asking_price' order by period desc limit 3` shows NULL with the frozen reason.
   - Unblocks: stops new frozen rows.
   - It does NOT fix /desk on its own. `lib/desk/loaders.ts:108` skips NULLs, so the 09/26 frozen row stays the latest point until item 2.
   - This does not un-park listings; the parked state is his word.
2. ASK-FIRST (a `data_lake.*` write). One-time correction, with Q2.
   - Where: an idempotent SQL script run by `bun`.
   - `UPDATE data_lake.daily_truth SET value = NULL, status_reason = 'lake: inventory frozen since 2026-08-14 (corrected 09/26)' WHERE metric_key = 'median_asking_price' AND value IS NOT NULL AND period > DATE '2026-08-15'`. Today that is 124 rows.
   - In the same pass, `DELETE FROM data_lake.daily_truth WHERE metric_key = 'median_sale_price' AND value IS NULL`. Today that is 63 rows.
   - Lane D (interactive session). Effort S.
   - Proof: rerun the P1 SQL and get 0, and SQL `count(*) where metric_key='median_sale_price'` also gives 0.
   - Unblocks: /desk falls back to the last true point, 08/15/2026, with an honest as-of.
3. DO. Add two content contracts under a new `data_lake.daily_truth:` key in `ingest/quality/quality_registry.yaml`. Both are `type: sql_expectation`, `locus: probe`, `policy: report`, `severity: error`, in the scalar `SELECT count(*)` shape of `:305-314`.
   - `daily_truth_asking_outlives_inventory`: the P1 SQL (124 today).
   - `daily_truth_mortgage_period_stale`: `select count(*) from (select max(period) mp from data_lake.daily_truth where metric_key='mortgage_30yr_fixed' and value is not null) s where s.mp < current_date - 10` (0 today).
   - Lane D. Effort S.
   - Proof: the next `freshness-probe-daily.yml` run's "Data-quality probe" step summary lists both. Its 09/26 run 36259690113 shows that step = success, so the step runs.
   - Unblocks: section 8's signals. The checks open and close themselves through `ingest/scripts/check_data_quality.py:339-368`.
4. DO, cross-family (tell the owner of `assert_landed`, family 19, before landing). Make `_fetch_max_freshness` (`ingest/scripts/check_freshness.py:241-273`) and `check_volume_entry` (`:431`) honor `count_filter` and `count_nonnull`, the same way `assert_landed._count_rows` does (`assert_landed.py:75-120`).
   - Lane D. Effort M.
   - Proof:
     - `ingest/.venv/Scripts/python.exe -m pytest -q ingest/tests/scripts/test_assert_landed.py ingest/tests/scripts/test_check_freshness.py ingest/tests/scripts/test_doctor.py`, with a new test in which a dead mortgage feed goes STALE while asking stays fresh
     - `python -m ingest.scripts.doctor --json` shows asking and mortgage with different `landed` values (today both show 294)
   - Unblocks: the chain gate and the doctor can red one metric without the other.
   - Expected side effect, not a regression: once items 1 and 4 land, `assert_landed` will report `live_search_daily_median_asking` STALE every night while listings stay parked.
     - The cause is the same as the `listing_lifecycle` STALE line already in the gate (run 36232679167).
     - Incidents stay deduped under the existing nightly-chain issue #178.
5. DO. Fix the served citation at `refinery/sources/daily-truth-source.mts:180`.
   - Replace the Gemini/Firecrawl sentence with "FRED MORTGAGE30US (api) and the median of SWFL Data Gulf's active-listing inventory (deterministic, no search, no model)".
   - Close it under the existing check `source_citations_say_firecrawl` (do not open a new one).
   - Lane D. Effort S.
   - Proof: `rg -n "Gemini|Firecrawl" refinery/sources/daily-truth-source.mts` returns nothing, and `bun test refinery/packs/freshness-pulse.test.mts` passes.
   - It goes live only when the freshness-pulse brain next rebuilds. The rebuild is stalled behind the chain gate (brief, standing facts).
6. DO. Retire realtor_geo_trends before 10/04/2026 14:00 UTC.
   - Comment out the schedule at `.github/workflows/realtor-geo-trends-monthly.yml:16-17`, keeping `workflow_dispatch`.
   - Move the registry block `ingest/cadence_registry.yaml:2198-2228` under `not_yet_running:` with `parked: true` and a note ("RETIRED 09/26/2026: SteadyAPI OUT 09/15; last rows 08/04; 09/04 run 33900241402 green with 0 rows").
   - Comment the `data_lake.realtor_redfin_median_overlap` contract block at `ingest/quality/quality_registry.yaml:555` onward.
   - Remove the three tests that pin it in the same commit: `ingest/tests/quality/test_contract_registry.py:232`, `:241` and `:251`, which look contracts up by name via `_by_name`.
   - Correct `docs/standards/data-roots.md:75`, `:516` and `docs/standards/data-inventory.md:80`.
   - Keep the 18 rows and the table; they cost nothing and no drop is asked.
   - Lane D. Effort S.
   - Proof: `node scripts/schedule-catalog.mjs | grep -i geo-trends` shows no scheduled fire, `ingest/.venv/Scripts/python.exe -m pytest -q ingest/tests/test_cadence_registry*.py ingest/tests/quality/test_contract_registry.py` passes, and no run appears for this workflow on 10/04.
   - Unblocks: removes the only unwatched SteadyAPI call left in this family.
7. ASK-FIRST (money: Q1). Decide swfl_search_demand.
   - Park branch: comment `.github/workflows/swfl-search-demand-monthly.yml:11`, move `ingest/cadence_registry.yaml:1846-1871` under `not_yet_running:` with `parked: true`, and close issue #196 by hand with the reason (it can never auto-close without a green run).
   - Restore branch: he restores the DataForSEO account balance himself, then dispatch once on the monthly date.
   - Lane D. Effort S.
   - Proof, park branch: `gh issue view 196 --json state` gives CLOSED. Proof, restore branch: SQL `max(captured_month) where avg_monthly_searches is not null` reaches 07/2026 or later.
8. DO. Fix the NULL-month fallback at `ingest/pipelines/swfl_search_demand/providers.py:80`.
   - Stamp no-volume keywords with the batch's newest real month, the max `_captured_month` across the same response, instead of the fetch month.
   - Add a test in `ingest/pipelines/swfl_search_demand/test_pipeline.py`.
   - Also fix the wording at `swfl-search-demand-monthly.yml:15` and `pipeline.py:195` so "dry run" says it still makes billed calls.
   - Lane D. Effort S.
   - Proof: `ingest/.venv/Scripts/python.exe -m pytest -q ingest/pipelines/swfl_search_demand`.
   - Existing polluted rows are a `public.*` table, not `data_lake.*`, but they are still his data. Leave them until item 7 resolves; no rewrite is proposed here.
9. DO, only on the item 7 restore branch. Add a contract under `public.swfl_search_demand:` in `ingest/quality/quality_registry.yaml`:
   - `swfl_search_demand_newest_month_stale`: `select count(*) from (select max(captured_month) mc from public.swfl_search_demand where avg_monthly_searches is not null) s where s.mc < current_date - 100`. Today it gives 1, because the 09/02 run failed.
   - The 100 days allows for the vendor's two-month lag: the 08/02 run returned 06/2026 data per SQL.
   - Lane D. Effort S.
   - Proof: the probe step summary.
   - Unblocks: section 8's signal for this pipeline.
10. DO, cross-family (family 19 owns the classifier). Add a deterministic vendor-payment class to `.github/scripts/classify-cron-failure.mjs`.
    - It matches a non-Anthropic `402 Client Error` or `Payment Required`, sits after the Anthropic branch at `:71-88`, and returns `needsLlm` false and `shouldRetry` false.
    - Its prescription: "a paid vendor's account balance is exhausted; this is the operator's money decision; not a code fault".
    - Test in `.github/scripts/classify-cron-failure.test.mjs` using the 09/02 log line.
    - Lane D. Effort S.
    - Proof: `node --test .github/scripts/classify-cron-failure.test.mjs`, and re-running `classify()` on the 09/02 tail no longer returns DATA_EMPTY.
    - Unblocks: this family's failure path never reaches a model.
11. ASK-FIRST (freshness-pulse key_metrics shape, RULE 1). Q3.
    - Add `MORTGAGE15US` as a second api-mode metric: a new registry entry mirroring `ingest/cadence_registry.yaml:172-210`, and a registered metric in `refinery/packs/freshness-pulse.mts:102-117`.
    - Lane D. Effort S.
    - Proof: SQL `count(*) where metric_key='mortgage_15yr_fixed'` is 1 or more after a chain run.
12. DO. Correct the doc numbers from P11 in the same pass as item 6.
    - `docs/standards/data-inventory.md:150` (294 rows per the 09/26 doctor, or 231 after item 2).
    - AirDNA price lines `ingest/cadence_registry.yaml:2369`, `:2385`, `:2388`, `:2392` and `docs/standards/data-inventory.md:177`, now reading "09/26/2026 crawl: Free $0; Market Research $125/month or $400/year; ZIP export unverified".
    - Lane D. Effort S.
    - Proof: `rg -n "19.95|40-100|20-100" ingest/cadence_registry.yaml docs/standards/data-inventory.md` returns nothing.

Counted: 12 items. 9 DO (1, 3, 4, 5, 6, 8, 9, 10, 12) and 3 ASK-FIRST (2, 7, 11).

## 8. Checks and balances

The design rule: ONE signal per pipeline. It fires only when a served number is wrong or a consumer reads stale, it closes itself when green, and it never files an issue per run. The carrier is the existing content-contract seam.
- `ingest/quality/quality_registry.yaml` sql_expectation contracts run daily in `freshness-probe-daily.yml` ("Data-quality probe" step).
- `ingest/scripts/check_data_quality.py:339-368` opens one `public.checks` row per failing contract under project `data-quality` and auto-closes it when the count returns to 0.
- No new workflow, no new label, no issue.

Signals:
- `live_search_daily_median_asking`: contract `daily_truth_asking_outlives_inventory` (item 3). It fires when any non-null asking row is dated more than 1 day after the inventory's last scrape. That is exactly the served-number-wrong condition. Today it gives 124, so it opens on the first probe after item 3 lands and closes after items 1 and 2.
- `live_search_daily_mortgage`: contract `daily_truth_mortgage_period_stale` (item 3). It fires when the newest non-null FRED period is more than 10 days old, so one missed weekly release plus slack. Today it gives 0.
- `swfl_search_demand`: contract `swfl_search_demand_newest_month_stale` (item 9), only if restored. If parked, no signal: parked entries sit under `not_yet_running:`, which the probe does not read (`ingest/cadence_registry.yaml:2374-2375` comment; `assert_landed.py:57-63`).
- `realtor_geo_trends`: none, retired (item 6).
- `airdna_str_swfl`: none, parked.

What stays as it is:
- The chain gate `assert_landed` for the two nightly entries, made metric-honest by item 4.
- `log-cron-incident.mjs`, which is already one issue per workflow with auto-close (`:228`, `:283`), for real run failures.
- The ops coverage page (`https://swfldatagulf-ops.vercel.app/coverage`) was not read for this plan. Whether it picks up the parked and retired moves on its own is not verified.

Noise to delete or correct:
- Issue #196: close by hand on the item 7 park branch. On the restore branch it auto-closes on the next green run.
- Contract `data_lake.realtor_redfin_median_overlap` (`ingest/quality/quality_registry.yaml:555`): comment it out (item 6). No new realtor rows will ever arrive, so it can only go stale-green.
- The doctor's misleading "landed 294" on both live_search rows: fixed by item 4, not deleted.
- The 63 retired `median_sale_price` NULL rows: item 2.
- The P5 misroute: item 10.
- The Healthchecks ping at `live-search-daily.yml:63-67` is `if: always()` and proves only that the leg ran. It is not a data signal and must never be read as one. It is kept only because `nightly-chain.yml` has no heartbeat of its own (`grep -n "hc-ping" .github/workflows/nightly-chain.yml` returns nothing).

Registry fields: none new. The moves in items 6 and 7 use the existing `not_yet_running:` plus `parked: true` shape (`ingest/cadence_registry.yaml:2384`).

## 9. Box placement

- `live_search_daily_median_asking` and `live_search_daily_mortgage`: stay on GHA `ubuntu-latest` inside `nightly-chain.yml` (`live-search-daily.yml:34`). Reasons:
  - FRED is a keyed public API with no WAF (15 of 15 green chain legs above)
  - the median is a SQL read over psycopg
  - runtime is well inside `timeout-minutes: 25` (`:35`)
  - none of the move reasons apply: no residential IP, no job over 6 h, no SSD archive, no browser, no local model
- `swfl_search_demand`: stays on `ubuntu-latest` (`swfl-search-demand-monthly.yml:25`). Reasons: it is a paid JSON API with Basic auth; the 09/02 failure was a 402 balance, not a block, which a residential IP would not change; `timeout-minutes: 15`.
- `realtor_geo_trends`: moves nowhere; its cron is retired (item 6). Reason: vendor OUT.
- `airdna_str_swfl`: nowhere. There is no code and it is parked. Revisit only if he buys a subscription; a manual export drop would then be a candidate for the SSD at `/srv/swfl` (runbook `_ASSISTANT/2026-09-15-fedora-runner-runbook.md`), not before.
- Already on the box that should not be: none from this family. `grep -rln "swfl-local" .github/workflows` lists dbpr-sirs, collier-official-records, crexi, leepa-comparable-sales, leepa-parcels and runner-smoke only (matches `docs/superpowers/handoffs/2026-09-20-runner-live-what-is-next.md:8-16`).

## 10. Compute lane per LLM leg

LLM calls inside this family's pipelines: none. Proof, run 09/26:
- `grep -n -i -E "anthropic|claude|ANTHROPIC_API_KEY|openai|gemini|refinery|llm|ollama"` over the 3 workflow files returned nothing.
- `grep -rn -i -E "anthropic|claude|ANTHROPIC_API_KEY|openai|gemini|ollama|messages\.create"` over `ingest/pipelines/live_search`, `ingest/pipelines/swfl_search_demand` and `ingest/pipelines/market_aggregates` returned only docstring and comment lines: `engine.py:11`, `:15`, `:16` describe the retired search mode, and `market_aggregates/constants.py:74` names CLAUDE.md.
- Consumers `refinery/packs/freshness-pulse.mts`, `refinery/sources/daily-truth-source.mts`, `refinery/tools/search-demand.mts`, `refinery/lib/swfl_taxonomy.mts` and `refinery/packs/investor-zip-swfl.mts` have no model call. The same grep found only the stale citation text at `daily-truth-source.mts:180`, which is P8 and a string, not a call.

One adjacent leg is reachable from this family's failures:
- What it does: `.github/scripts/heal-cron-failure.mjs:218-231` writes a narrative diagnosis with model `claude-haiku-4-5` and comments it on the incident issue.
  - It fires for this family when a DataForSEO 402 is classified DATA_EMPTY (P5).
  - `gh issue view 196` shows it posted a diagnosis comment for the 09/02 failure.
- Current auth: an API-key environment variable (`:214`). With no key set it falls back to a deterministic diagnosis (`:214-216`).
- Replacement lane: Lane D. Item 10 adds a deterministic vendor-payment class, so a vendor 402 never reaches the model. No model is needed for any failure this family can produce.
  - The remaining fuzzy classes (DATA_EMPTY, SCHEMA_DRIFT, UNKNOWN) belong to family 19's plan for the classifier. If a narrative is still wanted there, the permitted lanes are Lane M (Max plan) or Lane L as draft-only, and that is their call.

## 11. Double-check log

I re-read this file top to bottom and re-ran each numbered claim against its command or file. Results:

1. Five pipelines at registry lines 122, 172, 2211, 1846, 2376. Check: `grep -n "name: <x>\b" ingest/cadence_registry.yaml`. Verified.
2. live-search cron retired, called from chain lines 147-151. Check: `cat -n .github/workflows/live-search-daily.yml` (lines 4-11) and `grep -n "live-search" .github/workflows/nightly-chain.yml` (147, 151). Verified.
3. Asking rows 72/72/72 with non-null 70/72/72, periods 07/12 to 09/26. Check: daily_truth group-by SQL. Verified.
4. Inventory max scraped_at 08/14/2026 04:28 UTC. Check: SQL on listing_state and on listing_active_homes. Verified.
5. One unchanging asking value per city from 08/15 to 09/26: 41 / 43 / 43 rows at 399200 / 325000 / 650000. Check: SQL `count(distinct value)` per area where period >= 2026-08-15. Corrected.
   - The first draft of sections 2 and 4 said Fort Myers and Naples were frozen "for 54 days". That was the 08/01-onward same-value run, which included days when the inventory was still live. Both sections now give the post-08/15 counts (41 + 43 + 43 = 127).
6. 124 frozen rows dated more than 1 day after the last scrape. Check: SQL `period > max(scraped_at)::date + 1` gives 124. The 127 figure (period >= 08/15) comes from a different cut and is stated as such in section 2. Item 2 and the contract both use the 124 cut. Verified.
7. Mortgage: 15 rows, weekly 06/18 to 09/24, latest 7.03. Check: SQL ordered list. Verified.
8. FRED page "Updated: Sep 24, 2026" and next release Oct 1. Check: crawl4ai run 09/26. Verified.
9. realtor_geo_medians: 18 rows (9 on 07/18, 9 on 08/04), no 09/04 rows. Check: SQL group-by and `count(*), max(captured_date)`. Verified.
10. 09/04 run 33900241402 green with rows=0 and 3 anchor warnings. Check: `gh run view 33900241402 --log`, and step conclusions via `--json jobs`. Verified.
11. The 07/18 run is not in gh history. Check: `gh run list --workflow realtor-geo-trends-monthly.yml --limit 15` returned 2 runs. Could not verify which run wrote the 07/18 rows; stated as such.
12. search_demand: 2,475 rows, 1,107 NULL, newest inserted 08/02 17:03 UTC, real months 04 to 06/2026 at 152 per location. Check: SQL. Verified.
13. 09/02 failure 402 on all 3 locations. Check: `gh run view 33672286964 --log-failed`. Verified.
14. Classifier returns DATA_EMPTY with needsLlm true. Check: a node import of `classify` on the saved log tail. Verified.
15. Issue #196 open, with a model diagnosis comment. Check: `gh issue list --label cron-failure --state all` and `gh issue view 196`. Verified.
16. Live-search leg success in 15 of 15 chain runs. Check: `gh run view <id> --json jobs` loop over the 15 ids. Verified.
17. assert_landed printed 214 and 15. Check: `gh run view --job 108378910402 --log`. Verified.
18. Doctor: asking FRESH age 0; both live_search entries landed 294; search_demand landed 2475 against min 742; realtor NO_FLOOR. Check: `python -m ingest.scripts.doctor --json` 09/26 19:34 UTC. Verified.
    - 294 = 216 + 63 + 15. Check: the SQL group-by sums. Verified.
19. check_freshness and doctor never read count_filter or count_nonnull. Check: `grep -n "count_nonnull\|count_filter" ingest/scripts/check_freshness.py ingest/scripts/doctor.py` returned nothing. Verified.
20. Test counts 9 / 2 / 16 / 12 / 16 and bun 22. Check: per-suite pytest runs and `bun test`. Verified.
21. Registry `expected_rows_min: 742` at :1853, parked at :2384, AirDNA price lines at :2369, :2385, :2388, :2392. Check: `awk` and `grep -n`. Verified.
22. AirDNA page shows $0, $125/month, $34/month billed $400 annually, $20/month per listing. Check: crawl4ai 09/26 with context lines. Verified.
    - Which plan covers a SWFL export: could not verify.
23. The quality probe step runs daily. Check: `gh run view 36259690113 --json jobs` shows "Data-quality probe ... = success". Verified.
    - The doctor step in the same run is a failure. That is other datasets, not a claim in this plan.
24. Contracts open and auto-close checks. Check: `ingest/scripts/check_data_quality.py:339-368`. Verified.
25. Mortgage contract SQL returns 0 today and search-demand contract SQL returns 1. Check: SQL runs. Verified.
26. Incident issues deduped per workflow. Check: `.github/scripts/log-cron-incident.mjs:228`, `:251`, `:283`. Verified.
27. No family workflow on the box. Check: `grep -rln "swfl-local" .github/workflows` (6 files, none in this family). Verified.
28. LLM grep results. Check: the three greps in section 10. Verified.
29. heal-cron-failure model and key lines 214-231. Check: `grep -n -i "anthropic\|claude\|model\|ANTHROPIC_API_KEY"` on the file. Verified.
30. SteadyAPI OUT on his word. Check: `_ASSISTANT/SCRATCHPAD.md:492`. Verified.
31. Engine line numbers 96, 105, 145, 162-182, 185. Check: `grep -n "def \|period=_today\|percentile_cont" ingest/pipelines/live_search/engine.py`. Verified.
32. `providers.py:80` fallback, `pipeline.py:130` fetch before `pipeline.py:160` dry-run check, `resources.py:192` non-200 swallowed. Check: `grep -n`. Verified.
33. /desk renders "Live asking median" with `asOf` from period at `loaders.ts:787`, `:792`, and skips NULLs at `:108`. Check: `grep -n`. Verified.
34. The nightly chain runs twice a day. Check: the `gh run list --workflow nightly-chain.yml` event column (repository_dispatch 04:23 and schedule about 09:20). Verified.
35. Open checks: none are keyed to this family except `source_citations_say_firecrawl` (P8); `realtor_redfin_overlap_cutover` and `cron_incident_swfl_search_demand_monthly` are not open. Check: `node scripts/check.mjs list` (21 open). Verified.
36. Plan counts: 12 items, 9 DO, 3 ASK-FIRST. Check: re-counted section 7. Verified.
37. Registry block ranges cited in sections 2, 5, 7 and 8. Check: `sed -n` over each range. Corrected, 7 citations:
    - realtor block 2200-2227 became 2198-2228
    - search-demand block 1846-1872 became 1846-1871
    - mortgage block 172-212 became 172-210
    - search-demand locations 1861-1863 became 1865
    - probe-exclusion comment 2373-2374 became 2374-2375
    - median_sale_price retirement 115-120 became 116-121
    - MORTGAGE15US 207-208 became 207
38. The item 1 guard threshold matches the contract. Corrected. The first draft used "older than 2 days" (hours), which disagrees with the contract's calendar-day rule `period > scrape_date + 1`: a 04:23 run about 43 h after a 09:25 scrape would pass the guard but fail the contract. Item 1 now uses `current_date - max(scraped_at)::date > 1`.
39. The item 6 proof covers every test that pins the realtor contract. Corrected. `grep -n "realtor" ingest/tests/quality/test_contract_registry.py` found tests at :232, :241 and :251 that look the contract up by name. Item 6 now removes them and runs that file in its proof.
40. The item 4 proof paths exist. Corrected. The glob `test_check_freshness*.py` became the real files `ingest/tests/scripts/test_check_freshness.py` and `test_doctor.py`, confirmed with `ls ingest/tests/scripts/`.
41. The ops coverage page claim. Corrected. I never read the ops repo, so section 8 now says it was not verified instead of asserting behavior.
42. Section 2 carries a source-freshness line for every pipeline. Corrected: swfl_search_demand had none, and one is now added from the 09/02 402 plus the SQL month lag.

Totals: 42 claims checked. 7 corrected in the sections above: claims 5, 37, 38, 39, 40, 41 and 42. 2 could not be verified: claim 11, and part of claim 22.

## 12. Questions for the operator

- Q1 (money). The DataForSEO account behind `swfl_search_demand` returned 402 on all three locations on 09/02. That is that vendor's own account balance, not ours to decide. Restore it and keep the monthly keyword pull, or park the pipeline (item 7)?
- Q2 (a `data_lake` write). The /desk "Live asking median" has shown the 08/14 inventory median dated as today since 08/16. May I NULL those 124 rows and delete the 63 dead `median_sale_price` NULL rows (item 2), so /desk shows the last true reading with its real date?
- Q3 (brain output shape). Add the FRED 15-year fixed rate (`MORTGAGE15US`, same release, same call) to freshness-pulse as a fifth metric (item 11), or leave the 30-year alone?
