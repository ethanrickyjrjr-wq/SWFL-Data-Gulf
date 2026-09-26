# 03 zillow — pipeline plan (09/26/2026)

Family 03 is the Zillow Research feed: ZHVI (middle-tier home-value index), ZORI (rent index) and
the ZHVI top/bottom tier split ("tier divergence"). It is six registry pipelines in three pairs.
Each pair is a tier-1 DuckDB fetch that writes a Parquet to `s3://lake-tier1/market/`, plus a
tier-2 dlt loader that merges that Parquet into Postgres. Every pair landed August data green
this month. All six are free, deterministic and on `ubuntu-latest`, with no LLM leg.

The verdict is IMPROVE for all six. Nothing is broken today. What is wrong sits in the seams
around the pipelines:

- The nightly rebuild's ingest-aware trigger keys off the tier-1 landing. On 09/23 it rebuilt
  home-values-swfl against July data and stamped it with a fresh token.
- A single missed Zillow month passes the loader's 55-day content gate green.
- A failed monthly run has no same-month retry. It happened twice (06/23 and 07/21), and each
  time consumers sat one month stale.
- /insiders labels the ZHVI city average as a "median home value".
- The metro filter drops Hendry, which Zillow does publish, and lands 56 out-of-scope ZIPs.

## 1. Scope

Six pipelines, from `ingest/cadence_registry.yaml`:

- `zori_swfl_duckdb` (`ingest/cadence_registry.yaml:215`)
  - Workflow: `.github/workflows/zori-tier1-monthly.yml`.
  - Code: `ingest/duckdb_pipelines/zori_swfl/`.
  - Writes: `s3://lake-tier1/market/zori_swfl.parquet`, plus one `data_lake._tier1_inventory` row.
- `zhvi_swfl_duckdb` (`:235`)
  - Workflow: `zhvi-tier1-monthly.yml`.
  - Code: `ingest/duckdb_pipelines/zhvi_swfl/`.
  - Writes: `.../zhvi_swfl.parquet`.
- `tier_divergence_swfl_duckdb` (`:255`)
  - Workflow: `tier-divergence-tier1-monthly.yml`.
  - Code: `ingest/duckdb_pipelines/tier_divergence_swfl/`.
  - Writes: `.../tier_divergence_swfl.parquet`.
- `zori_swfl_tier2` (`:1292`)
  - Workflow: `zori-tier2-monthly.yml`.
  - Code: `ingest/pipelines/zori_swfl/`.
  - Writes: `data_lake.zori_swfl`. Views: `zori_zip_latest`, `zori_pivoted`.
- `zhvi_swfl_tier2` (`:1315`)
  - Workflow: `zhvi-tier2-monthly.yml`.
  - Code: `ingest/pipelines/zhvi_swfl/`.
  - Writes: `data_lake.zhvi_swfl`. Views: `zhvi_zip_latest`, `zhvi_pivoted`, `zhvi_zip_yoy_monthly`.
- `tier_divergence_swfl_tier2` (`:1338`)
  - Workflow: `tier-divergence-tier2-monthly.yml`.
  - Code: `ingest/pipelines/tier_divergence_swfl/`.
  - Writes: `data_lake.tier_divergence_swfl`. Views: `tier_divergence_zip_latest`, `tier_divergence_pivoted`.

Consumers were found by grep. The command is below; it returned 66 files. The live readers are:

```
rg -l -i "zhvi_swfl|zori_swfl|tier_divergence_swfl|zhvi_zip_latest|zori_zip_latest|tier_divergence_zip_latest|zhvi_swfl\.parquet|zori_swfl\.parquet" refinery lib app scripts components supabase ingest --glob '!**/__pycache__/**' | wc -l
rg -n "zhvi_pivoted|zori_pivoted|tier_divergence_pivoted" lib app refinery/packs
```

- Tier-1 Parquet has one reader: its own tier-2 loader, at `ingest/pipelines/*/resources.py`
  (`read_tier1_parquet`). An rg for the three Parquet paths outside `ingest/` hits only docs.
  The registry's `consuming_pack` on the three `_duckdb` entries (`:217`, `:237`, `:257`) names
  packs that never read the Parquet. That mismatch drives Problem P1.
- Brains:
  - `home-values-swfl` reads `zhvi_zip_latest` (`refinery/packs/home-values-swfl.mts:446`).
  - `rentals-swfl` reads `zori_zip_latest` (`refinery/packs/rentals-swfl.mts:450`).
  - `tier-divergence-swfl` reads `tier_divergence_zip_latest` (`refinery/packs/tier-divergence-swfl.mts:531`).
  - `investor-zip-swfl` joins the first two brains' outputs (`refinery/packs/investor-zip-swfl.mts:49-50`).
  - All four feed master (`refinery/packs/master.mts:242`, `:267`, `:271`, `:272`). The
    home-values edge landed in 7811e60b on 08/02.
- App and lib readers:
  - `app/charts/page.tsx:85`, `:109`, `:129`, `:174`, `:232`.
  - `app/insiders/page.tsx:111-112`, via `lib/charts/load-metro-trend.ts:21-46`.
  - `app/insiders/_lib/desk-stats.ts:129`.
  - `app/r/housing-swfl/page.tsx:142`.
  - `lib/desk/loaders.ts:838`.
  - `lib/demo/live-loaders.ts:131`.
  - `lib/email/market-context.ts:58`.
  - `lib/why-not-selling/zhvi-change.ts:54`.
  - `refinery/tools/build-corridor-fact-pack.mts:570`.
  - Added by the second Opus (missed in the first pass; found by
    `rg -n "zhvi_pivoted|zori_pivoted|tier_divergence_pivoted|zhvi_zip_yoy_monthly" lib app`):
    - `lib/charts/gallery-loaders.ts:71`, `:92`, `:107`, `:225`, `:258` (zhvi_pivoted,
      tier_divergence_pivoted, zori_pivoted; the /charts gallery and the save-gallery route).
    - `lib/build-chart-for-intent.mts:345` (zhvi_pivoted via loadMetroTrend), reached from the
      assistant at `lib/assistant/report-path.ts:120`.
    - `lib/deliverable/recipes/review-reply.ts:212` (zhvi_zip_yoy_monthly).
    - `lib/welcome/answer.ts:66-72` reads the rentals-swfl brain output (not the table) and labels
      the ZORI index "Median Rent"; live via `lib/assistant/conversation-path.ts:31`. See P5.
- Snapshotter: `ingest/scripts/capture_view_vintages` (workflow `view-vintages-monthly.yml`)
  appends the zhvi/zori pivoted views to `data_lake.view_vintages`.
- Rebuild job: `home-values-investor-monthly.yml` rebuilds home-values-swfl and investor-zip-swfl
  on day 24. It is a family-16 job and appears here only as a consumer.
- Dead connectors: `refinery/sources/zhvi-source.mts` and `zori-source.mts` are referenced only
  by tests and oracles (type imports) after the §05 cutover. They are not a data problem.

No pipeline in this family is a DARK ROOT. Every tier-2 table has a live reader.

## 2. What is being brought in

The source is Zillow Research public CSVs on `files.zillowstatic.com`. Freshness was checked
live this session with an HTTP HEAD on each file; the `requests.head` loop is in the
double-check log. Every file answered 200 with Last-Modified 09/16/2026. The newest month
column in ZHVI mid-tier and ZORI is 2026-08-31, per a full download plus csv header parse this
session. This matches `docs/handoff/2026-07-11-reliable-sources-findings.md:190` ("updated 16th
of month").

crawl4ai on `https://www.zillow.com/research/data/` returned status 403. That page is not used
by any pipeline. The CDN files are.

The geography filter is built at `ingest/duckdb_pipelines/zhvi_swfl/pipeline.py:95-101`: State =
FL, RegionType = zip, and Metro containing one of the substrings in `ingest/lib/swfl_metros.py:19-24`
(Cape Coral, Naples, Punta Gorda, North Port).

Live-table figures come from this read-only SQL. It uses a throwaway Bun.SQL script with the
connection approach of `scripts/apply-fdic-sod-view.mts:15-27`:

```
SELECT COUNT(*), COUNT(DISTINCT zip_code), MIN(period_end), MAX(period_end), MAX(ingested_at) FROM data_lake.<table>;
SELECT county_name, COUNT(DISTINCT zip_code), COUNT(*) FROM data_lake.<table> GROUP BY 1;
SELECT id, vintage, updated_at, byte_size FROM data_lake._tier1_inventory WHERE id LIKE 'lake-tier1/market/%';
SELECT schema_name, MAX(inserted_at), COUNT(*) FROM data_lake._dlt_loads WHERE schema_name IN ('zhvi_swfl','zori_swfl','tier_divergence_swfl') GROUP BY 1;
```

The "core" universe is the 57 Lee + Collier ZIPs (`refinery/lib/core-scope.mts:42-55`). Hendry
is the 3 ZIPs 33440, 33930 and 33935 in `fixtures/swfl-zip-county.json`.

### zhvi_swfl_duckdb

- Source file: `Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv`
  (`ingest/duckdb_pipelines/zhvi_swfl/constants.py:27-30`). It is the all-homes, middle-tier,
  smoothed and seasonally adjusted series. HEAD returned Content-Length 123,559,595.
- Fields: zip_code, period_end, home_value, metro, county_name, city, ingested_at
  (`pipeline.py:161-170`).
- Cadence: `cadence_days: 30`. Cron `0 13 22 * *` (`zhvi-tier1-monthly.yml:8`).
- Last real landing: run 35760716479, 09/22. Its log shows "rows loaded: 34,358 across 109 ZIPs
  in 4 MSAs" and "period range: 2000-01-31 to 2026-08-31". The inventory row reads vintage
  2026-09-22, updated_at 09/22/2026 17:27 UTC.
- County coverage, via the tier-2 table: Lee 34 ZIPs, Collier 19, Hendry 0.
- Out-of-scope rows: Charlotte 13, Manatee 19, Sarasota 24. That is 56 of 109 ZIPs outside
  Lee/Collier.

### zhvi_swfl_tier2

- Loads the Parquet above into `data_lake.zhvi_swfl`.
- Live table: 34,358 rows, 109 ZIPs, period_end 01/31/2000 to 08/31/2026, MAX(ingested_at)
  09/22/2026.
- `_dlt_loads`: last load 09/23/2026 17:32 UTC, 5 loads.
- Core coverage: 53 of 57 core ZIPs. The same 53 appear at the latest month (SQL in Section 8).
- The 4 missing core ZIPs are 33965, 34101, 34137 and 34141. Zillow's own file lacks them
  (download scan this session). That is a vendor ceiling, not our gap.
- View `zhvi_zip_latest`: 109 rows, all with latest_period 2026-08-31.

### zori_swfl_duckdb

- Source file: `Zip_zori_uc_sfrcondomfr_sm_month.csv`
  (`ingest/duckdb_pipelines/zori_swfl/constants.py:25-28`). It is the all-homes smoothed rent
  index. HEAD returned Content-Length 10,023,480.
- Cron `0 13 20 * *` (`zori-tier1-monthly.yml:8`).
- Last real landing: run 35523568711, 09/20. Its log shows "rows loaded: 5,531 across 91 ZIPs in
  4 MSAs" and "period range: 2015-01-31 to 2026-08-31".
- Run 35493245075 (09/20 06:03) was a dry run. Its log prints "--dry-run, writing to a temp dir".
  It is not a landing.

### zori_swfl_tier2

- Loads into `data_lake.zori_swfl`.
- Live table: 5,561 rows, 96 ZIPs, 01/31/2015 to 08/31/2026. Last `_dlt_loads` 09/21/2026 18:35 UTC.
- The table holds 5 more ZIPs and 30 more rows than the Parquet (96 against 91, 5,561 against
  5,531). The dlt merge (`resources.py`, PK zip_code + period_end) never deletes ZIPs that Zillow
  stops publishing. See P7.
- County coverage: Lee 30, Collier 16, Charlotte 12, Manatee 14, Sarasota 24, Hendry 0.
- Core ZIPs at the latest month: 45. Zillow's file carries exactly 45 of 57 core ZIPs (download
  scan). Our table holds 46, because the 46th is an orphan.
- View `zori_zip_latest`: 96 rows. 91 have latest_period 2026-08-31. The other 5 are stale:
  - 33957 (Lee): 04/30.
  - 34201 (Manatee): 04/30.
  - 34289 (Sarasota): 06/30.
  - 34228 and 34229 (Sarasota): 07/31.

### tier_divergence_swfl_duckdb

- Two source files, the bottom tier (`Zip_zhvi_uc_sfrcondo_tier_0.0_0.33_month.csv`) and the top
  tier (`..._0.67_1.0_month.csv`), at
  `ingest/duckdb_pipelines/tier_divergence_swfl/constants.py:39-47`. Both are RAW; Zillow
  publishes no smoothed and seasonally adjusted tier variant (`constants.py:11-15`).
- The pipeline FULL OUTER JOINs the two tiers on zip and month
  (`ingest/duckdb_pipelines/tier_divergence_swfl/pipeline.py:196-214`, the JOIN at `:211-213`).
- Cron `0 12 21 * *` (`tier-divergence-tier1-monthly.yml:9`).
- Last landing: run 35632270936, 09/21. Its log shows downloads of 138.34 MB and 147.61 MB,
  "rows loaded: 39,635 across 109 ZIPs in 4 MSAs", and period range 1996-02-29 to 2026-08-31.

### tier_divergence_swfl_tier2

- Loads into `data_lake.tier_divergence_swfl`.
- Live table: 39,635 rows, 109 ZIPs, 02/29/1996 to 08/31/2026. The newest top-tier and
  bottom-tier months are both 08/31/2026. Last `_dlt_loads` 09/22/2026 15:58 UTC, 4 loads.
- Both-tier ZIPs at 08/31/2026:
  - Lee 32, Collier 18, Charlotte 13, Manatee 19, Sarasota 24.
  - Core (Lee + Collier by county_name) = 50.
- View `tier_divergence_zip_latest`: 106 rows, all 2026-08-31.

### Hendry

Hendry is absent from all three tables (0 of 3 ZIPs). Zillow does publish it:

- ZHVI mid-tier, ZHVF and both tier files carry 33440, 33930 and 33935.
- ZORI carries 33935.
- All are under Metro "Clewiston, FL" (download scan this session).

`ingest/lib/swfl_metros.py:13-16` claims Hendry "is not covered by any MSA … any substring match
would silently return zero rows". That is refuted for the Zillow feeds. The filter drops Hendry
because its metro label is not in the list, not because Zillow lacks the data.

## 3. What is working

Run history comes from this command. None of the six workflows has 15 runs, so every run in
history is counted:

```
gh run list --workflow <file> --limit 15 --json databaseId,status,conclusion,createdAt,event
```

- zhvi-tier1-monthly: 6 runs, 6 green, 0 red.
  - Newest green 35760716479 (09/22, scheduled).
  - 35493243899 (09/20) was a dry run.
- zhvi-tier2-monthly: 6 runs, 4 green, 2 red.
  - Newest green 35896176046 (09/23).
  - Reds: 28037935550 (06/23) and 27389907377 (06/12). See P3 and P9.
- zori-tier1-monthly: 8 runs, 6 green, 2 red.
  - Newest green 35523568711 (09/20).
  - Reds: 26456005596 and 26457884416 (05/26), both "KeyError: 'SUPABASE_S3_ENDPOINT'" during
    bring-up, fixed the same day by 26459266867.
- zori-tier2-monthly: 7 runs, 5 green, 2 red.
  - Newest green 35639273274 (09/21).
  - Reds: 26456007713 and 26457882057 (05/26), the same missing-secret error ("caused an
    exception: 'SUPABASE_S3").
- tier-divergence-tier1-monthly: 5 runs, 4 green, 1 red.
  - Newest green 35632270936 (09/21).
  - Red: 29833856813 (07/21). See P3.
- tier-divergence-tier2-monthly: 5 runs, 4 green, 1 red.
  - Newest green 35750784011 (09/22).
  - Red: 29923567906 (07/22), a cascade of 07/21.

The July, August and September scheduled cycles are green end to end for ZHVI and ZORI. Tier
divergence is green for August and September and red for July. Every job took 69 to 98 seconds (`gh run view <id> --json
startedAt,updatedAt` on the six September runs).

Tests, all green this session:

- `py -3 -m pytest -q ingest/pipelines/zhvi_swfl ingest/pipelines/zori_swfl ingest/tests/pipelines/zori_swfl ingest/tests/duckdb_pipelines/test_dry_run_flag_honored.py`
  → "27 passed in 9.86s". The collect counts are:
  - zhvi_swfl: 9.
  - zori_swfl: 7.
  - The zori vintage guard: 3.
  - Dry-run honored: 8. That is 2 tests (`test_dry_run_flag_honored.py:24`, `:37`) × 4 modules
    (storm_history_swfl, zhvi_swfl, zori_swfl, hurdat2_fl at `:16-19`). 4 of the 8 cover this
    family.
- `bun test` on the three pack tests plus `refinery/sources/zori-source.test.mts` and
  `refinery/lib/view-row-floor.test.mts` → "81 pass, 0 fail". Per pack:
  - home-values-swfl: 26.
  - rentals-swfl: 25.
  - tier-divergence-swfl: 21.
- `find ingest -path '*tier_divergence*' -name 'test_*.py' | wc -l` → 0. The tier-divergence
  ingest has no tests.

Guards that work:

- The tier-2 vintage guard `_ensure_tier1_fresh` (`ingest/pipelines/*/pipeline.py:27-54`) refuses
  a stale Parquet. It fired correctly on 07/22 ("Tier 1 fetch did not succeed today:
  vintage=2026-06-21 is older than yesterday").
- The content gate `assert_content_fresh(newest, 55)` is at `pipeline.py:79-80`.
- The tier-1 zero-row abort is at `pipeline.py:188-190`.
- The 09/20 fix made zhvi and zori tier-1 honor `--dry-run` (`pipeline.py:214-231`). Runs
  35493243899 and 35493245075 prove it.

Packs and brains:

- All four brains filter to core scope before any number: home-values-swfl.mts:165,
  rentals-swfl.mts:161, tier-divergence-swfl.mts:206, investor-zip-swfl.mts:183.
- Each brain source fails loud on a thin view through its MIN_VIEW_ROWS floor. The floors are 90,
  79 and 85, at `refinery/sources/zhvi-zip-latest-source.mts:27`,
  `zori-zip-latest-source.mts:32` and `tier-divergence-zip-latest-source.mts:31`.
- On origin/main (`git fetch origin main`), the brains carry August data:
  - home-values-swfl v9: commit 71bfe080, 09/24.
  - rentals-swfl v12 and tier-divergence-swfl v3: commit 8cd5374f, 09/23.
  - The count comes from `git show origin/main:brains/<id>.md | grep -o 20..-..-3[01]`.
    2026-08-31 appears 69, 61 and 60 times in the three brains.
- `home-values-investor-monthly.yml` run 36040248364 (09/24) is green: "Push succeeded on attempt
  1".

Monitoring:

- The daily probe's doctor (freshness-probe-daily run 36259690113, 09/26) rates five of the six
  green. The sixth, `zori_swfl_duckdb`, is yellow on NO_RUNS_IN_WINDOW; see Section 8.
- `data_lake.view_vintages` holds a monthly snapshot per view (06/26, 07/26, 08/26, 09/26) for
  both `zhvi_pivoted` and `zori_pivoted`.

## 4. Problems

### P1 — The nightly rebuild stamps a fresh token on last month's Zillow data

Severity: blocks a served number. A brain goes out as "fresh" while carrying last month's period.

Symptom:

- Nightly-chain run 35818117589 (09/23 04:23 UTC) logged: "upstream home-values-swfl: TTL-fresh
  but ingest landed 2026-09-22T17:27:46Z after last build (2026-09-20T04:17:51Z) — rebuilding
  (ingest-aware trigger)".
- It then wrote brains/home-values-swfl.md version 8.
- That landing was the tier-1 Parquet. The tier-2 table the pack reads did not load until
  09/23 17:32 (`_dlt_loads`).
- `git show 8cd5374f:brains/home-values-swfl.md` carries 2026-07-31 69 times under
  freshness_token SWFL-7421-v8-20260923-5e1ea137. That is July data behind a 09/23 token.
- It was corrected only because `home-values-investor-monthly.yml` forced v9 on 09/24.
- The same trigger fired for tier-divergence-swfl on 09/22. Run 35686679297 logged "ingest
  landed 2026-09-21T17:30:01Z" (tier-1), before the tier-2 load at 09/22 15:58. That build
  failed only by luck: "tier_divergence_zip_latest fetch failed: Could not query the database
  for the schema cache", a PGRST002 shape. (The same run's "zori_zip_latest fetch failed" line
  belongs to the rentals-swfl build, which was keyed to the tier-2 date 2026-09-21T00:00:00Z.)
- On 09/23 (35818117589) tier-divergence-swfl was keyed to "ingest landed
  2026-09-22T00:00:00Z", the tier-2 date, so v3 correctly carried August. Only home-values-swfl
  was keyed to a tier-1 timestamp that night.
- rentals-swfl and tier-divergence-swfl have no monthly corrector like home-values does.

Root cause:

- `ingest/scripts/rebuild_due.py:196-220` builds pack → latest landing as the MAX over every
  registry entry whose `consuming_pack` names the pack.
- The three `_duckdb` entries carry `consuming_pack` (`cadence_registry.yaml:217`, `:237`,
  `:257`) even though no pack reads the Parquet (Section 1).
- `ingest/tests/test_cadence_registry_spine.py:93-98` requires every entry to declare
  `consuming_pack`, so it cannot simply be deleted.
- A second, smaller window: the tier-2 landing is truncated to the date
  (`ingest/scripts/check_freshness.py:521`, "date-precision"). The 09/22 nightly logged
  rentals-swfl as "ingest landed 2026-09-21T00:00:00Z", while `_dlt_loads` recorded 18:35 that
  day. A leaf built between 00:00 UTC and the real load on the same day would hide that load
  until the TTL expired.

First seen: 09/22 and 09/23, in these runs.

Same shape, possibly, in two other pairs (not verified here):

- `bls_oews_swfl_tier1` and `bls_oews_swfl` → labor-demand-swfl (family 06).
- `city_pulse_corridors` and `city_pulse_corridors_tier2` → corridor-pulse-swfl and cre-swfl
  (family 13).

The source is a python enumeration of registry packs fed by both a tier-1 and a tier-2 entry.

### P2 — A single missed Zillow month passes the loader green

Severity: blocks a consumer. It serves a stale month with no signal for about 30 days.

- The loader gate is 55 days (`ingest/pipelines/zhvi_swfl/pipeline.py:79`; same in zori and
  tier_divergence).
- If Zillow skips a month, the 09/23 run sees newest = 07/31. From 07/31 to 09/23 is 54 days.
  54 < 55, so the loader re-merges July green.
- The daily probe measures load time (`_dlt_loads.inserted_at`, `ingest/scripts/check_freshness.py:492-526`),
  so it also reads FRESH.
- The tier-1 comment at `ingest/duckdb_pipelines/zhvi_swfl/pipeline.py:43-50` records the same
  band arithmetic and defers the fix.
- `tier_divergence_swfl` has no quality contract at all: `ingest/quality/quality_registry.yaml`
  has entries only for zhvi_swfl (`:61`) and zori_swfl (`:68`). The doctor shows NO_CONTRACT.

First seen: latent, never triggered. Derived from the code and the dates.

### P3 — A failed monthly run has no same-month retry, so consumers sit a month stale

Severity: blocks a consumer.

- 07/21, run 29833856813. Symptom: "_duckdb.HTTPException: HTTP Error: Unable to connect to URL
  s3://lake-tier1/market/tier_divergence_swfl.parquet: Internal Server Error (HTTP code 544)".
  - The download and filter had succeeded: "rows loaded: 39,417 across 109 ZIPs in 4 MSAs",
    "period range: 1996-02-29 to 2026-06-30" (`gh run view 29833856813 --log-failed`).
  - The current classifier still returns UNKNOWN for that exact line:
    `node -e 'import("./.github/scripts/classify-cron-failure.mjs").then(m=>console.log(m.classify("<the 544 line>")))'`
    printed `{"klass":"UNKNOWN",...}` on 09/26.
  - Nothing reran until the 08/21 schedule (32481998028), so June tier data never landed in July.
- Root cause: the TRANSIENT regex at `.github/scripts/classify-cron-failure.mjs:199` does not
  match the DuckDB httpfs S3 5xx wording. The class became UNKNOWN (issue #149 title "UNKNOWN ·
  Tier Divergence SWFL Tier 1 fetch monthly"), so heal's L0 rerun (TRANSIENT only) never fired.
- 06/23, zhvi-tier2 run 28037935550. The log is gone ("HTTP 410"), so the cause could not be
  verified.
  - Impact verified: `view_vintages` shows `zhvi_pivoted` as_of 06/26 with max_period 2026-04.
    May data was missing until the 07/23 load.
- First seen: 06/23 and 07/21.

### P4 — One root cause becomes two incidents, each open a month

Severity: noise.

- The 07/21 tier-1 red caused the 07/22 tier-2 red through the vintage guard.
- log-cron-incident opened issue #149 (07/21 → closed 08/21) and #151 (07/22 → closed 08/22).
  That is two issues, one cause, each open 31 days
  (`gh issue list --label cron-failure --search "Tier Divergence in:title"`).
- Root cause: two separately scheduled workflows. Tier-2 runs the next day by cron instead of
  depending on tier-1 success. The crons are at `tier-divergence-tier2-monthly.yml:9` and the two
  others. The issue filer is `.github/scripts/log-cron-incident.mjs:218-275`.

### P5 — /insiders labels a ZHVI city average as a "median home value"

Severity: blocks a served number.

- `app/insiders/page.tsx:148` renders `${m.name} · median home value` from `zhvi_pivoted`.
- The view is `AVG(home_value) FILTER (WHERE city = …)` over ZIP-level ZHVI
  (`docs/sql/20260612_zhvi_pivoted_views.sql:42-50`). It is a mean of typical-value indexes, not
  a median.
- `docs/standards/data-roots.md:117` says ZHVI makes 'no "median" claim anywhere', and `:517` says
  "nothing calls it a m[edian]". `:76` says "no user surface serves the index as a VALUE". The
  code is verified; those doc lines need review.
- Same shape, ZORI (added by the second Opus, RULE 0.5c scope). `zori_pivoted` is
  `AVG(rent_index)` per city (`docs/sql/20260612_zori_pivoted_views.sql:53-61`), and it is titled
  "Median Monthly Rent" at `app/insiders/page.tsx:282`, `app/charts/page.tsx:255` and
  `lib/charts/gallery-loaders.ts:254`. `lib/welcome/answer.ts:69` labels the rentals-swfl
  `rent_index_latest` regional median "Median Rent", live in the assistant via
  `lib/assistant/conversation-path.ts:31`. data-roots.md:117 itself names this ZORI violation
  (tracked `zori_median_monthly_rent_label`, not among the 21 open checks on 09/26).
- Scope count: 5 label sites in 4 files (1 ZHVI, 4 ZORI; `app/insiders/page.tsx` holds two).
- Research already named this shape: `_RESEARCH/audits/2026-07-18-data-consolidation/BLOCKERS.md:15`
  ("ZHVI chart-title + brain-metric-label mislabel"). Its check died in the 09/15 bankruptcy and
  is not resurrected here.
- Related latent issue, cosmetic today:
  - `app/insiders/_lib/desk-stats.ts:127-141` picks the "Highest-value ZIP" from
    `zhvi_zip_latest` with no core-scope filter.
  - The top row today is 33921 Boca Grande (Lee) at 2,271,567. Rank 2 is 34216 Anna Maria
    (Manatee).
  - The query was `ORDER BY home_value_latest DESC LIMIT 3`.
- First seen: 07/18 (research). Still live 09/26.

### P6 — Geography filter: misses Hendry, lands 56 out-of-scope ZIPs

Severity: cosmetic for served numbers today, because the packs filter to core. It is a real gap
if Hendry is ever served.

- The metro substring filter (`ingest/lib/swfl_metros.py:19-24`) excludes Metro "Clewiston, FL",
  where all 3 Hendry ZIPs are published.
- It also includes the North Port-Sarasota-Bradenton MSA, which brings in 19 Manatee ZIPs. That
  county is outside every scope list (`lib/zip-dossier.ts:85-87` notes "+ Manatee 19, outside
  the county universe").
- First seen: by design since 05/23. Hendry presence was verified in source this session.

### P7 — ZORI orphan ZIPs keep serving a frozen value

Severity: cosmetic.

- The merge keeps rows for ZIPs Zillow dropped, so 5 of 96 `zori_zip_latest` rows are stale
  (Section 2).
- The one core orphan is 33957 (Sanibel). rentals-swfl emits it labelled with its own period:
  "2026-04-30" appears once in the origin rentals-swfl brain. The label is honest.
- It is also 1 of 45 values in the regional median "at 2026-08-31"
  (`refinery/packs/rentals-swfl.mts:127-139` medians every row).
- Root cause: `write_disposition="merge"` with no delete of absent keys
  (`ingest/pipelines/zori_swfl/resources.py`, resource decorator).

### P8 — Volume floors are meaningless on merge tables

Severity: cosmetic, but it gives false confidence.

- `expected_rows_min: 1` for zhvi (`cadence_registry.yaml:1322`, still marked "nascent").
- `107` for tier-divergence (`:1345`). Its comment claims "≥107 both-tier SWFL ZIPs at the latest
  month". Live is 106 (`SELECT COUNT(*) FROM data_lake.tier_divergence_zip_latest`).
- The probe compares these floors to the whole table count (`check_freshness.py:431-489`): 34,358
  and 39,635. A merge table never shrinks, so a total-row floor cannot catch a thin month.
- The brain-side MIN_VIEW_ROWS floors (90/79/85) count all ZIPs, including 56/50/56 out-of-scope
  ones. A loss of 19 core ZIPs from ZHVI would still pass (109 − 19 = 90).

### P9 — Latent dry-run hazard and missing tests on tier-divergence tier-1

Severity: cosmetic.

- `ingest/duckdb_pipelines/tier_divergence_swfl/pipeline.py:258-263` `main()` has no argparse
  (the file is 267 lines, `wc -l`).
  `python -m … tier_divergence_swfl.pipeline --dry-run` would ignore the flag and do a full S3
  write plus inventory upsert.
- The workflow is safe: it routes dry runs to `probe_grain` (`tier-divergence-tier1-monthly.yml:46-47`).
- The module is not in `ingest/tests/duckdb_pipelines/test_dry_run_flag_honored.py:17-18`.
- The ingest has 0 tests.
- Related history: 06/12 zhvi-tier2 red 27389907377 was "TypeError: '<' not supported between
  instances of 'str' and 'datetime.date'", fixed the same day (SESSION_LOG.md:33561).

### P10 — Inventory byte_size records one column chunk, not the file

Severity: cosmetic. No reader of this family's rows exists. `rg -n byte_size lib app scripts
refinery ingest/scripts` hits two readers, neither of which touches `lake-tier1/market/*`:
`ingest/scripts/_run_tombstone.py:42` (a debug SELECT) and
`refinery/tools/run-corridor-character-preview.mts:265` (grounded corridor keys only, `.like("id",
prefix)` at `:266`). The other hits are writers (`faf5_to_parquet.py`) or unrelated manifest
fields (`refinery/intelligence/observation-contract.mts`).

- The three rows read 559, 518 and 630 bytes for Parquets built from 34,358, 5,531 and 39,635
  rows.
- Root cause: `SELECT total_compressed_size FROM parquet_metadata(...) LIMIT 1`. It sits at
  `ingest/duckdb_pipelines/zhvi_swfl/pipeline.py:199`, `zori_swfl/pipeline.py:197` and
  `tier_divergence_swfl/pipeline.py:243`.
- Scope of the shape, from `rg -n total_compressed_size ingest`: 11 hits in 10 files, of which 10
  sites in 9 files are the `LIMIT 1` defect. The 3 here plus 7 others: redfin_swfl,
  redfin_price_drops, redfin_contract_cancellations, redfin_delistings_relistings,
  storm_history_swfl, and usgs ×2. The 11th hit is hurdat2's correct SUM.
- `hurdat2_fl/pipeline.py:167` uses `SUM(...)` correctly and is the reference.

### P11 — Stale docs and comments that mislead the next session

Severity: cosmetic.

- `home-values-investor-monthly.yml:3-4` says "master does not consume them". False since
  7811e60b (`refinery/packs/master.mts:272`).
- `wiki/pipeline-census.md:49-54` says that workflow "has failed 3/3". Superseded by the green
  runs 35488759008 (09/20) and 36040248364 (09/24).
- Registry comments are stale: `cadence_registry.yaml:1301` ("Verified: MAX(inserted_at) =
  2026-05-24"), `:1322`, `:1326` and `:1349`.
- The brief says master was last rebuilt 08/19. `git log origin/main -1 -- brains/master.md`
  shows 667ddc9e on 08/14. Verified at the file level; the 08/19 figure needs review (family 16).

## 5. What is missing

Against `source_ceiling`, verified this session by HEAD 200 on each file, all Last-Modified
09/16/2026:

- ZORI seasonally adjusted (`Zip_zori_uc_sfrcondomfr_sm_sa_month.csv`, 10,025,789 bytes). Not
  pulled. The registry ceiling is correct.
- ZHVI single-family only (`Zip_zhvi_uc_sfr_tier_0.33_0.67_sm_sa_month.csv`, 122,836,799 bytes)
  and condo only (`Zip_zhvi_uc_condo_…`, 31,072,354 bytes). Not pulled.
  - This is the biggest content gap. The all-homes index mixes condos and single-family homes,
    which the domain rules forbid comparing.
  - Core-ZIP coverage of these two files (measured by the second Opus with a streaming csv scan
    of each file against `fixtures/swfl-zip-county.json`, FL rows only; command in Section 13):
    - SFR-only: last column 2026-08-31, 53 of 57 core ZIPs with a value at that month (the same
      53 as the all-homes file), Hendry 33440, 33930 and 33935 present.
    - Condo-only: last column 2026-08-31, 43 of 57 core ZIPs with a value at that month, Hendry
      33440 present.
    - So a SFR/condo split costs nothing in SFR coverage and leaves 10 core ZIPs without a condo
      index.
- ZHVI 3-bedroom (`Zip_zhvi_bdrmcnt_3_…`, 101,157,168 bytes), raw non-SA mid-tier
  (146,316,684 bytes) and ZHVF forecast (`zhvf_growth/Zip_zhvf_growth_…`, 2,120,700 bytes).
  - The ZHVF file's columns run from 2026-09-30 to 2027-08-31. It carries 53 of 57 core ZIPs and
    all 3 Hendry ZIPs.
  - Not pulled. A vendor forecast is an opinion, so it belongs only as a cited external read,
    never as a reporter fact.
- The tier-divergence ceiling claims Zillow inventory, DOM and price-cut series are metro/national
  only. Could not verify: the research page returned 403 to crawl4ai.

Against the consumer:

- Nothing the four brains read is missing. Every field in the three `*_zip_latest` selects exists.
- Scope columns:
  - Hendry is present in source and absent in our tables (P6).
  - Manatee is landed and never used.

Against data-roots:

- `docs/standards/data-roots.md:76` and `:117` describe ZHVI as index-only. The code does not
  match (P5).

Vintage history:

- Zillow restates its history every release. Pairing `view_vintages` as_of 07/26 against 09/26:
  954 of 954 `zhvi_pivoted` city-month cells changed, and 412 of 412 `zori_pivoted` cells.
  Naples ZHVI for 2026-06 went from 639,804 to 630,185 (−1.503%).
- ZHVI membership was stable across those vintages: tier-1 row counts were 34,140 (07/22),
  34,249 (08/22) and 34,358 (09/22), always 109 ZIPs. So the ZHVI deltas are Zillow revision.
- ZORI membership moved (5 orphans, P7), so its deltas mix revision and membership and cannot
  be separated from this table.
- Our tier-2 merge overwrites history in place, and the tier-1 Parquet is overwritten (inventory
  key `exact`, `cadence_registry.yaml:221-222`). We keep no ZIP-level vintage at all.
  `view_vintages` keeps only the three-city metro averages, and nothing for tier divergence.
- For NORTH STAR priority 3 ("publication-aware inputs") that is the missing piece.

Source freshness in the registry:

- None of the six `source_scope` blocks records a source last-modified or newest period. This
  family's instance of open check `registry_source_ceiling_no_freshness_field` is answered by the
  values above.

## 6. Verdict per pipeline

- `zhvi_swfl_duckdb`: IMPROVE.
  - Reason: lands green every cycle, but its registry `consuming_pack` misfires the rebuild
    trigger (P1) and its filter drops Hendry (P6).
  - Number that changes it: 0 premature rebuilds keyed to this entry over one full cycle → GOOD
    ENOUGH.
- `zhvi_swfl_tier2`: IMPROVE.
  - Reason: no signal for a single missed Zillow month (P2), a floor of 1 (P8), and no
    same-month retry (06/23, P3).
  - Number that changes it: the content-age contract live and passing, with age ≤ 62 days, →
    GOOD ENOUGH.
- `zori_swfl_duckdb`: IMPROVE.
  - Reason: the same trigger keying as zhvi (P1), plus a false doctor yellow.
  - Number that changes it: the doctor run-status GREEN instead of NO_RUNS_IN_WINDOW.
- `zori_swfl_tier2`: IMPROVE.
  - Reason: 5 orphan ZIPs keep serving frozen values (P7), and P2.
  - Number that changes it: orphan count 0, or explicitly accepted.
- `tier_divergence_swfl_duckdb`: IMPROVE.
  - Reason: 0 tests, the dry-run hazard (P9), and the 07/21 S3 5xx stayed red a month (P3).
  - Number that changes it: at least 5 ingest tests green, plus the S3 5xx classified TRANSIENT.
- `tier_divergence_swfl_tier2`: IMPROVE.
  - Reason: zero quality contracts, and a floor of 107 against a live 106 both-tier count that is
    meaningless on a merge table (P8).
  - Number that changes it: a both-tier core-ZIP contract live with floor 45.

None is REPAIR, since every pipeline landed August green. None is PARK or RETIRE, since every
table has live readers.

## 7. The plan

Items 1 to 10 and 12 are DO. Items 11, 13 and 14 are ASK-FIRST. Every item is Lane D
(deterministic, no model). Items are in priority order.

### 1. DO — Key the rebuild trigger to the table the pack reads

- What:
  - Add a registry field `staging_for: <tier2 entry name>` to the three `_duckdb` entries:
    `zori_swfl_tier2` at `cadence_registry.yaml:215`, `zhvi_swfl_tier2` at `:235`,
    `tier_divergence_swfl_tier2` at `:255`.
  - Make `build_ingest_freshness_map` (`ingest/scripts/rebuild_due.py:203-219`) skip entries that
    carry it.
  - Emit the tier-2 landing at full precision, as the `MAX(inserted_at)` timestamp rather than the
    date (`check_freshness.py:521`). It is the same file and the same test.
  - Add a case to `ingest/tests/scripts/test_rebuild_due.py`.
  - The field is explicit, not a lane rule. Some packs read tier-1 directly (the daily-rebuild
    comment names hurricane-tracks-fl), so a lane heuristic would blind them.
  - No registry key allowlist exists (grep of `ingest/tests/test_cadence_registry_spine.py`), so
    the new key passes.
- Effort: S.
- Proof:
  - `py -3 -m pytest -q ingest/tests/scripts/test_rebuild_due.py ingest/tests/test_cadence_registry_spine.py`
    is green.
  - `py -3 ingest/scripts/rebuild_due.py --explain`, then
    `grep -E "home-values|rentals|tier-div" brains/_ingest-freshness.json`, shows the tier-2
    dates.
  - After the 10/20-10/23 cycle, the nightly log line "ingest landed … — rebuilding" for these
    three packs carries the tier-2 date, not the tier-1 timestamp.
- Unblocks: brain freshness tokens tell the truth. rentals-swfl and tier-divergence-swfl no longer
  depend on luck (P1).
- Cross-family: tell families 06 and 13 to check their pairs.

### 2. DO — Content contracts, one per tier-2 table

This is the family's signal; see Section 8.

- What: add three `sql_expectation` contracts (`locus: probe`, `policy: report`,
  `severity: error`) to `ingest/quality/quality_registry.yaml`:
  - Under `data_lake.zhvi_swfl` (`:61`).
  - Under `data_lake.zori_swfl` (`:68`).
  - A new `data_lake.tier_divergence_swfl` block.
  - SQL and floors are in Section 8.
- Effort: S.
- Proof:
  - `py -3 -m ingest.scripts.check_data_quality --dry-run` lists the three contracts PASS. The
    dry run is "NO MUTATION" (`check_data_quality.py:27`).
  - `py -3 -m pytest -q ingest/tests/quality/test_contract_registry.py` is green.
- Unblocks: P2 caught within about 7 days of a missed month, with auto-close. Retires P8's false
  confidence.

### 3. DO — Classify the DuckDB S3 5xx as TRANSIENT

- What:
  - Add `HTTP code 5\d\d|_duckdb\.HTTPException` to the TRANSIENT regex at
    `.github/scripts/classify-cron-failure.mjs:199` and its signal regex at `:204`.
  - Add a fixture case built from the 07/21 log line to `.github/scripts/classify-cron-failure.test.mjs`.
  - Safe to retry: a tier-1 rerun is an idempotent overwrite of a fixed path plus an inventory
    upsert.
  - Do NOT add the tier-2 "Tier 1 fetch did not succeed" line. An L0 rerun would fail
    identically. Item 4 removes that line from scheduled runs instead.
  - Shared file: coordinate with family 19.
- Effort: S.
- Proof: `node --test .github/scripts/classify-cron-failure.test.mjs` is green, with a case
  asserting klass TRANSIENT for the 544 line.
- Unblocks: the 07/21 shape self-heals the same day through heal's L0 rerun (P3).

### 4. DO — Run tier-2 as a job after tier-1, one source at a time

- What: in each tier-1 workflow, add a second job `load` with `needs: ingest` that runs the tier-2
  module. Delete the `schedule:` block from the matching tier-2 workflow, keeping
  `workflow_dispatch` for manual reloads. Point the tier-2 registry entry's `workflow:` at the
  tier-1 file.
- Ship one source per commit. Each touches 4 files: the two YAMLs, the registry, and
  `.github/_watch-manifest.json` regenerated by `node scripts/build-watch-lists.mjs` (last
  regenerated in 1c36907d).
  - ZORI: `zori-tier1-monthly.yml`, `zori-tier2-monthly.yml:9`, `cadence_registry.yaml:1293`.
  - ZHVI: `zhvi-*.yml`, `:1316`.
  - Tier divergence: `tier-divergence-*.yml`, `:1339`.
- Keep `_ensure_tier1_fresh` as a belt for manual dispatches.
- Effort: S ×3.
- Proof:
  - `grep -n "cron:" .github/workflows/{zhvi,zori,tier-divergence}-tier2-monthly.yml` returns
    nothing, and the same grep on the three tier-1 files returns 3 lines.
  - `node scripts/schedule-catalog.mjs` still lists all six refs. It prints JSON with `"ref":`
    lines; this session saw all six.
  - The first scheduled run of each after landing shows two green jobs:
    `gh run view <id> --json jobs --jq '.jobs[]|[.name,.conclusion]|@tsv'`.
- Unblocks: kills the cascade double incident (P4). Removes the one-day gap between the Parquet
  and the table, which shrinks P1's window. Frees 3 cron slots.

### 5. DO — Fix the index-as-median labels (all 5 sites) and scope the top-ZIP stat

- What:
  - `app/insiders/page.tsx:148`: change the label to "typical home value (Zillow ZHVI index)".
  - ZORI, same pass: `app/insiders/page.tsx:282`, `app/charts/page.tsx:255` and
    `lib/charts/gallery-loaders.ts:254` "Median Monthly Rent" → "Typical Monthly Rent (Zillow ZORI
    index)"; `lib/welcome/answer.ts:69` "Median Rent" → "Typical Rent (ZORI index)".
  - `app/insiders/_lib/desk-stats.ts:127-141`: select the top rows (a limit of 20, ordered by
    value) and take the first row that passes `isCoreScope` (`refinery/lib/core-scope.mts:61`).
  - Correct `docs/standards/data-roots.md:117`.
- Effort: S.
- Proof:
  - `rg -n "median home value" app/insiders` returns nothing.
  - `rg -n "Median Monthly Rent|\"Median Rent\"" app lib --glob '!**/*.test.*'` returns nothing.
  - `bun test lib/welcome/answer.test.ts` is green.
  - `rg -n isCoreScope app/insiders/_lib/desk-stats.ts` returns 1 line.
  - `bunx next build` is green.
- Unblocks: P5.

### 6. DO — Key the brain-side floors on core rows

- What: in the three `*-zip-latest-source.mts` files, pass the core-scope row count to
  `assertViewRowFloor` instead of `data.length`. New floors:
  - zhvi 47.
  - zori 40.
  - tier-divergence 45 (Section 8 arithmetic).
- Effort: S.
- Proof: `bun test refinery/lib/view-row-floor.test.mts refinery/packs/home-values-swfl.test.mts refinery/packs/rentals-swfl.test.mts refinery/packs/tier-divergence-swfl.test.mts`
  is green.
- Unblocks: P8's brain half.

### 7. DO — Tier-divergence tier-1 dry-run parity and tests

- What:
  - Give `ingest/duckdb_pipelines/tier_divergence_swfl/pipeline.py:258-263` the same argparse
    `--dry-run` as `zhvi_swfl/pipeline.py:214-231`.
  - Add the module to `ingest/tests/duckdb_pipelines/test_dry_run_flag_honored.py:17-18`.
  - Add `ingest/pipelines/tier_divergence_swfl/test_pipeline.py` and `test_resources.py`, cloned
    from the zhvi pair. Cover: FULL OUTER JOIN keeps single-tier rows, the both-null drop, and the
    vintage guard.
- Effort: S.
- Proof: `py -3 -m pytest -q ingest/pipelines/tier_divergence_swfl ingest/tests/duckdb_pipelines/test_dry_run_flag_honored.py`
  is green, with at least 5 tier-divergence tests.
- Unblocks: P9.

### 8. DO — Monthly ZIP-level vintage archive on the Fedora SSD

- What: a Hermes `no_agent` script job on Spectre, running monthly on day 17.
  - Download the four CSVs this family reads to `/srv/swfl/research/zillow/<MM-DD-YYYY>/`.
  - Write a sha256 manifest.
  - Keep them forever. That is 419.53 MB per month (123.56 + 10.02 + 138.34 + 147.61 MB from the
    run logs), about 5.0 GB per year. The brief's standing facts give ~973 GB free on
    `/srv/swfl`.
  - It never writes the lake.
- Effort: S.
- Proof: `ssh fedora ls -la /srv/swfl/research/zillow/` shows the dated folder and the manifest
  after 10/17.
- Unblocks:
  - ZIP-level vintage history for backtests (Section 5). Zillow restated 954 of 954 metro cells
    in two months.
  - NORTH STAR priorities 3 and 4 ("publication-aware inputs", "recoverable files").
- Risk: the T5 backup is untested (brief). Family 19 owns that.

### 9. DO — Record source freshness and clean stale registry text

- What: in the six `source_scope` blocks, add `source_freshness: {last_modified: "09/16/2026",
  newest_period: "08/31/2026", as_of: "09/26/2026", method: "HTTP HEAD files.zillowstatic.com +
  header parse"}`. Also:
  - Correct `cadence_registry.yaml:1301`, `:1322`, `:1326`, `:1345` (live both-tier = 106, not
    ≥107) and `:1349`.
  - Correct the comment at `home-values-investor-monthly.yml:3-8`.
  - Correct `wiki/pipeline-census.md:49-54`.
- Coordinate the field name with the owner of check `registry_source_ceiling_no_freshness_field`.
- Effort: S.
- Proof:
  - `py -3 -m pytest -q ingest/tests/test_cadence_registry_spine.py` is green.
  - `rg -n "nascent" ingest/cadence_registry.yaml` finds no zhvi line.
- Unblocks: P11, and this family's share of the open check.

### 10. DO — Replace the meaningless total-row floors with truncation guards

- What: `cadence_registry.yaml:1322` `expected_rows_min: 1` → 30900 (90% of 34,358), and `:1345`
  `107` → 35600 (90% of 39,635). Keep zori at 4666. State in the comment that these catch only
  truncation, and that the Section 8 contract is the thin-month guard.
- Effort: S.
- Proof: `py -3 -m ingest.scripts.check_freshness --dry-run | grep -E "zhvi_swfl_tier2|tier_divergence_swfl_tier2"`
  shows OK with the new floors.
- Unblocks: P8's registry half.

### 11. ASK-FIRST — Geography filter: county-keyed, with Hendry

- What: replace the metro substring filter with CountyName IN (Lee, Collier, Hendry) for this
  family's three tier-1 pipelines. This adds 3 Hendry ZIPs and stops landing 56 Charlotte,
  Manatee and Sarasota ZIPs.
- Needs his word because it changes `data_lake.*` write shape, and because Hendry is outside
  `CORE_SCOPE_COUNTY_FIPS` (`refinery/lib/core-scope.mts:26`), so the rows would land unread
  until scope changes. See Section 12.
- Also correct `ingest/lib/swfl_metros.py:13-16`, which is wrong for Zillow either way.
- Effort: M. Check `lib/why-not-selling/zhvi-change.ts:54` and the `zhvi_pivoted` city filters
  for dependence first.
- Proof: a live SQL `SELECT county_name, COUNT(DISTINCT zip_code) … GROUP BY 1` shows exactly Lee,
  Collier and Hendry after the next cycle.
- Unblocks: P6.

### 12. DO, low priority — Fetch the day after Zillow publishes

- What:
  - Add a day-17 cron to each tier-1 workflow and keep the current one as a backstop.
  - Add a no-op guard to tier-1: if the CSV's newest month column equals the current Parquet's
    MAX(period_end), exit 0 without writing.
  - Today the fetch runs 4-6 days after the 09/16 Last-Modified.
- Effort: S.
- Proof: the next cycle's `_tier1_inventory.vintage` is ≤ 10/18.
- Unblocks: about 5 days less lag every month.

### 13. ASK-FIRST — Drop or flag ZORI orphan ZIPs

- What: have `zori_zip_latest`, or rentals-swfl, exclude ZIPs whose latest_period is more than 1
  month behind the table MAX.
- Needs his word because it changes key_metrics (33957 disappears from the rentals-swfl output).
- Effort: S.
- Proof: `SELECT COUNT(*) FROM data_lake.zori_zip_latest WHERE latest_period < (SELECT MAX(period_end) FROM data_lake.zori_swfl)`
  returns 0, or the pack test asserts the exclusion.
- Unblocks: P7.

### 14. ASK-FIRST (a 10-file change) — Fix byte_size at all 10 defective sites in one pass

- What: add a helper to `ingest/lib/tier1_inventory.py` that returns
  `SUM(total_compressed_size)`, following `hurdat2_fl/pipeline.py:167`. Swap all 10 `LIMIT 1`
  sites in 9 pipeline files listed in P10 (9 files plus the helper = 10 files). Split per family
  (03: 3 files) if he prefers.
- Effort: S.
- Proof: after the next runs,
  `SELECT id, byte_size FROM data_lake._tier1_inventory WHERE id LIKE 'lake-tier1/market/z%'`
  shows values above 1,000,000.
- Unblocks: P10. Cosmetic.

## 8. Checks and balances

The design rule is one signal per pipeline that fires only when a served number would be wrong or
stale. It auto-closes, and it never files a GitHub issue per run. The seam is the existing
content-contract path:

- `ingest/quality/quality_registry.yaml`: `sql_expectation`, `locus: probe`, `severity: error`.
- Evaluated daily by `ingest/scripts/check_data_quality.py` inside `freshness-probe-daily.yml`
  (cron `0 14 * * *`, line 7).
- `sync_quality_checks` (`check_data_quality.py:340-370`) opens one `public.checks` row per
  failing error contract and auto-closes it when it passes.
- It surfaces on the doctor table and `https://swfldatagulf-ops.vercel.app/coverage`.
- It needs no new mechanism and files no issue.

### Threshold arithmetic

- Zillow publishes on the 16th (Last-Modified 09/16/2026). Our loads land between the 21st and
  23rd, and run late: scheduled 13:00 UTC, the 09/22 run started 17:26, a 4h26m lag.
- The probe runs at 14:00 UTC, so on load day it can still see last month.
- The worst normal content age just before a load is therefore month-end to the 23rd of M+2. For
  07/31 to 09/23 that is 54 days. Add 1 day of slip: 55.
- Threshold: fail when `MAX(period_end) < current_date - 62`. That leaves 7 days of margin over
  the peak.
- A missed September load fires from 10/02 (07/31 + 62 = 10/01, and the test is strictly
  older).

### Floors

Floors are core-county ZIP counts at the latest month, measured by:

```
SELECT COUNT(DISTINCT zip_code) FROM data_lake.<t> WHERE county_name IN ('Lee County','Collier County') AND period_end = (SELECT MAX(period_end) FROM data_lake.<t>);
```

- zhvi: 53 → floor 47 (0.9 × 53 = 47.7, rounded down).
- zori: 45 → floor 40 (0.9 × 45 = 40.5). The 2026 monthly core range is 43-45 (grouped SQL by
  period_end), so 40 never fires on normal churn.
- tier-divergence, both tiers non-null: 50 → floor 45.

### The six signals

The contract bodies below were linted with `ingest.quality.contracts.assert_read_only` and run
live this session. The runner (`check_data_quality.py:139-182`) reads `fetchone()[0]`: 0 is
PASS, and anything above 0 is FAIL. Each body therefore returns exactly one row with a count.

zhvi:

```
SELECT (CASE WHEN MAX(z.period_end) < current_date - 62 THEN 1 ELSE 0 END) + (CASE WHEN (SELECT COUNT(DISTINCT c.zip_code) FROM data_lake.zhvi_swfl c WHERE c.county_name IN ('Lee County','Collier County') AND c.home_value IS NOT NULL AND c.period_end = (SELECT MAX(period_end) FROM data_lake.zhvi_swfl)) < 47 THEN 1 ELSE 0 END) FROM data_lake.zhvi_swfl z
```

zori: the same body on `data_lake.zori_swfl`, with `rent_index` in place of `home_value` and a
floor of 40.

tier divergence:

```
SELECT (CASE WHEN LEAST(MAX(t.period_end) FILTER (WHERE t.top_tier_value IS NOT NULL), MAX(t.period_end) FILTER (WHERE t.bottom_tier_value IS NOT NULL)) < current_date - 62 THEN 1 ELSE 0 END) + (CASE WHEN (SELECT COUNT(DISTINCT c.zip_code) FROM data_lake.tier_divergence_swfl c WHERE c.county_name IN ('Lee County','Collier County') AND c.top_tier_value IS NOT NULL AND c.bottom_tier_value IS NOT NULL AND c.period_end = (SELECT MAX(period_end) FROM data_lake.tier_divergence_swfl)) < 45 THEN 1 ELSE 0 END) FROM data_lake.tier_divergence_swfl t
```

Live results, with MAX(period_end) at 08/31/2026 for all three:

- With `current_date`: 0 for all three (PASS).
- With `current_date` replaced by `DATE '2026-11-01'`: 0 (PASS). This is the boundary.
- With `DATE '2026-11-02'`: 1 (FAIL). A missed October load fires on 11/02.
- With the floor raised to 60: 1 (FAIL).

The doctor folds these results in (`ingest/scripts/doctor.py:691-695`, calling
`run_content_contracts`), so the failure also shows in its Content column.

Consequence the first pass did not state (second Opus): a FAIL on a `severity: error` contract
makes the dataset red (`doctor.py:144-145`), and the doctor step is gating (`--fail-on red`,
`freshness-probe-daily.yml:71`). So a firing contract also reds `freshness-probe-daily`. That does
not add a per-run issue: the probe already fails today (run 36259690113, "3 red · 38 yellow · 37
green"), its incident is the single standing `cron_incident_freshness_probe_daily` check plus the
idempotent one-open-issue-per-workflow path (`log-cron-incident.mjs:218-222`). The per-contract
`public.checks` row from `sync_quality_checks` is this family's signal; the workflow red is shared
and is not.

- `zhvi_swfl_tier2`: contract `zhvi_latest_month_fresh_and_core_covered` on `data_lake.zhvi_swfl`.
  - failing_rows_sql returns 1 row when the newest period is older than 62 days, or when fewer
    than 47 Lee/Collier ZIPs have a value at the newest period.
  - Fires when home-values-swfl, investor-zip-swfl, /charts momentum or /insiders would serve a
    stale or thin month. Auto-closes on the next good load.
- `zori_swfl_tier2`: contract `zori_latest_month_fresh_and_core_covered`, same shape, floor 40.
- `tier_divergence_swfl_tier2`: contract `tier_divergence_latest_month_fresh_and_core_covered`,
  same shape, both tiers non-null, floor 45.
  - This also catches one tier file stalling while the other advances. The FULL OUTER JOIN
    (`ingest/duckdb_pipelines/tier_divergence_swfl/pipeline.py:211-214`) would otherwise keep
    MAX(period_end) fresh.
- `zhvi_swfl_duckdb`, `zori_swfl_duckdb`, `tier_divergence_swfl_duckdb`: the signal is the paired
  tier-2 contract.
  - Reason: the Parquet's only reader is the tier-2 loader (Section 1 grep). A tier-1 failure
    can only harm a consumer through the tier-2 table, and the contract sees exactly that.
  - Their tier-1 freshness stays visible on the doctor and /coverage as observability, with no
    alert.

### Registry fields

- `freshness_sla` is deliberately not used for these six. It compares `age_days`, which for tier-2
  is load age (`check_freshness.py:492-526`), so a green re-merge of stale content reads fresh.
- `expected_rows_min` becomes a truncation guard only (plan item 10).
- New field: `staging_for` (plan item 1).

### Existing noise to delete or quiet

- The discrete incident issues for these six workflows, from `.github/scripts/log-cron-incident.mjs:218-275`.
  - Evidence: #149 and #151 were one root cause, two issues, each open 31 days.
  - Keep the `cron_incident_*` check row and the sticky-feed comment. The code already calls the
    issue "cosmetic relative to" the check (`:111-113`).
  - Stop the discrete issue for monthly source workflows. That mechanism is family 19's file;
    this family asks for it.
- The cascade red itself goes away with plan item 4.
- The doctor's false yellow on `zori_swfl_duckdb`: run-status NO_RUNS_IN_WINDOW in run
  36259690113, although green run 35523568711 exists (09/20).
  - Cause is in `ingest/lib/gh_runs.py:127-130` (window artifact before backfill). Family 19.
- The registry floors `1` and `107`: replaced (plan item 10).
- No open check in `node scripts/check.mjs list` (21 open, 09/26) belongs to this family, so
  there is nothing to close.

### Retry

- The DuckDB S3 5xx joins TRANSIENT (plan item 3).
- heal's L0 rerun is capped at one attempt (`heal-cron-failure.mjs:95-104`), so there is no loop.

## 9. Box placement

All six stay on GHA `ubuntu-latest` (`runs-on` at line 22 in both tier-1 YAMLs for zhvi and zori,
and line 23 in the other four).

- `zhvi_swfl_duckdb`: stays. `files.zillowstatic.com` answered GHA in every run in history
  ("download complete: 123.56 MB" in 35760716479). There is no WAF, the job ran 73 s, and it
  needs no browser, no local model and no residential IP.
- `zhvi_swfl_tier2`: stays. It reads S3 and writes Postgres, and ran 78 s (35896176046).
- `zori_swfl_duckdb`: stays. 10.02 MB download, 69 s (35523568711).
- `zori_swfl_tier2`: stays. 69 s (35639273274).
- `tier_divergence_swfl_duckdb`: stays. Two downloads totaling 285.95 MB (138.34 + 147.61),
  71 s (35632270936), against a 25-minute timeout (`tier-divergence-tier1-monthly.yml:24`).
  The disk held both downloads in every green run.
- `tier_divergence_swfl_tier2`: stays. 98 s (35750784011).

New on the box: plan item 8's vintage archive, a Hermes `no_agent` job on Spectre. The reason
that counts: it needs the SSD archive (`SWFL_RESEARCH_ROOT=/srv/swfl/research`). It does not move
any pipeline. It only keeps what GHA discards.

Already on the box that should not be: nothing from this family. None of the six YAMLs names
`self-hosted` or `swfl-local` (`grep -n runs-on` above).

The only 403 seen was crawl4ai against `www.zillow.com/research/data/` from the Windows box. No
pipeline uses that page, so it is not a reason to move anything.

## 10. Compute lane per LLM leg

LLM legs inside this family: none. The proof:

```
rg -n -i "anthropic|claude|openai|ANTHROPIC_API_KEY|refinery" ingest/duckdb_pipelines/{zhvi_swfl,zori_swfl,tier_divergence_swfl} ingest/pipelines/{zhvi_swfl,zori_swfl,tier_divergence_swfl} .github/workflows/{zhvi,zori,tier-divergence}-tier{1,2}-monthly.yml
```

That returned no matches (exit 1).

Corrected by the second Opus: the same grep on `home-values-investor-monthly.yml` does NOT return
exit 1. It hits `refinery` twice: `:56` `bun refinery/cli.mts home-values-swfl --force` and `:59`
`bun refinery/cli.mts investor-zip-swfl --target-only`. Lane for those hits: D, no model. The job's
env passes no Anthropic key (`:51-53` carry only SUPABASE_URL, SUPABASE_SERVICE_KEY and the
Postgres credential), both packs set the skip flags below, and run 36040248364 (09/24) wrote v9
green without a key.

The four consuming packs run no agent:

- `skipTriageAgent: true` and `skipSynthesisAgent: true` at `refinery/packs/rentals-swfl.mts:453-454`,
  `home-values-swfl.mts:449-450`, `tier-divergence-swfl.mts:534-535` and
  `investor-zip-swfl.mts:616-617`.
- Behavioral proof: the nightly run 35818117589 wrote rentals-swfl v12, tier-divergence-swfl v3
  and home-values-swfl v8 on 09/23, and the monthly run wrote v9 on 09/24. Meanwhile the 09/26
  rebuild log shows other packs failing with a 400 in run 36217671353.
- No narrative bake covers these brains:
  `rg -l narrative scripts lib refinery/tools | xargs rg -l "home-values-swfl|rentals-swfl|tier-divergence-swfl|zhvi|zori"`
  returned nothing.

One adjacent leg fires on this family's failures, and is owned by family 19:

- What it does: `.github/scripts/heal-cron-failure.mjs:214-231` writes a three-line diagnosis with
  `claude-haiku-4-5`. It runs when a failure classifies as DATA_EMPTY, SCHEMA_DRIFT or UNKNOWN
  (`classify-cron-failure.mjs:261-263`). Both July tier-divergence reds were UNKNOWN (#149,
  #151).
- Current auth: `ANTHROPIC_API_KEY` (`heal-cron-failure.yml:191`). It is dead on the credit wall:
  it reads the same repo secret as `daily-rebuild.yml:122`, whose 09/26 rebuild job in run
  36217671353 logged the 400 rejection (`gh run view 36217671353 --log | grep "^rebuild" | grep
  "error: 400"`). The leg is PARKED, not re-routed. It already degrades to a deterministic
  diagnosis when the call fails (`heal-cron-failure.mjs:165-169`).
- Replacement: none needed for this family. Plan items 3 and 4 mean our known failure shapes
  classify deterministically (TRANSIENT or gone), so they never reach UNKNOWN and the leg never
  fires.
  - If a narrative is still wanted for true unknowns, the lane is M: an unattended `claude -p` on
    the Fedora runner with the Max login, or the existing cloud-routine seam. That is family 19's
    call.
  - Standing decision, recorded once: these are internal pipelines, so the Max plan is a
    legitimate lane for unattended legs.
- Can it need no model at all? Yes, for this family. Deterministic classification is the
  preferred path.

## 11. Double-check log

Every numbered claim was re-read top to bottom against its command or file. Corrections are
applied above.

### Registry, workflows and scope

- Registry name lines 215 / 235 / 255 / 1292 / 1315 / 1338 · `grep -n -E "name: (zhvi|zori|tier_divergence)" ingest/cadence_registry.yaml` · verified.
- consuming_pack lines 217 / 237 / 257 and floor lines 1299 / 1322 / 1345 · `grep -n` on the registry (awk-filtered output) · verified.
- Cron lines and values (tier-1 at :8 for zhvi and zori, :9 for the other four; the day-20/21/21/22/22/23 schedules); runs-on lines 22/23; timeouts 20/15/20/15/25/15 · `grep -n -E "runs-on|timeout-minutes|cron:"` on the six YAMLs · verified.
- Section 1's first draft said "51 files" from the consumer rg · re-ran it with `| wc -l` (with the `__pycache__` exclusion): 66 · corrected to 66 in Section 1. The live-reader list is unaffected.
- Master consumes the four brains at master.mts:242 / 267 / 271 / 272 · `sed -n 236,276p refinery/packs/master.mts` · verified. The edge landed in 7811e60b on 08/02 · `git log -S` · verified.
- Brain source floors 90 / 79 / 85 · the grep of the three source files · verified.
- skip flags at 453-454, 449-450, 534-535, 616-617 · grep · verified.

### Source files and live tables

- Last-Modified 09/16/2026 on 10 files, plus Content-Lengths · `requests.head` loop · verified.
- Newest column 2026-08-31 in ZHVI and ZORI · full download and header parse · verified.
- ZHVF last column 2027-08-31, with 53 core and 3 Hendry ZIPs · same scan · verified.
- Hendry present in the tier files: 33440, 33935, 33930 in both · streaming grep · verified.
- ZHVI 34,358 rows / 109 ZIPs / 2000-01-31 to 2026-08-31 · SQL and run 35760716479 log · verified.
- ZORI 5,561 / 96, against Parquet 5,531 / 91 · SQL and run 35523568711 log · verified. 30 orphan rows = 5,561 − 5,531 · verified.
- Tier divergence 39,635 / 109 · SQL and run 35632270936 log · verified.
- County counts:
  - ZHVI: Lee 34, Collier 19, Charlotte 13, Manatee 19, Sarasota 24 · SQL · verified. Out of scope = 13 + 19 + 24 = 56 · verified.
  - ZORI: Lee 30, Collier 16, Charlotte 12, Manatee 14, Sarasota 24 · SQL · verified.
- Core coverage: ZHVI 53/57, ZORI 46/57 table, 45/57 source, 45 at the latest month, tier divergence 53, both-tier latest 50 · fixture-based SQL and county-based SQL · verified.
- The 4 core ZIPs missing from ZHVI (33965, 34101, 34137, 34141) · source scan · verified.
- View counts 109 / 96 / 106, and the 5 stale ZORI ZIPs with their periods · SQL · verified.
- Tier-1 inventory byte_size 559 / 518 / 630 · SQL · verified.
- `_dlt_loads` last loads 09/23 17:32, 09/21 18:35, 09/22 15:58 and load counts 5 / 5 / 4 · SQL · verified.

### Runs, incidents and brains

- Run counts: 6/6 zhvi-t1 green; zhvi-t2 4 green / 2 red; zori-t1 6/2; zori-t2 5/2; tier-divergence t1 4/1 and t2 4/1 · the gh run list output · verified.
- 05/26 ZORI reds were KeyError SUPABASE_S3_ENDPOINT · `gh run view --log-failed` on all four · verified.
- 06/12 red was the str/date TypeError · log · verified.
- 06/23 cause · log HTTP 410, no issue found under the zhvi-tier2 tag, no sticky-feed comment · could-not-verify.
- 06/23 impact: zhvi_pivoted as_of 06/26 had max_period 2026-04 · view_vintages SQL · verified.
- 07/21 S3 544 line and 07/22 vintage-guard line · `gh run view --log-failed` · verified.
- Issues #149 and #151, open and close dates · `gh issue list` · verified. 07/21 → 08/21 = 31 days; 07/22 → 08/22 = 31 days · arithmetic · verified.
- Durations 73 / 78 / 69 / 69 / 71 / 98 s · startedAt and updatedAt · verified (17:26:37 → 17:27:50 = 73 s; 17:31:20 → 17:32:38 = 78 s; 16:42:44 → 16:43:53 = 69 s; 18:34:40 → 18:35:49 = 69 s; 17:28:52 → 17:30:03 = 71 s; 15:56:59 → 15:58:37 = 98 s).
- Premature rebuild on 09/23: the log line in 35818117589, v8 carrying 2026-07-31 ×69, token v8-20260923 · verified.
- The 09/22 tier-divergence trigger and PGRST002 failure in 35686679297 · verified.
- Origin brain periods (home-values ×69, rentals ×61, tier-divergence ×60 on 2026-08-31) · `git show origin/main:` · verified.
- Master brain file 08/14 on origin · `git log origin/main -1` · verified. The brief's 08/19 · needs review.

### Commands behind the source-side and derived numbers

Every command below was re-runnable this session. SQL runs through the throwaway Bun.SQL probe,
using the `scripts/apply-fdic-sod-view.mts:15-27` approach.

HEAD loop, for Last-Modified and Content-Length on the 10 files:

```
python -c "import requests;b='https://files.zillowstatic.com/research/public_csvs/';[print(f,requests.head(b+f,timeout=30).headers.get('Last-Modified'),requests.head(b+f,timeout=30).headers.get('Content-Length')) for f in ['zhvi/Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv','zori/Zip_zori_uc_sfrcondomfr_sm_month.csv','zhvi/Zip_zhvi_uc_sfrcondo_tier_0.0_0.33_month.csv','zhvi/Zip_zhvi_uc_sfrcondo_tier_0.67_1.0_month.csv','zori/Zip_zori_uc_sfrcondomfr_sm_sa_month.csv','zhvi/Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_month.csv','zhvf_growth/Zip_zhvf_growth_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv','zhvi/Zip_zhvi_uc_sfr_tier_0.33_0.67_sm_sa_month.csv','zhvi/Zip_zhvi_uc_condo_tier_0.33_0.67_sm_sa_month.csv','zhvi/Zip_zhvi_bdrmcnt_3_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv']]"
```

Core and Hendry source scan (ZORI shown; swap the URL for the ZHVF and ZHVI mid-tier files). It
prints the last column, the core count, the missing core ZIPs and the Hendry ZIPs present. The metro label "Clewiston, FL" came from the same scan with one more print of (CountyName, Metro) for FL rows in Lee, Collier and Hendry:

```
python -c "import requests,csv,io,json;d=json.load(open('fixtures/swfl-zip-county.json'));core={e['zip'] for e in d['entries'] if e['primary_county'] in('12071','12021')};hen={e['zip'] for e in d['entries'] if e['primary_county']=='12051'};u='https://files.zillowstatic.com/research/public_csvs/zori/Zip_zori_uc_sfrcondomfr_sm_month.csv';rows=list(csv.reader(io.StringIO(requests.get(u).text)));h=rows[0];z={r[h.index('RegionName')].zfill(5) for r in rows[1:]};print(h[-1],len(core&z),sorted(core-z),sorted(hen&z))"
```

Hendry in the two tier files:

```
python -c "import requests;[print(f,[(l.decode().split(',')[2],l.decode().split(',')[-1][:12]) for l in requests.get('https://files.zillowstatic.com/research/public_csvs/zhvi/'+f,stream=True).iter_lines() if b'Hendry County' in l]) for f in ['Zip_zhvi_uc_sfrcondo_tier_0.0_0.33_month.csv','Zip_zhvi_uc_sfrcondo_tier_0.67_1.0_month.csv']]"
```

Vintage pairing (per cell, the changed count, and the per-vintage max period):

```
SELECT a.view_name, a.series_key, a.period, a.value, b.value, round(((b.value/a.value-1)*100)::numeric,3) FROM data_lake.view_vintages a JOIN data_lake.view_vintages b USING (view_name, series_key, period) WHERE a.as_of='2026-07-26' AND b.as_of='2026-09-26' AND a.period IN ('2026-05','2026-06','2025-06') ORDER BY 1,2,3
SELECT a.view_name, COUNT(*), COUNT(*) FILTER (WHERE a.value<>b.value) FROM data_lake.view_vintages a JOIN data_lake.view_vintages b USING (view_name, series_key, period) WHERE a.as_of='2026-07-26' AND b.as_of='2026-09-26' GROUP BY 1
SELECT view_name, as_of, COUNT(*), MAX(period) FROM data_lake.view_vintages GROUP BY 1,2 ORDER BY 1,2
```

ZORI orphans and the view's period distribution:

```
SELECT zip_code, county_name, city, latest_period FROM data_lake.zori_zip_latest WHERE latest_period < '2026-08-31'
SELECT latest_period, COUNT(*) FROM data_lake.zori_zip_latest GROUP BY 1 ORDER BY 1
```

Fixture-based core coverage. `<core57>` and `<hendry3>` are the ZIP lists that
`fixtures/swfl-zip-county.json` yields for primary_county 12071/12021 and 12051:

```
SELECT COUNT(DISTINCT zip_code) FILTER (WHERE zip_code IN (<core57>)), COUNT(DISTINCT zip_code) FILTER (WHERE zip_code IN (<hendry3>)) FROM data_lake.<table>
```

Top-value ZIP:

```
SELECT zip_code, city, county_name, home_value_latest FROM data_lake.zhvi_zip_latest ORDER BY home_value_latest DESC NULLS LAST LIMIT 3
```

### Contract tests (Section 8)

- Three bodies were run through `assert_read_only` and executed live, from the scratchpad script
  `contracts_test.py` · verified:
  - today → 0/0/0.
  - `DATE '2026-11-01'` → 0/0/0.
  - `DATE '2026-11-02'` → 1/1/1.
  - Floor 60 → 1/1/1.
- The runner semantics (`fetchone()[0]`, 0 = PASS) are at `check_data_quality.py:139-182`, and
  the builder passes SQL through at `ingest/quality/contracts.py:438-453` · verified.
- The doctor includes contract results (`doctor.py:691-695`) · verified.

### Tests and probes

- pytest 27 passed (9 + 7 + 3 + 8) · collect-only per path · verified.
- bun 81 pass in 5 files; per pack 26 / 25 / 21 · verified.
- Tier-divergence ingest tests = 0 · find · verified.
- Cited line ranges re-opened this pass:
  - `heal-cron-failure.mjs:95-104` (one-attempt cap) and `:165-169` (non-fatal catch).
  - `log-cron-incident.mjs:111-113` ("cosmetic relative to").
  - `check_data_quality.py:27` ("NO MUTATION") and `:340-370` (open and auto-close).
  - `view-row-floor.mts:30-39` (fails only when rowCount < minRows, so 90 passes a floor of 90).
  - `tier-divergence-tier1-monthly.yml:46-47` (dry run goes to probe_grain).
  - `zhvi_swfl/pipeline.py:188-190` (zero-row abort).
  - `cadence_registry.yaml:221-222` (inventory key exact).
  - All verified.
- Watch-manifest entries for this family, `paid: false` (`.github/_watch-manifest.json` "file" lines `:1014`, `:1024`, `:1094`, `:1104`, `:1114`, `:1124`), so heal's L0 retry is allowed for them · corrected by the second Opus (the first pass cited `:1012-1031`, which holds only the two tier-divergence entries).
- Doctor rows: the three tier-2 rows and zhvi/tier-divergence duckdb green, zori_swfl_duckdb yellow NO_RUNS_IN_WINDOW · CI log of 36259690113 · verified.
  - A local doctor run showed the three tier-2 rows yellow. The two later local runs printed nothing. The CI log is used · local discrepancy could-not-verify.

### Thresholds and derived figures

- 07/31 → 09/23 = 54 days · arithmetic (31 + 23) · verified.
- 07/31 + 62 = 10/01, so the check fires from 10/02 · arithmetic · verified.
- 55-day gate passes 54 · `pipeline.py:79` · verified.
- Floors 47 / 40 / 45 from 53 / 45 / 50, with ZORI 2026 range 43-45 · SQL and arithmetic · verified.
- Vintage deltas 954/954 and 412/412; Naples 2026-06 639,804 → 630,185 (−1.503%) · SQL · verified.
- ZHVI membership stable at 34,140 / 34,249 / 34,358 with 109 ZIPs each · run logs 29931102336, 32575688706, 35760716479 · verified.
- Archive size 419.53 MB per month (123.56 + 10.02 + 138.34 + 147.61) · arithmetic · verified. About 5.0 GB per year (× 12 = 5,034 MB) · verified.
- 90% floors 30,922.2 → 30900 and 35,671.5 → 35600 (both rounded down to the hundred; re-run with python this pass) · arithmetic · verified.
- Boca Grande 2,271,567, and rank 2 Anna Maria · SQL · verified.
- byte_size shape: 11 sites in 10 files · `rg -n total_compressed_size ingest` · verified. The hurdat2 SUM reference · verified.

### Formatting and hard rules

- Section 1 consumer-grep count corrected from 51 to 66. Section 1 "No pipeline is a DARK ROOT" re-checked against the reader list · verified.
- Every Section 7 item names file, lane, effort, proof and what it unblocks · re-read · verified. Count: 11 DO (1-10, 12), 3 ASK-FIRST (11, 13, 14).
- Hard rule 2 re-read line by line: Section 10 names the dead leg as blocked and routes around it deterministically · verified.
- No tables, no blockquotes; code fences hold commands only · re-read · verified.

Corrections applied above:

- Section 1: the consumer grep returned 66 paths, not 51.
- Section 3: the cycle sentence was rewritten. It had read as if July were green for tier
  divergence.
- P10: the byte_size reader grep was re-run with `ingest/scripts` included. The only hits are
  writers.
- Plan item 4: the file count went from 3 to 4, because `.github/_watch-manifest.json` lists
  every watched workflow (`:1014`, `:1024`, `:1094`, `:1104`, `:1114`, `:1124`) and is regenerated by
  `scripts/build-watch-lists.mjs`.
- Section 9 dropped an unsourced "14 GB disk" figure.
- Plan item 8 now cites the brief for "~973 GB free".
- Section 10 no longer quotes the provider's error text.
- P1 and plan item 1 gained the date-precision window (`check_freshness.py:521`).
- Section 8 gained the contract SQL bodies and their live pass/fail results.
- A plan-annotation hook added a blockquote "Recommended model" line and a "Parallel Safety"
  table to this file. Both break the no-tables, no-blockquotes rule, so both were removed.
  Problem headings were renamed from "P1." to "P1 —" so the hook no longer parses them as tasks.

## 12. Questions for the operator

1. Hendry. Zillow publishes all 3 Hendry ZIPs, but core scope (`refinery/lib/core-scope.mts:26`)
   deliberately excludes Hendry. Should Hendry be served, so that plan item 11 is worth doing?
   Or should it stay a documented source-has-it, we-don't-serve-it gap?
2. Out-of-scope rows. Should the three Zillow tier-1 pipelines stop landing the 56 Charlotte,
   Manatee and Sarasota ZIPs? Nothing in the brains uses them. This changes `data_lake` write
   shape (plan item 11).

## 13. Second-Opus verification

Run 09/26/2026 by the second Opus. Every command below was re-run this session. The lake was read
through a read-only Bun.SQL transaction (the `scripts/apply-fdic-sod-view.mts:15-27` credential
approach, scratchpad script `z03_second_q.mts`, never committed). No code was changed, no workflow
dispatched, no issue opened, nothing pushed.

### Claims checked: 293

- Registry, 18: the 6 `name:` lines, 3 `consuming_pack` lines (217/237/257), 3 `workflow:`
  lines (1293/1316/1339), 3 `expected_rows_min` values (1299 = 4666, 1322 = 1, 1345 = 107), and
  3 stale comment lines (1301/1326/1349). `grep -n` on `ingest/cadence_registry.yaml`. All
  verified.
- Workflow YAMLs, 19: 6 cron lines and values, 6 `runs-on`, 6 timeouts, and the tier-divergence
  dry-run route to `probe_grain` (`tier-divergence-tier1-monthly.yml:46-47`). `grep -n -E
  "runs-on|timeout-minutes|cron:"`. All verified.
- Run lists, 26: 6 per-workflow totals, 6 newest-green ids, 8 red ids, 6 September durations.
  `gh run list --workflow <file> --limit 15` and `gh run view <id> --json startedAt,updatedAt`.
  All verified.
- Run-log quotes, 33, from 15 runs: 35760716479, 35523568711, 35632270936, 35493245075,
  29833856813, 29923567906, 28037935550 (HTTP 410), 29931102336, 32575688706, 35818117589,
  35686679297, 36040248364, 35488759008, 36259690113 (the 6 doctor rows) and 36217671353. 31
  verified, 2 corrected (the 07/21 row count and the 09/22 tier-divergence error line).
- Live SQL, 83: counts, ZIPs, period bounds and MAX(ingested_at) for 3 tables (15); county ZIP
  splits (15); inventory vintage and byte_size (6); `_dlt_loads` max and count (6); view row
  counts (4); ZORI orphan distribution and the 5 orphan ZIPs (9); top-value ZIPs (2); core
  latest-month counts 53/45/50 (3); both-tier county split (5); per-tier MAX (2); vintage pairs
  954/954 and 412/412 (2); Naples 639,804 → 630,185 (1); view_vintages max period per as_of (8);
  ZORI 2026 core range 43-45 (1); the three contract bodies under 4 date/floor cases, giving
  0/0/0, 0/0/0, 1/1/1, 1/1/1 (4). All verified.
- Source side, 18: Last-Modified (all 16 Sep 2026) and Content-Length for 7 Zillow files by
  `requests.head`; ZORI newest column 2026-08-31, 45 of 57 core ZIPs, Hendry 33935 under
  "Clewiston, FL", and 33957 absent from source. All verified.
- Tests, 3: pytest "27 passed in 8.83s", bun "81 pass / 0 fail", tier-divergence ingest tests 0.
  All verified.
- Code and doc citations opened, 77 (every `path:line` in Sections 1 to 10). 71 verified, 6
  corrected (listed below).
- Other, 16: issues #149 and #151 open and close dates (4); checks ledger 21 open, none in this
  family (2); brain periods 69/61/60, commits 71bfe080 and 8cd5374f, the v8 token and 2026-07-31
  ×69, master 667ddc9e on 08/14 (7); consumer grep 66 (1); `total_compressed_size` hit count (1,
  corrected); the credit grep (1). 15 verified, 1 corrected.

### Corrections (13), each applied in its own section

1. P9 and plan item 7: tier-divergence `main()` at `pipeline.py:334-339` → `:258-263` → the file
   is 267 lines (`wc -l`), `def main()` at `:258`.
2. Section 2 and Section 8: FULL OUTER JOIN at `pipeline.py:272-291` / `:286-290` → `:196-214`,
   the JOIN at `:211-213` → `grep -n "FULL OUTER"` on the tier-divergence tier-1 pipeline.
3. Section 3: the 8 dry-run tests "cover the zhvi and zori modules" → 2 tests × 4 modules
   (storm_history, zhvi, zori, hurdat2), 4 of them this family's →
   `test_dry_run_flag_honored.py:16-19`, `:24`, `:37`.
4. P3: the 07/21 run loaded "39,635" rows → "rows loaded: 39,417 across 109 ZIPs" →
   `gh run view 29833856813 --log-failed`.
5. P1: the 09/22 tier-divergence build failed on "zori_zip_latest fetch failed" → it failed on
   "tier_divergence_zip_latest fetch failed: Could not query the database for the schema cache";
   the zori line was rentals-swfl's → run 35686679297 log.
6. P5: "`data-roots.md:117` says 'nothing calls it a median'" → `:117` says 'no "median" claim
   anywhere', the "nothing calls it a m[edian]" text is `:517`, and `:76` also claims no value
   surface → `grep -n` on `docs/standards/data-roots.md`.
7. P5 and plan item 5 scope: 1 mislabel site → 5 sites in 4 files. The ZORI "Median Monthly
   Rent" titles at `app/insiders/page.tsx:282`, `app/charts/page.tsx:255` and
   `lib/charts/gallery-loaders.ts:254` sit on `AVG(rent_index)`
   (`docs/sql/20260612_zori_pivoted_views.sql:53-61`), and `lib/welcome/answer.ts:69` labels the
   ZORI index "Median Rent" → Grep for "Median Monthly Rent|Median Rent" over app and lib.
8. P10 and plan item 14: "11 sites in 10 files, the other 8" → 11 rg hits, of which 10 `LIMIT 1`
   sites in 9 files are defective (3 here + 7 others); the 11th is hurdat2's correct SUM →
   `rg -n total_compressed_size ingest`.
9. P10: "no reader exists, only writers" → two readers exist, `_run_tombstone.py:42` and
   `refinery/tools/run-corridor-character-preview.mts:265`; neither reads `lake-tier1/market/*`,
   so the cosmetic severity stands → `rg -n byte_size lib app scripts refinery ingest/scripts`.
10. Section 10: "`rg` on home-values-investor-monthly.yml returned exit 1" → it hits `refinery`
    at `:56` and `:59` (the refinery CLI); lane D, no model, no key in env (`:51-53`), run
    36040248364 green → `grep -n -i -E "anthropic|claude|openai|refinery"`.
11. Section 1 consumers: the reader list missed `lib/charts/gallery-loaders.ts` (5 reads),
    `lib/build-chart-for-intent.mts:345`, `lib/deliverable/recipes/review-reply.ts:212` and the
    brain-output reader `lib/welcome/answer.ts` → Grep over app, lib and refinery for the table
    and view names. No claimed reader was found to be missing.
12. Section 11: the watch-manifest cite `:1012-1031` (and 4 lines in the item-4 note) → 6 entries
    at `:1014`, `:1024`, `:1094`, `:1104`, `:1114`, `:1124`, all `paid: false` → `grep -n` on
    `.github/_watch-manifest.json`.
13. Section 2: the State/RegionType predicates are not in `swfl_metros.py:19-24` → they are
    composed at `ingest/duckdb_pipelines/zhvi_swfl/pipeline.py:95-101`, which only takes the
    substring list from `swfl_metros.py` → `grep -n RegionType`.

### Unverifiable claims

- The 06/23 zhvi-tier2 cause: `gh run view 28037935550 --log-failed` returns HTTP 410; the log is
  gone. Its impact (view_vintages as_of 06/26, max period 2026-04) is verified.
- The tier-divergence `source_ceiling` claim that Zillow's inventory, DOM and price-cut series are
  metro/national only: the research page answers 403 to crawl4ai (first pass); not re-tried.
- Hendry in the ZHVI all-homes mid-tier and the two tier files, and the ZHVF column range: not
  re-downloaded this pass. Hendry was re-verified in ZORI (33935) and in the SFR-only file (33440,
  33930, 33935).
- The local-doctor discrepancy in Section 11: not re-run. The CI log of 36259690113 is the
  evidence and was re-read.
- The brief's "master last rebuilt 08/19": the file-level answer is 667ddc9e on 08/14
  (`git log origin/main -1 -- brains/master.md`). Reconciling it is family 16's job.

### Gaps filled

- Section 5: core coverage of the SFR-only and condo-only ZHVI files, which the first pass left
  "not measured". SFR-only has 53 of 57 core ZIPs at 2026-08-31; condo-only has 43 of 57. The
  command (condo shown; swap the file name for SFR):

```
py -3 -c "import requests,csv,json;d=json.load(open('fixtures/swfl-zip-county.json'));core={e['zip'] for e in d['entries'] if e['primary_county'] in('12071','12021')};b='https://files.zillowstatic.com/research/public_csvs/zhvi/';f='Zip_zhvi_uc_condo_tier_0.33_0.67_sm_sa_month.csv';r=requests.get(b+f,stream=True);rd=csv.reader(l.decode() for l in r.iter_lines() if l);h=next(rd);print(h[-1],len({x[h.index('RegionName')].zfill(5) for x in rd if x[h.index('State')]=='FL' and x[h.index('RegionName')].zfill(5) in core and x[-1].strip()}))"
```

- Section 8: the gating consequence. A firing `severity: error` contract reds the dataset
  (`doctor.py:144-145`) and the gating doctor (`freshness-probe-daily.yml:71`). That rides the
  existing single `cron_incident_freshness_probe_daily` incident, not a new per-run issue.
- P3: proof that the classifier still returns UNKNOWN for the 07/21 S3 544 line today, so plan
  item 3 is still needed.
- P1: the 09/23 tier-divergence v3 was keyed to the tier-2 date and was correct. Only
  home-values-swfl was mis-keyed that night.
- P5: the ZORI half of the index-as-median defect (correction 7).

### Section-by-section coverage check

- Sections 2, 3, 4, 6, 7, 8 and 9 each name all six pipelines: zhvi_swfl_duckdb,
  zhvi_swfl_tier2, zori_swfl_duckdb, zori_swfl_tier2, tier_divergence_swfl_duckdb and
  tier_divergence_swfl_tier2. In Section 8 the three `_duckdb` entries share their tier-2 pair's
  contract. The stated reason is that the Parquet's only reader is the tier-2 loader.
- Section 8: no per-run GitHub issue filing survives. Each pipeline has exactly one signal on an
  existing seam: a `sql_expectation` contract in `ingest/quality/quality_registry.yaml`, synced
  to `public.checks` by `check_data_quality.py:340-370`. The noise list is concrete:
  - issues #149 and #151 (the cascade);
  - the discrete incident-issue path for these six workflows;
  - the false NO_RUNS_IN_WINDOW doctor row for `zori_swfl_duckdb`;
  - the registry floors 1 and 107.
- Section 9: all six stay on `ubuntu-latest`, each with a reason (run duration, no WAF, no
  browser, no local model). No pipeline moves to the Fedora runner, so neither the
  `SWFL_LOCAL_RUNNER_READY` gate nor the `[self-hosted, swfl-local]` label applies. The one new
  box job (plan item 8) is a Hermes `no_agent` job for the SSD archive.
- Section 10: the grep over the six workflow YAMLs and six pipeline directories returns nothing.
  The one extra hit, `home-values-investor-monthly.yml` (the refinery CLI), now carries a lane
  (correction 10).

### Credit-suggestion count: 0

`grep -n -i -E "credit|top up|top-up|console balance|api key funding|billing|fund|balance"` on
this file found 2 hits before this section:

- The heading "Checks and balances".
- One factual sentence in Section 10 saying the heal leg is dead on the credit wall. That sentence
  now says the leg is PARKED. If a narrative is ever wanted, it routes to lane M.

Neither hit proposes, prices or hints at adding credit, so nothing was deleted.

