# Checks ledger classes + triage + verify blitz

**Date:** 2026-07-16
**Check:** `checks_class_triage_live_verify`

## Problem

The checks ledger hit 388 open rows and the count reads as "388 problems." It isn't: the ledger
mixes four different things under one number — real defects, finished-but-unverified builds
(`*_live_verify`), banked ideas, and operator to-dos. Worse, the session-start kickoff fetched with
`limit=200` and reported `rows.length`, so the headline said "200 open" forever once the ledger
passed 200 — the one number the operator sees every session was capped and wrong. Result: the
operator reads the ledger as "we suck at everything" when ~a quarter of it is COMPLETED work
awaiting one click, and the machine-speed check-opening vs. human-speed check-closing asymmetry
guarantees the raw count only grows.

## Goal

The session-start headline answers the real question — "how many live problems do we have?" —
instead of one undifferentiated count. Verifies become batchable into sittings instead of dribbling
one-at-a-time forever.

## What we're building

1. **`class` column on `public.checks`** (migration `migrations/20260716_checks_class_column.sql`,
   applied 07/16): `defect` (live problem in product/data/pipeline) · `verify` (built + green,
   awaiting operator live-verify) · `idea` (banked candidate, no commitment) · `task` (real work
   that isn't a defect). NULL = untriaged. DB constraint `checks_class_valid` enforces the enum.
2. **CLI support** (`scripts/check.mjs`): `--class` on open/reopen/update; `list` prints a class
   breakdown headline + takes `--class <v|untriaged>` filter; `*_live_verify` keys auto-default to
   `verify` (covers `new-build.mjs` with zero changes there). Pure helpers (`inferClass`,
   `classBreakdown`, `formatClassBreakdown`) unit-tested in `scripts/check.test.mjs`.
3. **Kickoff fix** (`scripts/session-kickoff.mjs`): exact count via `Prefer: count=exact`
   (kills the limit=200 lie), class-only counts fetch for the breakdown headline, defect-first
   ordering so the top lines are the bleeding.
4. **One-time triage (done 07/16):** all 388 open rows classified — 102 defect · 84 verify (after
   1 drop) · 19 idea · 182 task. Mechanical pass (live_verify → verify, marketing → task,
   new-source candidates → idea) + manual review of the remaining 300 from key+label. Bulk PATCH
   guarded `class=is.null` so concurrent sessions are never overwritten; `updated_at` untouched
   (verified no auto-bump trigger) so age signals survive.
5. **Verify blitz doc** (`docs/handoff/2026-07-16-verify-blitz.md`): all verify-class checks
   grouped into sittings — click-now-on-prod, after-next-push, operator-gated, awaiting-a-run,
   blocked-by-defect — each with the one thing to confirm and the close command.

## Explicitly out of scope

- No forced closes: 0 checks closed on this pass (all 7 cron_incident_* crons verified still red
  at latest run via `gh run list`; SteadyAPI fixes committed but not deployed — their post-deploy
  check carries them). 1 honest drop (`sold_resolution_latlon_crosswalk_live_verify`, never built).
- Airtable mirror does not carry `class` yet — add to the sync column map only if the board needs it.
