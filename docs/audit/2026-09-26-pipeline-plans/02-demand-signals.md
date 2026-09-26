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
  - The chain run as a whole concluded `failure` in 15 of 15 (`gh run list --workflow nightly-chain.yml --limit 15`). In run 36232679167 the red jobs are city pulse, the three listing-lifecycle legs, `gate · assert_landed` (job 108378910402, red on `listing_lifecycle — STALE`) and `rebuild · brains`. None of those is this family's leg. The consequence for this family: freshness-pulse does not rebuild, so the leg's rows land but the brain that serves them is stalled (brief, standing facts).
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
  - `ingest/tests/pipelines/market_aggregates`: 16 passed. These are NOT evidence for realtor_geo_trends: Grep for `geo_trends|parse_geo_trends|realtor_geo` over `ingest/**/test_*.py` finds 0 hits in these files (the only hit is `ingest/tests/quality/test_contract_registry.py`). The geo-trends resource (`resources.py:186-195`, `pipeline.py:137-175`) has no unit test, including its silent non-200 branch (P3).
  - `bun test refinery/tools/search-demand.test.mts refinery/packs/freshness-pulse.test.mts`: 22 pass, 0 fail
- swfl_search_demand landed green twice. `gh run list --workflow swfl-search-demand-monthly.yml --limit 15` shows 28610554610 (07/02) success and 30757977334 (08/02) success.
- realtor_geo_trends landed real rows once on a scheduled run: 30927939651 (08/04) success, with 9 rows in SQL for 08/04. The 07/18 first run does not appear in `gh run list`, which shows only 2 runs. Its 9 rows exist in SQL, so the run that wrote them could not be verified from gh.
- airdna_str_swfl (added by the second Opus): nothing runs, by design, and that design holds:
  - `grep -rli airdna .github/workflows ingest/pipelines ingest/duckdb_pipelines` returns nothing (exit 1), so there is no code.
  - The declared consumer ships empty-tolerant with `str_revenue_est_monthly: null` and `str_source_tag: "available_on_request"` (`refinery/packs/investor-zip-swfl.mts:245-246`).
  - The `not_yet_running:` probe exclusion works: airdna is absent from the 09/26 `doctor --json` output, so it raises no false STALE or LOW_VOLUME.
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
- First seen: 08/16/2026 (the first period more than 1 calendar day past the 08/14 scrape; the P1 SQL cut `period > max(scraped_at)::date + 1` starts there).

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
- Cause: DataForSEO account balance (a separate vendor, not a code bug). Already recorded in `wiki/pipeline-census.md:76-77`. [INFERENCE] The log itself says only "402 Client Error: Unknown". The pipeline's own RuntimeError names three candidates ("check creds, location names, and the DataForSEO account balance"). HTTP 402 is Payment Required, which points at the balance, but no vendor response body was logged to prove it.
- Severity: blocks a consumer (the operator digest reads a table stuck at 06/2026 data).
- First seen: 09/02/2026.

P5. The DataForSEO 402 is misclassified and was routed to a model.
- Running `classify()` from `.github/scripts/classify-cron-failure.mjs:42` on the 09/02 log tail returned "DATA_EMPTY | returned 0 | needsLlm= true | retry= false".
- The only 402 branch is Anthropic-specific (`:71-88`, keyed on `billing_error`), so a vendor 402 falls to DATA_EMPTY (`:166-176`). `needsLlm` (`:261-263`) then sends it to the model narrative at `.github/scripts/heal-cron-failure.mjs:218-231`.
- Issue #196 ("[cron-failure:swfl-search-demand-monthly] DATA_EMPTY", opened 09/02, still OPEN per `gh issue list --label cron-failure --state open`) carries wrong advice for a vendor-payment 402. The wrong text is deterministic, not the model's (corrected by the second Opus; the first draft blamed the model comment):
  - The issue body's "Suggested action: Source returned no data — likely a dead/changed URL..." (`gh issue view 196 --json body`, body line 8) is the classifier's DATA_EMPTY `suggestedAction` (`classify-cron-failure.mjs:170-175`).
  - The comment's "Source URL to check — a 0-row failure is usually a dead or moved source" block comes from `heal-cron-failure.mjs:298`, which runs for DATA_EMPTY only (`:261`).
  - The model-written part of the same comment is correct: it reads "DataForSEO account has insufficient balance or expired subscription; the API is rejecting requests with HTTP 402" (`gh issue view 196 --json comments`).
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

P12. The doctor calls both dead monthly pipelines healthy-enough, and cannot see any of this family's runs. (Added by the second Opus.)
- Symptom: `ingest/.venv/Scripts/python.exe -m ingest.scripts.doctor --json`, run locally 09/26 (read-only per `doctor.py:17-20`), printed:
  - `swfl_search_demand` freshness FRESH, age_days 55, last_run 2026-08-02, even though run 33672286964 failed 09/02
  - `realtor_geo_trends` freshness FRESH, age_days 53, last_run 2026-08-04, even though run 33900241402 wrote 0 rows
  - run status `NO_RUNS_IN_WINDOW` with last_conclusion null for all four active entries (asking, mortgage, search demand, realtor)
- Root cause, freshness: the threshold is `int(cadence * tolerance)` = 30 × 2.0 = 60 days (`ingest/scripts/check_freshness.py:499`, fields at `ingest/cadence_registry.yaml:1850-1851` and `:2215-2216`), and STALE needs `age_days > threshold` (`check_freshness.py:515-516`). So search demand first reads STALE on 10/02/2026 (08/02 + 61) and realtor on 10/04/2026 (08/04 + 61). That is arithmetic on the code and fields, not an observed flip.
- Root cause, run pillar: live-search has had no run of its own since 07/12 (`gh run list --workflow live-search-daily.yml` newest is 29193543702 on 07/12), because it runs as a `workflow_call` inside the chain, so the doctor never sees the chain's leg. For the two monthly workflows, which do have 3 and 2 runs, the cause is not verified. The status is assigned at `ingest/lib/gh_runs.py:130`, and the targeted backfill lives at `ingest/scripts/doctor.py:516-560`. The `max_backfill=40` cap does not explain it, because the same doctor JSON has only 22 workflows in NO_RUNS_IN_WINDOW. The CI doctor may differ from this local run.
- It cannot turn red on its own. The doctor maps freshness STALE to yellow (`ingest/scripts/doctor.py:74-79`) and returns red only when an entry breaches its own `freshness_sla` (`:90-95`). Neither entry has a `freshness_sla` (`ingest/cadence_registry.yaml:1846-1871`, `:2211-2228`). So after 10/02 and 10/04 both entries stay yellow.
- Severity: blocks a consumer (a monitoring consumer: the gating doctor reads yellow instead of red for a failed monthly and a zero-row monthly).
- First seen: this audit, 09/26.

## 5. What is missing

live_search_daily_median_asking
- An upstream-age guard: the engine never asks how old the inventory is (P1).
- The ceiling (`ingest/cadence_registry.yaml:167-170`) allows more cities and active-count or median-DOM per city as config-only additions.
  - These would all compute off the same frozen inventory while listings stay parked, so adding them now adds zero truth. Not planned.

live_search_daily_mortgage
- `MORTGAGE15US` is in the same FRED release (`ingest/cadence_registry.yaml:207`). The FRED page crawled 09/26 links it as a related series. It is not pulled.
- The freshness-pulse metric list is fixed at four keys (`refinery/packs/freshness-pulse.mts:109`), so adding one is a key_metrics change. That is ASK-FIRST per RULE 1.
- Interior-hole backfill (added by the second Opus). `_fred_latest` asks FRED for `limit: 1` (`engine.py:145-159`). If the leg misses every run for a full week, that week's observation is never fetched. The item 3 contract checks only the newest period, so it would not catch an interior hole. None exists today (15 of 15 weekly periods, SQL). Plan item 13 fetches the last few observations instead of one.

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
   - In the same commit, remove every test site that pins it in `ingest/tests/quality/test_contract_registry.py`. There are five (`grep -n "realtor" ingest/tests/quality/test_contract_registry.py`; the second Opus corrected this from three):
     - `:232`, `:241` and `:251` look contracts up by name via `_by_name`, so they fail once the block is commented out.
     - `:262` (`test_realtor_redfin_overlap_is_probe_only...`) and the `"data_lake.realtor_redfin_median_overlap"` parametrize entry at `:277` would still pass, but only vacuously, because `load_contracts` returns [] (`ingest/quality/contracts.py:190`). Dead tests that stay green are noise; delete them too.
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
    - This removes BOTH pieces of wrong dead-URL text from P5 (second-Opus clarification). The issue-body suggestedAction becomes the new class's prescription. The "Source URL to check" comment block (`heal-cron-failure.mjs:298`) returns early for any class other than DATA_EMPTY (`:261`), so it stops firing with no edit to that file.
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

13. DO (added by the second Opus). Make the FRED fetch self-healing for interior holes.
    - Where: `ingest/pipelines/live_search/engine.py:145-159` (`_fred_latest`). Request the last 4 observations instead of `limit: 1`, and return all non-"." values. In `resolve_metric_api`, emit one row per observation; the existing `ON CONFLICT (metric_key, area, period, source_tag)` upsert (`pipeline.py:22-34`) makes the re-writes idempotent.
    - Add a failing test first in `ingest/pipelines/live_search/tests`, named for the failure mode: a missed week is backfilled on the next run.
    - Lane D. Effort S.
    - Proof: `ingest/.venv/Scripts/python.exe -m pytest -q ingest/pipelines/live_search/tests`, then SQL `select count(*) from data_lake.daily_truth where metric_key='mortgage_30yr_fixed' and value is not null` stays at 15 or more with no new NULL rows after a chain run.
    - Unblocks: the item 3 newest-period contract becomes sufficient, since a hole now heals within 3 weeks.
    - Watch `assert_landed`: it counts `count(value)` all-time (`assert_landed.py:107-120`), so the floor is unaffected.

Counted: 13 items. 10 DO (1, 3, 4, 5, 6, 8, 9, 10, 12, 13) and 3 ASK-FIRST (2, 7, 11). (The first draft had 12 items with 9 DO; the second Opus added item 13.)

## 8. Checks and balances

The design rule: ONE signal per pipeline. It fires only when a served number is wrong or a consumer reads stale, it closes itself when green, and it never files an issue per run. The carrier is the existing content-contract seam.
- `ingest/quality/quality_registry.yaml` sql_expectation contracts run daily in `freshness-probe-daily.yml` ("Data-quality probe" step).
- `ingest/scripts/check_data_quality.py:339-368` opens one `public.checks` row per failing contract under project `data-quality` and auto-closes it when the count returns to 0.
- No new workflow, no new label, no issue.

Signals:
- `live_search_daily_median_asking`: contract `daily_truth_asking_outlives_inventory` (item 3). It fires when any non-null asking row is dated more than 1 day after the inventory's last scrape. That is exactly the served-number-wrong condition. Today it gives 124, so it opens on the first probe after item 3 lands and closes after items 1 and 2.
- `live_search_daily_mortgage`: contract `daily_truth_mortgage_period_stale` (item 3). It fires when the newest non-null FRED period is more than 10 days old, so one missed weekly release plus slack. Today it gives 0.
- `swfl_search_demand`: contract `swfl_search_demand_newest_month_stale` (item 9), only if restored. If parked, no signal: parked entries sit under `not_yet_running:`, which the probe does not read (`ingest/cadence_registry.yaml:2374-2375` comment; `assert_landed.py:57-63`). Direct evidence that the doctor honors this: `airdna_str_swfl` is absent from the 09/26 `doctor --json` output, which lists the other four family entries.
- Timing (added by the second Opus, P12): if items 6 and 7 have not landed, the doctor's freshness pillar turns search demand STALE on 10/02/2026 and realtor on 10/04/2026. STALE is yellow, not red, for entries without a `freshness_sla` (`doctor.py:74-79`, `:90-95`), so this adds yellow noise to the doctor summary but does not newly fail the gating step. Land item 6 before the 10/04 14:00 UTC cron anyway, since that is a live SteadyAPI call. Land item 7's branch before 10/02, so the doctor's list holds only the designed signals.
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
- The doctor's `NO_RUNS_IN_WINDOW` yellow on all four active entries (P12). It is a blind spot, not a signal. Nothing in this family's design reads the doctor's run pillar: the chain gate and the content contracts carry the signals. The monthly-backfill cause belongs to the doctor's owner (family 19). No new check is opened for it here.
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
- Already on the box that should not be: none from this family. `grep -rln "swfl-local" .github/workflows` lists dbpr-sirs, collier-official-records, crexi, leepa-comparable-sales, leepa-parcels and runner-smoke only. The handoff names the first three at `docs/superpowers/handoffs/2026-09-20-runner-live-what-is-next.md:8-16` and the two LeePA annuals at `:47-49` (citation corrected by the second Opus). The two LeePA files gate on `vars.SWFL_LOCAL_RUNNER_READY` (`leepa-parcels-annual.yml:28`, `leepa-comparable-sales-annual.yml:37`).
- No pipeline in this family moves to the Fedora runner, so no `SWFL_LOCAL_RUNNER_READY` gate or `[self-hosted, swfl-local]` label is proposed. If one ever did, it would copy the gated `runs-on` expression at `leepa-parcels-annual.yml:28`.

## 10. Compute lane per LLM leg

LLM calls inside this family's pipelines: none. Proof, run 09/26:
- `grep -n -i -E "anthropic|claude|ANTHROPIC_API_KEY|openai|gemini|refinery|llm|ollama"` over the 3 workflow files returned nothing.
- `grep -rn -i -E "anthropic|claude|ANTHROPIC_API_KEY|openai|gemini|ollama|messages\.create"` over `ingest/pipelines/live_search`, `ingest/pipelines/swfl_search_demand` and `ingest/pipelines/market_aggregates` returned only docstring and comment lines: `engine.py:11`, `:15`, `:16` describe the retired search mode, and `market_aggregates/constants.py:74` names CLAUDE.md.
- Consumers `refinery/packs/freshness-pulse.mts`, `refinery/sources/daily-truth-source.mts`, `refinery/tools/search-demand.mts`, `refinery/lib/swfl_taxonomy.mts` and `refinery/packs/investor-zip-swfl.mts` have no model call. The same grep found only the stale citation text at `daily-truth-source.mts:180`, which is P8 and a string, not a call.
- Second-Opus re-run, 09/26:
  - `grep -n -i -E "anthropic|claude|openai|refinery|gemini|ollama|llm"` over the 3 family workflow YAMLs returned nothing. That includes `refinery`, so no family workflow rebuilds a brain.
  - The same grep over `ingest/pipelines/{live_search,swfl_search_demand,market_aggregates}` `*.py` returned only `engine.py:11`, `:15`, `:16` and `market_aggregates/constants.py:74`, all docstrings.
  - Extended to the `lib/` readers (`lib/desk/loaders.ts`, `lib/charts/gallery-loaders.ts`, `lib/concoctions/defs/asking-price-trend.ts`, `lib/signals/change-evaluator.ts`): no hit. The freshness-pulse hits are "no LLM" comments (`freshness-pulse.mts:10`, `:123`, `:158`), and `investor-zip-swfl.mts:44`, `:629` say the math never sees a model.
  - `grep -n -i -E "anthropic|ANTHROPIC_API_KEY|claude" .github/workflows/nightly-chain.yml`, the caller, returned nothing.
  - Result: the list is complete. Zero LLM legs in family 02; one adjacent leg (below).

One adjacent leg is reachable from this family's failures:
- What it does: `.github/scripts/heal-cron-failure.mjs:218-231` writes a narrative diagnosis with model `claude-haiku-4-5` and comments it on the incident issue.
  - It fires for this family when a DataForSEO 402 is classified DATA_EMPTY (P5).
  - `gh issue view 196` shows it posted a diagnosis comment for the 09/02 failure.
- Current auth: an API-key environment variable (`:214`). With no key set it falls back to a deterministic diagnosis (`:214-216`). This describes the file as it is. Nothing here proposes keeping, adding or funding that key: this family's route out of the leg is item 10 (Lane D).
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

First-draft totals: 42 claims checked. 7 corrected in the sections above: claims 5, 37, 38, 39, 40, 41 and 42. 2 could not be verified: claim 11, and part of claim 22.

Second-Opus extension, 09/26. These are numbers and claims the first log did not cover, plus the second Opus's corrections, each re-run:

43. 275 seeds × 3 locations. Check: `ingest/cadence_registry.yaml:1865` summary text, `constants.py:38-42` (3 entries), and SQL 06/2026 = 275 rows per location. Verified.
44. 123 no-volume keywords per location. Check: SQL `count(*) where avg_monthly_searches is null group by captured_month, location` = 123 in each of 06, 07 and 08/2026. Verified.
45. `timeout-minutes: 25` for live-search and 15 for search demand. Check: `grep -n timeout-minutes` gives `live-search-daily.yml:35` and `swfl-search-demand-monthly.yml:26`. Verified.
46. Realtor cron `"0 14 4 * *"`, next fire 10/04/2026 14:00 UTC. Check: `realtor-geo-trends-monthly.yml:17`. Verified.
47. Live-search's own cron retired 07/12. Check: `live-search-daily.yml:4-11`, and `gh run list --workflow live-search-daily.yml` newest run 29193543702 on 07/12. Verified.
48. P6 first seen 06/03. Check: SQL `min(inserted_at)` of the 06/2026 NULL rows = 06/03/2026 19:27 UTC. Verified.
49. Issue #178 is the open nightly-chain incident. Check: `gh issue view 178` shows OPEN "[cron-failure:nightly-chain] DATA_EMPTY · Nightly Chain — 2026-08-15". Verified.
50. 127 vs 124. Check: SQL `period >= '2026-08-15'` = 127 and `period > '2026-08-15'` = 124, so the difference is the 3 rows dated 08/15. Verified.
51. Job 108378684140 is the live-search leg in run 36232679167. Check: `gh run view 36232679167 --json jobs`. Verified.
52. Inventory medians 399200 / 325000 / 650000. Check: SQL `percentile_cont(0.5)` over `listing_active_homes` by city, n = 4254 / 4087 / 5300, max scraped_at 08/14 04:28 UTC. Verified.
53. Mortgage retrieved_at pattern (newest-only fetch). Check: SQL per-period retrieved_at, plus `engine.py:145-159` `limit: 1`. Corrected the section 2 wording.
54. Charts gallery reads mortgage. Check: `lib/charts/gallery-loaders.ts:180-183` and Grep `mortgage` in that file. Corrected: it does not.
55. Missed downstream reader. Check: Grep `freshness_mortgage_30yr_fixed_pct` finds `lib/signals/change-evaluator.ts:84`. Gap filled in section 1.
56. market_aggregates tests as realtor evidence. Check: Grep `geo_trends|parse_geo_trends|realtor_geo` over `ingest/**/test_*.py` gives 1 file, the contract registry test only. Corrected in section 3.
57. Who wrote #196's wrong advice. Check: `gh issue view 196 --json body,comments`, `classify-cron-failure.mjs:170-175`, `heal-cron-failure.mjs:261`, `:298`. Corrected in P5.
58. Realtor contract test sites. Check: `grep -n "realtor" ingest/tests/quality/test_contract_registry.py` gives :232, :241, :251, :262, :277, plus `contracts.py:190` returning []. Corrected item 6 from 3 sites to 5.
59. Runner handoff citation. Check: `grep -n -i leepa docs/superpowers/handoffs/2026-09-20-runner-live-what-is-next.md` gives :47-49. Corrected in section 9.
60. P1 first-seen wording. Check: 08/16 - 08/14 = 2 days, matching SQL cut `> scrape_date + 1`. Corrected ("more than 1 calendar day").
61. P4 cause certainty. Check: `gh run view 33672286964 --log-failed` shows only "402 Client Error: Unknown" plus the three-candidate RuntimeError. Corrected: tagged [INFERENCE].
62. Doctor freshness and run pillar (P12). Check: local `python -m ingest.scripts.doctor --json` 09/26: search demand FRESH age 55, realtor FRESH age 53, NO_RUNS_IN_WINDOW on 4 entries, 22 workflows NO_RUNS_IN_WINDOW overall; `check_freshness.py:499`, `:515-516`. Gap filled. The run-pillar cause is not verified.
63. STALE dates 10/02 and 10/04. Check: `age_days > int(30 * 2.0)` from `check_freshness.py:499`, `:515-516`. Verified as arithmetic.
64. airdna absent from the doctor output. Check: the same doctor JSON walk printed 4 family entries, none of them airdna. Verified.
65. Realtor overlap contract stale-green. Check: SQL on `data_lake.realtor_redfin_median_overlap` gives 5 rows with non-null redfin (realtor_as_of 08/04, redfin period_end 08/31), so `realtor_redfin_overlap_coverage_floor` returns 0. Verified.
66. Item 12 proof command. Check: `rg -n "19.95|40-100|20-100"` today hits exactly `data-inventory.md:177` and registry `:2369`, `:2385`, `:2388`, `:2392`. Verified: the proof can reach "nothing".
67. Item 10 also silences the heal-cron source-URL block. Check: `heal-cron-failure.mjs:261` `if (c.klass !== "DATA_EMPTY") return null`. Verified.
68. The item 4 and item 10 proof test files exist. Check: `ls ingest/tests/scripts/` gives test_check_freshness.py and test_doctor.py, and `ls .github/scripts/classify-cron-failure.test.mjs`. Verified.
69. FRED and AirDNA pages. Check: crawl4ai re-run 09/26: FRED "Updated: Sep 24, 2026 11:02 AM CDT", "Next Release Date: Oct 1, 2026"; AirDNA "Market Research ... $125 / month ... $34/ month billed $400 annually", Adapt "$20/month per listing". Verified.
70. Test counts. Check: re-run 9 / 2 / 16 / 12 / 16 passed and bun 22 pass 0 fail. Verified.
71. Chain overall conclusion. Check: `gh run list --workflow nightly-chain.yml --limit 15` shows 15 failures, and run 36232679167 jobs show the red legs. Gap filled in section 3.
72. LLM greps extended to lib readers and the caller chain. Check: the section 10 greps. Verified, zero hits.
73. Doctor severity of freshness STALE. Check: `ingest/scripts/doctor.py:74-79` (`"STALE": "yellow"`) and `:90-95` (red only on a `freshness_sla` breach), plus `sed -n` over both registry blocks, which gives 0 `freshness_sla` lines. Verified. The second Opus's own first wording ("red lines") was corrected before it shipped.
74. airdna has no pipeline code. Check: `grep -rli airdna .github/workflows ingest/pipelines ingest/duckdb_pipelines` returns nothing. Verified.

Totals after the second Opus: 74 entries. Of the first 42, the second Opus re-ran or re-opened 41; claim 41 (the ops coverage page) was not re-checked. 32 new entries (43-74) were re-run. Corrections applied in sections 1-9: 8 (entries 53, 54, 56, 57, 58, 59, 60, 61). Gaps filled: entries 55, 62, 64, 71, 72, 73 and 74, plus the section 5 interior-hole line with plan item 13, the section 8 10/02 and 10/04 timing, and the section 3 airdna line. Could not verify: claim 11, part of claim 22, claim 41, and the P12 run-pillar cause.

## 12. Questions for the operator

- Q1 (money). The DataForSEO account behind `swfl_search_demand` returned 402 on all three locations on 09/02. That is that vendor's own account balance, not ours to decide. Restore it and keep the monthly keyword pull, or park the pipeline (item 7)? An answer before 10/02/2026 keeps the doctor from turning it STALE (P12).
- Q2 (a `data_lake` write). The /desk "Live asking median" has shown the 08/14 inventory median dated as today since 08/16. May I NULL those 124 rows and delete the 63 dead `median_sale_price` NULL rows (item 2), so /desk shows the last true reading with its real date?
- Q3 (brain output shape). Add the FRED 15-year fixed rate (`MORTGAGE15US`, same release, same call) to freshness-pulse as a fifth metric (item 11), or leave the 30-year alone?

## 13. Second-Opus verification

Run 09/26/2026 by the second Opus against live sources: `gh run list` / `gh run view` / `gh issue view`, read-only Bun.SQL SELECTs (scratchpad script, connection copied from `scripts/apply-fdic-sod-view.mts:15-27`), the pytest and bun suites, crawl4ai on FRED and AirDNA, the read-only doctor, and every file:line cited.

Claims checked: 73
- 41 of the first draft's 42 double-check claims were re-run or re-opened. Claim 41 (the ops coverage page) was not re-checked.
- 32 new entries (section 11, entries 43-74) were re-run.

Corrections (8), each one line: what was wrong → what is right → evidence
- Section 1: the charts gallery was listed as a mortgage consumer → it reads only `median_asking_price` → `lib/charts/gallery-loaders.ts:180-183`; Grep `mortgage` in that file returns nothing.
- Section 2: mortgage "re-upserted daily" implied every row is refreshed → only the newest observation is fetched (`limit: 1`) and re-upserted; older rows keep the retrieved_at of their last day as newest → `engine.py:145-159`; SQL shows period 06/18 retrieved 06/25.
- Section 3: the 16 market_aggregates tests were offered as realtor_geo_trends evidence → 0 of them touch geo_trends, and the resource has no unit test → Grep `geo_trends|parse_geo_trends|realtor_geo` over `ingest/**/test_*.py` hits only the contract-registry test.
- P1: first seen "more than 2 days past the 08/14 scrape" → 08/16 is exactly 2 days, i.e. more than 1 calendar day, matching the SQL cut → `period > max(scraped_at)::date + 1`.
- P4: DataForSEO account balance was stated as fact → it is an [INFERENCE] from HTTP 402 plus the pipeline's three-candidate error text → `gh run view 33672286964 --log-failed`.
- P5: blamed the model comment on #196 for the dead-URL advice → the model's diagnosis is correct (402, balance), and the wrong text is deterministic: the classifier's DATA_EMPTY suggestedAction (issue body line 8) and the heal-cron "Source URL to check" block → `gh issue view 196 --json body,comments`, `classify-cron-failure.mjs:170-175`, `heal-cron-failure.mjs:261`, `:298`.
- Item 6: said to remove 3 test sites → there are 5: `:232`, `:241` and `:251` fail, and `:262` plus the `:277` parametrize entry pass vacuously → `grep -n realtor ingest/tests/quality/test_contract_registry.py`, `ingest/quality/contracts.py:190`.
- Section 9: cited handoff `:8-16` for all five runner workflows → the LeePA annuals are at `:47-49` → `grep -n -i leepa docs/superpowers/handoffs/2026-09-20-runner-live-what-is-next.md`.

Unverifiable claims (why)
- Which run wrote the 07/18 realtor rows (claim 11). `gh run list --workflow realtor-geo-trends-monthly.yml` shows only 2 runs (08/04, 09/04).
- Whether an AirDNA Market Research plan exports SWFL ZIP-level data (claim 22). The pricing page does not say, and an answer would need an account.
- The ops coverage page's behavior (claim 41). The ops repo was not read in either pass.
- Why the doctor's targeted backfill leaves the two monthly workflows at NO_RUNS_IN_WINDOW (P12). The `max_backfill=40` cap is ruled out (22 workflows in that state), and the path was not traced further. The CI doctor may also differ from the local run.
- The DataForSEO balance itself. No vendor response body is logged, so this cannot be checked without a billed call (P7).

Gaps filled
- Section 1: the downstream reader `lib/signals/change-evaluator.ts:84` of the freshness-pulse mortgage slug.
- Section 3: the chain concluded failure in 15 of 15 runs; the family's leg was green in all 15, and the red legs belong to other families.
- Section 4: new P12, where the doctor reads FRESH at ages 55 and 53 for a failed and a zero-row monthly, with a 60-day window (`check_freshness.py:499`, `:515-516`) and a blind run pillar.
- Section 5 and plan item 13 (DO, Lane D, S): the FRED `limit: 1` interior-hole gap. The plan is now 13 items: 10 DO, 3 ASK-FIRST.
- Section 7 item 10: made explicit that the new class also silences the heal-cron source-URL block (`heal-cron-failure.mjs:261`), so both wrong texts go.
- Section 3: an airdna line. There is no code (`grep -rli airdna` over workflows and pipeline dirs is empty), the consumer ships empty-tolerant (`investor-zip-swfl.mts:245-246`), and airdna is absent from the doctor JSON.
- Section 8: the 10/02 (search demand) and 10/04 (realtor) STALE timing for items 6 and 7. STALE is yellow for entries with no `freshness_sla` (`doctor.py:74-79`, `:90-95`), so it adds yellow noise rather than a new red. Also direct doctor-JSON evidence that `not_yet_running:` entries are excluded (airdna absent).
- Section 9: an explicit statement that no family pipeline moves to the Fedora runner, so no `SWFL_LOCAL_RUNNER_READY` gate or `[self-hosted, swfl-local]` label is proposed.
- Section 10: the LLM grep extended to the 4 `lib/` readers and the caller `nightly-chain.yml`, with zero hits. The list stands at 0 in-family legs and 1 adjacent leg.

Coverage: all five pipelines (live_search_daily_median_asking, live_search_daily_mortgage, realtor_geo_trends, swfl_search_demand, airdna_str_swfl) appear in sections 2, 3 (airdna line added by the second Opus), 4 (airdna: P11 doc drift only), 6, 7 (airdna: item 12's price-line fix), 8 and 9. None is missing.

Section 8 audit: no per-run GitHub issue filing survives. Every signal is a probe content contract that opens and closes one `public.checks` row (`check_data_quality.py:339-368`). Incident issues stay one per workflow (`log-cron-incident.mjs:228`). Each active pipeline has exactly one named signal: `daily_truth_asking_outlives_inventory`, `daily_truth_mortgage_period_stale`, and `swfl_search_demand_newest_month_stale` (restore branch only). Realtor is retired and airdna parked, both with none. The noise list is concrete: issue #196, contract block `data_lake.realtor_redfin_median_overlap` (`quality_registry.yaml:555`), the 63 `median_sale_price` NULL rows, the doctor's "landed 294", and the five realtor test sites.

Credit-suggestion count: 0.
- `grep -n -i -E "credit|top up|top-up|console balance|api key|api-key|balance|fund|billing"` over this file hits lines about the DataForSEO vendor balance (P4, section 6, item 7, item 10's prescription, section 9, Q1). All of them are the operator's vendor-money decision, not Anthropic credit.
- It also hits the Anthropic `billing_error` classifier branch (P5), which describes code, and the section 10 line on heal-cron-failure's current auth. That line now says explicitly that nothing proposes keeping or funding the key.
- Two lines were tightened to remove any misreading: P5's "billing 402" became "vendor-payment 402", and the section 10 auth line.

Grade: PASS-WITH-CORRECTIONS. The plan stands after the edits above; no rewrite is needed.
