# 17 product-schedulers — pipeline plan (09/26/2026)

Family 17 is the product-side scheduler group: twelve registry rows, all under `jobs:` in `ingest/cadence_registry.yaml`, eleven GitHub Actions workflows and one Vercel cron. They are email-scheduler, social-scheduler, outreach-drip, outreach-demo, lifecycle-nudges-daily, data-readiness-cron, mls-sync (vercel.json), build-example-deliverables, deliverables-retention-sweep-daily, social-engagement-poll, social-pulse-scan and weekly-read. None of them ingests a public source into `data_lake.*` except as a side effect; they send, sweep, verify, or scan.

The verdict:
- One job is serving a wrong number today. social-pulse-scan has returned zero Instagram posts on every scan since 08/09/2026 and still runs green. The live public page `/pulse` shows "Posts scanned 0". The vendor under it (SteadyAPI) is OUT by the operator's word. The DO fix is to stop the page serving an empty digest; parking the scan itself is his call (social surfaces were on the freeze list he rejected on 07/19), so it is ASK-FIRST.
- One job is a latent invented-number lane with no reader on the send path. data-readiness-cron runs two paid web_search calls per metric of every due schedule and can fall to an ungrounded model answer ("model_only" tier). Its result is only inserted into `data_readiness_alerts`; nothing in this repo reads it back into a send. It also checks a different set of schedules from the set email-scheduler sends. Zero schedules are active, so it can be made deterministic before it costs or misleads anyone.
- Five jobs have never run once (social-scheduler, outreach-drip, outreach-demo, social-engagement-poll, weekly-read). They are parked by design and their tables are empty. They stay parked; the plan only fixes the one that would go live without an approval gate.
- The four live GitHub jobs that do run are green, but they are idle: zero due email schedules, zero armed sequences, zero trashed deliverables. Two of them carry a Healthchecks heartbeat that reports success even on a red run.
- None of the twelve is watched by the doctor, the freshness probe or the ops coverage page, and the registry forbids the fields those seams read on `jobs:` rows. The one signal per job therefore has to be the Healthchecks heartbeat (fixed to report failures), not a new registry field.

## 1. Scope

Twelve pipelines. Registry names, workflow, and the tables each touches (tables confirmed by grep of the owning script, section 2 has the live counts):

- email-scheduler — `ingest/cadence_registry.yaml:2659`, `.github/workflows/email-scheduler.yml`, runner `scripts/email/run-schedules.mts`. Tables: `public.email_schedules` (claim + re-arm), `public.email_sends` (insert), `public.deliverables` and `public.projects` (read). Consumers of what it writes: the direct query readers of `email_sends` are `lib/email/load-campaign-stats.ts:33` (select) and `app/api/webhooks/resend/route.ts:294,515,576` (`rg -n 'from\("email_sends"\)' lib app scripts components`). `lib/email/campaign-stats.ts`, `lib/email/reply-token.ts`, `lib/email/blast-events.ts`, `lib/email/process-inbound.ts` and `lib/email/campaign-click-alert.ts` name the table only in comments. `email_schedules` itself is named in 29 non-test files (`rg -l "\bemail_schedules\b" refinery/sources refinery/packs lib app components scripts`, tests and generated types excluded; some mention it only in comments), including the project UI.
- social-scheduler — `ingest/cadence_registry.yaml:2662` (status parked, :2665), `.github/workflows/social-scheduler.yml`, runner `scripts/social/run-schedules.mts`. Tables: `public.social_schedules`, `public.social_posts`, `public.social_accounts`. Consumers: `social_schedules` is read by the project UI (`app/project/page.tsx:62`, `app/project/layout.tsx:68`); `social_posts` is read by `scripts/social/poll-engagement.mts:255` (social-engagement-poll).
- outreach-drip — `ingest/cadence_registry.yaml:2690` (status parked, :2693), `.github/workflows/outreach-drip.yml`, runner `scripts/email/outreach-drip-run.mts`. Tables: `public.outreach_recipients`, `public.outreach_events`.
- outreach-demo — `ingest/cadence_registry.yaml:2694` (status parked, :2697), `.github/workflows/outreach-demo.yml`, runner `scripts/email/outreach-demo-run.mts`. Tables: `public.outreach_recipients`; scorecard view `public.outreach_demo_funnel` read by `scripts/email/outreach-demo-scorecard.mts`.
- lifecycle-nudges-daily — `ingest/cadence_registry.yaml:2727`, `.github/workflows/lifecycle-nudges-daily.yml`, runner `scripts/project-feed/lifecycle-nudges.mts`. Reads `public.email_sequences`, `data_lake.listing_transitions`, `data_lake.listing_state`; writes `public.lifecycle_nudges`. Consumers: `app/api/projects/[id]/sequence/route.ts`, `app/api/projects/[id]/sequence/nudges/route.ts`.
- data-readiness-cron — `ingest/cadence_registry.yaml:2705`, `.github/workflows/data-readiness-cron.yml` (a curl to the Vercel route `app/api/cron/data-readiness/route.ts`, ladder in `lib/email/data-readiness.ts`). Writes `public.data_readiness_alerts`. Consumers: none in this repo. The two other files that touch the table are also writers, not readers: `lib/signals/log-collision.ts:36` and `app/api/projects/[id]/confirm-value/route.ts:37` both `.insert` (`rg -n 'from\("data_readiness_alerts"\)' lib app scripts components refinery` returns 3 inserts and 0 selects). This is a dark root; see P4.
- mls-sync — `ingest/cadence_registry.yaml:2747` (scheduler vercel, :2750), `vercel.json:4-5` (`/api/mls/sync`, `0 11 * * *`), handler `app/api/mls/sync/route.ts` GET, sync core `lib/reso/sync.ts`. Tables: `public.user_mls_connections`, `data_lake.user_mls_listings`, `data_lake.user_mls_stats` (both coverage_exempt as `client_upload_surface`, `ingest/cadence_registry.yaml:2607-2613`). Consumers: only the MLS routes and `lib/reso/*` (`rg -l user_mls_listings lib app refinery`).
- build-example-deliverables — `ingest/cadence_registry.yaml:2701` (status disabled, :2704), `.github/workflows/build-example-deliverables.yml`, runner `scripts/build-example-deliverables.mts`, core `lib/deliverable/examples.ts`. Table: `public.deliverables` rows with `is_example = true`, served at `/p/example-*`.
- deliverables-retention-sweep-daily — `ingest/cadence_registry.yaml:2758`, `.github/workflows/deliverables-retention-sweep-daily.yml`, runner `scripts/deliverables/retention-sweep.mts`. Table: `public.deliverables` (hard-deletes rows with `deleted_at` older than 7 days).
- social-engagement-poll — `ingest/cadence_registry.yaml:2736` (status parked, :2739), `.github/workflows/social-engagement-poll.yml`, runner `scripts/social/poll-engagement.mts`. Table: `public.social_events`. Consumers: `lib/social/engagement.ts`, `lib/social/lifecycle.ts`.
- social-pulse-scan — `ingest/cadence_registry.yaml:2740` (no status field, so live), `.github/workflows/social-pulse-scan.yml`, runner `scripts/social-pulse/scan.mts`, core `lib/social-pulse/*`. Tables: `public.social_pulse_scans`, `public.social_pulse_posts`, `public.social_pulse_hashtags`, `public.social_pulse_digest`. Consumer: `lib/social-pulse/load.ts:6-18` read by `app/pulse/page.tsx:17` (the public `/pulse` page).
- weekly-read (Market Area Alerts) — `ingest/cadence_registry.yaml:2743` (status parked, :2746), `.github/workflows/weekly-read.yml`, runner `scripts/email/weekly-read-run.mts`. Table: `public.weekly_read_subscribers`.

Registry fields the brief asks for (lane, cadence_days, consuming_pack, expected_rows_min, source_scope.source_ceiling) do not exist on any of the twelve. That is by design: `ingest/cadence_registry.yaml:2628-2629` says `jobs:` carries "NO freshness/lane fields", and `ingest/tests/test_cadence_registry_spine.py:383` asserts "derived/ingest fields forbidden in jobs". No consuming_pack: none of the twelve feeds a leaf brain or master.

Count: 12 pipelines, 11 workflow files plus 1 Vercel cron, 24 tables and views touched (counted from the list above, `deliverables` once).

## 2. What is being brought in

Live counts are from a read-only Bun.SQL script copied from the connection approach in `scripts/apply-fdic-sod-view.mts:15-27`, with `SET default_transaction_read_only = on`, run 09/26/2026 (DB `now()` returned 2026-09-26T19:53Z). The command shape is `bun q17.mts "<sql>"`; every SQL text is inlined below.

- email-scheduler. Source: tenant-saved Email Lab designs. Cadence: `email-scheduler.yml:11` cron `45 15 * * *` (daily, throttled 07/18 per :4-5). `select status, template_id, count(*), min(next_run_at), max(last_run_at) from email_schedules group by 1,2` returned 2 rows, both `paused`: one `block-canvas` (next_run_at 07/20/2026, last_run 07/13/2026) and one legacy `template_id null` (next_run_at 07/20/2026). `select count(*), max(sent_at) from email_sends` returned 2, newest 07/13/2026. Geography: not county-scoped; the scope rides each saved design.
- social-scheduler. `select count(*) from social_schedules` = 0; `social_posts` = 0; `social_accounts` = 0. Nothing brought in.
- outreach-drip and outreach-demo. `select count(*), max(updated_at) from outreach_recipients` = 0, null. `select count(*) from outreach_events` = 0. `select * from outreach_demo_funnel` returned no rows. Nothing brought in.
- lifecycle-nudges-daily. Inputs: `select count(*) from email_sequences` = 0. `select source_name, sale_or_rent, count(*), max(at) from data_lake.listing_transitions group by 1,2` returned api_feed/sale 54,485 rows newest 08/14/2026, and lifecycle_seed/sale 10,459 newest 06/27/2026. Output: `select count(*), max(created_at) from lifecycle_nudges` = 0, null. The run log of 36264727747 says "no armed sequences with a resolved address_key — nothing to do."
- data-readiness-cron. `select count(*), max(alert_at), count(*) filter (where resolved_at is null) from data_readiness_alerts` = 0, null, 0. The 09/26 run 36260904937 body: `{"checked":0,"message":"No upcoming sends in window"}`.
- mls-sync. `select count(*) from user_mls_connections` = 0. `select count(*), max(synced_at) from data_lake.user_mls_listings` = 0, null. `select count(*), max(computed_at) from data_lake.user_mls_stats` = 0, null. `vercel env ls production` lists no `RESO_*` variable (it lists CRON_SECRET and ANTHROPIC_API_KEY among others), and `lib/reso/boards.ts:14-23` needs `RESO_BASE_URL_SWFL_MLS`/`RESO_TOKEN_SWFL_MLS` or the NABOR pair. Nothing brought in; nothing could be.
- build-example-deliverables. Source: leaf brains `housing-swfl`, `macro-swfl`, `cre-swfl`, `labor-demand-swfl` (`lib/deliverable/examples.ts:49-86`). `select id, template, items_snapshot->0->>'freshness_token' from deliverables where is_example` returned 5 rows: example-one-pager SWFL-7421-v12-20260717, example-email SWFL-7421-v12-20260717, example-client-email SWFL-7421-v7-20260629, example-bov-lite SWFL-7421-v59-20260716, example-market-overview SWFL-7421-v36-20260629. The source brains today (`grep -m1 -o -E "SWFL-[0-9]+-v[0-9]+-[0-9]{8}" brains/<id>.md`): housing-swfl v17-20260921, macro-swfl v41-20260922, cre-swfl v68-20260810, labor-demand-swfl v8-20260719. All 5 examples are behind their source brain. Both `/p/example-one-pager` and `/p/example-email` return HTTP 200 (`curl -w "%{http_code}"`).
- deliverables-retention-sweep-daily. `select is_example, count(*), max(created_at), count(*) filter (where status='trashed' or deleted_at is not null) from deliverables group by 1` returned non-example 89 rows (newest 08/11/2026, 0 trashed) and example 5 rows (0 trashed). Run 36246212374 logged "hard-deleted 0 trashed deliverable(s) older than 7d".
- social-engagement-poll. `select count(*), max(captured_at) from social_events` = 0, null.
- social-pulse-scan. Source: SteadyAPI Instagram endpoints (`lib/social-pulse/steady-client.ts:10` `https://api.steadyapi.com/v1/instagram`, key `PHOTOS_API`). Cadence: `social-pulse-scan.yml:10` `0 11 * * *` daily. `select count(*), max(ran_at), min(ran_at) from social_pulse_scans` = 84 scans, newest 09/26/2026 14:56Z, oldest 07/05/2026. `select count(*), count(distinct scan_id), min(taken_at), max(taken_at) from social_pulse_posts` = 7,147 posts across 32 scans, taken_at 06/09/2016 to 08/06/2026. `select max(s.ran_at), max(s.id) from social_pulse_scans s where exists (select 1 from social_pulse_posts p where p.scan_id=s.id)` = 08/09/2026 11:35Z, scan_id 37; `select count(*) from social_pulse_scans where id > 37 and exists (...posts...)` = 0, so scans 38 to 84 carry no posts. `select count(*), count(distinct scan_id), max(scan_id) from social_pulse_hashtags` = 358 rows, 37 scans, newest scan_id 42; `select scan_id, count(*) from social_pulse_hashtags where scan_id > 36 group by 1` = 12 rows each for scans 37 to 42, and scan 42 ran 08/14/2026 11:50Z (`select id, ran_at from social_pulse_scans where id = 42`). So hashtags kept landing five scans after posts stopped, and stopped on 08/14, the day the scratchpad dates the SteadyAPI subscription's last successful fetch (`_ASSISTANT/SCRATCHPAD.md:946-948`). Area split, `select area, count(*) from social_pulse_posts group by 1`: swfl 1,734, naples 1,497, cape-coral 1,345, fort-myers 1,060, lehigh 602, bonita-estero 457, charlotte 452. County coverage: Lee (cape-coral, fort-myers, lehigh, bonita-estero) and Collier (naples); Hendry none; the 452 charlotte posts are not coverage. `select week, scan_id, built_at, narrative is not null from social_pulse_digest order by week desc limit 10` shows digests every week from 2026-W27 (scan 3) through 2026-W39 (scan 84). Re-run without the limit (`select week, scan_id, narrative is not null from social_pulse_digest order by week desc`): narrative present W28, W29, W30, W32, W33, W34, W35, W36 (8) and null W27, W31, W37, W38, W39 (5). `select count(*), count(*) filter (where narrative is not null) from social_pulse_digest` = 13, 8.
- weekly-read. `select status, count(*), max(next_send_at), sum(issues_sent) from weekly_read_subscribers group by 1` = 1 active subscriber, next_send_at null, 0 issues sent.

## 3. What is working

Last 15 runs, `gh run list --workflow <file> --limit 15 --json databaseId,status,conclusion,createdAt,event`, 09/26/2026:

- email-scheduler: 15 of 15 success, 09/12 to 09/26, newest green 36263546794 (09/26 18:43Z). Log: "claimed 0 due schedule(s)" and "nothing due; exiting clean." The loud-failure gate exists: `scripts/email/run-schedules.mts:494-500` exits 1 when any send failed. Tests: `bun test lib/email/__tests__/scheduler.test.ts lib/email/__tests__/schedule-cadence.test.ts lib/email/emaildoc-occurrence.test.ts lib/email/sequence/__tests__/frozen-occurrence.test.ts` = 82 pass, 0 fail, 4 files.
- lifecycle-nudges-daily: 15 of 15 success, 09/12 to 09/26, newest green 36264727747. Tests: `bun test lib/project/lifecycle-nudge` = 12 pass, 0 fail.
- data-readiness-cron: 15 of 15 success, 09/12 to 09/26, newest green 36260904937 (HTTP 200). Tests: `bun test lib/email/data-readiness` = 20 pass, 0 fail.
- deliverables-retention-sweep-daily: 14 success, 1 failure (35737593505, 09/22), newest green 36246212374 (09/26). The filter can never touch a live row (`scripts/deliverables/retention-sweep.mts:52-57`, `deleted_at IS NOT NULL AND deleted_at < cutoff`), and `--dry-run` is read-only by construction (:36-50, a head count). The trash route that sets `deleted_at` is tested (`bun test app/api/deliverables` = 50 pass, 5 files); the sweep script itself has 0 direct tests.
- social-pulse-scan: 14 success, 1 failure (35747520925, 09/22). "Success" is not working, see P1. Tests: `bun test lib/social-pulse` = 17 pass, 0 fail, 7 files.
- build-example-deliverables: the last 15 runs are 07/03 to 07/17, 15 of 15 success, newest 29572723498 (07/17). No run since; the cron was disabled 07/18 (`build-example-deliverables.yml:4-7`). Tests: `bun test lib/deliverable/examples.test.ts` = 10 pass.
- mls-sync: no GitHub run history (Vercel cron). Vercel runtime logs could not be read: `get_runtime_logs` for project prj_RpRXhBmez73yyb7ODrUCx3xkwSCy returned "403 Forbidden ... do not have access". Tests: `bun test app/api/mls/sync` = 2 pass; `bun test lib/reso` = 9 pass, 4 files.
- social-scheduler, outreach-drip, outreach-demo, social-engagement-poll, weekly-read: `gh api repos/ethanrickyjrjr-wq/SWFL-Data-Gulf/actions/workflows/<file>/runs --jq .total_count` returned 0 for all five. They have never run. Their code is tested: `bun test lib/social scripts/social` = 421 pass, 0 fail, 43 files; `bun test lib/email/outreach` = 133 pass, 15 files; `bun test lib/email/weekly-read lib/email/zip-events` = 77 pass, 9 files.
- Safety gates that hold (read in code): weekly-read defaults to DRY and refuses a live send without `WEEKLY_READ_APPROVED=1` (`scripts/email/weekly-read-run.mts:94-95`, :626-630); outreach-demo defaults to DRY and needs `OUTREACH_DEMO_APPROVED=1` (`scripts/email/outreach-demo-run.mts:44-45`); outreach-drip refuses a live send without a postal address (`scripts/email/outreach-drip-run.mts:64-68`); social-scheduler needs `SOCIAL_PUBLISH_ENABLED=true` (`scripts/social/run-schedules.mts:46`).
- Incident capture works and already deduplicates: `.github/scripts/log-cron-incident.mjs:220-233` searches for an OPEN `cron-failure` issue with the workflow's tag before creating one, and :286-292 auto-closes it when the next scheduled run succeeds. The 09/22 reds became one issue each (#218, #219), both CLOSED on 09/23 (`gh issue view 218 --json closedAt` = 2026-09-23T14:15:48Z, #219 = 2026-09-23T15:23:29Z). This is one issue per incident per workflow, not one per run. Second-Opus correction: the auto-close was verified only through 09/23. It has been broken since 09/24 15:15Z, see P19. The sticky feed issue #44 hit GitHub's 2,500-comment cap, and the success-path comment throws before the discrete issue is closed.

## 4. Problems

P1. social-pulse-scan has scanned nothing since 08/09/2026 and the public page serves the zero. Severity: blocks a served number.
- Symptom: run 36250161351 (09/26) logs "swflrealestate: 0 cumulative posts" for all 14 terms, then "scan done: scan_id=84 posts=0 hashtags=0 weighted_requests=40" and "digest upserted for 2026-W39". The live page: `curl -s https://www.swfldatagulf.com/pulse` renders "Posts scanned 0" next to "Median likes".
- Root cause: `lib/social-pulse/steady-client.ts:34` returns null on any non-200 and :37 swallows exceptions ("Empty-tolerant ... never throws", :5). `scripts/social-pulse/scan.mts:4` treats zero posts as a clean exit and :66-120 still builds and upserts a digest. `app/pulse/page.tsx:17-43` renders any digest, including one with postCount 0. The vendor: `_ASSISTANT/SCRATCHPAD.md:946` records a raw SteadyAPI probe on 08/19 returning 403 "You do not have an active subscription", and :492 records "SteadyAPI is OUT, permanently, on Ricky's word". The exact cause of the 08/09 onset (five days before the 08/14 listing-side outage in the same note) is not logged anywhere I could read, because the client swallows the status code. Could not verify.
- First seen: last scan with posts 08/09/2026 11:35Z, scan_id 37 (SQL in section 2). Hashtags stopped later, not earlier: they landed through scan_id 42 on 08/14/2026 11:50Z, the same day the scratchpad dates the vendor subscription's end (`_ASSISTANT/SCRATCHPAD.md:946-948`). So the hashtag leg matches the subscription end, and the posts leg died five days before it for an unlogged reason.

P2. The pulse narrative LLM call runs on empty digests. Severity: blocks a served number (the narrative is printed on `/pulse`, `app/pulse/page.tsx:45`).
- Symptom: `select week, left(narrative,400) from social_pulse_digest where week in ('2026-W36','2026-W33')` returns prose stating "recorded a post count of 0 ... median likes at 0". Since W37 the narrative is null.
- Root cause: `scripts/social-pulse/scan.mts:104-105` calls `buildNarrative` whenever scanId > 0, with no check on post count. `lib/social-pulse/narrative.ts:33-38` swallows every error and returns null, so why W37-W39 are null is not logged. The run log confirms the null (36250161351: "digest upserted for 2026-W39 (scan 84, narrative: null)"). Could not verify the cause. It is consistent with, but not proven by, the same repo model-key secret (`social-pulse-scan.yml:31`) failing with `400 invalid_request_error` in heal run 35747601205 on 09/22 (P20). W27 and W31 are also null, and those predate that.
- First seen: W33 (built 08/16/2026) is the first narrative over a zero digest.

P3. social-pulse-scan workflow hygiene. Severity: cosmetic.
- No `permissions:` block (`social-pulse-scan.yml:18-33`); the 09/22 log (`gh run view 35747520925 --log`, GITHUB_TOKEN Permissions group) shows "Contents: write", "Issues: write", "Actions: write", "PullRequests: write" and 13 more scopes at write; only Metadata, Models and VulnerabilityAlerts are read. No `vars.ENGINE_ENABLED` gate (every other workflow in this family has one, e.g. `email-scheduler.yml:24`). No `concurrency:` group. `actions/checkout@v4` and an unpinned Bun (:23-24) where the rest use `checkout@v6` and Bun 1.3.14.
- The header still says "BOOTSTRAP CADENCE: daily until 07/26/2026" and "tracked by check social_pulse_cadence_flip" (:4-6). That flip is known-problems ledger row 5 (`docs/audit/2026-07-11-pipeline-problems/02-known-problems-ledger.md:72`, due 07/26/2026). The check is not among the 21 open checks (`node scripts/check.mjs list`, 09/26).

P4. data-readiness has an invented-number tier. Severity: blocks a consumer (the readiness record would show an invented value as a verified substitution; it does not reach a send).
- Symptom: `lib/email/data-readiness.ts:7` "Tier 3 — model answer with NO web search (ungrounded last resort) → model_only". The prompt at :204 asks "From your own knowledge, what is the current <label>". :17 "Never cancels a blast — substitutes".
- Root cause: the ladder design. An ungrounded model value recorded as the value "used" is an invented number, which the rules of engagement block (CLAUDE.md RULE 0.7b: "Only an INVENTED number blocks"). Where it goes: `logVerificationResult` inserts it into `data_readiness_alerts` (`lib/email/data-readiness.ts:441-461`); `rg -n data_readiness_alerts lib app scripts refinery components` finds only inserts (this route, `lib/signals/log-collision.ts:36`, `app/api/projects/[id]/confirm-value/route.ts:37`) and no select. The workflow header says the ops site reads it (`data-readiness-cron.yml:8`); I did not open the ops repo. Second Opus: the local ops checkout `C:\Users\ethan\dev\swfldatagulf-ops` (HEAD c540768, 07/25/2026) has no non-JSON source file naming `data_readiness` (`rg -l data_readiness --glob '!*.json'` returns nothing). The only hit is the data file `app/graph/brain-graph.json`. So "the ops site reads it" is not supported by that checkout. The ops remote after 07/25 was not checked. So the ladder is advisory: no send reads its output.
- First seen: the design, not a run. Zero alerts have ever been logged (`select count(*) from data_readiness_alerts` = 0).

P5. data-readiness uses paid model web_search on a schedule. Severity: blocks a consumer (it is the leg a decree already forbids).
- Symptom: `lib/email/data-readiness.ts:5-6` Tiers 1 and 2 are "web_search-grounded calls"; :218-225 passes the `web_search_20250305` tool. The route runs from a daily GHA cron (`data-readiness-cron.yml:16`).
- Root cause: the 07/05/2026 decree against paid web_search on a schedule. `_ASSISTANT/SCRATCHPAD.md:327-328` records corridor-pulse "paused 07/05 under the no-paid-web_search-on-a-schedule decree".
- First seen: 06/19/2026, when the GHA trigger that turned the route on was added (`git log --diff-filter=A -- .github/workflows/data-readiness-cron.yml` = 69de27ff, 06/19/2026; header at :3-8). Throttled from hourly to daily on 07/18 (:12-15).

P6. data-readiness verifies the wrong schedules (advisory, so the gap is in the record, not in a send). Severity: blocks a consumer.
- Symptom: the route checks `next_run_at` between now and now+75 min (`app/api/cron/data-readiness/route.ts:36-44`). email-scheduler claims every active row whose `next_run_at` is already due when it runs (`claim_due_email_schedules`, defined at `docs/sql/20260612_email_schedule_claim_fn.sql:35`, filter `next_run_at <= p_now` at :43). `next_run_at` is set from the tenant's `send_hour_et` (`lib/email/schedule-cadence.ts:153-168`), not from the cron tick. So a schedule for 9 am ET is due at 13:00Z, is not in the 75-minute window of a readiness run that starts at 18:00Z, and is sent unverified at the next scheduler run.
- The drift makes it worse. Scheduled data-readiness 14:40Z; actual start times in the last 15 runs ran from 17:24Z (09/12, 09/19) to 19:42Z (09/21). Scheduled email-scheduler 15:45Z; actual 17:50Z (09/12) to 20:07Z (09/21). From the same two run lists, the gap between the two starts ranged from 22 minutes (09/14) to 60 minutes (09/22).
- Root cause: two separately clocked workflows with a time-window join, on GitHub's delayed scheduler.
- First seen: 07/18/2026 (both crons throttled to daily that day, `data-readiness-cron.yml:12-15`, `email-scheduler.yml:4-5`).

P7. email-scheduler's scheduled re-render cannot reach its model. Severity: blocks a consumer (a scheduled design ships its saved prose, silently).
- Symptom: the block-canvas lane calls `buildContentDoc({ ..., mode: "quality" })` (`scripts/email/run-schedules.mts:264`). The workflow env lists no model key (`email-scheduler.yml:39-48`). `getRawClient` requires one (`refinery/agents/anthropic.mts:334-338`). The call sits in a try/catch (`lib/email/build-doc.ts:580-600`), and the scheduler falls back to the saved doc (`run-schedules.mts:265-266`, "else the ORIGINAL valid doc (applied:false)").
- Root cause: the comment at `run-schedules.mts:58-62` assumes one model call per occurrence; the workflow was never given a lane for it, and the fall-through is not counted in the run summary (:503-509 tallies sent/skipped/error only).
- First seen: could not date; no block-canvas schedule has been active since 07/13/2026 (section 2).

P8. email-scheduler sends hours late. Severity: cosmetic today (operator throttle, zero users).
- Scheduled 15:45Z, actual 17:50Z to 20:07Z over the last 15 runs, so 2 h 05 min to 4 h 22 min late, on top of the daily tick that already ignores `send_hour_et`. Known and accepted on 07/18 (`email-scheduler.yml:4-5`, "Bump back to a tighter tick once there's real send volume").

P9. The Healthchecks heartbeat reports success on red runs. Severity: blocks the signal this plan depends on.
- Symptom: run 35737593505 (09/22, red) logs "FATAL: delete failed", then the heartbeat step prints "OK".
- Root cause: `deliverables-retention-sweep-daily.yml:47-51` and `lifecycle-nudges-daily.yml:46-50` run the ping with `if: always()` to the plain success URL. Healthchecks documents failure signalling as appending `/fail` or `/<exit-status>` (https://healthchecks.io/docs/signaling_failures/, crawled 09/26) and lists `<ping-key>/<slug>/fail` for slug URLs (https://healthchecks.io/docs/http_api/, crawled 09/26).
- Scope (RULE 0.5c): `grep -rn "hc-ping" .github/workflows` returns 11 sites with the same shape: daily-rebuild, data-targets-daily, deliverables-retention-sweep-daily, freshness-probe-daily, graphify-republish, lifecycle-nudges-daily, listing-week-weekly, live-search-daily, project-feed-change-detection-daily, watch-digest-daily, watch-scan-daily. Two are this family's; the fix is one pattern for all 11.
- First seen: the heartbeat secret was created 06/28/2026 (`gh secret list`: HEALTHCHECKS_PING_KEY 2026-06-28).

P10. A database-outage red is classified UNKNOWN. Severity: cosmetic (noise).
- Symptom: issue #219 body: "Class: `UNKNOWN`", log line "error: insertScan: Could not query the database for the schema cache. Retrying." Same text in #218 (run 35737593505: "FATAL: delete failed — Could not query the database for the schema cache").
- Root cause: the TRANSIENT regex at `.github/scripts/classify-cron-failure.mjs:199` has no PostgREST schema-cache (PGRST002) wording, so it falls to UNKNOWN (:214-216), which routes to the LLM narrative (:5).
- First seen: 09/22/2026 in this family (the PGRST002 outage the brief records for 09/21).

P11. None of the twelve is watched by a freshness seam. Severity: blocks a consumer (a job can go silent with nothing noticing).
- `ingest/scripts/doctor.py:351` iterates `registry.get("pipelines", [])` only. The registry forbids freshness fields on `jobs:` rows (`ingest/tests/test_cadence_registry_spine.py:383`). The incident workflows cover only 5 of the 11 GitHub jobs: `grep -c -F '"<name>"'` against `.github/workflows/heal-cron-failure.yml` and `log-cron-incident.yml` returned 1 for Email Scheduler, Lifecycle-arc nudges (daily), Data-readiness verification (daily), Deliverables retention sweep (daily), social-pulse-scan, and 0 for Social Scheduler, Outreach Drip, Outreach Demo Cadence, Rebuild Example Deliverables, Social Engagement Poll, Market Area Alerts Cadence.
- And the seam that does watch social-pulse-scan closed its incident on the next green run (#219 CLOSED) while the scan still returns nothing. Green-on-empty is invisible to every seam we have.

P12. lifecycle-nudges reads a frozen upstream. Severity: blocks a consumer once a sequence is armed.
- `scripts/project-feed/lifecycle-nudges.mts` reads `data_lake.listing_transitions` where `source_name = 'api_feed'`. Newest api_feed row: 08/14/2026 (SQL in section 2). The listings legs are PARKED by the operator's word (brief rule 6). An armed sequence would get no nudge, and the run would be green.
- First seen: 08/14/2026.

P13. mls-sync runs daily against nothing and would hide its own failure. Severity: cosmetic today.
- No `RESO_*` variable in Vercel production (`vercel env ls production`), zero connections (SQL), and the operator's 06/26 decree keeps MLS/IDX references out "until we get our own when we get users" (`_ASSISTANT/SCRATCHPAD.md:407-408`).
- `app/api/mls/sync/route.ts:52-65` returns HTTP 200 `{synced, results}` even when every connection failed; the failure lands only in `user_mls_connections.status='error'`. Vercel runtime logs were unreadable (403), so invocation history could not be verified.

P14. The five served example deliverables lag their source brains. Severity: cosmetic (the served figures are stale but carry their own source period, so they are dated correctly).
- Tokens in section 2: every example is behind its brain (for example, market-overview carries macro-swfl v36-20260629 while macro-swfl is at v41-20260922). The live `/p/example-market-overview` cites "BLS LAUS ... 2026-M04" (`curl` of the page, visible text).
- Root cause: the rebuild cron was disabled 07/18/2026 by the operator ("don't need daily rebuilds on something that doesn't even work", `build-example-deliverables.yml:4-5`). That is his decision; the lag is the recorded consequence.

P15. outreach-drip would send live once its cron is uncommented and the shared postal variable is set. Severity: blocks a consumer (a cold-email switch with no approval env).
- `outreach-drip.yml:42`: `DRY_RUN: ${{ github.event_name == 'schedule' && 'false' || ... }}`. Its siblings hardcode DRY: `outreach-demo.yml:42` and `weekly-read.yml:36` set `DRY_RUN: "true"` and need an approval env the workflow deliberately does not pass. `scripts/email/outreach-drip-run.mts` has no approval variable (grep for APPROVED returns nothing in that file; only the postal-address refusal at :64-68).
- Second-Opus precision: uncommenting the cron alone does not send today, because `OUTREACH_POSTAL_ADDRESS` is unset (`gh variable list`) and :64-68 refuses a live send without it. But that variable is a CAN-SPAM field, not an approval. `weekly-read.yml:46` falls back to the same `vars.OUTREACH_POSTAL_ADDRESS`, so setting it for the Market Area Alerts go-live (P16) also arms drip's live path the moment its cron is uncommented. The finding stands.
- Scope (RULE 0.5c): `rg -n "event_name == 'schedule' && 'false'" .github/workflows` returns 2 sites: `outreach-drip.yml:42` and `social-engagement-poll.yml:51`. The second is cosmetic. Its live mode only reads platform metrics and upserts `social_events` (`scripts/social/poll-engagement.mts:20-21`), and nothing goes outward. Only the drip site gets a fix (item 9).

P16. The go-live checklists name secrets that do not exist, and one "one step from sending" claim needs review. Severity: cosmetic.
- `gh secret list` shows none of SDG_CRYPTO_KEY, X_CLIENT_ID, META_APP_ID (the social workflows need them, `social-scheduler.yml:51-61`). `gh variable list` shows no SOCIAL_PUBLISH_ENABLED, no OUTREACH_* and no WEEKLY_READ_* variable.
- `_ASSISTANT/SCRATCHPAD.md:288-292` says Market Area Alerts is "one operator step from sending". Verified: the runner, the approval refusal and the 1 subscriber exist. Needs review: a live send also needs a postal address (`weekly-read.yml:46` falls back to `OUTREACH_POSTAL_ADDRESS`, which is not set), so it is at least two operator steps.

P17. MLS route tests fail when run together. Severity: cosmetic.
- `bun test app/api/mls lib/reso` = 1 fail ("DELETE removes connection and returns ok", SyntaxError: Export named 'createServiceRoleClientUntyped' not found). `bun test app/api/mls/disconnect` alone = 1 pass. Cross-file module-mock bleed.

P18. Stale comments. Severity: cosmetic.
- `data-readiness-cron.yml:4-5` says "no vercel.json exists"; `vercel.json` exists with 2 crons.
- `social-pulse-scan.yml:6` names a check that is not open (P3).

P19. The incident seam stopped auto-closing issues on 09/24, and it posts one comment per green run. Severity: blocks the second record section 8 relies on. Added by the second Opus.
- Symptom: `log-cron-incident` run 36263583412, fired by email-scheduler's green 09/26 run, logs "closed check cron_incident_email_scheduler", then "GraphQL: Commenting is disabled on issues with more than 2500 comments (addComment)", then "Process completed with exit code 1". `gh api repos/ethanrickyjrjr-wq/SWFL-Data-Gulf/issues/44 --jq .comments` = 2500. `gh variable get CRON_INCIDENT_ISSUE_NUMBER` = 44.
- Scale: `gh run list --workflow log-cron-incident.yml --limit 100` = 50 failure, all from 09/24/2026 15:15Z to 09/26/2026 19:56Z, and 50 success.
- Root cause, two parts:
  - `maybeResolve` (`.github/scripts/log-cron-incident.mjs:129-146`) posts a "✅ auto-resolved" comment on the sticky issue for every green scheduled run (:141-144). It does this whether or not an incident was open.
  - That comment is not in a try/catch, unlike `recordFailure`'s at :115-120. Once the issue hit the cap, the throw at :141-144 stops `closeIncidentIssue()` at :145 from running. `closeIncidentCheck()` runs first (:140), so the ledger check still closes, but the discrete `cron-failure` issue stays open.
- This family's share: five workflows are in the listener's list (P11). Each of their green scheduled runs posted one comment on #44 before the cap, and now each one makes a red `log-cron-incident` run.
- First seen: 09/24/2026 15:15Z (the oldest failure in that run list). #218 and #219 closed on 09/23, before the cap.

P20. The heal seam's model diagnosis fires on this family's reds and is dead. Severity: cosmetic (noise plus a failed model call per red). Added by the second Opus.
- Symptom: heal run 35747601205, for the 09/22 pulse red, logs "triage: class=UNKNOWN should_retry=false needs_llm=true", then "Haiku diagnosis failed (non-fatal): 400 {"type":"error","error":{"type":"invalid_request_error", ...", then "L2: posted diagnosis on issue #219".
- Root cause:
  - `needsLlm` (`.github/scripts/classify-cron-failure.mjs:261-263`) returns true for DATA_EMPTY, SCHEMA_DRIFT and UNKNOWN.
  - The diagnose job passes the repo model-key secret (`heal-cron-failure.yml:191`), and `haikuDiagnose` (`.github/scripts/heal-cron-failure.mjs:213-231`) calls `claude-haiku-4-5` with it.
  - The fallback deterministic diagnosis is posted anyway.
- Knock-on for item 3: its proposed exit text "all terms returned 0" matches DATA_EMPTY's regex (`classify-cron-failure.mjs:167-172`, "returned 0"). A daily-red pulse scan would therefore trigger a model call and an issue comment every day. Item 3 is reworded to a class with `needs_llm=false`.
- First seen: 09/22/2026 in this family.

## 5. What is missing

- vs source_ceiling: not applicable; no job carries one (section 1). The meaningful ceiling is the social pulse vendor, and that vendor is gone. The brief's rule 6 and global rule 9 both apply: a replacement Instagram source is a new vendor and needs a three-alternative live comparison on `wiki/tool-discovery.md` before it enters. I did not run that search; it is the operator question in section 12.
- vs what the consumer needs:
  - `/pulse` needs a way to say "no scan this week" instead of printing 0 (P1).
  - The email scheduler needs verification of the rows it actually sends (P6), and a counted outcome when the AI refill falls through (P7).
  - The sequence nudge surface needs an upstream that moves, or a visible "listing data paused" state (P12).
- vs data-roots: none of these tables is a data root for a served SWFL figure; `docs/standards/data-roots.md` names `weekly-read/zip-seed` cards only as a consumer of `listing_active_stats` (line 80), which is family 01's root.
- Monitoring that should exist and does not: a failure signal for the 11 GitHub jobs that does not depend on `pipelines:` fields (P11), and a green-on-empty guard for the one job that scans an outside source (P1).
- Tests missing: `scripts/deliverables/retention-sweep.mts` (0 direct tests), `app/api/cron/data-readiness/route.ts` (0 test files, `git ls-files`), `scripts/social-pulse/scan.mts` (0 test files for the adapter; the lib has 17 tests).
- Consumers that should exist and do not: `social_pulse_posts` and `social_pulse_hashtags` are read only by the scan itself and a migrate script (`rg -l social_pulse_posts lib app refinery scripts`); only the digest is served. `data_lake.user_mls_*` has no reader outside the MLS routes, which is correct for a client-private surface.

## 6. Verdict per pipeline

- email-scheduler — IMPROVE. Runs clean, but its AI refill has no lane and its verification partner checks the wrong rows. Number that changes it: active `block-canvas` schedules (0 today by SQL); at 1 or more it becomes REPAIR until P6 and P7 land.
- social-scheduler — PARK (stays). Zero runs ever, zero accounts. Number: `social_accounts` rows above 0.
- outreach-drip — PARK (stays), with one guard fix (P15). Number: `outreach_recipients` rows above 0.
- outreach-demo — PARK (stays). Number: `outreach_recipients` rows with a demo campaign above 0.
- lifecycle-nudges-daily — IMPROVE. Green, but it cannot tell "nothing to do" from "upstream frozen". Number: armed sequences with an address_key (0 today); at 1 or more with api_feed transitions older than 3 days it is REPAIR.
- data-readiness-cron — REPAIR. Paid web_search on every metric of every due schedule, an invented-value tier, and a window that misses the sent set, all for a record no send reads. Number: `data_readiness_alerts` rows with `tier_used` in (web_consensus, web_single, model_only) (0 today); any row above 0 means a scheduled paid or invented lookup ran.
- mls-sync — PARK (the cron removal is ASK-FIRST; MLS surfaces were on the freeze list he rejected on 07/19). No credentials, no connections, a decree against MLS references. Number: `user_mls_connections` rows above 0 or a `RESO_*` variable in Vercel production.
- build-example-deliverables — PARK (stays disabled by the operator's word). Number: examples behind their source brain token, 5 of 5 today; it matters only if he wants the examples current.
- deliverables-retention-sweep-daily — GOOD ENOUGH once the heartbeat reports failures. Number: rows with `deleted_at` older than 8 days after a green run (0 today).
- social-engagement-poll — PARK (stays). Number: `social_posts` rows with a platform_post_id above 0.
- social-pulse-scan — PARK recommended, ASK-FIRST (his call per the 07/19 freeze rejection); guard the page now. The vendor is out by his decision and every scan since 08/09 is empty. Number: posts per scan (0 on all 47 scans from scan_id 38 to 84, i.e. every scan after 08/09/2026 11:35Z, per the `where id > 37 and exists` query in section 2); a replacement source that returns above 0 re-opens it.
- weekly-read — PARK (stays; approval-locked by design). Number: `WEEKLY_READ_APPROVED` set plus a postal address variable.

## 7. The plan

Ordered. Lane D is deterministic (GitHub `ubuntu-latest`, the Fedora runner, or a Hermes `no_agent` job). No item uses a model.

1. DO — Stop `/pulse` serving a zero digest.
   - What: in `app/pulse/page.tsx:17-43`, treat a digest whose `swfl.postCount` is 0 the same as no digest, and show the existing "first weekly scan hasn't landed" empty state, reworded to "The weekly scan is paused." Suppress the narrative in that case.
   - Lane D. Effort S.
   - Proof: `curl -s https://www.swfldatagulf.com/pulse | grep -c "Posts scanned"` returns 0 after deploy plus the page's 1-hour revalidate (`app/pulse/page.tsx:8`, `revalidate = 3600`).
   - Unblocks: P1 and P2 stop reaching readers the same day.
2. DO — Fix the social pulse workflow hygiene (P3, P18).
   - What: in `social-pulse-scan.yml`, add `permissions: contents: read`, the `vars.ENGINE_ENABLED` gate and a `concurrency:` group, pin `actions/checkout@v6` and Bun 1.3.14 like its siblings, and delete the dead cadence-flip note (:4-6). The schedule stays as it is until item 17 is answered.
   - Lane D. Effort S.
   - Proof: `grep -c "ENGINE_ENABLED\|permissions:\|concurrency:" .github/workflows/social-pulse-scan.yml` returns 3.
   - Unblocks: the job stops holding a write-all token.
3. DO — Make the scan refuse an empty result.
   - What: in `scripts/social-pulse/scan.mts:62-66`, when `result.posts === 0 && result.hashtags === 0` across every term, finish the scan row as `status: 'partial'`, skip the digest and the narrative, and exit 1 with "[content-guard] social pulse: every term came back empty; vendor or key dead". Second-Opus correction: the first draft's wording "all terms returned 0" matches the classifier's DATA_EMPTY regex (`.github/scripts/classify-cron-failure.mjs:167-172`). DATA_EMPTY has `needs_llm=true` (:261-263), so every daily red would fire heal's model diagnosis and an issue comment (P20). The `[content-guard]` token maps to CONTENT_STALE (:157-162; the check sits after seven earlier classes at :49-144, none of whose patterns the line matches), which comes before DATA_EMPTY, has `needs_llm=false` and is never auto-retried. Keep the words "returned 0" out of the line. Use 'partial' because the column has a CHECK allowing only 'ok', 'partial', 'dry' (`select pg_get_constraintdef(c.oid) from pg_constraint c join pg_class t on t.oid=c.conrelid where t.relname='social_pulse_scans'`); a new value would be a schema change. This keeps the lesson if the job is ever re-sourced.
   - Lane D. Effort S. Add one test in `lib/social-pulse/scan.test.ts` named for the failure mode (empty scan must not publish a digest).
   - Proof: `bun test lib/social-pulse` green with the new test; `DRY_RUN=true` stays read-only (the dry writer at :17-26 never writes).
   - Unblocks: green-on-empty cannot recur on this job.
4. DO — Fix the Healthchecks heartbeat so it reports failure (P9).
   - What: replace the single `if: always()` ping with two steps: `if: success()` pings `.../<slug>?create=1`, `if: failure()` pings `.../<slug>/fail?create=1`. This family's two sites are `lifecycle-nudges-daily.yml:46-50` and `deliverables-retention-sweep-daily.yml:47-51`. The same defect sits at nine more sites (listed in P9, owned by families 01, 02, 16 and 18). Scope-before-fix says all 11 land in one pass; that pass touches more than 5 files, which RULE 1 puts on the ask-first list, so the 11-file commit is handed to family 19's consolidated list. This family's DO is the pattern and its two files.
   - Lane D. Effort S.
   - Verified by the second Opus: https://healthchecks.io/docs/http_api/ (crawl4ai, 09/26) lists `create=0|1` under "Query Parameters" for `https://hc-ping.com/<ping-key>/<slug>/fail`. So `.../<slug>/fail?create=1` is documented, and no throwaway-slug test is needed.
   - Proof: `grep -c "/fail" .github/workflows/lifecycle-nudges-daily.yml .github/workflows/deliverables-retention-sweep-daily.yml` returns 1 for each; after family 19's pass, `grep -rn "hc-ping" .github/workflows | grep -c "/fail"` returns 11.
   - Unblocks: section 8's signal.
5. DO — Add the heartbeat to the live jobs that lack one.
   - What: add the same two-step ping to `email-scheduler.yml` and `data-readiness-cron.yml`. Slugs: `email-scheduler`, `data-readiness-cron`.
   - Lane D. Effort S.
   - Proof: `grep -n "hc-ping" .github/workflows/email-scheduler.yml` returns 2 lines.
   - Unblocks: every live job in the family has one signal.
6. DO — Make the scheduled readiness run deterministic and point it at the rows that will be sent (P4, P5, P6).
   - What: in `app/api/cron/data-readiness/route.ts:76`, pass a lookup that returns no value: `verifyMetricItem(item, asOf, { lookup: async () => ({ value: null, sourceUrls: [], error: null }) })`. `verifyMetricItem` already takes `deps.lookup` (`lib/email/data-readiness.ts:254-259`), and every tier from 1 to 3 goes through it (the model_only call at :394 is `lookup({ ..., grounded: false })`), so the ladder falls to `last_known` (token age within `max_stale_days`, :407-424) or `omitted` (:427-436). No model, no web_search, and the shared module is untouched. That matters because `lib/deliverable/band-guard-web.ts:9,20` also calls `verifyMetricItem` for the flag-gated band guard in interactive deliverable builds, which this family does not own. In the same file (:39-44), drop the lower bound so overdue active rows are included: `next_run_at <= now + 75 min`.
   - Lane D. Effort S. Two files: the route and a new `app/api/cron/data-readiness/route.test.ts` whose first case is named for the failure mode ("scheduled readiness never calls a model").
   - Proof: `grep -n "lookup:" app/api/cron/data-readiness/route.ts` returns 1 line; `bun test app/api/cron/data-readiness` green; `bunx next build` green.
   - Unblocks: P4 and P5 close for the scheduled path; P6 closes for overdue rows.
7. DO — Count the AI-refill fall-through in the scheduler (P7).
   - What: in `scripts/email/run-schedules.mts:263-266`, when `buildContentDoc` returns `applied:false`, log `REFILL SKIPPED schedule=<id>` and add a `refill_skipped` count to the summary at :503-509. Do not change what is sent; that is question 2.
   - Lane D. Effort S.
   - Proof: `bun test lib/email/emaildoc-occurrence.test.ts` green with a new case asserting the log line.
   - Unblocks: the operator can see how often a scheduled email ships its saved prose.
8. DO — Give lifecycle-nudges an upstream staleness guard (P12).
   - What: in `scripts/project-feed/lifecycle-nudges.mts`, after loading armed sequences (and only if there is at least one), read `max(at)` from `data_lake.listing_transitions` where `source_name='api_feed'`. If it is older than 3 days, print "listing transitions frozen since <MM/DD/YYYY> — nudges cannot fire" and exit 1.
   - Lane D. Effort S. One failing test first in `lib/project/lifecycle-nudge.test.ts` or a new adapter test.
   - Proof: `bun scripts/project-feed/lifecycle-nudges.mts --dry-run` still prints "nothing to do" today (0 armed sequences), and the new test is green.
   - Unblocks: the first armed sequence cannot sit silently un-nudged.
9. DO — Put an approval gate on outreach-drip (P15).
   - What: hardcode `DRY_RUN: "true"` in `outreach-drip.yml:42` to match its siblings, and add `OUTREACH_DRIP_APPROVED === "1"` as a live-send requirement next to the postal check at `scripts/email/outreach-drip-run.mts:64-68`.
   - Lane D. Effort S.
   - Proof: `grep -n 'DRY_RUN: "true"' .github/workflows/outreach-drip.yml` returns 1 line; `bun test lib/email/outreach` green.
   - Unblocks: uncommenting the cron can no longer send cold email by itself.
10. DO — Make mls-sync report failure (P13).
    - What: in `app/api/mls/sync/route.ts:65`, return status 500 when any result has `ok: false`.
    - Lane D. Effort S.
    - Proof: `bun test app/api/mls/sync` green with a new "any failed connection returns 500" case.
    - Unblocks: if a board is ever connected, a failed sync is not a 200.
11. DO — Classify PGRST002 as TRANSIENT (P10). Owner: family 19.
    - What: add `Could not query the database for the schema cache|PGRST002` to the regex at `.github/scripts/classify-cron-failure.mjs:199`, with a unit test on the #219 log line.
    - Lane D. Effort S.
    - Proof: `node --test .github/scripts/` green, with the new case returning TRANSIENT.
    - Unblocks: an outage red is retried once, not routed to a model narrative.
12. DO — Fix the MLS test bleed and the stale comment (P17, P18).
    - What: make `app/api/mls/disconnect/route.test.ts`'s service-role mock export `createServiceRoleClientUntyped`, and correct `data-readiness-cron.yml:4-5` (moot if item 6 retires the file).
    - Lane D. Effort S.
    - Proof: `bun test app/api/mls lib/reso` = 0 fail.
13. DO — Add a sweep test (section 5).
    - What: a test for `scripts/deliverables/retention-sweep.mts` that the filter never touches `deleted_at IS NULL`, with the DB seam injected.
    - Lane D. Effort S.
    - Proof: `bun test scripts/deliverables` shows at least 1 pass.
14. ASK-FIRST — Remove the mls-sync Vercel cron until a board is contracted.
    - What: delete the `/api/mls/sync` entry from `vercel.json:3-6` and the `mls-sync` row at `ingest/cadence_registry.yaml:2747-2750` in one commit. `ingest/tests/test_cadence_registry_spine.py:386-398` asserts every `vercel.json#` job has a matching cron path, so the two must move together. The route stays for the user-triggered POST.
    - Lane D. Effort S. Structure change to a product surface, so it needs his word.
    - Proof: `pytest -q ingest/tests/test_cadence_registry_spine.py` passes and `node scripts/schedule-catalog.mjs | grep -c mls-sync` returns 0.
15. ASK-FIRST — Decide the example deliverables (P14).
    - What: either leave them frozen, or rebuild all 5 once. His 07/18 kill of the daily cron stands either way; no daily clock comes back. A rebuild needs a narrative lane; see section 10.
    - Proof if he picks a rebuild: `select id, items_snapshot->0->>'freshness_token' from deliverables where is_example` matches the `brains/<id>.md` tokens.
16. ASK-FIRST — The social pulse replacement source, if he wants `/pulse` back. See question 1.
17. ASK-FIRST — Park the social pulse scan.
    - What: comment the `schedule:` in `social-pulse-scan.yml:9-10` with a header naming the reason (vendor OUT by his word; last scan with posts 08/09/2026) and add `status: parked` under `ingest/cadence_registry.yaml:2740-2742`. Until he answers, item 3 makes the daily run go red with a named cause instead of green on nothing.
    - Lane D. Effort S.
    - Proof: `gh workflow view social-pulse-scan.yml` shows no schedule; `pytest -q ingest/tests/test_cadence_registry_spine.py` passes (allowed status values "disabled" and "parked", :372).
18. ASK-FIRST — Decide what readiness is for.
    - What: after item 6, the readiness run records a result no send reads (P4). Either wire it into `scripts/email/run-schedules.mts` as a real pre-send gate (read the latest `data_readiness_alerts` row per metric and refuse or annotate an `omitted` figure), or retire `data-readiness-cron.yml` with its registry row `:2705-2707` and its names in `heal-cron-failure.yml` and `log-cron-incident.yml`. Both change product behavior, so they are his call.
    - Lane D. Effort M (wire) or S (retire).
    - Proof (retire): `node scripts/schedule-catalog.mjs | grep -c data-readiness-cron` returns 0 and `pytest -q ingest/tests/test_cadence_registry_spine.py` passes.

19. DO — Make the incident seam's success path stop commenting per run, and close issues again (P19). Owner: family 19, like item 11. It is listed here because section 8 depends on it.
    - What: two changes in `.github/scripts/log-cron-incident.mjs`.
      - In `maybeResolve` (:129-146), post the "✅ auto-resolved" comment only when `closeIncidentIssue()` actually found an open incident issue, not on every green run.
      - Wrap that call in try/catch, as `recordFailure` does at :115-120, so a comment failure can never skip `closeIncidentIssue()` at :145.
    - Retire the sticky feed: unset `vars.CRON_INCIDENT_ISSUE_NUMBER` (44), which makes `postComment` a no-op on both paths (:115, :141). Issue #44 has been at the 2,500-comment cap since 09/24 and can take no more comments. Unsetting a repo variable is a settings change, not a code change; it is reversible in seconds.
    - Lane D. Effort S.
    - Proof: `node --test .github/scripts/log-cron-incident.dryrun.test.mjs` green with a new case, "success with no open incident posts no comment". Then `gh run list --workflow log-cron-incident.yml --limit 15 --json conclusion` shows no failure after the next green of any listed workflow.
    - Unblocks: the discrete `cron-failure` issue auto-closes again, and no GitHub write happens per green run.

No item, by design: social-scheduler, outreach-demo, social-engagement-poll and weekly-read stay PARKED with no plan item. Added by the second Opus so every pipeline is named in this section.
- Evidence: `gh api repos/ethanrickyjrjr-wq/SWFL-Data-Gulf/actions/workflows/<file>/runs --jq .total_count` = 0 for each. SQL shows `social_schedules`, `social_posts`, `social_accounts`, `outreach_recipients`, `outreach_events` and `social_events` = 0, and `weekly_read_subscribers` = 1 active with 0 issues sent.
- Each already refuses a live action on its own: `SOCIAL_PUBLISH_ENABLED` is unset; outreach-demo and weekly-read hardcode `DRY_RUN: "true"`; social-engagement-poll only records metrics (P15).
- Their go-live condition is in section 8: add the workflow to both listener lists, plus the two-step heartbeat.
- outreach-drip is the one parked job that gets an item (9), because its live path has no approval gate.

Count: 14 DO (items 11 and 19 are owned by family 19), 5 ASK-FIRST. Second-Opus correction: the first draft carried two contradictory count lines ("13 DO, 5 ASK-FIRST" and "13 DO, 3 ASK-FIRST"). Items 14-18 are 5 ASK-FIRST.

## 8. Checks and balances

The design constraint the evidence imposes: the doctor, `check_freshness.py`, the registry's `freshness_sla` / `expected_rows_min`, and the `/coverage` page all read `pipelines:` rows (`ingest/scripts/doctor.py:351`), and the registry test forbids those fields on `jobs:` rows (`ingest/tests/test_cadence_registry_spine.py:383`). Adding a field nothing reads would be a rule only in a doc. So the family's one signal is the Healthchecks heartbeat, fixed to report failure (item 4). It already exists, costs nothing, files no GitHub issue, and clears itself on the next good ping. It adds one thing the incident seam cannot: a job that stops firing at all (a disabled workflow, a runner that never picks it up) produces no red run for `log-cron-incident.yml` to see, but it does miss its heartbeat. One thing I could not verify: where the Healthchecks account sends its alerts; the account is not visible from the repo. Section 11 lists it. The incident issue seam stays as the second, human-readable record. It keeps one open issue per workflow (`log-cron-incident.mjs:218-233`). Its auto-close on the next green (:283-298) is broken since 09/24 and needs item 19 first (P19). The same seam also reopens one `cron_incident_<workflow>` row in `public.checks` per red (:151-158, `node scripts/check.mjs reopen`) and closes it on the next green (:173). That is one ledger row per incident, not per run, and it already works: run 36263583412 logged "closed check cron_incident_email_scheduler".

One signal per pipeline:
- email-scheduler: heartbeat slug `email-scheduler` (item 5). Fires when the run goes red, which already happens on any failed send (`run-schedules.mts:494-500`). Clears on the next green.
- data-readiness-cron: heartbeat slug `data-readiness-cron` (item 5). Fires when the route returns non-200 (`data-readiness-cron.yml:43` already fails the step then). After item 6 it makes no paid call, so a red run means our route or database is down, not a vendor. If item 18 retires it, the signal goes with it.
- lifecycle-nudges-daily: heartbeat slug `lifecycle-nudges-daily` with `/fail` (item 4). After item 8 it also fires when an armed sequence meets a frozen upstream. It stays quiet while there are zero armed sequences, which is correct: nobody is waiting on a nudge.
- deliverables-retention-sweep-daily: heartbeat slug `deliverables-retention-sweep-daily` with `/fail` (item 4). Fires on a failed delete.
- social-pulse-scan: until item 17 is answered, item 3 turns an empty scan into a red run with a named cause. It is already in the incident lists (P11), so that is one open `cron-failure` issue plus one `cron_incident_social_pulse_scan` check row that stay open while the vendor is dead, not one per day (`log-cron-incident.mjs:218-233` dedups on the open issue; the check is `reopen`ed, :151-158). Two per-run side effects are closed off by other items. The heal model diagnosis and its issue comment would fire on every red if the exit line classified as DATA_EMPTY or UNKNOWN; item 3's `[content-guard]` wording routes it to CONTENT_STALE with `needs_llm=false` (P20). The per-run sticky-feed comment goes with item 19. Once parked, no signal: there is no job to watch, and the page guard (item 1) makes a zero digest impossible to serve. If it is re-sourced, item 3 plus a heartbeat is the signal.
- mls-sync: none while there are zero connections, because nothing can go wrong for a reader. After item 10, a failed sync returns 500. If a board is connected, the move is to trigger it from a GHA curl job shaped like `data-readiness-cron.yml:32-43` (`test "$code" = "200"`), so the existing incident seam and a heartbeat cover it. Vercel's cron gives us no incident seam of our own.
- build-example-deliverables: none while disabled. If he picks a rebuild, the rebuild job's exit code (`scripts/build-example-deliverables.mts:43-46` already exits 1 on any failed scenario) plus a heartbeat.
- social-scheduler, outreach-drip, outreach-demo, social-engagement-poll, weekly-read: none while parked. Each has 0 runs and empty tables (section 3), so a signal would watch nothing. Go-live condition for each: add its workflow name to the `workflows:` lists in `heal-cron-failure.yml` and `log-cron-incident.yml` (all five return 0 hits today, P11) and add the two-step heartbeat. That is one line in each go-live checklist comment, written when the cron is uncommented.

Noise to delete:
- The success ping on red runs: this family's 2 sites now, all 11 `hc-ping` sites through family 19 (item 4).
- The UNKNOWN classification of the PGRST002 outage, which sent two 09/22 incidents (#218, #219) to the model-narrative route (item 11).
- The daily pulse narrative call over an empty digest (item 3, and item 17 if he parks the scan).
- The two paid web_search calls per metric in the scheduled readiness run (item 6).
- The stale cadence-flip reference in `social-pulse-scan.yml:4-6` (item 2).
- The per-green-run "✅ auto-resolved" comment on sticky issue #44 (`log-cron-incident.mjs:141-144`) and the repo variable `CRON_INCIDENT_ISSUE_NUMBER=44` that turns it on (item 19). #44 ("Cron incident feed (do not close)") is at 2,500 comments. Every green scheduled run of the five listed family workflows now makes `log-cron-incident` exit red (50 of its last 100 runs, since 09/24 15:15Z).
- The heal model diagnosis on this family's reds (P20). Item 11 moves PGRST002 to TRANSIENT, and item 3 emits a CONTENT_STALE line, so neither reaches `needs_llm`.
- Labels and checks kept: the `cron-failure` label and the `cron_incident_*` check keys stay. They are one per incident, and they close themselves.

Nothing to add to `node scripts/check.mjs`: none of the 21 open checks is in this family (`node scripts/check.mjs list`, 09/26; `cron_incident_social_pulse_scan` and `cron_incident_deliverables_retention_sweep_daily` are not among them), and the 09/15 bankruptcy stands. The only ledger rows this family can produce are the incident seam's auto-opened `cron_incident_<workflow>` rows, one per incident. Items 1-13 and 19 close inside this plan; none needs a ledger row. The ops site is unchanged: `/coverage` is about `pipelines:` rows, and these jobs do not belong on it.

## 9. Box placement

All eleven GitHub jobs stay on GHA `ubuntu-latest`, and mls-sync stays a Vercel route. Checked against each of the brief's reasons:
- WAF or residential IP: none. The jobs talk to our own Supabase, our own Vercel host (`data-readiness-cron.yml:37-39`), Resend, and the social platforms' official APIs. The one outside scrape (SteadyAPI Instagram) is being parked, not moved.
- Job longer than 6 h: none. Every timeout is 10 or 15 minutes (`timeout-minutes` in each YAML). One sampled run, 36264727747, was created at 19:03:47Z, logged its first line at 19:03:50Z and its heartbeat at 19:04:25Z (`gh run view 36264727747 --log`).
- Needs the SSD archive: none; they keep no raw captures.
- Needs a browser: none. `renderSocialImage` in social-scheduler (`scripts/social/run-schedules.mts:37`) renders SVG to PNG with `@resvg/resvg-js` in-process (`lib/social/render-social-image.ts:6-10`); no browser.
- Needs a local model: none; section 10 removes or parks every model leg.

Per pipeline, with the reason:
- email-scheduler: stays `ubuntu-latest`. Talks only to our Supabase and our own `/api/email/broadcast` (`scripts/email/run-schedules.mts:375`); 10-minute timeout; no outside host.
- social-scheduler: stays `ubuntu-latest`. Posts through the platforms' official APIs with OAuth tokens; images render in-process with resvg; never run.
- outreach-drip: stays `ubuntu-latest`. Sends through Resend's API and reads our lake; the only outside fetch is the brand-signal read of a prospect's own homepage (`lib/prospects/enrich-brand.ts`), which the code gives no WAF handling and so shows no residential-IP need; never run.
- outreach-demo: stays `ubuntu-latest`. Same Resend and lake seams, DRY-only in the workflow; never run.
- lifecycle-nudges-daily: stays `ubuntu-latest`. Two reads and one upsert on our own Supabase; 15-minute timeout.
- data-readiness-cron: stays `ubuntu-latest`. It is one curl to our own Vercel host (`data-readiness-cron.yml:37-39`); after item 6 the route calls nothing outside.
- mls-sync: stays a Vercel route. It is a Vercel cron by construction; there is no GHA job to move, and no board credentials exist.
- build-example-deliverables: stays `ubuntu-latest` and disabled. If he picks a rebuild, the narrative leg follows the lane named in section 10, not the box. Only if he picks an unattended rebuild does it move. Then that job moves to the Fedora runner with the reason "needs the Max login, not an API key" (Lane M): `runs-on: ${{ vars.SWFL_LOCAL_RUNNER_READY == 'true' && fromJSON('["self-hosted","swfl-local"]') || 'ubuntu-latest' }}`, the pattern already live at `.github/workflows/ingest-collier-official-records.yml:31`. The model-key secret must also leave that step's env. Evidence the gate is open: `gh variable get SWFL_LOCAL_RUNNER_READY` = true, and `gh api repos/ethanrickyjrjr-wq/SWFL-Data-Gulf/actions/runners` = 1 runner, `fedora-swfl-local online self-hosted,Linux,X64,swfl-local`. The fallback to `ubuntu-latest` has no Max login, so the step must refuse, not fall back to a key, when it lands there.
- deliverables-retention-sweep-daily: stays `ubuntu-latest`. A bounded DELETE on our own Supabase; 10-minute timeout.
- social-engagement-poll: stays `ubuntu-latest`. Reads metrics through the platforms' official APIs; never run.
- social-pulse-scan: stays `ubuntu-latest` while it runs, nowhere once item 17 is answered. Its only outside host is a vendor that is OUT; moving a dead call to a residential IP fixes nothing.
- weekly-read: stays `ubuntu-latest`. Deterministic detector over our lake plus Resend; DRY-only in the workflow; never run.

Already on the box that should not be: none from this family. `grep -n "runs-on"` in all eleven workflows returns `ubuntu-latest` only.

One conditional: if the operator answers question 2 with "fresh prose on every scheduled send" and names a model lane, that leg would run as a separate step and belongs wherever that lane lives. Nothing moves before he answers.

## 10. Compute lane per LLM leg

How the list was proven: a scratchpad import walker (`llmwalk17.mts`) that follows every static `import ... from` and literal `await import("...")` from each entry file and flags files matching `getAnthropic\(|messages\.create\(|api\.anthropic\.com|from "openai"|api\.openai\.com|ollama`. Its blind spot: a dynamic import with a non-literal specifier. Output:
- `scripts/email/run-schedules.mts`: 292 files reachable; 12 LLM files reachable (`lib/email/build-doc.ts`, `lib/assistant/web-fallback.ts`, `lib/assistant/gap-fill.ts`, `refinery/agents/anthropic.mts`, `lib/email/listing-scrape.ts`, and 7 recipe files under `lib/deliverable/recipes/`). Invoked on the cron path: only `buildContentDoc` (`run-schedules.mts:264`). The rest are reachable through build-doc's imports; which of them a given saved design triggers depends on the design. Not verified per design.
- `scripts/email/outreach-drip-run.mts`: `lib/prospects/enrich-brand.ts` (invoked at `outreach-drip-run.mts:110`).
- `app/api/cron/data-readiness/route.ts`: `lib/email/data-readiness.ts` (invoked).
- `scripts/build-example-deliverables.mts`: `lib/deliverable/build.ts` (invoked via `buildDeliverableNarrative`, `lib/deliverable/examples.ts:146`) and `lib/email/data-readiness.ts` (reachable only, through `lib/deliverable/band-guard-web.ts:9`; not called because `examples.ts:146-150` passes no `priorItems`).
- `scripts/social-pulse/scan.mts`: `lib/social-pulse/narrative.ts` (invoked at `scan.mts:104-105`).
- NONE for `scripts/social/run-schedules.mts` (31 files), `scripts/email/outreach-demo-run.mts` (49), `scripts/project-feed/lifecycle-nudges.mts` (6), `app/api/mls/sync/route.ts` (8), `scripts/deliverables/retention-sweep.mts` (2), `scripts/social/poll-engagement.mts` (5), `scripts/email/weekly-read-run.mts` (97). The weekly-read header's "zero LLM calls" claim (`weekly-read.yml:7-8`) is verified.

The invoked legs, five in the family's own code and a sixth in the shared failure listener:

1. data-readiness ladder. What: Tiers 1-3 ask a model for a current metric value, with and without web_search (`lib/email/data-readiness.ts:5-7`, :213-227, model at :111). Current auth: the Vercel production environment has a model key variable (`vercel env ls production`). Replacement: no model on the scheduled path. The cron route injects a null lookup (item 6), so the ladder ends at `last_known` or `omitted`. An ungrounded value is invention and paid search on a schedule is already decreed out (P4, P5), so there is nothing to re-route. The shared function keeps its grounded default for the interactive band guard (`lib/deliverable/band-guard-web.ts:20`), which belongs to another family.
2. email-scheduler block-canvas refill. What: re-writes the empty blocks of a saved Email Lab design with fresh commentary (`lib/email/build-doc.ts:580-600`, model from `resolveEmailModel("quality")` = `claude-sonnet-4-6`, `lib/email/model-router.ts:14,21`). Current auth: none in the workflow env (`email-scheduler.yml:39-48`); the call fails into the catch and the saved doc ships. Replacement: deterministic first. The frozen-occurrence lane already exists and sends a saved doc verbatim (`scripts/email/run-schedules.mts:305-334`; the quote "no AI refill (freeze-at-schedule, operator-locked 07/05/2026)" is at :307). This is customer-facing content sent to the tenant's audience, so the brief's "internal, Max is fine" premise does not cover it cleanly. Whether a scheduled send needs fresh prose at all is question 2. Item 7 makes the fall-through visible in the meantime.
3. build-example-deliverables narrative. What: a forced-tool narrative over the harvested metrics (`lib/deliverable/build.ts:349-351`, `DELIVERABLE_MODEL` defaulting to `SYNTHESIS_MODEL` = `claude-sonnet-4-6`, `refinery/agents/anthropic.mts:8`). Current auth: `build-example-deliverables.yml:41` passes the repo model-key secret; the job is disabled. Replacement if he picks a rebuild (item 15): Lane M as an interactive Max session authoring the five narratives directly (the Issue 001 pattern). Five documents, once, is exactly that pattern's size, and it avoids new unattended wiring. If it must be unattended, an unattended `claude -p` on the Fedora runner with the Max login, with the model-key variable removed from that step's environment first. `wiki/pipeline-health.md:83-87` records that the key wins over `CLAUDE_CODE_OAUTH_TOKEN` in `-p` mode, and that bun loads the local dotenv file. The examples are a free public showcase, not a sold deliverable; I record that once and do not relitigate the terms paragraph.
4. social pulse narrative. What: a 3-5 sentence weekly brief over the digest (`lib/social-pulse/narrative.ts:16-26`, model `claude-sonnet-5` unless `PULSE_NARRATIVE_MODEL`). Current auth: `social-pulse-scan.yml:31` passes the repo model-key secret; the output has been null since W37 and the cause is not logged (P2). Replacement: none; the leg is parked with the scan (item 2) and skipped on empty data (item 3). If the pulse comes back, the narrative can be a deterministic template over `computeDigest`'s figures (post count, median likes, top format), with no model.
5. outreach-drip brand enrichment. What: picks a prospect's brand colors and logo from scraped page signals (`lib/prospects/enrich-brand.ts:187-189`, `TRIAGE_MODEL` = `claude-haiku-4-5`, `refinery/agents/anthropic.mts:6`). Current auth: no model key in `outreach-drip.yml:39-56`; the job has never run. Replacement: deterministic. The inputs are already structured (`theme_color`, `og_image`, `favicon`, `css_var_colors`, `selector_colors`, `enrich-brand.ts:175-183`); a rule of "theme_color, else the most frequent non-neutral CSS variable color, logo = og_image else favicon" needs no model. Parked with the drip; do it at go-live.

6. Heal-cron-failure L2 diagnosis. This is a cross-family leg the family's reds trigger, added by the second Opus; the brief's grep of the family YAMLs does not show it because it lives in the listener.
   - What: a 3-line model diagnosis of a failed run's log tail (`.github/scripts/heal-cron-failure.mjs:213-231`, `claude-haiku-4-5`). It runs when `needsLlm(klass)` is true (DATA_EMPTY, SCHEMA_DRIFT, UNKNOWN; `classify-cron-failure.mjs:261-263`).
   - Current auth: the repo model-key secret (`heal-cron-failure.yml:191`). It is dead: heal run 35747601205 (09/22, this family's pulse red) logged "Haiku diagnosis failed (non-fatal): 400 ... invalid_request_error", and then posted the deterministic diagnosis on #219 anyway.
   - Replacement: Lane D, deterministic. The no-model diagnosis already posts when the call fails (:214-217 is the no-key path; the failure path posts too). For this family, item 11 (PGRST002 becomes TRANSIENT) and item 3's CONTENT_STALE wording keep its reds off the leg entirely.
   - Owner of the leg itself: family 19. Whether it gets a Max-lane replacement is theirs to plan, not this family's.

Grep proof for the list above:
- `rg -n -i "anthropic|claude|openai|refinery" .github/workflows/{the eleven family files}` returns 3 lines: `weekly-read.yml:8` (a comment saying there are none), `social-pulse-scan.yml:31` (leg 4) and `build-example-deliverables.yml:41` (leg 3).
- The walker covers legs 1, 2 and 5, whose keys come from the Vercel env or are absent.
- The listener grep (`rg -n -i "anthropic" .github/workflows/heal-cron-failure.yml`) adds leg 6.

None of the six needs a model lane before the operator answers question 2 or item 15.

## 11. Double-check log

I re-read this file top to bottom and re-checked each numbered claim against the command or file named. Corrections are applied in the sections above.

- Registry line numbers 2659, 2662, 2665, 2690, 2693, 2694, 2697, 2701, 2704, 2705, 2727, 2736, 2739, 2740, 2743, 2746, 2747, 2750, 2758. `grep -n "name: ..." ingest/cadence_registry.yaml` and `sed -n 2600,2766p`. Verified.
- Registry forbids ingest fields on jobs (:2628-2629; test :383) and allows status "disabled"/"parked" (test :372). `sed -n 344,400p ingest/tests/test_cadence_registry_spine.py`. Verified. The vercel pairing test is `test_jobs_workflows_exist_and_are_not_double_registered` at :386, its assert at :397. Verified.
- coverage_exempt lines for user_mls_* (:2607-2613). `sed -n 2600,2622p`. Verified.
- Workflow crons, runners, timeouts, env lists. `cat -n` of the eleven YAML files. Verified. All eleven `runs-on: ubuntu-latest`.
- vercel.json has 2 crons, mls-sync `0 11 * * *`. `cat vercel.json`. Verified.
- email-scheduler 15 of 15 green, newest 36263546794. `gh run list`. Verified.
- lifecycle-nudges 15 of 15 green, newest 36264727747. Verified.
- data-readiness 15 of 15 green, newest 36260904937. Verified.
- retention sweep 14 green, 1 red 35737593505 on 09/22. Verified.
- social-pulse-scan 14 green, 1 red 35747520925 on 09/22. Verified.
- build-example-deliverables 15 green 07/03-07/17, newest 29572723498. Verified.
- Five workflows total_count 0. `gh api .../actions/workflows/<file>/runs --jq .total_count`. Verified.
- 09/22 reds are the schema-cache error. `gh run view --log-failed` for both ids. Verified.
- Drift: data-readiness actual 17:24Z-19:42Z, email-scheduler actual 17:50Z-20:07Z, lag 2 h 05 min to 4 h 22 min, gap 22-60 minutes. Recomputed from the two run lists (09/14 19:34 to 19:56 = 22 min; 09/22 18:14 to 19:14 = 60 min; 09/21 20:07 minus 15:45 = 4 h 22 min; 09/12 17:50 minus 15:45 = 2 h 05 min). Verified.
- email_schedules 2 rows both paused; email_sends 2, newest 07/13. SQL. Verified.
- email_sequences 0; lifecycle_nudges 0; listing_transitions api_feed 54,485 newest 08/14, lifecycle_seed 10,459 newest 06/27. SQL. Verified. Corrected: the first query grouped `email_sequences` and returned no rows; I re-ran it as `select count(*)` and cite the 0.
- data_readiness_alerts 0. SQL. Verified.
- user_mls_connections 0, user_mls_listings 0, user_mls_stats 0. SQL. Verified.
- No RESO_* in Vercel production. `vercel env ls production | grep RESO_` returned nothing. Verified.
- deliverables 89 non-example (newest 08/11, 0 trashed), 5 examples (0 trashed). SQL. Verified. Corrected: the first query reused the alias `max` twice and the JSON collapsed the two columns; I re-ran it with distinct aliases.
- Example tokens (5) and brain tokens (4). SQL and `grep -m1` on `brains/*.md`. Verified.
- `/p/example-one-pager`, `/p/example-email` HTTP 200; `/pulse` HTTP 200 shows "Posts scanned 0". `curl`. Verified.
- social_pulse_scans 84, newest 09/26, oldest 07/05; posts 7,147 over 32 scans; last scan with posts 08/09 11:35Z; hashtags 358 rows over 37 scans, newest scan_id 42; area split totals 7,147. SQL. Verified (1,734+1,497+1,345+1,060+602+457+452 = 7,147).
- Digest 13 rows, 8 with narrative; narrative null W31, W37, W38, W39. SQL. Verified.
- Section 6 social-pulse number. The first draft said "0 on scans 43-84". My SQL proves only that the newest scan with any post ran 08/09/2026 11:35Z and that scans 80-84 have 0 posts; I never listed the scan id of the 08/09 scan. Corrected in section 6 to "0 on every scan after 08/09/2026 11:35Z".
- weekly_read_subscribers 1 active, 0 issues sent. SQL. Verified.
- Test counts: 82 (4 files), 421 (43), 133 (15), 12 (1), 20 (1), 17 (7), 77 (9), 10 (1), 50 (5), 2, 9 (4). `bun test` outputs. Verified. The MLS combined run: 14 tests, 1 fail; the failing file passes alone. Verified.
- LLM walker output (292 / 31 / 45 / 49 / 6 / 6 / 8 / 68 / 2 / 5 / 10 / 97 files). `bun llmwalk17.mts ...`. Verified. The outreach-drip, data-readiness and example-builder counts (45, 6, 68) are not quoted above; nothing depends on them.
- Model constants: TRIAGE_MODEL haiku-4-5 (:6), SYNTHESIS_MODEL sonnet-4-6 (:8), EMAIL_MODEL_SONNET (model-router :14, :21), data-readiness MODEL (:111), pulse narrative default (narrative.ts:19). `grep -n`. Verified.
- getRawClient requires the key (`refinery/agents/anthropic.mts:334-338`). `grep -n -A14`. Verified.
- Healthchecks `/fail` and `<ping-key>/<slug>/fail`. crawl4ai of the two docs pages, 09/26. Verified. `?create=1` on the `/fail` path: could not verify from those pages; item 4 says to test it.
- 11 hc-ping sites. `grep -rn "hc-ping" .github/workflows`. Verified.
- Incident lists: 5 of 11 family workflows present in heal/log lists. `grep -c -F` loop. Verified.
- log-cron-incident dedup and auto-close lines (:220-233, :286-292). `grep -n`. Verified.
- Classifier TRANSIENT regex at :198, UNKNOWN at :214-216, UNKNOWN routes to the LLM narrative (:5). `sed -n 176,212p` and `grep -n`. Verified.
- doctor iterates pipelines only (:351). `grep -n`. Verified.
- 21 open checks, none in this family. `node scripts/check.mjs list`. Verified.
- Secrets/vars absent: SDG_CRYPTO_KEY, X_CLIENT_ID, META_APP_ID; SOCIAL_PUBLISH_ENABLED, OUTREACH_*, WEEKLY_READ_*. `gh secret list`, `gh variable list` filtered. Verified.
- HEALTHCHECKS_PING_KEY created 06/28/2026. `gh secret list`. Verified.
- SCRATCHPAD lines 288-292, 327-328, 407-408, 492, 946. `sed -n`. Verified.
- Known-problems ledger row 5 at :72. `grep -n`. Verified.
- `wiki/pipeline-health.md:83-87` precedence note. `sed -n 80,88p`. Verified.
- Section 9 run duration. The first draft said "the longest recent run of any of them finished in under 2 minutes"; I had timed one run only. Corrected in section 9 to the one sampled run (36264727747: first line 19:03:47Z, heartbeat 19:04:25Z, from its log).
- data-readiness prompt line. The first draft cited :201-203; `grep -n "From your own knowledge"` returns :204. Corrected in P4.
- Classifier regex line. The first draft cited :198; `grep -n "ReadTimeout|TimeoutError"` returns :199. Corrected in P10 and item 11.
- weekly-read refusal lines. The first draft cited :624-628; `grep -n "if (!APPROVED)"` returns :626 and the exit at :630. Corrected in section 3.
- P5 first-seen date. The first draft said 07/18/2026; `git log --diff-filter=A -- .github/workflows/data-readiness-cron.yml` returns 69de27ff on 06/19/2026, and 07/18 is only the throttle date. Corrected in P5.
- social-scheduler image rendering uses no browser. `grep -n` on `lib/social/render-social-image.ts:6-10` shows `@resvg/resvg-js`. Verified; the first draft asserted it without reading the file, now cited in section 9.
- Every family workflow except social-pulse-scan carries the ENGINE_ENABLED gate. `grep -L ENGINE_ENABLED` over the eleven files returns only social-pulse-scan.yml. Verified.

- Table count in section 1. The first draft said 20; counting the list in section 1 (deliverables once) gives 24 tables and views. Corrected in section 1.
- Item 3's scan status. The first draft wrote `status: 'empty'`; the column's CHECK allows only 'ok', 'partial', 'dry' (`pg_get_constraintdef` query quoted in item 3), and `select distinct status from social_pulse_scans` returns only 'ok'. Corrected to 'partial'.
- Item 4's scope. The first draft had this family land all 11 heartbeat sites; that is more than 5 files, which RULE 1 lists as ask-first. Corrected: this family's 2 files are DO, the 11-file pass goes to family 19.
- Item 6's size. An intermediate draft was one commit of 8 files; superseded by the route-only fix below.
- `/pulse` revalidates hourly. `grep -n revalidate app/pulse/page.tsx` returns :8 `revalidate = 3600`. Verified; added to item 1's proof.

- Where the readiness result goes. The first draft said the model_only value is substituted "into a customer email". `logVerificationResult` (`lib/email/data-readiness.ts:441-461`) only inserts into `data_readiness_alerts`, and `rg -n data_readiness_alerts lib app scripts refinery components` finds inserts only. Corrected in the verdict summary, P4, P6, section 6 and item 18.
- Item 6's fix. The first draft deleted Tiers 1-3 from the shared module; `rg -n verifyMetricItem` shows `lib/deliverable/band-guard-web.ts:20` also calls it, and every tier runs through the injectable `deps.lookup` (`lib/email/data-readiness.ts:254-259`, :394). Corrected to a null lookup injected by the cron route only, 2 files.
- Parking social surfaces. `feedback_dont-propose-parking-active-surfaces.md` records that the operator rejected a 07/19 freeze list that included social and MLS. Corrected: parking the pulse scan is ASK-FIRST (item 17) and the workflow hygiene stays DO (item 2); the mls-sync removal was already ASK-FIRST.
- P14 severity. The first draft said "blocks a served number" while section 8 gave the job no signal; the live example page states its source period ("2026-M04"). Corrected to cosmetic.
- Section 9 reasons. The first draft grouped nine jobs in one line. Corrected to one line per pipeline with its reason.
- Broadcast call line. `grep -n "api/email/broadcast" scripts/email/run-schedules.mts` returns :375. Verified.
- Healthchecks alert routing. Could not verify: the account and its alert channels are not visible from the repo. Section 8 says so.

Second-Opus re-check, 09/26/2026. Every claim above was re-run or re-opened; the result is in the last word of each line. SQL was run through a read-only Bun.SQL script with `max: 1` and `SET default_transaction_read_only = on` (DB `now()` 2026-09-26T20:44Z).
- 12 registry `name:` lines and 7 `status:`/`scheduler:` lines. `grep -n "name: ..."`. Verified.
- "NO freshness/lane fields" at :2628-2629; test status set :372; forbidden set :382-383; vercel pairing assert :397. `grep -n`, `sed -n`. Verified.
- vercel.json 2 crons, mls-sync `0 11 * * *` at :4-5. `cat -n vercel.json`. Verified.
- All 11 workflows `runs-on: ubuntu-latest`, timeouts 10/15, only social-pulse-scan lacks ENGINE_ENABLED. `grep -n` over the 11 files. Verified.
- 15-run lists for the 6 active or recently active workflows (ids, colors, newest green). `gh run list`. Verified, all six.
- 5 never-run workflows. `gh api .../runs --jq .total_count`. Verified, 0 each.
- Drift and gap figures (17:24Z-19:42Z, 17:50Z-20:07Z, 2 h 05 min to 4 h 22 min, 22-60 min). Recomputed per day from the two lists. Verified.
- Quoted log lines from 36263546794, 36264727747, 36260904937, 36246212374, 36250161351 (14 terms, scan 84, "narrative: null"), 35737593505 (FATAL then OK). `gh run view --log`. Verified.
- 36264727747 first log line. The log shows 19:03:50Z; 19:03:47Z is `createdAt`. Corrected in section 9.
- #218 and #219 UNKNOWN and CLOSED. `gh issue view`. Verified, both closed 09/23.
- Auto-close still working. `gh run view 36263583412 --log` shows the #44 comment cap and exit 1; `gh run list --workflow log-cron-incident.yml --limit 100` shows 50 failures since 09/24 15:15Z. Corrected (P19, section 3, section 8, item 19).
- Table counts (email_schedules 2 paused, email_sends 2, twelve zero-count tables, funnel empty, listing_transitions 54,485/10,459, deliverables 89/5, weekly_read 1 active). SQL. Verified.
- 5 example tokens vs 4 brain tokens, all 5 behind. SQL plus `grep -m1 brains/*.md` plus the id→brain map in `lib/deliverable/examples.ts:51-81`. Verified.
- /pulse "Posts scanned 0"; 6 pages HTTP 200; market-overview cites LAUS 2026-M04. `curl`. Verified.
- Pulse scans 84, posts 7,147 across 32 scans, taken_at 06/09/2016 to 08/06/2026, area split. SQL. Verified.
- Last scan with posts. SQL `max(s.id)` = 37. Verified; added to sections 2, 4 and 6.
- "Hashtags stopped earlier, at scan_id 42". Scans 37-42 carry 12 hashtags each, and scan 42 ran 08/14 11:50Z, after posts stopped. Corrected in P1.
- Digest narrative weeks. The re-run without a limit shows W27 null and W28/W29 present. Corrected in section 2.
- CHECK constraint ok/partial/dry; distinct status 'ok'. SQL. Verified.
- Test counts 82, 12, 20, 50, 17, 10, 2, 9, 421, 133, 77; MLS combined 13 pass 1 fail; disconnect alone 1 pass. `bun test`, re-run. Verified, all.
- No test files for the data-readiness route, the sweep, or the scan adapter. `git ls-files`. Verified.
- Walker file counts (292/31/45/49/6/6/8/68/2/5/10/97) and LLM hit lists. Re-ran `llmwalk17.mts`. Verified.
- Model constants and getRawClient (:334-338); build-doc try at :581, catch at :600. `grep -n`, `sed -n`. Verified.
- run-schedules :63 SCHEDULE_BUILD_MODE, :264, :375, :495-500, :503-509. `grep -n`. Verified. The frozen-lane quote is at :307, not inside :310-334; corrected in section 10.
- data-readiness.ts :5-7, :17, :111, :204, :220, :254-259, :394, :407-436, :440-461; route window :36-44, call :76; band-guard :9, :20. `sed -n`, `grep -n`. Verified. No brain_fresh short-circuit precedes Tier 1 (:254-300), so "two paid calls per metric" holds.
- Claim function. :35 is the CREATE line; the `next_run_at <= p_now` filter is :43. Corrected in P6.
- schedule-cadence :153-168; steady-client :5, :10, :34, :37; scan.mts :4, :17-26, :66-120, :104-105; narrative.ts :19, :33-38; page.tsx :8, :17-43, :45; load.ts :6-18. `sed -n`. Verified.
- Safety gates: drip :64-68 (and no APPROVED), demo :44-45, weekly :94-95 and :626-630, social :46, resvg at render-social-image :6-10. `sed -n`, `grep -n`. Verified.
- P15 trigger. The postal variable is unset, and weekly-read shares it (`weekly-read.yml:46`). Precision added to P15. The second DRY_RUN-live site is at `social-engagement-poll.yml:51`. Gap filled.
- mls route returns 200 at :65; boards :14-23 env keys; no RESO_* in Vercel production (`vercel env ls production`). Verified.
- enrich-brand :175-183 and :188-189; build.ts :51, :349-351; build-example exit :43-46. `sed -n`. Verified.
- 11 hc-ping sites, all `if: always()` to the plain URL. `grep -n -B4 hc-ping`. Verified.
- Healthchecks `/fail` and slug `/fail`. crawl4ai re-crawl of both pages. Verified. `create=1` on slug `/fail` is now verified too (Query Parameters `create=0|1`); corrected item 4.
- Incident list membership, 5 in and 6 out. `grep -c -F` against heal and log YAMLs. Verified.
- Classifier :5, :199 TRANSIENT, :214-216 UNKNOWN; needsLlm :261-263; DATA_EMPTY :167-172; CONTENT_STALE :157-162. `sed -n`, `grep -n`. Verified; used to correct item 3's exit wording.
- Heal L2 dead on this family's red. `gh run view 35747601205 --log` shows the 400 and a comment on #219. Gap filled (P20, section 10 leg 6).
- Token scopes. The log shows 17 write and 3 read. Corrected P3.
- Consumers, per table. `rg` over refinery/sources, refinery/packs, lib, app, components, scripts:
  - Two readers were wrong: email_sends direct readers, and data_readiness_alerts, which has 0 readers (3 inserts). Corrected in section 1.
  - One reader was missing: social_schedules and social_posts had none listed. Gap filled in section 1.
  - lifecycle_nudges, social_events, social_pulse_* (digest via `lib/social-pulse/load.ts`; posts and hashtags scan+migrate only), user_mls_* (lib/reso and MLS routes only), outreach_demo_funnel (scorecard only), and weekly_read_subscribers were verified.
- Ops repo reading data_readiness_alerts. Local checkout `rg`: not supported. Recorded in P4.
- doctor :351; 21 open checks, none in family. `sed -n`, `node scripts/check.mjs list`. Verified.
- Secrets and variables absent; HEALTHCHECKS_PING_KEY 06/28. `gh secret list`, `gh variable list`. Verified. Also found `CRON_INCIDENT_ISSUE_NUMBER=44`, used in P19.
- SCRATCHPAD :288-292, :327-328, :407-408, :492, :946 (and :947-948 for the 08/14 date); ledger :72; wiki :83-87; 07/19 freeze memory. `sed -n`, `cat`. Verified.
- data-readiness-cron added 69de27ff on 06/19/2026. `git log --diff-filter=A`. Verified.
- Fedora runner. `gh variable get SWFL_LOCAL_RUNNER_READY` = true; runners API = 1 online `fedora-swfl-local`. Verified; used in section 9.
- Section 7 count lines. Two contradictory lines. Corrected.

First Opus: claims checked: 61. Corrections applied: 16 (email_sequences count, deliverables aliases, section 6 scan range, section 9 run duration, data-readiness prompt line, classifier regex line, weekly-read refusal lines, P5 first-seen date, section 1 table count, item 3 status value, item 4 scope, item 6 reshaped to a route-only null lookup, readiness result destination, social parking moved to ASK-FIRST, P14 severity, section 9 per-pipeline reasons). Could not verify: 3 (the 08/09 pulse onset cause, the W37-W39 narrative nulls, Healthchecks alert routing), plus mls-sync invocation history (Vercel logs 403).

## 12. Questions for the operator

1. `/pulse` and the social pulse scan. SteadyAPI is out, so the page has no source. Do you want the Social Pulse product kept with a new Instagram source (a new vendor, possibly paid, which goes through the three-alternative discovery on `wiki/tool-discovery.md` first), or retired along with its four tables (`social_pulse_scans`, `_posts`, `_hashtags`, `_digest`) and the page? Until you answer, the plan hides the zero on the page (item 1); parking the scan is question 6.
2. Scheduled Email Lab sends. Today a scheduled design ships its saved prose because the refill has no model lane. Should a recurring customer email get fresh AI prose on every occurrence, or ship the frozen design with its figures refreshed? If fresh prose, which lane: that is the one terms question the scratchpad already leaves to you, and I am not choosing it for you.
3. Example deliverables. All five are behind their source brains. Leave them frozen, rebuild them once in an interactive Max session, or delete them?
4. mls-sync. Remove the daily Vercel cron until you contract an MLS board (item 14)? The user-triggered route stays.
5. Pre-send readiness. Its result is recorded but no send reads it. Should it become a real gate on scheduled sends, or be retired (item 18)?
6. The social pulse scan. Park it now (item 17), or let it run red daily until question 1 is settled?

## 13. Second-Opus verification

Run 09/26/2026 by the second Opus. Method:
- Re-ran every `gh run list` / `gh run view` / `gh api` command the file cites.
- Re-ran every SQL figure through a read-only single-connection Bun.SQL script.
- Re-ran every `bun test` count and the LLM import walker.
- Re-opened every file:line cited, and re-crawled the two Healthchecks pages with crawl4ai.
- Grepped every family table across refinery/sources, refinery/packs, lib, app, components and scripts.
- Grepped the 11 family YAMLs plus the shared listeners for anthropic|claude|openai|refinery.
- Nothing was written outside this file. No workflow was dispatched and no issue was opened.

Claims checked: 45. That is the count of lines in the "Second-Opus re-check" block of section 11; recount with `awk '/^Second-Opus re-check/{f=1} /^First Opus: claims checked/{f=0} f && /^- /' <this file> | wc -l`. Many lines bundle several file:line or SQL figures. This pass is on top of the first Opus's 61.

Corrections (what was wrong → what is right → evidence):
1. P1 "Hashtags stopped earlier, at scan_id 42" → hashtags stopped LATER; posts end at scan 37 (08/09 11:35Z), hashtags run through scan 42 (08/14 11:50Z) → `select scan_id, count(*) from social_pulse_hashtags where scan_id > 36 group by 1`; `select id, ran_at from social_pulse_scans where id in (37,42)`.
2. Section 2 digest narratives: "null W31, W37, W38, W39" (4) → null W27, W31, W37, W38, W39 (5); present W28, W29, W30, W32-W36 (8) → the same digest query without `limit 10`.
3. Section 1 `data_readiness_alerts` "Consumers: log-collision.ts, confirm-value/route.ts" → both are writers; the table has 0 readers in the repo → `rg -n 'from\("data_readiness_alerts"\)'` = 3 inserts, 0 selects.
4. Section 1 `email_sends` "all read email_sends" → only `lib/email/load-campaign-stats.ts:33` and `app/api/webhooks/resend/route.ts:294,515,576` query it; the other files name it in comments → `rg -n 'from\("email_sends"\)'`.
5. P6 claim filter cited at `20260612_email_schedule_claim_fn.sql:35` → :35 is the CREATE line; the `next_run_at <= p_now` filter is :43 → `sed -n 40,55p`.
6. Section 10 frozen-lane quote cited at `run-schedules.mts:310-334` → the quote is at :307 (block :305-334) → `grep -n "no AI refill"`.
7. P3 "every other scope write" → 17 scopes write, 3 read (Metadata, Models, VulnerabilityAlerts) → `gh run view 35747520925 --log`, GITHUB_TOKEN Permissions group.
8. Section 9 "logged its first line at 19:03:47Z" → created 19:03:47Z, first log line 19:03:50Z → `gh run view 36264727747 --log | head -1`.
9. Section 7 carried two contradictory count lines ("13 DO, 5 ASK-FIRST" / "13 DO, 3 ASK-FIRST") → 14 DO (with new item 19), 5 ASK-FIRST → item list 1-19.
10. Item 4 "whether `?create=1` is honored on `/fail` is not stated" → documented: `create=0|1` is a Query Parameter of `hc-ping.com/<ping-key>/<slug>/fail` → crawl4ai of https://healthchecks.io/docs/http_api/, 09/26.
11. Sections 3 and 8 "auto-closes it when the next scheduled run succeeds" → true through 09/23 only; broken since 09/24 15:15Z. Sticky issue #44 is at 2,500 comments, and the unguarded success comment throws before `closeIncidentIssue()` → run 36263583412 log; 50 failures in the last 100 `log-cron-incident` runs; `log-cron-incident.mjs:139-145`. New P19, item 19.
12. Item 3 exit line "all terms returned 0" → it matches DATA_EMPTY, which has `needs_llm=true`, so every daily red would fire a model call and an issue comment. Reworded to a `[content-guard]` line (CONTENT_STALE, `needs_llm=false`) → `classify-cron-failure.mjs:157-172, 261-263`.
13. Section 10 listed 5 LLM legs → 6. Heal-cron-failure L2 diagnosis fires on this family's reds and is dead (400 invalid_request_error) → heal run 35747601205 log; `heal-cron-failure.yml:191`; `heal-cron-failure.mjs:213-231`.
14. P15 "would send live the moment its cron is uncommented" → it also needs `OUTREACH_POSTAL_ADDRESS`, which is unset. That is a CAN-SPAM field, not an approval, and it is shared with weekly-read's go-live, so the finding stands → `gh variable list`; `outreach-drip-run.mts:64-68`; `weekly-read.yml:46`.
15. Section 8 "Nothing to add to check.mjs" left out that the incident seam auto-opens a `cron_incident_<workflow>` check per red → added (one row per incident, self-closing) → `log-cron-incident.mjs:151-158, 173`; the issue #219 body names `cron_incident_social_pulse_scan`.
16. Section 12 Q1 "its three tables" → four tables (`social_pulse_scans`, `_posts`, `_hashtags`, `_digest`) → section 1 list, SQL.

Unverifiable claims (why):
- Why the pulse posts leg died on 08/09, five days before the hashtags leg. The client swallows status codes (`steady-client.ts:34,37`), so no run logged it.
- Why the W37-W39 narratives are null. `narrative.ts:36-38` swallows the error. The same secret failing in heal on 09/22 is consistent with it, not proof, and W27/W31 predate that.
- Healthchecks alert routing. The account is not visible from the repo.
- mls-sync invocation history. The first Opus got Vercel runtime logs 403; not retried.
- Whether the ops site reads `data_readiness_alerts`. The local ops checkout (HEAD 07/25/2026) has no source reader; the remote after 07/25 was not checked.

Gaps filled:
- P19: incident seam comment cap, the per-green-run comment, auto-close broken. Plus item 19 and the section 8 noise entries naming #44 and `CRON_INCIDENT_ISSUE_NUMBER=44`.
- P20 and section 10 leg 6: the heal model diagnosis on this family's reds.
- Section 1 consumers for social-scheduler's tables (`app/project/page.tsx:62`, `app/project/layout.tsx:68`, `scripts/social/poll-engagement.mts:255`).
- P15's second DRY_RUN-live site at `social-engagement-poll.yml:51` (cosmetic; poll only).
- Section 9: the conditional Lane M move for build-example-deliverables now names `runs-on: ${{ vars.SWFL_LOCAL_RUNNER_READY == 'true' && fromJSON('["self-hosted","swfl-local"]') || 'ubuntu-latest' }}` (pattern at `ingest-collier-official-records.yml:31`) and the live runner `fedora-swfl-local`.
- P4: the ops-repo reader claim checked against the local checkout.
- Section 7: explicit PARKED, no-item line for social-scheduler, outreach-demo, social-engagement-poll and weekly-read, with run-count and table-count evidence.

Coverage: all 12 pipelines appear in sections 2, 3, 4, 6, 7, 8 and 9. In section 4, social-scheduler, outreach-demo, social-engagement-poll and weekly-read appear through P11, P15 and P16. Section 7 was missing four pipelines (social-scheduler, outreach-demo, social-engagement-poll, weekly-read); the second Opus added an explicit PARKED, no-item line with evidence. No pipeline is missing now.

Box placement: all 11 GHA jobs stay on `ubuntu-latest`, each with a per-pipeline reason, and mls-sync stays a Vercel route. None of this family is on the Fedora box (`grep -n runs-on`). The only conditional move names the gate and the label.

Section 8: no per-run GitHub issue filing survives. The two per-run GitHub writes found (the sticky-feed success comment and the heal model comment) are both routed out, by item 19 and by items 3 and 11. Each live pipeline has one Healthchecks signal; each parked one has a named go-live condition.

Credit-suggestion count: 0. The step-4 keyword grep over the whole file returned nothing before this pass and matches only this line now.

Grade: PASS-WITH-CORRECTIONS. The plan's structure, verdicts and item order stand after the 16 corrections above.
