# HANDOFF — checks ledger burndown + the 7 confirmed-red crons (08/06/2026, Opus 5)

## What this session established (do not re-derive — it was measured live)

The ledger is **an intake with a manual-only drain**, not a bug count.

- `public.checks`: **1,514 rows ever — 879 open, 546 done, 89 dropped** at session start.
- Open class split: **224 defect · 320 task · 210 untriaged · 125 verify.**
  **530 of 879 (task+untriaged) are a to-do list and an auto-filed incident feed sharing one
  counter with the defect list.** That is why the headline number reads like catastrophe.
- **774 of 879 open rows had never been updated since the moment they were written.**
- Intake vs drain by last-touch date: July opened 1,018 / closed 447. August through the 6th
  opened 266 / closed 75. Daily that week: +24, +36, +50, +53, +27. Never a negative day.

### The root cause, reproduced live

`node scripts/check-sweep.mjs --dry-run` gives **`0 OPEN check(s) carry a live signal`.** Zero of
879. Only **66 of 1,514 rows EVER** carried one; **271 opened in the last 7 days, none with a
signal.** Machine closes: **14 of ~635 ever** (`resolved_by='check-sweep'`). Everything else is a
human typing one key at a time — while `reverify-signals-daily.yml` ran **two automatic OPENERS
every day** (reopen-on-regression + `ceilings-to-checks --apply`) and the closer was invoked by no
workflow, no hook, no package script.

## Shipped

- `e1be8dc8` — wired `check-sweep.mjs` into `reverify-signals-daily.yml` beside the two openers
  (`continue-on-error`, last, so it can never mask a signal regression). `scripts/new-build.mjs`
  now takes `--signal '<json>'` and passes it to `check.mjs open` — it is the largest producer of
  verify-class checks (251 `*_live_verify` rows ever, 0 with a signal) and had no way to attach one.
  Validates the JSON **before** writing the spec stub; prints the exact `check.mjs update` command
  when omitted. **Deliberately not defaulted** — a loose signal closes a broken thing and never
  self-heals (`reverify` only reopens on FAIL).
- `ingest/cadence_registry.yaml` — **a test was RED at HEAD and nobody had noticed.**
  `neighborhood-amenities-daily.yml` was registered under BOTH `pipelines:` and `jobs:`, failing
  `test_jobs_workflows_exist_and_are_not_double_registered`. Removed the `jobs:` duplicate.
  **15 passed / 1 failed became 16 passed in 0.15s**; Gate 10 still reports `"unregistered": []`.

## Ledger movement: 879 to 871. 8 closed, 0 opened. Every close names a command and its output.

Closed: `nightly_chain_dark_anthropic_credits`, `anthropic_credits_nightly_red`,
`cadence_spine_pin_75_vs_76`, `cron_incident_ingest_bls_ppi`, `cron_incident_daily_rebuild`,
`cron_incident_neighborhood_stats_annual`, `cron_incident_ingest_dbpr_re_licensees`,
`cron_incident_data_readiness_cron`.

**No mass-close.** `data-readiness-cron` was denied as a GitHub-outage artifact **proven by date**:
its only failure is 08/06T16:23Z, inside the Actions major outage that opened **08/06T15:22:49Z**;
08/05T16:18 and 08/04T16:28 both succeeded. **Date every cron failure against that window before
calling it a defect.**

## THE 7 CONFIRMED-RED CRONS — diagnosed, NOT repaired. This is the next session's work.

1. **`nightly-chain` — HIGHEST VALUE. 3 consecutive failures; 08/06T07:10 and 08/06T04:23 are BOTH
   PRE-OUTAGE, so this is not infra.** Failing job isolated: **`bake / narratives / bake`**. This is
   the product's build path. Start here.

2. **`ingest-crexi-listings` — CAUSE CORRECTED 08/06. Do not trust the older diagnosis.**
   The first read (no self-hosted runner registered) is **WRONG as of today** — the operator brought
   a runner up, the job ran 08/06T19:44, and the pipeline actually executed. The real blocker is
   **Cloudflare**: `Blocked by anti-bot protection: Cloudflare JS challenge` on
   `https://www.crexi.com/lease` for every target city, ending in
   `ERROR: 0 raw listings from all targets`. Line 30's `runs-on: [self-hosted, swfl-local]` is now
   correct, not a bug. **Another session was actively editing that workflow file when this was
   written and its fix had not reached `origin/main` — reconcile before touching it.**

3. `freshness-probe-daily` — red 08/06, 08/05, 08/04; two pre-outage. Real, undiagnosed.

4. **`reverify-signals-daily` — DIAGNOSED, and it is not a regression.** Ran
   `node scripts/reverify-signals.mjs --dry-run` locally (takes over 2 minutes):
   **`0/66 regressed, 6/66 signal-broken (unevaluated)`.** Nothing has regressed. The red comes from
   6 signals that never evaluate at all, and the workflow's final step exits 1 on any non-success
   including that class. **Fix the 6 broken signals, or split the exit code so an unevaluated signal
   does not read as a regression** — the workflow's own header already says broken signals "never
   reopen anything," so the exit code contradicts the documented intent.

5. `ingest-fl-dbpr-licenses` (08/05, pre-outage) · 6. `redfin-collier-monthly` (07/18) ·
   7. `tier-divergence-tier2-monthly` (07/22). All pre-outage, all undiagnosed.

**`cron_incident_ci` is left OPEN and unresolved on purpose** — nothing named `ci.yml` answers
`gh run list`, so the key maps to no runnable surface. Named, not silently skipped.

## The standing instruction this session was given

Operator decree, verbatim: *"we don't need checks on everything. everything doesn't work, so what
good is a check. you are the only one who can confirm or deny the important ones."* That is
authorization to **triage on your own judgment** — which `checks-burndown` otherwise routes to him.
**The no-invention constraint does NOT lift: a confirm needs a probe, a deny needs a reason.**
Writing row #880 is not work. Confirming or denying #1 through #871 is.

## What is still untouched

The **221-row defect class**, beyond the cron family. Median age 19 days, oldest 64. And **no signals
were backfilled onto the 125 open verify-class rows** — that is the work that actually bends the
curve, and it is per-check human judgment (`.claude/skills/check-signal/SKILL.md`), never a sweep.
