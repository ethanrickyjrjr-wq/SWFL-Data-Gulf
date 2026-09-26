# 01 listings-lifecycle — pipeline plan (09/26/2026)

Family 01 covers the SteadyAPI-era listing spine and everything that hangs off it. There are six registry entries: listing_lifecycle (the daily listing state machine), listing_week (the weekly training panel derived from it), market_aggregates_histogram and market_aggregates_details (realtor.com aggregates via SteadyAPI), rentals_swfl (the SteadyAPI rental sweep), and land_manufactured_swfl (never built).

Verdict: no new source observation has entered this family since 08/14/2026. Three of the six still run on schedule and report green while landing zero rows.
- The listing spine is parked on the operator's word. It still reds the nightly gate every night, and even the scrape revert could not turn the gate green if the secret came back.
- The histogram, details and rentals crons still call a vendor the operator retired on 09/15. Every run since 08/17 exits 0 with `rows=0`.
- listing_week keeps re-stamping a frozen spine into its training panel.

The plan:
- Park the whole family honestly: schedules off, `dispatch_only: true` on each entry (entries stay under `pipelines:` so the doctor keeps an honest yellow STALE row), the listing legs pulled out of the nightly chain.
- Make a zero-row run fail loud.
- Retire land_manufactured_swfl.
- List the un-park prerequisites so nobody has to re-derive them.

No LLM call exists in the family.

## 1. Scope

Evidence commands used throughout. Each ID is cited in front of the numbers it produced.

- E1 registry lines:
```
grep -n -E "name: (listing_lifecycle|listing_week|market_aggregates_histogram|market_aggregates_details|rentals_swfl|land_manufactured_swfl)$" ingest/cadence_registry.yaml
```
- E2 run lists (per workflow):
```
gh run list --workflow <file> --limit 15 --json databaseId,status,conclusion,createdAt,event
```
- E3 rows landed per run (per run id):
```
gh run view <id> --log | grep -oE "\[done\].*|\[budget\].*|\[raw\].*"
```
- E4 nightly-chain listing legs (per chain run id):
```
gh run view <id> --json jobs --jq '[.jobs[] | select(.name|test("listing lifecycle|assert_landed")) | .conclusion] | join(",")'
```
- E5 live lake. Read-only Bun.SQL session (`SET SESSION default_transaction_read_only = on`), connection copied from `scripts/apply-fdic-sod-view.mts:15-27`, run as `bun <scratchpad>/f01/q.mts <scratchpad>/f01/live.sql`. Queries:
```
select source_name, county, count(*), max(scraped_at), count(*) filter (where state='active') from data_lake.listing_state group by 1,2;
select count(*), max(at), max(scraped_at), min(at) from data_lake.listing_transitions;
select count(*) filter (where at > date '2026-08-14') from data_lake.listing_transitions;
select count(*), max(built_at), min(week_start), max(week_start), count(distinct county) from data_lake.listing_week;
select week_start, count(*), count(*) filter (where sold_next_week is null), max(built_at) from data_lake.listing_week group by 1 order by 1 desc;
select county, count(*) from data_lake.listing_week group by 1;
select county, captured_date, count(*) from data_lake.listing_price_histogram_swfl group by 1,2;
select captured_date, county, count(*) from data_lake.market_details_swfl group by 1,2;
select county, captured_date, count(*) from data_lake.rental_listings_swfl group by 1,2;
select count(*), max(captured_date) from data_lake.steadyapi_price_histogram_raw;  -- and the 4 sibling _raw tables
```
- E6 listing_week replay proof:
```
select count(*), count(*) filter (where a.state_at_week_end is distinct from b.state_at_week_end), count(*) filter (where a.list_price is distinct from b.list_price), count(*) filter (where a.cuts_to_date is distinct from b.cuts_to_date), count(*) filter (where a.dom_days is distinct from b.dom_days) from data_lake.listing_week a join data_lake.listing_week b using (address_key, sale_or_rent) where a.week_start=date '2026-08-17' and b.week_start=date '2026-09-07';
```
- E7 doctor, freshness-probe-daily run 36259690113 (09/26/2026):
```
gh run view 36259690113 --log | grep -E "listing_lifecycle|listing_week|market_aggregates|rentals_swfl"
```
- E8 tests:
```
ingest/.venv/Scripts/python.exe -m pytest -q ingest/tests/pipelines/listing_week ingest/tests/pipelines/market_aggregates ingest/tests/pipelines/rentals -p no:cacheprovider
ingest/.venv/Scripts/python.exe -m pytest -q ingest/tests/pipelines/listing_lifecycle ingest/pipelines/listing_lifecycle/test_extract_api.py -p no:cacheprovider
ingest/.venv/Scripts/python.exe -m pytest --co -q <dir>
```
- E9 classifier, run on each red log tail:
```
node -e "import('file:///C:/Users/ethan/dev/brain-platform/.github/scripts/classify-cron-failure.mjs').then(m=>console.log(m.classify(require('fs').readFileSync('<tail>','utf8'))))"
```
- E10 views that hard-code the spine's source name:
```
select c.relname, pg_get_viewdef(c.oid) like '%api_feed%' from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='data_lake' and c.relkind='v' and pg_get_viewdef(c.oid) like '%listing_state%';
```
- E11 served readers with no as-of handling (PowerShell):
```
$f = rg -l "listing_active_stats|market_details_swfl|rental_listing_stats|listing_price_histogram_swfl|listing_momentum_stats|listing_active_homes|listing_price_bands|listing_pulse_daily" lib app -g '!*.test.*'; foreach ($x in $f) { rg -q -i "captured_date|scraped_at|asOf|as_of|freshness" -- "$x"; if ($LASTEXITCODE -ne 0) { "NO-DATE: $x" } }
```
- E12 LLM grep, the full list is in section 10.

Pipelines, 6 in total (E1). Five are under `pipelines:` and one is under `not_yet_running:` (`ingest/cadence_registry.yaml:2329`).

listing_lifecycle, `ingest/cadence_registry.yaml:2073`
- Workflow `.github/workflows/listing-lifecycle-daily.yml`. The workflow's own cron is commented out (`:37-40`). It runs only as the `lifecycle` matrix job inside `nightly-chain.yml:123-139` for Lee, Collier and Hendry.
- `gh workflow list --all` shows it `disabled_manually`, yet it still runs every night through `workflow_call`.
- Tables: `data_lake.listing_state`, `listing_transitions`, `steadyapi_property_history_raw`, `steadyapi_search_raw`, and the parsed families `steadyapi_listing_events`, `steadyapi_tax_history`, `steadyapi_property_permits` (registry comment `:2113-2140`).
- Consumer pack: active-listings-swfl, which feeds master (`refinery/packs/master.mts:268,355`).

listing_week, `:1419`
- Workflow `listing-week-weekly.yml`. Table `data_lake.listing_week`.
- `consuming_pack: none`. It is a dark root, and its only code reader is the offline analysis `ingest/analysis/challenger.py:46`.

market_aggregates_histogram, `:2154`
- Workflow `ingest-market-aggregates-histogram.yml`. Tables `data_lake.listing_price_histogram_swfl` and `steadyapi_price_histogram_raw`.
- Consumer pack: price-distribution-swfl, which feeds master (`master.mts:264,345`).

market_aggregates_details, `:2174`
- Workflow `ingest-market-aggregates-details.yml`. Tables `data_lake.market_details_swfl` and `steadyapi_market_details_raw`.
- Consumer pack: market-temperature-swfl, which feeds master (`master.mts:266,347`).
- It also has direct readers: `lib/landing/load-home-map-data.ts:117-145` (the homepage map's "Median Sold Price"), `lib/desk/loaders.ts`, `lib/email/market-context.ts`, `app/charts/page.tsx` and `refinery/sources/active-rentals-source.mts`.

rentals_swfl, `:2240`
- Workflow `ingest-rentals.yml`. Tables `data_lake.rental_listings_swfl` and `steadyapi_rentals_search_raw`.
- Consumer pack: active-rentals-swfl, which feeds master (`master.mts:269,362`).

land_manufactured_swfl, `:2424`
- `workflow: none`, `parked: true` (`:2431`), no code and no table.
- Its declared consumer is active-listings-swfl.

Out of family but sharing code: `realtor_geo_trends` (family 02) runs `ingest.pipelines.market_aggregates.pipeline --resource geo-trends` through the same `steady_client.get_json` and has the same zero-row failure shape. It is flagged to family 02, not planned here.

## 2. What is being brought in

listing_lifecycle
- Source: SteadyAPI `/search` + `/property-tax-history` (realtor.com origin) under `source_name='api_feed'`, and a dormant Source-B brokerage scrape (`--source scrape`).
- The workflow has passed `--source scrape` since 09/15 (`listing-lifecycle-daily.yml:127`). `pipeline.py:361` still defaults to `api`.
- Fields: 42 columns on `listing_state`, per the column list in E5's information_schema read. They include price, beds/baths/sqft/lot, lat/lon, status flags, listed_date and sold_check_at. `listing_transitions` adds sold_price and sold_date.
- Geography and live rows (E5), `api_feed`:
  - Lee 25,413 rows (22,922 active)
  - Collier 9,505 (7,127 active)
  - Hendry 1,275 (1,039 active)
  - Total 36,193. The 298 Hendry `lifecycle_seed` rows bring it to 36,491, which matches `docs/standards/data-inventory.md:70`.
  - All three core counties are covered.
- Freshness (E5): `MAX(scraped_at)` = 08/14/2026 04:28 UTC for every county, 43 days old on 09/26/2026.
- `listing_transitions` (E5): 64,944 rows spanning 06/27/2026 to 08/14/2026, and 0 rows after 08/14/2026.
- Cadence: daily per the registry (cadence_days 1, tolerance 3.0).

listing_week
- Source: our own `listing_state` + `listing_transitions`, replayed as of each week's end (`ingest/pipelines/listing_week/builder.py:68-94`).
- Fields: the 24 columns in `db.py:9-16` + `built_at`.
- Live (E5): 310,860 rows, week_start 06/29/2026 to 09/07/2026, `MAX(built_at)` = 09/14/2026 14:51 UTC.
- By county: Lee 218,882, Collier 81,005, Hendry 10,973 (sum 310,860).
- Weeks present (E5): 06/29, 07/06, 07/13, 07/20, 08/03, 08/10, 08/17, 08/24, 09/07.
- Missing weeks: 07/27 (run 30809680320 skipped on 08/03, E2) and 08/31 (run 34130970473 failed on 09/07, E2).
- Every week from 08/10 on holds exactly 36,216 rows (E5).
- Cadence: weekly, Monday 08:00 UTC (`listing-week-weekly.yml:12`).

market_aggregates_histogram
- Source: SteadyAPI `/price-histogram` per county (`resources.py:63-73`).
- Fields: band_min, band_max, band_range, listing_count, total_listings, status.
- Live (E5): 400 rows across captured_date 07/01, 07/06, 07/13, 07/20 and 08/10/2026, 40 bands × 2 counties per capture (5 × 80 = 400).
- Newest capture 08/10/2026. Lee and Collier only; Hendry is not covered.
- Raw landing (E5): 2 rows, max 08/10/2026.

market_aggregates_details
- Source: SteadyAPI `/housing-market-details` per ZIP (`resources.py:78-120`).
- Fields: 23 columns (`pipeline.py:43-52`), including median_sold_price, median_listing_price, median_rent_price, DOM, $/sqft, hotness, sold_to_rent_ratio and the market_comparison block.
- Live (E5): 162 rows. Three captures (07/01, 07/04, 08/04/2026) of 54 rows each, Lee 34 ZIPs and Collier 20.
- The run log says 57 calls (E3, run 30923149871), so 3 ZIPs return no metrics.
- Newest capture 08/04/2026. Hendry is not covered.
- Raw landing: 57 rows, max 08/04/2026 (E5).

rentals_swfl
- Source: SteadyAPI `/rentals-search`, county form, paginated (`ingest/pipelines/rentals/resources.py:79-111`).
- Fields: 16 columns (`rentals/pipeline.py:25-27`), price/beds/baths/sqft ranges plus address.
- Live (E5): 38,620 rows spanning captured_date 07/02 to 08/10/2026.
- Newest capture 08/10/2026: Lee 4,009 and Collier 3,360.
- There is no Lee row for 07/13/2026 (E5). That is the partial run 29257047491, which logged `per-county={'Lee': 1, 'Collier': 205}` (E3).
- Hendry is not covered (registry `:2259` already names the gap).
- Raw landing: 8,943 rows (E5).

land_manufactured_swfl
- Nothing is brought in. There is no pipeline code, and `data-inventory.md:178` says "not yet built".

Source freshness. No crawl4ai was run, for these reasons:
- The SteadyAPI legs (lifecycle api path, histogram, details, rentals, land) use a vendor the operator retired on 09/15/2026 ("Forget the steady api", `wiki/pipeline-health.md:134-135`).
- The Source-B origin is unknown to every lane (check `incognito_secrets_have_no_recovery_path`).
- listing_week is derived from our own lake.
- land_manufactured has no source.

The replacement lanes named below were checked for health instead (E7, same doctor run):
- `market_heat_swfl` is green; newest run 34253707693 succeeded on 09/08/2026.
- `zori_swfl_tier2` is green.
- `collier_official_records` is green.

## 3. What is working

- Unit tests are green (E8):
  - 46 passed across listing_week (19 collected), market_aggregates (16) and rentals (11).
  - 202 passed across `ingest/tests/pipelines/listing_lifecycle` (194) and `ingest/pipelines/listing_lifecycle/test_extract_api.py` (8).
- listing_lifecycle's no-fake-green guard works. `[fatal] every county returned 0 rows — failing loud` (`pipeline.py:345`) fired in run 36232679167 on 09/26/2026 (E4 log tail), so the spine fails red instead of landing nothing green.
- `assert_landed` works as designed. Run 36232679167 (09/26/2026) printed `listing_lifecycle — STALE: last landed 2026-08-14` next to three LANDED rows (live_search_daily_median_asking 214, live_search_daily_mortgage 15, city_pulse 100).
- listing_week's pure builder and its fatal-on-zero guard (`listing_week/pipeline.py:56-59`) are sound. 7 of the last 10 runs are green (E2: 07/20, 07/27, 08/10, 08/17, 08/24, 08/31, 09/14; red 09/07 and 09/21; skipped 08/03).
- The details content contract (`market_aggregates/pipeline.py:120-130`) shows PASS on the doctor (E7).
- Served surfaces label their dates. `lib/landing/load-home-map-data.ts:133-145` and `:167-181` stamp `asOf` from captured_date/latest_scraped_at, and the four refinery sources carry captured_date or scraped_at (`refinery/sources/price-distribution-source.mts:108-114`, `market-temperature-source.mts:92-100`, `active-rentals-source.mts:86-97`, `active-listings-residential-source.mts:154-163`).
- Last real landings, the proof the code paths worked while the vendor did (E3 plus E5):
  - Histogram run 31385160828 on 08/10/2026 (`rows=80`).
  - Details run 30923149871 on 08/04/2026 (`rows=54`).
  - Rentals run 31390018355 on 08/10/2026 (`rows=9296` printed; 7,369 table rows after PK dedupe per E5).
  - Lifecycle: the last chain success was 08/14/2026 05:49 UTC:
```
gh run list --workflow nightly-chain.yml --limit 200 --json conclusion,createdAt --jq '[.[]|select(.conclusion=="success")]|.[0].createdAt'
```

## 4. Problems

P1. Three crons report green while landing zero rows, against a retired vendor
- Symptom (E3):
  - Histogram run 35628142891 (09/21/2026): `[budget] histogram = 2 price-histogram calls` then `[done] histogram rows=0 dry_run=False`, conclusion success.
  - Rentals run 35632880381 (09/21/2026): `rentals = 2 rentals-search calls ... per-county={'Lee': 1, 'Collier': 1}` and `[done] rentals rows=0`, success.
  - Details run 33896288644 (09/04/2026): `details = 57 housing-market-details calls` and `[done] details rows=0`, success.
- Tally over the last 15 runs (E2 plus E3 per run):
  - Histogram: 5 real landings, 7 zero-row greens (07/27, 08/17, 08/24, 08/31, 09/07, 09/14, 09/21), 1 skipped (13 runs exist).
  - Rentals: 5 full landings, 1 partial (07/13), 7 zero-row greens (same dates), 1 dry-run, 1 skipped (15 runs).
  - Details: 3 real, 1 zero-row green (4 runs exist).
- Root cause:
  - `market_aggregates/steady_client.py:43-44` and `rentals/steady_client.py:42-43` return `(status, None)` on any non-200.
  - The fetchers turn that into an empty result (`market_aggregates/resources.py:71-72,132`, `rentals/resources.py:101-102`).
  - `run_histogram`, `run_details` and `rentals.run` print `rows=0` and `main()` returns 0 (`market_aggregates/pipeline.py:189-195`, `rentals/pipeline.py:65-66`).
  - The status code is never logged, so the vendor's answer (403, 429 or other) is unrecoverable from the logs.
- Scope of the shape (RULE 0.5c): `grep -rn "return r.status_code, None" ingest/pipelines --include=*.py` finds 2 client files (`market_aggregates/steady_client.py:44`, `rentals/steady_client.py:43`). They have 4 callers: histogram (`market_aggregates/resources.py:71`), details (`:132`), rentals (`rentals/resources.py:101`) and geo-trends (`market_aggregates/resources.py:192`, family 02, whose `run_geo_trends` at `pipeline.py:139-175` only warns per anchor). No other pipeline matches.
- Severity: blocks a served number. The histogram and rentals freshness reads STALE, but only yellow (E7: `market_aggregates_histogram ... STALE ... 🟡 yellow`, `rentals_swfl ... STALE ... 🟡 yellow`), and no alert says why. The crons also keep calling a vendor the operator retired on 09/15/2026.
- First seen:
  - 07/13/2026 as a partial (rentals run 29257047491, Lee 1 call).
  - 07/27/2026 total (runs 30271334772 and 30274142306).
  - Permanent since 08/17/2026 (runs 32025078708 and 32029977812); details since 09/04/2026.
- The same shape is logged twice before in `docs/audit/2026-07-11-pipeline-problems/02-known-problems-ledger.md:81` (429 no retry) and `:117` (403 subscription suspended, 07/07/2026).

P2. market_aggregates_details reads FRESH while its source is dead
- Symptom (E7): `market_aggregates_details | table | FRESH | NO_FLOOR | PASS | GREEN | 🟡 yellow`.
- Root cause:
  - The threshold is cadence_days × tolerance = 30 × 2.0 = 60 days (`ingest/scripts/check_freshness.py:498-499`), and STALE needs age > threshold (`:516`).
  - The newest capture, 08/04/2026, was 53 days old on 09/26/2026, so it stays FRESH through 10/03/2026.
  - The next scheduled fire, 10/04/2026 13:00 UTC (`ingest-market-aggregates-details.yml:14`), will make 57 more calls to the retired vendor.
- Severity: blocks a served number (freshness caveat). The per-ZIP sold median on the homepage map (`load-home-map-data.ts:117-145`) and market-temperature-swfl are a 08/04/2026 snapshot that no signal flags.
- First seen: 09/04/2026 (run 33896288644).

P3. listing_week replays a frozen spine into the training panel
- Symptom (E6): weeks 08/17 and 09/07 join on all 36,216 keys with 0 differences in state_at_week_end, 0 in list_price and 0 in cuts_to_date.
  - 31,740 rows differ only in dom_days, because `builder.py:89` computes `(week_end - listed).days` for weeks nothing observed.
  - `listing_transitions` has 0 rows after 08/14/2026 (E5).
- Rows affected: the three post-freeze weeks, 08/17, 08/24 and 09/07/2026, at 36,216 each, 3 × 36,216 = 108,648 rows (E5).
- Root cause: `listing_week/pipeline.py:40-54` builds whatever `listing_state` says, with no check that the week was observed. The freshness column `built_at` (registry `:1428`) moves on every replay, so the doctor reads FRESH (E7). This is the same "pipeline alive ≠ source published" trap documented on `dbpr_press_releases`.
- Severity: blocks a consumer (the sell-odds panel `challenger.py` trains on). It is not a served number.
- First seen: the week 08/17 build on 08/24/2026 (run 32708433215).

P4. listing_week labels: NULL means both "censored" and "nothing happened"
- Symptom (E5): week 08/03/2026 has 35,702 rows, and 34,424 of them have a NULL `sold_next_week` although that week's labels were filled.
- Root cause:
  - `builder.py:105-128` emits updates only for keys that had an event next week.
  - `db.py:31-35` (`LABEL_SQL`) updates only those keys.
  - Every observed no-event row stays NULL, which contradicts the registry's own contract that the "last completed week [is] always NULL-labeled = censored" (`:1430`).
  - `challenger.py:89` then filters `price_cut_next_week IS NOT NULL`. It trains on event rows only, so its base rate is conditioned on "something happened".
- Severity: blocks a consumer (offline model correctness).
- First seen: 07/19/2026 backfill.

P5. listing_week skips a missed week permanently
- Symptom (E5): week_start 07/27 and 08/31 are absent. Week 07/20's labels are all NULL (34,204 of 34,204), because the run that should have filled them (08/03) was skipped.
- Root cause: `listing_week/pipeline.py:27-28` builds only `last_completed`. There is no catch-up from `MAX(week_start)+7`.
- Severity: blocks a consumer.
- First seen: 08/03/2026 (run 30809680320, skipped, ENGINE_ENABLED off).

P6. listing_week DB failures classify as UNKNOWN
- Symptom (E2 plus `gh run view --log-failed`):
  - Run 35615531541 (09/21/2026): `psycopg.errors.QueryCanceled: canceling statement due to statement timeout` at `db.py:80` (`STATE_SQL`).
  - Run 34130970473 (09/07/2026): `psycopg.OperationalError: consuming input failed: server closed the connection unexpectedly` at `db.py:99`.
- Both classify `UNKNOWN` (E9). Issue #213 is open, and its "Auto-diagnosis" carries only "Unrecognised failure shape — needs diagnosis."
- Root cause: `.github/scripts/classify-cron-failure.mjs` has no pattern for Postgres statement timeouts or dropped connections. The 09/21 run fell inside the 09/21 REST/DB outage (`_ASSISTANT/SCRATCHPAD.md` 09/21 entry).
- Severity: cosmetic, but it adds noise. An UNKNOWN is routed to the LLM narrative leg (section 10), and the doctor already calls the same failure TRANSIENT (E7: `listing_week — TRANSIENT (should_retry=true)`).
- First seen: 09/07/2026.

P7. The parked listing legs red the nightly chain every night
- Symptom (E4): in all 15 of the last 15 nightly-chain runs (36232679167 back to 35433117190), the Lee, Collier and Hendry legs and the `gate · assert_landed` job all concluded failure.
- Log (09/26/2026, Lee):
  - `LISTING_LIFECYCLE_BASE_URL: ` (blank, unmasked)
  - then `[warn] Source B scan error for Lee: LISTING_LIFECYCLE_BASE_URL is not set`
  - then `[fatal] every county returned 0 rows`
- Classified `DATA_EMPTY` (E9). Issue #178 `[cron-failure:nightly-chain] DATA_EMPTY` has been open since 08/15/2026. Check `cron_incident_nightly_chain` is open, 75 days untouched (`node scripts/check.mjs list`).
- Root cause: `listing_lifecycle` still carries `nightly: true` (`:2076`), and `nightly-chain.yml:123-139` still fans the three legs out. The park (SCRATCHPAD 09/15 "listings PARKED") changed intent but no configuration.
- Today's gate had exactly one red row, listing_lifecycle, so this leg alone reds the gate.
- Severity: cosmetic for data (the lake is frozen either way), but it is a red row every night that nobody is going to act on.
- First seen: 08/15/2026 (issue #178).

P8. The scrape revert cannot land a gate-passing row even with the secret set
- Root cause:
  - The scrape path writes `source_name = 'lifecycle_seed'` (`ingest/pipelines/listing_lifecycle/distill.py:80`, selected at `pipeline.py:101`).
  - The registry probe scopes on `source_name: api_feed` (`:2085`), and `assert_landed.py:104-106` counts `WHERE source_name = ...`.
  - All 5 live views over `listing_state` hard-code `api_feed` (E10: listing_active_homes, listing_dom, listing_momentum_stats, listing_price_bands, listing_transitions_recent_zip_stats).
  - So do 13 SQL files under `docs/sql` and `migrations`, and 11 code files under lib/refinery/app/scripts:
```
grep -rl "'api_feed'\|\"api_feed\"" docs/sql migrations | wc -l
grep -rl "api_feed" lib refinery app scripts --include=*.ts --include=*.mts --include=*.tsx | grep -v test | wc -l
```
- Consequence: `wiki/pipeline-health.md:88-90` says reverting is "one uncomment". Verified that the scrape path was never proven in CI: run 28496497637's own line reads `[done] {'scanned': 21889, ...} dry_run=False source=api`. The wiki's "ran clean from GitHub's own runner IPs 2026-07-01" needs review, and the workflow header `listing-lifecycle-daily.yml:9-11` already corrects it.
- Severity: blocks a consumer on un-park, not today.
- First seen: 09/15/2026 revert.

P9. A frozen-table content contract reds the doctor
- Symptom (E7): `listing_lifecycle — content contract failed: data_lake.listing_state.list_price listing_state_home_price_floor (error) — 22 failing rows`.
- Root cause: `ingest/quality/quality_registry.yaml:135-146` evaluates a table that has not changed since 08/14/2026.
- The contract has `severity: error`, and the doctor maps an error-severity FAIL to red (`ingest/scripts/doctor.py:144-145`). The Run column also reads DISABLED, because the workflow is `disabled_manually` but still invoked (`doctor.py:175`, `ingest/lib/gh_runs.py:189`).
- Severity: cosmetic while parked.
- First seen: doctor 09/26/2026 (E7).

P10. Four served readers of frozen roots print no date
- Symptom (E11): 4 of the 14 lib/app files that read a frozen view in this family never mention captured_date, scraped_at, asOf or freshness:
  - `lib/buyer-leverage/zip-benchmark.ts`
  - `lib/zip-report/candidates.ts`
  - `lib/week-in-review/load.ts`
  - `lib/email/doc/seed-chart-series.ts`
- This is a grep heuristic: a caller may stamp the date elsewhere. It needs a read per file before it is called a defect.
- Severity: may block a served number (an undated 08/2026 figure).
- First seen: 09/26/2026, this audit.

P11. land_manufactured_swfl's registry text contradicts itself
- Verified side: the graduation comment says the vendor accepts "ONE property_type value per call" (`:2420`).
- Needs review: `source_ceiling` says land and manufactured "cannot be filtered at the SteadyAPI/realtor.com level at all" (`:2435`).
- Both are moot: the vendor is out.
- A free lane for the same question already exists in another family's research. Registry `:1195` (family 10's Lee ArcGIS source_ceiling) records "two manufactured-home layers (43,000+ lots — direct fix for the parked land_manufactured_swfl gap)", with `MobileHomeLots` lastEditDate 09/20/2026 = LIVE and `Mobile_Home_Points` 10/19/2022 = DEAD.
- Severity: cosmetic.
- First seen: 07/07/2026 (as_of on `:2435`).

Discrepancy with the brief
- The brief says the rebuild is "stalled behind" the gate. `nightly-chain.yml` T3 (comment above the rebuild job, 09/15/2026) says the gate "no longer BLOCKS the rebuild".
- Today's `rebuild · brains` in run 36232679167 did run, and failed on packs outside this family: `BUILD FAILED — pack=cre-swfl`, `pack=macro-us`, `pack=macro-florida` at 09:27:13-09:27:19 UTC, each on its unattended LLM leg. Those packs belong to other families.
- Chain verified: the rebuild is not stalled behind this family's gate. The brief line needs review.

## 5. What is missing

- Against source_ceiling:
  - listing_lifecycle's ceiling (`:2109`) is "largely closed". The remaining `statistics{}/meta{}` rollups have no typed table, and brokerage/agent fields are a vendor ceiling.
  - Rentals is missing Hendry (`:2259`).
  - Histogram and details are both "full extraction" (`:2169`, `:2192`). Details' endpoint-level siblings (`/neighborhood-market-trends`, `/property-urgency` and others, `:2192`) are all SteadyAPI, now out.
  - None of these gaps is worth closing on a retired vendor.
- Against what the consumers need: every consumer pack is frozen at its last capture. The free lanes that already exist and are green (E7) cover part of it.
  - market_heat_swfl (realtor.com Economic Research Data Library, registry `:475-497`, the same realtor.com origin as details) already carries these ZIP-grain fields that market_aggregates_details served: median listing price, median days on market, median listing price per sqft, hotness score, active listing count, price_reduced_share.
  - The details fields NOT covered by any free lane: median_sold_price, median_rent_price, sold_to_rent_ratio, list_to_sold_ratio_pct. The operator's 09/15 order routes sold prices to the deed/official-records and LEEPA lanes (SCRATCHPAD 09/15, "Sold prices come from the deed/official-records and LEEPA lanes"). Those belong to families 08 and 10.
  - Rent level: `zori_swfl_tier2` (green, E7) is a smoothed rent index, not inventory. `docs/handoff/2026-07-11-reliable-sources-findings.md:235-236` found no free structured rental-listing source, so rental inventory grain has no free replacement.
  - The price histogram has no free replacement. `data_lake.listing_price_bands` derives bands from `listing_state`, which is frozen too.
- Against data-roots:
  - `docs/standards/data-roots.md:75` still marks `market_details_swfl_latest.median_sold_price` 🟢 as the per-ZIP sold root.
  - `:82` names `rentals_swfl` as the own-inventory rent root.
  - `:503` names `market_aggregates_histogram` 🟡 as the price-band root.
  - All three roots have been frozen since 08/2026 and none says so.
- Consumers that should exist and do not:
  - listing_week has no registered consumer. The sell-odds Phase 1/2 jobs named in registry `:1421-1423` do not exist in code; the only reader is `ingest/analysis/challenger.py`:
```
grep -rln -i "sell_odds\|sell-odds" ingest lib refinery scripts app .github
```
  - It is a DARK ROOT, confirmed.
- Operational gaps:
  - No zero-row guard on 3 of 4 SteadyAPI runners (P1).
  - No observed-week guard on listing_week (P3).
  - No catch-up (P5).
  - No test asserts a nonzero exit on zero rows for market_aggregates or rentals. Only dry-run tests exist:
```
grep -n -i "exit\|rows=0\|SystemExit" ingest/tests/pipelines/market_aggregates/*.py ingest/tests/pipelines/rentals/*.py
```

## 6. Verdict per pipeline

- listing_lifecycle — PARK. It is parked by the operator's word (SCRATCHPAD 09/15) and the park needs to be made real in configuration. The number that changes the verdict: a non-empty `LISTING_LIFECYCLE_BASE_URL` plus the operator's word to un-park. Until then it has landed 0 rows since 08/14/2026.
- listing_week — PARK. Its only input has been frozen since 08/14/2026, and every run adds 36,216 replay rows (E5). The number that changes it: `MAX(listing_state.scraped_at)` newer than the week being built.
- market_aggregates_histogram — PARK. The vendor is retired, and the code stays inert per the operator ("SteadyAPI code stays inert", `wiki/pipeline-health.md:134-135`). The number that changes it: a non-zero `rows=` on a real run from a permitted source.
- market_aggregates_details — PARK. Same reason. The free replacement for 6 of its fields already runs (market_heat_swfl). The number that changes it: an operator decision to repoint market-temperature-swfl (section 12).
- rentals_swfl — PARK. Same vendor. No free replacement exists (findings `:235-236`). The number that changes it: one free structured rental-listing source found.
- land_manufactured_swfl — RETIRE. It has no code and its premise is a retired vendor. The number that changes it: none. The free question it wanted to answer (manufactured-home and land stock) already has a live free lane recorded at registry `:1195` (Lee ArcGIS `MobileHomeLots`, lastEditDate 09/20/2026) plus parcel DOR use codes; both belong to families 08 and 10.

## 7. The plan

Ordered. Every item is Lane D unless stated otherwise. No item dispatches a workflow, writes `data_lake.*`, sets the listing secret or moves the listing pipeline to Fedora. The operator's 09/15 order stands.

1. Stop the three crons calling the retired vendor. DO.
   - What: comment out `schedule:` in `ingest-market-aggregates-histogram.yml:12-13`, `ingest-market-aggregates-details.yml:13-14` and `ingest-rentals.yml:14-15`. Leave `workflow_dispatch` in place.
   - Where: those three files.
   - Lane: D. Effort: S.
   - Proof: `node scripts/schedule-catalog.mjs | grep -iE "aggregates|rentals"` prints no schedule, and `gh run list --workflow ingest-rentals.yml --limit 1` shows no run after 09/28/2026.
   - Unblocks: ends weekly calls to a vendor the operator retired on 09/15/2026. The details fire due 10/04/2026 does not happen.

2. Register the park. DO.
   - What: on the `market_aggregates_histogram`, `market_aggregates_details` and `rentals_swfl` entries, add `dispatch_only: true` with a comment ("SteadyAPI out 09/15/2026; code inert; last real capture MM/DD/YYYY"). Keep the entries under `pipelines:`.
   - Why not `not_yet_running:`: the doctor re-lists any quality-registry table that has no `pipelines:` entry as a `coverage_only` line forced RED (`ingest/scripts/doctor.py:406-432`, table list built at `:700`). `market_details_swfl` carries contracts (`ingest/quality/quality_registry.yaml:316`), so moving it would trade a yellow row for a red one.
   - Pattern: `neighborhood_amenities` (`:2279`, `dispatch_only: true` at `:2281`), the same SteadyAPI park.
   - Also set details `tolerance_multiplier: 1.5` (45 days), so it reads STALE now (08/04/2026 + 45 days = 09/18/2026) instead of FRESH through 10/03/2026 (P2).
   - Where: `ingest/cadence_registry.yaml`.
   - Lane: D. Effort: S.
   - Proof: the pre-push identity gate (Gate 7, `.claude/hooks/check-prepush-gate.mjs:425-458`) passes, and the doctor shows all three STALE and yellow, none FRESH:
```
bun ingest/tools/check-registry-identity.mts --static
ingest/.venv/Scripts/python.exe -m ingest.scripts.doctor | grep -E "market_aggregates|rentals_swfl"
```
   - Gate 10 is unaffected: it only checks active crons, and commented crons count as dispatch-only (`check-prepush-gate.mjs:1118-1121`).
   - Unblocks: the doctor tells the truth (frozen, yellow) for all three, including details.
   - Same commit as item 1, so no scheduled-but-dispatch-only drift is created.

3. Take the parked listing legs out of the nightly chain. DO.
   - What:
     - Delete the `lifecycle:` job in `nightly-chain.yml:123-139` and drop `lifecycle` from `row-gate.needs` (`:162`), leaving a comment that un-park is a revert of this one commit.
     - On `listing_lifecycle`, remove `nightly: true` (`:2076`) and add `dispatch_only: true`. Keep it under `pipelines:` for the same doctor reason as item 2 (`listing_state` carries contracts at `quality_registry.yaml:86`).
     - Set `listing_state_home_price_floor` from `severity: error` to `severity: warn` while parked (`quality_registry.yaml:135-139`), with a comment to restore `error` on un-park. Its 22 failing rows sit on a table that cannot change, and error severity maps to red (`doctor.py:144-145`).
     - `lifecycle` appears in `nightly-chain.yml` only at `:123-139` (the job) and `:162` (`row-gate.needs`), plus comments at `:8` and `:120` (`grep -n "lifecycle" .github/workflows/nightly-chain.yml`). No `needs.lifecycle.result` reference exists, so deleting the job leaves the workflow valid.
   - Where: `.github/workflows/nightly-chain.yml`, `ingest/cadence_registry.yaml`, `ingest/quality/quality_registry.yaml`.
   - Lane: D. Effort: S.
   - Proof: the next chain run's `gate · assert_landed` shows only the 3 other nightly sources, all LANDED (run 36232679167 showed them LANDED today).
```
gh run view <next-chain-id> --json jobs --jq '.jobs[].name'
```
   - Consistency with the 09/15 order: it does not chase the secret, re-fire the legs or move them to Fedora. It stops firing them, which is what "parked" means.
   - Unblocks: the chain's row gate turns green. Issue #178 will NOT auto-close, because the chain stays red on its rebuild leg (section 4, discrepancy note). Close #178 by hand, citing the removed legs and the first gate-green run.
   - The doctor row for listing_lifecycle drops from red to yellow STALE (P9), which is the honest parked state. Proof: `ingest/.venv/Scripts/python.exe -m ingest.scripts.doctor | grep listing_lifecycle` shows yellow.

4. Park listing_week with its upstream. DO.
   - What: comment out `listing-week-weekly.yml:11-12` and add `dispatch_only: true` to the `listing_week` entry (`:1419`), same pattern as item 2.
   - Where: those two files.
   - Lane: D. Effort: S.
   - Proof: no `listing-week-weekly` run after 09/28/2026 (`gh run list --workflow listing-week-weekly.yml --limit 1`), and `bun ingest/tools/check-registry-identity.mts --static` exits 0.
   - Unblocks: stops adding 36,216 replay rows a week (E5). Issue #213 can be closed by hand, citing this plan (it will not auto-close with no next run).

5. Add an observed-week guard to listing_week. DO.
   - What: in `listing_week/pipeline.py:40-54`, before building week `w`, require `MAX(listing_state.scraped_at) >= w + 6 days`. Otherwise print `[listing-week] SKIP <w>: spine last observed <date>` and exit 1 on a real run if no week was buildable.
   - Change the registry `freshness_column` from `built_at` to `week_start`, so freshness reads the content week, not the build clock.
   - Add a failing test first: `test_refuses_unobserved_week` in `ingest/tests/pipelines/listing_week/test_pipeline.py`, using the existing `_io` injection seam.
   - Lane: D. Effort: S.
   - Proof:
```
ingest/.venv/Scripts/python.exe -m pytest -q ingest/tests/pipelines/listing_week
```
   - Unblocks: a re-activated spine can never again replay into the panel.

6. Delete the three replay weeks from listing_week. ASK-FIRST (data_lake write).
   - What: `DELETE FROM data_lake.listing_week WHERE week_start IN ('2026-08-17','2026-08-24','2026-09-07')`, expected 108,648 rows (E5, 3 × 36,216). Idempotent, row count reported.
   - Where: a one-shot script under `scripts/`.
   - Lane: D. Effort: S.
   - Proof: E5's per-week query returns no rows for those three dates.
   - Unblocks: the panel no longer carries weeks nobody observed.
   - Week 08/10/2026 stays: its days 08/10 to 08/14 were observed.

7. Fix label semantics and catch-up before any un-park. DO, queued behind un-park.
   - What:
     - `label_updates` (`builder.py:105-128`) emits False for every observed row of week `w` that had no event, keeping NULL only for the censored last week.
     - `run()` builds from `MAX(week_start)+7` rather than only `last_completed` (`pipeline.py:27-28`).
     - `challenger.py:89` then trains on the full observed population.
   - Lane: D. Effort: M.
   - Proof: new tests `test_no_event_rows_get_false_labels` and `test_catches_up_missed_week`, plus E5's per-week NULL count, where NULL rows must equal only the last week's rows.
   - Unblocks: a correctly specified hazard panel (P4, P5).

8. Zero rows is a failure: fix the 3 in-family call sites and hand the 4th to family 02. DO.
   - What:
     - In `market_aggregates/pipeline.py` `run_histogram`/`run_details` and `rentals/pipeline.py` `run`, `sys.exit(1)` with `[fatal] 0 rows on a real run` when `n == 0 and not dry_run`, mirroring `listing_week/pipeline.py:56-59`.
     - Carry the HTTP status out of `get_json` into one `[vendor] <path> status=<st>` log line (`market_aggregates/steady_client.py:43-47`, `rentals/steady_client.py:42-46`).
     - Tell family 02 that `run_geo_trends` needs the same guard.
   - Tests first: `test_zero_rows_exits_nonzero` in `ingest/tests/pipelines/market_aggregates/` and `.../rentals/`, via monkeypatched `get_json`.
   - Lane: D. Effort: S.
   - Proof:
```
ingest/.venv/Scripts/python.exe -m pytest -q ingest/tests/pipelines/market_aggregates ingest/tests/pipelines/rentals
```
   - Unblocks: any future run of this code, on any source, can no longer be a green zero. Parked code gets a guard rather than a feature.

9. Teach the classifier Postgres transients. DO (shared file, tell family 19).
   - What: add `canceling statement due to statement timeout` and `server closed the connection unexpectedly` to the TRANSIENT class in `.github/scripts/classify-cron-failure.mjs`, with test cases in its test file.
   - Lane: D. Effort: S.
   - Proof: E9 on `lw1.log` and `lw2.log` returns `TRANSIENT`.
   - Unblocks: these failures take heal's L0 retry path instead of the UNKNOWN → LLM narrative route (section 10).

10. Retire the land_manufactured_swfl entry. DO.
    - What: replace the block at `:2397-2437` (comment preamble plus entry) with a `# RETIRED 09/2026` comment in the house style (see the `active_listings` retirement comment at `:2065-2072` in the listing_lifecycle region). Its reason: the premise was SteadyAPI `/search` per property_type, and the vendor was retired 09/15/2026. The free stock question points at registry `:1195` (Lee ArcGIS `MobileHomeLots`, families 08 and 10).
    - Lane: D. Effort: S.
    - Proof: `grep -n "name: land_manufactured_swfl" ingest/cadence_registry.yaml` returns nothing; Gate 10 passes on push.

11. Correct the docs that claim otherwise. DO.
    - What:
      - `wiki/pipeline-health.md:88-90`: the scrape path was never proven in CI (run 28496497637 logged `source=api`), and a revert also needs the source_name decision (P8).
      - `docs/standards/data-inventory.md:70-81`: mark the five rows parked, with last real observation dates: listing_lifecycle 08/14/2026, listing_week week 08/10/2026 (spine through 08/14), histogram 08/10/2026, details 08/04/2026, rentals 08/10/2026.
      - `docs/standards/data-roots.md:75,82,503`: mark the three roots "frozen since MM/DD/YYYY, vendor out".
    - Lane: D. Effort: S.
    - Proof: `grep -n "parked\|frozen" docs/standards/data-inventory.md docs/standards/data-roots.md`.

12. Audit the four undated readers. DO.
    - What: open each P10 file and either stamp the as-of date from the view's captured_date/latest_scraped_at, or record why the caller already does.
    - Lane: D. Effort: M.
    - Proof: E11 prints no `NO-DATE` line, or each remaining line has a code comment naming where the date is rendered.
    - Unblocks: no undated 08/2026 figure reaches a reader.

13. Repoint market-temperature-swfl's overlapping fields to market_heat_swfl, and decide the frozen packs' fate. ASK-FIRST (pack OUTPUT shape).
    - See section 12, questions 1-2.
    - Lane: D. Effort: M.
    - Proof: `bun refinery/cli.mts --pack market-temperature-swfl` build plus the Stage-4 validator green.

14. Un-park prerequisites for listing_lifecycle, recorded only. ASK-FIRST, operator's lane.
    - The source_name coupling (P8): write scrape rows as `api_feed`, or repoint 5 views, 11 code files and the registry.
    - The secret value and its recovery path (checks `listing_base_url_secret_empty`, `incognito_secrets_have_no_recovery_path`).
    - Reuse terms for scraping the brokerage site (`wiki/pipeline-health.md:93-94`, "unresolved").
    - Apify is the paid catch-up lane if listings resume (SCRATCHPAD 09/15). Nothing is built here.

## 8. Checks and balances

Design rule: one signal per pipeline, using seams that already exist. It fires only when a served number would be wrong or a consumer would read stale, it clears itself on green, and it never opens a GitHub issue per run.

listing_lifecycle
- Signal while parked: none that pages. The served number is a frozen snapshot, and the served surfaces stamp its date (`load-home-map-data.ts:167-181`; the four refinery sources carry scraped_at or captured_date). Item 12 closes the four readers that may not.
- Signal on un-park: `nightly: true` comes back with `expected_rows_min: 28000` (`:2091`), and `assert_landed.py` goes red the first night rows do not land. That gate already exists, auto-greens and files no per-run issue.
- Noise to delete:
  - The chain's 3 red legs per run (item 3).
  - The doctor red (P9). It drops to an honest yellow STALE (item 3).
  - Issue #178, closed by hand (item 3). It cannot auto-close while the rebuild leg keeps the chain red.
  - Keep checks `listing_base_url_secret_empty` and `incognito_secrets_have_no_recovery_path`; they are the un-park prerequisites.

listing_week
- Signal: registry `freshness_column: week_start` (item 5) plus the observed-week guard.
  - Freshness reads the content week, so a frozen spine turns it STALE instead of FRESH-by-replay. The entry stays under `pipelines:` with `dispatch_only: true` (item 4), so this signal works as soon as item 5 lands, even while parked: max week_start 09/07/2026 is 19 days old against a 14-day threshold (7 × 2.0).
  - The guard makes a real run exit 1, so `log-cron-incident` records it once and closes it on the next green (`log-cron-incident.mjs:173,292`).
- Noise to delete: issue #213 (close by hand when parked, item 4).

market_aggregates_histogram
- Signal: the zero-row fatal exit (item 8). A green run now means rows landed. On un-park, add `expected_rows_min: 72` (90% of 80 bands a capture per E5) with a `count_filter` scoped to the newest captured_date.
- Only if the latest-capture scope exists: `check_freshness.py:431-490` counts the whole table (`SELECT count(*) ... WHERE source_name`), and this table is append-only, so a total-row floor at 400 would never trip. If no such filter exists, the fatal exit stands alone.
- While parked, its yellow STALE doctor row IS the signal: served and frozen, no page, no issue. Keep it.

market_aggregates_details
- Signal: the same fatal exit (item 8), plus `tolerance_multiplier: 1.5` (item 2). The 45-day window turns a dead month STALE before a second month passes; today's 2.0 hid P2 for 60 days.
- Noise to delete: its false FRESH reading (item 2 turns it into an honest yellow STALE).

rentals_swfl
- Signal: the fatal exit (item 8). On un-park, also a per-county non-zero check, because the 07/13/2026 partial (Lee 1 call) landed Collier only and read green. That is one line in `rentals/pipeline.py` after `per_county`: exit 1 if any county produced 0 rows.
- While parked, its yellow STALE row is the signal. Keep it.

land_manufactured_swfl
- Signal: none (retired, item 10).

Family-wide
- Delete nothing in `heal-cron-failure.yml` or `log-cron-incident.yml`. Their watch lists name these workflows, but with the schedules off they fire nothing, and keeping the names means an un-park is watched with no edit.
- Add nothing to the ops site. `https://swfldatagulf-ops.vercel.app/coverage` answers 200. Its rendering of these entries was not inspected; they stay `pipelines:` entries, so it should show the same STALE state as the doctor.
- Check-ledger footprint: 0 checks opened by this plan; the classifier fix (item 9) closes the source of future UNKNOWN noise.

## 9. Box placement

`grep -n "runs-on"` shows every workflow in this family on `ubuntu-latest`: `listing-lifecycle-daily.yml:78`, `listing-week-weekly.yml:27`, `ingest-market-aggregates-histogram.yml:24`, `ingest-market-aggregates-details.yml:25`, `ingest-rentals.yml:26`. None is on the Fedora runner.

- listing_lifecycle — stays where it is (GHA, parked). The operator's standing order is explicit: "Do NOT move that pipeline to Fedora" (SCRATCHPAD 09/15, "listings PARKED" entry).
  - On un-park, the scrape leg is the one part of this family with a real Fedora reason: a brokerage site behind a WAF, where a residential IP matters.
  - That is a decision for un-park day, after the secret and source_name questions (item 14). It is not made here.
- listing_week — stays on GHA `ubuntu-latest`. It is a pure SQL derivation over our own lake with a 15-minute timeout (`listing-week-weekly.yml:28`). It needs no WAF bypass, no browser, no SSD archive and no local model.
  - Its two red runs were DB-side (P6), which a different box would not change.
- market_aggregates_histogram, market_aggregates_details, rentals_swfl — stay on GHA, schedules off (item 1).
  - They are vendor API calls with a bearer token and no WAF problem (`market_aggregates/steady_client.py:36-42`). Jobs run 10-15 minutes (timeouts at `:25`, `:26`, `:27` of each file).
  - None needs the SSD, a browser or a local model.
- land_manufactured_swfl — no box (retired).
- Already on the box that should not be: nothing from this family. The Fedora runner's proven jobs are dbpr-sirs, crexi and collier records (brief, standing facts).

## 10. Compute lane per LLM leg

Grep for the family's pipelines, workflows, the libs they import, the consuming packs and their sources, and the only listing_week reader:
```
grep -rn -i -E "anthropic|claude|ANTHROPIC_API_KEY|openai|refinery|llm|sonnet|haiku" ingest/pipelines/listing_lifecycle ingest/pipelines/listing_week ingest/pipelines/market_aggregates ingest/pipelines/rentals .github/workflows/listing-lifecycle-daily.yml .github/workflows/listing-week-weekly.yml .github/workflows/ingest-market-aggregates-histogram.yml .github/workflows/ingest-market-aggregates-details.yml .github/workflows/ingest-rentals.yml --include=*.py --include=*.yml | grep -v __pycache__
grep -n -i -E "anthropic|claude|openai|llm|sonnet|haiku|opus|ollama|generateText|messages\.create" ingest/lib/raw_landing.py ingest/lib/guards.py ingest/quality/contracts.py refinery/packs/active-listings-swfl.mts refinery/packs/price-distribution-swfl.mts refinery/packs/market-temperature-swfl.mts refinery/packs/active-rentals-swfl.mts refinery/sources/active-listings-residential-source.mts refinery/sources/price-distribution-source.mts refinery/sources/market-temperature-source.mts refinery/sources/active-rentals-source.mts ingest/analysis/challenger.py
```

Results:
- First grep: 2 hits, both non-calls. `market_aggregates/constants.py:74` mentions "CLAUDE.md" in a docstring. `listing-week-weekly.yml:7` says "no LLM".
- Second grep: only comments that say "no LLM" (`active-listings-swfl.mts:26,30`, `price-distribution-swfl.mts:25,303`, `market-temperature-swfl.mts:31,268`, `active-rentals-swfl.mts:33,197`).
- All four packs set `skipSynthesisAgent: true` and `skipTriageAgent: true` (`active-listings-swfl.mts:292-293`, `price-distribution-swfl.mts:311-312`, `market-temperature-swfl.mts:276-277`, `active-rentals-swfl.mts:205-206`).

LLM legs in this family: none.

One adjacent leg touches this family's failures but is not owned by it: heal-cron-failure's L2 narrative.
- What it does: `heal-cron-failure.mjs:165-175` calls `haikuDiagnose` on a failed run and posts the text to the incident issue. The watch list includes `listing-week-weekly`, `ingest-market-aggregates-*` and `ingest-rentals` (`heal-cron-failure.yml:86-91`).
- Current auth: API key (`heal-cron-failure.yml:191`), degraded. Issue #213's diagnosis carries only the deterministic text, no narrative.
- Replacement: Lane D. Classify the two Postgres failure strings as TRANSIENT (item 9), so no narrative is needed for this family's failures.
- If the fleet still wants narratives, the cross-cutting owner (family 19) routes them to Lane M (Max-plan `claude -p` on the Fedora runner) or Lane C (Codex). This family needs none.

## 11. Double-check log

I re-read the file top to bottom. Each claim is listed with what verifies it and the result.

- Registry lines 1419 / 2073 / 2154 / 2174 / 2240 / 2424 · E1 grep output · verified.
- listing_lifecycle has `nightly: true` at `:2076`, `source_name: api_feed` at `:2085`, `expected_rows_min: 28000` at `:2091` · `sed -n 2073,2110p ingest/cadence_registry.yaml | grep -n -E "nightly|expected_rows_min|source_name"` · corrected. The first draft cited `:2080` and `:2104` from a dump offset.
- `lifecycle` job at `nightly-chain.yml:123`, row-gate needs at `:162` · grep output `123:  lifecycle:` and `162:    needs: [guard, lifecycle, pulse, live-search]` · verified.
- Schedule lines 12-13 / 13-14 / 14-15 / 11-12 · `grep -n "schedule:|cron:"` on the four workflow files · verified.
- listing_week feature columns: 24 in `db.py:9-16` · counted by hand from the list · corrected (the first draft said 25).
- Moving an entry to `not_yet_running:` removes it from the doctor's pipeline loop, the freshness probe and the rebuild map · `doctor.py:351`, `check_freshness.py:723`, `rebuild_due.py:159,203` each loop only over `registry.get("pipelines")` · verified. The doctor then re-lists any contract-bearing base table as `coverage_only`, forced RED · `doctor.py:406-432` · corrected. The first draft parked items 2-4 by moving entries to `not_yet_running:`, which would have turned `listing_state` and `market_details_swfl` red. Items 2-4 now use `dispatch_only: true` (precedent `:2281`).
- Other registry line numbers (`:2109`, `:2113-2140`, `:2169`, `:2192`, `:2259`, `:2065-2072`, `:1421-1423`, `:1428`) · re-grepped one by one · corrected. The first draft computed them from a dump offset.
- `steady_client.py` and `rentals/resources.py` line numbers (`:43-44`, `:42-43`, `:36-42`, `:79-111`, `:101-102`) · `grep -n "return r.status_code, None\|requests.get(\|if st != 200"` · corrected. The first draft read them off a two-file `cat -n` whose numbering continued across files.
- Heal watch list at `heal-cron-failure.yml:86-91` · `grep -n "listing-week-weekly\|ingest-market-aggregates\|ingest-rentals"` · corrected. The first draft said 68-73.
- Land block range `:2397-2437` · `sed -n 2385,2440p` · corrected. The first draft said `:2424-2442`.
- land_manufactured free lane at registry `:1195` (Lee ArcGIS `MobileHomeLots`, 09/20/2026 LIVE) · `grep -n "land_manufactured" ingest/cadence_registry.yaml` · corrected. It was added on re-read; the first draft pointed only at DOR use codes.
- Opening verdict line · E5 plus the listing_week build dates · corrected. "No real row since 08/14" became "no new source observation since 08/14", because listing_week built rows after 08/14 from pre-08/14 data.
- Item 11 last-observation dates · E5 · corrected. The list now gives one date per row, for five rows.
- Issue #178 auto-close · `log-cron-incident.mjs:286-292` closes only on a green run, and the rebuild leg keeps the chain red · corrected. The first draft said it would auto-close; items 3 and 8 now say close it by hand.
- Item 8 site count · the RULE 0.5c grep in P1 · corrected. The title now says 3 in-family call sites plus 1 handed to family 02, not "all 4".
- The ops-site sentence in section 8 · `curl` returned 200, rendering not inspected · corrected. The body no longer states the parked rendering as fact.
- The rebuild-discrepancy note · `00-BRIEF.md` standing facts · corrected. "Which the brief already lists as parked" was removed; the brief names city pulse, not cre-swfl or macro-*.
- Details reads STALE under `tolerance_multiplier: 1.5` · 08/04/2026 + 45 days = 09/18/2026, and 09/26/2026 is past it · verified (arithmetic).
- listing_week reads STALE on `week_start` · 09/07/2026 to 09/26/2026 = 19 days, over 7 × 2.0 = 14 · verified (arithmetic).
- `lifecycle` appears in nightly-chain.yml only at `:8`, `:120`, `:123-139` and `:162` · `grep -n "lifecycle" .github/workflows/nightly-chain.yml` · verified.
- Push gates touched by items 1-4 and 10 · Gate 7 runs `bun ingest/tools/check-registry-identity.mts --static` on any registry or workflow change (`check-prepush-gate.mjs:425-458`); Gate 10 treats commented crons as dispatch-only (`:1118-1121`) · verified by reading the hook, not by running it.
- Workflow `disabled_manually` · `gh workflow list --all` · verified.
- 15 of 15 chain runs failed, with lifecycle legs and gate all failure · E4 over 15 ids · verified.
- Last chain success 08/14/2026 05:49 UTC · `gh run list ... --limit 200` jq · verified.
- listing_state county counts 25,413 / 9,505 / 1,275, active 22,922 / 7,127 / 1,039, seed 298, sum 36,193 · E5 · verified. Arithmetic: 25,413 + 9,505 + 1,275 = 36,193, and 36,193 + 298 = 36,491, which matches data-inventory:70.
- MAX(scraped_at) 08/14/2026, 43 days old on 09/26 · E5 · verified. Arithmetic: 17 days left in August after the 14th, plus 26 in September = 43.
- listing_transitions 64,944 rows, 0 after 08/14 · E5 · verified.
- listing_week 310,860 rows = Lee 218,882 + Collier 81,005 + Hendry 10,973 · E5 · verified (sum checked).
- 36,216 rows a week for 08/10, 08/17, 08/24 and 09/07; replay weeks 3 × 36,216 = 108,648 · E5 · verified. The table total reconciles: 4 × 36,216 + 35,702 + 34,204 + 33,397 + 31,844 + 30,849 = 310,860.
- Missing weeks 07/27 and 08/31 · E5 week list · verified.
- Replay proof: 0 / 0 / 0 differences, dom 31,740 · E6 · verified.
- Week 08/03: 34,424 NULL of 35,702 · E5 · verified.
- Week 07/20: 34,204 NULL of 34,204 · E5 · verified.
- Histogram 400 rows = 5 captures × 80 · E5 · verified.
- Details 162 = 3 × 54 (Lee 34 + Collier 20) · E5 · verified.
- Rentals 38,620 · E5 · verified. The per-capture sum was recomputed to 38,620. There is no Lee row for 07/13 · E5 · verified.
- 08/10 rentals 4,009 + 3,360 = 7,369 vs printed `rows=9296` · E5 and E3 · verified. The difference is the pre-dedupe count; this plan does not interpret it further.
- Zero-row green tallies: histogram 5 real / 7 zero / 1 skipped = 13; rentals 5 / 1 partial / 7 / 1 dry / 1 skipped = 15; details 3 / 1 = 4 · E2 plus E3 per run · verified (the sums were checked).
- Details FRESH through 10/03/2026: threshold 60 days, age 53 on 09/26 · `check_freshness.py:498-499,516` plus date arithmetic (Aug 4 → Sep 4 = 31 days, → Oct 3 = 60) · verified.
- Doctor rows and "3 red · 38 yellow · 37 green of 78" · E7 · verified. That summary is quoted only as context and is not used for a verdict.
- 22 failing contract rows · E7 · verified.
- Tests 19 / 16 / 11 / 194 / 8, with 46 and 202 passed · E8 · verified.
- Classifier DATA_EMPTY / UNKNOWN / UNKNOWN · E9 · verified.
- 5 views hard-code api_feed · E10 · verified. 13 SQL files and 11 code files · the two grep counts in P8 · verified.
- 14 served readers, 4 NO-DATE · E11 · verified, labeled as a heuristic.
- Issues #178 (08/15/2026) and #213 (09/21/2026) open · `gh issue list --label cron-failure --state open` · verified.
- Run 28496497637 logged `source=api` · `gh run view 28496497637 --log | grep -oE "\[done\].*"` · verified.
- Secrets: LISTING_LIFECYCLE_BASE_URL updated 06/27/2026, PHOTOS_API 07/10/2026 · `gh secret list` · verified. Neither date is used for a verdict, so they are not restated above.
- market_heat_swfl green, last run 34253707693 on 09/08/2026; zori_swfl_tier2 green · E7 plus `gh run list --workflow ingest-market-heat-swfl.yml --limit 3` · verified.
- market_heat covers median listing price, DOM, $/sqft, hotness, active count, price_reduced_share · registry `:489-491` confirmed_total text · verified. The overlap is judged from the registry text, not the parquet schema, so the field list needs review before item 13.
- Heal leg auth line `heal-cron-failure.yml:191` · grep output `191: ANTHROPIC_API_KEY` · verified. Issue #213 shows no narrative · `gh issue view 213 --comments` · verified.
- `sell_odds` has no code consumer beyond challenger.py · grep in section 5 · verified.
- The rebuild leg in run 36232679167 failed on packs cre-swfl, macro-us and macro-florida · `gh run view 36232679167 --log-failed | grep "rebuild · brains" | grep "BUILD FAILED"` · corrected. The first draft said bun install; that was a retry-step banner, not the failure.
- Section 8's claim that the ops /coverage page reads the registry and renders parked as yellow · registry comment `:2431` only · could-not-verify. `curl -s -o /dev/null -w "%{http_code}" https://swfldatagulf-ops.vercel.app/coverage` returned 200, but its parked rendering was not inspected. It stays phrased as the flag's own comment.
- Section 8's `count_filter` for histogram · `check_freshness.py:431-490` read shows a count only by source_name · verified that no latest-capture scope exists in that function. The plan conditions the floor on it.
- No sentence proposes or mentions paying a model vendor · a grep of this file for the terms forbidden by `00-BRIEF.md` rule 2 · verified 0 hits.

Corrections applied above, 15 in total. Each has a "· corrected" line in this log.
- Registry line numbers for listing_lifecycle's fields.
- Other registry line numbers.
- Client and resources line numbers.
- Heal watch-list lines.
- Land block range.
- land_manufactured free lane.
- listing_week column count.
- Opening verdict line.
- Item 11 dates.
- Park design (`dispatch_only`, not `not_yet_running:`).
- Issue #178 auto-close.
- Item 8 site count.
- Ops-site sentence.
- Rebuild-failure cause.
- Rebuild-discrepancy wording.

## 12. Questions for the operator

1. Three packs (price-distribution-swfl, market-temperature-swfl, active-rentals-swfl) sit in master's `input_brains` (`refinery/packs/master.mts:345-362`) and serve an 08/04 to 08/10/2026 snapshot with no path to refresh. Keep them serving the dated snapshot, or pull them from master?
2. The homepage map's "Median Sold Price" (`lib/landing/load-home-map-data.ts:117-145`) reads the frozen realtor.com per-ZIP figure. Repoint it to the deed/LEEPA sold lanes (a different statistic that has to be labeled as such, `data-roots.md:75`), or keep the dated realtor.com figure?
3. Delete the 108,648 replay rows from `data_lake.listing_week` (item 6)? It is a data_lake write, so it needs your word.
