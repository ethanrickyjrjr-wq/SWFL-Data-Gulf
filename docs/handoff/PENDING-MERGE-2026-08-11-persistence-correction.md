# PENDING MERGE — correction blocks for two files held by a live session (08/11/2026)

**Why this file exists:** the two corrections below were written 08/11/2026 but could not be
landed — `docs/handoff/2026-08-11-actionlint-gate-and-persistence-finding.md` and
`_RESEARCH/data-and-ingest/2026-08-11-direction-call-forecast-evaluation-standard.md` were both
held by active session `c973b055-eb33-4a33-9f45-d2a4c6cd2885`. Overriding another live session's
claim was declined. **This is a parking file, not a new document. Paste each block into its target,
then DELETE this file.** Ledger: `persistence_correction_merge_blocked`.

Full evidence + the live re-run output: `SESSION_LOG.md`, top entry 08/11/2026.

---

## BLOCK 1 → paste into `docs/handoff/2026-08-11-actionlint-gate-and-persistence-finding.md`

Insert immediately after `Session evidence for everything here: ...` and its `---`, before
`## ITEM 1`.

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

    **The live path's real defect is different and worse:** its directions are authored
    judgments that have never been graded once (0 outcomes). There is no delta to replace there.

    **What is unchanged:** raw accuracy is still the wrong headline; lift over persistence is
    still the right metric; `fitLine()` is still the right input to promote — and a call that
    *loses* to naive is a stronger argument for it than a call that ties.

    **Open operator question (blocking the live half, not the backtest half):** does an authored
    `then_direction` get validated against a fitted trend before it is logged, or does it stay
    authored and get scored as human judgment? Both are legitimate; they are different products.

    **Also corrected same day —** `ingest/cadence_registry.yaml` retired `fred_laus_alfred` on a
    "confirmed-zero-consumer" basis and flagged its Storage prefix for manual delete. That claim
    is false: `refinery/tools/flywheel-backtest.mts:258` reads it, and the dry-run above proves
    the data is intact (1538 / 1562 vintages). It is the only point-in-time-honest series in the
    repo. **Do not execute that delete** — check `fred_laus_alfred_storage_delete_must_not_run`.

---

## BLOCK 2 → paste into `_RESEARCH/data-and-ingest/2026-08-11-direction-call-forecast-evaluation-standard.md`

Insert immediately after the `## 5. What we do today, measured against that contract` heading.

    > **⚠️ MEASURED CORRECTION — 08/11/2026, later same day.** The finding that prompted this
    > crawl ("our predicted direction equals the persistence carry-forward on 144 of 144 rows,
    > lift +0.0") is **wrong**. Re-run live: `bun refinery/tools/flywheel-backtest.mts --dry-run`
    > (snapshot 2026-06) reports **system 42.0%, persistence 48.6%, N=138, LIFT −6.5 pp, "BEATS
    > NAIVE? NO"**. The system does not tie the naive baseline — it **loses** to it.
    >
    > The "144 of 144" test compared the call against `sign(current − prior)`, which is the
    > formula that produced it — a tautology. The instrument's actual null is
    > `predict_t = observed_{t-1}` (`refinery/lib/backtest/skill-baseline.mts:67-78`), the
    > previous *realized outcome* direction. Two different estimators; that is why they score
    > 58 vs 67 over the same 138 rows.
    >
    > **This strengthens §4 rather than weakening it.** A call that loses to naive is a harder
    > argument for promoting `fitLine()` than a call that ties. But it retires the phrase "lift
    > is pinned at zero by construction" — lift is not pinned, it is measured, and it is negative.
    >
    > **Correction to §3's caveat:** the claim that Pesaran–Timmermann "would not be a meaningful
    > test" because our forecast *is* the lagged series rests on the same conflation. The call is
    > `sign(last delta)` — a deterministic function of past values, but **not** the persistence
    > null it is scored against. PT against the independence null is therefore informative on the
    > current calls, not degenerate. It remains unbuilt either way.
    >
    > **Scope, unchanged:** all of the above is the *backtest* path (`decision-fn.mts:80`). The
    > live path (`refinery/lib/predictions-log.mts:100`) reads the brain's authored
    > `claim.then_direction` — no delta, no `grade_basis`, and never graded (0 outcomes). Two
    > producers, not one.
