# 18 repo-hygiene — pipeline plan (09/26/2026)

Family 18 is the seven repo-hygiene jobs: doc-ratchet-daily, chief-of-staff-nightly, watch-scan-daily, watch-digest-daily, airtable-checks-sync, graphify-republish and notion-sync-weekly. None of them lands data in `data_lake.*`, none feeds a brain, and only one (chief-of-staff-nightly) ever made a model call. Verdict: one is GOOD ENOUGH (graphify-republish). Two need REPAIR because they are green while lying: doc-ratchet reads 0 days since improvement forever while orphans stay under 220, and the Airtable mirror silently drops 4 of 21 open checks. One is RETIRE (chief-of-staff-nightly). It has been dead since 08/06, but its last brief (issue #169, 08/01) is still printed into every session kickoff. Two stay PARK (watch-scan, watch-digest): 0 runs ever, 0 subscribers, and their input is the parked listings leg. Notion is RETIRE pending the operator's word, because it republishes 05/27 prose under this week's date. Nothing here needs the Fedora box. Nothing here needs a model once chief-of-staff is retired.

## 1. Scope

Seven pipelines, all under `jobs:` in `ingest/cadence_registry.yaml`. `jobs:` begins at line 2644, and its header at `ingest/cadence_registry.yaml:2624-2630` says jobs carry "NO cron strings" and "NO freshness/lane fields". So lane, cadence_days, consuming_pack, expected_rows_min and source_scope.source_ceiling do not exist for any of the seven, by design. Every per-pipeline "registry" line below is therefore name + workflow + purpose (+ status).

- doc-ratchet-daily — `ingest/cadence_registry.yaml:2645` — `.github/workflows/doc-ratchet-daily.yml` — writes nothing durable (the ledger it records in CI is ephemeral, `doc-ratchet-daily.yml:70-73`). The committed ledger is `docs/standards/doc-ratchet-ledger.json`. Consumer: agents/humans reading the Actions board. No table.
- chief-of-staff-nightly — `ingest/cadence_registry.yaml:2656` — `.github/workflows/chief-of-staff-nightly.yml` — output is a GitHub issue labelled `morning-brief`. Consumer: `scripts/session-kickoff.mjs:154-176` (`morningBriefBlock`), which prints the newest open morning-brief issue at every session start via the SessionStart hook `.claude/settings.json:71` (`node .claude/hooks/print-kickoff.mjs`). No table.
- watch-scan-daily — `ingest/cadence_registry.yaml:2682` (status: parked) — `.github/workflows/watch-scan-daily.yml` → `scripts/project-feed/watch-scan.mts`. Reads `public.projects` (watch_* columns) + `data_lake.listing_transitions` / `listing_state`. Writes `public.project_events` through `lib/project/event-insert.ts` (inserts at :82 and :137). Direct table readers of `project_events` (`git grep -n "project_events" -- app lib refinery components`): `app/api/projects/[id]/watch/route.ts:90`, `app/project/[id]/page.tsx:238`, `app/project/[id]/watch/page.tsx:30`. `app/project/[id]/ProjectWorkspace.tsx:98` and `lib/project/digest.ts:62,150` are comment hits; those files get the rows through props or their caller (page.tsx), so they are downstream consumers, not table readers. Nothing in `refinery/sources` or `refinery/packs` reads it.
- watch-digest-daily — `ingest/cadence_registry.yaml:2686` (status: parked) — `.github/workflows/watch-digest-daily.yml` → `scripts/project-feed/watch-digest.mts`. Reads `public.project_events` and would stamp `notified_at`. Consumer: user email (send gated off).
- airtable-checks-sync — `ingest/cadence_registry.yaml:2698` — `.github/workflows/airtable-checks-sync.yml` → `scripts/airtable-checks-sync.mjs`. Reads `public.checks` and writes back `airtable_record_id` / `airtable_synced_at`. Writes the Airtable base (secrets `AIRTABLE_CHECKS_BASE_ID` / `AIRTABLE_CHECKS_TABLE_ID`). Consumer: the operator's Airtable view.
- graphify-republish — `ingest/cadence_registry.yaml:2714` — `.github/workflows/graphify-republish.yml` → `bun run graphify:publish` (`package.json:28`) → `scripts/graphify-publish.mjs`. It pushes `app/graph/brain-graph.json` into the `swfldatagulf-ops` repo. Consumer: the ops `/graph` page (`swfldatagulf-ops/app/graph/page.tsx:5` imports `./brain-graph.json`).
- notion-sync-weekly — `ingest/cadence_registry.yaml:2730` — `.github/workflows/notion-sync-weekly.yml` → `scripts/notion-sync.mjs`. Writes the Notion "Latest Sync" hub + 4 detail pages. Consumer: whoever opens that Notion page.

Count: 7 pipelines, 7 workflow files, 0 `data_lake.*` tables written, 2 public tables touched (`public.project_events` by watch, `public.checks` sync columns by Airtable).

Open checks in this family: none. `node scripts/check.mjs list` returned "21 open" on 09/26, and none of the 21 keys names any of these seven jobs. Family-history checks, from SQL on `public.checks`:
- `property_watch_live_verify` and `chief_of_staff_nightly_live_verify` were bulk-dropped 08/12.
- `doc_ratchet_red_is_board_only` and five graphify_* checks were dropped in the 09/15 bankruptcy.

They stay dropped; this plan does not resurrect any of them.

## 2. What is being brought in

None of the seven is geographic. Lee 12071 / Collier 12021 / Hendry 12051 coverage is N/A for all of them: they measure the repo, the checks ledger or the code graph, not a county. The one exception is watch-scan, whose input is county listings (below). "Source freshness" means the freshness of the repo, ledger or input table each one reads. None of them has an outside publisher to crawl, except Airtable and Notion as write targets.

- doc-ratchet-daily. Source: the working tree (`git ls-files` markdown), counted by `scripts/doc-reachability.mjs`.
  - Fields: docs, byPath, byNameOnly, orphans (`scripts/doc-ratchet.mjs:55-63`).
  - Cadence: cron `23 7 * * *` (`doc-ratchet-daily.yml:38`); actual start times drift to ~12:xx UTC (every createdAt in `gh run list --workflow doc-ratchet-daily.yml --limit 15`).
  - Live numbers, from `gh run view 36241485493 --log` (09/26): "reachable by FULL PATH 1023 57.3%", "reachable by NAME ONLY 546 30.6%", "ORPHANED, ZERO MENTIONS 216 12.1%", "216 orphaned of 1785 docs".
  - The committed ledger holds only two rows, 08/05 (222 orphans of 1537 docs) and 08/06 (220), with `"updated": "2026-08-06"` (`cat docs/standards/doc-ratchet-ledger.json`). The last commit touching it is 166bae8b on 08/05 (`git log -- docs/standards/doc-ratchet-ledger.json`).
- chief-of-staff-nightly. Source: the last 48h of git history + open checks. The evidence pack comes from `scripts/chief-of-staff-collect.mjs`, which is deterministic.
  - Cadence: none. The cron is commented out (`chief-of-staff-nightly.yml:22-23`) and the workflow state is `disabled_manually` (`gh api .../actions/workflows` → `310779251 .github/workflows/chief-of-staff-nightly.yml disabled_manually`).
  - Newest output: issue #169 "Morning brief — 08/01/2026", still OPEN (`gh issue list --label morning-brief --state open` → createdAt 2026-08-01T10:31:19Z).
- watch-scan-daily. Source: `data_lake.listing_transitions` (seed=false) joined to `listing_state`, radius-filtered around each `projects` row with `watch_enabled=true` (`watch-scan.mts:7-11`). Cadence: dispatch-only (`watch-scan-daily.yml:3-9`).
  - `select count(*), max(at), min(at) from data_lake.listing_transitions` → 64944 rows, newest 2026-08-14, oldest 2026-06-27. The input stopped on 08/14 because the listings legs are parked by the operator's word (brief rule 6).
  - `public.projects`: 23 total, 0 with watch_enabled, 0 with watch_enabled + geo.
  - `public.project_events`: 0 rows total, and `select event_type, count(*) ... group by 1` returned [].
- watch-digest-daily. Source: `public.project_events` un-notified nearby_* rows (`watch-digest.mts:6-8`), 0 rows (above). Cadence: dispatch-only (`watch-digest-daily.yml:3-17`).
- airtable-checks-sync. Source: `public.checks` where state=open (`airtable-checks-sync.mjs:97-105`). Cadence: cron `23 12 * * *` (`airtable-checks-sync.yml:13`).
  - `select state, count(*), count(airtable_record_id), max(airtable_synced_at) from public.checks group by state` → open 21 / with record 17 / last sync 2026-09-22T17:03:56Z; done 593 / 0 / —; dropped 1039 / 0 / —.
  - Recent run outputs (from `gh run view <id> --log | grep airtable-checks-sync:`): 09/22 "1 dirty open row(s), 0 stale close(s)", 09/23 "0 dirty ... 1 stale close(s)", then 09/24, 09/25 and 09/26 "0 dirty open row(s), 0 stale close(s)".
- graphify-republish. Source: the repo's code at HEAD, re-extracted by `graphify update .`, with PyPI `graphifyy-0.9.68` installed in CI (log of run 36241713974). Cadence: cron `37 7 * * *` (`graphify-republish.yml:17`).
  - 09/26 run output: "Rebuilt: 44369 nodes, 90642 edges, 1680 communities"; the app plane added "+1509 nodes, +3308 edges"; the published file holds "676 nodes (component:234 api_route:131 table:119 pipeline:76 page:68 brain:33 hook:15)" and "849 edges"; the step ended "No graph changes — brain-graph.json already current."
  - Ops-repo commits to the file: 09/23, 09/20, 09/16, 08/30, 08/19 (`gh api repos/ethanrickyjrjr-wq/swfldatagulf-ops/commits?path=app/graph/brain-graph.json&per_page=5`). It publishes only when the app plane changes (the no-diff exit at `graphify-republish.yml:102-105`); the gaps are not staleness.
  - Separate from this job, the hosted graph (MCP `graph_stats` on ethanrickyjrjr-wq/SWFL-Data-Gulf) indexed commit 27a345b at 2026-09-26T09:35:54Z.
- notion-sync-weekly. Source: text hard-coded in `scripts/notion-sync.mjs` (1596 lines, `wc -l`). It reads no repo file, table or API except Notion's own. `grep -nE "readFileSync|supabase|fetch\(" scripts/notion-sync.mjs` returns only the Notion `fetch` at :44.
  - Content date: `FRESHNESS = "SWFL-7421-v53-20260525"` (`notion-sync.mjs:40`); audit prose "133 commits in the audit window. Busiest day 2026-05-27" (:509).
  - Stamp: `Last refresh ${TODAY}` (:183), where `TODAY` is the run date (:41).
  - Last content commit: 06cb3c45 on 06/27 (`git log -- scripts/notion-sync.mjs`).
  - Cadence: cron `0 13 * * 1` (`notion-sync-weekly.yml:17`), gated by `vars.ENGINE_ENABLED` (:34).

## 3. What is working

- doc-ratchet-daily: 8 green / 7 red over the last 15 runs (`gh run list --workflow doc-ratchet-daily.yml --limit 15`). Newest green is 36241485493 on 09/26. The census step itself works: it measures 1785 docs in ~23 s (log timestamps 12:18:22 → 12:18:45). It runs on `ubuntu-latest` with no install, no secrets and no model (`doc-ratchet-daily.yml:50-75`). Tests: 0; `grep -rl "doc-ratchet\|doc-reachability" scripts .claude/hooks .github/scripts | grep -i test` returned nothing.
- chief-of-staff-nightly: the deterministic halves still work. `bun test scripts/chief-of-staff.test.mjs` → "27 pass 0 fail". (`node --test` reports 1 fail only because the file imports `bun:test`; that is not a real failure.) Last 15 runs: 3 green / 12 red; all-time 28 runs: 11 green / 17 red (`gh run list --workflow chief-of-staff-nightly.yml --limit 100`). Newest green is 30695569015 on 08/01.
- watch-scan-daily / watch-digest-daily: 0 runs ever (`gh run list --workflow watch-scan-daily.yml --limit 50 --json databaseId --jq length` → 0; same for digest). The pure cores are tested: `bun test lib/project/watch-delta.test.ts lib/project/watch-digest.test.ts lib/project/watch-event.test.ts` → "29 pass 0 fail". The send is double-gated: the workflow never sets `WATCH_DIGEST_LIVE` (`watch-digest-daily.yml:41`), and the adapter refuses `--send` without it (`watch-digest.mts:26,78`).
- airtable-checks-sync: 15 green / 0 red in the last 15 runs, 09/12 → 09/26. Newest is 36255746638. `node --test scripts/lib/airtable-checks-sync-core.test.mjs scripts/lib/airtable-creds.test.mjs` → "tests 11 pass 11 fail 0". Delete-on-close works: 09/23 "deleted 1".
- graphify-republish: 15 green / 0 red, 09/12 → 09/26. Newest is 36241713974, which reached its publish line 2m25s after start by log timestamps (12:22:36 → 12:25:01). The ops push works (the 09/23 commit 7744e50). Publish-path tests: 0. The only graphify test, `scripts/graphify-compartments-report.test.mjs` (5 pass), covers the compartments report, not publish.
- notion-sync-weekly: 13 green / 1 red / 1 skipped in the last 15 runs. Newest green is 35637761140 on 09/21. The 08/03 skip is the `ENGINE_ENABLED` gate (:34). Tests: 0 (`grep -rln "notion-sync" --include=*.test.*` → nothing).

## 4. Problems

- P1. Doc ratchet cannot fail again while orphans stay below 220.
  - Symptom: `gh run view 36241485493 --log` → "days since last improvement: 0" and "216 orphans", comparing against 2026-08-06's 220.
  - Replaying `daysSinceImprovement` (the `scripts/doc-ratchet.mjs:83-96` logic) over the committed ledger plus one CI row gives daysSince=0 for (09/26, 216) and daysSince=0 for (12/31, 219); only at 220 does it return 147.
  - Root cause: CI's `check` records today into an ephemeral copy of the committed ledger (`doc-ratchet.mjs:131-133`, `doc-ratchet-daily.yml:70-73`). The committed ledger has not moved since 08/06, so any count under its 220 low-water mark reads as "improved today", every day.
  - Severity: blocks a consumer. The "are we improving every day" signal the operator decreed on 08/05 (`doc-ratchet-daily.yml:6-7`) is permanently green, whether or not anyone improves anything.
  - First seen: 09/19. That was the first green after 0439789a (09/18, "fix: clear refinery and documentation shipping failures") took the count from 245 to 216 (runs 35343865412 vs 35441544221).
- P2. Doc ratchet's red was ignored for 38 straight days.
  - Symptom: across the last 52 runs, 38 failed, all in one block from 08/12 to 09/18 (`gh run list --workflow doc-ratchet-daily.yml --limit 60`, first red on 08/12 after the 08/11 green). The last red says "FAIL — 44 days with no improvement (limit 7)" (run 35343865412).
  - Root cause: the job is deliberately watch-exempt (`scripts/lib/watch-manifest.mjs:40-41`), so its red lands only on the Actions board. The check that tracked this gap was dropped in the 09/15 bankruptcy.
  - Severity: blocks a consumer (nobody sees the red).
  - First seen: 08/12.
- P3. Doc ratchet's "start here" pointer names the wrong list.
  - Symptom: every red prints "Start here: _RESEARCH/audits/2026-07-18-data-consolidation/P7-corpse-deletelist.md" (`doc-ratchet.mjs:144`, `doc-ratchet-daily.yml:26-27,84-85`). The same pointer also sits in the registry purpose at `ingest/cadence_registry.yaml:2651-2652`, and `node scripts/schedule-catalog.mjs` would print it once P13 is fixed (`git grep -n "P7-corpse-deletelist" -- scripts .github ingest` → 4 live sites in 3 files, plus 3 unrelated registry comments at :436, :554, :2069 that correctly cite P7 for data corpses).
  - Root cause: P7 is a list of DATA corpses (views, parquet prefixes, tables; its ranked rows at P7:29-36 are all `data_lake.*` / Storage objects), not orphaned docs.
  - Severity: cosmetic, but it misdirects every burndown.
  - First seen: 08/05 (5f2b30fb).
- P4. A dead job's 08/01 brief is injected into every session.
  - Symptom: issue #169 is still open (createdAt 2026-08-01). The unauthenticated fetch `https://api.github.com/repos/ethanrickyjrjr-wq/SWFL-Data-Gulf/issues?labels=morning-brief&state=open&per_page=1` returned HTTP 200 with number 169 (curl, 09/26), and the repo is PUBLIC (`gh repo view --json visibility`). `briefKickoffLines` on its body returns 3 close-candidate lines (node one-liner over `scripts/chief-of-staff-lib.mjs:230-243`). All 3 name checks resolved on 08/06 (SQL on `public.checks`; body: `gh issue view 169`).
  - Root cause: `scripts/session-kickoff.mjs:154-176` reads "newest OPEN morning-brief issue" with no age bound. The producer died on 08/06, so the 08/01 issue was never superseded or closed (the supersede loop at `chief-of-staff-nightly.yml:118-124` only runs when a new brief posts).
  - Severity: blocks a consumer. Every session start is handed 56-day-old "ready to close" items for closed work, and two of the three steer toward a topic the operator has closed by decree. Second Opus re-ran the extraction (curl the issues endpoint → HTTP 200, #169; `briefKickoffLines(body)` → 3 lines): the two are the retired credit-wall check keys `anthropic_credits_nightly_red` and `nightly_chain_dark_anthropic_credits` (both done 08/06 per SQL `resolved_at`). So the dead brief pushes a banned subject (brief rule 2) into every session's first screen, which makes plan item 1 the highest-value item in this family.
  - First seen: 08/06 (the last run).
- P5. The chief-of-staff agent step died on its turn ceiling.
  - Symptom: `gh run view 31095947428 --log-failed` → "##[error]Execution failed: Reached maximum number of turns (30)".
  - Root cause: `--max-turns 30` at `chief-of-staff-nightly.yml:60`.
  - Severity: none now (disabled). First seen: 08/02 (`chief-of-staff-nightly.yml:11-13`; runs 08/02–08/06 all red).
  - Orphan noise it left: issue #170 "[cron-failure:chief-of-staff-nightly] UNKNOWN" is still OPEN. Its check `cron_incident_chief_of_staff_nightly` has been done since 08/06 (SQL). The logger only auto-closes on a later green run (`.github/scripts/log-cron-incident.mjs` closeIncidentIssue), which a disabled job never produces.
- P6. Registry says chief-of-staff is live-shaped.
  - Symptom: `ingest/cadence_registry.yaml:2656-2658` has no `status:` although the cron is commented out and the API state is `disabled_manually`. The `build-example-deliverables` entry, by contrast, carries `status: disabled`.
  - Root cause: status was never updated on 08/12.
  - Severity: cosmetic. `scripts/schedule-catalog.mjs:117` defaults a missing status to "live"; the catalog only lists scheduled rows today, so nothing mis-renders yet.
  - First seen: 08/12.
- P7. The Airtable mirror silently omits 4 of 21 open checks.
  - Symptom: `select count(*) from public.checks where state='open' and airtable_record_id is null` → 4 (cron_incident_nightly_chain, cron_incident_freshness_probe_daily, cron_incident_reverify_signals_daily, cron_incident_deptry). Each has `airtable_synced_at` > `updated_at`, and runs 09/24–09/26 report "0 dirty open row(s)".
  - Root cause: the dirty predicate at `scripts/airtable-checks-sync.mjs:102-104` only tests `!airtable_synced_at || synced_at < updated_at`; it never treats a null `airtable_record_id` as dirty. The rows got into that state as follows. When a check is closed, `syncDeletes` nulls its record id (:155-163). `check.mjs reopen` then flips state back to open without bumping `updated_at` (`scripts/check.mjs:285`: the patch sets state/resolved_at/resolved_by/proof only), and `public.checks` has no updated_at trigger (information_schema.triggers shows only `checks_require_proof_trg`). The exact path that hits it: all 4 stranded rows are `cron_incident_*` keys, and the cron-incident logger re-opens them on every red through `node scripts/check.mjs reopen` (`.github/scripts/log-cron-incident.mjs:150-162`, `openIncidentCheck`). So every close → sync-delete → logger-reopen cycle strands one more row. Timeline per row (SQL, second Opus): each `airtable_synced_at` is later than its `updated_at` (e.g. cron_incident_nightly_chain synced 2026-07-13T11:34Z, updated 2026-07-13T08:15Z).
  - Severity: blocks a consumer (the mirror is wrong while the job is green).
  - First seen: could-not-verify the exact date. The oldest stranded `airtable_synced_at` is 2026-07-13 (cron_incident_nightly_chain).
- P8. Notion hub publishes 05/27 content stamped with this week's date.
  - Symptom: `scripts/notion-sync.mjs:183` prints "Last refresh ${TODAY}" over hard-coded prose dated 05/25–05/27 (:40, :509, :514-529).
  - Root cause: the script was written as a one-time snapshot (header :1-18) and scheduled weekly; it reads no live source.
  - Severity: blocks a consumer. Anyone reading Notion sees four-month-old state presented as current.
  - First seen: 06/01 (first scheduled week after 0d0ae574 on 05/27; runs back to 06/15 are in the list).
- P9. notion-sync 08/24 red is undiagnosed.
  - Symptom: run 32733988196 failed; `gh run view 32733988196 --log` → "log not found". Incident #187 classed it `UNKNOWN` with an empty log tail and auto-closed on 08/31.
  - Root cause: could-not-verify (logs expired).
  - Severity: cosmetic (next runs green). First seen: 08/24.
- P10. graphify heartbeat pings success on failure.
  - Symptom: the Healthchecks step at `graphify-republish.yml:126-130` runs `if: always()` against the plain ping URL, never `/fail`.
  - Root cause: that step shape.
  - Severity: cosmetic (the cron-incident logger still catches reds). The same shape is fleet-wide (`grep -l "hc-ping.com" .github/workflows/*.yml | wc -l` → 11 files, 0 using `/fail`); that belongs to family 19.
  - First seen: when the step was added (not dated here).
- P11. graphify CLI is unpinned in CI.
  - Symptom: CI installed `graphifyy-0.9.68` (run 36241713974 log) while the local CLI reports `graphify 0.9.39` (`graphify --version`).
  - Root cause: `pip install graphifyy` with no version (`graphify-republish.yml:90`).
  - Severity: cosmetic today. A vendor release can change extraction or output shape under a green job, and the local post-commit rebuild and the ops publish are built by different extractor versions.
  - First seen: 09/26 (this audit).
- P12. graphify-publish drops more edges than the graph has.
  - Symptom: "graphify-publish: dropping 776085 dangling edge(s)" against "45878 total nodes · 93950 total edges" (run 36241713974).
  - Root cause: not diagnosed. The re-wiring pass (`scripts/graphify-publish.mjs:119`, `droppedTypeIds`) runs before the dangling filter (:168, logged at :177).
  - Severity: cosmetic (the published 676/849 renders).
  - First seen: 09/26 (this audit).
- P13. The catalog prints doc-ratchet's purpose as ">-".
  - Symptom: `node scripts/schedule-catalog.mjs` row `"name":"doc-ratchet-daily","purpose":">-"`. Scope (second Opus): 2 rows, not 1. `node scripts/schedule-catalog.mjs | grep -c '"purpose": ">-"'` → 2; the other is supabase-metrics-scrape (family 19's row, same root).
  - Root cause: the single-line regex at `scripts/schedule-catalog.mjs:83` does not read YAML folded scalars (`ingest/cadence_registry.yaml:2647` and `:2671` use `>-`).
  - Severity: cosmetic.
  - First seen: 09/26 (this audit).
- P14. Property Watch has nothing to watch and nothing to watch with.
  - Symptom: 0 of 23 projects have watch_enabled; the input table's newest `at` is 2026-08-14; project_events has 0 rows (SQL above).
  - Root cause: product not live-verified (the check was dropped 08/12); the listings input is parked by the operator.
  - Second finding (second Opus): both workflow headers still name that dropped check as the un-park gate ("PARKED until property_watch_live_verify passes", `watch-scan-daily.yml:3`, `watch-digest-daily.yml:3-7`; `watch-digest.mts:14,80` repeat it). SQL: `property_watch_live_verify` is `dropped`, resolved 08/12. The written un-park condition points at a key that no longer exists; §6's numbers are the real condition.
  - Severity: none while parked.
  - First seen: 07/07 (the check's created_at).

## 5. What is missing

There is no `source_ceiling` for any job (by design, `cadence_registry.yaml:2624-2630`), so "missing" is measured against what each job's consumer needs.

- doc-ratchet-daily:
  - A ledger that actually moves. The committed file has 2 rows in 52 days. There is also no machine-readable per-day history, since the CI row is thrown away every run.
  - A real doc delete list. P7 is not one; `node scripts/doc-reachability.mjs --orphans` is the only source.
  - Any test for `daysSinceImprovement`, the function that just proved wrong (0 tests, §3).
  - A place a human sees the red (P2).
- chief-of-staff-nightly: nothing worth adding. `morning_brief_no_consumer` (done 08/06) had already recorded zero human engagement when it succeeded. The kickoff already prints open checks, stale counts and flappers from `public.checks` directly (`scripts/session-kickoff.mjs:340-351`), which covers the deterministic half of the brief. The close-candidate judgment is done by the interactive session at pickup.
- watch-scan / watch-digest: a subscriber (0 watch-enabled projects) and a fresh input (listing_transitions stopped 08/14). The email transport is also unwired by design (`watch-digest.mts:10-18`). None of that is to be built now; listings are parked.
- airtable-checks-sync:
  - Null-record-id rows in the dirty set.
  - A parity assertion (open count equals mirrored count). None exists; the job exits 0 with 4 rows missing.
  - A reason to exist. The ops site `/checks` already reads `public.checks` live and can mark done/drop (`swfldatagulf-ops/app/api/checks/route.ts:26-28,55-68`), so the Airtable view is a second, read-only, currently wrong view of one ledger.
- graphify-republish:
  - A pinned CLI version.
  - A publish-path test.
  - The ops page skips 964 nodes it has no layer for ("lib_module:730 external:131 app_component:103" in the run log). That is a page choice, not a gap to fill.
- notion-sync-weekly: every section is missing a live source. If the hub is kept, it would have to be generated from the same roots the ops site reads (checks, schedule catalog, data-inventory), not typed prose.

## 6. Verdict per pipeline

- doc-ratchet-daily — REPAIR. It is green by construction while the committed ledger sits at 220 from 08/06, so it answers the operator's daily-improvement question with a permanent yes. Number that changes the verdict: `docs/standards/doc-ratchet-ledger.json` "updated" within the last 7 days on a day the check runs (today it is 51 days old).
- chief-of-staff-nightly — RETIRE. Dead since 08/06, no engagement when alive, and its leftover issue poisons every kickoff. Number that changes it: a count above 0 of humans acting on a brief (the done `morning_brief_no_consumer` recorded 0).
- watch-scan-daily — PARK (unchanged). 0 projects watching, input frozen at 08/14 by the listings park. Number: `count(*) from public.projects where watch_enabled` > 0 while the newest `data_lake.listing_transitions.at` is less than 2 days old.
- watch-digest-daily — PARK (unchanged). It has nothing to send (`public.project_events` = 0 rows) and mails real users once unparked. Number: `public.project_events` rows with notify_user and null notified_at > 0.
- airtable-checks-sync — REPAIR now (P7). RETIRE is the operator's call (§12), because ops `/checks` is the live superset. Number: open checks with a null `airtable_record_id` (4 today; must be 0).
- graphify-republish — GOOD ENOUGH. 15/15 green, it pushes only on app-plane change, and the ops page renders 676/849. Number: any red in `gh run list --workflow graphify-republish.yml --limit 15`, or an ops-repo publish commit older than the newest app-plane change on main.
- notion-sync-weekly — RETIRE (ASK-FIRST, it is his Notion workspace). It publishes 05/27 content as "Last refresh <today>". Number: 0 lines of `scripts/notion-sync.mjs` that read a live source (today 0; `grep` in §2).

## 7. The plan

Each item: what · where · lane · effort · proof · unblocks. All lanes are D (deterministic) unless stated. Items that change a scheduled workflow must regenerate the watch lists, or `watch-manifest-drift.test.mjs` goes red.

1. DO — Close issues #169 and #170 with a one-line comment each ("producer disabled 08/06; checks resolved 08/06"). Where: GitHub issues. Lane D (a session runs `gh issue close`). Effort S.
   - Proof: `gh issue list --label morning-brief --state open --json number --jq length` → 0, and `curl -s "https://api.github.com/repos/ethanrickyjrjr-wq/SWFL-Data-Gulf/issues?labels=morning-brief&state=open&per_page=1"` → `[]`.
   - Unblocks: kickoff stops printing the 08/01 brief (P4) and one stale incident issue leaves the queue (P5).
2. DO — Add `status: disabled` to the chief-of-staff-nightly entry at `ingest/cadence_registry.yaml:2656-2658`, and fix the one-line `purpose:` to say it is disabled. Lane D. Effort S.
   - Proof: `grep -n -A3 "name: chief-of-staff-nightly" ingest/cadence_registry.yaml`, then `pytest -q ingest/tests/test_cadence_registry_spine.py`.
   - Unblocks: the registry matches the API state (P6).
3. DO — Repair the doc ratchet's clock. In `scripts/doc-ratchet.mjs` `check` (:131-147), read the committed ledger with a separate `load()` BEFORE calling `record()` (`record()` overwrites `led.updated` in memory at :76), and fail when that committed `updated` date is 7 (`STAGNATION_DAYS`, :39) or more days before today. Keep the existing `daysSinceImprovement` stagnation test as a second, independent fail condition. (Corrected by second Opus: the earlier wording, "fail when stale AND today's count is not below the committed minimum", passes 216 and 219 because both are below 220, which contradicts this item's own test case and stated consequence.) Export `load`, `status` and `daysSinceImprovement` (the file exports nothing today: `grep -n "^export" scripts/doc-ratchet.mjs` → none), then add `scripts/doc-ratchet.test.mjs` with the replay cases from §4 P1: (12/31, 219) must fail against a ledger last updated 08/06, and (same day, 216 recorded) must pass. Lane D. Effort S.
   - Proof: `node --test scripts/doc-ratchet.test.mjs`, then (no dispatch) the next scheduled run's conclusion via `gh run list --workflow doc-ratchet-daily.yml --limit 1`.
   - Consequence, stated up front: the next scheduled run goes RED, because the ledger was last updated 08/06. It stays red until a burndown session commits `node scripts/doc-ratchet.mjs record` with a lower count. That is the intent written at `doc-ratchet-daily.yml:70-73`.
   - Unblocks: P1.
4. DO — Replace the wrong pointer. At `doc-ratchet.mjs:144`, `doc-ratchet-daily.yml:26-27,84-85` and the registry purpose at `ingest/cadence_registry.yaml:2651-2652`, point to `node scripts/doc-reachability.mjs --orphans` only and drop the P7 path. Leave the registry comments at :436, :554 and :2069 alone; they cite P7 correctly for data corpses. Lane D. Effort S.
   - Proof: `grep -n "P7-corpse" scripts/doc-ratchet.mjs .github/workflows/doc-ratchet-daily.yml` → nothing, and `sed -n 2645,2653p ingest/cadence_registry.yaml | grep -c P7` → 0.
   - Unblocks: P3.
5. DO — Put the ratchet's state into the kickoff, in the slot the dead brief occupied. In `scripts/session-kickoff.mjs`, replace `morningBriefBlock()` (:154-176, used at :303 and :348) with one line from `status(load())` of `doc-ratchet.mjs` (a pure read of the committed ledger; no network): "Doc ratchet: <N> orphans, <D> days since the committed ledger moved". It prints only when D ≥ 7. It needs the exports from item 3. Also delete the now-unused import of `briefKickoffLines` / `repoSlugFromRemoteUrl` at `scripts/session-kickoff.mjs:12`; item 11 depends on that. Lane D. Effort S.
   - Proof: `node scripts/session-kickoff.mjs | grep -i "doc ratchet"` shows the line today (the ledger is 51 days old). Do not pipe into `.claude/hooks/print-kickoff.mjs`, which waits for stdin to close (`print-kickoff.mjs:9-12`).
   - Unblocks: P2, without an issue, a check or a logger row.
6. DO — Airtable repair. In `scripts/airtable-checks-sync.mjs:102-104`, also treat `r.airtable_record_id == null` as dirty. After the upsert pass, exit 1 if any open row still has a null record id. That turns the existing cron-incident logger into the parity alarm. Add one case to `scripts/lib/airtable-checks-sync-core.test.mjs` or a new `scripts/airtable-checks-sync.test.mjs` for the predicate. Lane D. Effort S.
   - Proof: after the next scheduled run, `select count(*) from public.checks where state='open' and airtable_record_id is null` → 0, and that run's log says "4 dirty open row(s)" once.
   - Unblocks: P7.
7. DO — Bump `updated_at` in `check.mjs reopen`: add `updated_at: new Date().toISOString()` to the patch at `scripts/check.mjs:285`. Lane D. Effort S.
   - Proof: `grep -n "updated_at" scripts/check.mjs` shows it in `reopen`; existing check.mjs tests stay green.
   - Unblocks: the next reopen does not strand a mirror row (this is the path the cron-incident logger takes on every red, `log-cron-incident.mjs:150-162`), and staleness sorting (`check.mjs:94-99`) stops treating a just-reopened check as old.
8. DO — Pin graphify in CI: `pip install graphifyy==0.9.68` at `graphify-republish.yml:90` (the version CI is green on today). Lane D. Effort S.
   - Proof: `grep -n "graphifyy==" .github/workflows/graphify-republish.yml`, then the next scheduled run is green.
   - Unblocks: P11. Rule 9's 90-day review applies to the pin.
9. DO — Healthchecks step in graphify-republish: ping `/fail` when `job.status != 'success'` (`graphify-republish.yml:126-130`). Lane D. Effort S.
   - Proof: `grep -n "/fail" .github/workflows/graphify-republish.yml`.
   - Unblocks: P10 for this job; the fleet-wide fix is handed to family 19.
10. DO — Read YAML folded scalars in `scripts/schedule-catalog.mjs:83` (join the indented continuation lines when the value is `>-` or `>`). Lane D. Effort S.
    - Proof: `node scripts/schedule-catalog.mjs | grep -c '"purpose": ">-"'` → 0 (it is 2 today: doc-ratchet-daily and supabase-metrics-scrape), and `node scripts/schedule-catalog.mjs | grep -A2 '"name": "doc-ratchet-daily"'` shows real prose.
    - Unblocks: P13.
11. ASK-FIRST — Retire chief-of-staff-nightly fully. Runs only AFTER item 5, because `scripts/session-kickoff.mjs:12` imports `briefKickoffLines` and `repoSlugFromRemoteUrl` from `chief-of-staff-lib.mjs`. If the lib is deleted first, the import throws, `print-kickoff.mjs` swallows the error (:19-21), and every session starts with no kickoff at all. Full site list (second Opus: `git grep -ln "chief-of-staff\|Chief of staff nightly\|morning-brief\|morningBrief"` outside docs):
    - Delete `.github/workflows/chief-of-staff-nightly.yml`, `scripts/chief-of-staff-collect.mjs`, `scripts/chief-of-staff-lint.mjs`, `scripts/chief-of-staff-lib.mjs` and `scripts/chief-of-staff.test.mjs`.
    - Remove the registry entry at `ingest/cadence_registry.yaml:2656-2658`.
    - Drop `"Chief of staff nightly"` from `HEAL_EXCLUDED_NAMES` (`scripts/lib/watch-manifest.mjs:72`) and its `SHOULD_BE_DARK` entry (:32-33).
    - Update the fixtures and assertions that name it at `scripts/lib/watch-manifest.test.mjs:157,169,236,241`, and drop `.gitignore:193-195`.
    - Regenerate the lists.
    - That touches more than 5 files, so it needs the operator's word under RULE 1. Lane D. Effort M.
    - Proof: `node scripts/build-watch-lists.mjs --write --write-watchers`, then `node --test .github/scripts/watch-manifest-drift.test.mjs .github/scripts/trigger-list-drift.test.mjs scripts/lib/watch-manifest.test.mjs`, then `grep -c "chief-of-staff" ingest/cadence_registry.yaml` → 0 and `node scripts/session-kickoff.mjs | grep -c KICKOFF` → 1. (The earlier proof `node scripts/schedule-catalog.mjs | grep -c chief` already returns 0 today, so it proved nothing.)
    - Unblocks: removes the family's only model-call site (§10).
12. ASK-FIRST — Retire notion-sync-weekly. Comment out the schedule at `notion-sync-weekly.yml:16-17` (keep dispatch), set `status: disabled` at `cadence_registry.yaml:2730`, and regenerate the watch lists. Lane D. Effort S.
    - Proof: `node scripts/build-watch-lists.mjs --write --write-watchers && node --test .github/scripts/watch-manifest-drift.test.mjs`.
    - Unblocks: stops P8. If the operator wants the hub kept, the alternative is an M-effort rewrite that renders from the schedule catalog + checks + data-inventory (still Lane D).
13. ASK-FIRST — Retire airtable-checks-sync. This depends on §12's answer: delete the workflow and script, keep the two sync columns until a later migration, and regenerate the lists. Lane D. Effort S.
    - Proof: the watch-list regen + drift test, then `gh api repos/:owner/:repo/actions/workflows --jq '.workflows[].path' | grep -c airtable` → 0.
    - Unblocks: one fewer duplicate view of the ledger.
14. DO (no code) — Keep watch-scan and watch-digest parked as they are. Their un-park condition is the §6 number. Lane —. Effort —. Proof: `gh run list --workflow watch-scan-daily.yml --limit 1` stays empty until the operator un-parks listings.

Count: 11 DO items with code or action (1–10, plus 14 as a standing no-op), 3 ASK-FIRST (11–13).

## 8. Checks and balances

Design rule applied: one signal per pipeline, fired only when a consumer would read something wrong or stale, auto-cleared on green, and never an issue per run. The logger already opens at most one issue per workflow and closes it on the next scheduled green (`.github/scripts/log-cron-incident.mjs:228` "not duplicating", and `closeIncidentIssue` at :283). None of these seven has a freshness_sla or expected_rows_min, and this plan does not add them: `cadence_registry.yaml:2628-2629` forbids freshness fields on `jobs:`. `ingest/check_freshness.py` and `assert_landed.py` do not apply (no lake table), and neither does the ops `/coverage` page, which covers the pipelines: section.

- doc-ratchet-daily:
  - Signal: the kickoff line from plan item 5, printed only when the committed ledger is 7 or more days old. It clears itself the day a burndown commits `record`.
  - Keep: the job's own red on the Actions board, and its `WATCH_EXEMPT` entry (`scripts/lib/watch-manifest.mjs:40-41`); the exemption is right, since a deterministic red must not heal or log daily.
  - Delete: nothing to delete, and do not resurrect `doc_ratchet_red_is_board_only`.
- chief-of-staff-nightly:
  - Signal, while the file exists: tripwire's `darkDrift` (`scripts/tripwire-scan.mjs:174`, defined `scripts/lib/watch-manifest.mjs:260`). It fires if this job, declared in `SHOULD_BE_DARK` (:32-33), is re-enabled at the API. That is the only way it could hurt anything again. After item 11 there is no signal, because there is no job.
  - Delete: issue #169 and issue #170 (plan item 1), then the `morning-brief` label (`gh label delete morning-brief`) once item 11 lands, then `morningBriefBlock` in kickoff (item 5).
- watch-scan-daily:
  - Signal while parked: none. It has no schedule, so the logger does not watch it (`.github/_watch-manifest.json:1073-1081`, `"scheduled": false`).
  - On un-park: the logger watches it automatically after the regen, because the manifest derives from the cron. Its one signal is then the logger's per-workflow issue.
  - Delete: nothing.
- watch-digest-daily: same as scan. On un-park its failure must never auto-heal: a re-run re-sends mail. `SEND_SIDE_EFFECT` in `scripts/lib/watch-manifest.mjs:81-84` is the seam, and watch-digest-daily.yml goes in it the day the schedule is uncommented.
- airtable-checks-sync:
  - Signal: the job's own exit 1 on parity failure (plan item 6). That flows through the existing logger ("Airtable checks sync" is already in the `log-cron-incident.yml` list): one issue, auto-closed by the next green.
  - Delete: nothing new. The Healthchecks ping is absent here, which is fine.
- graphify-republish:
  - Signal (exactly one): the existing logger issue. It is already watched: "Graphify Republish" at `log-cron-incident.yml:44` and `heal-cron-failure.yml:47`.
  - Hygiene, not a second signal: item 9 corrects the Healthchecks ping so it stops reporting success on a red run (P10). It is an external heartbeat, not this family's alarm.
  - Delete: the false-green `if: always()` success ping shape (item 9).
  - Do not flip `CHAIN_GRAPHIFY_ENABLED` (it is unset in `gh variable list`). Putting this leg behind `nightly-chain.yml`, which is red on its row gate, would stall the one green job in the family.
- notion-sync-weekly: until item 12 lands, the one signal is the existing logger issue (`log-cron-incident.yml:94`). It catches reds only. It cannot catch the real defect (stale prose under a fresh date, P8), because no seam can: the script reads no source to be stale against. That is why the fix is retirement, not a new alarm. After item 12 there is no signal, and the logger drops it automatically after the regen. #187 is already closed (closedAt 2026-08-31, `gh issue view 187`), so there is nothing to delete. One more existing seam to note: the healer auto-reruns it (`heal-cron-failure.yml:94`). That is harmless for an idempotent tear-down-and-rebuild of Notion pages, so leave it.

What this family adds to the check ledger: zero checks. What it removes from the issue queue: #169, #170. What it removes from kickoff: one stale block. What it adds to kickoff: one conditional doc-ratchet line.

## 9. Box placement

Nothing in this family is on the Fedora box today:
- `ssh fedora 'systemctl --user list-timers --all --no-pager | grep -ciE "graphify|notion|airtable|ratchet|chief|morning|watch-scan|watch-digest"'` → 0.
- `ssh fedora 'grep -rliE "graphify|notion|airtable|ratchet|chief.of.staff|morning.brief" ~/.hermes/cron | wc -l'` → 0.

Every workflow here has `runs-on: ubuntu-latest` (the YAMLs in §1). None should move. In particular, no job in this family moves to the Fedora runner (`runs-on: [self-hosted, swfl-local]`, gated by `SWFL_LOCAL_RUNNER_READY`). None needs a residential IP, a browser, the `/srv/swfl` SSD archive, a local model, or more than 6 h. The longest timeout in the family is 20 minutes (`chief-of-staff-nightly.yml:39`, `graphify-republish.yml:47`). Second Opus re-ran the box probes on 09/26: timers → 0, Hermes cron matches → 0, `crontab -l` matches → 0, and `which graphify` on the box → not found. So nothing of this family is on the box that should not be. There is also no graphify on the box that could drift from CI.

- doc-ratchet-daily — stays GHA `ubuntu-latest`. Its work is `git ls-files` plus arithmetic over the checkout: ~23 s in the 09/26 log. It needs no WAF bypass, no residential IP, no browser, no SSD archive and no local model, and it runs far under 6 h.
- chief-of-staff-nightly — nowhere (retired). If the operator ever wanted it back, it would not be a Spectre job either: its judgment half belongs to an interactive Max session at pickup (§10).
- watch-scan-daily — stays GHA `ubuntu-latest` while parked, and on un-park too. It reads Supabase only, runs a 15-minute timeout (`watch-scan-daily.yml:22`), and has no WAF, browser or archive need.
- watch-digest-daily — stays GHA `ubuntu-latest`. Its only outside call would be the transactional email API; a residential IP adds nothing.
- airtable-checks-sync — stays GHA `ubuntu-latest` (or is retired). It makes two REST APIs with a 5-minute timeout (`airtable-checks-sync.yml:26`); nothing is blocked from a datacenter IP.
- graphify-republish — stays GHA `ubuntu-latest`. It needs a clean checkout of both repos and `REBUILD_PAT`, takes about 2.5 minutes, and needs no SSD, browser or local model. Moving it to the box would add a second copy of the operator's PAT on the box for no gain.
- notion-sync-weekly — nowhere (retired) or GHA. One REST API, 10-minute timeout (`notion-sync-weekly.yml:36`).

## 10. Compute lane per LLM leg

The grep that makes this list:

```
grep -nEi "anthropic|claude|ANTHROPIC_API_KEY|openai|refinery|ollama|codex" .github/workflows/{doc-ratchet-daily,chief-of-staff-nightly,watch-scan-daily,watch-digest-daily,airtable-checks-sync,graphify-republish,notion-sync-weekly}.yml
grep -lEi "anthropic|@anthropic-ai|openai|claude-|ollama|messages\.create|generateText|refinery/" scripts/doc-ratchet.mjs scripts/doc-reachability.mjs scripts/chief-of-staff-collect.mjs scripts/chief-of-staff-lib.mjs scripts/chief-of-staff-lint.mjs scripts/project-feed/watch-scan.mts scripts/project-feed/watch-digest.mts lib/project/watch-event.ts lib/project/watch-digest.ts lib/project/event-insert.ts scripts/airtable-checks-sync.mjs scripts/lib/airtable-checks-sync-core.mjs scripts/graphify-publish.mjs scripts/graphify-app-nodes.mjs scripts/graphify-snapshot.mjs scripts/notion-sync.mjs
```

Results:
- Workflows: the only live-call hits are `chief-of-staff-nightly.yml:56-61` (`anthropics/claude-code-action@v1` with an API-key input, `--model claude-sonnet-4-6`). The doc-ratchet hits are comments (:14-15) and an echo string (:80).
- Scripts: two files matched, and both are false positives. The `scripts/graphify-app-nodes.mjs` hits are comments naming `refinery/` paths (:139, :411, :600-603, :702). The `scripts/notion-sync.mjs` hits are page prose strings: 12 lines from :255 to :1422 (:255, :810, :820, :926, :931, :936, :941, :963, :976, :1413, :1416, :1422; corrected by second Opus, whose earlier list stopped at :926). None is an SDK import or an API call; the only network call in the file is the Notion `fetch` at :44.
- Second-Opus widening: the same grep with a bare `claude` (not `claude-`) and `lib/project/watch-delta.ts` + `scripts/lib/airtable-creds.mjs` added to the file list adds one more file, `scripts/doc-reachability.mjs`. Its hits are comments and `.claude/` path strings (:3, :9, :65, :73, :77), not calls.
- graphify CLI: the local `graphify --help` (0.9.39) says "update <path> re-extract code files and update the graph (no LLM needed)". The CI version (0.9.68) confirms it in its own run log: "Re-extracting code files in . (no LLM needed)..." (run 36241713974, 12:23:20Z). LLM labelling lives only under `cluster-only` / `label`, which the workflow never calls (`package.json:28`). The `+ @anthropic-ai/sdk@0.106.0` line in that log is the repo-wide `bun install` step, not a call made by this job.

The one leg:
- chief-of-staff-nightly "Reconcile" step. What it does: judges which open checks the last 48h of commits completed and writes a four-section brief (`chief-of-staff-nightly.yml:63-106`). Current auth: API-key input on claude-code-action (:56-58). State: dead since 08/06 on the 30-turn ceiling (run 31095947428); the workflow is disabled and its cron commented out.
- Replacement lane: none. The leg is redesigned away, not moved.
  - Its deterministic half (open checks, stale list, never-started live-verifies) is already printed at session start from `public.checks` by `scripts/session-kickoff.mjs`.
  - The judgment half (does commit X close check Y) is exactly what the interactive Max session does when it reads the kickoff and runs `node scripts/check.mjs close <key> --evidence <sha>`. That is the Lane M interactive pattern, at zero added machinery.
  - An unattended Lane M `claude -p` on the box is not proposed. There is no consumer to justify it, and `gh secret list` shows no `CLAUDE_CODE_OAUTH_TOKEN` repo secret (on-box presence not checked).
  - Lane C (Codex) and Lane L (local models) are not needed. No leg remains.

## 11. Double-check log

I re-read the file top to bottom and traced every figure to a command run in this session.

- 7 pipelines, `name:` lines 2645/2656/2682/2686/2698/2714/2730 · `grep -n "<name>" ingest/cadence_registry.yaml` · verified.
- `jobs:` at 2644; the no-freshness comment at 2624-2630 · `grep -n "^jobs:"` + `sed -n 2624,2630p` · verified.
- 21 open checks, none in family · `node scripts/check.mjs list` · verified.
- Dropped/done family checks and their dates · SQL on public.checks (check_key ilike …) · verified.
- doc-ratchet census 1023/546/216 of 1785 · `gh run view 36241485493 --log` · verified.
- Committed ledger 2 rows, 222/220, updated 08/06 · `cat docs/standards/doc-ratchet-ledger.json` · verified.
- Ledger "51 days old" · 08/06 → 09/26 date arithmetic · verified (Aug 6 to Sep 26 = 25 + 26 = 51).
- doc-ratchet last 15 = 8 green / 7 red · `gh run list --workflow doc-ratchet-daily.yml --limit 15` · verified.
- Last 52 runs = 14 green / 38 red, reds in one block 08/12–09/18 · `--limit 60` uniq count + the transition awk · verified.
- Replay daysSince 0/0/147/44 · node replay of `doc-ratchet.mjs:83-96` · verified.
- 0439789a on 09/18 took 245 → 216 · git log for 09/18–09/19 + runs 35343865412 / 35441544221 · verified that the count moved between those runs. Attribution to that one commit: could-not-verify (it is the only doc-shaped commit in the window).
- P7 rows 29-36 are data objects · `grep -nE "^\| [0-9]+ \|"` on P7 · verified.
- chief-of-staff last 15 = 3 green / 12 red; all-time 11/17 of 28 · `gh run list … --limit 15` and `--limit 100` group_by · verified.
- Turn-ceiling error text · `gh run view 31095947428 --log-failed` · verified.
- Issue #169 open since 08/01, #170 open · `gh issue list --label morning-brief --state open`; the open-issue grep · verified.
- Kickoff actually fetches #169 · curl HTTP 200 + "number": 169; `gh repo view` PUBLIC; `.claude/settings.json:71` in SessionStart (`grep -n SessionStart` → :49) · verified.
- `briefKickoffLines` returns 3 lines, all for checks done 08/06 · node one-liner + SQL · verified.
- chief-of-staff tests 27 pass · `bun test scripts/chief-of-staff.test.mjs` · verified.
- watch runs 0 / 0 · `gh run list … --jq length` · verified.
- projects 23/0/0; listing_transitions 64944 rows, newest 08/14, oldest 06/27; project_events 0 · SQL · verified.
- watch tests 29 pass · `bun test` over the 3 files · verified.
- airtable 15/15 green · gh run list · verified.
- Open 21 / 17 with record; 4 null-record open; the four keys · SQL · verified.
- Run-log dirty/stale counts 09/22–09/26 · `gh run view <id> --log | grep` · verified.
- airtable tests 11 pass · `node --test` · verified.
- reopen does not set updated_at · `sed -n 275,300p scripts/check.mjs` · verified. No updated_at trigger · information_schema.triggers · verified.
- graphify 15/15 green · gh run list · verified.
- 44369 / 90642 / 1680; +1509 / +3308; 676 nodes (component 234 … hook 15); 849 edges; 776085 dangling; 45878 / 93950 · run 36241713974 log · verified. The 676 sum was also checked by hand: 234+131+119+76+68+33+15 = 676.
- 964 skipped nodes · 730+131+103 from the same log line · verified.
- Ops commits 09/23, 09/20, 09/16, 08/30, 08/19 · gh api commits · verified.
- graphifyy 0.9.68 in CI vs 0.9.39 local · run log grep + `graphify --version` · verified.
- Hosted graph indexed 09/26 09:35Z at 27a345b · MCP graph_stats · verified.
- notion 13 green / 1 red / 1 skipped · gh run list · verified.
- 08/24 log expired · `gh run view 32733988196 --log` → "log not found" · verified.
- notion-sync.mjs 1596 lines; content refs :40, :183, :509; last commit 06/27 · `wc -l`, `grep -n`, `git log` · verified.
- Healthchecks 11 files, 0 with /fail · `grep -l … | wc -l` and `grep -c "/fail"` · verified.
- Box: 0 timer matches, 0 Hermes cron matches · ssh greps · verified. Earlier draft wording "22 timers" was removed (that `wc -l` counted header/footer lines) · corrected.
- No `CLAUDE_CODE_OAUTH_TOKEN` repo secret · `gh secret list | grep` (not in output) · verified.
- `CHAIN_GRAPHIFY_ENABLED` unset · `gh variable list` · verified.
- REBUILD_PAT last updated 07/16 · `gh secret list` · verified. Its expiry date: could-not-verify (fine-grained PAT expiry is not exposed by `gh secret list`); carried to §12.
- The ops `/checks` reads public.checks with done/drop · `gh api …/app/api/checks/route.ts` decode, lines 26-28 and 55-68 · verified.
- Plan item count 11 DO / 3 ASK-FIRST · recounted in §7 · corrected from the draft's "10 DO" (item 14 counted).
- graphify-publish re-wire / dangling-filter lines · `grep -n` in scripts/graphify-publish.mjs → :119, :168, :177 · corrected in §4 P12 (the draft cited "~60-122", which were offsets from a `sed -n 60,200` view).
- Logger dedupe / auto-close lines · `grep -n "not duplicating\|function closeIncidentIssue"` → :228, :283 · corrected in §8 (the draft said "~:220-229").
- graphify run duration · log timestamps 12:22:36 → 12:25:01 = 2m25s to the publish line · corrected in §3 (the draft said "about 2m30s").
- watch-scan/watch-digest `status: parked` at registry :2685 / :2689 · `grep -n "status: parked"` · verified.
- Forbidden-wording scan · `grep -niE "credit|billing|top.?up|balance|paid"` on this file → only the required "Checks and balances" heading · verified.

Second-Opus re-run (09/26, every claim re-executed in its own session):
- Registry `name:` lines 2645/2656/2682/2686/2698/2714/2730, `jobs:` at 2644, parked at 2685/2689, `build-example-deliverables` disabled at 2704 · `grep -n` on the registry · verified.
- doc-ratchet last 15: 8 success (09/19–09/26) / 7 failure (09/12–09/18); 52 all-time = 14 / 38; red block 08/12 → 09/18, greens 08/06–08/11 · `gh run list --limit 15` and `--limit 60` group_by · verified.
- 09/26 census 1023 (57.3%) / 546 (30.6%) / 216 (12.1%) of 1785, days-since 0 · `gh run view 36241485493 --log | grep` · verified.
- 09/18 run: 245 of 1772, "FAIL — 44 days"; 09/19 run: 216 of 1780, days-since 0 · `gh run view 35343865412 / 35441544221 --log` · verified. 44 = 08/05 → 09/18 by the fall-through branch at `doc-ratchet.mjs:93-95` · verified.
- Replay: ledger + (12/31, 219) → 0; + (12/31, 220) → 147 (08/06 → 12/31 = 25+30+31+30+31) · hand trace of `doc-ratchet.mjs:83-96` · verified.
- Ledger 2 rows, 222 / 220, `updated` 2026-08-06, last commit 166bae8b 08/05 · `cat` + `git log` · verified.
- `doc-ratchet.mjs` exports nothing · `grep -n "^export"` → none · verified (drove the item 3/5 correction).
- P7-list pointer sites: `doc-ratchet.mjs:144`, `doc-ratchet-daily.yml:27,85`, `cadence_registry.yaml:2652` · `git grep -n "P7-corpse-deletelist" -- scripts .github ingest .claude` · corrected (the registry site was missing).
- P7 file rows 29-36 are data objects · `rg --no-ignore -n "^\| [0-9]+ \|"` on the P7 file · verified.
- chief-of-staff last 15: 3 success (30695569015 08/01, 30263953909 07/27, 30000895636 07/23) / 12 failure; all-time 28 = 11 / 17 · `gh run list` · verified.
- chief-of-staff workflow state `disabled_manually` (id 310779251) · `gh api .../actions/workflows` · verified.
- Cited YAML lines :11-13, :22-23, :29, :39, :56-61, :63-106, :118-124 · `cat -n chief-of-staff-nightly.yml` · verified.
- #169 open (createdAt 2026-08-01T10:31:19Z), #170 open (cron-failure, createdAt 2026-08-02), #187 closed 2026-08-31 · `gh issue list/view` · verified.
- Kickoff fetch HTTP 200 → #169, 3 kickoff lines, 2 of them credit-wall keys · curl + node over `briefKickoffLines` · verified.
- `morningBriefBlock` defined :154, called :303, used :348; lib import at :12 · `grep -n` in session-kickoff.mjs · verified (the :12 import drove the item 11 correction).
- `.claude/settings.json:49` SessionStart, `:71` print-kickoff · `grep -n` · verified.
- chief-of-staff tests 27 pass / 0 fail · `bun test scripts/chief-of-staff.test.mjs` · verified.
- watch runs 0 / 0 · `gh run list --limit 50 --jq length` · verified.
- projects 23 total / 0 watching; listing_transitions 64944 rows, max 2026-08-14, min 2026-06-27; project_events 0 · Bun.SQL (scratchpad script modelled on `apply-fdic-sod-view.mts:15-27`) · verified.
- watch tests 29 pass / 0 fail · `bun test` over the 3 files · verified.
- `property_watch_live_verify` dropped 08/12, created 07/07 · SQL · verified.
- checks: open 21 / 17 with record / last sync 2026-09-22T17:03:56Z; done 593 / 0; dropped 1039 / 0 · SQL · verified.
- 4 open null-record keys, each synced after its updated_at · SQL · verified. Only trigger `checks_require_proof_trg` (INSERT, UPDATE) · information_schema · verified.
- Logger reopen path `openIncidentCheck` → `check.mjs reopen` at `log-cron-incident.mjs:150-162`; reopen patch at `check.mjs:285` has no updated_at · `sed -n` · verified.
- airtable 15 / 0 (09/12 → 09/26), run-log dirty/stale counts 1/0, 0/1, 0/0 ×3 · `gh run list` + `gh run view --log` · verified.
- airtable tests 11 / 11 · `node --test` · verified.
- airtable cron :13, timeout :26 · `cat -n airtable-checks-sync.yml` · verified.
- graphify 15 / 0 (09/12 → 09/26) · `gh run list` · verified.
- 44369 / 90642 / 1680; +1509 / +3308; 676 (234/131/119/76/68/33/15); 849; 776085 dangling; 45878 / 93950; skipped 730 / 131 / 103; start 12:22:36 → "No graph changes" 12:25:01 · run 36241713974 log · verified.
- graphifyy 0.9.68 in CI vs 0.9.39 local · log grep + `graphify --version` · verified.
- Ops commits 7744e50 09/23, 351e827 09/20, 2faf5a2 09/16, 6f4de8d 08/30, 3b99eda 08/19; ops `page.tsx:5` imports `./brain-graph.json` · `gh api` · verified.
- graphify YAML :17 cron, :47 timeout, :90 unpinned pip, :102-105 no-diff exit, :126-130 `if: always()` ping · `cat -n` · verified.
- Healthchecks 11 files, 0 with `/fail` · `grep -l | wc -l` · verified.
- notion 13 / 1 / 1 in last 15; 18 runs all-time, first run 06/01 (failure) · `gh run list --limit 100` · verified.
- notion-sync.mjs 1596 lines, `FRESHNESS` :40, `TODAY` :41, fetch :44, stamp :183, "Busiest day 2026-05-27" :509; created 0d0ae574 05/27; last commit 06cb3c45 06/27 · `wc`, `sed`, `git log` · verified.
- notion YAML cron :17, `ENGINE_ENABLED` gate :34 (repo var = true), timeout :36 · `cat -n` + `gh variable list` · verified.
- Catalog `">-"` rows = 2 (registry :2647, :2671) · `node scripts/schedule-catalog.mjs | grep -c` · corrected (was 1).
- `SEND_SIDE_EFFECT` at `watch-manifest.mjs:81-84`; `HEAL_EXCLUDED_NAMES` "Chief of staff nightly" at :72; `SHOULD_BE_DARK` entry :32-33; `WATCH_EXEMPT` doc-ratchet :40-41; `darkDrift` :260 · `grep -n` · corrected (the SEND_SIDE_EFFECT cite was :80-81).
- Watch manifest `watch-scan-daily.yml` `"scheduled": false` at `.github/_watch-manifest.json:1073-1081` · `grep -n -A9` · verified.
- Logger lists: "Airtable checks sync" :17, "Graphify Republish" :44, "notion-sync-weekly" :94 in `log-cron-incident.yml`; the healer holds the same three names at :21 / :47 / :94 · `grep -n` · verified.
- Secrets: no `CLAUDE_CODE_OAUTH_TOKEN`; REBUILD_PAT 2026-07-16T16:09:16Z; no `CHAIN_GRAPHIFY_ENABLED` variable · `gh secret list`, `gh variable list` · verified.
- Box: timers 0, Hermes cron 0, crontab 0, no graphify binary · `ssh fedora` · verified.
- LLM grep (widened to bare `claude`) → only `chief-of-staff-nightly.yml:29,56,58,59,61` are real; all script hits are prose or comments · grep in §10 · verified; notion hit list corrected to 12 lines.
- Credit-wording scan after the second-Opus edits · `grep -niE "credit|top.?up|console balance|billing|fund"` · 0 suggestions. The hits are the "Checks and balances" heading, the scan patterns themselves, and the two check key names cited in P4 as evidence against the dead brief · verified.

## 12. Questions for the operator

- Do you open the Airtable checks mirror? The ops `/checks` page already reads the same ledger live and lets you mark done/drop. If you don't use Airtable, plan item 13 retires the sync and the Airtable base is yours to delete. If you do, item 6 fixes the 4 missing rows either way.
- Do you read the Notion "Latest Sync" hub? It has shown 05/27 content under a fresh date every Monday. Retire it (item 12), or say keep it and it gets rebuilt from live sources.
- When does `REBUILD_PAT` expire? It is the one thing that can turn graphify-republish red with no code change. GitHub shows only that it was set on 07/16; the expiry date is on your token settings page.

## 13. Second-Opus verification

Claims checked: 91, one per §11 entry: the 47 inherited entries plus the 44 added (`sed -n 290,387p … | grep -c "^- "` → 91). The re-run covered 7 run lists, 9 run logs, 4 test suites, 13 SQL reads, the box ssh probes, the secret, variable and workflow-state reads, and the ops-repo API reads. Every cited file:line was opened. One inherited claim was not re-run: the hosted-graph `graph_stats` stamp (27a345b, 09:35:54Z) in §2. It is informational, and no verdict rests on it.

Corrections (what was wrong → what is right → evidence):
- Item 3's fail rule could not fail: "stale AND today's count not below the committed minimum" passes 216 and 219, since both are below 220 → fail on a committed `updated` 7 or more days old (read via `load()` before `record()`), plus the existing stagnation math → `doc-ratchet.mjs:76` (record overwrites `updated`) and the replay in §4 P1.
- Items 3 and 5 assumed importable functions → `load`, `status` and `daysSinceImprovement` must be exported first → `grep -n "^export" scripts/doc-ratchet.mjs` returns none.
- Item 5's proof piped into `print-kickoff.mjs`, which blocks on stdin → `node scripts/session-kickoff.mjs | grep -i "doc ratchet"` → `print-kickoff.mjs:9-12`.
- Item 11 would have silently blanked every session kickoff → it runs after item 5 and removes the lib import; the site list gains `SHOULD_BE_DARK` (:32-33), `watch-manifest.test.mjs:157,169,236,241` and `.gitignore:193-195`; its proof is replaced because the old one already returned 0 → `scripts/session-kickoff.mjs:12`, `print-kickoff.mjs:19-21`, `git grep -ln "chief-of-staff..."`.
- P3 / item 4 missed a pointer site → `ingest/cadence_registry.yaml:2651-2652` added to the fix and the proof → `git grep -n "P7-corpse-deletelist" -- scripts .github ingest`.
- P13 scope was 1 row → it is 2 (doc-ratchet :2647 and supabase-metrics-scrape :2671) → `node scripts/schedule-catalog.mjs | grep -c '"purpose": ">-"'` → 2.
- `SEND_SIDE_EFFECT` cited at `watch-manifest.mjs:80-81` → it is :81-84 → `grep -n`.
- §1 listed `ProjectWorkspace.tsx` and `lib/project/digest.ts` as `project_events` readers → they are comment hits fed by page.tsx; the direct readers are `route.ts:90`, `page.tsx:238` and `watch/page.tsx:30`, and the writer is `event-insert.ts:82,137` → `git grep -n "project_events" -- app lib refinery components`.
- §10 notion-sync hit list stopped at :926 → 12 prose lines, :255 through :1422 → the plan's own grep, re-run.
- §10 CLI "no LLM" evidence came from local 0.9.39 help → the CI 0.9.68 run log line "Re-extracting code files in . (no LLM needed)" is now cited → run 36241713974 log.
- §8 graphify-republish named two signals (logger + Healthchecks) → exactly one, the logger issue; the ping fix is hygiene → the brief's §8 one-signal rule.
- §8 chief-of-staff and notion-sync said "signal none" while the files still run or exist → chief: tripwire `darkDrift` (`tripwire-scan.mjs:174`); notion: the logger issue (`log-cron-incident.yml:94`) until retirement → `grep -n`.

Additions that are not corrections (sharpening with new evidence):
- P4: the two banned-topic lines are named by key (`anthropic_credits_nightly_red`, `nightly_chain_dark_anthropic_credits`, both done 08/06).
- P7: the stranding path is pinned to the logger's `reopen` (`log-cron-incident.mjs:150-162`).
- P14: the watch YAMLs gate un-park on a check dropped 08/12.
- §9: the Fedora gate sentence plus the re-run box probes.

Unverifiable claims:
- P9's root cause for notion-sync run 32733988196: `gh run view 32733988196 --log` → "log not found" (logs expired). It stands as could-not-verify.
- P1's attribution of the 245 → 216 drop to the single commit 0439789a: the run logs prove the count moved between 09/18 and 09/19, but not which commit moved it.
- `REBUILD_PAT` expiry: `gh secret list` shows only its update time (2026-07-16T16:09:16Z). It stays in §12.
- The exact date the Airtable stranding began: only the oldest stranded `airtable_synced_at` (2026-07-13) is observable.
- The ops `/checks` route line numbers (26-28, 55-68) were read from an offset view. The done/drop behaviour is verified; the exact lines are plus or minus 2.

Gaps filled:
- §8 now has one named signal on an existing seam for all 7 pipelines: doc-ratchet → kickoff line; chief-of-staff → tripwire darkDrift until deletion; watch-scan and watch-digest → none while parked (no consumer), the logger on un-park; airtable → exit 1 through the logger; graphify → the logger; notion → the logger until retirement.
- §9 now names `runs-on: [self-hosted, swfl-local]` / `SWFL_LOCAL_RUNNER_READY` and why no job moves.
- §11 extended from 47 to 91 entries.

Coverage: all 7 pipelines appear in sections 2, 3, 4 (doc-ratchet P1-P3 and P13; chief-of-staff P4-P6; watch-scan and watch-digest P14; airtable P7; graphify P10-P12; notion P8-P9), 6, 7, 8 and 9. All 13 sections are present with their exact headings.

Credit-suggestion count: 0 found in the first Opus's text, 0 introduced by this pass. `grep -niE "credit|top.?up|top-up|console balance|api key funding|billing"` hits only the §8 heading, the scan patterns in §11 and here, and the two check key names cited as evidence against the dead brief. "API-key input" in §10 describes the dead leg's current auth, as the brief requires. It proposes nothing.

Grade: PASS-WITH-CORRECTIONS. The verdicts and the family's shape stand. The corrections fix two items that would have shipped broken (items 3 and 11) and tighten scope on three more.
