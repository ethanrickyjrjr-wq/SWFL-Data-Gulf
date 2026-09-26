# 16 ops-chain — pipeline plan (09/26/2026)

Family 16 is the machinery that turns landed data into served brains and then watches itself: the nightly chain (its Vercel clock, its row gate, the rebuild, the narrative bake, the parity gate) plus the daily probes and graders (freshness probe + doctor, tripwire, Supabase DB metrics, data targets, signal reverify, view vintages, project-feed change detection, the monthly home-values/investor rebuild). 13 registry entries, all under `jobs:` in `ingest/cadence_registry.yaml`. Verdict: the probes and monthlies mostly work; the chain itself is broken in a way that is cheap to fix. The master brain has not refined since 08/14/2026. The cause is not the row gate any more (since 09/15 the rebuild runs regardless). Three of master's five critical upstreams die on the credit wall: macro-us and macro-florida on all 23 rebuilds since 09/15, cre-swfl on 19 of 23 (the other 4 were the 09/21-09/22 REST outage). Two of those three make a model call that changes nothing they serve. The watchers are red so often that they carry no signal: freshness probe red 85 of its last 100 runs, tripwire red 51 of its last 60, 2,500 comments on the incident feed. The plan: make macro-us and macro-florida deterministic (two lines), put cre-swfl's prose on a Max-plan bake or go deterministic (his call), gate the parked listing leg out of the chain, stop the nightly double-run, decouple parity, fix three lying signals (heartbeat, tripwire dark-list, reverify hang), and turn the doctor gate into "new red only". One dependency sits outside this family: the city-pulse job inside the chain has failed 37 of 37 runs since 09/09 on its distill step, so the chain's overall run stays red until the city-pulse family makes that failure non-fatal or re-routes it — master can refine before that, the red X cannot clear.

## 1. Scope

13 pipelines, all `jobs:` entries (no `lane`, `cadence_days`, `consuming_pack`, `expected_rows_min` or `source_scope` fields exist on `jobs:` entries by design — header at `ingest/cadence_registry.yaml:2624-2643` says "Membership only … NO freshness/lane fields"). Line numbers from `grep -n "name: <job>" ingest/cadence_registry.yaml`.

- nightly-chain — `ingest/cadence_registry.yaml:2755`, workflow `.github/workflows/nightly-chain.yml`. Writes nothing itself; orchestrates listing-lifecycle (x3 counties), city-pulse, live-search, the row gate, rebuild, bake, warm, parity. Consumer: everything downstream of `brains/`.
- nightly-chain-dispatch (vercel.json) — `ingest/cadence_registry.yaml:2751`, `vercel.json:8-9` (`"23 4 * * *"`), route `app/api/cron/nightly-chain-dispatch/route.ts`. Writes nothing; fires a `repository_dispatch` of type `nightly-chain`.
- daily-rebuild — `ingest/cadence_registry.yaml:2653`, `.github/workflows/daily-rebuild.yml`. Writes `brains/*.md` + `brains/_build-report.json` + `brains/_ingest-freshness.json` (committed), `public.predictions` on a successful master refine (`refinery/lib/predictions-log.mts:4`; X verified in the file, Y needs review: the live table also carries `prediction_kind='slug'` rows for other brains from the second insert at `predictions-log.mts:429` — Q `select brain_id, prediction_kind, count(*), max(refined_at) from public.predictions group by 1,2` → macro-swfl slug 09/22/2026, rsw-airport slug 09/15/2026, master synthesis 117 rows newest 08/14/2026, master slug 3 rows newest 06/30/2026). Consumers: every `/api/b/*`, `/r/*` page, MCP.
- narrative-bake — `ingest/cadence_registry.yaml:2676`, `.github/workflows/narrative-bake.yml`. Writes `public.narratives`, `public.narrative_bake_batches` (`upsertNarrative` at `lib/narratives/store.ts:59-64`, the file's "only write path"; `lib/narratives/batch-store.ts:40`). Second-Opus correction: the first draft cited `store.ts:30`, which is the `.from("narratives")` read inside `loadNarrative` (`:22`), not the write. Consumers: `app/r/[slug]/page.tsx:45`, `app/r/zip-report/[zip]/page-data.ts:4`, `app/r/housing-swfl/page.tsx:29`, `app/r/cre-swfl/[corridor]/page.tsx:30`, `lib/email/zip-seed.ts:35`, `lib/deliverable/recipes/review-reply.ts:59` (bakedAreaRead).
- freshness-probe-daily — `ingest/cadence_registry.yaml:2679`, `.github/workflows/freshness-probe-daily.yml`. Runs `check_freshness`, `check_data_quality` (both write `public.checks`, `ingest/scripts/check_freshness.py:663`, `ingest/scripts/check_data_quality.py:384`), the doctor (gating, `ingest/scripts/doctor.py:737`) and `probe_source_liveness`. Consumer: ops `/coverage`, the checks ledger.
- tripwire-hourly — `ingest/cadence_registry.yaml:2666`, `.github/workflows/tripwire-hourly.yml`. Writes GitHub issue #119 only. Consumer: the operator.
- supabase-metrics-scrape — `ingest/cadence_registry.yaml:2669`, `.github/workflows/supabase-metrics-scrape.yml`. Writes `public.supabase_db_metrics` (`scripts/supabase-metrics-scrape.mjs:3`). Consumer: ops `app/db-health/page.tsx` + `lib/db-health.ts` (swfldatagulf-ops repo).
- gate-a-parity — `ingest/cadence_registry.yaml:2711`, `.github/workflows/gate-a-parity.yml`. Writes nothing; 4 DB parity test files (`gate-a-parity.yml:60-64`). Consumer: the chain's conclusion.
- data-targets-daily — `ingest/cadence_registry.yaml:2708`, `.github/workflows/data-targets-daily.yml`. Writes `public.data_targets` (`ingest/scripts/generate_data_targets.py:200`). Consumers: ops `app/glass/shopping.tsx`, `lib/glass.ts`; `refinery/lib/backtest/skill-baseline.mts:170` cites it.
- reverify-signals-daily — `ingest/cadence_registry.yaml:2733`, `.github/workflows/reverify-signals-daily.yml`. Writes `public.checks` (reopen, `scripts/reverify-signals.mjs:118`), runs `ceilings-to-checks` and `check-sweep`, comments on issue #136. Consumer: the checks ledger.
- view-vintages-monthly — `ingest/cadence_registry.yaml:2764`, `.github/workflows/view-vintages-monthly.yml`. Writes `data_lake.view_vintages` (`ingest/scripts/capture_view_vintages.py:92`). Consumer: `refinery/lib/backtest/view-vintage-reader.mts:22` via `refinery/tools/flywheel-backtest.mts:96` (a manual tool, no schedule). Registry coverage_exempt at `ingest/cadence_registry.yaml:2595`.
- project-feed-change-detection-daily — `ingest/cadence_registry.yaml:2761`, `.github/workflows/project-feed-change-detection-daily.yml`. Writes `public.project_feed` (`scripts/project-feed/change-detection.mts:86`). Consumers: `app/project/[id]/page.tsx:210`, `app/api/projects/[id]/route.ts:111`, `lib/project/feed.ts`, `lib/project/digest.ts`.
- home-values-investor-monthly — `ingest/cadence_registry.yaml:2724`, `.github/workflows/home-values-investor-monthly.yml`. Writes `brains/home-values-swfl.md`, `brains/investor-zip-swfl.md` (`home-values-investor-monthly.yml:65`). Consumer: master and the `/r/` pages that read those brains.

Also downstream but NOT in this family: `grade-predictions.yml` (fires on `workflow_run` of "Nightly Chain" only when `conclusion == 'success'`, `grade-predictions.yml` job `if:`) — `gh run list --workflow grade-predictions.yml --limit 5` shows 5 of 5 `skipped` 09/24-09/26. It is stalled by this family's red chain.

## 2. What is being brought in

Evidence commands used below (named once, cited by tag):
- E1 = `gh run list --workflow <file>.yml --limit 15 --json databaseId,status,conclusion,createdAt,event`
- E2 = `gh run list --workflow nightly-chain.yml --limit 200 …` then, for every run with createdAt >= 2026-08-14, `gh api repos/:owner/:repo/actions/runs/<id>/jobs --paginate` extracting the conclusions of `gate`, `rebuild`, `bake`, `verify` (86 runs from 31769734772 on 08/14 to 36232679167 on 09/26: 2 on 08/14, 84 from 08/15)
- L1 = `gh run view 36217671353 --log-failed` (09/26 04:23 repository_dispatch run)
- Q = a throwaway `bun` script in the session scratchpad using `Bun.SQL` with the dlt credential, copied from `scripts/apply-fdic-sod-view.mts:10-30`; read-only SELECTs, each quoted inline
- BR = `git show origin/main:brains/_build-report.json` (after `git fetch origin main`), last written by the 09/26 09:27 run

None of these jobs ingests an outside source except supabase-metrics-scrape (Supabase Metrics API). The rest read our own lake/brains. County coverage (Lee 12071 / Collier 12021 / Hendry 12051) is not a property of an ops job; where a job carries geography it is noted.

- nightly-chain: brings in nothing directly. On 09/26 04:23 the row gate reported (L1): `live_search_daily_median_asking — LANDED — 214 rows >= floor 1`, `live_search_daily_mortgage — LANDED — 15 rows >= floor 1`, `city_pulse — LANDED — 100 rows >= floor 50`, `listing_lifecycle — STALE — last landed 2026-08-14, expected 2026-09-26 (UTC)`. Cadence: nightly, head 04:23 UTC (`nightly-chain.yml:53`).
- nightly-chain-dispatch: a `repository_dispatch` run existed on 40 of the 43 nights 08/15-09/26; nights with no dispatch run: 08/29, 08/30, 08/31 (E2, awk over event per day).
- daily-rebuild (inside the chain): BR shows 41 packs evaluated: 35 `skipped-fresh`, 1 `built` (city-pulse-swfl), 5 `missing` (cre-swfl, macro-us, macro-florida, active-rentals-swfl, master). `refined_at` from `git show origin/main:brains/<id>.md | grep -m1 refined_at`: master 2026-08-14T04:30:21Z, cre-swfl 2026-08-10T04:46:14Z, macro-us 2026-07-30T06:59:47Z, macro-florida 2026-07-19T02:28:39Z, active-rentals-swfl 2026-07-11T06:32:37Z, macro-swfl 2026-09-26T04:26:02Z. Leaf brains keep committing: `git log origin/main --since=2026-09-22 -- brains/` shows a `chore(brains): daily rebuild` commit at both 04:26 and 09:2x UTC every day 09/23-09/26.
- narrative-bake: Q `select surface, count(*), max(baked_at) from public.narratives group by 1` → zip 53 (max 08/14/2026), corridor 27 (max 08/11/2026), brain 43 (max 08/14/2026), area-email 52 (max 08/14/2026). Q on `narrative_bake_batches` → 42 batches, 0 pending, newest submitted 08/14/2026. `vars.BAKE_CADENCE` = `daily` (`gh variable list`).
- freshness-probe-daily: the doctor on 09/26 17:39 (run 36259690113 log): "3 red · 38 yellow · 37 green of 78 datasets. Workflow joined: 76/78 · content contracts: 9/78". Reds: `listing_lifecycle` (STALE / content FAIL / DISABLED), `listing_week` (run RED), `swfl_inc` (run RED).
- tripwire-hourly: run 36257936782 log: "2 RED · 3 YELLOW · 12 green". Both REDs are "PULSE ACTIVE" on `dbpr-sirs-monthly.yml` and `ingest-crexi-listings.yml`.
- supabase-metrics-scrape: Q `select count(*), count(distinct scraped_at), min(scraped_at), max(scraped_at) from public.supabase_db_metrics` → 6,507 rows, 723 scrapes, 07/21/2026 → 09/26/2026 17:16Z (re-queried by the second Opus after the 19:56Z scrape: 6,516 rows, 724 scrapes, max 09/26/2026 19:56Z — drift, not an error). 9 distinct metrics in the last 48 h (re-queried: 9). Scrapes per full UTC day (Q `select (scraped_at at time zone 'UTC')::date, count(distinct scraped_at) … where scraped_at > now() - interval '9 days' group by 1`): 09/18 6, 09/19 7, 09/20 6, 09/21 2, 09/22 2, 09/23 6, 09/24 5, 09/25 5, 09/26 5 as of 19:56Z — against an hourly cron (`supabase-metrics-scrape.yml:14`). Second-Opus correction: the first draft's "09/18 2" was a partial day at its 8-day window edge; the full day is 6.
- gate-a-parity (inside the chain): no rows; compares `data_lake.zhvi_zip_latest` / zori views against the pack path (`refinery/packs/zhvi-zip-latest-gate-a-parity.test.mts:1-30`). Lee/Collier/Hendry ZIPs by construction of the views.
- data-targets-daily: Q → 13 rows in `public.data_targets`, all `updated_at` 09/26/2026 17:56Z; status building 8, want 4, new 1. Keys include `stale:listing_lifecycle`, `stale:rentals_swfl`, `falsifiability_gap:master`.
- reverify-signals-daily: Q → `public.checks` 1,653 rows, 21 open (state `open`), 62 in state `done` carrying a signal (the set reverify reads, `checks?state=eq.done&signal=not.is.null` at `scripts/reverify-signals.mjs:88`); 9 more `dropped` rows carry a signal and are not re-verified (Q `select state, count(*) from public.checks where signal is not null group by 1` → done 62, dropped 9). Run 36180242986 (09/25): "0/62 regressed, 0/62 signal-broken".
- view-vintages-monthly: Q → `zhvi_pivoted` 3,819 rows, `zori_pivoted` 1,654 rows, 4 distinct `as_of` each (06/26/2026 → 09/26/2026), newest `captured_at` 09/26/2026 16:50Z.
- project-feed-change-detection-daily: Q → `data-change` 42 rows (newest 09/23/2026), `outside-action` 6 rows (newest 07/19/2026). Q `public.projects` → 23 rows.
- home-values-investor-monthly: `brains/home-values-swfl.md` and `brains/investor-zip-swfl.md` refined_at 2026-09-24T18:18:20Z on origin/main.

## 3. What is working

- nightly-chain: the guard, concurrency and the three ingest legs execute; live-search lands every night (L1: 214 and 15 rows). The `always()` rebuild change of 09/15 took: E2 shows rebuild `skipped` on the 61 runs 08/15 → 09/15 09:29 and `failure` (i.e. it RAN) on all 23 runs from 35037327866 (09/15 23:48) through 36232679167. `.github/scripts/nightly-chain-sole-clock.test.mjs` is among 75 node tests passing (`node --test .github/scripts/nightly-chain-sole-clock.test.mjs .github/scripts/watch-manifest-drift.test.mjs scripts/check-sweep.test.mjs scripts/lib/watch-manifest.test.mjs scripts/reverify-signals.test.mjs scripts/supabase-metrics-scrape.test.mjs scripts/tripwire-scan.test.mjs` → "tests 75 · pass 75 · fail 0").
- nightly-chain-dispatch: 40 of 43 nights fired at 04:23:0x-04:23:5x UTC (E2); the `repository_dispatch` run started within one minute of the Vercel slot every night checked (e.g. 36217671353 created 04:23:10Z).
- daily-rebuild: the resilient build does what it says — BR marks cre-swfl/macro-us/macro-florida `failureClass: deterministic` and master `HOLD`, prior master still served; 35 fresh packs skip; the ingest-aware trigger rebuilt macro-swfl, city-pulse-swfl and freshness-pulse on 09/26 (L1). Python gate tests: `ingest/.venv/Scripts/python.exe -m pytest -q` over `test_assert_landed.py test_check_data_quality.py test_check_freshness.py test_check_freshness_sla.py test_doctor.py test_generate_data_targets.py test_rebuild_due.py` → "134 passed". `refinery/lib/master-freeze-watchdog.test.mts` in the bun run below.
- narrative-bake: the validator/store code is tested — `bun test lib/narratives lib/project/change-detection.test.ts refinery/lib/master-freeze-watchdog.test.mts refinery/packs/home-values-swfl.test.mts refinery/packs/investor-zip-swfl.test.mts scripts/bake-exit.test.mts` plus the 4 parity files → "131 pass · 0 fail … 17 files". Last real bake: chain run 31769734772 (08/14) bake=success (E2).
- freshness-probe-daily: `check_freshness`, `check_data_quality` and `probe_source_liveness` steps all `success` on 36259690113 (`gh run view 36259690113 --json jobs`); only the doctor step is `failure`.
- tripwire-hourly: 12 green checks per run; tests in the node run above.
- supabase-metrics-scrape: E1 15 of 15 success (09/23 23:46 → 09/26 17:16). Newest green 36258424777. Re-run by the second Opus at ~20:00Z: still 15 of 15 success, window 09/24 05:02 → 09/26 19:56, newest green 36267780789 (drift).
- gate-a-parity: last chained success 31769734772 (08/14, E2). Own E1 list shows 14 of 15 success, but those are its retired standalone schedule (06/28-07/12), not current health.
- data-targets-daily: E1 15 of 15 success, newest 36260743743 (09/26). Tests in the 134-pass pytest run.
- reverify-signals-daily: E1 10 success / 2 failure / 3 cancelled; newest green 36180242986 (09/25). Every run evaluated all 62 signals.
- view-vintages-monthly: E1 4 of 4 success (06/26, 07/26, 08/26, 09/26); newest 36256815254.
- project-feed-change-detection-daily: E1 13 success / 2 failure; newest green 36244690158 (09/26). `lib/project/change-detection.test.ts` in the bun run.
- home-values-investor-monthly: E1 green 35488759008 (09/20 dispatch) and 36040248364 (09/24 schedule) — the push fix from Task B5 of `docs/superpowers/plans/2026-09-15-master-brain-backend-week.md:573` holds (checkout now uses `secrets.REBUILD_PAT`, `home-values-investor-monthly.yml:38`). Both packs skip both agents (loop over `refinery/packs/*.mts` for packs lacking `skipTriageAgent: true` or `skipSynthesisAgent: true` returns only cre-swfl, macro-florida, macro-us).

## 4. Problems

P1. Master brain HOLD every night — three critical upstreams die on the credit wall.
- Symptom (L1): `[refinery] BUILD FAILED — pack=cre-swfl status=missing failureClass=deterministic`, same for macro-us and macro-florida, each with `error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. …"}}`, then `[cli] HOLD: one or more critical upstreams have an expired last-good. Master not rebuilt.`
- Root cause: `refinery/packs/master.mts:290-293,296` marks cre-swfl, macro-us, macro-florida, macro-swfl, env-swfl `critical: true`. The model calls: `refinery/stages/2-triage.mts:40-45` calls the Haiku triage agent unless `pack.skipTriageAgent`; `refinery/stages/3-synthesis.mts:26-28` calls the Sonnet synthesis agent unless `pack.skipSynthesisAgent`. macro-us (`refinery/packs/macro-us.mts:225-227`) and macro-florida (`refinery/packs/macro-florida.mts:406-408`) already skip synthesis, have `fitScore: () => 8`, `compositeCutoff: 0`, and their own triageContext says "the pack is pure deterministic aggregation" (`macro-us.mts:239-240`). Their triage call can drop nothing and composite does not reach the served brain (`grep -c "composite\|content_score" brains/macro-us.md brains/macro-florida.md` → 0 and 0). cre-swfl (`refinery/packs/cre-swfl.mts:2150-2175`) uses both agents; its synthesis writes the qualitative corridor prose.
- Last-good window: `refinery/lib/resilient-build.mts:12-14` = min(14, max(2, 1 × ttl_days)). cre-swfl ttl 604800 s = 7 days (`cre-swfl.mts:2136`), so a cre-swfl build must land at least every 7 days or master holds again.
- Severity: blocks a served number (master is the synthesized call, 43 days stale; `public.predictions` newest master row 08/14/2026 per Q `select brain_id, max(refined_at) from public.predictions group by 1`).
- First seen: rebuild first ran red on this cause 09/15/2026 (35037327866, E2). Before that it was hidden behind the row gate.
- Per-run precision (second Opus: `gh run view <id> --log-failed` on all 23 rebuild-failure runs, grep `HOLD:` and `BUILD FAILED … failureClass=`): `HOLD` in 23 of 23. macro-us and macro-florida `failureClass=deterministic` in 23 of 23. cre-swfl `deterministic` in 19 of 23 and `transient` in 4 (35560773347, 35586524271, 35686679297, 35709915342 — the 09/21-09/22 REST outage nights, when news-swfl, permits-swfl, rentals-swfl and others also degraded). The first run 35037327866 additionally failed env-swfl (critical, `deterministic`); env-swfl has not failed since. active-rentals-swfl `missing … failureClass=transient` in 23 of 23 (non-critical). So "every night" holds for macro-us and macro-florida; cre-swfl died on the model call 19 of 23 nights and on the outage the other 4.
- Also in the same runs: `active-rentals-swfl … rental_listing_stats fetch failed — canceling statement due to statement timeout` (L1). Non-critical, not this family's table (family 01). Noted, not planned here.

P2. The row gate is red on a parked pipeline.
- Symptom (L1): `listing_lifecycle — STALE — last landed 2026-08-14`; the lifecycle legs log `LISTING_LIFECYCLE_BASE_URL is not set` then `[fatal] every county returned 0 rows`.
- Root cause: `ingest/cadence_registry.yaml:2076` keeps `nightly: true` on listing_lifecycle; `ingest/scripts/assert_landed.py:59-63` gates on every `nightly: true` entry. `nightly-chain.yml:123-138` still calls the lifecycle leg x3. Listings are parked by his word (brief rule 6); the empty secret is open check `listing_base_url_secret_empty`.
- Severity: blocks a consumer (the row gate is the chain's data check and it hides every other red; the run conclusion is also red for a second reason, P17).
- First seen: 08/15/2026 (31864313308 is the first red; 31769734772 on 08/14 is the last full green, E2). Correction: the brief's "~08/25" and `wiki/pipeline-census.md:38` "back to 08/25" — 08/15 verified, 08/25 needs review (it was the edge of the 40-run window checked then).
- Correction: city_pulse no longer reds the gate (L1: LANDED 100 >= 50). The brief and `wiki/pipeline-census.md:43` name city pulse as a gate cause; L1 verifies it is not, needs review in those docs. The pulse distill still 400s inside the leg (L1 `-> ERROR (distill): BadRequestError(… credit balance is too low …)`); that leg belongs to the city-pulse family, and it still fails the chain's run (P17).

P3. The chain runs twice every night.
- Symptom (E2): 43 `schedule` runs since 08/15 executed the full chain (gate not skipped). 3 were real backstops (08/29-08/31, no dispatch that night); 40 were duplicates of a dispatch run from the same night.
- Root cause: `nightly-chain.yml:94-96` dedups only when a dispatch run finished with `conclusion=="success"`. Every dispatch run has been `failure` since 08/15, so the guard never matches and the 09:2x schedule fire reruns everything, including 3 lifecycle legs and another round of 400s.
- Severity: cosmetic for data, but doubles every red: 2 incident events per night.
- First seen: 08/15/2026 (32100927170-style pairs every night, E2).

P4. Parity and bake never run: they need a green rebuild.
- Symptom (E2): `verify` (parity) skipped 84 of 84 runs since 08/15; `bake` skipped 84 of 84.
- Root cause: `nightly-chain.yml:211-215` and `:245-249` use `needs: [rebuild]` with no `always()`. Parity does not read brains; it diffs lake views against pack code (`refinery/packs/zhvi-zip-latest-gate-a-parity.test.mts:11-20`), so gating it on rebuild is wrong. Bake does need fresh brains, and it is also an LLM leg that would 400 (P7).
- Severity: parity blocks nothing served but the monthly zhvi/zori cutover guard has been blind for 43 days; bake → stale narratives served on `/r/*` (P7).
- First seen: 08/15/2026.

P5. The heartbeat is a false green.
- Symptom: `daily-rebuild.yml:270-274`, `freshness-probe-daily.yml:88-92`, `data-targets-daily.yml:41-45`, `project-feed-change-detection-daily.yml:48-52` all ping `https://hc-ping.com/<key>/<slug>?create=1` under `if: always()`. L1 shows `OK` from the rebuild's ping on a failed run.
- Root cause: per Healthchecks.io's own docs (crawl4ai of https://healthchecks.io/docs/http_api/ this session): `https://hc-ping.com/<ping-key>/<slug>` is the SUCCESS signal; failure is `/<slug>/fail` or `/<slug>/<exit-status>`. So the dead-man switch can see "did not run" but never "ran red".
- Severity: blocks a consumer (the operator's alerting).
- First seen: could-not-verify the date the pings were added (not dug in git history).

P6. freshness-probe-daily is permanently red.
- Symptom: `gh run list --workflow freshness-probe-daily.yml --limit 100` → 85 failure, 13 success, 1 cancelled, 1 skipped; newest success 07/11/2026 14:53Z. Only the doctor step fails (36259690113).
- Root cause: `ingest/scripts/doctor.py:737` fails the run on any red line (`payload["counts"]["red"] > 0`). The 3 reds are owned by other families (listings, swfl_inc) and are known; the doctor has no parked or known-red concept (`grep parked ingest/scripts/doctor.py` → nothing, while `ingest/scripts/landed_watch.py:20` and `assert_landed.py:62` do honor parking). `_RESEARCH/INDEX.md:250-251` already named this: "the daily doctor-run doesn't distinguish NEW red from already-known/checked red."
- Severity: blocks a consumer (a gate that is always red is no gate). Issue #110 has 76 comments (`gh issue view 110 --json comments`).
- First seen: 07/12/2026 (issue #110 created that day; newest green 07/11).

P7. narrative-bake is an LLM leg on the credit wall, parked by circumstance.
- Symptom: narratives newest `baked_at` 08/14/2026 (Q). `narrative-bake.yml:93` passes `ANTHROPIC_API_KEY`; `scripts/bake-narratives.mts:365-369` calls `client.messages.batches.create` with `SYNTHESIS_MODEL`. Open check `llm_legs_parked_credit_wall` already lists it.
- Root cause: P4 keeps it from running; if it ran, it would hit the same 400 as P1.
- Severity: blocks a served surface (stale narratives on 6 consumer files listed in section 1; the brains they describe have moved since — macro-swfl rebuilt 09/26).
- First seen: last bake 08/14/2026 (E2 + Q).

P8. tripwire is red on a stale dark-list.
- Symptom (run 36257936782): `RED PULSE ACTIVE — 'DBPR SIRS Submissions — Monthly SWFL' (dbpr-sirs-monthly.yml) is ENABLED. TEMPORARILY DARK 07/18/2026: needs the offline self-hosted swfl-local runner (0 registered)` and the same for `ingest-crexi-listings.yml`.
- Root cause: `scripts/lib/watch-manifest.mjs:26-29` still lists both as should-be-dark. The runner is live: `gh api repos/ethanrickyjrjr-wq/SWFL-Data-Gulf/actions/runners` → `fedora-swfl-local online self-hosted,Linux,X64,swfl-local`; `SWFL_LOCAL_RUNNER_READY=true` set 09/20/2026 06:06Z (`gh variable list`).
- Severity: blocks a consumer (the spend tripwire is the one alarm for unauthorized paid runs; red every day = blind). `gh run list --workflow tripwire-hourly.yml --limit 60` → 51 failure, 9 success; newest success 08/06/2026. Issue #119: 64 comments.
- First seen: the same two REDs are in run 34704788695 (09/12); earlier reds not classified (could-not-verify before 09/12).
- Cosmetic: the job is named "hourly" but fires once a day (`tripwire-hourly.yml:13`, `"17 13 * * *"`).

P9. reverify-signals hangs after it finishes.
- Symptom: runs 36263488364 (09/26), 35460426750 (09/19), 34889806974 (09/14) all print `reverify-signals: 0/62 regressed, 0/62 signal-broken` within ~40 s (e.g. 09/26 18:43:06Z), then sit until `##[error]The operation was canceled.` at the 10-min ceiling (09/26 18:52:43Z). Green runs idle too: 36180242986 printed its summary at 19:32:45Z and the next step started 19:37:59Z.
- Root cause: the process does not exit after `main()` resolves — `scripts/reverify-signals.mjs:135` and `:151` set `process.exitCode` instead of exiting, and something keeps the event loop alive. Candidate (needs review): `scripts/lib/check-signals.mjs:33` `httpOk` never consumes or cancels the response body and no fetch has a timeout. The downstream `ceilings-to-checks` and `check-sweep` steps are skipped on a cancel.
- Severity: blocks a consumer (auto-close step skipped; issue #221 TIMEOUT opened 09/26).
- First seen: 09/14/2026 (34889806974, E1).

P10. reverify's ceilings step has never worked on CI.
- Symptom (36180242986): `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'yaml' imported from …` under "Surface recorded source ceilings as checks".
- Root cause: `reverify-signals-daily.yml:42-47` does checkout + setup-node only, no dependency install; the step is `continue-on-error: true` (`:74`), so it fails silently every run.
- Severity: cosmetic today (the step's output is ops-only), but it is a dead seam.
- First seen: could-not-verify the first run; present in the 09/25 green run.

P11. check-sweep auto-closes nothing.
- Symptom (36180242986): `check-sweep: 0 OPEN check(s) carry a live signal`.
- Root cause: none of the 21 open checks carries a `signal` (Q: 62 closed checks with a signal; open with signal = 0 per the sweep line). The auto-close seam exists and is idle.
- Severity: cosmetic, but it is why every alarm in this family becomes an issue instead of a self-closing check.

P12. Metrics scrape samples 2-7 times a day against an hourly cron.
- Symptom: Q scrapes per day above (2 on 09/21 and 09/22; 09/18 is a partial day at the window's edge).
- Root cause: GitHub schedule drops/queues `23 * * * *` fires (same phenomenon measured for the chain at `nightly-chain.yml:20-23`).
- Severity: cosmetic (ops /db-health reads a coarser series than it implies).

P13. project-feed red on 09/21 and 09/22.
- Symptom: `FATAL: projects query failed — Could not query the database for the schema cache. Retrying.` (35617620735 and 35734314551 `--log-failed`).
- Root cause: the PostgREST outage (PGRST002 shape) the brief records for 09/21, not this job.
- Severity: cosmetic; the next run was green (35869394942 09/23).

P14. home-values-investor-monthly older reds.
- 32740460406 (08/24) and 30105264488 (07/24): `! [remote rejected] main -> main (push declined due to repository rule violations)`. Fixed since (section 3). 28113292035 (06/24): `--log-failed` returned nothing — could-not-verify.

P15. Stale incident issues on this family: #111 `[cron-failure:daily-rebuild] SCHEMA_DRIFT` (07/12/2026, the orphan-concept cause is long fixed), #178 `[cron-failure:nightly-chain] DATA_EMPTY` (08/15/2026, 0 comments — the class is now wrong: the chain fails on HOLD, not empty data). Newest-red classes per the filer's own titles: nightly-chain DATA_EMPTY (#178), freshness-probe UNKNOWN (#110), reverify TIMEOUT (#221). The rebuild's own line is `CRON-DIAG failureClass=deterministic reason=400 …credit balance is too low…` (L1).

P16. The 09/15 plan's fallback is unsafe. `docs/superpowers/plans/2026-09-15-master-brain-backend-week.md:65` offers "remove `ANTHROPIC_API_KEY` from `daily-rebuild.yml` → mock mode". In mock mode `refinery/agents/synthesis-agent.mts:79-86` returns facts reading `Mock synthesized reference fact for fragment <id>` — that would ship into the served cre-swfl brain. Rejected in this plan.

P17. The city-pulse job reds the chain every night (cross-family).
- Symptom: loop over all 86 E2 run ids with `gh api repos/:owner/:repo/actions/runs/<id>/jobs --jq '[.jobs[]|select(.name|test("city pulse"))|.conclusion]'` → 48 success (08/14-09/08), 1 skipped (the 08/14 guard skip), 37 failure — every run from 09/09 through 09/26. L1 shows the cause: `-> ERROR (distill): BadRequestError("Error code: 400 - {… 'Your credit balance is too low …'}")` while the raw rows still land (row gate: city_pulse LANDED 100).
- Root cause: `nightly-chain.yml:140-145` calls `city-pulse-daily.yml`; a failed called job makes the whole Nightly Chain run `failure` no matter what the row gate, rebuild or parity do. The distill leg is owned by the city-pulse family.
- Severity: blocks a consumer — `grade-predictions.yml` fires only on a `success` Nightly Chain run, and the incident filer reopens `cron_incident_nightly_chain` on every red run. It does not block master (the rebuild runs under `always()`).
- First seen: 09/09/2026 (first failure in the loop above; E2 run pair of that night).
- This plan does not fix it. Dependency named for the city-pulse family: make the distill failure non-fatal to the job when raw rows landed, or re-route the distill to a permitted lane. Until then items 2-4 turn the gate, rebuild and parity green but the chain's run conclusion stays red. (Second Opus: `docs/audit/2026-09-26-pipeline-plans/13-pulse-news.md:3` picks this up — family 13 moves both pulse distill legs to Lane M on the Fedora box, which removes the 400. It does not propose a non-fatal distill, so the chain stays red until that Lane M move lands.)

P18. The Vercel dispatch clock missed three nights (nightly-chain-dispatch).
- Symptom (E2, re-run by the second Opus: per-day `repository_dispatch` presence over the 86 runs): no dispatch run on 08/29, 08/30, 08/31; every other night 08/14-09/26 has one.
- Root cause: could-not-verify. `git log --since=2026-08-27 --until=2026-09-01 -- vercel.json app/api/cron/nightly-chain-dispatch/` returns no commit, so no code change explains it; the Vercel cron invocation logs for those nights were not read.
- Severity: cosmetic today (the 09:2x schedule backstop ran all three nights, E2), but nothing alerted.
- First seen: 08/29/2026.

P19. No problems found for data-targets-daily and view-vintages-monthly.
- data-targets-daily, checked: `gh run list --workflow data-targets-daily.yml --limit 15` → 15 of 15 success (09/12 → 09/26); Q `select count(*), max(updated_at), min(updated_at) from public.data_targets` → 13 rows, all 09/26/2026 17:56Z; `pytest -q ingest/tests/scripts/test_generate_data_targets.py` inside the 134-pass run.
- view-vintages-monthly, checked: `gh run list --workflow view-vintages-monthly.yml --limit 15` → 4 of 4 success (06/26, 07/26, 08/26, 09/26); Q on `data_lake.view_vintages` → zhvi_pivoted 3,819 rows, zori_pivoted 1,654 rows, 4 distinct `as_of` each, newest `captured_at` 09/26/2026 16:50Z. The only gap is a missing test (section 5), not a fault.

## 5. What is missing

- vs the consumer (master): a cre-swfl build path that does not need an unattended API-key call. Nothing today (P1).
- vs the consumer (`/r/*` narratives): any bake since 08/14 (P7).
- vs data-roots / inventory: `grep -niE "view_vintages|narratives|supabase_db_metrics|data_targets|project_feed" docs/standards/data-roots.md docs/standards/data-inventory.md` → no hits. `data_lake.view_vintages` is a lake table with no data-roots line (it is coverage_exempt in the registry at `:2595`, which is not the same thing).
- Tests that do not exist: `ingest/scripts/capture_view_vintages.py` (no test file in `git ls-files | grep test`), `app/api/cron/nightly-chain-dispatch/route.ts` (none), `ingest/scripts/probe_source_liveness.py` (none), `refinery/packs/macro-us.mts` (no `macro-us.test.mts`; macro-florida has one).
- The 4 gate-a parity files register as inert `describe.skip` without `RUN_DB_PARITY` (`gate-a-parity.yml:3-7`), so the local 131-pass bun run above does not exercise them; only the chain does, and the chain has not run them since 08/14.
- A dispatch-clock signal: nothing alerts when the Vercel route misses (08/29-08/31 went unnoticed except by the backstop).
- The warm leg: `vars.CHAIN_GRAPHIFY_ENABLED` is unset (`gh variable list` shows only BAKE_CADENCE, ENGINE_ENABLED, SWFL_LOCAL_RUNNER_READY among the chain's vars), so `nightly-chain.yml:238-243` never runs. The YAML itself calls flipping it an operator call (`:229-230`); graphify-republish is family 18's, so no item here.
- The Max-seat research the 09/15 plan cites (`_RESEARCH/agent-behavior/2026-09-15-max-subscription-vs-api-key-for-pipeline-calls-evaluation.md`) is not on disk: `ls _RESEARCH/agent-behavior/ | wc -l` shows 18 files (second-Opus correction: the first draft said 5), none of them it, and `ls _RESEARCH/agent-behavior/ | grep -i "max\|subscription"` returns nothing; `find _RESEARCH -iname "*max-sub*"` → nothing; `rg --no-ignore -il "max-subscription|CLAUDE_CODE_OAUTH_TOKEN" _RESEARCH/` → nothing. The operator's decision stands without it (brief rule 3); the Lane M items below verify the CLI live instead.

## 6. Verdict per pipeline

- nightly-chain — REPAIR. Red 84 of 84 runs since 08/15 on a parked leg plus a double-run bug; all fixes in this family are YAML/registry. Number that changes it: gate conclusion `success` on 3 consecutive dispatch nights. The run's overall conclusion stays red until the city-pulse job stops failing (P17, 37 of 37 since 09/09) — that part is not this family's to fix.
- nightly-chain-dispatch — GOOD ENOUGH. Fired 40 of 43 nights; the 3 misses (P18) were caught by the backstop but alerted nobody, which the section 8 ping fixes. Number: more than 1 missed night in any 30.
- daily-rebuild — REPAIR. Master held 23 of 23 runs since 09/15 23:48; 2 of 3 dead critical upstreams are a two-line fix. Number: master `refined_at` age (43 days on 09/26).
- narrative-bake — PARK (now), then re-route to Lane M. LLM leg; newest bake 08/14. Number: `max(baked_at)` in `public.narratives` within 8 days once the Max route lands.
- freshness-probe-daily — REPAIR. Red 85 of 100; gates on other families' known reds and its heartbeat lies. Number: runs red only on a NEW red for 7 straight days.
- tripwire-hourly — REPAIR. Red 51 of 60 on a stale dark-list. Number: zero RED lines on a day with no paid dispatch.
- supabase-metrics-scrape — GOOD ENOUGH. 15 of 15 green, 9 metrics landing. Number: fewer than 2 scrapes on 3 consecutive days.
- gate-a-parity — REPAIR (wiring only). Test code is fine; skipped 84 of 84 chain runs. Number: one chained parity `success`.
- data-targets-daily — GOOD ENOUGH. 15 of 15 green, 13 rows refreshed today. Number: `max(updated_at)` older than 2 days.
- reverify-signals-daily — REPAIR. Evaluates 62 of 62 signals correctly but hangs ~5-10 min every run (3 cancels in 15) and its ceilings step is dead. Number: 15 consecutive runs under 3 minutes.
- view-vintages-monthly — GOOD ENOUGH. 4 of 4 monthly captures, both views. Number: a missed 26th.
- project-feed-change-detection-daily — GOOD ENOUGH. 13 of 15 green; both reds were the 09/21-22 PostgREST outage. Number: a red on a day the REST layer is up.
- home-values-investor-monthly — GOOD ENOUGH. Green 09/20 and 09/24 after the push fix. Number: a red on the 10/24 run.

## 7. The plan

Ordered. Every item is DO unless marked ASK-FIRST. Lanes per the brief: D deterministic, M Max plan, C Codex, L local.

1. Make macro-us and macro-florida deterministic. What: add `skipTriageAgent: true` beside `skipSynthesisAgent: true` at `refinery/packs/macro-us.mts:227` and `refinery/packs/macro-florida.mts:408`; add `refinery/packs/macro-us.test.mts` asserting both skip flags (macro-florida's test gets the same assertion). Lane D. Effort S. Proof: `bun test refinery/packs/macro-us.test.mts refinery/packs/macro-florida.test.mts refinery/packs/critical-set.test.mts`, then after the next chain run `git show origin/main:brains/_build-report.json` shows macro-us and macro-florida `status: built` and `git show origin/main:brains/macro-us.md | grep -m1 refined_at` is that night. Unblocks: 2 of the 3 dead critical upstreams; macro-swfl stops building against a stale macro-florida input (`refinery/packs/macro-swfl.mts:182` reads macro-florida via `brainInputFrom`). Evidence the empty-classification path is safe (second Opus): `refinery/stages/2-triage.mts:40-41` returns an empty Map when `skipTriageAgent` is set, and a scan of every non-test `refinery/packs/*.mts` for packs missing either flag returns only cre-swfl, macro-florida, macro-us and `catalog.mts` (a type catalog, not a pack) — master (`master.mts:396-397`) and the 35 skipped-fresh packs already build in production with both flags.

2. Gate the parked listing leg out of the chain. What: `nightly-chain.yml:123-126` add `&& vars.LISTINGS_NIGHTLY_ENABLED == 'true'` to the lifecycle job's `if:` (unset = off, no variable to create); set `nightly: false` and add `parked: true` at `ingest/cadence_registry.yaml:2076` with a one-line comment pointing at `listing_base_url_secret_empty` (`parked` is needed for item 8: the doctor matches checks to tables only by the prefixes `quality_fail_`, `schema_drift_`, `contract_fail_` at `ingest/scripts/doctor.py:312-319`, so that check never attaches to the listing_lifecycle line). Cross-family: family 01 owns listing_lifecycle — coordinate so their plan does not flip it back. Lane D. Effort S. Proof: `ingest/.venv/Scripts/python.exe -m pytest -q ingest/tests/scripts/test_assert_landed.py` green, then `gh run view <next dispatch id> --json jobs --jq '.jobs[]|"\(.name) \(.conclusion)"'` shows lifecycle `skipped` and `gate · assert_landed success`. Unblocks: a meaningful row gate. It does not unblock grade-predictions: that fires only on a `success` chain run, which still waits on P17.

3. Stop the double run. What: `nightly-chain.yml:94-96` change the test from "a dispatch run today with `conclusion=="success"`" to "a repository_dispatch or workflow_dispatch run created today whose `gate · assert_landed` job has a conclusion" (one `gh run view <id> --json jobs` on the newest such run). That means the chain actually executed that night: a red dispatch run that got as far as the gate is a night already done, while a dispatch run that died before the gate (runner loss, checkout failure) still lets the backstop run, which is its whole job. Keep fail-open on API error (`:99-105`). Lane D. Effort S. Proof: next morning `gh run view <09:2x schedule id> --json jobs` shows guard success and every other job skipped. Unblocks: halves this family's incident events; 40 of 43 schedule executions since 08/15 were duplicates.

4. Decouple parity; park bake explicitly. What: `nightly-chain.yml:245-249` parity → `needs: [guard, rebuild]`, `if: always() && needs.guard.outputs.should_run == 'true' && inputs.dry_run != true`. Park bake INSIDE `.github/workflows/narrative-bake.yml`, not only on the chain's calling job: the file still has a live `workflow_run` trigger on "Daily Brain Rebuild" plus `workflow_dispatch` (`narrative-bake.yml:14-16,29`), and its own header says that trigger still fires after a manual daily-rebuild dispatch (`:22-25`). So AND `vars.NARRATIVE_BAKE_LANE == 'max'` (unset = parked) into the existing job `if:` at `narrative-bake.yml:63`; every entry point then respects it. The chain-side `if:` at `nightly-chain.yml:211-215` may stay as a belt. (Second-Opus correction: the first draft parked only the chain job, which left the standalone path able to walk into the 400.) Registry `ingest/cadence_registry.yaml:2676` add `status: parked` to narrative-bake with the reason. Lane D. Effort S. Proof: next chain run shows `verify · gate-a parity success` and `bake · narratives skipped`. Unblocks: 43 days of blind parity; chain legs that can go green while bake is parked (the run's overall conclusion still waits on P17).

5. cre-swfl — ASK-FIRST (question 1). Option A, Lane M: a weekly job on the Fedora runner (`runs-on: [self-hosted, swfl-local]`, job `if: vars.SWFL_LOCAL_RUNNER_READY == 'true'`; the same variable `ingest-collier-official-records.yml:31` reads, but as a skip rather than its `ubuntu-latest` fallback, because a hosted runner has no Max login) runs `claude -p` (verified on the box this session: `claude --version` → 2.1.271, `claude --help` lists `-p/--print`, `--output-format`, `--model`, `--bare`) with cre-swfl's existing synthesis prompt and writes the facts to a committed file; `refinery/packs/cre-swfl.mts` sets both skip flags and reads that file as its qualitative facts (the baked-prose-first rule), so the nightly build is deterministic and the 7-day last-good window (`resilient-build.mts:12-14`) never trips. The baked file carries its own as-of date and the pack passes it through, so the existing stale caveat fires when the prose ages past its cadence — a nightly `refined_at` must never stamp fresh over prose that stopped being baked. Effort L. Option B, Lane D: set both skip flags and serve the deterministic corpusSummary + outputProducer only, losing the corridor prose. Effort S. Both proofs: BR shows cre-swfl `built` and master `built`; `git show origin/main:brains/master.md | grep -m1 refined_at` is that night. Unblocks: the master brain. Never mock mode (P16).

6. Route narrative-bake to Lane M. What: add a Max adapter to `scripts/bake-narratives.mts` — for each delta-changed key, build the prompt with the existing `buildNarrativePrompt`, call `claude -p --output-format json` on the Fedora runner, run the existing `validateNarrative`, store with the existing `upsertNarrative`; keep the delta gate and a per-run key cap in place of the dollar cap. Workflow job `runs-on: [self-hosted, swfl-local]`, `if: vars.NARRATIVE_BAKE_LANE == 'max' && vars.SWFL_LOCAL_RUNNER_READY == 'true'` (second-Opus correction: the first draft omitted the runner gate), ANDed with the existing `workflow_run` success condition at `narrative-bake.yml:63`. Flags re-verified against the live Claude Code CLI docs (crawl4ai) before build. The runner already has `~/.claude/.credentials.json` (present; validity not verified this session) — the operator's standing decision (brief rule 3) makes this lane legitimate; if the box login is not his Max seat, he mints `claude setup-token` into a repo secret (one command, his credential). Lane M. Effort L. Proof: `bun test lib/narratives scripts/bake-exit.test.mts` green; Q `select surface, max(baked_at) from public.narratives group by 1` shows the run's date. Unblocks: `/r/*` narratives and the review-reply recipe.

7. Fix the heartbeat. What: at `daily-rebuild.yml:273-274`, `freshness-probe-daily.yml:91-92`, `data-targets-daily.yml:44-45`, `project-feed-change-detection-daily.yml:51-52` insert `${{ job.status != 'success' && '/fail' || '' }}` right after the slug and before `?create=1`, i.e. `…/<slug>/fail?create=1` on a red run (docs verified this session: `/<slug>/fail`). Land after item 8 so the probe's first real fail ping is a real one. Lane D. Effort S. Proof: the next red run's log shows the curl to `…/<slug>/fail` returning `OK`. Unblocks: a dead-man switch that can see red.

8. Doctor gate = new red only. What: `ingest/scripts/doctor.py:737` count a red line toward `--fail-on red` only if it has no open check (`line["open_checks"]`, already joined at `:400,:425`) and its registry entry is not `parked: true` (the field already exists on not_yet_running entries, `ingest/cadence_registry.yaml:2353,2384,2431,2467`); the report still prints all reds. Test first in `ingest/tests/scripts/test_doctor.py` ("known red does not gate", "parked red does not gate", "new red gates"). Lane D. Effort M. Proof: `ingest/.venv/Scripts/python.exe -m pytest -q ingest/tests/scripts/test_doctor.py` green; `python -m ingest.scripts.doctor --fail-on red` exits 0 when every red carries a check. Unblocks: freshness-probe red means something. Families 01 and the swfl_inc owner either park their entries or open a check — until then their reds still gate, which is correct. Coordination (second Opus): `00-FAMILIES.md` lists "the doctor" as a family-19 seam, so this edit is proposed here and must match family 19's plan; open check `doctor_cannot_see_billing_wall` (doctor cannot classify BILLING because `gh_runs` carries no log text) is on the same file and belongs to family 19 — item 8 does not touch it. Family 01 (`01-listings-lifecycle.md:12`) plans `dispatch_only: true` and disabling the workflow at the API (`:283`) for the same entry, while item 2 here adds `parked: true`; the two families agree on pulling the legs from the chain and must agree on one registry field before either lands.

9. Clear the tripwire's stale dark-list. What: delete the two entries at `scripts/lib/watch-manifest.mjs:26-29` (not a guard file — the guard list is `scripts/tripwire-scan.mjs:317`: `.claude/hooks`, `scripts/paid-run.mjs`, `scripts/safe-push.mjs`, `ingest/lib/api_usage.py`, `refinery/agents/anthropic.mts`), regenerate with `node scripts/build-watch-lists.mjs --write --with-state` (the command named at `scripts/tripwire-scan.mjs:53`). Lane D. Effort S. Proof: `node --test scripts/lib/watch-manifest.test.mjs .github/scripts/watch-manifest-drift.test.mjs scripts/tripwire-scan.test.mjs` green; next run prints `0 RED`. Unblocks: the paid-activity alarm.

10. Make reverify exit. What: `scripts/reverify-signals.mjs:147-152` → `main({ dryRun }).then(() => process.exit(process.exitCode ?? 0), (e) => { console.error(e); process.exit(1); })`; `scripts/lib/check-signals.mjs:33` (and the two other fetch sites at `:49-58`, `:145-162`) pass `signal: AbortSignal.timeout(30_000)` and cancel an unread body. Add the repo's install action before the ceilings step at `reverify-signals-daily.yml:73` (`uses: ./.github/actions/bun-install`, as `gate-a-parity.yml:42-43` does). Lane D. Effort S. Proof: `node --test scripts/reverify-signals.test.mjs scripts/lib/check-signals.test.mjs` green; next run's `gh run list --workflow reverify-signals-daily.yml --limit 1` duration under 3 minutes and no `ERR_MODULE_NOT_FOUND` in its log. Unblocks: check-sweep runs every day (it is the auto-close seam section 8 depends on).

11. Give check-signals' `db_fresh` an optional `filter`. What: `scripts/lib/check-signals.mjs:103-117` append `&${filter}` when present (same shape `dbRowExists` already uses at `:82-89`); one test. Lane D. Effort S. Proof: `node --test scripts/lib/check-signals.test.mjs`. Unblocks: the master-age signal in section 8.

12. Close stale issues this family owns once items 2-3 land green: #111 (07/12 SCHEMA_DRIFT) now; #178 only when a chain run concludes `success`, which needs P17 fixed by the city-pulse family first (the filer auto-closes on green, `.github/scripts/log-cron-incident.mjs:135-141`; until then #178's DATA_EMPTY class is stale but the incident is real). Lane D. Effort S. Proof: `gh issue view 111 --json state`.

13. Catalog + tests that are missing. What: a `data_lake.view_vintages` line in `docs/standards/data-roots.md` (point-in-time capture, not a served number); a small test for `ingest/scripts/capture_view_vintages.py` (dry-run writes nothing); a route test for `app/api/cron/nightly-chain-dispatch/route.ts` (401 without the secret, 502 on non-204). Lane D. Effort S. Proof: the new tests pass. Unblocks: nothing served; closes section 5 gaps.

14. Second reviewer. What: run Codex over the diffs of items 1-4 and 8 before push (`codex --help` verified on the Windows box before naming any flag). Lane C. Effort S. Proof: the review text pasted into the session log. Unblocks: a second vendor's eyes on the chain edits.

15. Open the section 8 signal-bearing checks (added by the second Opus: no item in the first draft actually created them). What: after items 10 and 11 land, one `node scripts/check.mjs open brain-platform <key> "<label>" --signal '<json>'` per check named in section 8 (`master_brain_fresh`, `db_metrics_scrape_fresh`, `data_targets_fresh`, `view_vintages_fresh`, `home_values_brain_fresh`; `narratives_fresh` only when item 6 lands). `--signal` is parsed and type-checked at the CLI boundary (`scripts/check.mjs:177-190`, stored at `:260`). This is the only work for the GOOD ENOUGH pipelines supabase-metrics-scrape, data-targets-daily, view-vintages-monthly and home-values-investor-monthly: no code change. Lane D. Effort S. Proof: `node scripts/check.mjs list` shows each key with `[signal: db_fresh]`; the next reverify run's check-sweep line reads "N OPEN check(s) carry a live signal" with N ≥ 1 instead of 0. Unblocks: every section 8 signal that is a check row.

## 8. Checks and balances

Design rule applied: one signal per pipeline, fires only when a served number is wrong or a consumer reads stale, auto-closes on green, never an issue per run. The mechanism is the existing checks ledger: a check carrying a stored `signal` (`scripts/lib/check-signals.mjs:193-213`: `http_ok`, `http_body`, `http_body_absent`, `db_row_exists`, `db_fresh` and its alias `table_fresh`; `workflow_success` is recognized but always fails, "not enabled in phase 1", `:185-191` — second-Opus completion of the first draft's three-type list) is re-evaluated daily. `scripts/check-sweep.mjs` auto-closes an open check whose signal passes and `scripts/reverify-signals.mjs` reopens a closed one whose signal fails. That is one ledger row flipping state, visible in `node scripts/check.mjs list` and on ops. No `freshness_sla` or `expected_rows_min` can be added here: `jobs:` entries carry no freshness fields by contract (`ingest/cadence_registry.yaml:2624-2643`). Depends on plan items 10 and 11.

One signal each:
- nightly-chain + daily-rebuild (one served number, one signal): check `master_brain_fresh`, signal `{type: db_fresh, table: predictions, column: refined_at, filter: "brain_id=eq.master&prediction_kind=eq.synthesis", max_age_days: 2}` (second Opus added the `prediction_kind` term: master also has 3 `slug` rows, newest 06/30/2026, which must not stand in for a refine). `public.predictions` gets one `synthesis` row per successful master refine (`refinery/lib/predictions-log.mts:4`); it read 08/14/2026 today (Q), so this check opens red on day one and closes itself the night master refines.
- nightly-chain-dispatch: a Healthchecks ping from the chain's `guard` job, only when `github.event_name == 'repository_dispatch'` (one `curl … /<ping-key>/nightly-chain-dispatch?create=1` step, `if:` on the event). A missed Vercel fire means no ping, Healthchecks goes late on its own schedule, and it recovers on the next dispatch. No issue, no check row.
- narrative-bake: check `narratives_fresh`, signal `{type: db_fresh, table: narratives, column: baked_at, max_age_days: 8}`. Opened only when item 6 lands; while parked, `llm_legs_parked_credit_wall` already names it.
- freshness-probe-daily: ONE signal, the Healthchecks slug `freshness-probe-daily` with the `/fail` suffix from item 7. After item 8 the doctor step fails only on a NEW red, so a `/fail` ping means a new red and a plain ping means no new red. It is the signal for the 78 datasets and must not be double-signalled here. (Second-Opus correction: the first draft named "its gate plus the heartbeat", two signals.)
- tripwire-hourly: ONE signal, the open/closed state of the single standing issue #119, after item 9 (so it fires only on a real RED). Noise change: `tripwire-hourly.yml:47-58` comments on #119 only when the RED line set differs from the last comment (compare against the last comment body via `gh issue view 119 --json comments`); when a run is green and #119 is open, close it.
- supabase-metrics-scrape: check `db_metrics_scrape_fresh`, signal `{type: db_fresh, table: supabase_db_metrics, column: scraped_at, max_age_days: 1}`. A 1-day ceiling tolerates the measured 2-per-day floor (P12).
- gate-a-parity: its own Healthchecks ping inside `gate-a-parity.yml` (an `if: always()` curl to slug `gate-a-parity` with the `/fail` suffix from item 7). It cannot ride the chain's red: the chain is red every night on P17, so a parity failure would be invisible there.
- data-targets-daily: check `data_targets_fresh`, signal `{type: db_fresh, table: data_targets, column: updated_at, max_age_days: 2}`.
- reverify-signals-daily: it is the evaluator, so its own signal is the fixed Healthchecks ping (add the same `if: always()` curl with the `/fail` suffix from item 7; slug `reverify-signals-daily`). Noise change: `reverify-signals-daily.yml:114-129` exits red and comments #136 only for a BROKEN signal; a regression already reopened its check (`reverify-signals.mjs:118`), so the red run and the comment are the same news twice.
- view-vintages-monthly: check `view_vintages_fresh`, signal `{type: db_fresh, schema: data_lake, table: view_vintages, column: captured_at, max_age_days: 35}` (`dbFresh` sends `Accept-Profile` for a schema, `check-signals.mjs:108`; verify data_lake is exposed to PostgREST on the first evaluation — if it is not, the signal reports "query failed" and must move to an `http_body` on ops `/coverage`).
- project-feed-change-detection-daily: the fixed `/fail` heartbeat only. `project_feed` writes are legitimately zero most days (`scripts/project-feed/change-detection.mts:9-10`), so a freshness signal would false-fire; the registry already says so (`ingest/cadence_registry.yaml:2508-2516`).
- home-values-investor-monthly: check `home_values_brain_fresh`, signal `{type: db_fresh, table: metric_observations, column: captured_at, filter: "brain_id=eq.home-values-swfl", max_age_days: 35}` (needs item 11). `metric_observations` is written per brain build (`refinery/lib/metric-observations-log.mts:5`); Q `select brain_id, max(captured_at) from public.metric_observations … group by 1` → home-values-swfl 09/24/2026 18:18:20Z (213 rows), investor-zip-swfl 09/24/2026 18:18:21Z (90 rows), the same second as both brains' refined_at. The same query gives master 08/14/2026 04:30:22Z, which is a second way to read master's age if `predictions` ever stops being written.

Noise to delete:
- The per-run comment stream on issue #44 "Cron incident feed" — 2,500 comments (`gh issue view 44 --json comments`). This family contributes 2 chain events a night (P3) plus the daily probe, tripwire and reverify reds. Items 2, 3, 8, 9, 10 remove the causes; the filer itself belongs to family 19, which should stop commenting #44 for a workflow that already has an open incident issue.
- #110 (76 comments), #119 (64), #136 (28): stop the comment-per-run as above; close each on its first green.
- #111 (stale since 07/12/2026) and #178 (stale class): item 12.
- `cron_incident_freshness_probe_daily`: close once item 8 lands and the probe runs green (the probe's own gate supersedes it). `cron_incident_reverify_signals_daily`: closes after item 10's first green. `cron_incident_nightly_chain`: do NOT close — the filer reopens it on every red chain run (`.github/scripts/log-cron-incident.mjs`), and the chain stays red on P17; it closes itself on the first green run.
- Where Healthchecks alerts go (email, Slack, nowhere) was not verified this session; the heartbeat and ping signals above are only as good as that routing. The executing session reads the Healthchecks project's integrations before relying on them.
- The #44 stream is fed by `vars.CRON_INCIDENT_ISSUE_NUMBER=44` (`gh variable list`; read at `.github/scripts/log-cron-incident.mjs:50`, passed at `.github/workflows/log-cron-incident.yml:140,166`). The logger watches 8 of this family's 12 workflows by name: Nightly Chain, freshness probe, Supabase DB metrics scrape, Data Targets, Reverify, view_vintages, Project-feed, Home-Values + Investor. Daily Brain Rebuild, narrative-bake, Tripwire and GATE A are not watched (name match against the `workflows:` list in `log-cron-incident.yml`). Deleting or re-pointing that variable is family 19's call; this family's part is removing its own red causes.
- Label `cron-failure`: carried by #110, #111, #178, #221 (`gh issue view <n> --json labels`). Close each as its pipeline goes green (items 8, 12, 10).
- Open checks this family's evidence settles, owned elsewhere: `fedora_runner_not_registered_smoke_owed` says "GitHub reports zero self-hosted runners", but `gh api …/actions/runners` → `fedora-swfl-local online` and the brief lists smoke run 35493215223, so it is stale; family 19 closes it with that proof. `registry_source_ceiling_no_freshness_field` is surfaced by the `ceilings-to-checks` step that item 10 revives; it stays open (a real registry defect), not noise. `doctor_cannot_see_billing_wall` belongs to family 19 (item 8 note).
- Per-run issue writers left in this family (second Opus: `grep -nE "gh issue|log-cron-incident|heal-cron|classify-cron|issues: write"` over the 12 family YAMLs): only `tripwire-hourly.yml:18,53-57` and `reverify-signals-daily.yml:31,120-124`, each a comment on one standing issue (#119, #136), both de-duplicated above. No family workflow creates a new issue per run.
- Nothing new becomes a GitHub issue in this design.

## 9. Box placement

Reasons that count (brief): WAF or residential IP, job > 6 h, needs the SSD archive, needs a browser, needs a local model. Lane M's definition adds: an unattended `claude -p` runs on the Fedora runner under the Max login. On the box (probed read-only via `ssh fedora`): `claude` 2.1.271 at `~/.local/bin/claude`, `node` present, a `~/.claude/.credentials.json` present (validity unverified), no `bun`, no `codex`, no `ollama` on PATH; `setup-bun` runs per job on a self-hosted runner, so bun's absence is not a blocker. Runner service `active`, `/srv/swfl` 907G free (`df -h /srv/swfl`), uptime 12 days.

- nightly-chain: stays on GHA `ubuntu-latest`. No WAF, all legs are minutes (09/26 whole chain 04:23:10 → 04:26:44). The lifecycle leg that once needed a residential IP is parked (item 2).
- nightly-chain-dispatch: stays on Vercel. It is the external clock; moving it onto the box would make the box a single point of failure for the chain.
- daily-rebuild: stays on GHA. Deterministic after items 1 and 5; ~2-3 min. If question 1 goes to Option A, only the weekly cre-swfl synthesis job moves to Fedora (Lane M), not the rebuild.
- narrative-bake: moves to the Fedora runner (`runs-on: [self-hosted, swfl-local]`, job `if:` gated by `vars.SWFL_LOCAL_RUNNER_READY == 'true'` AND `vars.NARRATIVE_BAKE_LANE == 'max'`) when item 6 lands. Reason: Lane M — the `claude -p` Max login lives there (`claude` 2.1.271 and `~/.claude/.credentials.json` present on the box). Unset gate = skipped, never a fallback to `ubuntu-latest`, which has no Max login.
- cre-swfl weekly synthesis (new job, only under question 1 Option A): Fedora runner, same label and same `SWFL_LOCAL_RUNNER_READY` gate. Reason: Lane M.
- freshness-probe-daily: stays on GHA. DB reads only, 10-min ceiling.
- tripwire-hourly: stays on GHA. It reads GitHub's own API; the box adds nothing and should not audit itself.
- supabase-metrics-scrape: stays on GHA. P12's sparse sampling is a problem but not a box reason in the brief's list.
- gate-a-parity: stays on GHA. DB reads, minutes.
- data-targets-daily: stays on GHA `ubuntu-latest` (`data-targets-daily.yml:24`). None of the five box reasons applies. Its only I/O is one direct-Postgres connection to our own Supabase (`ingest/scripts/generate_data_targets.py:3`, opened at `:241`; `grep -nE "requests|httpx|urllib|https?://|playwright|ollama|SWFL_RESEARCH_ROOT|/srv/swfl|open\("` over the file returns nothing), so no outside site, no WAF, no browser, no local model and no archive read. Runtime across the last 15 runs is 76 s to 130 s (`gh run list --workflow data-targets-daily.yml --limit 15 --json createdAt,updatedAt`, updatedAt minus createdAt: 09/22 18:13:34 → 18:14:50, 09/18 17:48:51 → 17:51:01) under a 5-minute ceiling (`:25`), nowhere near 6 h. All 15 of those runs are green (P19), so moving it would fix nothing.
- reverify-signals-daily: stays on GHA. It probes prod over the public internet; a datacenter IP is the realistic client view.
- view-vintages-monthly: stays on GHA. It reads our own views (no WAF); monthly capture is small (Q: 5,473 rows over 4 months). Optional later: also write the monthly capture to `/srv/swfl` as the archive copy — only if the SSD backup test (brief: untested) passes first.
- project-feed-change-detection-daily: stays on GHA `ubuntu-latest` (`project-feed-change-detection-daily.yml:23`). None of the five box reasons applies. It reads `projects` and `project_feed` through the Supabase service-role client (`scripts/project-feed/change-detection.mts:57,86`) and reads committed `brains/*.md` from the job's own checkout (`:5`; `loadParsedBrain` at `lib/fetch-brain.ts:173-176` calls `readBrainMarkdown`, whose `readFile(path.join(BRAINS_DIR, …))` at `:157` reads from `BRAINS_DIR = path.join(process.cwd(), "brains")` at `:31`), so the files it needs come with `actions/checkout` and it never touches the SSD archive, an outside site, a browser or a model. Runtime across the last 15 runs is 25 s to 47 s (`gh run list --workflow project-feed-change-detection-daily.yml --limit 15 --json createdAt,updatedAt`: 09/19 12:36:48 → 12:37:13, 09/21 15:14:49 → 15:15:36) under a 15-minute ceiling (`:24`). Its only two reds (35617620735 on 09/21, 35734314551 on 09/22, P13) were the PostgREST schema-cache outage on our own database, which would have failed the same way on the box.
- home-values-investor-monthly: stays on GHA. Needs `REBUILD_PAT` and a push; no box reason.
- Anything already on the box that should not be: nothing from this family runs there today (`grep -n "self-hosted\|swfl-local"` over the 12 family workflows → none).

## 10. Compute lane per LLM leg

The grep that makes the list:

```
grep -nE "ANTHROPIC_API_KEY|anthropic|claude|openai|OPENAI" .github/workflows/{nightly-chain,daily-rebuild,narrative-bake,freshness-probe-daily,tripwire-hourly,supabase-metrics-scrape,gate-a-parity,data-targets-daily,reverify-signals-daily,view-vintages-monthly,project-feed-change-detection-daily,home-values-investor-monthly}.yml
```

It returned `daily-rebuild.yml:122` (key into the refinery step), `narrative-bake.yml:93` (key into the bake job), and `tripwire-hourly.yml:9` (a comment: "No ANTHROPIC_API_KEY here"). The same pattern over the 19 family scripts (assert_landed, rebuild_due, check_freshness, check_data_quality, doctor, probe_source_liveness, generate_data_targets, capture_view_vintages, tripwire-scan, supabase-metrics-scrape, reverify-signals, ceilings-to-checks, check-sweep, check-signals, project-feed/change-detection, lib/project/change-detection, bake-narratives, grade-predictions, the dispatch route) hits only `scripts/bake-narratives.mts` and `scripts/tripwire-scan.mjs`, and the tripwire hits are detection strings (`tripwire-scan.mjs:88-90,294`), not calls. `nightly-chain.yml` passes `secrets: inherit` into every called workflow, so the key reaches the city-pulse leg too.

The legs:
- Refinery Stage 2 triage (Haiku, `refinery/agents/anthropic.mts:6`, called from `refinery/agents/triage-agent.mts:163`) for macro-us and macro-florida. Does: scores content of fragments the pack already declares all relevant. Current auth: API key, dead (quoted 400 in P1). Replacement: none needed — Lane D via `skipTriageAgent: true` (item 1). No model at all.
- Refinery Stage 2 triage + Stage 3 synthesis (Sonnet, `anthropic.mts:8`, `refinery/agents/synthesis-agent.mts:100-114`) for cre-swfl. Does: scores corridor profiles and writes the qualitative per-corridor facts; all numeric aggregates are already deterministic ("Do NOT compute numeric cross-fragment aggregates … computed deterministically", `cre-swfl.mts:2169`). Current auth: API key, dead. Replacement: Lane M weekly bake read deterministically (Option A), or no model (Option B) — question 1. Mock mode is not a lane (P16).
- narrative-bake (Sonnet via the Message Batches API, `scripts/bake-narratives.mts:365-369`). Does: prose sections for zip / corridor / brain / area-email surfaces, behind `validateNarrative`. Current auth: API key; not reached since 08/14 (P4), would be dead. Replacement: Lane M on the Fedora runner (item 6). Deterministic alternative: readers already serve whatever was last baked (`loadNarrative` / `bakedAreaRead()`, consumers in section 1), so the leg is a refresher, not a live call; replacing the prose with a no-model template would change what four surfaces say — a product change, not proposed here.
- city-pulse distill inside the chain (`ingest · city pulse` leg; L1 `-> ERROR (distill): BadRequestError(… credit balance is too low …)`). Owned by the city-pulse family, listed here so it is not double-counted or missed. Raw rows still land (L1: LANDED 100).
- Second-Opus widening of the grep to include `refinery` (`grep -niE "anthropic|claude|openai|refinery"` over the 12 family YAMLs) adds hits the first draft did not list: `home-values-investor-monthly.yml:56,59` (`bun refinery/cli.mts home-values-swfl --force` and `investor-zip-swfl --target-only`; no `ANTHROPIC_API_KEY` in that job's env at `:50-53`, and both packs carry both skip flags per the section 3 scan, so no model call: Lane D, no change); `daily-rebuild.yml:238,256` (`refinery/tools/print-cron-diag.mts`, `refinery/tools/check-master-freeze.mts` — grep for `anthropic|openai|getAnthropic|messages.create` in both returns nothing, Lane D); `daily-rebuild.yml:205` and `narrative-bake.yml:80` are comments; `gate-a-parity.yml:61-64` are the 4 parity test files (DB reads, Lane D). No new LLM leg.
- Nothing else in this family calls a model. Lane L is not used: every leg here either certifies text shown to users (validator-gated) or is numeric.

## 11. Double-check log

Re-read top to bottom; each numbered claim, its check, the result.

- 13 pipelines, all under `jobs:` · `grep -n "name: <job>" ingest/cadence_registry.yaml` returned lines 2653-2764, all after `jobs:` at :2644 · verified.
- `jobs:` carry no freshness fields · `ingest/cadence_registry.yaml:2624-2643` header text · verified.
- Chain last 15 all failure · E1 on nightly-chain.yml · verified (09/19 08:51 → 09/26 09:24).
- 141 runs in the 200-limit list, 125 failure / 16 success · `awk '{print $4}' | sort | uniq -c` · verified. (Not used in the verdicts; the 84-since-08/15 figure is.)
- Last full green 31769734772 on 08/14; first red 31864313308 on 08/15 · E2 lines · verified; corrects the brief's "~08/25" (applied in P2).
- 84 runs since 08/15, gate failure on 84 · `awk '$2>="2026-08-15"' | grep -c gate=failure` → 84 · verified.
- rebuild skipped 61 / failed 23 · same file, `grep -c rebuild=skipped` → 61, `rebuild=failure` → 23 · verified.
- Parity and bake skipped 84 of 84 · `grep -c verify=skipped` → 84; bake follows rebuild and no run since 08/15 shows bake other than skipped (E2 lines read) · verified.
- 40 dispatch + 1 workflow_dispatch + 43 schedule since 08/15 · awk counts 40 and 1; 84-41 = 43 · verified.
- Dispatch missing 08/29, 08/30, 08/31 · awk per-day event check → "days 44 missing 3" (window includes 08/14) · verified; 40 of 43 nights 08/15-09/26 · verified.
- 40 duplicate executions · 43 schedule executions minus 3 backstop nights · verified.
- Master refined_at 2026-08-14T04:30:21Z · `git show origin/main:brains/master.md | grep -m1 refined_at` · verified; corrects the brief's "08/19" and `wiki/pipeline-health.md:100` (applied in the intro and P1).
- BR: 35 skipped-fresh, 1 built, 5 missing · node tally over `_build-report.json` → `{"skipped-fresh":35,"missing":5,"built":1}` · verified.
- The 3 packs still calling agents are cre-swfl, macro-florida, macro-us · shell loop over `refinery/packs/*.mts` counting skip flags · verified.
- macro-us/macro-florida fitScore 8, cutoff 0, skipSynthesisAgent · `macro-us.mts:225-227`, `macro-florida.mts:406-408` · verified.
- composite absent from served macro brains · `grep -c` → 0, 0 · verified (local checkout; origin copies not re-grepped — could-not-verify on origin, same shape expected).
- Master critical lines 290-293, 296 · `grep -n "critical: true" refinery/packs/master.mts` · verified.
- Last-good window formula and cre-swfl ttl 7 days · `resilient-build.mts:12-14`, `cre-swfl.mts:2136` · verified.
- Mock synthesize text · `synthesis-agent.mts:79-86` · verified.
- Row-gate lines (214, 15, 100, STALE 08/14) · L1 · verified.
- Lifecycle `LISTING_LIFECYCLE_BASE_URL is not set` · L1 · verified.
- `nightly: true` at registry :2076 · `sed -n 2076p` · verified.
- Guard filter on `conclusion=="success"` · `nightly-chain.yml:94-96` · verified.
- Heartbeat URL shape and vendor semantics · the 4 YAML line ranges read this session; crawl4ai of healthchecks.io/docs/http_api/ table rows "Success (slug) `https://hc-ping.com/<ping-key>/<slug>`" and "Failure (slug) …/fail" · verified.
- freshness-probe 85/13/1/1 of 100, newest green 07/11 · `gh run list --limit 100` tally + jq · verified.
- Doctor 3 red / 38 yellow / 37 green of 78 · run 36259690113 log · verified.
- doctor.py:737 gates on any red · `grep -n fail_on` → `:737` · verified.
- tripwire 51/9 of 60, newest green 08/06 · tally + jq · verified.
- Tripwire RED lines and watch-manifest :26-29 · run log + grep · verified.
- Runner online, SWFL_LOCAL_RUNNER_READY true 09/20 06:06Z · `gh api …/actions/runners`, `gh variable list` · verified.
- Guard-file list at tripwire-scan.mjs:317 · read · verified (watch-manifest.mjs not on it).
- Issue comment counts #44 2500, #110 76, #119 64, #136 28, #178 0, #111 0, #221 0 · `gh issue view <n> --json comments` · verified.
- Reverify 3 cancels share the hang shape · summaries at 18:43:06 / 18:12:43 / 19:56:22 then cancel at 10 min · verified for all three.
- Green reverify idles ~5 min · 36180242986: summary 19:32:45Z, next step 19:37:59Z · verified.
- ceilings step ERR_MODULE_NOT_FOUND 'yaml' · 36180242986 log · verified; "every run" in P10 → corrected to "present in the 09/25 green run; first run could-not-verify" (applied).
- check-sweep "0 OPEN check(s) carry a live signal" · 36180242986 log · verified.
- checks 1,653 total / 21 open / 62 closed with signal · Q · verified; 21 open also matches `node scripts/check.mjs list` header · verified.
- narratives counts and newest baked_at · Q · verified.
- narrative_bake_batches 42 / 0 pending / newest 08/14 · Q · verified.
- BAKE_CADENCE daily · `gh variable list` · verified.
- supabase_db_metrics 6,507 rows / 723 scrapes / 9 metrics / per-day counts · Q · verified.
- data_targets 13 rows, status split 8/4/1 · Q · verified.
- view_vintages 3,819 + 1,654 rows, 4 vintages · Q · verified; 5,473 total in section 9 is the sum · verified.
- project_feed 42 + 6 rows, projects 23 · Q · verified.
- predictions master newest 08/14 · Q · verified.
- metric_observations has brain_id + captured_at and tracks brain builds · Q on information_schema, then Q max(captured_at) per brain_id: home-values-swfl 09/24 18:18:20Z matches its refined_at 09/24 18:18:20Z · verified (first draft said could-not-verify; re-queried and corrected in section 8).
- supabase-metrics 15/15, data-targets 15/15, view-vintages 4/4, project-feed 13/2, reverify 10/2/3, home-values 2 green + 3 red · E1 per workflow · verified.
- project-feed reds = schema-cache message · `--log-failed` on both ids · verified.
- home-values 08/24 and 07/24 push rejected · `--log-failed` · verified; 06/24 · empty log · could-not-verify (stated in P14).
- Test counts 134 pytest, 75 node, 131 bun · commands run this session · verified. The 131 includes the 4 parity files registered as skip without RUN_DB_PARITY — stated in section 5.
- grade-predictions 5 of 5 skipped · `gh run list --workflow grade-predictions.yml --limit 5` · verified.
- Fedora box facts (claude 2.1.271, creds file present, no bun/codex/ollama, runner active, 907G free, up 12 days) · `ssh fedora` read-only probes · verified; creds validity could-not-verify.
- Max-seat research file absent · `ls`, `find`, `rg --no-ignore` · verified absent in all three.
- No family table in data-roots/data-inventory · grep → no output · verified.
- Chain run duration 09/26 04:23:10 → 04:26:44 · `gh run view 36217671353 --json jobs` (guard start 04:23:13, last job 04:26:44) · verified.
- E2 size · `wc -l` on the saved per-run job file → 86 (2 on 08/14 + 84 from 08/15) · corrected (draft said 85; fixed in section 2).
- Rebuild's first run after the 09/15 change failed on the same cause · `gh run view 35037327866 --log-failed | grep -c "credit balance is too low"` → 13, first BUILD FAILED lines cre-swfl and macro-us · verified.
- No family workflow runs on the box · `grep -ln "self-hosted\|swfl-local"` over the 12 family YAMLs → no file, exit 1 · verified.
- Correction applied during the pass: section 8's first draft of the home-values signal proposed an `http_body` check; a body cannot compute age, so it was replaced in place with the `db_fresh` on `metric_observations`.
- Corrections applied during the pass (line numbers re-read with grep/sed): registry `jobs:` header is :2624-2643 (draft said :2622); cre-swfl "Do NOT compute numeric" is :2169 (draft :2168); reverify exitCode lines are :135/:151 and the isMain block :147-152 (draft :150 / :146-152); dbFresh's Accept-Profile is check-signals.mjs:108 (draft :107); project-feed's "nothing is written" is change-detection.mts:9-10 (draft :8-10); `wiki/pipeline-health.md:100` and `wiki/pipeline-census.md:38/:43` (draft :99, :37, :44); tripwire's cron is `tripwire-hourly.yml:13` and its issue step :47-58 (draft :105 and :139-150 — the draft read a two-file `cat -n` whose numbering ran on from the first file). All fixed in place.
- City-pulse job 48 success / 1 skipped / 37 failure over the 86 E2 runs, failures exactly 09/09-09/26 · per-run jobs loop filtered on "city pulse", tallied, date range of failures 09/09 → 09/26 and 37 failures among the 37 runs on or after 09/09 · verified. This was missed in the first draft (which read only the row gate's LANDED line) and corrected: added P17, rewrote items 2, 4, 12, the section 6 nightly-chain line, the intro, and section 8's parity and `cron_incident_nightly_chain` lines.
- Doctor matches checks to tables only by the prefixes `quality_fail_`, `schema_drift_`, `contract_fail_` · `ingest/scripts/doctor.py:312-319` · verified; corrected item 2 to add `parked: true` (the first draft relied on `nightly: false` plus an unmatched check).
- Guard dedup rule · first draft keyed on "any dispatch run today", which would also suppress the backstop on a dispatch run that died before running anything; corrected item 3 to key on the dispatch run's `gate · assert_landed` job having a conclusion.
- nightly-chain-dispatch signal · first draft said "none of its own"; corrected to a guard-job Healthchecks ping on `repository_dispatch` (section 8).
- cre-swfl Option A stale-prose guard · added in item 5 and question 1 (the baked file's as-of date feeds the stale caveat).
- P12 day list · 09/18 is a partial day at the query window's edge; corrected to name only 09/21 and 09/22.
- Heartbeat URL order · item 7 now says `/fail` goes before `?create=1`.
- Section 10 narrative-bake "no-model template" sentence · the first draft asserted a template fact never checked; rewritten to what the readers verifiably do (`loadNarrative` / `bakedAreaRead()` serve the last bake) · corrected.
- Healthchecks alert routing · not read this session · could-not-verify (stated in section 8).
- Section 9 data-targets-daily reason (repair pass: the first version said only "stays on GHA") · `data-targets-daily.yml:24-25` (runs-on, timeout 5) · `generate_data_targets.py:3,241` (one Postgres connection) · the external-I/O grep over the file → no hit · verified. Runtime 76 s to 130 s · `gh run list … --json createdAt,updatedAt --jq '(.updatedAt|fromdate)-(.createdAt|fromdate)' | sort -n` → min 76, max 130 · corrected (the repair draft said 79 s minimum, read off the newest run only; 09/22 and 09/23 were 76 s).
- Section 9 project-feed reason (repair pass: the first version said only "stays on GHA") · `project-feed-change-detection-daily.yml:23-24` · `change-detection.mts:5,57,86` · `lib/fetch-brain.ts:31,152-160,173-176` (brains read from `process.cwd()/brains` by `readFile`) · verified. Runtime 25 s to 47 s · same duration command → min 25, max 47 · verified. Both reds were the schema-cache outage · P13's `--log-failed` quote · verified.
- Word scrub: the file was searched for "billing", "top up", "restore the key", "until credit" — none present except "billing" inside the existing check name `doctor_cannot_see_billing_wall` and the doctor's BILLING class (item 8, section 8) · corrected in the repair pass (this line first said "billing" was absent); "credit" appears only inside the quoted 400 line, the phrase "credit wall", and the existing check name `llm_legs_parked_credit_wall` · verified.

## 12. Questions for the operator

1. cre-swfl is one of master's five critical inputs and the only one that genuinely needs a model (it writes the corridor prose). Pick one: (A) a weekly Max-plan run on the Fedora box writes that prose into a file the nightly build reads, so master rebuilds every night with prose that is at most a week old; or (B) cre-swfl goes numbers-only and the corridor prose stops. Until one is picked, master stays held even after the macro fix. Under (A) the brief carries the prose's own as-of date and shows the existing stale caveat if the weekly run stops, so old prose is never passed off as new.

## 13. Second-Opus verification

Second Opus, 09/26/2026 ~17:00-20:30Z. Every command below was re-run in this session. The evidence files (per-run job tallies, the 23 rebuild logs, the doctor log, the SQL script) sit in the session scratchpad and were not committed.

### Claims checked: 203

- Registry `name:` line numbers for all 13 jobs plus the `jobs:` header (`grep -n "name: <job>"`, `sed -n 2620,2650p`): 14 checked, all matched.
- E1 run lists for the 12 family workflows plus grade-predictions (`gh run list --workflow <f> --limit 15`): 13 checked, all matched. supabase-metrics-scrape drifted (see below).
- freshness-probe 85/13/1/1 of 100 with newest green 07/11/2026 14:53Z; tripwire 51/9 of 60 with newest green 08/06/2026: 4 checked, matched.
- E2, rebuilt from scratch over the 86 runs since 08/14 (per-run `gh api …/runs/<id>/jobs`): 11 checked, matched.
  - 84 runs since 08/15.
  - Events: 40 dispatch, 43 schedule, 1 workflow_dispatch.
  - Gate failure 84; rebuild skipped 61, failure 23; parity skipped 84; bake skipped 84.
  - Missing dispatch nights: 08/29-08/31.
  - City pulse: 48 success, 37 failure, the failures exactly 09/09-09/26.
  - Last green 31769734772; first red 31864313308.
- L1 (`gh run view 36217671353 --log-failed`): 10 checked, matched.
  - Row-gate lines: 214, 15, 100, STALE 08/14.
  - `LISTING_LIFECYCLE_BASE_URL is not set` and `[fatal] every county returned 0 rows`.
  - 3 BUILD FAILED lines, `HOLD`, the active-rentals statement timeout.
  - Ingest-aware rebuilds of macro-swfl, city-pulse-swfl and freshness-pulse.
  - Heartbeat `OK`.
- HOLD on all 23 rebuild-failure runs (log grep per run): 1 checked, matched. The precision this surfaced was added to P1.
- Build report tally 35/1/5 with the 5 packs named, `refined_at` for 8 brains on origin/main, twice-daily brain commits 09/23-09/26: 10 checked, matched.
- SQL re-queries (Bun.SQL, dlt credential, read-only): 12 checked. Two corrected (checks wording, the 09/18 count); one drifted (metrics totals). The 12:
  - narratives by surface; bake batches (42, 0 pending, newest 08/14).
  - metrics totals; metrics per day.
  - data_targets rows and status split.
  - checks totals; checks with a signal, by state.
  - view_vintages; project_feed; projects (23).
  - predictions by brain and kind; metric_observations.
- file:line citations opened with `sed -n` / `grep -n`: 86 checked, one wrong (`store.ts:30`). They cover:
  - Gate and probe code: doctor, landed_watch, the registry parked lines, watch-manifest, tripwire-scan, assert_landed.
  - Workflows: the reverify script and YAML, gate-a-parity, the tripwire YAML, log-cron-incident, nightly-chain, the 4 heartbeat blocks, the key lines, the cron lines, the home-values YAML, the narrative-bake YAML.
  - Refinery: resilient-build, cre-swfl, stages 2 and 3, macro-us, macro-florida, macro-swfl, master, synthesis-agent, anthropic, triage-agent, predictions-log, metric-observations-log.
  - Stores and writers: store, batch-store, the five writer scripts, change-detection, the metrics scrape, check-signals, the view-vintage reader, flywheel-backtest.
  - Registry and docs: registry `:2076`, `:2508-2516`, `:2595`; the wiki and plan lines; `_RESEARCH/INDEX.md:250-251`.
- Issues #44, #110, #111, #119, #136, #178, #221 (`gh issue view <n> --json …`: state, created date, comment count, labels): 7 checked, matched.
- Repo variables, runner status and Fedora box facts (`gh variable list`, `gh api …/actions/runners`, `ssh fedora`): 9 checked, matched. Box: claude 2.1.271, no bun/codex/ollama, node present, 907G free, up 12 days, credentials file present.
- Test suites re-run: 3 checked, matched. pytest 134 passed; node 75 pass; bun 131 pass across 17 files.
- Missing tests (`git ls-files | grep test` for view_vintage, probe_source_liveness, nightly-chain-dispatch, macro-us): 4 checked, matched.
- Healthchecks slug semantics (crawl4ai of https://healthchecks.io/docs/http_api/): 1 checked, matched. `/<slug>` is success, `/<slug>/fail` is failure, `/<slug>/<exit-status>` reports an exit code.
- Consumer greps: 9 checked. Scope: the 7 family tables over refinery/sources, refinery/packs, refinery/lib, lib/ and app/, plus `gh api search/code` in the ops repo for supabase_db_metrics and data_targets.
  - Every consumer the plan names exists.
  - The one reader it does not name is `lib/narratives/area-read.ts`. It holds `bakedAreaRead`, which review-reply imports, so it is the same seam.
  - The other hits are comments or `lib/narratives/length` imports, not table readers: `storm-history-source.mts`, `corridor-metrics.ts`, `zip-report/assemble.ts`, `email/lab/build-grounding.ts`.
  - `data_targets` has no in-repo reader: `skill-baseline.mts:170` and `methodology-registry.mts:9` are comments. Its readers are ops `app/glass/shopping.tsx` and `lib/glass.ts`, as the plan says.
- Reverify logs: 3 checked, matched. Run 36263488364 prints its summary at 18:43:06Z and is cancelled at 18:52:43Z. Run 36180242986 shows ceilings `ERR_MODULE_NOT_FOUND 'yaml'` and check-sweep "0 OPEN".
- Doctor and tripwire logs: 4 checked, matched. Doctor: 3 red, 38 yellow, 37 green of 78, with the three reds named. Tripwire: 2 RED lines on 36257936782 and on 34704788695 (09/12).
- Max-seat research file absent: 1 checked, matched. The directory count was wrong (correction 2).
- Credit-wording scrub: 1 (see the last subsection).

### Corrections (each applied in place)

1. Section 1, narrative-bake writer.
   - Was: `lib/narratives/store.ts:30`.
   - Now: `upsertNarrative` at `store.ts:59-64`.
   - Evidence: `grep -n` on store.ts puts `:30` inside `loadNarrative` (`:22`).
2. Section 5, research directory.
   - Was: `_RESEARCH/agent-behavior/` holds 5 files.
   - Now: 18 files.
   - Evidence: `ls _RESEARCH/agent-behavior/ | wc -l`.
3. Section 2, metrics per day.
   - Was: 09/18 = 2.
   - Now: 09/18 = 6.
   - Evidence: per-UTC-day Q over a 9-day window.
4. P1 and the intro, "three critical upstreams die on the credit wall every night".
   - Now: macro-us and macro-florida failed deterministic 23 of 23. cre-swfl failed deterministic 19 of 23 and transient on the 4 outage nights 09/21-09/22. env-swfl also failed on 09/15.
   - Evidence: `--log-failed` grep over all 23 rebuild failures.
5. Section 2, checks count.
   - Was: 62 closed carrying a signal.
   - Now: 62 in state `done` (the set reverify reads, `reverify-signals.mjs:88`) plus 9 `dropped`.
   - Evidence: Q grouped by state.
6. Item 4, parking the bake.
   - Was: parked only on the chain's calling job.
   - Now: parked on the job `if:` inside `narrative-bake.yml:63`.
   - Evidence: `narrative-bake.yml:14-16,29` are live triggers, and `:22-25` says the trigger still fires after a manual rebuild dispatch.
7. Items 5 and 6 and section 9, the Fedora jobs.
   - Was: no `SWFL_LOCAL_RUNNER_READY` gate.
   - Now: `if: vars.SWFL_LOCAL_RUNNER_READY == 'true'` with `runs-on: [self-hosted, swfl-local]`.
   - Evidence: brief §9; `gh variable list` shows the variable set 09/20/2026 06:06Z; `ingest-collier-official-records.yml:31` reads it.
8. Section 4 coverage.
   - Was: no entry for nightly-chain-dispatch, data-targets-daily or view-vintages-monthly.
   - Now: P18 (3 missed nights, cause unverified) and P19 (no problems found, commands shown).
   - Evidence: the E2 per-day check, E1, Q.
9. Section 7 coverage.
   - Was: no item opened the section 8 check rows, and 4 GOOD ENOUGH pipelines had no item.
   - Now: item 15 (`node scripts/check.mjs open … --signal`).
   - Evidence: `scripts/check.mjs:177-190,260`.
10. Section 8, one signal per pipeline.
    - Was: freshness-probe named two signals, and tripwire's signal was unnamed.
    - Now: freshness-probe has one (the Healthchecks `/fail` slug); tripwire's is the state of #119.
11. Section 8, the master signal filter.
    - Now: the filter adds `prediction_kind=eq.synthesis`, and section 1 notes that the live `predictions` table is not master-only.
    - Evidence: Q by brain and kind. Master's slug rows are newest 06/30/2026; macro-swfl and rsw-airport also have slug rows.
12. Section 8, signal types.
    - Was: 3 types listed.
    - Now: all 7, plus the recognized-but-disabled type.
    - Evidence: `check-signals.mjs:185-213`.
13. Section 10, the LLM grep.
    - Was: the grep omitted `refinery`.
    - Now: adds the home-values-investor-monthly refinery runs (no model call), the daily-rebuild tool steps and the gate-a test files.
    - Evidence: `grep -niE "anthropic|claude|openai|refinery"` over the 12 YAMLs.
14. Section 8, the noise list.
    - Was: the #44 feed's source and the stale runner check were missing.
    - Now adds:
      - `vars.CRON_INCIDENT_ISSUE_NUMBER=44` and the 8 family workflows the logger watches.
      - Label `cron-failure` (#110, #111, #178, #221).
      - `fedora_runner_not_registered_smoke_owed`, marked stale.
    - Evidence: `gh variable list`, the `workflows:` list in `log-cron-incident.yml`, `gh issue view`, `gh api …/actions/runners`.

Re-queried drift, not corrections. A scrape landed at 19:56Z, which moved:
- supabase_db_metrics totals from 6,507 rows / 723 scrapes to 6,516 / 724.
- the 09/26 scrape count from 4 to 5.
- the supabase E1 window, whose newest green is now 36267780789.

### Unverifiable claims

- Why the dispatch missed 08/29-08/31. No commit touched `vercel.json` or the route. The Vercel cron invocation logs were not read.
- Where Healthchecks sends an alert for a late or `/fail` ping. The Healthchecks project was not read.
- Whether `~/.claude/.credentials.json` on the Fedora box is valid. Its presence is verified. A live auth call was not made, because it would spend a Max session.
- The date the heartbeat pings were added (P5). Git history was not searched.
- The home-values red on 06/24 (28113292035). `--log-failed` returns nothing.
- One of the first draft's could-not-verify items is now closed: composite is absent from both served macro brains on origin/main (`git show origin/main:brains/<id>.md | grep -c "composite\|content_score"` → 0 and 0).

### Gaps filled

- Section 4: P18 for nightly-chain-dispatch, and P19 recording no problems for data-targets-daily and view-vintages-monthly.
- Section 7: item 15, which opens the signal-bearing checks.
- Items 4, 5 and 6 and section 9: the bake is parked inside its own file, and both Fedora jobs carry the runner gate.
- Section 10: the refinery-invocation hits.
- Section 8: the noise sources, and one named signal each for freshness-probe-daily and tripwire-hourly.
- Section 8: per-run issue writers. Only tripwire (#119) and reverify (#136) comment on issues, and both are de-duplicated in section 8. No family workflow creates an issue per run.
- Cross-family coordination:
  - The doctor is a family-19 seam, which touches item 8 and `doctor_cannot_see_billing_wall`.
  - Family 01 plans `dispatch_only: true` plus an API disable for listing_lifecycle, while item 2 here uses `parked: true`. The two families must agree on one field.
  - Family 13 (`13-pulse-news.md:3`) moves the pulse distill to Lane M, which picks up the P17 dependency. No family proposes making the distill non-fatal, so the chain run stays red until that move lands.

### Credit-suggestion count: 0

After all edits, `grep -niE "credit|top up|top-up|console balance|api key funding|billing|purchase|fund"` over sections 1-12 of this file (`head -381 … | grep -ciE …`; was `head -379` before the section 9 repair pass added two double-check lines, re-run → still 14) returns 14 lines; this section adds 9 more that only quote the search terms, 23 in all. Every one is descriptive:
- the phrase "credit wall";
- the quoted 400 error, truncated before its vendor instruction as in the first draft;
- the check names `llm_legs_parked_credit_wall` and `doctor_cannot_see_billing_wall`;
- the doctor's BILLING class;
- the section 11 word-scrub line.

None of them proposes, prices or hints at adding or topping up Anthropic API credit. Every LLM leg goes to a permitted lane or stays parked by name:
- Lane D: macro-us and macro-florida.
- Lane M: cre-swfl (Option A), narrative-bake, and the pulse distill through family 13.
