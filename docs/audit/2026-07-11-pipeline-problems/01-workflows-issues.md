# CI/Cron Health Audit — brain-platform / SWFL-Data-Gulf

**Date:** 2026-07-11. **Method:** read-only (`gh` GET/list, `git log`, file reads). No writes except this file.

## Scope note — one repo, not two

`git remote -v` shows a single remote, `origin = https://github.com/ethanrickyjrjr-wq/SWFL-Data-Gulf.git`.
The local directory is named `brain-platform`; the GitHub repo it pushes to is `SWFL-Data-Gulf`. `gh repo
list ethanrickyjrjr-wq` returns no separate `brain-platform` repo. So "audit both repos" collapses to one
— everything below is `ethanrickyjrjr-wq/SWFL-Data-Gulf`, the same repo CLAUDE.md calls out for the daily
brain rebuild. Repo created 2026-05-13 (first commit); Actions run history starts 2026-05-15 — the run
history pulled below (3,568 runs) is effectively the *entire* project lifetime, not a 90-day retention
window.

102 workflow files in `.github/workflows/`. GitHub's Actions API additionally lists 2 Dependabot dynamic
workflows (`dynamic/dependabot/*`) with no local file — expected, not a gap. All 102 local files are
registered and reconcile cleanly against the API's 104 entries.

---

## RED NOW

### 1. `ci.yml` — 35 consecutive failing runs on `main`, ~37 hours and counting
Push/PR gate (`on: push: branches:[main]`, `on: pull_request`), no cron. Last success
`2026-07-09T18:09:15Z`; every push since (35 runs through `2026-07-11T08:19:58Z`) has failed the `Test`
step. `gh run list --workflow ci.yml --limit 5` / `gh run view <id> --log-failed`:

- **First failure in the streak** (run `29043313649`, 2026-07-09T19:09:26Z): **1** test failed —
  `MaterialRow > titles a real header-first seed from its hero, not the brand tagline`
  (`components/project/MaterialRow.test.tsx:94`).
- **Most recent run** (`29145943786`, 2026-07-11T08:19:58Z): **7** tests failed — the original
  `MaterialRow` test, `grounding coverage guard > home-map-data (mock) is imported only by the allowlisted
  debt`, and 5 tests in a `syncUserAudiences` block (including `CRITICAL: tenant B's sync creates ITS OWN
  segment, ignoring tenant A's same-name segment`). 5,795 pass / 7 fail / 12,121 assertions.
- The failing set **grew** from 1 to 7 over the streak — more commits landed on top of an already-red
  `main` without anyone fixing the base break; there is no branch-protection gate stopping pushes to a red
  `main` (35 pushes landed while red).
- Not the documented flaky-test pattern (`docs/cron-rebuild-failures.md` "Flaky test reddens main," a
  crypto-digest test measured at 6.5% failure): 35/35 consecutive fails on a deterministic component
  assertion is not consistent with a low-probability flake.
- `ci.yml` has **no `timeout-minutes`** anywhere in the file (only 3 of 102 workflows lack one — the
  others are `claude-code-automation.yml`, `deptry.yml`); a hang here would run to GitHub's 360-minute
  default before being killed. Not implicated in this incident (fails in 9s), but a latent gap.

### 2. `tripwire-hourly.yml` — 34 consecutive "failures," but this is the alarm working, not a broken pipeline
This workflow *intentionally* `exit 1`s when its deterministic scan (`scripts/tripwire-scan.mjs`) finds
a RED condition — that's the mechanism by which GitHub shows a red X and the linked issue gets a comment
(`.github/workflows/tripwire-hourly.yml:60-62`, `"Fail the run on RED (visible red X + heal-ledger
visibility)"`). Streak = 34 straight hourly runs, last success `2026-07-07T15:16:12Z`. The sticky issue
**#106 "TRIPWIRE RED — unauthorized paid activity or guard failure"** has been open since
`2026-07-05T18:17:26Z` (6 days) with **37 comments** (`gh issue view 106`).

**Root cause of the current, still-live RED (last scan `2026-07-11T06:27:28Z`):** exactly one red line —
`RED PULSE ACTIVE — 'City pulse daily' is ENABLED before the crawl4ai retrofit closed`. This is a
**stale check, not a live violation**. `scripts/tripwire-scan.mjs`'s `checkPulseDark()`
(lines 101-115) hardcodes `["Corridor pulse weekly", "City pulse daily"]` as workflows that must stay
disabled. `city-pulse-daily.yml` was deliberately, verifiably re-enabled on 2026-07-07 after a live-verified
retrofit dry-run (`SESSION_LOG.md:2606-2616`, "Pulse Phase 1 Task 6: city-pulse-daily re-enabled
(crawl4ai retrofit live-verified)" — closed check `pulse_crawl4ai_retrofit_live_verify`, uncommented the
`schedule:` block, confirmed run duration dropped from a 24-min web_search-era estimate to 2m49s). API
confirms: `city-pulse-daily.yml` `updated_at = 2026-07-07T12:51:34-04:00`, `state: active`, and it has run
successfully every day since (23-run current success streak, last run 2026-07-10T11:54:37Z success).
`tripwire-scan.mjs`'s hardcoded list was never updated to reflect that legitimate re-enable, so the alarm
has fired a false positive every hour for 4 days (issue open 6 days total, counting the original real
finding it was opened for). `corridor-pulse-weekly.yml`, the other name in the same hardcoded list, is
correctly still disabled (`updated_at` unchanged since 2026-07-05).

Separately: `checkPaidDispatches()`'s `paidWorkflows()` (line 49-60) flags any workflow file containing the
*string* `ANTHROPIC_API_KEY` as a paid workflow — `tripwire-hourly.yml` itself contains that string in a
negating comment (`# No ANTHROPIC_API_KEY here`), so its own past failures show up as
`YELLOW PAID-RUN FAILURE — 'Tripwire hourly'` in its own scan output — a self-referential false-positive
yellow, cosmetic, not investigated further here.

### 3. Four other active workflows currently on a failure streak
| Workflow | Streak | Cadence | Detail |
|---|---|---|---|
| `ingest-brevitas-listings.yml` | 2/2 failed, **never succeeded** | daily (schedule) | Only 2 runs ever: 2026-06-28, 2026-07-05, both `failure`. |
| `graphify-republish.yml` | 1/1 failed, **never succeeded** | daily (schedule) | Only 1 run ever: 2026-07-10, `failure`. |
| `home-values-investor-monthly.yml` | 1/1 failed, **never succeeded** | **monthly** | Only 1 run ever: 2026-06-24, `failure`. Latent until next month's fire, not a daily-visible break. |
| `zhvi-tier2-monthly.yml` | 1 (of 3 total: fail→success via manual retry 2026-06-12, then fail 2026-06-23) | **monthly** | Broken on its last (2026-06-23) scheduled fire, 18 days ago as of this audit; no retry attempted since. **Not** in either auto-capture watched list (see Silent-Death section) — its break produced zero issue, zero ledger row. |

Two more are dark (disabled) with a failing last run rather than "currently red" in the live sense:
`corridor-pulse-weekly.yml` (disabled 2026-07-05, last run `failure`) and `dbpr-sirs-monthly.yml`
(disabled 2026-06-22, last run `failure`) — see NEVER RAN / disabled section below; both were killed by
disabling the workflow rather than by a fix landing.

---

## NEVER RAN

18 of 102 workflows have **zero runs** in the full history (`totalRuns === 0` in the per-workflow
aggregation from all 3,568 runs). Naive "18 dead crons" would be wrong — each was checked against its
actual trigger config (comment-aware: an earlier pass without comment-stripping falsely flagged
`social-scheduler.yml`/`social-engagement-poll.yml` as "dead" cron when their `schedule:` blocks are
deliberately commented out — corrected before this report). Three real buckets:

**A — Active schedule, zero runs, but not actually overdue yet (8):** cron math against file creation
date shows none of these have reached their first scheduled occurrence, or (for `chief-of-staff-nightly.yml`)
the first occurrence lands within hours of this audit:
`redfin-city-swfl-monthly.yml` (created today, next fire Aug 18), `ingest-dbpr-re-licensees.yml` (created
today, weekly-Monday, hasn't hit one yet), `chief-of-staff-nightly.yml` (created 2026-07-10, daily
08:47 UTC — first fire imminent/just missed at data-pull time), `census-acs-annual.yml` (next: Nov 15),
`franchise-outcomes-quarterly.yml` (next: Jul 15 — **4 days away, watch it**),
`ingest-lee-associates-swfl.yml` (next: Aug 20), `ingest-mhs-permits-swfl.yml` (next: Mar 20 2027 —
created after this year's date passed), `bls-oews-annual.yml` (next: May 15 2027, same reason).

**B — Deliberately paused, `workflow_dispatch`-only (7):** the `schedule:`/`cron:` block is present in the
file but commented out with an explicit go-live gate in the comment. Confirmed by direct file read, not
regex alone:
`social-scheduler.yml` (`*/15 * * * *`, "SCHEDULE PAUSED until go-live... `node scripts/social.mjs
go-live`"), `social-engagement-poll.yml` (`0 * * * *`, same gate — needs the social schema migration +
live connected accounts + published posts first), `outreach-demo.yml`, `outreach-drip.yml`,
`watch-digest-daily.yml`, `watch-scan-daily.yml`, `weekly-read.yml` (this one's live-but-commented cron
is `0 11 * * *` — daily, despite the filename saying "weekly"; noted as-is, not resolved here).

**C — No schedule trigger at all, zero runs is normal (3):** `activation-sequence.yml`
(`workflow_dispatch` only), `pulse-pool-evict.yml` (`workflow_dispatch` only),
`claude-deploy-triage.yml` (fires only on `issues: types:[labeled]` with label `deploy-incident` — that
label is only applied by `rollback-on-red.yml`, which is itself "DARK BY DEFAULT" pending
`SELFHEAL_ROLLBACK_ENABLED=true`; zero incidents in 3.6 days is consistent with that being unarmed, not
investigated further here).

**Net finding: no confirmed "phantom dead cron" in this repo** — every zero-run active-schedule workflow
resolves to "too new" / "not due this cycle" / "deliberately gated," not to a broken trigger.

## Disabled / stale-cron workflows

6 of 102 workflows are `state: disabled_manually` (`gh api .../actions/workflows`, `state` field):

| Workflow | Disabled (`updated_at`) | Cron still live in source? | Last run before disable |
|---|---|---|---|
| `corridor-pulse-weekly.yml` | 2026-07-05T10:22:06-04:00 | No — commented out too | `failure` (2026-07-05T13:40:44Z) |
| `dbpr-sirs-monthly.yml` | 2026-06-22T14:04:28-04:00 | **Yes**, uncommented `0 7 1 * *` | `failure` |
| `collier-permits-monthly.yml` | 2026-06-15T12:25:05-04:00 | No — commented out too | `success` |
| `fgcu-reri-monthly.yml` | 2026-06-15T12:25:06-04:00 | **Yes**, uncommented `0 14 5 * *` | `success` |
| `marketbeat-pdf-ingest.yml` | 2026-06-15T12:25:07-04:00 | **Yes**, uncommented `0 10 15 1,4,7,10 *` | `success` |
| `rsw-airport-monthly.yml` | 2026-06-15T12:25:08-04:00 | **Yes**, uncommented `0 15 8 * *` | `success` |

4 of the 6 (`fgcu-reri-monthly.yml`, `marketbeat-pdf-ingest.yml`, `rsw-airport-monthly.yml`,
`dbpr-sirs-monthly.yml`) were disabled at the GitHub API level only — the YAML source still carries a
live, uncommented `cron:` block. Anyone (or anything) running `gh workflow enable` on these resumes
firing on schedule immediately with no code-level guard, unlike `corridor-pulse-weekly.yml` and
`collier-permits-monthly.yml`, which are disabled both ways (belt + suspenders).

Batch pattern: 4 of the 6 were disabled within 3 seconds of each other (`12:25:05`-`12:25:08` on
2026-06-15) — a single scripted/deliberate batch action, not 4 independent incidents.
`corridor-pulse-weekly.yml` and `dbpr-sirs-monthly.yml` each tie directly to a `cron-failure` issue
(#105 BILLING, opened 13:20 same day it was disabled 14:22 UTC; #98-#102, opened the same day it was
disabled) — both issues remain **open**, and can never auto-resolve (`log-cron-incident.yml`'s
`maybe_auto_resolve` only fires on the *next scheduled success* of the same workflow, which will never
come while it's disabled).

---

## CHRONIC FLAPPERS

Threshold used: flap-rate (success↔failure transitions ÷ meaningful-run-count) ≥ 0.35 with ≥6 meaningful
runs, computed over the full history.

- **`daily-rebuild.yml`** — 70 meaningful runs (of 72 total), 42 success / 29 failure (1 cancelled), 25
  transitions, flap-rate 0.36. **Historical, not current**: sequence `FFSFSFFFFSFFFFFFSFCSFSSSSSFSSSSSSSSSSSSFSSFSFFFSSSFSFFFFFFSSSSFSSSSSSSSS`
  shows the instability concentrated late May–mid June; the last 15 runs (2026-06-29 through 2026-07-11)
  contain exactly 1 failure (2026-07-03, the fdot-aadt timeout-hold incident, see below) against 14
  successes, current streak = success. `daily-rebuild.yml` is also the pipeline with the most
  `cron-failure` issue history (3 issues, all closed) and the most incident-table rows (see
  FAILURE-CLASS COUNTS) — it has the most operational attention of anything in the repo, which likely
  explains why it stabilized while others didn't.
- **`lee-permits-weekly.yml`** — 12 meaningful runs (of 13 total), 8 success / 5 failure(inc. 3 same-day
  cancelled dispatches folded out), 5 transitions, flap-rate 0.42. **Still live**: most recent scheduled
  run (2026-07-06) failed; recovered only via a manual `workflow_dispatch` two days later (2026-07-08),
  not by the following week's schedule. Pattern across the full history: a scheduled run fails, a human
  or agent manually re-dispatches to recover, repeat — this is a workflow that currently depends on a
  manual safety net rather than being self-healing.

---

## FAILURE-CLASS COUNTS

Two source ledgers exist and **partially overlap in time** — counted separately, not summed, to avoid
inflating any one class. Unit = one row / one issue (an event-row), not a deduplicated root cause; where
one underlying cause produced multiple rows (e.g. `dbpr-sirs-monthly`'s `checkout@v6` typo hitting 3
scheduled runs), that is called out explicitly rather than folded into "1."

### Source A — `docs/cron-rebuild-failures.md` incident table (~46 table rows, 2026-05-25 → 2026-07-03)
This doc's own header notes it was **frozen 2026-06-28** ("auto-capture moved off `main`... New incidents
are recorded as GitHub Issues... NOT as rows here") — it is a closed historical ledger from that date
forward, superseded by Source B for anything after.

| Class | Count | Rows / evidence |
|---|---|---|
| UNKNOWN / never triaged (auto-captured, no root cause ever recorded) | **15** | Every row whose Root Cause column literally reads `_auto-captured; pending triage_` with no later triage note — mostly `daily-rebuild`/`freshness-probe-daily`/`collier-permits-monthly` early-history rows (2026-05-29 through 2026-06-20). **32% of all historical incident rows were closed by auto-resolve (next run succeeded) without anyone ever determining what broke.** |
| TRANSIENT / FLAKE | 7 | `dbpr-sirs-monthly` ×2 (Playwright `Page.goto` timeout, 06-22), `daily-rebuild` critical-upstream HOLD (06-18, self-recovered), `daily-rebuild` FRED FLUR HTTP 429 (05-31), `fema-nfip-quarterly` SSL EOF mid-pagination (05-26), `census-vip-monthly` ReadTimeout (05-26), `census-cbp-annual` timeout (05-26). |
| SECRET-NOT-WIRED | 4 rows / **3 distinct secrets** | `FRED_API_KEY` (daily-rebuild, 2 rows: 05-26 first-ever schedule run + 05-27), `SUPABASE_S3_ENDPOINT`+2 sibling vars (1 row, but hit **6** Tier-1 cold-lane workflows simultaneously, 05-26), storm-history's own `SUPABASE_S3_*` read (06-01, 1 row — same variable family, different pipeline). Named as the #1 Recurring Pattern in the doc. |
| SCHEMA/VOCAB DRIFT (Orphan Concept / dlt column-type) | 4 | `daily-rebuild` Orphan Concept ×3 (06-22 OPEN, 06-02 3-slug, 05-29 4-slug), `news-swfl-ingest` dlt `date`-vs-`text` column mismatch (06-20, triaged 06-22 — "misattributed to crawl4ai in the auto-row"). |
| ACTION_VERSION (`checkout@v6`/`setup-python@v6` don't exist) | 4 | `dbpr-sirs-monthly` ×3 (06-22, one variant surfaced as a Windows `pwsh.exe` stat error before the real cause was found), `redfin-monthly` (05-26, the pattern's first occurrence). |
| SCHEMA/STATE DRIFT (dlt skips `CREATE TABLE` on existing pipeline-state) | 1 | `faf5-annual` (05-26, stayed OPEN; ultimately resolved 06-14 by retiring the dlt→Postgres path entirely, not by fixing it). |
| WAF / SCRAPE-BLOCK | 1 | `collier-permits-monthly` (05-27) — Collier County WAF activated between dry-run and first live dispatch; fixed via Firecrawl stealth scrape. |
| BUN.LOCK DRIFT | 1 (3 failed dispatches) | `daily-rebuild` ×3 manual dispatches, 06-01, `@sanity/client` removed without regenerating `bun.lock`. |
| FLAKY TEST (non-deterministic assertion) | 1 | `proposal-nonce` HMAC-padding test, measured 6.52%/push over 5000 runs, held `main` red 6 commits/~2h (06-13). |
| PACK⇆CATALOG DRIFT (no pre-push gate at the time) | 1 | redfin-lee parity build, same 06-13 CI-red episode, distinct second cause. |
| CORRIDOR-ALIAS DRIFT | 1 | 05-27, corridor rename not propagated to `corridor-aliases.mts`. |
| DEPENDENCY NOT PINNED | 1 | `lee-permits-weekly` `ModuleNotFoundError: bs4` (05-26). |
| INTEGRATION BUG (own code, not source-side) | 2 | `marketbeat-quarterly` treated an async Firecrawl job-submission response as final data (05-26, pipeline later deleted); `lee-permits-weekly` scraper shipped with 4 inherited bugs — wrong host, wrong module path, wrong form field IDs (05-25). |
| SOURCE CHANGED/GONE (no block, just moved/rebranded) | 2 | `corridor-narratives-quarterly` (broker sites rebuilt/rebranded, 05-26, pipeline deleted), `county-planning-monthly` (portal URLs stale, 05-26, pipeline deleted). |
| **TIMEOUT** (this audit's task item 6 focus) | 1 in this table | `daily-rebuild`/`fdot-aadt-annual`, 2026-07-03 — see SILENT-DEATH section; the `corridor-pulse-weekly` 45-min timeout incident (also 3 kills) predates this table's rows and is documented instead in `SESSION_LOG.md` + `cadence_registry.yaml` (both read directly, see below) rather than as its own table row. |

### Source B — GitHub issues, label `cron-failure` (14 total: 6 open, 8 closed)
`gh issue list --label cron-failure --state all` — title format `[cron-failure:<workflow>] <CLASS> · ...`:

| Class (from issue title) | Count | Issues |
|---|---|---|
| UNKNOWN | 7 | #89 lee-permits-weekly, #91 daily-rebuild, #92/#93 news-swfl-ingest, #101/#102 dbpr-sirs-monthly, #103 freshness-probe-daily |
| TRANSIENT | 2 | #98, #99 (both dbpr-sirs-monthly) |
| SCHEMA_DRIFT | 1 | #97 daily-rebuild |
| ACTION_VERSION | 1 | #100 dbpr-sirs-monthly |
| DETERMINISTIC_HOLD | 1 | #104 daily-rebuild (this is the fdot-aadt-annual/timeout incident, logged here under its symptom class rather than root cause) |
| BILLING | 1 | #105 corridor-pulse-weekly |
| CONTENT_STALE | 1 | #107 lee-permits-weekly |

**Known overlap, not summed:** issues #98-#102 (dbpr-sirs-monthly, all opened 2026-06-22 16:41-17:43 UTC)
almost certainly record the *same* underlying `checkout@v6` + Playwright-timeout failures as incident-table
rows at lines 24-28 (also dbpr-sirs-monthly, also dated 2026-06-22) — the doc's 2026-06-28 note says
capture moved to issues, but these issues predate that cutover by 6 days, i.e. both systems were briefly
double-recording the same event. Repeat-offender ranking from the issue ledger alone:
`dbpr-sirs-monthly` (5 issues, 4 still open — the workflow was disabled rather than fixed),
`daily-rebuild` (3, all closed), `lee-permits-weekly` (2, 1 open), `news-swfl-ingest` (2, closed),
`corridor-pulse-weekly` (1, open), `freshness-probe-daily` (1, closed).

---

## `ingest/cadence_registry.yaml` — unconfirmed first runs

78 pipeline entries (`grep -c '^\s*- name:'`). 7 carry an explicit "first run not yet confirmed" comment
(`<fill on first successful ...>` or equivalent) — cross-checked against actual GHA run history
(`gh run list --workflow <file>`) rather than taken at face value:

| Registry entry | Comment (as written) | Workflow file | Actual GHA history |
|---|---|---|---|
| `fred_laus_alfred` | `<fill on first successful workflow_dispatch>` | `fred-laus-alfred-monthly.yml` | **Stale** — 3 successes, last 2026-06-27T15:19:12Z |
| `fred_listing_swfl` | `<fill on first successful workflow_dispatch>` | `ingest-fred-listing-swfl.yml` | **Stale** — 1 success, 2026-07-07T15:37:23Z |
| `market_heat_swfl` | `<fill on first successful workflow_dispatch>` | `ingest-market-heat-swfl.yml` | **Stale** — 3 successes, last 2026-07-08T15:05:41Z |
| `city_pulse` | `<fill on first successful GHA run>` | `city-pulse-daily.yml` | **Stale** — 23 successes, last 2026-07-10T11:54:37Z |
| `city_pulse_corridors` | `<fill on first successful GHA run>` | `corridor-pulse-weekly.yml` | **Stale** — 3 successes, last 2026-06-14T11:49:12Z (workflow now disabled) |
| `dbpr_re_licensees` | `<fill in after Task 7's live run>` | `ingest-dbpr-re-licensees.yml` | **Accurate** — 0 runs, workflow created same day as this audit |
| `noaa_ghcn_rainfall` | `pending first GHA dispatch` | `noaa-ghcn-rainfall-monthly.yml` | **Stale** — 2 successes, last 2026-07-05T15:03:51Z |

6 of 7 placeholders are stale — the pipeline has already had a confirmed live success (in one case,
`fred_laus_alfred`, the placeholder has been stale for 2+ weeks) but the registry comment was never
updated to record it. Only `dbpr_re_licensees` is a genuinely accurate "not yet run" placeholder.

---

## SILENT-DEATH RISKS (timeout / spend)

### The structural gap: `cancelled` is invisible to both auto-capture systems
`heal-cron-failure.yml`'s `triage` job and `log-cron-incident.yml`'s `record_failure` job each gate on:
```
github.event.workflow_run.conclusion == 'failure'
```
(`heal-cron-failure.yml:66-70`, `log-cron-incident.yml:61-63`). GitHub Actions reports a run killed by
`timeout-minutes` as `conclusion: cancelled`, not `failure` — confirmed empirically: across the full
3,568-run history, 30 runs have `conclusion: cancelled`
(`corridor-pulse-weekly.yml` ×3, `leepa-parcels-annual.yml` ×4, `fdot-aadt-annual.yml` ×1,
`active-listings-daily.yml` ×3, `fema-nfip-quarterly.yml` ×2, `daily-rebuild.yml` ×1, plus 4 on two
now-deleted pipelines). `SESSION_LOG.md:4130` independently uses the same word for the corridor-pulse
kills ("cancelled 06/21 + 06/28 + 07/05 at exactly 45m") — the repo's own incident narrative and the raw
API agree. **A `cancelled` run never satisfies either handler's `if:` condition — no issue opens, no
`docs/cron-rebuild-failures.md` row, no retry, no ping, for any workflow, by construction of that one
line, not as a one-off oversight in corridor-pulse specifically.**

This is not undetectable forever: `ingest/cadence_registry.yaml`'s SLA fields (`freshness_sla:
warn_after_days` / `error_after_days`) and the freshness-probe cron are a *separate*, *lagged* net — they
catch the downstream symptom (a table not getting fresher) once the tolerance window elapses, days after
the run-level failure happened. That is how both real timeout incidents below were eventually found — not
via the incident-issue system, but via staleness noticed afterward.

**Confirmed timeout-kill incidents (2 total, both already fixed at the workflow level):**

- **`corridor-pulse-weekly.yml`**: cancelled at exactly 45 minutes on 3 consecutive scheduled runs
  (2026-06-21, 06-28, 07-05); last known-good run (06-14) had already crept to 37 minutes, so headroom
  evaporated over 3 weeks. Sonnet `web_search` spend happened *before* each kill (money spent, data
  discarded — `cadence_registry.yaml:478`: "silently dead 3 weeks... killed after full API spend, zero
  rows kept"). Buffered stdout meant the run logs showed nothing useful either
  (`SESSION_LOG.md:4128-4135`). Fixed same day: `timeout-minutes` 45→90, `PYTHONUNBUFFERED=1`. The
  workflow was then disabled anyway hours later for an unrelated, larger spend-control decision (see RED
  NOW #2) — so the timeout fix has had zero live runs to prove itself since.
- **`fdot-aadt-annual.yml`**: first-ever scheduled run (2026-06-15) was cancelled mid-Tier-2 `replace`
  at its 20-minute ceiling (~19m35s actual vs ~4.5min dry-run baseline). Because dlt's Postgres `replace`
  disposition truncates before reinserting (non-atomic), the table sat at **0 rows for 18 days** —
  masked because the downstream brain's cache TTL hadn't expired yet. Surfaced 2026-07-03 only when
  `daily-rebuild` tried to rebuild the downstream brain and hit `assertSegmentsNonEmpty`, which correctly
  refused to invent data and HELD master (exit 1, prior `master.md` kept serving — not a connector
  defect). Fixed: `timeout-minutes` 20→40, backfilled locally.

**Unexplained cancellations, not yet root-caused by this audit (flagged, not investigated further —
outside the read-only file/gh-list scope of this pass):**

- **`leepa-parcels-annual.yml` — 4 of 4 runs, ever, are `cancelled`.** Zero successes, zero failures,
  100% cancellation rate across its entire history (2026-05-26 ×3 workflow_dispatch, 2026-06-15 ×1
  schedule; nothing since — 26 days idle as of this audit). `timeout-minutes: 30`, no `concurrency:`
  block in the file to explain these as supersede-cancels. Its `cadence_registry.yaml` entry
  (`leepa`, confirmed 548,798 rows, `MAX(inserted_at) = 2026-05-18`) shows the underlying data *is* live
  and fresh — meaning the real load happened through some path other than this always-cancelled GHA
  workflow (consistent with this repo's documented pattern of local `python -m ingest.pipelines...`
  backfills when GHA is broken, e.g. the fdot-aadt-annual recovery above). The workflow itself has never
  once completed, is on both auto-capture watched lists' name arrays, but — per the structural gap above
  — a 100% `cancelled` record never trips either one.
- **`active-listings-daily.yml` — 3 cancelled runs** (2026-07-03 schedule, 2026-06-26 ×2 dispatch),
  `timeout-minutes: 30`, no concurrency block found. Currently on a 55-run success streak, so not
  currently at risk, but the same blind spot applies if it recurs.
- **`smoke-prod.yml` — 12 cancelled runs is by design**, not a timeout risk: the file sets
  `concurrency: { group: smoke-prod-<env>-<ref>, cancel-in-progress: true }` (`smoke-prod.yml:9-11`), so
  a new deploy's smoke check intentionally supersedes an in-flight one. Excluded from the risk list above
  for this reason — included here only to show it was checked, not assumed.

### Coverage gap, quantified
`heal-cron-failure.yml` watches 27 workflow names (hardcoded `workflow_run: workflows:` array);
`log-cron-incident.yml` watches 29. Of the **77 actively-scheduled workflows** (live, non-commented cron,
`state: active`) in the repo:

- **55 of 77 (71%)** are not in `heal-cron-failure.yml`'s watch list — their failures get no auto-retry,
  no LLM diagnosis.
- **53 of 77 (69%)** are not in `log-cron-incident.yml`'s watch list — their failures write no issue, no
  ledger row.
- Of those 53 uncovered-by-log-incident workflows, **22 have at least one real failure in their run
  history**, **3 have never once succeeded** (`ingest-brevitas-listings.yml`,
  `graphify-republish.yml`, `home-values-investor-monthly.yml` — all three already listed under RED NOW),
  and **5 are on a live failure streak right now** including `tripwire-hourly.yml` (34, by design) and
  `zhvi-tier2-monthly.yml` (broken 18 days, silent). `daily-rebuild.yml` is deliberately excluded from
  `heal-cron-failure.yml` only (comment: "it owns `refinery/lib/master-freeze-watchdog.mts`") but *is* on
  `log-cron-incident.yml`'s list — that specific exclusion is a documented design choice, not a gap.

---

## Coverage note

This audit did not query `public.checks` (the `cron_incident_*` rows) — that table lives in Supabase, not
in `gh`/`git`/file surfaces, and was out of scope for a read-only `gh`+file pass. `docs/cron-rebuild-failures.md`'s
own 2026-06-28 note says incidents are now recorded partly as `public.checks` rows alongside GitHub issues,
so a full incident-ledger picture would need that table too. Flagged, not chased.

## Raw evidence appendix

Commands run (all read-only):
```
git remote -v
gh repo list ethanrickyjrjr-wq --limit 50 --json name,updatedAt,isPrivate
gh api rate_limit --jq '.resources.core'
gh api "repos/ethanrickyjrjr-wq/SWFL-Data-Gulf/actions/runs?per_page=1" --jq '.total_count'   # 3567
gh api --paginate "repos/ethanrickyjrjr-wq/SWFL-Data-Gulf/actions/runs?per_page=100" \
  --jq '.workflow_runs[] | {name,path,conclusion,status,event,created_at,display_title,run_number,id}'
  # 3568 rows captured, oldest 2026-05-15T19:22:42Z, newest 2026-07-11T08:17:29Z
gh api --paginate "repos/ethanrickyjrjr-wq/SWFL-Data-Gulf/actions/workflows?per_page=100" \
  --jq '.workflows[] | {id,name,path,state,created_at,updated_at}'   # 104 rows (102 files + 2 dependabot dynamic)
gh issue list --label cron-failure --state all --limit 200 --json number,title,state,createdAt,closedAt   # 14
gh issue view 106 --json body,comments --jq '...'   # tripwire sticky issue, 37 comments
gh run view <id> --json jobs --jq '...'             # ci.yml step-level failure
gh run view <id> --log-failed                       # ci.yml / leepa-parcels-annual.yml specific failures
```
Files read directly (not summarized from memory): `.github/workflows/heal-cron-failure.yml`,
`.github/workflows/log-cron-incident.yml`, `.github/workflows/rollback-on-red.yml`,
`.github/workflows/tripwire-hourly.yml`, `.github/workflows/ci.yml`, `.github/workflows/smoke-prod.yml`,
`.github/workflows/social-scheduler.yml`, `.github/workflows/social-engagement-poll.yml`,
`.github/workflows/claude-deploy-triage.yml`, `.github/workflows/leepa-parcels-annual.yml`,
`.github/workflows/active-listings-daily.yml`, `scripts/tripwire-scan.mjs`,
`ingest/cadence_registry.yaml` (1757 lines, both halves), `docs/cron-rebuild-failures.md` (full file),
`SESSION_LOG.md` (targeted greps + full reads around lines 2606-2616 and 4045-4144).

Aggregation method: all 3,568 runs grouped by workflow `path`, sorted chronologically per workflow;
`success`/`failure`-class conclusions form a "meaningful" subsequence used for streak length and
flap-rate (transitions ÷ (meaningful_count − 1)); `cancelled`/`skipped` conclusions are excluded from
that subsequence but tallied separately (this is what surfaced `leepa-parcels-annual.yml`'s 100%
cancellation rate, which a naive success/failure-only view would have missed entirely). One correction
made mid-audit and left visible above: an initial regex-based YAML scan flagged `cron:` lines inside
YAML comments as live schedules, which would have wrongly labeled 7 deliberately-paused workflows as
"dead cron." Re-parsed with comment-stripping before any conclusion was drawn from that data.
