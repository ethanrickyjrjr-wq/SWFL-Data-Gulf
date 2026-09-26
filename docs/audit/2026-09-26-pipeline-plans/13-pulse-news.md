# 13 pulse-news — pipeline plan (09/26/2026)

Family 13 covers five registry names: city_pulse, city_pulse_corridors, city_pulse_corridors_tier2, news_swfl and swfl_inc. They run on four workflows and write four tables. The spine is the news lake (news_swfl → data_lake.news_articles_swfl). It is green on every run, but it has written zero Collier County government rows since 06/22. The fix shipped on 07/26 went into the fetch path that the cron does not use. Both pulse distill legs are dead on the credit wall. city_pulse has been red every night since 09/09, and the row gate and the doctor both still read it green. Corridor pulse has been paused since 07/05, even though its crawl4ai retrofit shipped 07/07. swfl_inc runs, but 0 of its 35 rows carry an investment or jobs figure. Verdict: REPAIR city_pulse, city_pulse_corridors and news_swfl. IMPROVE city_pulse_corridors_tier2 and swfl_inc. The two LLM legs move to Lane M (the Max login on the Fedora box, where claude 2.1.271 is already installed) with tools disabled and a scrubbed environment. Four data-quality checks replace every per-run GitHub issue, and each one closes itself when the condition clears.

## 1. Scope

Five registry names, four workflow files, four tables. A fifth, unregistered, dispatch-only workflow (`pulse-pool-evict.yml`) deletes from the news table; it is listed under news_swfl and in P15. Every count below comes from the commands in the evidence key.

- city_pulse
  - Registry: `ingest/cadence_registry.yaml:558`.
  - Workflow: `.github/workflows/city-pulse-daily.yml`, clocked by `nightly-chain.yml:140-145` as a workflow_call member.
  - Table: `data_lake.city_pulse`.
  - Consumers:
    - `refinery/sources/city-pulse-source.mts:44,152-157` → `refinery/packs/city-pulse-swfl.mts` → master (`refinery/packs/master.mts:247,308`)
    - `lib/pulse/nearby.ts:68,77` → `components/narratives/PulseNearby.tsx` and `app/r/zip-report/[zip]/page-data.ts`
    - `app/api/mcp/server.ts:139` (WEB_REPORTER_SLUGS)
    - `lib/zip-dossier.ts:185`. This is a brain coverage map (grains and counties), not a table read. Its comment at `:184` still says "7 cities".
    - Brain-level readers (second-Opus addition, `rg -n "city-pulse-swfl" lib app`): `lib/email/activation/delta.ts:54,64` (activation email signal changes) and `lib/highlighter/reach.ts:219`.
- city_pulse_corridors
  - Registry: `ingest/cadence_registry.yaml:600`.
  - Workflow: `.github/workflows/corridor-pulse-weekly.yml` (dispatch-only).
  - Table: `data_lake.city_pulse_corridors`.
  - Consumers:
    - `refinery/sources/corridor-pulse-source.mts:43,141-146` → `refinery/packs/corridor-pulse-swfl.mts` → `refinery/packs/cre-swfl.mts:974,2143,2148` → master
    - `lib/pulse/corridor-nearby.ts:27` → `app/r/cre-swfl/[corridor]/page.tsx`
    - `lib/zip-dossier.ts:187` (brain coverage map, as above)
    - Brain-level readers (second-Opus addition): `lib/email/activation/delta.ts:55,65` and `lib/highlighter/reach.ts:221`.
- city_pulse_corridors_tier2
  - Registry: `ingest/cadence_registry.yaml:1671`.
  - Same workflow and same table as city_pulse_corridors. This is a recency watchdog entry, not a separate scrape (`ingest/cadence_registry.yaml:1680-1689`).
- news_swfl
  - Registry: `ingest/cadence_registry.yaml:2034`.
  - Workflow: `.github/workflows/news-swfl-ingest.yml`.
  - Table: `data_lake.news_articles_swfl`.
  - Consumers:
    - `lib/desk/loaders.ts:410` (/desk flash)
    - `app/insiders/_lib/desk-stats.ts:117` (newsThisMonth)
    - `lib/email/insiders/dossier.ts:59` (insiders email)
    - `ingest/lib/pulse_lake.py`, the distill corpus for both pulse pipelines
    - `app/api/cron/news-crawl/route.ts:53`, which has no scheduler (see Problems)
    - A deleter, not a reader (second-Opus addition): `.github/workflows/pulse-pool-evict.yml` runs `ingest/pipelines/pulse_pool_evict.py`, which deletes rows with `published_date < today - 45` (`ingest/lib/pulse_lake.py:106-107`). It is dispatch-only, has 0 runs (`gh run list --workflow pulse-pool-evict.yml` returns nothing), its state is active (`gh api .../actions/workflows/pulse-pool-evict.yml --jq .state`), and it has no registry entry. Gate 10 exempts dispatch-only workflows (`scripts/schedule-catalog.mjs:101`), so that is not a gate violation. See P15.
    - Naming trap: the `news-swfl` brain (`refinery/packs/news-swfl.mts:21`, and `app/api/mcp/server.ts:139`) is the FL DBPR enforcement pack. It reads dbpr_press_releases and dbpr_public_notices and never reads this table. No refinery pack reads news_articles_swfl (`rg -n news_articles_swfl refinery` returns nothing); the registry's consuming_pack is `app/insiders` (`cadence_registry.yaml:2036`).
- swfl_inc
  - Registry: `ingest/cadence_registry.yaml:1392`.
  - Workflow: `.github/workflows/swfl-inc-weekly.yml`.
  - Table: `public.swfl_inc_announcements`.
  - Consumer: `refinery/sources/swfl-inc-source.mts` → `refinery/packs/econ-dev-swfl.mts` → master (`refinery/packs/master.mts:246,307`).
  - Brain-level readers of econ-dev-swfl (second-Opus addition, `rg -n "econ-dev-swfl" lib app`): `lib/email/activation/delta.ts:59,69`, `lib/highlighter/reach.ts:187`, `lib/zip-dossier.ts:181` (coverage map).

Tie to NORTH STAR (`_ASSISTANT/NORTH-STAR.md`). This plan extends priority 4, "one job owner per source, actual source-period freshness" (lines 19-22). The news lake and swfl_inc are also raw inputs to priority 5, the local project dossier on development and redistribution.

### Evidence key (every figure below names one of these)

SQL runs through a throwaway, read-only Bun.SQL script in the session scratchpad. It copies the connection approach in `scripts/apply-fdic-sod-view.mts:10-30` and is never committed:

```
bun "<scratchpad>/fam13-pulse-news-q.mts" "<SQL>"
```

- Q1: `select count(*), count(*) filter (where expires_at > now()), max(captured_at), min(captured_at), max(expires_at), count(distinct city) from data_lake.city_pulse`
  - Result: 100 rows, 95 live, max captured 09/08/2026, min 06/28/2026, max expires 12/07/2026, 8 cities.
- Q2: `select topic, count(*), live, live heads from data_lake.city_pulse group by topic`
  - Result: structural only, 100 rows / 95 live / 52 live story heads.
- Q3: live rows and last capture per city
  - Cape Coral 18 / 09/08
  - Fort Myers 29 / 09/08
  - Naples 43 / 09/08
  - Estero 1 / 09/08
  - Bonita Springs 1 / 07/05
  - Marco Island 1 / 07/05
  - Sanibel 2 / 07/09
  - Fort Myers Beach 0 / 06/28
- Q4: `select min(d) ... where live < 50` over generate_series → 10/24/2026. The same shape run on story heads = 0 → 12/07/2026.
- Q5: city_pulse_corridors → 198 rows, 6 live, 5 live story heads, max captured 07/05/2026, min 06/01/2026, max expires 10/03/2026.
- Q6: verified corridor_profiles grouped by city
  - Bonita Springs 2, Cape Coral 3, Estero 3, Fort Myers 7, Fort Myers Beach 1, Lehigh Acres 2, Naples 9.
  - Total 27. Lee 18, Collier 9, Hendry 0.
- Q7: news_articles_swfl → 590 rows, max scraped 09/26/2026, published_date range 06/22/2026 to 09/26/2026.
- Q8: news_articles_swfl per source_name (rows, max scraped, rows scraped in the last 7 days)
  - business_observer 255 / 09/26 / 45
  - fort_myers_news_press 146 / 09/26 / 42
  - naples_daily_news 155 / 09/26 / 43
  - gulfshore_business 26 / 09/26 / 6
  - collier_county_govt 5 / 06/22 / 0
  - lee_county_govt 3 / 06/22 / 0
- Q9: `select current_date - date '2026-06-22', count of published_date >= (current_date-3)::text, same for (current_date-6), current_date - date '2026-09-08'`
  - Result: Collier dark 96 days, 40 new URLs in the last 4 days, 49 in the last 7 days, pulse dark 18 days.
- Q10: `select count(*) filter (where processed_at is not null) from data_lake.news_articles_swfl` → 0 of 590.
- Q11: non-article URLs per source
  - business_observer: 9, all listing, pagination or category pages (`?page=1..5`, `/news/all/`, `/news/advice/`, `/news/40-under-40/`, `/news/change-makers/`).
  - collier_county_govt: 5 of 5 (corrected by the second Opus from "4 of 5"). The URLs are engage.collier.gov/, /Collier-County, /Collier-County/.../myCollier-Newsletter, /Resident-Resources/Conservation-Collier, and a govdelivery .jpg. None is under the `/News-articles/` article path.
  - lee_county_govt: 3 of 3.
  - For September: 1 listing page among 177 rows with published_date >= 09/01.
- Q12: swfl_inc_announcements → 35 rows, max scraped_at 09/14/2026, max inserted_at 09/07/2026, announced 12/16/2021 to 09/01/2026.
  - investment_usd non-null: 0. jobs non-null: 0. category non-null: 12.
  - county: swfl 28, lee 6, collier 1.
  - By announced year: 2021 1, 2022 10, 2023 14, 2025 2, 2026 8.
- Q13 (second Opus): `select source_name, max(gap), count(*) from (select source_name, d, d - lag(d) over (partition by source_name order by d) gap from (select distinct source_name, published_date::date d from data_lake.news_articles_swfl where source_name in (<4 live outlets>)) t) u group by 1`
  - Result: business_observer 3 / 63 dates, fort_myers_news_press 3 / 68, naples_daily_news 6 / 62, gulfshore_business 12 / 14. Gulfshore first-seen dates run 07/15, 07/22, 07/24, 07/31, 08/12, 08/21, 08/27, 08/30, 09/04, 09/05, 09/10, 09/12, 09/16, 09/23.
- Q14 (second Opus): `select count(*), count(*) filter (where source_name in ('collier_county_govt','lee_county_govt')) from data_lake.news_articles_swfl where published_date < (current_date - 45)::text` → 303 rows, 8 of them govt.
- G1: `gh run list --workflow <file> --limit 15 --json databaseId,status,conclusion,createdAt,event`, one call per workflow.
- G2: `gh run view <chain run id> --json jobs`, filtered to the "ingest · city pulse" job, across nightly-chain runs 09/01-09/26.
- G3: `gh run view 36232679167 --job 108378684067 --log` (city pulse job, 09/26).
- G4: `gh run view 36232679167 --log | grep assert_landed` (row gate, 09/26).
- G5: `gh run view 36259690113 --log` (freshness-probe-daily, 09/26: the doctor table and prescriptions).
- G6: the "complete. N new rows" line from 11 green chain city-pulse jobs, run ids listed in §4 P3.
- C1: crawl4ai probe from the pinned venv, 09/26/2026, stealth browser. The script is in the scratchpad (`fam13_probe.py`).
  - collier.gov/News-articles: 200, 10 article links, newest "Published on" dates 09/25, 09/24, 09/23.
  - swflinc.com/blog/: 200, newest "Date posted" 09/23/2026, 09/22/2026, 09/8/2026, 09/1/2026.
  - swflinc.com/blog/business-development: newest 08/11/2026.
  - leegov.com/news: 200 with no article links.
  - leefl.gov: 503.
- T1: `ingest/.venv/Scripts/python.exe -m pytest -q <family paths>` → 72 passed.
  - city_pulse 23, city_pulse_corridors 27, news_swfl 11, swfl_inc 5, ingest/lib/test_pulse_lake.py 6.
  - `ingest/tests/pipelines/news_swfl`: 9 passed.
- T2: `bun test refinery/packs/city-pulse-swfl.test.mts refinery/packs/corridor-pulse-swfl.test.mts refinery/packs/econ-dev-swfl.test.mts refinery/sources/corridor-pulse-source.test.mts` → 25 pass, 0 fail.

## 2. What is being brought in

### city_pulse
- Source: no outside fetch. Per city, the pipeline matches the news lake (`ingest/pipelines/city_pulse/pipeline.py:99` loads a 7-day window). One distill call per city with matches (`distill.py:240`) returns citation-backed facts.
- Fields:
  - Columns: city, topic, fact, source_url, source_title, cited_text, captured_at, expires_at, dedup_key, superseded_by, run_at, story_key, location_anchor, lat, lon, zip_code, geo_grain (information_schema on data_lake.city_pulse).
  - TTL by topic (`distill.py:44-50`): breaking 1d, transactions 7d, development 14d, business 14d, structural 90d.
- Geography:
  - 13 cities (`pipeline.py:46-51`). Lee: Lehigh Acres, Cape Coral, Fort Myers, Estero, Bonita Springs, Fort Myers Beach, Sanibel, North Fort Myers. Collier: Naples, Marco Island, East Naples, North Naples, Golden Gate. Hendry: none by construction.
  - Live coverage (Q3): Lee through Fort Myers, Cape Coral, Estero, Bonita, Sanibel. Collier through Naples and Marco Island. Hendry 0.
- Cadence: nightly through the chain. G2 shows two chain runs per day (a 04:23 UTC dispatch and a schedule backstop around 09:00 UTC), and each runs the pulse job.
- Live (Q1/Q2):
  - 100 rows, 95 live, 52 served story heads, all topic structural.
  - Newest captured_at is 09/08/2026, 18 days ago (Q9).
  - Every non-structural fact has already expired and been pruned. The table now serves only 90-day facts, and it drains: live rows fall below 50 on 10/24/2026 and to 0 on 12/07/2026 (Q4).

### city_pulse_corridors and city_pulse_corridors_tier2
- Source: the same news lake, matched on corridor road names in a 14-day window (`ingest/pipelines/city_pulse_corridors/pipeline.py:163`). One distill call per corridor (`city_pulse_corridors/distill.py:205`).
- Grain: 27 verified corridors (Q6), Lee 18 and Collier 9, Hendry 0. The registry's "Lee (17) + Collier (9)" (`cadence_registry.yaml:619`) sums to 26 and is wrong. Q6 gives 18 + 9 = 27.
- Cadence: weekly by design; paused. `corridor-pulse-weekly.yml:4-12` has the cron commented out.
- Live (Q5):
  - 198 rows, 6 live, 5 served heads.
  - Newest capture 07/05/2026. The last live row expires 10/03/2026.
  - After 10/03 the corridor-pulse brain and `/r/cre-swfl/[corridor]` pulse blocks have nothing.

### news_swfl
- Source: 6 outlets in `ingest/pipelines/news_swfl/fetcher.py:9-51` (Naples Daily News business, News-Press business, Lee County govt, Collier County govt, Gulfshore Business, Business Observer Charlotte-Lee-Collier).
- Fetch path: the cron runs the adaptive BestFirst path. `news-swfl-ingest.yml:49` sets NEWS_ADAPTIVE to '1' unless a dispatch says 'off', which routes through `adaptive_fetcher.py:145`.
- Fields: article_url, headline, body_text (first 3000 chars), source_name, published_date, scraped_at, processed_at, swfl_relevance.
  - published_date is first-seen, carried forward (`novelty.py:3-11`).
  - processed_at is never set (Q10: 0 of 590).
- Geography: a relevance filter on Lee/Collier place terms and 339xx/340xx/341xx/342xx ZIPs (`normalizer.py:5-10`). No Hendry place term, so Hendry is excluded by construction. There is no county column.
- Cadence: cron 06:00 UTC (`news-swfl-ingest.yml:5`). The G1 created times run 10:34-12:37 UTC, so actual starts drift about 5 hours.
- Live (Q7/Q8):
  - 590 rows, newest scrape 09/26/2026.
  - 4 outlets are alive; both county govt sources have been silent since 06/22.
  - About 7 new article URLs per day over the last 7 days (49, Q9) and 10 per day over the last 4 days (40, Q9). Corrected by the second Opus; the first draft said "about 10 per day" against the 7-day figure.
  - Per-outlet cadence (second-Opus query Q13, the largest gap in days between consecutive first-seen published_date values): business_observer 3, fort_myers_news_press 3, naples_daily_news 6, gulfshore_business 12 (14 distinct dates since 07/15). §8 uses these.

### swfl_inc
- Source: 3 SWFL Inc. blog category feeds via crawl4ai (`ingest/pipelines/swfl_inc/pipeline.py:45-49`): business-development, chamber-news, policy.
- Fields: id, title, announced_date, county, category, investment_usd, jobs, summary, source_url, scraped_at, inserted_at (`pipeline.py:368-372`).
- Geography: county is inferred from text (`pipeline.py:205-210`). Q12: swfl 28, lee 6, collier 1, hendry 0.
- Cadence: weekly, Monday 08:00 UTC (`swfl-inc-weekly.yml:7`).
- Live (Q12):
  - 35 rows, freshness column scraped_at 09/14/2026.
  - Newest announced 09/01/2026.
  - investment_usd and jobs are null on all 35 rows.
  - 25 of 35 rows are dated 2021-2023 (Q12 year split: 1 + 10 + 14), still on the listing pages and re-upserted every week. Corrected by the second Opus; the first draft said 23, which is the null-category count.

## 3. What is working

- news_swfl:
  - G1: 15 of 15 scheduled runs green, 09/12 through 09/26. Newest green is 36238163051 (09/26).
  - The 09/26 run fetched 75 SWFL-relevant articles and loaded ("[news_swfl] fetched 75 SWFL-relevant articles", "Load package ... is LOADED and contains no failed jobs", `gh run view 36238163051 --log`).
  - The novelty guard (`pipeline.py:54-62`) and the freeze-on-data_type schema contract (`pipeline.py:21`) are both live.
  - Tests: T1 11 in-dir and 9 in `ingest/tests/pipelines/news_swfl`, all green.
- city_pulse deterministic legs: the lake match, dedup before the paid call (`pipeline.py:101-103`), geo ladder, TTL, prune and supersession all ran on 09/26 (G3: "superseded 0 non-head rows", "pruned 0 expired Tier-2 rows").
  - Last green chain job: run 34207129475 (09/08, G2).
  - Green on every chain run from 09/01 through 09/08 (G2, 16 of 16).
  - Tests: T1 23; T2 includes city-pulse-swfl.test.mts.
- city_pulse_corridors: the capture is already the free lake read (`city_pulse_corridors/pipeline.py:10-12`). No web_search code remains (grep in §10).
  - Last green run is 27497886316 (06/14, G1).
  - Tests: T1 27; T2 covers corridor-pulse-swfl and corridor-pulse-source.
- city_pulse_corridors_tier2: the recency watchdog is correctly defined on captured_at with a 21-day window (`cadence_registry.yaml:1676-1689`).
- swfl_inc:
  - G1: 12 of 15 green (2 failure, 1 skipped). Newest green is 34857092002 (09/14).
  - The stealth crawl passes the swflinc.com WAF from GHA: the 09/21 log shows all 3 feeds fetched (15,820 / 18,429 / 18,145 chars) before the storage step failed.
  - Tests: T1 5.
- Downstream guards that hold:
  - econ-dev-swfl emits the investment and jobs metrics only when the sum is > 0 (`refinery/packs/econ-dev-swfl.mts:230,248`), so the all-null columns serve no fake zero.
  - The classifier already maps the credit wall to BILLING, never-retry (`.github/scripts/classify-cron-failure.mjs:83-88`, `ingest/lib/prescriptions.py:36,107-110`).

## 4. Problems

P1. news_swfl: Collier County government news has been dark for 96 days, and the 07/26 "repair" never reached the cron path.
- Symptom:
  - Q8: collier_county_govt max scraped 06/22/2026, 0 rows in the last 7 days.
  - Q9: 96 days dark.
  - C1: collier.gov/News-articles is live, with items dated 09/23-09/25.
  - The 09/26 run log shows "[COMPLETE] ● https://www.collier.gov/News-articles | ✓", yet no row landed.
- Root cause:
  - `news-swfl-ingest.yml:49` defaults NEWS_ADAPTIVE to '1', flipped on 06/22 in commit 06260370 (`git log -S NEWS_ADAPTIVE`).
  - `adaptive_fetcher.py:51` limits candidates to `*/story/*`, `*/article/*`, `*/news/*`, `*/releases/*` and ignores the source's `article_path`.
  - The 07/26 fix e490aeeb touched only the baseline `fetcher.py` (`git show --stat e490aeeb`).
  - Proven locally with crawl4ai 0.9.0 (the version pinned in `ingest/requirements.txt:19`): `URLPatternFilter(patterns=[those four]).apply("https://www.collier.gov/News-articles/some-release")` returns False.
  - The adaptive path also drops the real publish date (`adaptive_fetcher.py:128` passes `published_date=None`).
  - The test that should catch this uses the dead domain (`test_adaptive_fetcher.py:92-94`, colliercountyfl.gov), so it passes.
- Severity: blocks a consumer.
  - Collier govt news is absent from /desk, the insiders email, and the Collier-city pulse corpus.
  - The registry note claims "Collier repaired 07/26/2026" (`cadence_registry.yaml:2054`). Verified: it is not. That note needs correction.
- First seen: 06/22/2026 (Q8 max scraped).

P2. city_pulse: the distill leg is dead on the credit wall, 18 nights running.
- Symptom:
  - G2: every chain city-pulse job red from run 34310762619 (09/09 04:23 UTC) through 36232679167 (09/26); the last green was 34207129475 (09/08).
  - G3 on 09/26: "7 city(ies) errored: ['Cape Coral', 'Fort Myers', 'Naples', 'Estero', 'Marco Island', 'East Naples', 'North Naples']", each a `400 credit balance too low` (for example request_id req_011CfRow1kxs5iBLKihzSu8q). Then "complete. 0 new rows across 13 cities", exit code 1.
- Root cause: `ingest/pipelines/city_pulse/distill.py:195` builds the client from ANTHROPIC_API_KEY, which `city-pulse-daily.yml:54` injects. The leg has no other lane.
- Severity: blocks a served number. The city-pulse brain serves only structural facts, all 09/08 or older (Q2/Q3), and drains to empty by 12/07 (Q4).
- First seen: 09/09/2026 (G2).
- Tracked: this is the open check `llm_legs_parked_credit_wall` (`node scripts/check.mjs list`).

P3. city_pulse: the row gate and the doctor both read green while the leg is dead.
- Symptoms:
  - G4: "✅ `city_pulse` — **LANDED** — 100 rows >= floor 50" on 09/26.
  - G5 doctor row: "| `city_pulse` | table | FRESH | GATED_BY_ASSERT_LANDED | NO_CONTRACT | GREEN | 🟢 green |".
- Root cause, three parts:
  - (a) `assert_landed.py:70-71` reads tier-1 inventory freshness. `city_pulse/pipeline.py:112-141` uploads a Tier-1 NDJSON and writes an inventory row even for cities with 0 matched articles. G3 shows 6 such uploads on 09/26 ("uploaded Tier-1 + wrote 0 new rows"), so "last landed" is always today.
  - (b) `assert_landed.py:93-117` counts every row in `count_table` with no expiry filter, while the registry comment says the floor is "non-expired" (`cadence_registry.yaml:578`). Q1: 100 counted, 95 live.
  - (c) The doctor keys run health on `workflow: city-pulse-daily.yml` (`ingest/scripts/doctor.py:370-372`; runs are joined by workflowDatabaseId, `ingest/lib/gh_runs.py:20`, with a per-workflow backfill at `:81-85`). That workflow's own newest run is 07/12 success (G1); the chain's workflow_call jobs belong to the chain's run. The exact GREEN branch is not traced line by line and needs review.
- Severity: blocks a consumer. The gate will not go red on its own until 10/24 (Q4), 46 days after the leg died.
- Correction to standing docs: the brief (`00-BRIEF.md:147-149`; the first draft cited `:142-144`, corrected by the second Opus) and `wiki/pipeline-census.md:43` say city pulse is part of why the gate fails. G4 shows the gate is red only on "listing_lifecycle — STALE". City pulse reds the chain as a failed job, not as a gate row.
  - Verified: gate row LANDED, job red.
  - Needs review: the census line.
- First seen: 09/09/2026 (the first red job with a green gate row, G2).

P4. city_pulse and corridors: the pulse runs before the news it reads, and runs twice a night.
- Symptom:
  - Chain runs start 04:23 UTC and around 09:00 UTC (G2). news_swfl runs start 10:34-12:37 UTC (G1). Every pulse run therefore distills the previous day's lake.
  - Both chain runs execute the pulse job every day (G2: two city-pulse job rows per date). While the chain is red, the schedule backstop is never skipped. `nightly-chain.yml:25-37`: the guard skips only when a dispatch run already "succeeded".
- Root cause: city pulse is a chain member (`nightly-chain.yml:140-145`), not triggered by news landing.
- Severity: cosmetic today, since dedup at `pipeline.py:101-103` stops double distill of the same article once a first run writes. On any Lane M route it would double the calls on every red night.
- First seen: 07/12/2026, when the cron was retired into the chain (`city-pulse-daily.yml:9-15`).

P5. city_pulse_corridors: paused for a reason that no longer exists.
- Symptom: G1 shows 8 runs total. 3 green (06/01, 06/07, 06/14), 3 cancelled at the old 45-minute wall (06/21, 06/28, 07/05), and 2 dispatch failures on 07/05 (`400 credit balance too low` on all 27 corridors, run 28742715367: "27 corridor(s) errored").
- Root cause: the header says paused until the crawl4ai retrofit lands (`corridor-pulse-weekly.yml:4-7`). The retrofit landed 07/07 (`city_pulse_corridors/pipeline.py:10-12`), but the cron was never re-lit, and the distill leg still needs a model lane (`city_pulse_corridors/distill.py:201`).
- Severity: blocks a served number. 5 served heads, last one expires 10/03 (Q5).
- First seen: 07/05/2026.

P6. news_swfl: a stale allowlist makes the doctor yellow every day.
- Symptom: G5 row "| `news_swfl` | table | FRESH | OK | FAIL | GREEN | 🟡 yellow |".
- Root cause: `ingest/quality/quality_registry.yaml:57-58` accepted_values lists 4 sources and omits gulfshore_business and business_observer (281 rows between them, Q8).
- Severity: cosmetic (warn), but it is daily noise that hides a real content fail.
- First seen: 07/14/2026, when those two sources were added (commit a36d99ac, `git log --format='%h %ci' -- ingest/pipelines/news_swfl/fetcher.py`).

P7. news_swfl: listing, pagination and nav pages stored as articles.
- Symptom: Q11 finds 9 Business Observer listing or category URLs, and 8 govt nav-chrome rows (Collier 5, Lee 3; corrected from 7 / Collier 4 by the second Opus, see Q11).
- Root cause: `adaptive_fetcher.py:51` accepts any `*/news/*` URL, including `?page=N` and section roots.
- Severity: cosmetic. 1 of 177 September rows (Q11) inflates the /insiders newsThisMonth count (`app/insiders/_lib/desk-stats.ts:115-120`).
- First seen: the known-problems ledger already lists the govt nav-chrome rows (`docs/audit/2026-07-11-pipeline-problems/02-known-problems-ledger.md:120`).

P8. news_swfl: Lee County govt has been upstream-dark for 96 days, and the batch-global guard cannot see it.
- Symptom:
  - Q8: lee_county_govt max scraped 06/22.
  - The 09/26 run log shows "net::ERR_INVALID_AUTH_CREDENTIALS at https://www.leegov.com/news/_layouts/15/Authenticate.aspx".
  - C1: leefl.gov returns 503.
- Root cause: upstream (SharePoint auth wall), as already recorded in `docs/handoff/2026-07-11-reliable-sources-findings.md:270-272`. The novelty guard is batch-global (`cadence_registry.yaml:2054`), so one dead source never trips it.
- Severity: blocks a consumer (Lee govt news absent).
- First seen: 06/22/2026.

P9. news_swfl: the project-alert consumer is orphaned.
- Symptom:
  - Q10: 0 of 590 rows have processed_at set.
  - `vercel.json` has exactly two crons, `/api/mls/sync` and `/api/cron/nightly-chain-dispatch`.
  - A repo-wide search for "news-crawl" finds no caller of the route.
- Root cause: the scheduler is gone. The route also 500s at the projects step by its own KNOWN-DEBT note (`app/api/cron/news-crawl/route.ts:40-43`, deferred by the operator 06/26).
- Severity: blocks a consumer (project_events gets no news events).
- First seen: could not verify when the Vercel cron was removed. The route has been broken since 06/26 per its own comment.

P10. swfl_inc: the signal fields are empty, and the feed choice misses posts.
- Symptom:
  - Q12: 0 of 35 rows carry investment_usd or jobs.
  - 23 of 35 have null category.
  - C1: the bare /blog/ index lists a 09/8/2026 post that the table does not hold. The second Opus's re-run of C1 (09/26) also shows an 08/26/2026 post on /blog/ that the table does not hold, and it was published before the green 08/31, 09/07 and 09/14 runs (G1), so it is a feed-choice miss, not a failed-run miss. The 2026 rows are 09/01, 08/14, 08/11, 05/29, 05/27, 05/13, 04/25 and 04/23 (Q12 detail query). Our 3 category feeds top out at 08/11 for business-development.
- Root cause:
  - The feed list is hardcoded to 3 categories (`pipeline.py:45-49`).
  - SWFL Inc. posts are chamber and event items that do not state dollars or jobs, so the parse at `pipeline.py:179-202` finds nothing.
- Severity: blocks a served number.
  - econ-dev-swfl's brain direction rests on 1 prior row versus 0 recent. The local copy `brains/econ-dev-swfl.md:37` reads "last 90 days: 0 projects. Prior window (90–180 days): 1 projects. Momentum: falling."
  - The 90-day count excludes most posts through `QUALIFYING_CATEGORIES` (`econ-dev-swfl.mts:61`).
- First seen: 06/01/2026, the first run (`cadence_registry.yaml:1407`).

P11. swfl_inc: a storage timeout killed the DB write, and the incident is mislabeled.
- Symptom: run 35614476420 (09/21) "RuntimeError: Storage upload failed 544: {...'DatabaseTimeout'...}". Issue #212 is labeled "Class: `TRANSIENT` (429)" (`gh issue view 212`).
- Root cause:
  - `pipeline.py:447` uploads Tier-1 before the DB upsert at `:462`, so a storage outage aborts a DB write that would have succeeded.
  - The 09/21 date matches the platform-wide PGRST002 window in the brief.
  - Why the classifier printed "429" needs review; it belongs to family 19.
- Severity: cosmetic for the data. It is one weekly miss; the 21-day window (`cadence_registry.yaml:1396-1397`) keeps the Fresh column FRESH (G5).
- Correction (second Opus): the doctor row is not green. G5 prints "| `swfl_inc` | table | FRESH | OK | NO_CONTRACT | RED | 🔴 red |". The Run column reads the 09/21 failure, so the whole row has been red since 09/21 and stays red until the next green Monday run. That is a false red on a pipeline whose data is fine, and item 10 removes its cause.
- First seen: 09/21/2026.

P12. Provenance labels on served citations are stale.
- Symptom:
  - `refinery/sources/city-pulse-source.mts:208` says "daily Anthropic web_search_20250305 ... 7 cities".
  - `refinery/sources/corridor-pulse-source.mts:199` says "web_search / Firecrawl".
- Root cause: the capture has been a crawl4ai lake read of 13 cities since 07/07 (`city_pulse/pipeline.py:9-11,46-51`).
- Severity: cosmetic, but it is a served citation string, and Firecrawl is banned.
- Tracked: the open check `source_citations_say_firecrawl`.

P13. Stale noise that can never auto-close.
- Issue #105 "[cron-failure:corridor-pulse-weekly] BILLING" has been open since 07/05/2026 (`gh issue view 105`). "Corridor pulse weekly" is not in the watch list of `.github/workflows/log-cron-incident.yml:16-96`, and auto-close only fires on a watched workflow's success (`.github/scripts/log-cron-incident.mjs:140-145`).
- Severity: cosmetic.
- Added by the second Opus: #105's auto-generated body still carries the pre-09/15 BILLING prescription that the classifier no longer emits (the current text at `.github/scripts/classify-cron-failure.mjs:83-90` says PARKED and routes to redesign or a Max session). Leaving #105 open keeps a retired prescription on the board. The check it names, `cron_incident_corridor_pulse_weekly`, is not among the 21 open checks (`node scripts/check.mjs list`).

P14. city_pulse_corridors_tier2: the recency watchdog is switched off (added by the second Opus; the first draft carried this only in §6).
- Symptom: G5 doctor row "| `city_pulse_corridors_tier2` | table | STALE | NO_FLOOR | NO_CONTRACT | DISABLED | 🟡 yellow |". The tier-1 sibling reads "| `city_pulse_corridors` | tier-1 | STALE | NOT_APPLICABLE | NO_CONTRACT | DISABLED | 🟡 yellow |".
- Root cause: `dispatch_only: true` at `cadence_registry.yaml:1674` (and `:603` for the sibling) makes the doctor print DISABLED. The watchdog the entry exists for ("cron ran green but distill wrote 0 rows for weeks", `:1680-1683`) cannot fire while the job it watches is paused. The table itself is 83 days past its newest capture (Q5: 07/05/2026; `date -d` difference to 09/26/2026 = 83).
- Severity: blocks a consumer. Yellow is the ceiling while DISABLED, so nothing escalates as the served heads drain to 0 on 10/03 (Q5).
- First seen: 07/05/2026, the pause.

P15. pulse-pool-evict.yml would delete half the news lake and fake novelty (added by the second Opus).
- Symptom: Q14: an `apply=true` dispatch today would delete 303 of 590 rows, 8 of them govt. The workflow is active and dispatch-only with 0 runs (§1).
- Root cause: `ingest/lib/pulse_lake.py:106-107` deletes on `published_date < cutoff`. published_date is the carried first-seen date (`novelty.py:3-11`), and `carry_first_seen` can only carry a date that is still stored. An evicted URL that an outlet still lists would re-land with today's date as a "new" article. That would inflate /desk (`lib/desk/loaders.ts:416`), /insiders newsThisMonth (`app/insiders/_lib/desk-stats.ts:115-120`), the pulse corpus, and the §8 per-source signal. The docstring's "lossless" claim (`pulse_lake.py:111-112`) covers city_pulse facts only, not the first-seen history.
- Severity: none today (never run). It blocks a consumer the first time someone applies it.
- First seen: 07/07/2026, when the workflow was added (commit 451c6bb6, `git log --diff-filter=A -- .github/workflows/pulse-pool-evict.yml`). Its header names the check `pulse_pool_evict_enable`, which is not among the 21 open checks.

## 5. What is missing

- city_pulse:
  - Measured against source_ceiling (`cadence_registry.yaml:596-598`): 10 real Lee/Collier places are unscanned (Immokalee, Ave Maria, Everglades City, Goodland, Chokoloskee, Copeland, Captiva, Pine Island, Alva, San Carlos Park). Adding them is config only (`pipeline.py:46-51`).
  - 6 of 13 cities had zero lake matches on 09/26 (G3: Lehigh Acres, Bonita Springs, Fort Myers Beach, Sanibel, North Fort Myers, plus Golden Gate), and Q3 shows no live rows for Lehigh, North Fort Myers, East Naples, North Naples or Golden Gate. The lake's business sections do not cover those places. The binding gap is the corpus, not the city list, so adding cities before adding sources buys nothing.
  - Hendry: 0 by construction.
- city_pulse_corridors:
  - source_ceiling names Alico Road and Corkscrew Road (Lee) as missing corridors, and Marco Island has zero corridors (`cadence_registry.yaml:621-622`). The ledger lists 5 city-without-corridor gaps (`02-known-problems-ledger.md:49-53`: East Naples, Golden Gate, Marco Island, North Fort Myers, North Naples). Marco Island is already in the registry line, so the ledger adds 4 more, not 5 (corrected by the second Opus).
  - Of the 27 verified corridors (Q6), 26 have ever produced a pulse row (`select count(distinct corridor) from data_lake.city_pulse_corridors` = 26, second Opus).
  - Adding a corridor is a corridor_profiles row, which lives in the CRE family's table. Not proposed here.
- news_swfl:
  - Measured against source_ceiling (`cadence_registry.yaml:2061`): WINK News, NBC2/gulfcoastnewsnow, WGCU, Cape Coral Breeze and Florida Weekly are unscraped.
  - WINK is the one with a working county-scoped RSS 2.0 feed and a ToS caveat (`docs/handoff/2026-07-11-reliable-sources-findings.md:279-286`); that is an operator question, §12. It is also the only candidate that would add Lehigh, North Fort Myers and Golden Gate general news to the pulse corpus.
  - `docs/standards/data-roots.md:1877` still says "4 named sources". Live Q8 shows 6 source_names; that line needs correction.
  - `docs/standards/data-inventory.md:142-144` shows 506 news rows and 134 city_pulse rows against 590 (Q7) and 100 (Q1) live. Stale.
- swfl_inc:
  - Measured against source_ceiling (`cadence_registry.yaml:1414`): 13 category feeds exist and we pull 3.
  - C1 shows the bare /blog/ index is the superset with the freshest items, so one URL beats adding 4 feeds.
  - The investment and jobs signal the pack was designed for (`econ-dev-swfl.mts:24-27`) is not published by this source (Q12). A source that does publish it is a separate discovery task under rule 9, not in this plan.
- Consumers that should exist and do not: none new. The project-alert consumer exists but is unscheduled (P9), and whether to keep it is an operator call (§12).

## 6. Verdict per pipeline

- city_pulse: REPAIR.
  - Reason: the distill leg is dead on the credit wall (P2), and the gate and doctor are blind to it (P3). The route is to Lane M on the box.
  - Number that flips it to GOOD ENOUGH: 7 consecutive nights with 0 "ERROR (distill)" lines in the city_pulse log, and `select max(run_at) from data_lake.city_pulse` within 1 day.
- city_pulse_corridors: REPAIR.
  - Reason: the retrofit is done and only the distill lane and the cron are missing (P5). The served heads hit 0 on 10/03 (Q5).
  - Number that flips it: served heads (Q5 shape, currently 5) ≥ 1 on 3 consecutive weekly runs after re-light.
- city_pulse_corridors_tier2: IMPROVE.
  - Reason: correct watchdog definition, but `dispatch_only: true` (`cadence_registry.yaml:1674`) leaves it DISABLED on the doctor (G5), so it watches nothing.
  - Number that flips it: the doctor Run column for this entry reads anything other than DISABLED.
- news_swfl: REPAIR.
  - Reason: runs are green, but Collier has been silently dark 96 days behind a fix on the wrong code path (P1). Lee is dark upstream (P8), and allowlist noise hides both (P6).
  - Number that flips it: `select count(*) from data_lake.news_articles_swfl where source_name='collier_county_govt' and scraped_at > now() - interval '7 days'` ≥ 1. Today it is 0 (Q8).
- swfl_inc: IMPROVE.
  - Reason: the mechanics work (12 of 15 green, G1), but the feed choice misses posts and the econ-dev brain serves a momentum call on n=1 (P10).
  - Number that flips it: 2026 rows with a qualifying category (Q12 shape, currently 1 relocation row in 2026). If pulling /blog/ for 8 weeks still yields ≤ 2 qualifying rows per 90 days, the verdict becomes RETIRE for the investment and jobs half of econ-dev-swfl.

- pulse-pool-evict.yml (not a registry pipeline; added by the second Opus): RETIRE the delete path.
  - Reason: it has never run, and one apply would delete 303 of 590 rows (Q14) and fake novelty (P15).
  - Number that flips it: none while the lake is under a few thousand rows. Q7 is 590 today.

## 7. The plan

Ordered. DO unless marked ASK-FIRST. Cross-family edits (nightly-chain.yml, log-cron-incident.yml, doctor, classifier) are tagged "coordinate with family 19" and ship in the same push as that family's edits to the same files.

1. Fix the Collier drop on the adaptive path. DO.
   - What: in `fetch_all_sources_adaptive`, send any source that carries `article_path` through the baseline `_process_source`. That path already has the path-scoped extraction and the real publish date (`fetcher.py:80-100`). Fix `test_adaptive_fetcher.py:92-94` to the live collier.gov/News-articles shape, and first add a failing test named `test_adaptive_path_keeps_path_scoped_collier_urls`.
   - Evidence the baseline path works: run read-only on 09/26 from the pinned crawl4ai venv on the Windows box, `_scrape_listing(AsyncWebCrawler(), <collier source>)` returned 10 candidates. Their dates were 2026-10-01, 2026-09-25, 2026-09-24 and 2026-09-23.
   - It has not yet been proven from a GitHub runner IP. The proof below settles that. If the count there is 0, carry the stealth and render-delay config from `adaptive_fetcher.py:137-141` into the routed call.
   - Also clamp a listing "Published on" date later than today to today. The 10-01 card is a future meeting date and would otherwise sort to the top of /desk (`lib/desk/loaders.ts:416`).
   - Where: `ingest/pipelines/news_swfl/adaptive_fetcher.py:145-160` and `test_adaptive_fetcher.py`.
   - Lane: D. Effort: S.
   - Proof: `pytest -q ingest/pipelines/news_swfl`, then after the next scheduled run `select max(scraped_at), count(*) filter (where scraped_at > now()-interval '1 day') from data_lake.news_articles_swfl where source_name='collier_county_govt'` shows a 09/27+ date and ≥ 1 row.
   - Unblocks: Collier govt news for /desk, insiders, and the Naples, East Naples, North Naples, Marco and Golden Gate pulse corpus. Also correct the "Collier repaired" note at `cadence_registry.yaml:2054` in the same commit.

2. Update the news allowlist. DO.
   - What: add `gulfshore_business` and `business_observer` to accepted_values.
   - Where: `ingest/quality/quality_registry.yaml:57-58`.
   - Lane: D. Effort: S.
   - Proof: the next freshness-probe-daily run (cron 14:00 UTC, `.github/workflows/freshness-probe-daily.yml:7`) shows the news_swfl doctor row with Content ≠ FAIL (`gh run view <id> --log | grep news_swfl`).
   - Unblocks: removes daily yellow noise.

3. Stop storing listing pages. DO for the filter, ASK-FIRST for the cleanup.
   - What: exclude `?page=` URLs and bare section roots (a URL whose path ends at `/news/<section>/`) in the adaptive filter chain.
   - Where: `adaptive_fetcher.py:51,88-93`.
   - Lane: D. Effort: S.
   - Proof: the test plus Q11 shape returns 0 new non-article rows after the next run.
   - ASK-FIRST: deleting the 17 existing non-article rows (Q11: 9 + 5 + 3; the first draft said 16) is a data_lake write.

4. Drop Lee County govt from SOURCES and record the upstream state. DO.
   - What: remove the lee_county_govt entry. Record the dated upstream evidence in source_ceiling: leegov.com auth wall and leefl.gov 503, as of 09/26/2026 (C1). This also feeds the open check `registry_source_ceiling_no_freshness_field`.
   - Where: `fetcher.py:18-27` and `cadence_registry.yaml:2059-2063`.
   - Lane: D. Effort: S.
   - Proof: the next run log has no leegov.com line (`gh run view <id> --log | grep -c leegov` = 0).
   - Unblocks: removes one error per night. Re-adding is a one-entry revert when leefl.gov answers 200.

5. Build the Lane M distill helper. DO. Coordinate the runner env with family 19.
   - What: one shared helper used by both distill files, replacing `client.messages.create`. The helper:
     - Runs the Claude CLI already on the box (`/home/stanicky/.local/bin/claude`, version 2.1.271, `ssh fedora 'claude --version'`) as `claude -p --output-format json --json-schema <EXTRACT_TOOL input_schema> --model claude-sonnet-4-6 --tools "" --restricted --strict-mcp-config --no-session-persistence`.
     - `--restricted` is verified in the box's help to ignore user, project and local settings files.
     - Checked on the box 09/26: no `~/.claude/CLAUDE.md` exists, and `~/.claude/settings.json` has 0 "hooks" and 0 "enabledPlugins" keys (`grep -c`). No user memory or hooks reach the child today. Step 0 re-asserts this before every deploy.
     - Runs with cwd set to a fresh `tempfile.TemporaryDirectory()`.
     - Passes a subprocess env containing only HOME and PATH (`env=` built explicitly, never inherited). The job env carries DESTINATION__POSTGRES__CREDENTIALS and SUPABASE_SERVICE_KEY, and the prompt carries scraped, untrusted article text.
     - Runs under a hard wall-clock `timeout`.
   - Flags, verified live on the box 09/26 (`ssh fedora 'claude --help'`):
     - `--tools` with "" disables all tools.
     - `--strict-mcp-config` with no `--mcp-config` loads zero MCP servers.
     - `--no-session-persistence` works with `--print`.
     - `--json-schema` and `--output-format json` exist.
     - A max-turns flag does not appear in this build's help (`claude --help | grep -c -i max-turns` = 0). With tools disabled the model has no tool to loop on, and the wall-clock timeout is the bound.
   - Never pass `--bare`: its help text says "Anthropic auth is strictly ANTHROPIC_API_KEY ... OAuth and keychain are never read". That would silently leave the Max login.
   - Keep the numbered-span prompt and `rows_from_extraction` unchanged, so the citation check and drop-unbacked-facts logic stay deterministic.
   - The run guard becomes a call-count cap: 13 calls for city, 27 for corridors, hard stop above.
   - Added by the second Opus, because the helper returns no SDK message: replace the three spend hooks that read one. They are `log_api_usage(model=msg.model, ..., usage=msg.usage)` at `city_pulse/distill.py:251` and `city_pulse_corridors/distill.py:216`, and the USD `RunBudget("city_pulse", default_usd=1.0, env_var="CITY_PULSE_MAX_USD")` at `city_pulse/pipeline.py:97`, plus its corridor twin at `city_pulse_corridors/pipeline.py:156`. The cost that `distill.py:251` computes (`cost = log_api_usage(...)`) is what the USD budget counts, and a CLI call has no `msg.usage` to feed it. Either log a zero-cost row with call_type unchanged and model taken from the CLI envelope, or drop the call, and let the call-count cap replace the USD budget. The mocked-subprocess test in the proof must exercise this path.
   - Step 0, before the code lands: one toy call on the box through the exact command above, to read which JSON envelope field carries the schema output and to confirm the Max session accepts `claude-sonnet-4-6`. Record both in the helper's docstring.
   - Where: new `ingest/lib/max_distill.py`, `ingest/pipelines/city_pulse/distill.py:195-258` and `ingest/pipelines/city_pulse_corridors/distill.py:201-220`.
   - Lane: M. Effort: M.
   - Proof: `pytest -q ingest/pipelines/city_pulse ingest/pipelines/city_pulse_corridors`, with the subprocess mocked, green. Plus a test named `test_max_distill_env_has_no_db_or_api_secrets` asserting the child env keys == {HOME, PATH}.
   - Unblocks: items 6 and 7, and closing the city and corridor half of `llm_legs_parked_credit_wall`.

6. Move city pulse onto the box and off the chain. DO. Coordinate the nightly-chain.yml edit with family 19.
   - What, in city-pulse-daily.yml:
     - `runs-on: [self-hosted, swfl-local]`, hard-pinned because the Max login exists only there. Add job-level `if: vars.SWFL_LOCAL_RUNNER_READY == 'true'`.
     - Use the pre-provisioned venv steps copied from `ingest-collier-official-records.yml:37-56`.
     - Delete the ANTHROPIC_API_KEY line (`city-pulse-daily.yml:54`).
     - Trigger on `workflow_run: workflows: ["SWFL business news ingest daily"], types: [completed]`, gated on conclusion success, so it distills the lake the same day it lands (fixes P4).
   - What, in the chain and registry: remove the `pulse` job from `nightly-chain.yml:140-145`, and set `nightly: false` at `cadence_registry.yaml:561`. In the same commit, remove `count_table` and `expected_rows_min` (`:572,578`). `doctor.py:121-122` prints GATED_BY_ASSERT_LANDED (green) for any tier-1 entry carrying both, whether or not the gate still reads it. With them removed, the doctor prints NOT_APPLICABLE (`doctor.py:126-127`), which is the true state. The row gate's "landed today UTC" test no longer fits a job that lands around 11:30 UTC. The existing freshness_sla warn 2 / error 4 (`cadence_registry.yaml:581-586`) plus the §8 signal take over.
   - Side effect: this removes this family's exposure to the chain double-fire (P4), and city-pulse-daily.yml gets its own run history, which ends the doctor Run blindness (P3c).
   - Lane: M on the Fedora runner. Effort: M.
   - Proof:
     - `gh run list --workflow city-pulse-daily.yml --limit 3 --json event,conclusion,createdAt` shows event workflow_run, success.
     - `gh run view <id> --log | grep -c "ERROR (distill)"` = 0.
     - `select max(run_at) from data_lake.city_pulse` is later than 09/26/2026.
   - Unblocks: removing a red job from every chain run, and the direct table readers. `lib/pulse/nearby.ts:68,77` (zip-report pulse blocks) and `lib/pulse/corridor-nearby.ts:27` read the table live on the next request.
   - Does not by itself unblock the brain (corrected by the second Opus; the first draft said it unblocks "the served city-pulse brain"). city-pulse-swfl, master and the brain-level readers in §1 update only on a rebuild, and the chain's rebuild legs are stalled behind the red chain (`00-BRIEF.md:147-149`). The follow-on is a `daily-rebuild.yml` dispatch with `pack_id=city-pulse-swfl` (input at `daily-rebuild.yml:15`, read at `:141`), never `master --force`. Out of the chain, the pulse lands about 11:30 UTC, after the 04:23 UTC chain rebuild, so the brain carries a one-day lag once the chain is green again. That is accepted.
   - Item 6's GOOD ENOUGH number (§6) is table-based (`max(run_at)`), not brain-based.

7. Re-light corridor pulse weekly on the box. DO.
   - What:
     - Same runner, venv and env changes as item 6 in corridor-pulse-weekly.yml. It still uses pip install (`corridor-pulse-weekly.yml:41-47`); switch it to the venv step.
     - Delete ANTHROPIC_API_KEY (`:54`).
     - Restore the weekly `schedule:` cron. Rewrite the header (`:4-12`) to say the retrofit landed 07/07 and the distill runs on Lane M.
     - Remove `dispatch_only: true` from both registry entries (`cadence_registry.yaml:603,1674`).
     - Add "Corridor pulse weekly" to nothing. §8 carries its signal.
   - Where: `.github/workflows/corridor-pulse-weekly.yml` and `ingest/cadence_registry.yaml`.
   - Lane: M. Effort: S (after item 5).
   - Proof: `gh run list --workflow corridor-pulse-weekly.yml --limit 2` shows a schedule success, and the Q5 shape shows max captured later than 09/26/2026.
   - Unblocks: corridor-pulse-swfl → cre-swfl → master, and `/r/cre-swfl/[corridor]`.

8. Stop false freshness from zero-match captures. DO.
   - What: skip the Tier-1 upload and the inventory row when a capture has 0 citations. There is nothing to archive, and those rows are what make tier-1 freshness read "today" on a dead night (P3a).
   - Where: `city_pulse/pipeline.py:112-141` and the same block in `city_pulse_corridors/pipeline.py`.
   - Lane: D. Effort: S.
   - Proof: a test named `test_zero_citation_city_writes_no_tier1_inventory`, then the G3-shape log on a night with a zero-match city shows no "uploaded Tier-1" line for it.
   - Unblocks: an honest doctor Fresh column for both pulse entries.

9. Fix the provenance labels. DO. This closes part of an open check.
   - What: rewrite the live-mode source descriptions to "crawl4ai news lake (data_lake.news_articles_swfl), Sonnet-distilled with citation enforcement, 13 cities" and the corridor equivalent.
   - Where: `refinery/sources/city-pulse-source.mts:208` and `refinery/sources/corridor-pulse-source.mts:199`.
   - Lane: D. Effort: S.
   - Proof: `rg -n "web_search_20250305|Firecrawl" refinery/sources/city-pulse-source.mts refinery/sources/corridor-pulse-source.mts` returns nothing. Record the result on `source_citations_say_firecrawl`. That check covers 10 refinery files, so it closes only when all are done.
   - Unblocks: correct served citations. The code fix is not live until the brains rebuild.

10. Point swfl_inc at the /blog/ index and write before archiving. DO.
    - What:
      - Set SWFL_INC_FEEDS to `https://www.swflinc.com/blog/`. C1 shows it carries the newest posts across all 13 categories.
      - Keep `_CATEGORY_SLUGS` as the nav filter (`pipeline.py:55-69`).
      - Move the DB upsert (`:462`) ahead of the Tier-1 upload (`:447`) and make the upload failure non-fatal after a successful upsert (fixes P11).
    - Where: `ingest/pipelines/swfl_inc/pipeline.py`.
    - Lane: D. Effort: S.
    - Proof: `pytest -q ingest/pipelines/swfl_inc` with a fixture from the /blog/ index. After the next Monday run, `select max(announced_date) from public.swfl_inc_announcements` ≥ 09/22/2026 (C1 shows 09/22 and 09/23 posts).
    - Unblocks: econ-dev-swfl sees the whole stream.

11. Small-n guard on econ-dev direction. DO.
    - What: direction = neutral when recent + prior qualifying announcements < 3. This is a calibration knob and should be documented next to `QUALIFYING_CATEGORIES`. It stops "falling" being called on 1 → 0 (P10).
    - Where: `refinery/packs/econ-dev-swfl.mts` direction block (the `prior.length === 0` branch, just below Metric 4).
    - Lane: D. Effort: S.
    - Proof: a failing test first, named `econ-dev direction is neutral when fewer than 3 qualifying rows`, then `bun test refinery/packs/econ-dev-swfl.test.mts`. The output shape and key_metrics are unchanged.
    - Unblocks: an honest master input.

12. Close the dead noise. DO.
    - Close issue #105, linking `llm_legs_parked_credit_wall`. The watcher cannot close it (P13).
    - After item 13 is live, remove "SWFL Inc. economic dev weekly" and "SWFL business news ingest daily" from `.github/workflows/log-cron-incident.yml:66-67`, and close #212 if it is still open. Coordinate with family 19.
    - Lane: D. Effort: S.
    - Proof: `gh issue list --state open --search "corridor-pulse-weekly"` returns nothing, and `grep -c "SWFL Inc. economic dev weekly" .github/workflows/log-cron-incident.yml` = 0.

13. Add the four data-quality signals of §8. DO.
    - Where: `ingest/quality/quality_registry.yaml`.
    - Lane: D. Effort: S.
    - Proof: the next freshness-probe-daily summary lists the four contract names. `news_source_silent` (renamed from `news_source_silent_7d` by the second Opus when the windows became per source) must fire on day 1 for collier_county_govt (it is dark today, Q8) and auto-close after item 1 lands. That round trip is the proof the signal works.

14. Correct the docs that lie. DO.
    - `cadence_registry.yaml:619` corridor split: Lee 18, Collier 9 (Q6).
    - `docs/standards/data-roots.md:1877`: 6 sources (Q8).
    - `wiki/pipeline-census.md:43`: the city pulse gate claim (G4).
    - Added by the second Opus:
      - The corridor note at `cadence_registry.yaml:616` says "distill inherits Haiku cost mode". The model is claude-sonnet-4-6 (`city_pulse/distill.py:42`), imported by the corridor distill (`city_pulse_corridors/distill.py:40`).
      - The `fetch_all_sources` docstring (`news_swfl/fetcher.py:149`) says NEWS_ADAPTIVE is "default off". The cron defaults it to on (`news-swfl-ingest.yml:49`).
      - The `lib/zip-dossier.ts:184` comment says "7 cities"; the scan list has 13 (`city_pulse/pipeline.py:46-51`).
      - The news-swfl-ingest.yml cron comment (`:5`) says "Vercel cron scores articles at 7am UTC". No such Vercel cron exists (P9).
    - Lane: D. Effort: S.
    - Proof: `rg -n "Lee \(17\)|Haiku cost mode" ingest/cadence_registry.yaml` returns nothing, and `rg -n "default off" ingest/pipelines/news_swfl/fetcher.py` returns nothing.

15. ASK-FIRST: the data_lake cleanup delete from item 3, and the project-alert decision in §12.

16. Defuse pulse-pool-evict (added by the second Opus). DO.
    - What: remove the delete path. Drop the `apply` input from `pulse-pool-evict.yml` and keep the dry-run count, or delete the workflow and `ingest/pipelines/pulse_pool_evict.py` outright. The lake is 590 rows (Q7), so there is no size pressure, and eviction breaks `carry_first_seen` (P15). Rewrite the "Lossless" docstring at `ingest/lib/pulse_lake.py:111-112` to state the first-seen loss.
    - Where: `.github/workflows/pulse-pool-evict.yml:5-10,29`, `ingest/lib/pulse_lake.py:106-126`.
    - Lane: D. Effort: S.
    - Proof: `grep -c "apply" .github/workflows/pulse-pool-evict.yml` = 0 (or the file is gone), and `pytest -q ingest/lib/test_pulse_lake.py` stays green.
    - Unblocks: removes a one-click path to faking novelty across /desk, /insiders and the pulse corpus. Deleting the workflow is not a data_lake write, so this is DO. Running it with apply would be one, which is why the path goes.

## 8. Checks and balances

Design: one signal per pipeline, all on the existing data-quality seam.
- Each signal is a `sql_expectation` content contract (locus probe, severity error) in `ingest/quality/quality_registry.yaml`. The type is documented at lines 28-41.
- `ingest/scripts/check_data_quality.py` evaluates it daily inside freshness-probe-daily (cron 14:00 UTC, `.github/workflows/freshness-probe-daily.yml:7`).
- An error fail opens one `public.checks` row under project data-quality and auto-closes it when the condition clears (`check_data_quality.py:21,339-430`).
  - The key is `contract_fail_<table slug>_<contract name>` (`:60,335-336`).
  - Seam verified live: `select check_key, state from public.checks where check_key like 'contract_fail_%'` returns `contract_fail_data-lake-listing-state_listing_state_home_price_floor`, state dropped.
  - A check a human marked dropped stays silent (`:405`, "state in ('open','dropped') -> leave as-is"), so none of these four keys may be dropped.
- No GitHub issue is ever filed by this path. The ops site `/coverage` and the doctor table read the same probe run.
- published_date is TEXT (Q7 shape; `news_swfl/pipeline.py:12-14`), so every comparison casts explicitly. The cast is safe: `select count(*) filter (where published_date !~ '^\d{4}-\d{2}-\d{2}')` = 0 and null count = 0 (second Opus).
- Registry shape (added by the second Opus): each signal is one entry under `content_contracts:` with `name`, `type: sql_expectation`, `locus: probe`, `policy: report`, `severity: error` and `failing_rows_sql: |` holding the SQL below. The field name is `failing_rows_sql`, and `ingest/quality/contracts.py:447-452` read-only-lints it (`assert_read_only`). The table keys are `data_lake.news_articles_swfl` (already present, `quality_registry.yaml:50`), plus new keys `data_lake.city_pulse`, `data_lake.city_pulse_corridors` and `public.swfl_inc_announcements`.
  - A key with only `content_contracts` is evaluated: `run_content_contracts` loops every table key (`check_data_quality.py:153-154`), and `load_contracts` returns that key's list (`contracts.py:190`). No value_tests or schema_baseline is needed.
  - The resulting check keys are `contract_fail_<slug>_<name>`, for example `contract_fail_data-lake-news-articles-swfl_news_source_silent` (slug shape from the one live key, `contract_fail_data-lake-listing-state_...`).
- All four SQL bodies were run live by the second Opus on 09/26. News returns collier_county_govt, city pulse returns 1, corridors returns 1, and swfl_inc returns no row. That matches the stated "today" state of each.

- news_swfl — `news_source_silent`: fires when any live outlet has had no new article for longer than its own window, and names it. Corrected by the second Opus: the first draft used one 7-day window for every outlet, and Q13 shows gulfshore_business had first-seen gaps of 12 days (07/31→08/12) and 9 days (08/12→08/21). A flat 7-day window would have opened a false check twice since 07/15.

  ```
  SELECT s.src FROM (VALUES ('naples_daily_news',10),('fort_myers_news_press',7),('business_observer',7),
    ('gulfshore_business',21),('collier_county_govt',10)) s(src, days)
  WHERE NOT EXISTS (SELECT 1 FROM data_lake.news_articles_swfl a
    WHERE a.source_name = s.src AND a.published_date::date >= current_date - s.days)
  ```

  - Windows: each is at least the Q13 maximum gap plus margin. business_observer and fort_myers_news_press have a max gap of 3, so 7. naples_daily_news has 6, so 10. gulfshore_business has 12, so 21.
  - collier_county_govt has no gap history (5 rows, all 06/22), so its 10 is a knob. It rests on C1, which shows items dated 09/23, 09/24 and 09/25. Re-derive it from Q13 after 30 days of Collier rows.
  - Why this is the signal: the in-pipeline novelty guard is batch-global and missed two dead sources for 34+ days (`cadence_registry.yaml:2054`). This contract is per source.
  - Today it returns collier_county_govt only. The second Opus ran this exact per-source SQL live on 09/26.
  - The outlet list is the accepted_values list (item 2) minus lee_county_govt. accepted_values must keep Lee for its 3 historical rows (Q8); the signal must not alarm on a source item 4 retires. The two lists differ by exactly that one name.
- city_pulse — `city_pulse_distill_dead`: the table got no new row for 4 days while the lake got ≥ 10 new URLs.

  ```
  SELECT 1 WHERE (SELECT coalesce(max(run_at), '-infinity'::timestamptz) FROM data_lake.city_pulse) < now() - interval '4 days'
    AND (SELECT count(*) FROM data_lake.news_articles_swfl
         WHERE published_date::date >= current_date - 3) >= 10
  ```

  - Calibration (G6): 11 sampled green nights between 07/12 and 09/08 wrote 1, 4, 5, 5, 11, 1, 1, 1, 3, 3 and 0 new rows, against 27-52 lake articles in window. Runs 34207129475, 33955163163, 33610867962, 33249511716, 32930051290, 32617761974, 32331725215, 31994317901, 31769734772, 31296727772 and 31079893138.
  - One zero night in 11 was seen; four in a row was not.
  - Today it fires: pulse dark 18 days, 40 new URLs in 4 days (Q9).
  - Not verified: the false-positive rate over the whole history, because non-structural rows are pruned (`distill.py:299-302`). The 10-URL floor and 4-day window are the knobs.
- city_pulse_corridors and city_pulse_corridors_tier2 — `corridor_pulse_distill_dead`: same shape on data_lake.city_pulse_corridors, including the `coalesce(max(run_at), '-infinity'::timestamptz)` guard, with a 21-day window (matching the tier2 entry's 7 × 3.0 at `cadence_registry.yaml:1676-1677`) and a lake floor of ≥ 10 URLs in 14 days. One signal for the two registry entries, because they are one workflow and one table.
- swfl_inc — `swfl_inc_scrape_dead`: `SELECT 1 WHERE (SELECT coalesce(max(scraped_at), '-infinity'::timestamptz) FROM public.swfl_inc_announcements) < now() - interval '21 days'`. scraped_at bumps on every green upsert (`pipeline.py:376-386`), so this means 3 missed weekly runs. That is the point where econ-dev's 90-day count starts to be wrong.

Existing noise to delete:
- Issue #105 (P13).
- Issue #212, and the two watch-list lines in `log-cron-incident.yml:66-67` (item 12).
- The stale allowlist FAIL (item 2).
- The city_pulse false-green rows:
  - The assert_landed LANDED line goes away with `nightly: false` (item 6).
  - The doctor Fresh column is fixed by item 8.
  - The doctor Run column is fixed by item 6, which gives the workflow its own runs.
- The daily Tier-1 junk uploads for zero-citation captures (item 8).
- Added by the second Opus:
  - The swfl_inc doctor row, 🔴 red since 09/21 on a storage 544 while its data is fresh (G5, P11). Item 10 makes the upload non-fatal after a good upsert, which ends this class of false red.
  - #105's retired billing prescription (P13). Closing #105 (item 12) removes it.
  - #212 names the check `cron_incident_swfl_inc_weekly`, which is not among the 21 open checks (`node scripts/check.mjs list`). Close #212 with item 12; there is no ledger row to close.
  - The chain incident, #178 "[cron-failure:nightly-chain] DATA_EMPTY" (open since 08/15) and the check `cron_incident_nightly_chain` (open, 75d untouched). City pulse is one of the chain's red jobs every night since 09/09 (G2). Item 6 removes this family's contribution. Closing them belongs to family 19, because listing_lifecycle still reds the gate (G4).
  - The pulse-pool-evict delete path (P15, item 16).
  - The related open check `doctor_cannot_see_billing_wall` is not needed for this family after item 6. The §8 sql signals see a dead Lane M leg through the table, with no log text. It stays family 19's.

Kept as is:
- `assert_landed.py` is not changed. The family leaves the gate (item 6), so its count-without-expiry quirk (P3b) no longer touches this family. It is recorded for family 19, since other count_table entries could have the same shape.
- No per-run alarm for the pulse workflows, by design. After item 6, city-pulse-daily.yml runs on its own trigger and is not on the incident watch list (`log-cron-incident.yml:16-96` lists "Nightly Chain", not "City pulse daily"). corridor-pulse-weekly.yml is not on it either. The §8 sql signals are the only alarms for both. A Lane M failure (logout, rate limit) surfaces there within 4 days (city) or 21 days (corridors), not as an issue per red run.
- The NULL guard matters: prune runs even on nights when every city errors (`city_pulse/pipeline.py:155-163`), so the table can drain to zero rows (Q4 gives 12/07/2026). Without `coalesce`, `max(run_at)` is NULL, the comparison is NULL, the signal returns no row, and the check would auto-close while the leg is dead.
- No registry field is added. The fields used are existing ones: `nightly: false` (city_pulse), removal of `dispatch_only` (both corridor entries), and source_ceiling text (news_swfl).

## 9. Box placement

- city_pulse: moves to the Fedora runner, hard-pinned `[self-hosted, swfl-local]`, with job-level skip when `SWFL_LOCAL_RUNNER_READY` is not 'true'.
  - Reason: the Max login lives only on the box. The Claude CLI and a credentials file are present there (`ssh fedora 'claude --version; test -f ~/.claude/.credentials.json'`: 2.1.271, present). ubuntu-latest has no Max login.
  - Not the gated fallback expression, because falling back to ubuntu-latest would run the leg with no model lane.
- city_pulse_corridors: moves to the Fedora runner, same reason and same pin.
- city_pulse_corridors_tier2: no job of its own. It follows city_pulse_corridors.
- news_swfl: stays on GHA ubuntu-latest.
  - Reasons: 15 of 15 green from GitHub IPs (G1). No WAF block in the 09/26 log. The Lee failure is a server-side auth wall and leefl.gov answers 503 from the operator's own residential connection too (C1 ran from the Windows box). The job is well under its 30-minute limit (`news-swfl-ingest.yml:24`) and needs no SSD archive, no local model and no persistent browser.
- swfl_inc: stays on GHA ubuntu-latest.
  - Reasons: the stealth crawl passes the swflinc.com WAF from GitHub IPs (the 09/21 log fetched all 3 feeds). The only red in 15 was a storage 544, not a WAF block (P11). The box's backup and reboot test is still pending (`_ASSISTANT/NORTH-STAR.md:21`), so no load is added without an observed need.
  - Trigger to move: one WAF 403 in the log switches it to the gated expression from `ingest-collier-official-records.yml:31`, a one-line change.
- pulse-pool-evict (added by the second Opus): stays on GHA `ubuntu-latest` (`pulse-pool-evict.yml:15`) until item 16 removes its delete path. It needs no browser, SSD or local model. A box move would add nothing.
- Runner state re-verified by the second Opus on 09/26: `gh api repos/ethanrickyjrjr-wq/SWFL-Data-Gulf/actions/runners` returns "fedora-swfl-local online self-hosted,Linux,X64,swfl-local", and `gh variable list` shows SWFL_LOCAL_RUNNER_READY true (set 09/20). The open check `fedora_runner_not_registered_smoke_owed` ("GitHub reports zero self-hosted runners") is stale against that. Closing it is family 19's, but it does not block items 6-7.
- Hermes `no_agent` jobs: none needed. Every deterministic leg already runs in its workflow.
- Already on the box that should not be: none from this family. All four YAMLs say `runs-on: ubuntu-latest` (`city-pulse-daily.yml:38`, `corridor-pulse-weekly.yml:30`, `news-swfl-ingest.yml:23`, `swfl-inc-weekly.yml:21`).
- Box prerequisites for items 6 and 7:
  - The runner service must be able to find the CLI. It sits in `~/.local/bin`, so the workflow step should call it by absolute path or append that directory to `$GITHUB_PATH`.
  - The runner's own environment file could not be inspected, because a secret-exposure hook blocked the read. The helper's explicit HOME and PATH env makes the child immune to whatever is there.

## 10. Compute lane per LLM leg

The grep that proves the list (run 09/26):

```
rg -n -i "anthropic|claude|openai|ANTHROPIC_API_KEY|messages\.create|refinery" ingest/pipelines/city_pulse ingest/pipelines/city_pulse_corridors ingest/pipelines/news_swfl ingest/pipelines/swfl_inc ingest/lib/pulse_lake.py ingest/lib/pulse_match.py .github/workflows/city-pulse-daily.yml .github/workflows/corridor-pulse-weekly.yml .github/workflows/news-swfl-ingest.yml .github/workflows/swfl-inc-weekly.yml app/api/cron/news-crawl --glob '!**/test_*'
```

Hits: two call sites, plus their env and constant lines. There are none in news_swfl, swfl_inc, pulse_lake, pulse_match or the news-crawl route. The route's extractor `lib/signals/news-event-extractor.ts` has no hit for anthropic, claude, openai or model. The consumer files `refinery/packs/city-pulse-swfl.mts`, `corridor-pulse-swfl.mts`, `econ-dev-swfl.mts`, the three source files and `lib/pulse/nearby.ts` have no LLM call; their only hits are the stale label strings of P12.

- Leg 1: city_pulse distill (`ingest/pipelines/city_pulse/distill.py:240`, model constant `:42`).
  - What it does: one forced-tool call per city with lake matches. It turns numbered citation spans into facts with topic, story_key and location_anchor. Facts without a valid cite are dropped deterministically in `rows_from_extraction` (`:116`).
  - Current auth: ANTHROPIC_API_KEY (`city-pulse-daily.yml:54`). Dead since 09/09 (P2).
  - Replacement lane: M, via items 5 and 6.
  - Can it need no model? Only in part. Capture, match, dedup, geocode, TTL, prune and supersession are already deterministic. The extraction is judged, not scored, and the repo's own routing research locks it to Sonnet after a failed Haiku comparison (`_RESEARCH/agent-behavior/2026-07-30-model-routing-lanes-1-2-3.md:323`).
  - Lane L is excluded: the brief bars local models from extraction.
  - Lane C (Codex 0.157.0, `codex --version`) is the independent reviewer of the item-5 diff, not the served extractor.
  - Operator decision relied on: these pipelines are internal, so Max is a legitimate unattended lane (`00-BRIEF.md:21-23`). Recorded once, not relitigated.
- Leg 2: corridor pulse distill (`ingest/pipelines/city_pulse_corridors/distill.py:205`, same model through the shared constant, `:40`).
  - Same shape per corridor.
  - Auth: ANTHROPIC_API_KEY (`corridor-pulse-weekly.yml:54`). Dead since 07/05 (P5).
  - Replacement lane: M, via items 5 and 7. Same no-model analysis as Leg 1.
- news_swfl: none. The grep above returns no hit in `ingest/pipelines/news_swfl`. The BestFirst scorer is keyword math (`adaptive_fetcher.py:9-11`).
- swfl_inc: none. The grep above returns no hit in `ingest/pipelines/swfl_inc`. The parse is regex (`pipeline.py:75-83,179-202`).
- pulse-pool-evict: none (added by the second Opus). `rg -n -i "anthropic|claude|openai|getAnthropic|messages\.create" ingest/pipelines/pulse_pool_evict.py ingest/lib/pulse_lake.py .github/workflows/pulse-pool-evict.yml` returns nothing.
- Consumer packs: no model call. city-pulse-swfl, corridor-pulse-swfl and econ-dev-swfl each set `skipSynthesisAgent: true` and `synthesisStrategy: "deterministic"` (`city-pulse-swfl.mts:278,281`, `corridor-pulse-swfl.mts:256,259`, `econ-dev-swfl.mts:362,365`).
- Spend hooks tied to Legs 1 and 2 that item 5 must replace (second Opus): `log_api_usage(... usage=msg.usage)` at `city_pulse/distill.py:251` and `city_pulse_corridors/distill.py:216`, and the USD RunBudget at `city_pulse/pipeline.py:97` and `city_pulse_corridors/pipeline.py:156`.
- Workflow YAML grep (second Opus): `grep -n -i "anthropic|claude|openai|ANTHROPIC_API_KEY|refinery"` over the 5 family YAMLs hits only `city-pulse-daily.yml:54` and `corridor-pulse-weekly.yml:54` (ANTHROPIC_API_KEY), plus the corridor header comment `:4`. Both key lines are deleted by items 6 and 7.
- Out of family, named so it is not counted as missed: the insiders email authoring leg reads news_articles_swfl through `lib/email/insiders/dossier.ts:59` and calls the model at `lib/email/insiders/author.ts:134` (call type `insiders_author`). It belongs to the email/product-schedulers family.

## 11. Double-check log

I re-read the file top to bottom on 09/26 and re-checked each numbered claim against its source.

- Registry name lines 558, 600, 1392, 1671, 2034 · `grep -n "name: <x>$" ingest/cadence_registry.yaml` · verified.
- city_pulse 100 rows / 95 live / max captured 09/08 / 8 cities · Q1 · verified.
- 52 live heads, structural only · Q2 · verified.
- Per-city live counts and last capture · Q3 · verified.
- Below 50 on 10/24, zero heads 12/07 · Q4 · verified. The earlier "zero on 12/07" matches Q1 max_expires 12/07.
- Corridors 198 / 6 live / 5 heads / max captured 07/05 / last expiry 10/03 · Q5 · verified.
- Corridor split 18 Lee + 9 Collier = 27 · Q6 · corrected. The first draft carried the registry's "Lee 17"; Q6 grouped by city gives 18, and the registry line is now listed as wrong in §2 and item 14.
- news 590 rows, 06/22 to 09/26 · Q7 · verified.
- Per-source counts, Collier and Lee last scraped 06/22 · Q8 · verified.
- 96 days, 40 URLs in 4 days, 49 in 7 days, 18 pulse-dark days · Q9 · verified. First computed by hand, then re-derived in SQL.
- processed_at 0 of 590 · Q10 · verified.
- 9 BO listing pages, 4 + 3 govt nav rows, 1 of 177 in September · Q11 · corrected. The first cut flagged all 26 gulfshore rows as non-article because my URL regex was wrong; a URL listing showed they are real `/news/.../article_*.html` stories, and they are excluded from the count.
- swfl_inc 35 rows, 0 investment, 0 jobs, 12 categorized, county split, year split · Q12 · verified.
- city pulse last green 34207129475 (09/08), first red 34310762619 (09/09) · G2 across 09/01-09/19, plus the 15 most recent runs · verified.
- 7 cities errored on 09/26, with the request_id quoted · G3 · verified.
- Gate line "city_pulse LANDED 100 rows >= floor 50", gate red only on listing_lifecycle · G4 · verified. This contradicts `00-BRIEF.md:147-149` (cite corrected by the second Opus from `:142-144`) and `wiki/pipeline-census.md:43`, and is reported as "X verified, Y needs review".
- Doctor rows for all 5 entries · G5 · verified.
- Doctor Run GREEN mechanism · `doctor.py:370-372`, `gh_runs.py:20,81-85` · could-not-verify the exact branch. Marked "needs review" in P3.
- news 15/15 green, swfl_inc 12/2/1, corridors 3/3/2 of 8, city-pulse-daily's own newest run 07/12 · G1 · verified.
- swfl_inc 09/21 failure is Storage 544 DatabaseTimeout · `gh run view 35614476420 --log-failed` · verified.
- Issue #212 labeled "TRANSIENT (429)" · `gh issue view 212` · verified. The cause of the "429" is could-not-verify, and is handed to family 19.
- Issue #105 open since 07/05; corridor workflow absent from the watch list · `gh issue view 105`, `grep -n "pulse" log-cron-incident.yml` · verified.
- Adaptive path drops collier.gov URLs · local crawl4ai 0.9.0 URLPatternFilter test (False) and `ingest/requirements.txt:19` pin · verified.
- NEWS_ADAPTIVE on since 06/22 (06260370); the 07/26 fix touched only fetcher.py · `git log -S`, `git show --stat e490aeeb` · verified.
- vercel.json has 2 crons, neither is news-crawl · `cat vercel.json` · verified.
- Test counts 72 (23/27/11/5/6), 9, and 25 · T1, T2 · verified.
- C1 source dates · the crawl4ai probe run twice, second run's lines quoted · verified.
- Claude CLI 2.1.271 and credentials file on the box · `ssh fedora` · verified. The plan type behind the credential is could-not-verify.
- Flags `--tools ""`, `--strict-mcp-config`, `--no-session-persistence`, `--json-schema`, the `--bare` auth text, and no max-turns flag · `ssh fedora 'claude --help'` · verified.
- Calibration samples 1, 4, 5, 5, 11, 1, 1, 1, 3, 3, 0 · G6 · verified. One sampled chain run (31464377462) returned no city-pulse job and was dropped from the sample.
- Quality probe cadence 14:00 UTC · `grep -n cron .github/workflows/freshness-probe-daily.yml` · verified.
- Auto-close of data-quality checks · `check_data_quality.py:21,407-428` · verified.
- The econ-dev served line "0 projects ... 1 ... falling" · `brains/econ-dev-swfl.md:37` (local copy stamped 09/15) · verified as the local copy; the live served version could-not-verify.
- No API-era dollar figures, no credit suggestion · `rg -n -i "\$[0-9]|credit" 13-pulse-news.md` · corrected.
  - The first pass found one zero-dollar figure (the lake-read cost, §3), now reworded to "free".
  - Every remaining "credit" hit is one of: the parked-state name "credit wall", the quoted error token `400 credit balance too low` with its request_id, the check key `llm_legs_parked_credit_wall`, or this line. None proposes, prices or hints at an action on it.
- Zero-match city count on 09/26 · G3 lines "no lake matches for" · corrected. §5 said "5 of 13"; the list names 6 (Lehigh Acres, Bonita Springs, Fort Myers Beach, Sanibel, North Fort Myers, Golden Gate). Fixed to 6.
- City pulse green on all 16 chain runs 09/01-09/08 · G2 · verified.
- news_swfl actual start times 10:34-12:37 UTC · G1 createdAt · verified.
- Content-contract fails open and auto-close checks · `check_data_quality.py:339-430` read in full, plus `select ... from public.checks where check_key like 'contract_fail_%'` returns 1 row (state dropped) · verified. The mechanism exists; a dropped check stays silent (`:405`).
- The first-draft signal SQL had no NULL guard on `max()` · re-read against Q4 (drains to 0 rows 12/07) and `city_pulse/pipeline.py:155-163` · corrected. `coalesce(..., '-infinity')` was added to all three.
- "One edit updates both" lists (§8 news) contradicted item 4 · re-read §7 item 4 against §8 · corrected. The lists now differ by lee_county_govt, stated explicitly.
- "BILLING classifier stays the Lane M alarm" contradicted item 6 · `grep -n "City pulse daily\|Corridor pulse" .github/workflows/log-cron-incident.yml` returns nothing · corrected. The sql signals are stated as the only alarm.
- `nightly: false` alone would leave the doctor printing GATED_BY_ASSERT_LANDED · `doctor.py:115-127` read · corrected. Item 6 now also removes `count_table` and `expected_rows_min`.
- Baseline Collier path yields candidates · read-only `_scrape_listing` run from the pinned crawl4ai venv returned 10 · verified from a residential IP. From a GitHub runner IP it could-not-verify; item 1's proof covers that.
- Box user config · `ssh fedora 'test -f ~/.claude/CLAUDE.md; grep -c "\"hooks\"" ~/.claude/settings.json'` returns no CLAUDE.md and 0 hooks · verified. `--restricted` is added to item 5.
- Cited line numbers, re-opened one by one · `grep -n` on each file · corrected.
  - `cadence_registry.yaml`:
    - Corridor split is `:619`, not `:620`.
    - Corridor ceiling is `:621-622`.
    - Corridor dispatch_only is `:603`, not `:604`.
    - swfl_inc first run is `:1407`, not `:1405`.
    - swfl_inc ceiling is `:1414`.
    - news ceiling is `:2061`.
  - `swfl_inc/pipeline.py` upsert is `:462`, not `:465`.
  - Collier venv block is `ingest-collier-official-records.yml:37-56`.
  - NORTH-STAR priority 4 is lines 19-22.
  - All are fixed in the sections above.

Second-Opus pass (09/26), one row per re-checked claim group. Corrections are applied in the sections above.
- Q1-Q5 city_pulse and corridor figures (100 / 95 / 52 heads / 8 cities / 09/08 / 12/07; 10/24 and 12/07 drain dates; 198 / 6 / 5 / 07/05 / 10/03) · re-run through the scratchpad Bun.SQL script · verified.
- Q6 corridor split 18 + 9 = 27 · `select city, count(*) from public.corridor_profiles where verification_status='verified' and deleted_at is null group by 1` · verified.
- Q7-Q10 news figures (590, 06/22-09/26, per-source 255/146/155/26/5/3, s7 45/42/43/6/0/0, 96 / 40 / 49 / 18, processed 0) · re-run · verified.
- "About 10 new URLs per day, 49 in 7 days" · Q9 arithmetic · corrected to about 7 per day over 7 days and 10 per day over 4 (§2).
- Q11 non-article rows · URL listing of business_observer, collier_county_govt and lee_county_govt rows, plus `count(*) where published_date >= '2026-09-01'` = 177 · 9 BO, 3 Lee and 1 of 177 verified. Collier corrected from 4 of 5 to 5 of 5, so the total is 17, not 16 (P7, item 3).
- Q12 swfl_inc (35, 0 / 0 / 12, county 28/6/1, years 1/10/14/2/8, 2026 dates) · re-run · verified.
- "23 of 35 rows are 2021-2023" · Q12 year split · corrected to 25 (§2).
- G1 run counts for all 4 workflows · `gh run list` re-run · verified.
- G2 last green 34207129475 and first red 34310762619, plus 16 of 16 green 09/01-09/08 · per-run `gh run view --json jobs` over every chain run 09/01-09/26 · verified.
- G3 7 errored cities, 6 zero-match cities, 6 zero-row Tier-1 uploads, request_id, 52 lake articles · `gh run view 36232679167 --job 108378684067 --log` · verified. The literal log text is "Error code: 400 ... credit balance is too low"; the plan's backticked token is the brief's shorthand for it.
- G4 gate lines · `gh run view 36232679167 --log` · verified.
- G5 doctor rows · `gh run view 36259690113 --log` · verified for city_pulse, news_swfl and both corridor entries. swfl_inc was omitted and is 🔴 red; corrected in P11.
- G6 calibration · 3 of 11 runs re-opened (34207129475 → 1 row / 52 articles, 32930051290 → 11 / 30, 31079893138 → 0 / 45) · verified.
- 09/21 swfl_inc Storage 544 and the 15,820 / 18,429 / 18,145 char feeds · `gh run view 35614476420 --log` · verified.
- 09/26 news log lines (75 fetched, LOADED, Collier COMPLETE with no child URL, leegov auth wall) · `gh run view 36238163051 --log` · verified.
- T1 72 + 9 and T2 25 · re-run pytest per path and `bun test` · verified.
- C1 source dates · the scratchpad probe re-run · verified. Also found an 08/26/2026 /blog/ post absent from the table; added to P10.
- URLPatternFilter drops collier.gov/News-articles · re-run in the pinned crawl4ai 0.9.0 venv · verified.
- Commits 06260370 (06/22), e490aeeb (07/26, code change only in fetcher.py), a36d99ac (07/14) · `git log`, `git show --stat` · verified; P6 date added.
- Box CLI 2.1.271, credentials present, no CLAUDE.md, max-turns count 0, flag help texts · `ssh fedora` · verified.
- Registry lines 558 / 572 / 578 / 581-586 / 596-598 / 600 / 603 / 619 / 621-622 / 1392 / 1396-1397 / 1407 / 1414 / 1671 / 1674 / 1676-1677 / 2034 / 2054 / 2061 · `sed -n` · verified.
- File:line cites in pipeline code, workflows, doctor, assert_landed, check_data_quality, quality_registry, econ-dev, master, cre-swfl, sources, desk, insiders, news-crawl route, vercel.json, docs · opened one by one · verified, except `00-BRIEF.md:142-144`, corrected to `:147-149`.
- Ledger adds 5 corridor gaps · `02-known-problems-ledger.md:49-53` · corrected to 4 beyond the registry's Marco Island (§5).
- Consumers · `rg` for each table name and brain slug in refinery, lib, app · corrected. Brain-level readers in activation email, highlighter and zip-dossier were added. zip-dossier is relabeled a coverage map. The news-swfl brain naming trap is noted (§1).
- pulse-pool-evict.yml · `grep -l` of the family tables across `.github/workflows` · gap filled (§1, P15, item 16, §6, §9, §10).
- tier2 in §4 · the section re-read · gap filled (P14).
- §8 news signal window · Q13 · corrected to per-source windows. The flat 7 days would have false-fired on gulfshore_business.
- §8 contract mechanics (a content_contracts-only key is evaluated; field is failing_rows_sql) · `check_data_quality.py:153-154`, `contracts.py:190,447-452` · verified and written into §8.
- Item 6 "unblocks the served brain" · `daily-rebuild.yml:15,141`, `00-BRIEF.md:147-149` · corrected. Table readers go live; the brain needs a `pack_id=city-pulse-swfl` rebuild.
- Item 5 spend hooks · `city_pulse/distill.py:251`, `city_pulse_corridors/distill.py:216`, `pipeline.py:97` / `:156` · gap filled.
- Credit-language scan · `grep -n -i "credit|top up|top-up|console balance|api key funding|billing"` over this file · 0 suggestions. Every hit is a state name, a quoted log token, a check key, an issue title, or a line of this log.

## 12. Questions for the operator

1. WINK News county RSS: adopt it as the Lee/Collier general-news source? It is the only feed that covers the pulse cities our business sections miss. Its ToS says "personal, non-commercial use" and prohibits "unauthorized ... scraping", even though it self-publishes the feed (`docs/handoff/2026-07-11-reliable-sources-findings.md:279-286`). That is a license call, not a design call.
2. `/api/cron/news-crawl`, the project-alert leg: revive or delete? It has no scheduler (vercel.json lists only mls/sync and nightly-chain-dispatch), it 500s at the projects step by your own 06/26 deferral (`app/api/cron/news-crawl/route.ts:40-43`), and 0 of 590 articles have ever been processed (Q10). Reviving it means a lat/lng fix plus a schedule. Deleting it removes a dead route and an allowlist entry (`verification/supabase-untyped-allowlist.json:3`).

## 13. Second-Opus verification

Run 09/26/2026 against live sources: the lake through a read-only Bun.SQL scratchpad script, `gh`, `ssh fedora`, the pinned crawl4ai venv, pytest and bun test. Nothing was dispatched, written to data_lake, pushed or filed.

Claims checked: 363, counted by enumeration.
- 132 lake figures in Q1-Q12: Q1 6, Q2 3, Q3 16, Q4 2, Q5 6, Q6 10, Q7 4, Q8 18, Q9 4, Q10 1, Q11 21 URL-level, Q12 41 including the 8 dated 2026 rows.
- 57 run and log claims:
  - G1: 4 workflows × 15 runs, scored as 16 claims.
  - G2: 44 chain-run job conclusions scored as 18 nightly claims plus 3 headline claims.
  - G3: 5. G4: 2. G5: 5 rows.
  - G6: 3 spot-checked runs.
  - Swfl_inc log: 2. News log: 3.
- 8 test counts (T1 and T2).
- 5 source probes (C1).
- 10 git and issue claims: 4 commits, #105, #212, #178, the open-check list, the runner, and the runner variable.
- 8 box claims: CLI path and version, credentials, CLAUDE.md, max-turns, and 4 flag texts.
- 21 registry line cites.
- 111 other file:line cites, opened one by one: 74 in pipeline code, workflows, the doctor, the gate and the quality probe; 26 in consumers, packs and app config; 11 in docs, the brief and research.
- 7 consumer greps, for 3 tables and 4 brain slugs.
- 4 signal SQL bodies run live.

Corrections (what was wrong → what is right → evidence):
1. §2 news rate "about 10 new URLs per day, 49 in 7 days" → about 7 per day over 7 days, and 10 per day over the last 4 → Q9 (49 and 40).
2. §2 swfl_inc "23 of 35 rows are 2021-2023" → 25 of 35 → Q12 year split 1 + 10 + 14. The 23 is the null-category count.
3. §5 "the ledger adds 5 more city-without-corridor gaps" → 4 more, because Marco Island is already in the registry line → `02-known-problems-ledger.md:49-53` against `cadence_registry.yaml:622`.
4. P3 and §11 cite `00-BRIEF.md:142-144` → `00-BRIEF.md:147-149` → the brief's nightly-chain paragraph.
5. P11 "keeps it FRESH (G5)" omitted the row verdict → the swfl_inc doctor row is 🔴 red (Run RED) since 09/21 → `gh run view 36259690113 --log`.
6. §8 `news_source_silent_7d`, a flat 7-day window → `news_source_silent` with per-source windows 7 / 7 / 10 / 21 / 10 → Q13. gulfshore_business had 12-day and 9-day first-seen gaps, so the flat window would have false-fired twice.
7. Item 6 "unblocks the served city-pulse brain" → it unblocks the direct table readers only. The brain needs a `daily-rebuild.yml` `pack_id=city-pulse-swfl` rebuild because the chain rebuild is stalled → `daily-rebuild.yml:15,141`, `00-BRIEF.md:147-149`.
8. Q11, P7 and item 3: Collier non-article rows "4 of 5", 7 govt rows, 16 to delete → 5 of 5, 8 govt rows, 17 to delete → the Q11 URL listing (none of the 5 Collier URLs is under `/News-articles/`).
9. P6 first seen "when those two sources were added" had no date → 07/14/2026 → `git log --format='%h %ci'`, a36d99ac.
10. §1 labeled `lib/zip-dossier.ts:185,187` a consumer with no qualifier → it is a brain coverage map, not a table read, and its `:184` comment says "7 cities" against 13 → the file itself.
11. §1 said the only swfl_inc downstream is econ-dev → master. It is also read, as the econ-dev brain, by `lib/email/activation/delta.ts:59`, `lib/highlighter/reach.ts:187` and `lib/zip-dossier.ts:181` → `rg -n "econ-dev-swfl" lib app`. The same applies to the city and corridor brains (`delta.ts:54-55`, `reach.ts:219,221`).

Unverifiable claims (why):
- The exact doctor branch that prints Run GREEN for city_pulse (P3c). The run join is in `ingest/lib/gh_runs.py`, and the second Opus did not trace it line by line either. It stays "needs review".
- The plan type behind the box credential file. Its presence is verified, but its account tier cannot be read without reading the secret.
- Why #212's class reads "TRANSIENT (429)" for a storage 544. That is classifier internals, handed to family 19.
- The live served econ-dev brain text. Only the local `brains/econ-dev-swfl.md` (v16, refined 09/15) was read.
- Whether the baseline Collier path yields candidates from a GitHub runner IP. It was proven only from the residential Windows IP. Item 1's proof settles it.
- The false-positive history of `city_pulse_distill_dead` before 09/08. Non-structural rows are pruned (`city_pulse/distill.py:299-302`).

Gaps filled:
- pulse-pool-evict.yml, an unregistered dispatch-only workflow that deletes from news_articles_swfl, added to §1, P15, §6, item 16, §8, §9 and §10 (Q14: an apply today deletes 303 of 590 rows).
- P14, the city_pulse_corridors_tier2 problem in §4. It was only in §6 before.
- Brain-level consumers in the activation email, the highlighter and the zip-dossier (§1). Also the news-swfl brain naming trap: it is the DBPR pack and never reads the news lake (§1).
- Item 5: the `log_api_usage` and USD `RunBudget` spend hooks that a CLI call cannot feed, at `distill.py:251`, the corridor `distill.py:216`, and `pipeline.py:97` / `:156` (§7, §10).
- §8 registry mechanics: the `failing_rows_sql` field, the table keys, proof that a contracts-only key is evaluated, and all 4 signal SQLs run live.
- §8 noise: the swfl_inc false red, #105's retired prescription, #212's missing check, and the #178 / `cron_incident_nightly_chain` share.
- §9: the runner re-verified online, the stale check `fedora_runner_not_registered_smoke_owed`, and pulse-pool-evict placement.
- §10: the consumer packs proven deterministic, and the workflow YAML grep shown.
- Item 14: 4 more stale doc lines. The "Haiku cost mode" note is at `cadence_registry.yaml:616`. The NEWS_ADAPTIVE "default off" docstring is at `fetcher.py:149`. The zip-dossier "7 cities" comment is at `lib/zip-dossier.ts:184`, and the phantom Vercel scoring cron comment is at `news-swfl-ingest.yml:5`.
- P10: the 08/26/2026 SWFL Inc. post, also missing from the table.

Section 8 audit:
- No per-run GitHub issue filing survives for this family. After items 6, 7 and 12, the only alarms are the four `sql_expectation` contracts, and each auto-closes (`check_data_quality.py:407-428`).
- Each pipeline has exactly one named signal on an existing seam: news_source_silent (news_swfl), city_pulse_distill_dead (city_pulse), corridor_pulse_distill_dead (both corridor entries, one table), and swfl_inc_scrape_dead (swfl_inc).
- The noise list is concrete: issues #105, #212 and #178, the watch-list lines `log-cron-incident.yml:66-67`, the check `cron_incident_nightly_chain`, the allowlist at `quality_registry.yaml:57-58`, and the pulse-pool-evict apply path.

Section 9 audit: every pipeline has a placement and a reason. Both Fedora moves name the gate `SWFL_LOCAL_RUNNER_READY` and the label `[self-hosted, swfl-local]`.

Credit-suggestion count: 0. `grep -n -i "credit|top up|top-up|console balance|api key funding|billing"` was run over the whole file after this section was written. Every hit is one of these, and none proposes, prices or hints at funding:
- the parked-state name "credit wall"
- the quoted log token
- the check key `llm_legs_parked_credit_wall`
- the BILLING class name, or issue #105's title
- a line of the double-check log or of this section

The one place a funding prescription exists is the body of issue #105, auto-generated before 09/15. Item 12 closes it.
