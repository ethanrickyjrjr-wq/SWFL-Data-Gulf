# Auto-close open checks whose stored signal passes live

**Date:** 2026-07-22

## Problem

Measured live 07/22/2026 against `public.checks`: **722 open, 8 carrying a `signal`.**
439 closed, 53 with a signal.

The ledger has an automatic **opener** and no automatic **closer**:

- `scripts/reverify-signals.mjs` walks **closed** signal-bearing checks, re-runs the stored
  signal, and **reopens** anything that regressed. Built, tested, on a schedule.
- Nothing walks **open** checks. `runSignal` fires only inside `scripts/check.mjs close`,
  one key at a time, when a human types the command.

So the count moves in exactly one direction by construction. This is the same root cause named
in the burn-down handoff and in the ceilings postmortem: **we build the recording half of a
mechanism and never the acting half.**

## Goal

The mirror of `reverify-signals.mjs`. One command, no LLM tokens:

```
node scripts/check-sweep.mjs [--dry-run] [--class verify] [--project ingest]
```

Walk every **open** check that carries a `signal`, run it live, and **close** the ones that pass
— with a real `proof.kind='signal'` record built from what the run actually observed.

This is the "trip that closes them when it is used" in the operator's words. For a `db_row_exists`
or `db_fresh` signal it is literal: the check closes itself the moment the data lands.

## What we're building

`scripts/check-sweep.mjs`, deliberately shaped as the inverse of `reverify-signals.mjs`:

- scans — reverify: `state=done` + signal · sweep: `state=open` + signal
- acts when — reverify: signal FAILS · sweep: signal PASSES
- effect — reverify: reopen + append note · sweep: close + write signal proof
- guard — reverify: `isRealRegression` (`observed != null`) · sweep: `isCloseable` (`observed != null`)

Reuses `runSignal` (`scripts/lib/check-signals.mjs`) and the proof shape `check.mjs`
already builds, so the DB trigger `checks_require_proof` validates sweeper writes on the
same path as a hand close. `resolved_by='check-sweep'` so machine closes are queryable
apart from human ones forever.

## Failure modes, and the guard for each

**FM1 — Loose signal closes a broken thing.** A `contains` phrase that also appears in a
fallback or error body, or an inverted `db_row_exists` where passing means the bug is still
present, sails through the trigger and closes work that isn't done. **This is the real risk
and no mechanism catches it.** The trigger proves a signal *ran and passed*; it cannot prove
the signal *discriminates*. Guard: signal quality is a human judgment at attach time, never
at sweep time. Backfill signals incrementally and hand-verify each one is discriminating
before it goes in; never attach a batch and let the sweeper run on it unseen. The sweeper is
safe; the backfill is the dangerous half.

**FM2 — A signal that never evaluated is read as a pass.** Bad params, unreachable network,
unimplemented type (`workflow_success`). Guard: `isCloseable` requires `ok === true` **and**
`observed != null` — the same line `isRealRegression` already draws, inverted. A signal that
could not run closes nothing and is reported loud as BROKEN. Test-enforced.

**FM3 — Silent mass close.** A run that closes 40 rows and says nothing converts a visible
backlog into an invisible lie. Guard: every close prints its key + the observed detail;
`--dry-run` is the required posture for a first run against any newly-backfilled batch; the
summary line always states closed/broken/still-open counts.

**FM4 — Stale proof rejected mid-run.** The trigger refuses a proof whose `observed_at` is
older than 1 day. Guard: `nowIso` is stamped per check at the moment its signal runs, not
once at process start — a long sweep cannot age out its own early proofs.

**FM5 — Sweeper closes a check whose signal was never meant to gate it.** The 72 `ceiling_`
tasks close by pulling data or by an explicit operator decline, not by an HTTP probe. Guard:
`--class` / `--project` filters, and the sweeper only ever touches rows that already carry a
signal — it never invents one.

**FM6 — Regrowth.** `scripts/new-build.mjs` opens each `<slug>_live_verify` with no signal, so
every future build re-fills the bucket. Guard: NOT a `--signal` requirement at registration —
the surface does not exist yet at that point and the URL/phrase is unknowable. The discipline
belongs at ship time: when the thing goes live the discriminating phrase is known, attach it
via `check.mjs update --signal`, and the sweeper closes it on the next tick. `new-build.mjs`
prints that reminder.

## What this does NOT fix

Stated plainly so the closed count is never mistaken for finished work. The signal-able
fraction burns down. These do not:

- **Defects** — mostly not "is-X-live" shaped.
- **The 39 `idea` rows** — an idea is not an obligation; disposition is the operator's call.
- **The 72 `ceiling_` tasks** — closed by pulling the data or declining the pull.
- **Genuinely unfinished `verify` rows** — e.g. `buyer_leverage_report` ("NO page, route, or
  consumer"), `dom_backfill_listed_date` (12,545 of 33,671). A signal on these *correctly
  fails*. That is the gate working, not a shortfall.
