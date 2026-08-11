# Handoff — 08/11/2026 — two open items: the workflow-lint gate, and the direction calls that are a coin flip by construction

Written after the session that took the nightly chain from 20 days red to green
(`178eb6a8`). Both items below were found on the way and deliberately NOT fixed:
item 1 needs a tool installed and a fail-mode decision, item 2 needs an operator
design call. Neither is a "nice to have" — item 2 has a dated deadline.

Session evidence for everything here: `SESSION_LOG.md` entry dated 08/11/2026.

---

## ⚠️ CORRECTION — 08/11/2026, same day, by a later session. READ BEFORE ACTING ON ITEM 2.

ITEM 2 below is **wrong in three specific ways**. The direction of the recommended fix
(promote `fitLine()`) is unchanged and is now better justified, but do not quote its
numbers and do not act on its root-cause paragraph as written.

**1. The lift number is wrong, and it moved the WRONG WAY.**
ITEM 2 reports "system: 58 / 138 · persistence null: 58 / 138 · **lift: +0.0 points**."
Re-run live 08/11/2026 — `bun refinery/tools/flywheel-backtest.mts --dry-run`
(snapshot 2026-06, lookback 180d, grid-step 3mo):

    system accuracy      = 42.0% (N=138)
    persistence accuracy = 48.6% (N=138)
    LIFT (system − naive)= -6.5 pp
    BEATS NAIVE? NO — the call logic needs work before weighting does

System numerator matches (42.0% × 138 = 58). **The persistence numerator does not — the
tool measures 67, not 58.** The call does not tie the naive baseline. It **loses to it by
6.5 points.**

**2. "The predicted direction equals the persistence carry-forward on 144 of 144 rows,
zero disagreements" is a tautology, not a finding.**
That test compared `predicted_direction` against `sign(current − prior)` — which *is* the
formula that produced it (`decision-fn.mts:80` → `computeDirection(as_of_value,
prior_value, cfg)`). It was never compared against the instrument's actual null.
`skill-baseline.mts:67-78` defines the persistence null as **`predict_t = observed_{t-1}`**
— the previous *realized outcome* direction, not the last delta in the value series. Two
different estimators over one shared 138-row denominator, which is exactly why they score
58 vs 67. Nine rows of divergence by itself falsifies "zero disagreements." ITEM 2 says
outright "*So I computed the lift, using that file's documented in-set rule*" — the
baseline was re-implemented by hand instead of read off the tool. That is the whole defect.

**3. The root-cause paragraph applies to the BACKTEST path only — two producers, not one.**

- **Backtest / 144 rows** — `refinery/lib/backtest/decision-fn.mts:80` calls
  `computeDirection(as_of_value, prior_value, cfg)`. `grade_basis` governs this. Arithmetic.
- **Live / 40 gradeable rows** — `refinery/lib/predictions-log.mts:100-101` reads
  `claim.then_direction`, the brain's own **authored** claim. No delta, no arithmetic.
  **`grade_basis` never touches the live prediction** — it only governs `computeDirection`
  on the *outcome* at grading time.

Changing `GradeBasis` therefore fixes the backtest corpus and leaves the live path — the
one carrying the **08/30/2026 deadline** — completely untouched. A change shipped on ITEM 2
as written would have reported as done and not been live.

**RESOLVED for the live path (08/11/2026).** Operator decision, verbatim: *"Authored the
direction validated against a fitted trend."* Built, wired and pushed in `51975c39` —
`refinery/lib/direction-validation.mts` + `logPrediction`. Spec:
`docs/superpowers/specs/2026-08-11-direction-validation-design.md`.

**What is unchanged:** raw accuracy is still the wrong headline; lift over persistence is
still the right metric; `fitLine()` is still the right input to promote into the BACKTEST
path — and a call that *loses* to naive is a stronger argument for it than a call that ties.
That half is still open: check `fit_basis_backtest_decision_fn`.

**Also corrected same day —** `ingest/cadence_registry.yaml` retired `fred_laus_alfred` on a
"confirmed-zero-consumer" basis and flagged its Storage prefix for manual delete. That claim
is false: `refinery/tools/flywheel-backtest.mts:258` reads it, and the dry-run above proves
the data is intact (1538 / 1562 vintages). It is the only point-in-time-honest series in the
repo. **Do not execute that delete** — check `fred_laus_alfred_storage_delete_must_not_run`.

---

## ITEM 1 — Nothing validates a GitHub workflow file before it ships

### What happened

Commit `cb803b1c` (08/11/2026, cleanup pass) removed the `listings:` job from
`.github/workflows/nightly-chain.yml` and left its trailing `    secrets: inherit`
behind at line 122, orphaned under the retirement comment. GitHub Actions rejects
the whole file. The next two chain runs — `31464353518` and `31464377462` —
produced **zero jobs** and reported only "this run likely failed because of a
workflow file issue."

### Why nobody caught it

Two compounding reasons, and the second is the one worth fixing:

1. The chain was ALREADY red every night (item: bake exit code, fixed this
   session), so a red chain carried no information. A permanently-red pipeline is
   how a genuinely broken one hides.
2. **The verification instrument was more permissive than the real gate.** PyYAML
   parses that file without complaint — it silently attaches the orphaned
   `secrets:` key to the preceding `guard:` job and reports success. Any local
   "does the YAML parse" check is therefore GREEN while GitHub is RED. Confirmed
   live this session: a `yaml.safe_load` + dangling-`needs:` walk passed clean on
   the broken file.

Logged in `_ASSISTANT/STRIKES.md` under `green-locally-red-in-ci` — same mechanism
as the mock-leak strikes, new surface. That shape's existing guard
(`lib/testing/mock-restore-ratchet.test.ts`) only covers test-mock leaks.

### What to build

A new gate in `.claude/hooks/check-prepush-gate.mjs`. It currently holds **17
gates**; this is Gate 18. Per RULE 3 C2, extend that seam — do not add a
standalone hook.

Behaviour: on any push touching `.github/workflows/*.yml`, run `actionlint` over
the changed files only. Non-zero exit blocks the push and prints the offending
line.

### The two decisions this needs (why it isn't already built)

**Decision A — how to get actionlint.** Verified this session: `actionlint` is
**not installed** on this machine. Options are install the Go binary, call it via
`npx`/`bunx` per push (adds latency to every workflow-touching push), or run it in
Docker. This is a machine-setup call, not a code call.

**Decision B — fail-open or fail-closed.** Gates 2, 5 and 7 fail OPEN when their
tooling is unavailable, so a missing binary doesn't wedge every push. But a
fail-open lint that silently no-ops when actionlint is absent provides zero
protection and reads as protection — which is the exact class of problem this
whole handoff is about. Recommendation: fail CLOSED with a clear "install
actionlint" message, because a workflow-file push is rare enough that blocking it
costs almost nothing, and the failure it prevents took the pipeline down for a day.

### Regression fixture

The broken file is reproducible from git: `git show cb803b1c:.github/workflows/nightly-chain.yml`.
That exact content must fail the new gate. Use it as the red-first test — it is a
real defect that really shipped, not a synthetic case.

---

## ITEM 2 — Our direction calls match a naive carry-forward on every scored row

**This is the one with a deadline.**

### The measurement

Live query against Supabase, 08/11/2026:

- `predictions` — 147 rows, 05/18/2026 through 08/11/2026 (still logging daily)
- `outcomes` — 0 rows
- `backtest_grades` — 144 rows
- `metric_observations` — 13,857 rows
- `confidence_calibration` — 0 rows

Zero `outcomes` is CORRECT, not a bug: of the 147 predictions, 40 are gradeable and
the earliest window closes **08/30/2026**. None have matured. The grader
(`refinery/grade/grade-predictions.mts`) is built, wired, and has run 81 times
against an empty queue.

The 144 rows in `backtest_grades` are retrodicted, all from a single run on
06/08/2026, covering two slug families only (`laus_lee`, `laus_collier`).

Scored: **59 hit, 81 miss, 4 neutral — 42.1% raw accuracy on 140 calls.**
Lee 52%, Collier 32%.

### The finding that matters

Raw accuracy is deliberately NOT the metric — `refinery/lib/backtest/skill-baseline.mts`
says compare against a persistence null and report lift, citing the decision in
`docs/superpowers/plans/_FINISHED/2026-06-03-row-tier/HANDOFF.md` item 2:
*"report lift over a persistence null, never raw accuracy (a directional rule on a
trending series scores ~100% by autocorrelation)."*

So I computed the lift, using that file's documented in-set rule (not the first
call for its slug, and the observed outcome is directional):

- system: 58 / 138
- persistence null: 58 / 138
- **lift: +0.0 points** (Lee 51% vs 51%, Collier 33% vs 33%)

That was too clean, so I tested it directly:

**The predicted direction equals the persistence carry-forward on 144 of 144 rows.
Zero disagreements.**

### Root cause — it is structural, not a tuning problem

`refinery/vocab/loader.mts` defaults `grade_basis: "delta"` for nearly every value
type: `percentage`, `ratio`, `rate`, `bps`, `percentile`, `count`, `integer`,
`currency`, `index`, `days`, `depth_in`. Only a couple use `"sign"`.

A delta-basis directional call is derived from `sign(current − prior)`. That IS the
persistence carry-forward. **For the overwhelming majority of slugs, the direction
call cannot beat the naive baseline because it IS the naive baseline under a
different name. Lift is pinned at zero by construction, not by underperformance.**

### The part that should sting

The methodology was right and was decided correctly on 06/03/2026. The instrument
to detect exactly this was built (`skill-baseline.mts`). It was run once, on
06/08/2026. It returned zero. **Nothing happened for two months.** This is not a
missing capability — it is a measured answer nobody acted on.

### Scope caveat — do not overstate this

Two slug families out of 32+ gradeable slugs currently in `predictions`. The
**mechanism** claim generalizes (the `grade_basis` default is repo-wide and I read
it directly). The **accuracy** claim does not — 42.1% is unemployment rate in two
counties, not a verdict on every brain. Do not say "our forecasts are worthless"
off this. Say "our direction calls are structurally incapable of beating
persistence, and on the only two families measured they don't."

### What needs deciding (operator call, not mine)

1. **Is a delta-basis directional call meant to be a forecast, or a labeled
   description of the last move?** If it is the latter — which is what it
   currently is — it should stop being logged as a prediction and stop being
   graded as one. That is honest and cheap.
2. **If it is meant to be a forecast**, the call needs an input that is not
   `sign(current − prior)`. **AND WE ALREADY BUILT THAT INPUT — it is trapped in
   the wrong layer.** `lib/charts/fit-line.ts` (`fitLine()`, shipped, tested) is a
   real least-squares OLS fit returning `{slope, intercept, r2, n, established}`,
   where `established` = the 95% confidence interval on the slope excludes zero.
   Its own header states the rule outright: *"If `established` is false, THE SIGN
   OF THE SLOPE MAY NOT BE READ."* That is precisely a direction call that is NOT
   a carry-forward — it is a fitted trend with a significance gate and an explicit
   "no direction" answer.

   It lives in the charts layer and the grading layer does not import it. Design
   spec: `docs/superpowers/specs/2026-07-13-trend-fit-engine-design.md`; phase 2
   handoff: `docs/superpowers/specs/2026-07-14-trend-fit-phase2-handoff.md`.

   So the recommendation is concrete, not open-ended: **promote `fitLine()` into
   the direction-call path** rather than designing something new. Note what this
   changes — a slope whose CI includes zero returns NO direction, which would move
   calls from "wrong 58% of the time" into the honest ungradeable bucket. Expect
   the gradeable count to FALL and the remaining calls to actually mean something.
   Still brainstorm it under RULE 3.5 with a failure-modes section, but the math
   is written and does not need to be rewritten (RULE 0.5 — we already have it).
3. **Re-run the backtest across all gradeable slugs before generalizing.** One run,
   two families, two months ago is not a corpus. `refinery/tools/flywheel-backtest.mts`
   exists; the backtestable set per the 06/03 handoff is SBA outcomes, TDT
   collections, LeePA deeds, and Lee/Collier LAUS.

### Still unmeasured, already written down

The same 06/03 handoff carries an `[INFERENCE]` with its own falsifier: *"directional
grades rarely flip on revision"* — falsifiable by measuring as-of-then vs revised
direction once ALFRED LAUS vintages are ingested, false if more than ~10% of periods
flip sign. Never measured. Worth folding into whatever re-run happens.

### The deadline

**08/30/2026** — the first forward-graded prediction window closes. The grader now
runs again (first success since 07/22/2026 landed 08/11/2026 at 14:58 UTC, run
`31504481800`), so if the chain stays green the first real outcome lands then. If
the direction-call design is unchanged by that date, what lands will be a scored
record of a persistence carry-forward.

---

## Related, already fixed this session — context only

The nightly chain is green as of run `31503515723`. The bake now exits 0 on
validator rejections and emits a named warning annotation per stale surface
(15 annotations on that run; `baked=34 skipped=126 failed=13`). Rule lives in
`scripts/bake-exit.mts` with 10 red-first tests.

**13 surfaces are genuinely stale** and are now visible by name every night. Their
prompts are writing numbers that are not in their inputs and the no-invention
validator is correctly refusing them. That is separate work, and it is now
diagnosable because the pipeline is green.
