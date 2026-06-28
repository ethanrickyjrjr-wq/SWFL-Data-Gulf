# Self-healing cron: unblind incident logger + Healthchecks.io dead-man's-switch + Dependabot

**Date:** 2026-06-28
**Status:** design — approved shape, pending spec review, NOT built.
**Build slug / check:** `self-healing-automation` / `self_healing_automation_live_verify` (open).
**Parent / supersedes:** rescopes `docs/superpowers/specs/2026-06-28-focus-restructure/04-self-healing-automation.md`
(Issue 04). That spec's full §3 build stack was written from memory/backlog; a probe-first audit
(RULE 0.5) this session found ~80% of it already built and two central premises wrong. This doc is the
corrected, evidence-backed scope. Item 4 (minute-0 cron sweep) is split into its own spec.

---

## 0. What the audit found (why the scope collapsed)

Issue 04 said to build a $0 self-healing stack (retry + auto-issue + dead-man's-switch + Dependabot) and
to "fix the daily-rebuild bypass FIRST." Probing the live code + GitHub run history overturned that:

- **daily-rebuild bypass is already fixed.** `daily-rebuild.yml` pushes via `secrets.REBUILD_PAT` (the
  repo-owner bypass actor); the latest *scheduled* run (2026-06-27 08:31Z) was green. "Fix it first" is moot.
- **Retry + LLM diagnosis already exist and run fine.** `heal-cron-failure.yml` (+ `classify-cron-failure.mjs`,
  spec `2026-06-08-leveled-cron-self-healing-design.md`) does L0 `gh run rerun --failed` (capped at
  `run_attempt===1`) and L2 Haiku diagnosis. It does **not** commit to main, so it is healthy.
- **The incident logger is itself silently DOWN.** `log-cron-incident.yml` `record_failure` is GH013-rejected
  (`remote: error: GH013 … Required status check "CI / build" is expected … Changes must be made through a pull
  request`). It commits the ledger to `main` as `github-actions[bot]`, which has **no** ruleset bypass — the
  exact bug that hit daily-rebuild, never fixed on the logger. The failure ledger has recorded nothing since
  2026-06-22; five straight freshness-probe failures (06-23 → 06-27) were never captured.
- **"Wrap freshness-probe in retry" is wrong.** `check_freshness.py` `sys.exit(1)` fires **only** on the SLA
  path (`if sla_errors and not args.sla_dry_run: return 1`); any unexpected crash is swallowed and returns 0
  ("always exits 0" contract). So the probe red is the SLA alarm *working* — a real source is breaching
  `error_after_days` right now — and retrying it would suppress a working alarm. The already-approved 2026-06-08
  design also explicitly bans retrying the probe.
- **No external dead-man's-switch exists** (grep-confirmed: zero `hc-ping`/healthchecks references in code). This
  is the one layer Issue 04 correctly identified as missing.
- **Dependabot security updates are OFF** (API `automated-security-fixes` → `{"enabled":false}`; vuln-alerts 404).
- **Repo is PUBLIC** → Actions minutes free (no budget constraint), but scheduled workflows auto-disable after 60
  days of no activity and queued scheduled runs are dropped/delayed under load. Measured: daily-rebuild (`0 6`)
  ran 08:31Z; freshness-probe (`0 14`) ran 15:15Z — 1–2.5h delays. Neither class is detectable in-workflow.

**Net genuine scope:** (1) unblind the incident logger, (2) add the external dead-man's-switch, (3) enable
Dependabot. Plus, surfaced separately, a real stale source the probe is flagging (a data task, not automation).

---

## 1. Item 1 — Unblind the incident logger (HIGHEST priority; it is down now)

### Root cause (primary evidence)
`log-cron-incident.mjs:recordFailure()` runs `gitCommitAndPush` (`:95`) **before** the issue/Project feed
(`:102-113`). The push to `main` is rejected (GH013), `gitCommitAndPush` re-throws on its second attempt
(`:202`), and the exception propagates out of `recordFailure` — so the sticky-issue comment, the discrete
`[cron-failure:slug]` issue, **and** the Project-#3 card never get created. The logger is fully blind on
failure, not merely stale in markdown.

### Fix — move incident state OFF the protected branch (chosen approach)
- **`log-cron-incident.mjs`**
  - Delete both `gitCommitAndPush` calls (in `recordFailure` and `maybeResolve`) and the helper itself.
  - `recordFailure`: keep `classify()`; open/refresh the discrete GitHub Issue + sticky comment + Project-#3
    card (existing code, now reachable); additionally open a `public.checks` row `cron_incident_<slug>` (idempotent
    — reuse if already open) carrying class + run URL.
  - `maybeResolve` (success + `event==='schedule'`): re-point from "flip the markdown OPEN row" to "close the open
    incident issue (existing `closeIncidentIssue`) **and** close the `cron_incident_<slug>` check." Drop the
    `ledger-flap.mjs` markdown dependency from the resolve path.
  - The `insertRow` / `flipMostRecentOpenRow` ledger-mutation paths become dead code → remove them and their now-orphaned
    tests; keep the classifier + its tests untouched.
- **`docs/cron-rebuild-failures.md`** becomes human-curated history. Add a header note: "Auto-capture moved to
  GitHub Issues (label `cron-failure`, Project #3) + `public.checks` (`cron_incident_*`) on 2026-06-28; rows below
  this date are historical. Add manual triage rows as before."
- **`log-cron-incident.yml`**
  - Drop `permissions: contents: write` (no commit to main anymore). Keep `issues: write`, `actions: read`,
    `repository-projects: write`.
  - Add `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` to the env of both jobs for the checks write (Gate 3: already
    repo secrets, used by daily-rebuild/freshness-probe; same public-repo masking applies).
  - Keep a plain `actions/checkout` (still needed to run the node script) but with no `token` /
    `persist-credentials` — nothing pushes anymore.
- **Tests:** update `log-cron-incident` unit tests to assert no git push is attempted and that the issue/check
  open+close paths fire; classifier tests unchanged.

### Note recorded for review (operator chose to keep public.checks)
The GitHub Issue + Project-#3 feed is *already* a complete off-main incident store (auto-open / auto-close /
de-dup by title tag). The `public.checks` write duplicates that state and adds Supabase creds to the workflow.
It is included because it threads cron incidents into the session-loop `checks` ledger (RULE 2). If that proves
noisy, drop the checks write and let Issues/Project be the sole home — no other part of this item depends on it.

### Verify
Force a failure (dispatch a known-failing workflow or a throwaway failing job): a `[cron-failure:slug]` issue
opens + a Project-#3 card + a `cron_incident_<slug>` check opens; **no** push to main is attempted (check the run
log). Then a successful scheduled run of the same workflow closes the issue + the check. Evidence in the run logs
+ `public.checks`, not "code looks right" (memory `feedback_checks-prod-evidence-not-dev-attestation`).

---

## 2. Item 2 — External dead-man's-switch (Healthchecks.io)

### Why (the layer in-workflow logic can never cover)
In-workflow `if: failure()` can detect "I ran and failed." It cannot detect "I was supposed to run and didn't"
(dropped scheduled run; 60-day public-repo auto-disable). Only an external watcher expecting a periodic ping
catches that. Confirmed live (RULE 0.4): Healthchecks.io identifies a check by **project Ping Key + slug**, and
slug URLs **auto-provision** with `?create=1`, so the whole fleet uses ONE secret, not one-per-check. "Cron"
schedule mode alerts when a job doesn't run *at the right time*, not merely at the right interval.

### Build
- **One secret** `HEALTHCHECKS_PING_KEY` (the project Ping Key). `gh secret set HEALTHCHECKS_PING_KEY` is step 1;
  wiring it into the covered workflows is step 2 — same PR (Gate 3).
- **Per covered workflow,** a final step:
  `- if: success()` → `run: curl -fsS -m 10 --retry 3 "https://hc-ping.com/${{ secrets.HEALTHCHECKS_PING_KEY }}/<slug>"`
  Slug = a stable kebab id per workflow (e.g. `daily-rebuild`, `freshness-probe-daily`). First run with
  `?create=1` auto-creates the check; afterward configure period/grace/cron in the HC UI.
- **Coverage = the critical daily set (~12, under the ~20 free-tier cap):** `daily-rebuild`,
  `freshness-probe-daily`, `active-listings-daily`, `listing-lifecycle-daily`, `city-pulse-daily`,
  `live-search-daily`, `data-targets-daily`, `data-readiness-cron`, `project-feed-change-detection-daily`,
  `deliverables-retention-sweep-daily`, `daily-email-digest`, `email-scheduler`. Final list confirmed during
  implementation against which dailies actually carry load-bearing data.
- **Deliberately NOT watched here:** weekly/monthly pipelines. A missed monthly run shows up as stale data in
  `freshness-probe-daily`, which IS dead-man-watched — so the probe is the second layer for the slow fleet. Two
  layers, no per-monthly check burned against the 20 cap.
- **HC check config:** "Cron" mode with the workflow's cron expression + generous grace (~3h, since GitHub delays
  our scheduled runs 1–2.5h). Alert channel = operator email (HC free tier).

### Verify
Disable (or let lapse) one covered workflow's schedule → HC raises an alert within period+grace. A normal
successful run turns the check green. Ping URL never appears in logs (it's a masked secret).

---

## 3. Item 3 — Enable Dependabot security updates

### State (verified)
`automated-security-fixes` → `{"enabled":false}`; vulnerability-alerts endpoint 404s. Both off.

### Build
- **Toggles (account state):** `gh api -X PUT repos/ethanrickyjrjr-wq/SWFL-Data-Gulf/vulnerability-alerts` then
  `gh api -X PUT repos/ethanrickyjrjr-wq/SWFL-Data-Gulf/automated-security-fixes`. (Security fixes require vuln
  alerts on first.)
- **`.github/dependabot.yml` (in-repo, durable policy):** lean, weekly, grouped version-updates for the
  `github-actions` ecosystem (catches action-version drift — the `checkout@v6`-nonexistent class that has bitten
  redfin-monthly + dbpr-sirs), plus `pip` (ingest) and the npm/bun ecosystem. Grouped PRs, low open-PR cap to
  avoid noise.

### Verify
`gh api .../automated-security-fixes` → `{"enabled":true}`; Dependabot config visible in repo Insights; first
grouped version-update PR (or "up to date") appears.

---

## 4. Item 4 — Minute-0 cron offset sweep — SPLIT OUT

Not in this spec (operator decision). ~75 workflow crons sit on minute 0 (the globally most-contended minute),
and our scheduled runs are measurably delayed 1–2.5h as a result. Fix = a deterministic script that rewrites only
the *minute* field (0 → a filename-hashed spread in 3–57), preserving hour/day/month/dow so all sequencing is
untouched; skips commented crons; prints a diff for review before applying. Watcher lists key off workflow
*names*, not crons, so this is safe. Tracked in its own spec: `2026-06-28-cron-minute-offset-sweep-design.md`
(to be written). Low severity, high churn — ship after Items 1–3 land.

---

## 5. Separate, surfaced not built — a source is stale NOW

`freshness-probe-daily` has been red 06-23 → 06-27 because at least one SLA-opted-in source breached
`error_after_days`. That alarm reached no one (Item 1 was down). Independent of this build, identify the breaching
source (run `python -m ingest.scripts.check_freshness` locally with `.dlt/secrets.toml` creds, read the SLA
section) and refresh it. This is data work, logged here so it is not lost.

---

## 6. Hard rules / guardrails
- **Never re-introduce a push-to-main from an automated cron-listener.** Incident state lives in Issues / Project /
  `public.checks` — surfaces that need no ruleset bypass. (This is the whole point of Item 1.)
- **Do not wrap `freshness-probe-daily` in retry.** Its red is a working SLA alarm; retry masks it. (Approved
  2026-06-08 design + this audit.)
- **Two layers stay two layers.** In-workflow heal (`heal-cron-failure.yml`, already built) + external dead-man's
  (Item 2). Neither replaces the other.
- **Secrets: set in gh, then wire env — same PR** (Gate 3). Never inline a ping key or Supabase key.
- **Cap auto-recovery** — unchanged; `heal-cron-failure` already caps at `run_attempt===1`. We add no new retry.
- **No new mandatory pre-materialization gate** (RULE 3 C2). This extends existing logger/issue/checks seams only.

## 7. Definition of done
- Forced failure → discrete issue + Project card + `cron_incident_<slug>` check open; **no** main push attempted.
- Next scheduled success → issue + check auto-close.
- `log-cron-incident.yml` runs green on a real failure event (no GH013).
- One covered workflow's missed/disabled schedule → Healthchecks.io alert within grace; normal run → green check.
- `automated-security-fixes` enabled; `.github/dependabot.yml` present.
- `docs/cron-rebuild-failures.md` carries the "auto-capture moved" header note.
- SESSION_LOG entry + `_AUDIT_AND_ROADMAP/build-queue.md` synced + check closed on live proof.

## 8. Rollout order
1. **Item 1** first (the alerting spine is blind right now). Land it, force a failure, prove capture works.
2. **Item 3** (cheap, independent) alongside.
3. **Item 2** once Item 1 proves the incident feed fires (so a dead-man alert lands somewhere visible).
4. **Item 4** separate spec, after.
