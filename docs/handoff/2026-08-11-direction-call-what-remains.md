# Handoff — 08/11/2026 — direction calls: live half SHIPPED, backtest half still open

Written after `51975c39` (validation built + wired) and the corrections that followed.
Supersedes the numbers in `2026-08-11-actionlint-gate-and-persistence-finding.md` ITEM 2 —
that file now carries a correction block at its top; read that before its ITEM 2.

## What is DONE and live

**The live path validates the authored call.** Operator decision, verbatim: *"Authored the
direction validated against a fitted trend."* The brain still authors `then_direction`; before
the row is inserted, the slug's own history (truncated at the refine instant) is fitted and the
authored direction is checked against it.

- `refinery/lib/direction-validation.mts` — pure. Four verdicts into
  `predictions.metadata.direction_validation`, no migration: `agree` · `disagree` (still
  gradeable, disagreement recorded) · `no_direction` (CI straddles zero → **downgrades to
  ungradeable**) · `unvalidated` (no fit — row untouched, never `agree`).
- Wired in `refinery/lib/predictions-log.mts` `logPrediction`. `deriveGradeFields` untouched.
- 21 tests; look-ahead guard **mutation-tested** (2 fail with the guard removed, all pass
  restored). Spec: `docs/superpowers/specs/2026-08-11-direction-validation-design.md`.

**Expect the gradeable count to FALL.** That is designed, not a regression — the crawled
standard §6 says so outright. It will look like a regression on any dashboard counting calls.

## THE CORRECTED NUMBERS — do not quote the old ones

Measured live 08/11/2026, `bun refinery/tools/flywheel-backtest.mts --dry-run`:

    system accuracy      = 42.0% (N=138)
    persistence accuracy = 48.6% (N=138)
    LIFT (system − naive)= -6.5 pp   ← NOT +0.0
    BEATS NAIVE? NO

The call **loses** to the naive baseline. The old "144 of 144, zero disagreements" test was a
tautology — it compared the call against `sign(current − prior)`, the formula that produced it,
not against the instrument's null `predict_t = observed_{t-1}` (`skill-baseline.mts:67-78`).

## What remains, in priority order

**1. `fred_laus_alfred_storage_delete_must_not_run` — the only irreversible item.**
Its Storage prefix is flagged for MANUAL delete on a false "zero-consumer" basis.
`flywheel-backtest.mts:258` reads it; the data is intact (1538 / 1562 vintages). It is the only
point-in-time-honest series in the repo. Operator decisions owed: confirm the delete is
cancelled, and decide whether to restore the monthly cron — vintages stop accruing without it.
Note a second-order trap: the coverage ratchet baseline was shrunk in `70bce3e0` to match the
retirement, and the ratchet only shrinks. If this source is un-retired, its registry entry
returns without `raw_landing_class` and Gate 11 will block until that block is filled.

**2. `fit_basis_backtest_decision_fn` — the backtest half of the same fix.**
Promote `fitLine()` into `refinery/lib/backtest/decision-fn.mts:80`, replacing
`computeDirection(as_of_value, prior_value, cfg)`. This fixes the 144-row corpus. It does
**not** touch the live path — that is the mistake this whole thread was about. Reuse
`direction-validation.mts`; the verdict logic is already built and tested.

**3. Pesaran–Timmermann — still unbuilt.** No significance test on direction exists anywhere in
the repo. Standard + citations in
`_RESEARCH/data-and-ingest/2026-08-11-direction-call-forecast-evaluation-standard.md` §3.
Report DirAcc *and* the p-value, never the hit rate alone.

**4. `backtestable_two_disjoint_definitions`.** The sweep's 11 "vintage-clean" slugs
(SBA/TDT/LeePA) and the backtest's 2 (LAUS) are **disjoint sets** — the intersection is empty.
`backtest_clean: 11` is not a capacity number today. Reconcile to one definition.

**5. `grade_coverage_artifact_served_stale`.** The committed artifact was 22 days stale (206 vs
208 gradeable) and ops reads it cross-repo. Refreshed. **Beware the false pass:** a bare
`grade-config-sweep.mts` run REWRITES the artifact, so a later `--check` trivially matches —
`--check` green is not evidence the committed file was in sync.

**6. `direction_validation_live_verify`.** Closes after the first real window (**08/30/2026**).
Verify a freshly logged row carries `metadata.direction_validation`, and that a `no_direction`
verdict actually lands `ungradeable`.

## Deliberately NOT done

- **The backtest corpus was not overwritten.** `backtest_grades` still holds the 06/08/2026
  run. It is stale relative to the dry-run above, but overwriting a stored derived-signal
  corpus is an operator call, not a side effect of verification.
- **The per-slug path (`prediction_kind='slug'`, §6-A of `predictions-log.mts`) is untouched.**
  It derives direction mechanically via `computeDirection(value, 0, cfg)` rather than authoring
  it, so the operator's decision does not directly govern it. Worth a decision: does a
  mechanical sign-basis call also need a fitted-trend check, or is it fine as-is?
- **Lee permits needed nothing.** All four numeric permit slugs already resolve `gradeable=true`
  with polarity and a 180-day window; only the categorical one does not, correctly. The backtest's
  "no grade block" exclusion reason was stale and has been corrected in place. The real blocker
  there is vintage depth — `metric_observations` stamps `observed_at` = the brain's refine
  vintage, so a point-in-time series only accrues forward from first capture.

## The clock nobody can move

`data_lake.view_vintages`: 2723 rows, oldest 06/26/2026, newest 07/26/2026, August zero and
**not late** (monthly, due ~08/26). The backtest wants ~9 captures before the ZHVI/ZORI flip.
Two banked → roughly **Feb/Mar 2027**. Point-in-time history cannot be backfilled. This, not
config coverage, is why N is small — coverage is drained (330 slugs, **208 gradeable**,
moat-fuel down to 11).
