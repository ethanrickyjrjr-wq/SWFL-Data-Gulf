# Direction validation — check the AUTHORED call against a fitted trend before logging

**Status:** built + wired 08/11/2026. Check: `direction_validation_live_verify`.
**Operator decision, verbatim (08/11/2026):** *"Authored the direction validated against a fitted trend."*

## Why

The live prediction path logs `claim.then_direction` — the brain's own authored call —
straight to `predictions` with nothing checking it (`predictions-log.mts:100`). 40 gradeable
rows are logged, `outcomes` is 0, and the first window closes **08/30/2026**. Without this,
what lands then is a scored record of an unchecked judgment.

This is NOT the same defect as the backtest path, and conflating the two is what this whole
thread was about. The backtest computes `sign(as_of − prior)` (`decision-fn.mts:80`) and
`grade_basis` governs it. `grade_basis` never touches the live prediction.

## What it does

The brain still AUTHORS the call. We are not replacing judgment with arithmetic. Before the
row is inserted, the slug's own history is fitted with `fitLine()` and the authored direction
is compared against the fitted one.

Four verdicts, persisted to `predictions.metadata.direction_validation`:

- `agree` — established trend, direction matches.
- `disagree` — established trend pointing the other way. **Still logged, still gradeable**
  (operator call). The disagreement is recorded so "does authored judgment beat the trend"
  becomes a measurable number rather than an opinion.
- `no_direction` — a real fit whose 95% CI straddles zero. **Downgrades the row to
  ungradeable.** Sourced: `_RESEARCH/data-and-ingest/2026-08-11-direction-call-forecast-evaluation-standard.md`
  §4.1 — a forecast "must be allowed to return NO DIRECTION" — and §6, which already accepted
  that the gradeable count falls and called that the correct outcome.
- `unvalidated` — could not fit at all (under 12 points, degenerate, or a failed read).
  Row unchanged. **Never `agree`.**

## Architecture

`refinery/lib/direction-validation.mts` is pure — no I/O, no clock. `logPrediction` (already
async, already holds the client) fetches the series and calls it. `deriveGradeFields` stays
pure and sync, untouched.

Polarity is NOT re-implemented: `computeDirection` already owns the
`lower_is_bullish` inversion and is tested, so the module calls it in `sign` basis with
epsilon 0 — the confidence interval already does the deadband's job.

Storage is `metadata` (JSONB). No migration. Rows logged before this ship carry no key and
read as `unvalidated` via `readVerdict` — never backfilled, because asserting a validation
that never ran is the thing this design exists to stop.

## Failure modes and their guards

Each has a test named after it in `refinery/lib/direction-validation.test.mts` (17 tests).

1. **Look-ahead.** Fitting on observations dated after the call grades it against its own
   answer. Guard: `pointsAsOf` truncates at the as-of instant, inclusive at the boundary.
   Two tests, plus a NaN/unparseable-row test so one bad row cannot poison a fit.
2. **Duplicate observations fake significance.** `metric-observations-log.mts:11-13` — master's
   re-surfaced copy of a leaf slug coexists with the leaf's own row at the SAME `observed_at`.
   Fitting both doubles n, shrinks the CI, and can flip `established` false→true. Guard:
   dedupe by instant. **This one was caught red — the test failed 3 !== 2 before the fix.**
3. **Polarity inversion.** A falling unemployment rate is bullish. Guard: reuse
   `computeDirection`; tests assert the same falling slope yields opposite verdicts under the
   two polarities.
4. **`established=false` conflated with `null`.** `fit-line.ts:120-126` — "'established:
   false' reads as 'we checked, there is no trend' when the truth is 'we could not fit this at
   all'." Guard: distinct verdicts, distinct tests.
5. **A failed read reported as a passed check.** Guard: read failure → `observations = null`
   → `unvalidated`; asserted `notEqual "agree"`.
6. **Silent promotion.** Guard: `applyDirectionValidation` never moves a row from
   `ungradeable` to `gradeable`; it can only remove a call from scoring.
7. **The 40 pre-existing rows reading as validated.** Guard: absent key → `unvalidated`.
8. **PostgREST truncation.** A long series ordered ascending returns the OLDEST page. Guard:
   descending + limit; `fitLine` sorts its own input.

## Consequence to expect

The gradeable count will FALL. That is the designed outcome, not a regression — §6 of the
research says so outright, and it will look like a regression on any dashboard counting calls.

## Not in scope

- The per-slug path (`prediction_kind='slug'`, §6-A of `predictions-log.mts`) derives its
  direction mechanically via `computeDirection(value, 0, cfg)` rather than authoring it, so
  the operator's decision does not directly govern it. Deliberately untouched.
- The backtest-path fix (promote `fitLine()` into `decision-fn.mts`) — separate work, same
  family. Check: `fit_basis_backtest_decision_fn`.
- Pesaran–Timmermann significance testing — check remains open, unbuilt.
