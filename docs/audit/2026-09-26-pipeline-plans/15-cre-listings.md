# 15 cre-listings — pipeline plan (09/26/2026)

Family 15 is the three feeds behind the commercial side of the lake: `crexi_listings` (Crexi lease listings, a real-browser scrape pinned to the Fedora runner), `brevitas_listings` (Brevitas JSON search API, GitHub-hosted behind the repo proxy secret) and `market_heat_swfl` (realtor.com ZIP-grain Core + Hotness CSVs into two Tier-1 parquets). Verdict: crexi is REPAIR — its 09/20 run closed 6 Fort Myers Beach listings as off-market while the Fort Myers Beach scrape itself had crashed, so the next cre-swfl rebuild will serve a Fort Myers Beach count of 2 instead of 8. Brevitas is PARK — the API ignores the lease filter (verified live today), Estero and Fort Myers Beach carry zero lease pins, and the one row it writes is a for-sale listing that drags the served Estero median asking rent from 31 to 22 $/sqft. market_heat is IMPROVE — green 6 of 6 and current on Core, but its day-8 cron runs before realtor.com's Hotness drop, so Hotness sits one month behind, and nothing records the source month it pulled. No leg in this family calls a model.

Evidence commands used throughout (run 09/26/2026; re-run them to check any number below):

```
# R1/R2/R3 — last 15 runs
gh run list --workflow ingest-crexi-listings.yml    --limit 15 --json databaseId,status,conclusion,createdAt,event
gh run list --workflow ingest-brevitas-listings.yml --limit 15 --json databaseId,status,conclusion,createdAt,event
gh run list --workflow ingest-market-heat-swfl.yml  --limit 15 --json databaseId,status,conclusion,createdAt,event
# L1 — run logs (per-city counts, closures, errors)
gh run view <id> --log | grep -E "\[search\]|raw listings|rows normalized|closed out|\[warn\]|Done\.|Runner name"
# S — lake SQL: throwaway Bun.SQL runner (connection copied from scripts/apply-fdic-sod-view.mts:10-30), SELECT-only
S1  select source_name, count(*), count(*) filter (where gone_at is null) live, max(_ingested_at) from data_lake.active_listings_cre group by 1;
S2  select source_name, city, state, count(*), count(*) filter (where gone_at is null) live from data_lake.active_listings_cre group by 1,2,3;
S3  select source_name, city, date(gone_at), count(*) from data_lake.active_listings_cre where gone_at is not null group by 1,2,3;
S4  select count(*) from data_lake.active_listings_cre where gone_at is null and _ingested_at < '2026-09-20';
S5  select city, count(*), sum(sqft), percentile_cont(0.5) within group (order by asking_price_psf), count(asking_price_psf)
      from data_lake.active_listings_cre where city in ('Estero','Fort Myers Beach') and status='available' [and source_name='crexi'] group by 1;
S6  select source_name, count(*), count(distinct observed_at), min(observed_at), max(observed_at) from data_lake.cre_listing_observations group by 1;
S7  select * from data_lake.active_listings_cre where source_name='brevitas';
S8  select id, vintage, source_etag, source_last_modified, max_period_end, updated_at from data_lake._tier1_inventory where id like '%market_heat%';
# H — realtor.com source (read-only)
curl -sI https://econdata.s3-us-west-2.amazonaws.com/Reports/Core/RDC_Inventory_Core_Metrics_Zip_History.csv
curl -sI https://econdata.s3-us-west-2.amazonaws.com/Reports/Hotness/RDC_Inventory_Hotness_Metrics_Zip_History.csv
# H2 — stream each CSV, keep fixtures/swfl-zip-county.json ZIPs, count rows / min / max month / rows per county for 202608
curl -s <csv> | awk -F, 'NR==FNR{z[$1]=$2;next} ($2 in z){t++; ...}' zips.csv -
# B — Brevitas live API (read-only GET, same headers as brevitas_listings/extract.py:46-54)
curl -s "https://brevitas.com/api/search?location=Estero%2C+FL&transaction_type=<for_lease|for_sale|lease>&city=Estero&county=Lee+County&state=FL&state_full=Florida&country=United+States&place_id=ChIJTXMBstoR24gRpA9wHI_NlLM"
# T — tests
ingest/.venv/Scripts/python.exe -m pytest -q -p no:cacheprovider ingest/pipelines/crexi_listings/test_lifecycle.py ingest/tests/pipelines/brevitas_listings/test_proxy_wiring.py ingest/tests/pipelines/market_heat_swfl/
bun test refinery/packs/market-heat-swfl.test.mts
```

## 1. Scope

Three pipelines (count: 3), from `ingest/cadence_registry.yaml`:

- `crexi_listings` — registry `ingest/cadence_registry.yaml:1915`. lane tier-2, `probe_mode: odd_window` (:1919), cadence_days 7, tolerance 3.0, workflow `.github/workflows/ingest-crexi-listings.yml`, consuming_pack `cre-swfl`, `freshness_table: data_lake.active_listings_cre`, `freshness_column: _ingested_at`, `source_name: crexi`, expected_rows_min 1, source_ceiling value 300 as of 07/07/2026 (:1933-1938); expected_rows_min at :1925. Code: `ingest/pipelines/crexi_listings/{pipeline,extract,distill}.py`. Tables written: `data_lake.active_listings_cre` (source_name='crexi') and `data_lake.cre_listing_observations` (`distill.py:157-176`).
- `brevitas_listings` — registry `ingest/cadence_registry.yaml:1940`. lane tier-2, `probe_mode: odd_window` (:1944), cadence_days 7, tolerance 3.0, workflow `.github/workflows/ingest-brevitas-listings.yml`, consuming_pack `cre-swfl`, same freshness_table / column, `source_name: brevitas`, expected_rows_min 1, source_ceiling = for-sale endpoint + richer type taxonomy as of 07/08/2026 (:1956-1960); expected_rows_min at :1950. Code: `ingest/pipelines/brevitas_listings/{pipeline,extract,distill}.py`. Table written: `data_lake.active_listings_cre` (source_name='brevitas'). It does NOT write observations and does NOT close listings (no `close_unseen` in `brevitas_listings/pipeline.py:18-65`).
- `market_heat_swfl` — registry `ingest/cadence_registry.yaml:475`. lane tier-1, cadence_days 30, tolerance 2.0, workflow `.github/workflows/ingest-market-heat-swfl.yml`, consuming_pack `market-heat-swfl`, inventory_id prefix `lake-tier1/market/market_heat_`, source_ceiling as of 07/16/2026 (:493-497). Code: `ingest/pipelines/market_heat_swfl/{pipeline,resources,constants}.py`. Writes two Storage parquets `lake-tier1/market/market_heat_core_swfl.parquet` and `..._hotness_swfl.parquet` (`constants.py:23-25`) plus two `data_lake._tier1_inventory` rows (`pipeline.py:66-84`). No `data_lake` table.

Consumers (grep `active_listings_cre|cre_listing_observations` and `market_heat_core_swfl|market_heat_hotness_swfl|market-heat-*-source` over `refinery lib app scripts`):

- `refinery/sources/active-listings-source.mts:67-77` reads `active_listings_cre` WHERE city IN ('Estero','Fort Myers Beach') AND status='available' — by CITY, not source_name, so crexi and brevitas rows blend (`data-roots.md:1483` already says so) → `refinery/packs/cre-swfl.mts:1964-2006` emits `cre_active_listings_{estero,fort_myers_beach}_{asking_rent_psf,available_sqft}` → master (`refinery/packs/master.mts:229`, `:290` `critical: true`).
- `data_lake.cre_listing_observations`: no reader anywhere (grep hits only `distill.py` and `docs/sql/20260806_cre_listing_lifecycle.sql`). DARK ROOT — 2 run-dates of data, see §5.
- `refinery/sources/market-heat-core-source.mts:39` and `market-heat-hotness-source.mts:32` → `refinery/packs/market-heat-swfl.mts` → master (`master.mts:252`, `:331`), `lib/zip-dossier.ts:131`, `lib/zip-report/assemble.ts:33`, `lib/zip-report/candidates.ts:421,433,479`, `lib/why-not-selling/load-report.ts:239`, `lib/assistant/chart-for-question.ts:104`, `lib/route-chart.ts:145`, `lib/highlighter/reach.ts:48`; plus `scripts/generate-seed-preview-charts.mts`.

## 2. What is being brought in

crexi_listings

- Source: Crexi's lease grid backing API `POST https://api-lease.crexi.com/assets/search`, called from inside a Cloudflare-cleared Crawl4AI browser page (`extract.py:1-26`, `:50-101`). Lease only — `/lease` is hardcoded (`extract.py:42`), for-sale `/properties` never queried (known: `docs/handoff/2026-07-11-reliable-sources-findings.md:319-324`).
- Fields (mapped in JS, `extract.py:76-88`): address, city, state (from the listing, not hardcoded), property_type (first of `types`), sqft (`rentableSqftMin`), asking_price_psf (`baseRateSqFtPerYearMin`), status, listed_date (`activatedOn`), source_url. Lifecycle columns first_seen_at / last_seen_at / gone_at (`distill.py:119-145`, migration `docs/sql/20260806_cre_listing_lifecycle.sql:20-31`).
- Geography: two search terms, "Estero, FL" and "Fort Myers Beach, FL" (`crexi_listings/extract.py:37-40`). The term is a relevance search, not a boundary: S2 returns crexi rows for Fort Myers 32, Estero 17, Fort Myers Beach 9, Bonita Springs 8, FORT MYERS 2, Apollo Beach 1, Avon Park 1, Sebring 1, Naples 1 (72 total). L1 on the 09/20 dry run 35493241730 shows the "Estero" term returning a Fort Myers Beach row (`Fort Myers Beach | 7205 Estero Blvd`).
- Cadence: Sunday 11:00 UTC (`ingest-crexi-listings.yml:6`).
- Live (S1): 72 crexi rows, 62 with gone_at NULL, MAX(_ingested_at) 09/20/2026 14:28 UTC, MIN 07/05/2026. Observations (S6): 95 rows across 3 distinct observed_at stamps, 08/09/2026 → 09/20/2026.
- County coverage: Lee only in the served set (Estero, Fort Myers Beach). Collier: 1 Naples row (S2) that no consumer reads. Hendry: 0. Three rows sit outside the Lee/Collier/Hendry scope (Apollo Beach, Avon Park, Sebring; county placement is [INFERENCE] from the city names — the rows carry no ZIP).

brevitas_listings

- Source: `GET https://brevitas.com/api/search?...&transaction_type=for_lease...` then `GET /api/search/listings/{uuids}` for HTML cards (`brevitas_listings/extract.py:123-133`, `:174-181`). urllib, routed through `CRAWL4AI_PROXY` when set (`brevitas_listings/extract.py:62-120`; workflow sets it at `ingest-brevitas-listings.yml:25`).
- Fields: address (from the URL slug, or the listing's marketing title when the slug has no house number, `brevitas_listings/extract.py:206-211`), city (from the search target, not the listing), state hardcoded "FL" (`brevitas_listings/extract.py:218`), property_type, sqft (regex on card HTML), price → asking_price_psf only when price ≤ 500 (`brevitas_listings/distill.py:27`, `:81-84`), status hardcoded "available" (`:96`), listed_date always NULL (`:97`).
- Geography: Estero + Fort Myers Beach (`brevitas_listings/extract.py:31-44`). Cadence: Sunday 12:00 UTC (`ingest-brevitas-listings.yml:6`).
- What actually arrives (L1 on green run 35521057612, 09/20/2026): Estero "3 pins ... 1 lease rows normalized (dropped 2 for-sale / invalid)"; Fort Myers Beach "9 pins ... 0 lease rows normalized (dropped 9 ...)". Run 31314932582 (08/09): Estero 4 pins → 1 kept, Fort Myers Beach 7 → 0.
- Live (S7): exactly 1 brevitas row — address "For Sale   Land Or Built Grey Shell Space", city Estero, property_type office, sqft 11270, asking_price_psf 19, status available, first_seen_at and last_seen_at 08/02/2026 13:45 (the migration backfill value, `20260806_cre_listing_lifecycle.sql:28-31`; brevitas' upsert never touches last_seen_at, `brevitas_listings/distill.py:127-135`), _ingested_at 09/20/2026 15:56.
- County coverage: Lee only (1 Estero row). Collier 0, Hendry 0.

market_heat_swfl

- Source: realtor.com Economic Research Data Library, public S3, no key (`constants.py:10-20`). Core History CSV and Hotness History CSV.
- Fields: 34 Core columns (`constants.py:32-69`) and 14 Hotness columns (`constants.py:72-92`), ZIP × month.
- Geography: every ZIP in `fixtures/swfl-zip-county.json` (`resources.py:28-31`) — 100 ZIPs: Lee 35, Collier 22, Hendry 3, plus Charlotte 13, Sarasota 24, Glades 3 (bun count of `primary_county` over the fixture). The last three are outside the CLAUDE.md core scope but realtor.com does publish them.
- Cadence: day 8 of the month 13:00 UTC (`ingest-market-heat-swfl.yml:8`). REPLACE semantics (`pipeline.py:8-10`).
- Live: L1 on run 34253707693 (09/08/2026): "core=11711 rows, hotness=9764 rows"; run 31259921963 (08/08/2026): "core=11616 rows, hotness=9764 rows". S8: both inventory rows vintage 2026-09-08, updated_at 09/08/2026 16:54 UTC, source_etag / source_last_modified / max_period_end all NULL.
- Period range (H2 against today's source, which our 09/08 Core pull matches row-for-row at 11711): Core 201607 → 202608. Newest-month (202608) Core rows per county: Lee 34 of 35 ZIPs, Collier 20 of 22, Hendry 2 of 3, Charlotte 13, Sarasota 24, Glades 2.
- Hotness period: H2 on today's Hotness file = 9857 SWFL rows, 201708 → 202608, 93 rows in 202608. Our pull held 9764 = 9857 − 93, so our Hotness parquet ends at 202607 ([INFERENCE] from the exact one-month row difference; the parquet itself was not opened — see §11).

## 3. What is working

crexi_listings

- The residential-IP move worked: R1 shows green 35516569482 (schedule, 09/20/2026, `Runner name: 'fedora-swfl-local'`, `Machine name: 'fedora'` per L1) and 35493241730 (dispatch dry run, Estero only, 09/20/2026). Earlier greens 31310767501 (08/09, runner `swfl-local` on machine `MYNAMEJEFF`, pre-Fedora, per L1), 28740291549 (07/05), 28321829404 (06/28), 27931881053 (06/22).
- The XHR extraction returns typed rows with 0 dropped: L1 35516569482 "29 raw listings extracted / 29 rows normalized (dropped 0 invalid)" for Estero.
- The total-failure guard exists (`pipeline.py:68-75`) and the empty-scrape guard in `close_unseen` exists (`distill.py:195-198`).
- Price/size history is accumulating: S6 95 observation rows.
- Tests: 5 in `ingest/pipelines/crexi_listings/test_lifecycle.py`, all pass (T: "25 passed" for the three family test paths; `--co` count 5 for this file).

brevitas_listings

- The job runs: R2 = 14 runs total, 9 green, 5 red; the last 8 are green in a row (30750551910 08/02 → 35521057612 09/20). The proxy wiring works when the proxy is paid up. Tests: 12 in `ingest/tests/pipelines/brevitas_listings/test_proxy_wiring.py`, pass (T).
- That is where "working" stops — see §4.

market_heat_swfl

- R3 = 6 runs, 6 green, newest 34253707693 (09/08/2026, schedule), then 31259921963 (08/08), 28953099301 (07/08) and three dispatches.
- Core is current: H `Last-Modified: Fri, 04 Sep 2026 16:36:54 GMT`, and H2 on today's Core file = 11711 SWFL rows, max 202608 — identical to the 09/08 pull.
- The Gate-4 floor guards the destructive REPLACE (`pipeline.py:60-62`, MIN_ROWS 200 at `constants.py:98`).
- Tests: 3 in `test_dry_run.py` + 5 in `test_resources.py` (T), pass; the pack test `refinery/packs/market-heat-swfl.test.mts` 31 pass, 0 fail (T).
- The consumer brain is fresh: `brains/market-heat-swfl.md` front matter `refined_at: 2026-09-15T23:58:22Z`, v5; the pack makes no model call (`market-heat-swfl.mts:684-685` skipSynthesisAgent / skipTriageAgent true).

## 4. Problems

P1 — crexi: a crashed city is reconciled as an empty market (off-market events with no evidence). Severity: blocks a served number.
- Symptom: L1 on 35516569482 (09/20/2026): Fort Myers Beach "[ANTIBOT]. ... Error: Proxy direct failed: Wait condition failed: Page.wait_for_selector: Timeout 90000ms exceeded ... waiting for locator("#__crexi__")", then "0 raw listings extracted", then "8 listing(s) no longer on market — closed out to history", run conclusion success. S3: 6 Fort Myers Beach rows and 2 Estero rows got gone_at 09/20/2026. The 6 Fort Myers Beach closures (17651 / 19051 / 17707 / 17840 / 19003 / 17260-17284 San Carlos Blvd) were made while the Fort Myers Beach scrape had crashed.
- Root cause: `pipeline.py:52` appends the city to `covered_cities` whether or not its fetch succeeded; `extract.py:144-149` turns any crash into `[]`; `close_unseen` refuses only when ALL of `seen_ids` is empty (`distill.py:195`), so one good city (Estero, 29 rows) arms the close for the crashed one.
- Served impact (S5 today vs `brains/cre-swfl.md`, refined 08/10/2026): the committed brain serves Fort Myers Beach "8 listings", available sqft 34,971, median asking rent 21.5. The next rebuild would compute Fort Myers Beach 2 listings, 5,686 sqft, median 33 — an 84% sqft drop caused by a crash, not the market. cre-swfl is a `critical: true` master input (`master.mts:290`).
- First seen: 09/20/2026 (R1 35516569482). The guard's own test only covers the all-cities-empty case (`test_lifecycle.py:14-28`).

P2 — crexi: listings outside the two target cities never close (frozen "available" rows). Severity: blocks a consumer the day anything reads beyond Estero/FMB; cosmetic today.
- Symptom: S4 = 33 rows with gone_at NULL and _ingested_at before 09/20/2026 (Fort Myers 24, Bonita Springs 5, Naples 1, Apollo Beach 1, Avon Park 1, Sebring 1 per the S2 live-by-last-seen breakdown). They are the same defect the 08/06 lifecycle fix was built for ("61 crexi rows sat status='available' frozen", `test_lifecycle.py:4-5`).
- Root cause: `close_unseen` filters `city = ANY(covered)` (`distill.py:212`), but the search term returns other cities (S2), and `corridor_name` — the one column that could record which search produced a row — is always written NULL (`distill.py:92`).
- First seen: 08/09/2026 (the first run after the lifecycle fix; S2 shows these rows last seen 08/09 or 07/05).

P3 — crexi: the failure classifier cannot name this pipeline's failures. Severity: blocks the right alert (UNKNOWN routes to the model-diagnosis leg, §10).
- Symptom: running `classify()` from `.github/scripts/classify-cron-failure.mjs:42` on "Blocked by anti-bot protection: Cloudflare JS challenge ... ERROR: 0 raw listings from all targets" and on "Wait condition failed: Page.wait_for_selector: Timeout 90000ms exceeded" both return `{"klass":"UNKNOWN"}`. The DATA_EMPTY pattern (`classify-cron-failure.mjs:167-169`) does not match "0 raw listings from".
- First seen: 07/12/2026 (R1 29191537886, cited in `ingest-crexi-listings.yml:22-24`).

P4 — crexi: 5 scheduled runs cancelled after a 24 h queue (runner offline). Severity: blocks a consumer (no data for 6 weeks). Status: fixed by the Fedora runner on 09/20.
- Symptom: R1 cancelled 31943936984 (08/16), 32636170206 (08/23), 33318853733 (08/30), 34037537015 (09/06), 34763673266 (09/13); `gh run view 34763673266 --json jobs` shows started 09/13 14:47, completed 09/14 14:47. Issue #181 `[cron-failure:ingest-crexi-listings] TIMEOUT` (08/17) is CLOSED (`gh issue list --state all --search crexi`).
- Root cause: `runs-on: [self-hosted, swfl-local]` (`ingest-crexi-listings.yml:30`) with no online runner until 09/20.
- Residual risk: the Fedora box backup and reboot test are untested (brief, standing facts). Same failure shape returns if the box goes down.

P5 — brevitas: the lease feed is structurally empty and the one row it writes is a for-sale listing. Severity: blocks a served number.
- Symptom: B on 09/26/2026 — the Estero search returns the same 3 pins for `transaction_type=for_lease`, `for_sale`, and `lease`, and for `transaction=for_lease` / `listing_type=lease` (uuids LQTyr9IQ, OWt6FfA8c, 87I4yonLVN). The Fort Myers Beach `for_lease` search returns 9 pins priced 1,075,000 to 6,200,000 (sale prices). The only pin under the 500 cut is "For Sale   Land Or Built Grey Shell Space", price 19 — kept as a $19/sqft office lease (S7).
- Root cause: the API ignores the transaction filter; `brevitas_listings/distill.py:27-84` assumes "price ≤ 500 = lease rate", which lets a sale listing with a per-sqft sale price through, and drops everything else.
- Served impact (S5): Estero blended median asking rent = 22 (5 priced rows, 15 listings) vs crexi-only 31 (4 priced rows, 14 listings). The committed brain already serves Estero 22 (`brains/cre-swfl.md`, 08/10/2026), and the citation calls every row "Crexi" (`cre-swfl.mts:1976`, `active-listings-source.mts:171`) — wrong provenance.
- Research correction: `docs/handoff/2026-07-11-reliable-sources-findings.md:307-310` says "loop transaction_type over for_lease, for_sale" closes the gap. Live 09/26: the parameter changes nothing. The 07/11 for-sale pins are verified; the idea that the parameter separates lease from sale needs review. (The check it names, `brevitas_lease_only_hardcoded`, was closed in the 09/15 bankruptcy; not resurrected here.)
- First seen: 08/02/2026 (the row's first_seen_at, S7).

P6 — brevitas: monitoring reads it as healthy. Severity: blocks the right alert.
- Symptom: `check_freshness.py:253-264` reads MAX(_ingested_at) WHERE source_name='brevitas' = 09/20/2026 (S1), and `check_volume_entry` counts 1 ≥ expected_rows_min 1 (`cadence_registry.yaml:1950`). The upsert rewrites `_ingested_at` on the same one row every week (`brevitas_listings/distill.py:134`), so freshness is always green.
- First seen: 08/02/2026.

P7 — brevitas: depends on a paid shared proxy that has already lapsed once. Severity: blocks a consumer (would, if unparked).
- Symptom: `gh run view 30204670678 --log-failed` (07/26/2026): "[warn] Brevitas error for Estero FL: <urlopen error Tunnel connection failed: 402 Payment Required>". The classifier returns UNKNOWN on that log (same test as P3).
- Root cause: GitHub datacenter IPs are refused by Brevitas (`brevitas_listings/extract.py:16-20`), so the job leans on `CRAWL4AI_PROXY` (`ingest-brevitas-listings.yml:25`). From this Windows box's residential IP the same GET answers 200 with no proxy (B, 09/26).
- First seen: 07/26/2026 (R2). Earlier reds 06/28, 07/05, 07/12, 07/14 (R2) were not classified here (their logs were not pulled).

P8 — market_heat: Hotness pulled a month stale every cycle. Severity: blocks a served number (Hotness descriptors in market-heat-swfl lag Core by a month; the vote itself uses Core `_yy` columns, `market-heat-swfl.mts` scope line, so the call is not wrong — the Hotness descriptors are).
- Symptom: H `Last-Modified: Thu, 10 Sep 2026 16:08:42 GMT` on the Hotness CSV vs our run at 09/08/2026 16:54 UTC (S8). L1 Hotness row count 9764 on both 08/08 and 09/08, while today's file holds 9857 with 202608 (H2).
- Root cause: cron day 8 (`ingest-market-heat-swfl.yml:8`) comes before the Hotness drop. The day-8 choice rests on "realtor.com restates ... ~first week of the month" (`:5-6`), which holds for Core (Last-Modified 09/04) but not Hotness.
- First seen: 08/08/2026 at the latest (identical 9764 count, R3 31259921963).

P9 — market_heat: no source-period or source-change record, so a frozen source would read fresh. Severity: blocks the right alert.
- Symptom: S8 — source_etag, source_last_modified and max_period_end all NULL on both inventory rows. `check_freshness.check_tier1_entry` reads `_tier1_inventory.updated_at` (`check_freshness.py:353-375`), i.e. "when did we upload", not "what month did we get". Not covered by `ingest/scripts/probe_source_liveness.py` either (its imports at :43-48 are collier_parcels, fdot, leepa only).
- Root cause: `pipeline.py:67-84` calls `upsert_inventory_row` without the three optional fields that `ingest/lib/tier1_inventory.py:52-67` already persists (the redfin pattern, `ingest/duckdb_pipelines/redfin_swfl/pipeline.py:1-21`, `:275-294`).
- First seen: 06/25/2026 (pipeline birth; never passed).

P10 — family: no CI runs these tests. Severity: blocks nothing today; lets P1-class regressions ship.
- Symptom: `grep -rln pytest .github/` returns nothing; the only repo reference is `.claude/hooks/check-proof-of-red-on-push.mjs`. The 25 family tests pass only when someone runs them by hand (T). `pyproject.toml:40` sets `testpaths = ["ingest"]`, so the suite is collectable.

P11 — stale text that misleads the next reader (cosmetic, one pass).
- `cadence_registry.yaml:1926` crexi note: "Weekly Firecrawl agent scrape ... NOT YET ACTIVATED". Crexi has had writing greens since 06/22 (R1) and never used Firecrawl (`crexi_listings/extract.py:35` imports crawl_client).
- `cadence_registry.yaml:1919`, `:1944` `probe_mode: odd_window` — the registry says to remove it after the first green run (`:1909`).
- `cadence_registry.yaml:488` "First run: <fill on first successful workflow_dispatch>" — R3's oldest run, 28549370386 (dispatch, 07/01/2026), is green (`gh workflow view` reports 6 runs in total).
- `ingest-crexi-listings.yml:21-29`, `:50-59`: Windows runner "currently OFFLINE", Windows venv commands; runner is Fedora since 09/20 (`:60-63` says so).
- `crexi_listings/pipeline.py:70` error text "LLM extraction"; `brevitas_listings/extract.py:10` "distill filters by threshold" / `brevitas_listings/distill.py:1-13` "for-sale detection" framing.
- `docs/standards/data-roots.md:250` "crexi/brevitas (parked scaffolds)", `:1477-1478` "NOT YET ACTIVATED", `:1550-1551`; `docs/standards/data-inventory.md:134` "68" rows (S1 now 73).
- `ingest-brevitas-listings.yml:38-39` installs Playwright chromium although `brevitas_listings/extract.py:14` says Playwright is not needed.
- City casing: S2 has both "Fort Myers" (32) and "FORT MYERS" (2). One row had sqft 1 (`select count(*) ... where sqft <= 1` = 1; it is among the 09/20 closures).

## 5. What is missing

crexi_listings

- vs source_ceiling: registry says 300+ Lee/Collier listings exist (`cadence_registry.yaml:1933-1938`, as of 07/07/2026); we hold 62 live, 16 in the served cities (S1, S5). Missing: every other Lee/Collier submarket as a search target, and all for-sale listings (`/properties`, Cloudflare-gated, `reliable-sources-findings.md:319-324`).
- Fields Crexi returns that we drop: the JS keeps only the Min of sqft and rate (`crexi_listings/extract.py:81-82`); the Max bound and rate type are not kept. [INFERENCE] from the field names `rentableSqftMin` / `baseRateSqFtPerYearMin` — the full response shape was not re-probed this session.
- Consumer gap: nothing reads `cre_listing_observations`, first_seen_at or gone_at. Days-on-market and asking-rent cuts for CRE are exactly the "moves ahead" kind of series the product wants (`_ASSISTANT` memory: nutshell, leading indicators), but S6 shows only 3 observation stamps over 2 run-dates — too thin to serve. Missing today: a count of clean weeks before anything is wired.
- Data-roots: no root line names `cre_listing_observations`. The asking-rent root for Estero/FMB is `active_listings_cre` via `active-listings-source.mts`.

brevitas_listings

- Lease data: none exists at the source for these two cities (B). The for-sale pins (Estero 3, Fort Myers Beach 9 on 09/26) are the only thing Brevitas has here, and nothing in the product consumes CRE for-sale asking prices today (grep of `refinery/packs/cre-swfl.mts` for a sale-price metric: only `cre_active_listings_*_asking_rent_psf` / `_available_sqft`, :1980, :1992).
- The richer type/subtype taxonomy (`cadence_registry.yaml:1957`) is unpulled; moot while parked.

market_heat_swfl

- vs source_ceiling (`cadence_registry.yaml:493-497`): the `_mm` deltas of the original vote-driver families, price_increased_share, price_reduced_count, Hotness `median_dom_mm_day` / `median_dom_yy_day`, and the base `page_view_count_per_property` (only its `_mm/_yy/_vs_us` are kept, `constants.py:89-91`). Same fetch, zero extra cost.
- Vintages: REPLACE destroys each month's restated history (`pipeline.py:8-10`). There is no archive of what realtor.com said in a given month, so a prediction graded later cannot be checked against what was knowable at the time. The Fedora SSD has room (§9).
- Source liveness and source month: see P9.
- Scope note (not a defect): 39 of 95 newest-month Core rows are Charlotte/Sarasota/Glades (H2 per-county: 13 + 24 + 2). They are real realtor.com data; whether the product serves them is covered by the existing SIX_COUNTY declaration at `lib/zip-dossier.ts:131`, not re-opened here.

## 6. Verdict per pipeline

- crexi_listings — REPAIR. One crashed city fabricates off-market events that flow into a critical master input (P1), and out-of-target rows never close (P2). The number that changes it: 4 consecutive scheduled runs where every covered city returns > 0 rows and `close_unseen` closes nothing in a city that returned 0 (L1 per run).
- brevitas_listings — PARK. The source has no lease inventory in Estero/FMB and ignores the lease filter (P5); its one row corrupts the Estero median. The number that changes it: ≥ 1 Brevitas pin per week in the target cities that the listing page itself labels for lease (B plus the listing card), or an operator decision to build a CRE for-sale consumer (§12).
- market_heat_swfl — IMPROVE. Green and current on Core; Hotness lags a month (P8) and nothing records the source month (P9). The number that changes it: `max_period_end` on the Hotness inventory row equal to the Core row's, for 2 consecutive monthly runs.

## 7. The plan

Ordered. Lane per §Compute lanes of the brief. Every item is Lane D (no model). ASK-FIRST items are marked.

1. crexi — refuse to close a city whose scrape failed, and fail the run loud (DO). Where: `ingest/pipelines/crexi_listings/pipeline.py:41-53` — append to `covered_cities` only when that city returned > 0 raw rows; after the loop, `sys.exit(1)` if any targeted city returned 0 (after the good city's rows are written and reconciled). Test first: `test_one_crashed_city_closes_nothing_in_that_city` in `test_lifecycle.py`. Lane D. Effort S. Proof: `ingest/.venv/Scripts/python.exe -m pytest -q ingest/pipelines/crexi_listings/test_lifecycle.py` shows 6 passed; the next scheduled run's L1 shows no "closed out" line for a city with "0 raw listings extracted". Unblocks: a truthful Fort Myers Beach count. The 6 wrongly closed rows reopen by themselves on the next run that sees them — the upsert sets `gone_at = NULL` (`distill.py:141-143`) — so no lake write is needed.
2. crexi — make the in-page paginator always write its marker (DO). Where: `crexi_listings/extract.py:50-101` — wrap each `fetch()` in an AbortController timeout (for example 20 s) so a hung API call writes `{ok:false,error}` instead of stalling to the 90 s `wait_for` (`crexi_listings/extract.py:118`). Lane D. Effort S. Proof: a `workflow_dispatch` with `corridor=Fort Myers Beach` and `dry_run=true` on the Fedora runner (dry run is read-only: `distill.py:110-117`, `:199-201`, and the runbook says the same, `_ASSISTANT/2026-09-15-fedora-runner-runbook.md:256-257`) logs a row count for Fort Myers Beach, or a typed `assets/search returned HTTP n` error instead of the 90 s wait. Unblocks: telling "blocked" from "hung" (P1's trigger).
3. crexi — reconcile by search target, not by the listing's city (DO). Where: `distill.py:92` write `corridor_name = <target city>` (thread the target through `normalize`), and `distill.py:207-215` close `WHERE corridor_name = ANY(covered)`. Lane D. Effort M. Proof: after one scheduled run, `select corridor_name, count(*) from data_lake.active_listings_cre where source_name='crexi' and last_seen_at::date = <run date> group by 1` returns only 'Estero' / 'Fort Myers Beach', no NULL. Unblocks: P2 for every new row.
4. crexi — the 33 legacy NULL-corridor frozen rows (ASK-FIRST, a `data_lake` write). Option: one `UPDATE data_lake.active_listings_cre SET status='off_market', gone_at=now() WHERE source_name='crexi' AND corridor_name IS NULL AND last_seen_at < '2026-09-20'` after item 3 has run once. Proof: S4 returns 0. If he declines, they stay but nothing reads them (the consumer filters to Estero/FMB).
5. crexi + brevitas consumer — read only what is live and label it truthfully (DO). Where: `refinery/sources/active-listings-source.mts:71-77` add `.is("gone_at", null)` and `.eq("source_name", "crexi")` while Brevitas is parked; `:129-134` / `:171` keep "Crexi" only because only Crexi rows remain. No change to the key_metrics shape or names. Lane D. Effort S. Proof: `bun test refinery/packs` green and a fixture-mode build shows Estero `listing_count` from crexi rows only; after the next cre-swfl rebuild (family 16's chain) `brains/cre-swfl.md` `cre_active_listings_estero_asking_rent_psf` equals S5's crexi-only median at that time. Unblocks: removes the for-sale row from a served median without a lake delete.
6. brevitas — park it (DO for the switch, ASK-FIRST for the row). `gh workflow disable ingest-brevitas-listings.yml` (revertable in seconds); registry `cadence_registry.yaml:1940-1951` note gains "PARKED 09/26/2026: brevitas.com/api/search ignores transaction_type (live GET, 3 identical pins across 5 parameter spellings); Estero/FMB carry 0 lease pins; see 15-cre-listings.md P5"; keep the entry so Gate 10 membership holds. Deleting the one brevitas row is a `data_lake` write — ASK-FIRST; after item 5 it is unread, so leaving it costs nothing. Proof: `gh workflow view ingest-brevitas-listings.yml` shows disabled; `rg -n "PARKED 09/26/2026" ingest/cadence_registry.yaml`. Unblocks: P6 noise disappears with the job.
7. Classifier — name this family's failures (DO, shared file; coordinate with family 16). Where: `.github/scripts/classify-cron-failure.mjs` — add a WAF/anti-bot class matching `Blocked by anti-bot protection|Cloudflare JS challenge|Just a moment|Wait condition failed: Page\.wait_for_selector`, and a PROXY_402 class matching `Tunnel connection failed: 402` (suggestedAction "move to the residential runner — not a retry"). Also let the DATA_EMPTY regex (:167-169) accept `0 \w+(?: \w+)? (?:extracted|from all targets)`. Lane D. Effort S. Proof: the node one-liner used in §4 P3 on the three saved log snippets returns the new classes instead of UNKNOWN; the classifier's own test file passes. Unblocks: removes this family from the model-diagnosis route (§10).
8. market_heat — move the cron after the Hotness drop (DO). Where: `ingest-market-heat-swfl.yml:8` `0 13 8 * *` → `0 13 13 * *`, and fix the comment at `:5-6` to cite Core Last-Modified 09/04 and Hotness 09/10 (H). Lane D. Effort S. Proof: next run's L1 hotness count = H2's current SWFL Hotness count at that date. Unblocks: P8.
9. market_heat — record what month we pulled, and fail red when the source froze (DO). Where: `pipeline.py:45-84` — HEAD both CSVs, pass `source_etag`, `source_last_modified`, and `max_period_end` (max `month_date_yyyymm` in the filtered rows) into `upsert_inventory_row` (the fields exist, `tier1_inventory.py:52-67`); exit 1 AFTER both uploads when Hotness max month < Core max month ("HOTNESS LAG") or when Core max month is older than 2 months before the run month. Copy the redfin shape (`redfin_swfl/pipeline.py:227`, `:275-294`). Add a test beside `test_dry_run.py`. Lane D. Effort M. Proof: S8 shows non-NULL `max_period_end` on both rows after the next run; pytest for `ingest/tests/pipelines/market_heat_swfl/` green. Unblocks: §8's signal for this pipeline.
10. market_heat — add the two CSVs to the daily source-liveness probe (DO). Where: `ingest/scripts/probe_source_liveness.py:43-48` import `CORE_CSV_URL`, `HOTNESS_CSV_URL` from `ingest.pipelines.market_heat_swfl.constants` (the probe's own no-retype rule, :15-18); HEAD → 200. Lane D. Effort S. Proof: `python -m ingest.scripts.probe_source_liveness` output lists both URLs. Unblocks: a dead realtor.com path shows up the next day instead of the next month.
11. market_heat — monthly raw-vintage archive on the Fedora SSD (DO). A Hermes `no_agent` script job on Spectre: on the 13th, `curl` both CSVs into `/srv/swfl/research/realtor/<yyyymm>/` and gzip them. Size per month per H: 829,650,423 + 368,824,271 bytes (≈ 1.2 GB raw, before gzip) against ≈ 973 GB free (brief). No lake write. Lane D. Effort S. Proof: `ssh fedora ls -la /srv/swfl/research/realtor/` shows the month. Unblocks: grading any market-heat call against what realtor.com said at the time (REPLACE otherwise erases it). Depends on the SSD backup being tested (family 16 / box owner).
12. Registry and doc hygiene, one pass (DO). `cadence_registry.yaml:1926` note → "Weekly Crawl4AI browser scrape (Fedora runner) → active_listings_cre"; drop `probe_mode: odd_window` at `:1919` (crexi graduated; greens R1); add to crexi `freshness_sla: {warn_after_days: 14}` (warn only — §8 explains why not error); `:488` fill the first-run line with R3's first green; `ingest-crexi-listings.yml:21-29,50-59` replace the Windows text with the Fedora facts at `:60-63`; `crexi_listings/pipeline.py:70` drop "LLM extraction"; `data-roots.md:250,1477-1478,1550-1551` and `data-inventory.md:134` restate crexi as live on Fedora and brevitas as parked. Lane D. Effort S. Proof: `rg -n "NOT YET ACTIVATED|Firecrawl agent scrape|parked scaffolds" ingest/cadence_registry.yaml docs/standards/` returns no crexi/brevitas hit; Gate 10 and the registry spine test pass (`ingest/tests/test_cadence_registry_spine.py`).
13. CI — run this family's tests on every push that touches them (DO; the workflow file is family 16's, coordinate). Add a path-filtered job step `python -m pytest -q ingest/pipelines/crexi_listings ingest/tests/pipelines/brevitas_listings ingest/tests/pipelines/market_heat_swfl` (all offline: they mock network and DB — `test_lifecycle.py:25`, `test_dry_run.py:12-18`). Lane D. Effort S. Proof: the CI run on the commit shows the step and "passed". Unblocks: items 1, 3 and 9 cannot regress silently (P10).
14. crexi — second search-target wave, only after item 1-3 are green for 4 weeks (DO once the product answer in §12 Q1 is yes). Add Lee/Collier targets to `crexi_listings/extract.py:37-40` (the reconcile in item 3 scopes by target, so new targets cannot close old ones). Lane D. Effort M. Proof: S2 shows Collier cities with `corridor_name` set. Unblocks: the 300-listing source_ceiling.

Close-out duties in the same push as each item: SESSION_LOG entry (RULE 0), and close the stale check `fedora_runner_not_registered_smoke_owed` (`node scripts/check.mjs list`, 6d untouched) with evidence runs 35493215223 and 35516569482 — it says "zero self-hosted runners" while crexi ran on `fedora-swfl-local` on 09/20 (L1).

## 8. Checks and balances

Design rule applied: one signal per pipeline, fires only when a served number would be wrong or a consumer would read stale, auto-closes on green, never an issue per run.

crexi_listings — signal: the run's own conclusion, captured as the existing check row `cron_incident_ingest_crexi_listings` in `public.checks`.
- Why this fires only when a served number would be wrong: after item 1, a run goes red exactly when a covered city returned 0 rows (the case that corrupted the Fort Myers Beach count), and when every city failed (`pipeline.py:68-75`). A red run writes nothing wrong (the good city's rows are true; the failed city is not closed).
- Plumbing that already exists: `log-cron-incident.yml` lists "ingest-crexi-listings" (:83) and admits cancelled scheduled runs for classification (`.github/workflows/log-cron-incident.yml:113-125`, condition at `:123`), so a box-down 24 h cancel also lands; `log-cron-incident.mjs:156` reopens the check and `:173` closes it when the next scheduled run succeeds. Item 7 gives it a named class instead of UNKNOWN.
- Staleness backstop without a new alert: registry `freshness_sla: {warn_after_days: 14}` for crexi (item 12) shows on the ops coverage page (`https://swfldatagulf-ops.vercel.app/coverage`) via `check_freshness.py`; warn only, because `error_after_days` flips the whole shared freshness probe red (`cadence_registry.yaml:32-37`), which is already red daily (`gh run list --workflow freshness-probe-daily.yml --limit 3` → failure 09/24, 09/25, 09/26) and would drown the signal.

brevitas_listings — signal: none while parked; the registry note (item 6) is the record. If ever unparked: the same run-conclusion check row, plus a pipeline guard that fails the run when 0 rows survive normalization for every city (today it exits 0 with "0 lease rows", L1 35521057612).

market_heat_swfl — signal: the run conclusion after item 9 (red on "HOTNESS LAG" or a frozen Core month) → check row `cron_incident_market_heat_swfl_monthly` via `log-cron-incident.yml:92`, auto-closed by the next green. Backstops: item 10 (daily source liveness, same probe run) and `max_period_end` on `_tier1_inventory` visible to the doctor / coverage page.

Noise to delete or not add:
- Per-incident GitHub issues for these three workflows. `log-cron-incident.mjs:224-257` opens one `[cron-failure:<workflow>]` issue per incident (deduped while open) on top of the sticky feed issue #44 comment (`gh variable list`: `CRON_INCIDENT_ISSUE_NUMBER 44`) and the check row. For this family the check row is the signal; the extra issue is noise. Four such issues exist, all closed (`gh issue list --state all --search "crexi OR brevitas OR market-heat"`): #115 and #181 (crexi), #116 and #165 (brevitas); the other hits (#44, #110, #119, #130, #136) are not family issues. Proposal to family 16: a registry-driven opt-out so these workflows record the check row + #44 comment only.
- `probe_mode: odd_window` on crexi (item 12) — it turns a weekly cron into a "manual drop" window and hides a missed week behind WAITING.
- The brevitas freshness row (P6) goes away with the park.
- The stale check `fedora_runner_not_registered_smoke_owed` (close with evidence, §7 close-out).
- No new GitHub issue, label or check is added by this plan.

## 9. Box placement

- crexi_listings — stays on the Fedora runner (`runs-on: [self-hosted, swfl-local]`, `ingest-crexi-listings.yml:30`). Reasons that count: needs a real browser (Crawl4AI + UndetectedAdapter, `crexi_listings/extract.py:104-119`) and a residential IP (Cloudflare blocks GitHub IPs — run 29191537886, `ingest-crexi-listings.yml:22-24`; the proxy route failed too, run 31127088993, `:44-47`). Proven on the box: 35516569482. Keep `CRAWL4AI_PROXY` unset on the box (runbook `:241-247`). Gap on the box: backup and reboot untested (brief) — the §8 signal catches the outage (24 h cancel), but a planned reboot test would prevent it.
- brevitas_listings — parked (item 6). If unparked, move it to the Fedora runner: residential IP needed (GitHub IPs 403'd per `brevitas_listings/extract.py:16-20`; the paid proxy returned 402 on 07/26, run 30204670678; a residential GET answered 200 on 09/26, B). That drops the proxy dependency and the Playwright install (`ingest-brevitas-listings.yml:38-39`).
- market_heat_swfl — stays on GHA `ubuntu-latest`. No WAF (public S3, H returned 200 from here), no browser, finishes in about 2 min (run 34253707693: created 16:52:32 per R3, upload line 16:54:50 per L1). The Core CSV is 829,650,423 bytes (H) and `resources.py:58-61` holds the whole body in memory; it passed on GHA, and streaming would be the fix if it ever stops. New on the box: the raw-vintage archive (item 11) as a Hermes `no_agent` job on Spectre — reason: needs the SSD archive (`/srv/swfl`).
- Already on the box that should not be: nothing from this family. The Windows-era venv instructions in the crexi workflow header are dead text (item 12).

## 10. Compute lane per LLM leg

The grep that proves the family's own legs call no model:

```
grep -n -i -E "anthropic|claude|openai|ANTHROPIC_API_KEY|refinery|haiku|sonnet|gemini|llm" \
  .github/workflows/ingest-crexi-listings.yml .github/workflows/ingest-brevitas-listings.yml .github/workflows/ingest-market-heat-swfl.yml \
  ingest/pipelines/crexi_listings/*.py ingest/pipelines/brevitas_listings/*.py ingest/pipelines/market_heat_swfl/*.py ingest/lib/crawl_client.py
```

Every hit is a comment or a string: `ingest-crexi-listings.yml:33-37` (the key was removed 08/06), `extract.py:6,14,17,20` (docstring history of the retired model path), `pipeline.py:70` (error text), `market_heat_swfl/pipeline.py:11` (pack name), `crawl_client.py:13,220,314,343,374` (comments; crexi uses `Crawl4aiSession`, not the search ladder). Result: zero model calls in the three ingest legs.

Legs next to this family, owned elsewhere, listed so nothing is missed:
- `heal-cron-failure.yml:186-192` L2 "diagnose + comment" — fires on a red run of any of the three workflows (listed at `heal-cron-failure.yml:82-83,92`) when the classifier says UNKNOWN (`classify-cron-failure.mjs:261` `needsLlm`). Today both newest reds classify UNKNOWN (§4 P3, P7). Current auth: the API-key secret in that step's env — not a permitted lane. Replacement for this family: item 7 makes the leg unnecessary (the failures get deterministic classes, Lane D). Residual UNKNOWNs: Lane M (unattended `claude -p` on the Fedora runner with the Max login), decided by family 16, which owns the file.
- cre-swfl Stage-2 triage — `refinery/packs/cre-swfl.mts` sets neither `skipTriageAgent` nor `skipSynthesisAgent` (`grep -c` = 0), so the rebuild scores fragments with a model (`refinery/types/pack.mts:178-185`). The active-listings fragments already carry a constant fit score 5 (`cre-swfl.mts:720`), and the listing metrics are computed in code (`:1964-2006`). Owned by family 16 (rebuild). Can it need no model: for these fragments, yes — the fit score is constant. Lane D if family 16 flips the flag; otherwise Lane M.
- market-heat-swfl rebuild: no model (`market-heat-swfl.mts:684-685`).

## 11. Double-check log

Each numbered claim re-checked against its command or file after the draft was written.

- crexi runs 15 = 6 green / 5 cancelled / 4 red; newest green 09/20 35516569482 · R1 · verified.
- 35493241730 was a dry run limited to Estero · L1 shows `CORRIDOR: Estero` and "would be upserted" · verified; it is counted green but wrote nothing (stated in §3).
- brevitas 14 runs = 9 green / 5 red; newest red 07/26 30204670678 · R2 · verified. Last 8 green in a row · R2 order · verified.
- market_heat 6 runs, 6 green · R3 · verified.
- 09/20 crexi: Estero 29 raw, FMB 0 raw, 8 closed · L1 35516569482 · verified.
- 6 FMB + 2 Estero gone_at 09/20 · S3 · verified. Only the 6 Fort Myers Beach closures lack evidence (that city's scrape crashed); the 2 Estero closures had a working scrape behind them, so §4 P1 counts 6, not 8 · verified against L1.
- crexi 72 rows / 62 live / brevitas 1 · S1 · verified. S2 city counts sum 32+17+9+8+2+1+1+1+1 = 72 · verified.
- 33 live rows ingested before 09/20 · S4 · verified. City breakdown from the live-by-last-seen query: Fort Myers 22 + "FORT MYERS" 2 = 24, Bonita Springs 2 + 3 = 5, Naples 1, Apollo Beach 1, Avon Park 1, Sebring 1; sum 33 · verified (P2 says "Fort Myers 24" counting both casings).
- Observations 95 rows / 3 stamps / 08/09 → 09/20 · S6 (aliased rerun) · verified. The first S6 run collided two `count` columns and printed 3; re-run with aliases printed n_obs 95, n_runs 3 · corrected before writing.
- Served FMB 8 listings, 34,971 sqft, 21.5; Estero 15 listings, 85,104 sqft, 22 · `brains/cre-swfl.md` lines ~4726-4796, refined_at 2026-08-10T04:46:14Z · verified.
- Next-build FMB 2 / 5,686 / 33; Estero blended 15 / 22 (5 priced) vs crexi-only 14 / 31 (4 priced) · S5 both forms · verified. 84% drop: 1 − 5,686 / 34,971 = 0.837 · verified.
- Brevitas row fields and 08/02 first/last seen · S7 · verified.
- Brevitas param ignored: 3 identical uuids across for_lease, for_sale, lease, transaction=for_lease, listing_type=lease · B (two calls, 09/26) · verified. FMB for_lease 9 pins priced 1,075,000 → 6,200,000 · B · verified.
- Brevitas 402 proxy on 07/26 · `gh run view 30204670678 --log-failed` · verified.
- Classifier returns UNKNOWN for the Cloudflare, wait-timeout and 402 strings · node import of `classify` on saved snippets · verified.
- Core Last-Modified 09/04 16:36:54 GMT, 829,650,423 bytes; Hotness 09/10 16:08:42 GMT, 368,824,271 bytes · H · verified.
- Core SWFL 11711 rows, 201607 → 202608; per-county 202608 Lee 34 / Collier 20 / Hendry 2 / Charlotte 13 / Sarasota 24 / Glades 2 (sum 95) · H2 · verified.
- Hotness SWFL 9857, 201708 → 202608, 93 rows in 202608 · H2 · verified. Our 9764 = 9857 − 93 · arithmetic · verified; that our parquet ends at 202607 · could-not-verify directly (parquet not opened; Storage read needs the service key, which lives in the file the brief forbids dumping). Labelled [INFERENCE] in §2.
- Fixture 100 ZIPs: Lee 35, Collier 22, Hendry 3, Charlotte 13, Sarasota 24, Glades 3 · bun count over `fixtures/swfl-zip-county.json` · verified.
- `_tier1_inventory` market_heat rows vintage 2026-09-08, three source fields NULL · S8 · verified.
- Tests: 5 + 12 + 3 + 5 = 25 pass; pack 31 pass · T and `--co` · verified.
- No workflow runs pytest · `grep -rln pytest .github/` empty · verified.
- Registry line numbers 475, 1915, 1919, 1926, 1940, 1944, 488 · `grep -n` · verified. Ceiling / floor lines · `grep -n "source_ceiling:\|expected_rows_min"` → 493, 1925, 1933, 1950, 1956 · corrected (draft had 1935-1939, 1949, 1956-1961, 495-499).
- Consumers and `master.mts:229,252,290,331` · grep · verified. `cre-swfl.mts:720` fit score 5, `:1964-2006` metric emit · sed · verified.
- `log-cron-incident.yml:82-83,92` and `heal-cron-failure.yml:82-83,92` list the three workflows · grep · verified. `log-cron-incident.mjs:156,173,224-257` · grep · verified. Cancelled-run admission comment at `log-cron-incident.yml:113`, condition at `:123` · `grep -n` · corrected (draft said "around :113-125").
- Freshness probe red 09/24, 09/25, 09/26 · `gh run list --workflow freshness-probe-daily.yml --limit 3` · verified.
- Issues: #115, #116, #165, #181 are the family's closed incident issues · `gh issue list --state all --search ...` · verified. §8 first draft said "six such issues exist"; the list shows four family issues (#115 crexi, #116 brevitas, #165 brevitas, #181 crexi) — corrected in §8.
- Run duration (market heat about 2 min) · R3 createdAt 16:52:32 → L1 upload line 16:54:50 · verified.
- SSD free ≈ 973 GB · brief standing facts (not re-measured) · could-not-verify this session.

Corrections applied in the sections above: §8 family incident-issue count 4, not 6; every `extract.py` / `distill.py` / `constants.py` / `resources.py` / `test_lifecycle.py` line reference re-derived with `grep -n` on the single file (the draft had read several files through one concatenated `cat -n`, which shifted their numbers); §11's own cancelled-run line reference; registry ceiling / floor line numbers in §1, §4 P6 and §5.

## 12. Questions for the operator

1. Do you want CRE asking rents beyond Estero and Fort Myers Beach? Crexi has about 300 Lee/Collier listings (registry ceiling, 07/07/2026) and we read 16. Saying yes adds a served metric per submarket next to MarketBeat (product shape); item 14 is ready once the repair has 4 clean weeks.
2. Do you want a CRE for-sale asking-price feed? It is the only thing Brevitas has in these cities (12 pins on 09/26), and Crexi's `/properties` would add more. Nothing consumes it today, so building it without a consumer would create a dark root; a yes means a consumer comes with it.
3. The one Brevitas row and the 33 frozen Crexi rows: delete/close them in the lake (items 4 and 6), or leave them unread? Both are `data_lake` writes, so your call; the plan works either way.
