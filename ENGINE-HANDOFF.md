# Engine Turn-On Handoff — 2026-06-20

**State: GREEN. The engine is ON, Sonnet 4.6 synthesis restored, and 5 parked workflows re-enabled.** This documents the turn-on after the 2026-06-18 credit freeze and exactly what's running vs. still parked.

---

## TL;DR — are we good?

Yes. Live + running.

| Check | Result | Evidence |
| --- | --- | --- |
| `main` tip green | ✅ | CI run `27880203039` = success on `ee486ea2` |
| Engine switch | ✅ ON | repo var `ENGINE_ENABLED=true`; 68 workflows guarded |
| Synthesis model | ✅ Sonnet 4.6 / 16k restored | `anthropic.mts:7` + `synthesis-agent.mts:110`; test 3/3 |
| 5 safe workflows | ✅ re-enabled | Live Search, Corridor pulse, City pulse, DBPR Press Releases, DBPR Public Notices |
| Daily rebuild (DAG fix) | ✅ | run `27879193913` |
| news-swfl date→text | ✅ | run `27879765541`, 28 rows |
| In-flight runs | 0 | nothing queued/running |

Engine is **left ON** (operator is the primary user — no reason to gate). Flip anytime with `node scripts/engine.mjs off`.

The only items in `git status` outside this work are the operator's parallel files (`GO-LIVE/email-scheduler-unit-f.md`, `runs.json`) — left untouched.

---

## What shipped this session

1. **CI red fixed** (`46136210`) — two `as any` test fixtures typed as `SignificantChange`.
2. **Daily-rebuild deterministic HOLD fixed** (`7271b6c9`) — reconciled `master.mts` `input_brains[]` with `sources[]` (7 missing edges) + built/committed the missing `brains/fgcu-reri.md`. A brain in `sources[]` but not `input_brains[]` is fetched-but-never-built (the DAG resolver walks `input_brains` only).
3. **news-swfl `published_date` date→text** (`79f924c9`) — dlt ≥1.26 won't cast string→date into a pre-created `date` column; switched column + dlt schema + SQL to `text`.
4. **Single ENGINE_ENABLED on/off switch** (`ee486ea2`) — job guard on 68 scheduled workflows + `scripts/engine.mjs` + migrator.
5. **Turn-on (this commit)** — restored Sonnet 4.6 synthesis, re-enabled the 5 safe workflows, left the engine ON.

---

## The switch — how to operate it

One repo variable `ENGINE_ENABLED` (`true`/`false`; unset → ON) gates all 68 scheduled workflows via a job-level guard:

```yaml
if: ${{ vars.ENGINE_ENABLED != 'false' || github.event_name == 'workflow_dispatch' }}
```

→ when `false`, scheduled runs **skip cleanly** (no compute/credit); a manual `workflow_dispatch` **always** runs.

```bash
node scripts/engine.mjs status   # show var + the 68 guarded workflows
node scripts/engine.mjs off      # park: scheduled runs skip
node scripts/engine.mjs on       # resume
```

- Add the guard to any new scheduled workflow by re-running `scripts/engine-guard-migrate.mjs`.
- **Not gated** (no cron, must keep reacting): `ci`, `heal-cron-failure`, `log-cron-incident`, `grade-predictions`, `deptry`.

---

## Executed this turn

**Synthesis restored to Sonnet 4.6 / 16k** (reverting the freeze `e9f148f9`):

| Setting | File:line | Now |
| --- | --- | --- |
| `SYNTHESIS_MODEL` | `refinery/agents/anthropic.mts:7` | `claude-sonnet-4-6` |
| synthesis `max_tokens` | `refinery/agents/synthesis-agent.mts:110` | `16000` |

(`TRIAGE_MODEL` stays Haiku — always was.) `bun test refinery/agents/synthesis-agent.test.mts` → 3/3.

**5 safe workflows re-enabled** (`gh workflow enable`): Live Search Daily, Corridor pulse weekly, City pulse daily, DBPR Press Releases weekly, DBPR Public Notices weekly. They now run on schedule (engine ON).

---

## Still parked — your call (4 workflows)

These stay `gh`-disabled until proven from a GHA runner IP. Dispatch a manual run / dry-run first, confirm the scrape works from the runner (not just home IP), then `gh workflow enable <id>`:

```bash
# 283985192  Collier County permits monthly   — verify scrape works from runner IP
# 285460384  FGCU RERI monthly                — verify scrape works from runner IP
# 286714663  DBPR SIRS Submissions monthly    — dispatch dry-run first
# 291833372  ingest-crexi-listings            — may be a dead broker-scrape; confirm before enabling
```

---

## Known non-issues (don't chase)

- Two `failure` CI runs in the recent list (`86b9dd74`, `620f7159`) are superseded intermediate commits behind the green tip `ee486ea2`. Two older `news-swfl` failures are pre-date-fix, superseded by the 18:17 success.

## Pre-existing open checks (unrelated to the turn-on)

8 open in the `checks` ledger (`node scripts/check.mjs list`) — all live-verify-after-deploy items from prior work. None block the engine.

---

*Verified live 2026-06-20 against GitHub Actions + repo vars. Durable cross-session breadcrumb is in `SESSION_LOG.md` (top entry).*
